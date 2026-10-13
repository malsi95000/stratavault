import { describe, expect, it } from "vitest";
import * as ops from "@/features/map-doc/ops";
import { blankDoc } from "@/features/map-doc/schema";
import { MAX_ITEMS } from "@/features/map-doc/types";
import {
  HINT_ERASED,
  HINT_FLUX_ERASED,
  HINT_FULL,
  HINT_LASSO_TOO_SHORT,
  HINT_NO_COUNTRY_ERASE,
  HINT_OUTSIDE,
  hintPingType,
} from "./hints";
import { createEditorStore } from "./store";
import type { EditorStore } from "./store";
import type { EntityKind } from "@/features/map-doc/types";

describe("store de l'éditeur", () => {
  it("a les réglages par défaut de la bêta", () => {
    const s = createEditorStore().getState();
    expect(s.tool).toBe("select");
    expect(s.pingType).toBe("strategique");
    expect(s.fluxColor).toBe("jaune");
    expect(s.fluxWidth).toBe(4);
    expect(s.textSize).toBe(13);
    expect(s.selection).toBeNull();
    expect(s.hydrated).toBe(false);
  });

  it("outil lien : deux clics créent le lien et ouvrent sa fiche, sans doublon", () => {
    const store = createEditorStore();
    store.getState().setTool("link");
    store.getState().pick("c:FRA");
    expect(store.getState().pending).toBe("c:FRA");
    expect(store.getState().hint).toBe(
      "France sélectionné. Choisissez la seconde extrémité (pays, balise, zone ou texte).",
    );
    store.getState().pick("c:DEU");
    const { doc, selection, pending } = store.getState();
    expect(doc.links).toHaveLength(1);
    expect(selection).toEqual({ k: "l", id: doc.links[0].id });
    expect(pending).toBeNull();
    store.getState().pick("c:DEU");
    store.getState().pick("c:FRA");
    expect(store.getState().doc.links).toHaveLength(1);
    store.getState().pick("c:ESP");
    store.getState().pick("c:ESP");
    expect(store.getState().pending).toBeNull();
  });

  it("pose les éléments et ouvre leur fiche", () => {
    const store = createEditorStore();
    store.getState().setPingType("armes");
    store.getState().placePing([1, 2]);
    expect(store.getState().doc.pings[0].type).toBe("armes");
    expect(store.getState().selection?.k).toBe("p");
    store.getState().placeText(null);
    expect(store.getState().hint).toBe(HINT_OUTSIDE);
    store.getState().addZone([
      [0, 0],
      [1, 1],
    ]);
    expect(store.getState().hint).toBe(HINT_LASSO_TOO_SHORT);
    store.getState().setFluxWidth(40);
    store.getState().addFlux([
      [0, 0],
      [1, 1],
    ]);
    expect(store.getState().doc.flux.jaune?.[0].width).toBe(16);
  });

  it("lasso : la zone fermée est créée et sa fiche ouverte ; texte à la taille du curseur", () => {
    const store = createEditorStore();
    store.getState().setHint(HINT_LASSO_TOO_SHORT);
    store.getState().addZone([
      [20, 42],
      [20, 44],
      [22, 44],
      [22, 42],
    ]);
    const zone = store.getState().doc.zones[0];
    expect(zone.ring).toHaveLength(5);
    expect(zone.ring[0]).toEqual(zone.ring[4]);
    expect(store.getState().selection).toEqual({ k: "z", id: zone.id });
    expect(store.getState().hint).toBeNull();

    store.getState().setTextSize(24);
    store.getState().placeText([10, 45]);
    const text = store.getState().doc.texts[0];
    expect(text).toMatchObject({ ll: [10, 45], title: "", size: 24 });
    expect(store.getState().selection).toEqual({ k: "t", id: text.id });

    // Zones et textes se relient avec l'outil lien.
    store.getState().setTool("link");
    store.getState().pick(`z:${zone.id}`);
    expect(store.getState().hint).toBe("Zone sélectionné. Choisissez la seconde extrémité (pays, balise, zone ou texte).");
    store.getState().pick(`t:${text.id}`);
    expect(store.getState().doc.links).toMatchObject([{ a: `z:${zone.id}`, b: `t:${text.id}` }]);
  });

  it("limite d'éléments atteinte : rien n'est ajouté et la barre d'aide l'indique", () => {
    const store = createEditorStore();
    store.getState().placePing([1, 2]);
    const ping = store.getState().doc.pings[0];
    const pings = Array.from({ length: MAX_ITEMS }, (_, i) => ({ ...ping, id: `p${i}` }));
    store.getState().replaceDoc({ ...store.getState().doc, pings });
    const before = store.getState().doc;
    store.getState().placePing([3, 4]);
    expect(store.getState().doc).toBe(before);
    expect(store.getState().selection).toBeNull();
    expect(store.getState().hint).toBe(HINT_FULL);
  });

  it("gomme : ferme la fiche d'un lien supprimé en cascade", () => {
    const store = createEditorStore();
    store.getState().placePoint([5, 5]);
    const pointId = store.getState().doc.points[0].id;
    store.getState().pick(`o:${pointId}`);
    store.getState().pick("c:FRA");
    expect(store.getState().selection?.k).toBe("l");
    store.getState().gomme("o", pointId);
    expect(store.getState().doc.links).toEqual([]);
    expect(store.getState().selection).toBeNull();
    expect(store.getState().hint).toBe(HINT_ERASED);
    store.getState().gomme("c", "FRA");
    expect(store.getState().hint).toBe(HINT_NO_COUNTRY_ERASE);
  });

  it("supprimer la première extrémité d'un lien en cours annule ce lien", () => {
    const store = createEditorStore();
    store.getState().placePing([5, 5]);
    const pingId = store.getState().doc.pings[0].id;
    store.getState().setTool("link");
    store.getState().pick(`p:${pingId}`);
    // Suppression depuis la fiche, toujours ouverte.
    store.getState().erase("p", pingId);
    expect(store.getState().pending).toBeNull();
    expect(store.getState().hint).toBeNull();
    store.getState().pick("c:FRA");
    expect(store.getState().doc.links).toEqual([]);
    expect(store.getState().pending).toBe("c:FRA");
  });

  it("Échap annule le lien en cours et ferme la fiche", () => {
    const store = createEditorStore();
    store.getState().open("c", "FRA");
    store.getState().pick("c:FRA");
    store.getState().cancel();
    expect(store.getState().pending).toBeNull();
    expect(store.getState().selection).toBeNull();
  });

  it("changer d'outil annule le lien et le tracé en cours et remet l'aide de l'outil", () => {
    const store = createEditorStore();
    store.getState().setTool("link");
    store.getState().pick("c:FRA");
    store.getState().setDrawing({ kind: "lasso", points: [[0, 0], [1, 1]] });
    store.getState().setTool("select");
    expect(store.getState().pending).toBeNull();
    expect(store.getState().drawing).toBeNull();
    expect(store.getState().hint).toBeNull();
  });

  it("menu des balises : choisit le type, active l'outil et affiche le message de la bêta", () => {
    const store = createEditorStore();
    store.getState().choosePingType("maritime");
    expect(store.getState().tool).toBe("ping");
    expect(store.getState().pingType).toBe("maritime");
    expect(store.getState().hint).toBe("Balise maritime : cliquez sur la carte pour la poser.");
    expect(hintPingType("crise")).toBe("Ping crise : cliquez sur la carte pour la poser.");
    store.getState().chooseFluxColor("violet");
    expect(store.getState().tool).toBe("flux");
    expect(store.getState().fluxColor).toBe("violet");
    expect(store.getState().hint).toBeNull();
  });

  it("n'ouvre que la fiche d'un élément existant", () => {
    const store = createEditorStore();
    store.getState().open("p", "absent");
    expect(store.getState().selection).toBeNull();
    store.getState().open("c", "ZZZ");
    expect(store.getState().selection).toBeNull();
    store.getState().placePoint([1, 1]);
    const id = store.getState().doc.points[0].id;
    store.getState().close();
    store.getState().open("o", id);
    expect(store.getState().selection).toEqual({ k: "o", id });
  });

  it("pinceau flux : traits de plusieurs couleurs et épaisseurs, fiche partagée par couleur", () => {
    const store = createEditorStore();
    store.getState().chooseFluxColor("rouge");
    store.getState().setFluxWidth(9);
    store.getState().addFlux([[0, 0], [1, 1]]);
    // Couleur et épaisseur du brouillon, indépendamment des réglages courants.
    store.getState().addFlux([[2, 2], [3, 3], [4, 4]], "bleu-clair", 2);
    store.getState().addFlux([[5, 5], [6, 6]], "rouge", 1);
    // Un simple clic (un seul point) n'ajoute rien.
    store.getState().addFlux([[7, 7]]);
    const { flux } = store.getState().doc;
    expect(flux.rouge?.map((f) => [f.width, f.opacity])).toEqual([[9, 0.65], [1, 0.65]]);
    expect(flux["bleu-clair"]?.[0]).toMatchObject({ points: [[2, 2], [3, 3], [4, 4]], width: 2, opacity: 0.65 });
    expect(store.getState().selection).toBeNull();

    const [a, b] = flux.rouge!;
    store.getState().open("flux", a.id);
    store.getState().updateFluxFiche("rouge", { title: "Pétrole" });
    store.getState().open("flux", b.id);
    expect(store.getState().doc.fluxFiches).toEqual({ rouge: { title: "Pétrole" } });
  });

  it("gomme : supprime chaque type d'élément avec ses liens et ferme sa fiche", () => {
    const setup = () => {
      const store = createEditorStore();
      const s = () => store.getState();
      s().placePing([1, 1]);
      s().placePoint([2, 2]);
      s().placeText([3, 3]);
      s().addZone([[10, 10], [10, 12], [12, 12], [12, 10]]);
      const { pings, points, texts, zones } = s().doc;
      const refs = [`p:${pings[0].id}`, `o:${points[0].id}`, `t:${texts[0].id}`, `z:${zones[0].id}`] as const;
      for (const ref of refs) {
        s().pick(ref);
        s().pick("c:FRA");
      }
      s().addFlux([[0, 0], [5, 5]], "vert", 3);
      return { store, ids: { p: pings[0].id, o: points[0].id, t: texts[0].id, z: zones[0].id } };
    };

    for (const k of ["p", "o", "t", "z"] as const) {
      const { store, ids } = setup();
      store.getState().open(k, ids[k]);
      store.getState().setTool("gomme");
      store.getState().gomme(k, ids[k]);
      const { doc } = store.getState();
      expect(ops.entityExists(doc, k, ids[k]), k).toBe(false);
      expect(doc.links, k).toHaveLength(3);
      expect(doc.links.some((l) => l.a === `${k}:${ids[k]}` || l.b === `${k}:${ids[k]}`), k).toBe(false);
      expect(store.getState().selection, k).toBeNull();
      expect(store.getState().hint, k).toBe(HINT_ERASED);
    }

    const { store } = setup();
    const link = store.getState().doc.links[0];
    store.getState().open("l", link.id);
    store.getState().gomme("l", link.id);
    expect(store.getState().doc.links).toHaveLength(3);
    expect(store.getState().selection).toBeNull();
    expect(store.getState().hint).toBe(HINT_ERASED);

    const stroke = store.getState().doc.flux.vert![0];
    store.getState().open("flux", stroke.id);
    store.getState().gomme("flux", stroke.id);
    expect(store.getState().doc.flux.vert).toEqual([]);
    expect(store.getState().selection).toBeNull();
    expect(store.getState().hint).toBe(HINT_FLUX_ERASED);

    const before = store.getState().doc;
    store.getState().gomme("c", "FRA");
    expect(store.getState().doc).toBe(before);
    expect(store.getState().hint).toBe(HINT_NO_COUNTRY_ERASE);
  });

  it("la gomme et les boutons « Supprimer… » des fiches font la même suppression", () => {
    const build = (): EditorStore => {
      const store = createEditorStore();
      store.getState().placePing([1, 1]);
      store.getState().placePoint([2, 2]);
      const { pings, points } = store.getState().doc;
      store.getState().pick(`p:${pings[0].id}`);
      store.getState().pick(`o:${points[0].id}`);
      store.getState().pick(`p:${pings[0].id}`);
      store.getState().pick("c:DEU");
      return store;
    };
    const kinds: EntityKind[] = ["p", "o", "l"];
    for (const k of kinds) {
      const viaFiche = build();
      const viaGomme = build();
      // Mêmes identifiants dans les deux cartes.
      viaGomme.getState().replaceDoc(viaFiche.getState().doc);
      const doc = viaFiche.getState().doc;
      const id = k === "p" ? doc.pings[0].id : k === "o" ? doc.points[0].id : doc.links[0].id;
      viaFiche.getState().erase(k, id);
      viaGomme.getState().gomme(k, id);
      expect(viaGomme.getState().doc, k).toEqual(viaFiche.getState().doc);
      expect(viaFiche.getState().doc, k).toEqual(ops.erase(doc, k, id));
    }
  });

  it("chaque choix d'outil est compté, même quand l'outil ne change pas (touche F)", () => {
    const store = createEditorStore();
    const before = store.getState().toolPicks;
    store.getState().setTool("flux");
    store.getState().setTool("flux");
    store.getState().chooseFluxColor("rouge");
    store.getState().choosePingType("crise");
    expect(store.getState().toolPicks).toBe(before + 4);
  });

  it("l'hydratation oublie ce qui a été fait sur le document vierge (sélection, lien, tracé)", () => {
    const store = createEditorStore();
    store.getState().setTool("ping");
    store.getState().placePing([2, 48]);
    store.getState().setDrawing({ kind: "lasso", points: [[0, 0]] });
    store.setState({ pending: "c:FRA", hint: "x" });
    expect(store.getState().selection).not.toBeNull();
    store.getState().hydrate(blankDoc(), null);
    const s = store.getState();
    expect(s.hydrated).toBe(true);
    expect([s.selection, s.pending, s.drawing, s.hint]).toEqual([null, null, null, null]);
  });
});
