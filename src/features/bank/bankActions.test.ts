import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { AskAnswer } from "@/components/dialogs";
import { MAP_NAME_PROMPT, UNTITLED_MAP, createPersistence } from "@/features/editor/persistence";
import { persistenceOptionsFor } from "@/features/editor/saveProfiles";
import { createEditorStore } from "@/features/editor/store";
import { addPing } from "@/features/map-doc/ops";
import { blankDoc } from "@/features/map-doc/schema";
import type { MapDoc } from "@/features/map-doc/types";
import { createIndexedDbRepository, withBank } from "@/features/storage";
import type { MapRepository } from "@/features/storage";
import {
  BANK_SAVE_FAILED,
  BANK_UNAVAILABLE,
  DELETE_QUESTION,
  DISCARD_QUESTION,
  LOAD_FAILED_QUESTION,
  MAP_MISSING,
  MAP_UNAVAILABLE,
  RENAME_PROMPT,
  SIGN_OUT_LOAD_FAILED_QUESTION,
  SIGN_OUT_UNSAVED_QUESTION,
  UNSAVED_MAP_QUESTION,
  confirmSignOut,
  continueMap,
  deleteMap,
  renameMap,
  startNewMap,
} from "./bankActions";
import type { BankDeps } from "./bankActions";

type Answers = { ask?: AskAnswer[]; confirm?: boolean[]; prompt?: (string | null)[] };

/** Dialogues aux réponses écrites d'avance ; chaque question posée est notée dans `asked`. */
function scriptedDialogs(answers: Answers) {
  const asked: string[] = [];
  const prompts: { message: string; defaultValue?: string }[] = [];
  const dialogs: BankDeps["dialogs"] = {
    ask: async (message) => {
      asked.push(message);
      return answers.ask?.shift() ?? null;
    },
    confirm: async (message) => {
      asked.push(message);
      return answers.confirm?.shift() ?? false;
    },
    prompt: async (message, defaultValue) => {
      asked.push(message);
      prompts.push({ message, defaultValue });
      return answers.prompt?.shift() ?? null;
    },
  };
  return { dialogs, asked, prompts };
}

const withPing = (id = "p1"): MapDoc => addPing(blankDoc(), [1, 2], "crise", id)!.doc;

let n = 0;
async function setup(answers: Answers = {}, prepare?: (repo: MapRepository) => Promise<void>) {
  const repo = createIndexedDbRepository({ dbName: `bank-${++n}` });
  await prepare?.(repo);
  const store = createEditorStore();
  const persistence = createPersistence(repo, store, { delay: 0 });
  const { dialogs, asked, prompts } = scriptedDialogs(answers);
  const notes: string[] = [];
  const deps: BankDeps = { persistence, dialogs, notify: (message) => notes.push(message) };
  return { repo, store, persistence, deps, asked, prompts, notes };
}

/** Carte en cours avec du contenu, absente de la banque. */
const unsavedDraft = (repo: MapRepository) => repo.setDraft(withPing());

describe("« + Nouvelle carte »", () => {
  it("part d'une carte vierge sans rien demander quand la carte en cours est vide", async () => {
    const { deps, store, asked } = await setup();
    expect(await startNewMap(deps)).toBe(true);
    expect(asked).toEqual([]);
    expect(store.getState().doc).toEqual(blankDoc());
    expect(store.getState().activeMapId).toBeNull();
  });

  it("propose d'enregistrer la carte non sauvegardée, puis l'enregistre sous le nom saisi", async () => {
    const { deps, store, repo, asked } = await setup({ ask: ["yes"], prompt: ["  Sahel  "] }, unsavedDraft);
    expect(await startNewMap(deps)).toBe(true);
    expect(asked[0]).toBe(UNSAVED_MAP_QUESTION);
    const [saved] = await repo.list();
    expect(saved.name).toBe("Sahel");
    expect(saved.data).toEqual(withPing());
    expect(store.getState().doc).toEqual(blankDoc());
    expect(store.getState().activeMapId).toBeNull();
    expect(await repo.getActiveId()).toBeNull();
  });

  it("« Ne pas enregistrer » : part d'une carte vierge sans rien ajouter à la banque", async () => {
    const { deps, store, repo } = await setup({ ask: ["no"] }, unsavedDraft);
    expect(await startNewMap(deps)).toBe(true);
    expect(await repo.list()).toEqual([]);
    expect(store.getState().doc).toEqual(blankDoc());
  });

  it("Annuler (ou Échap) garde la carte en cours", async () => {
    const { deps, store, repo } = await setup({ ask: [null] }, unsavedDraft);
    expect(await startNewMap(deps)).toBe(false);
    expect(store.getState().doc).toEqual(withPing());
    expect(await repo.getDraft()).toEqual(withPing());
  });

  it("annuler la saisie du nom, ou laisser un nom vide, garde aussi la carte en cours", async () => {
    for (const name of [null, "   "]) {
      const { deps, store, repo } = await setup({ ask: ["yes"], prompt: [name] }, unsavedDraft);
      expect(await startNewMap(deps)).toBe(false);
      expect(await repo.list()).toEqual([]);
      expect(store.getState().doc).toEqual(withPing());
    }
  });

  it("ne propose rien pour la carte active : elle est réécrite dans la banque (bêta)", async () => {
    const { deps, repo, asked } = await setup({}, async (r) => {
      await r.create("Active", withPing(), "m1");
      await r.setActiveId("m1");
      await r.setDraft(withPing());
    });
    expect(await startNewMap(deps)).toBe(true);
    expect(asked).toEqual([]);
    expect((await repo.get("m1"))?.data).toEqual(withPing());
  });

  it("recrée la carte active supprimée ailleurs (autre onglet), sous un nouvel identifiant, au lieu de perdre son contenu", async () => {
    const { deps, repo, persistence, asked } = await setup({}, async (r) => {
      await r.create("Active", withPing(), "m1");
      await r.setActiveId("m1");
      await r.setDraft(withPing());
    });
    await persistence.hydrate();
    await repo.remove("m1");
    expect(await startNewMap(deps)).toBe(true);
    expect(asked).toEqual([]);
    expect(await repo.get("m1")).toBeNull();
    const [entry] = await repo.list();
    expect(entry?.name).toBe(UNTITLED_MAP);
    expect(entry?.data).toEqual(withPing());
  });

  it("après un échec de lecture, ne remplace le brouillon stocké qu'avec l'accord de l'utilisateur", async () => {
    for (const accept of [false, true]) {
      const { deps, repo, asked } = await setup({ confirm: [accept] }, unsavedDraft);
      const getDraft = repo.getDraft;
      repo.getDraft = () => Promise.reject(new Error("lecture"));
      expect(await startNewMap(deps)).toBe(accept);
      expect(asked).toEqual([LOAD_FAILED_QUESTION]);
      repo.getDraft = getDraft;
      expect(await repo.getDraft()).toEqual(accept ? blankDoc() : withPing());
    }
  });
});

describe("« Continuer »", () => {
  it("ouvre la carte et en fait la carte active", async () => {
    const { deps, store, repo } = await setup({}, (r) => r.create("Sahel", withPing("p9"), "m1").then(() => undefined));
    expect(await continueMap(deps, "m1")).toBe(true);
    expect(store.getState().doc).toEqual(withPing("p9"));
    expect(store.getState().activeMapId).toBe("m1");
    expect(await repo.getActiveId()).toBe("m1");
  });

  it("propose d'abord d'enregistrer la carte en cours (absent de la bêta : rien n'est perdu)", async () => {
    const { deps, store, repo } = await setup({ ask: ["yes"], prompt: ["Brouillon"] }, async (r) => {
      await r.create("Sahel", withPing("p9"), "m1");
      await unsavedDraft(r);
    });
    expect(await continueMap(deps, "m1")).toBe(true);
    const names = (await repo.list()).map((e) => e.name).sort();
    expect(names).toEqual(["Brouillon", "Sahel"]);
    expect(store.getState().activeMapId).toBe("m1");
  });

  it("ne réécrit pas la carte active quittée : sa date ne change pas (comme la bêta)", async () => {
    const { deps, repo, asked } = await setup({}, async (r) => {
      await r.create("A", withPing("pa"), "a");
      await r.create("B", withPing("pb"), "b");
      await r.setActiveId("a");
      await r.setDraft(withPing("pa"));
    });
    const before = (await repo.get("a"))?.updated;
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await continueMap(deps, "b")).toBe(true);
    expect(asked).toEqual([]);
    expect((await repo.get("a"))?.updated).toBe(before);
  });

  it("signale une carte disparue ou illisible sans toucher à la carte en cours", async () => {
    const { deps, store, notes } = await setup({ ask: ["no"] }, unsavedDraft);
    expect(await continueMap(deps, "absente")).toBe(false);
    expect(notes).toEqual([MAP_UNAVAILABLE]);
    expect(store.getState().doc).toEqual(withPing());
  });
});

describe("avant « Se déconnecter »", () => {
  it("propose d'enregistrer la carte hors banque, qui serait effacée de ce navigateur", async () => {
    const { deps, repo, asked } = await setup({ ask: ["yes"], prompt: ["Avant départ"] }, unsavedDraft);
    expect(await confirmSignOut(deps)).toBe(true);
    expect(asked[0]).toBe(SIGN_OUT_UNSAVED_QUESTION);
    expect((await repo.list()).map((e) => e.name)).toEqual(["Avant départ"]);
  });

  it("« Ne pas enregistrer » laisse partir, Annuler (ou Échap) garde la session", async () => {
    expect(await confirmSignOut((await setup({ ask: ["no"] }, unsavedDraft)).deps)).toBe(true);
    expect(await confirmSignOut((await setup({ ask: [null] }, unsavedDraft)).deps)).toBe(false);
  });

  it("rien à demander pour une carte vide ou la carte active, qui n'est pas réécrite", async () => {
    const { deps, repo, asked } = await setup({}, async (r) => {
      await r.create("Active", withPing(), "m1");
      await r.setActiveId("m1");
      await r.setDraft(withPing());
    });
    const before = (await repo.get("m1"))?.updated;
    expect(await confirmSignOut(deps)).toBe(true);
    expect(asked).toEqual([]);
    expect((await repo.get("m1"))?.updated).toBe(before);
  });

  it("après un échec de lecture, le brouillon stocké n'est effacé qu'avec l'accord de l'utilisateur", async () => {
    for (const accept of [false, true]) {
      const { deps, repo, asked } = await setup({ confirm: [accept] }, unsavedDraft);
      repo.getDraft = () => Promise.reject(new Error("lecture"));
      expect(await confirmSignOut(deps)).toBe(accept);
      expect(asked).toEqual([SIGN_OUT_LOAD_FAILED_QUESTION]);
    }
  });
});

/** Persistance factice dont l'écriture a échoué (« unsaved ») ; compte les tentatives forcées. */
function failingPersistence() {
  const forced: string[] = [];
  const persistence: BankDeps["persistence"] = {
    hydrate: async () => {},
    loadFailed: () => false,
    isRemote: () => false,
    needsBankPrompt: () => false,
    // Pas de carte active : sans nom, rien n'est écrit ; avec un nom, l'écriture échoue.
    saveToBank: async (name) => (name ? "failed" : "needs-name"),
    openMap: async (id, options) => {
      if (!options?.discard) return "unsaved";
      forced.push(`open:${id}`);
      return "opened";
    },
    newMap: async (options) => {
      if (!options?.discard) return "unsaved";
      forced.push("new");
      return "done";
    },
    renameMap: async () => true,
    deleteMap: async () => {},
  };
  return { persistence, forced };
}

describe("modifications non enregistrées (échec d'écriture)", () => {
  it("ne les abandonne qu'après confirmation", async () => {
    for (const accept of [false, true]) {
      const { persistence, forced } = failingPersistence();
      const { dialogs, asked } = scriptedDialogs({ confirm: [accept, accept] });
      const deps: BankDeps = { persistence, dialogs, notify: () => {} };
      expect(await startNewMap(deps)).toBe(accept);
      expect(await continueMap(deps, "m1")).toBe(accept);
      expect(asked).toEqual([DISCARD_QUESTION, DISCARD_QUESTION]);
      expect(forced).toEqual(accept ? ["new", "open:m1"] : []);
    }
  });

  it("un échec de mise à jour de la carte active la garde en cours", async () => {
    const { persistence, forced } = failingPersistence();
    persistence.saveToBank = async () => "failed";
    const notes: string[] = [];
    const deps: BankDeps = { persistence, dialogs: scriptedDialogs({}).dialogs, notify: (m) => notes.push(m) };
    expect(await startNewMap(deps)).toBe(false);
    expect(forced).toEqual([]);
    expect(notes).toEqual([BANK_SAVE_FAILED]);
  });

  it("un échec d'enregistrement dans la banque garde la carte en cours", async () => {
    const { persistence, forced } = failingPersistence();
    persistence.needsBankPrompt = () => true;
    const { dialogs } = scriptedDialogs({ ask: ["yes"], prompt: ["Sahel"] });
    const notes: string[] = [];
    expect(await startNewMap({ persistence, dialogs, notify: (m) => notes.push(m) })).toBe(false);
    expect(forced).toEqual([]);
    expect(notes).toHaveLength(1);
  });

  it("une base inaccessible est signalée au lieu de faire échouer la page", async () => {
    const { persistence } = failingPersistence();
    persistence.hydrate = () => Promise.reject(new Error("indisponible"));
    const notes: string[] = [];
    const deps: BankDeps = { persistence, dialogs: scriptedDialogs({}).dialogs, notify: (m) => notes.push(m) };
    expect(await startNewMap(deps)).toBe(false);
    expect(notes).toEqual([BANK_UNAVAILABLE]);
  });
});

describe("« Renommer »", () => {
  const prepare = (r: MapRepository) => r.create("Sahel", blankDoc(), "m1").then(() => undefined);

  it("préremplit le nom actuel et enregistre le nouveau nom", async () => {
    const { deps, repo, prompts } = await setup({ prompt: [" Sahel 2026 "] }, prepare);
    await renameMap(deps, { id: "m1", name: "Sahel" });
    expect(prompts).toEqual([{ message: RENAME_PROMPT, defaultValue: "Sahel" }]);
    expect((await repo.get("m1"))?.name).toBe("Sahel 2026");
  });

  it("ne change rien si l'utilisateur annule ou laisse le nom vide", async () => {
    const { deps, repo } = await setup({ prompt: [null, "  "] }, prepare);
    await renameMap(deps, { id: "m1", name: "Sahel" });
    await renameMap(deps, { id: "m1", name: "Sahel" });
    expect((await repo.get("m1"))?.name).toBe("Sahel");
  });

  it("signale une carte qui n'existe plus", async () => {
    const { deps, notes } = await setup({ prompt: ["Autre"] });
    await renameMap(deps, { id: "absente", name: "Sahel" });
    expect(notes).toEqual([MAP_MISSING]);
  });
});

describe("« Supprimer »", () => {
  it("demande confirmation et ne supprime rien si l'utilisateur refuse", async () => {
    const { deps, repo, asked } = await setup({ confirm: [false] }, (r) =>
      r.create("Sahel", blankDoc(), "m1").then(() => undefined),
    );
    expect(await deleteMap(deps, "m1")).toBe(false);
    expect(asked).toEqual([DELETE_QUESTION]);
    expect(await repo.get("m1")).not.toBeNull();
  });

  it("supprime la carte ; la carte active ne l'est plus, son contenu reste dans l'éditeur", async () => {
    const { deps, repo, store, persistence } = await setup({ confirm: [true] }, async (r) => {
      await r.create("Sahel", withPing(), "m1");
      await r.setActiveId("m1");
      await r.setDraft(withPing());
    });
    await persistence.hydrate();
    expect(store.getState().activeMapId).toBe("m1");
    expect(await deleteMap(deps, "m1")).toBe(true);
    expect(await repo.get("m1")).toBeNull();
    expect(store.getState().activeMapId).toBeNull();
    expect(await repo.getActiveId()).toBeNull();
    expect(store.getState().doc).toEqual(withPing());
    // La carte n'est plus dans la banque : on proposera de l'enregistrer avant d'en changer.
    expect(persistence.needsBankPrompt()).toBe(true);
  });
});

describe("mode compte : la carte active n'est jamais réécrite à l'aveugle", () => {
  /** Banque partagée par deux appareils (ici, une base en mémoire) et l'appareil A. */
  async function accountSetup(answers: Answers = {}) {
    const bank = createIndexedDbRepository({ dbName: `shared-${++n}` });
    const local = createIndexedDbRepository({ dbName: `device-a-${n}` });
    const store = createEditorStore();
    const options = { ...persistenceOptionsFor({ kind: "account", userId: "u1" }), delay: 0 };
    const persistence = createPersistence(withBank(local, bank), store, options);
    await persistence.hydrate();
    const { dialogs, asked } = scriptedDialogs(answers);
    const notes: string[] = [];
    const deps: BankDeps = { persistence, dialogs, notify: (message) => notes.push(message) };
    store.getState().setCountryNote("FRA", "v1 (appareil A)");
    await persistence.saveToBank("Sahel");
    const id = store.getState().activeMapId!;
    /** L'appareil B enregistre une version plus récente. */
    const otherDevice = () => bank.update(id, { ...blankDoc(), notes: { FRA: "v2 (appareil B)" } });
    const bankNotes = async () => ((await bank.get(id))?.data as MapDoc | undefined)?.notes;
    return { bank, store, persistence, deps, asked, id, otherDevice, bankNotes };
  }

  it("« + Nouvelle carte » ne remplace pas la version enregistrée depuis un autre appareil", async () => {
    const { deps, asked, otherDevice, bankNotes, store } = await accountSetup();
    await otherDevice();
    expect(await startNewMap(deps)).toBe(true);
    expect(asked).toEqual([]);
    expect(await bankNotes()).toEqual({ FRA: "v2 (appareil B)" });
    expect(store.getState().doc).toEqual(blankDoc());
  });

  it("« + Nouvelle carte » ne recrée pas une carte supprimée depuis un autre appareil", async () => {
    const { deps, bank, id } = await accountSetup();
    await bank.remove(id);
    expect(await startNewMap(deps)).toBe(true);
    expect(await bank.get(id)).toBeNull();
    expect(await bank.list()).toEqual([]);
  });

  it("modifications en attente sur une version périmée : proposées à l'enregistrement sous un autre nom", async () => {
    const { deps, asked, bank, otherDevice, bankNotes, store, id } = await accountSetup({
      ask: ["yes"],
      prompt: ["Sahel (copie)"],
    });
    await otherDevice();
    // Modification pas encore envoyée (sauvegarde automatique en attente).
    store.getState().setCountryNote("FRA", "v1 modifiée");
    expect(await startNewMap(deps)).toBe(true);
    expect(asked).toEqual([UNSAVED_MAP_QUESTION, MAP_NAME_PROMPT]);
    expect(await bankNotes()).toEqual({ FRA: "v2 (appareil B)" });
    const copy = (await bank.list()).find((entry) => entry.id !== id)!;
    expect(copy.name).toBe("Sahel (copie)");
    expect((copy.data as MapDoc).notes).toEqual({ FRA: "v1 modifiée" });
    expect(store.getState().doc).toEqual(blankDoc());
  });
});

describe("mode compte : modifications d'une carte supprimée depuis un autre appareil", () => {
  async function deletedElsewhere(answers: Answers) {
    const bank = createIndexedDbRepository({ dbName: `shared-${++n}` });
    const local = createIndexedDbRepository({ dbName: `device-a-${n}` });
    const store = createEditorStore();
    const options = { ...persistenceOptionsFor({ kind: "account", userId: "u1" }), delay: 0 };
    const persistence = createPersistence(withBank(local, bank), store, options);
    await persistence.hydrate();
    store.getState().setCountryNote("FRA", "v1");
    await persistence.saveToBank("Sahel");
    const id = store.getState().activeMapId!;
    const other = await bank.create("Autre", blankDoc());
    // L'appareil B supprime la carte ; l'appareil A la modifie (envoi pas encore parti).
    await bank.remove(id);
    store.getState().setCountryNote("FRA", "v1 modifiée");
    const { dialogs, asked } = scriptedDialogs(answers);
    const deps: BankDeps = { persistence, dialogs, notify: () => {} };
    return { bank, store, deps, asked, id, other };
  }

  it("« + Nouvelle carte » propose d'enregistrer la carte avant de la remplacer", async () => {
    const { bank, store, deps, asked, id } = await deletedElsewhere({ ask: ["yes"], prompt: ["Sahel (sauvée)"] });
    expect(await startNewMap(deps)).toBe(true);
    expect(asked).toEqual([UNSAVED_MAP_QUESTION, MAP_NAME_PROMPT]);
    const saved = (await bank.list()).find((entry) => entry.name === "Sahel (sauvée)")!;
    expect(saved.id).not.toBe(id);
    expect((saved.data as MapDoc).notes).toEqual({ FRA: "v1 modifiée" });
    expect(store.getState().doc).toEqual(blankDoc());
  });

  it("« Continuer » : Annuler garde la carte en cours, rien n'est remplacé", async () => {
    const { store, deps, asked, other } = await deletedElsewhere({ ask: [null] });
    expect(await continueMap(deps, other.id)).toBe(false);
    expect(asked).toEqual([UNSAVED_MAP_QUESTION]);
    expect(store.getState().doc.notes).toEqual({ FRA: "v1 modifiée" });
    expect(store.getState().activeMapId).toBeNull();
  });

  it("« Ne pas enregistrer » : choix explicite, la carte demandée s'ouvre", async () => {
    const { store, deps, other } = await deletedElsewhere({ ask: ["no"] });
    expect(await continueMap(deps, other.id)).toBe(true);
    expect(store.getState().activeMapId).toBe(other.id);
    expect(store.getState().doc).toEqual(blankDoc());
  });
});
