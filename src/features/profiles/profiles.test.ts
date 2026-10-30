// Règles des profils côté application : identifiant, nom affiché, présentation, formulaire, adresses.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, routeExists } from "@/test/sourceFiles";
import { foldHandle, isHandleAvailableFormat, isHandleFormatOk, isReservedHandle, normalizeHandle } from "./handle";
import { DELETE_PROFILE_CONFIRM, HANDLE_INVALID, HANDLE_RESERVED, VISIBILITY_ALWAYS_SHOWN } from "./messages";
import { avatarPath, profilePath, searchTarget } from "./paths";
import { profileSchema } from "./schemas";
import {
  DISPLAY_NAME_CONFUSABLES,
  bioProblem,
  displayNameComparable,
  displayNameProblem,
  displayNameWords,
  initialsOf,
  isReservedDisplayName,
  normalizeBio,
} from "./text";

const rlo = String.fromCodePoint(0x202e);

describe("identifiant (handle)", () => {
  it("normalise la saisie : espaces, @ initial, minuscules", () => {
    expect(normalizeHandle("  @Alice_42 ")).toBe("alice_42");
    expect(normalizeHandle("ALICE")).toBe("alice");
  });

  it("format : 3 à 30 caractères, a-z 0-9 _, ni « _ » au bord, au moins une lettre", () => {
    for (const ok of ["abc", "a_b", "alice_42", "x".repeat(30), "42a"]) expect(isHandleFormatOk(ok), ok).toBe(true);
    for (const bad of ["ab", "x".repeat(31), "_abc", "abc_", "123", "a-b", "a.b", "a b", "élise", "Alice", ""]) {
      expect(isHandleFormatOk(bad), bad).toBe(false);
    }
  });

  it("identifiants réservés, et identifiants qui contiennent un mot réservé", () => {
    for (const handle of ["admin", "administrateur", "moderation", "moderateur_1", "stratavault", "support_fr", "contact", "root"]) {
      expect(isReservedHandle(handle), handle).toBe(true);
      expect(isHandleAvailableFormat(handle), handle).toBe(false);
    }
    // Mot réservé ailleurs qu'au début, ou déguisé par des chiffres et des « _ ».
    for (const handle of ["equipe_stratavault", "la_moderation", "stratavau1t", "adm1n", "5upport", "team_admin", "x_officiel", "adm_in", "r00t", "c0ntact", "he1p", "mod0"]) {
      expect(isReservedHandle(handle), handle).toBe(true);
    }
    for (const handle of ["alice", "rootkit_fan", "mod_fan", "helper", "contacter"]) expect(isReservedHandle(handle), handle).toBe(false);
  });

  it("forme repliée : chiffres qui imitent une lettre, l et i confondus, « _ » retiré, rn → m, vv → w", () => {
    expect(foldHandle("stratavau1t")).toBe(foldHandle("stratavault"));
    expect(foldHandle("a_d_m_1_n")).toBe("admin");
    expect(foldHandle("0134578_l")).toBe("oieastbi");
    expect(foldHandle("adrnin")).toBe("admin");
    expect(foldHandle("r_n")).toBe("m");
    expect(foldHandle("vvebmaster")).toBe(foldHandle("webmaster"));
    // Imitations d'un autre identifiant : même forme repliée (la base refuse la seconde).
    for (const lookalike of ["a1ice", "al_ice", "aiice", "a_l_i_c_e"]) expect(foldHandle(lookalike), lookalike).toBe(foldHandle("alice"));
    for (const handle of ["adrnin", "rnoderateur", "rnodo", "vvebmaster"]) expect(isReservedHandle(handle), handle).toBe(true);
  });
});

describe("nom affiché et présentation", () => {
  it("nom affiché : 1 à 50 caractères (points de code), sans contrôle ni caractère invisible", () => {
    expect(displayNameProblem("Émile")).toBeNull();
    expect(displayNameProblem("🌍".repeat(50))).toBeNull();
    expect(displayNameProblem("🌍".repeat(51))).toBe("too-long");
    expect(displayNameProblem("")).toBe("empty");
    expect(displayNameProblem(`Ali${rlo}ce`)).toBe("forbidden-chars");
    expect(displayNameProblem("A\nB")).toBe("forbidden-chars");
  });

  it("nom affiché : refuse les noms vides à l'écran (remplissages, caractères cachés, espaces au bord)", () => {
    const blanks = [0x3164, 0x2800, 0xffa0, 0x115f, 0x1160, 0x034f, 0xfe0f, 0x180b, 0x17b4, 0xe0041, 0xe0100, 0x1d173];
    // Toute la propriété Default_Ignorable_Code_Point, dont les points de code non attribués.
    const ignorables = [0xfff0, 0xfff8, 0x16fe4, 0x1bca0, 0x1bca3, 0xe0080, 0xe00ff, 0xe01f0, 0xe0fff];
    for (const code of [...blanks, ...ignorables]) {
      const char = String.fromCodePoint(code);
      expect(displayNameProblem(char), code.toString(16)).toBe("forbidden-chars");
      expect(displayNameProblem(`Alice${char}`), code.toString(16)).toBe("forbidden-chars");
    }
    // Marque combinante seule ou au début ; espaces Unicode au bord.
    expect(displayNameProblem(String.fromCodePoint(0x301))).toBe("forbidden-chars");
    expect(displayNameProblem(`${String.fromCodePoint(0x301)}Alice`)).toBe("forbidden-chars");
    expect(displayNameProblem(`Ale${String.fromCodePoint(0x301)}`)).toBeNull();
    for (const space of [0xa0, 0x3000, 0x2003, 0x202f]) {
      const char = String.fromCodePoint(space);
      expect(displayNameProblem(`Alice${char}`), space.toString(16)).toBe("forbidden-chars");
      expect(displayNameProblem(`${char}Alice`), space.toString(16)).toBe("forbidden-chars");
      expect(displayNameProblem(`Ali${char}ce`), space.toString(16)).toBeNull();
    }
  });

  it("nom affiché : refuse un nom qui laisse croire à un compte de l'équipe", () => {
    const bold = (text: string) =>
      [...text].map((c) => String.fromCodePoint((c >= "a" ? 0x1d41a - 0x61 : 0x1d400 - 0x41) + c.charCodeAt(0))).join("");
    const fullwidth = (text: string) => [...text].map((c) => String.fromCodePoint(c.charCodeAt(0) + 0xfee0)).join("");
    const reserved = [
      "Équipe Stratavault — Modération",
      "Admin",
      "L’administrateur",
      "Modérateur",
      "Strata-vault",
      "STRATAVAULT officiel",
      "Official",
      "Adrnin",
      "Adm1n du site",
      bold("Admin"),
      fullwidth("Admin"),
    ];
    for (const name of reserved) expect(displayNameProblem(name), name).toBe("reserved");
    for (const name of ["Alice", "Émile Zola", "Conrad Mint", "Mohammad Mina", "Supporter du PSG", "Équipe de Lyon"]) {
      expect(displayNameProblem(name), name).toBeNull();
    }
    // Comparaison mot par mot (sinon « Conrad Mint » contiendrait « admin ») : un mot coupé passe…
    expect(isReservedDisplayName("Ad min")).toBe(false);
    // … sauf « stratavault », cherché aussi dans le nom entier sans ses espaces.
    for (const name of ["Strata Vault", "STRATA  VAULT", "Strat ava ult", "L'équipe Strata Vault"]) {
      expect(displayNameProblem(name), name).toBe("reserved");
    }
  });

  it("nom affiché : les lettres cyrilliques, grecques ou en petites capitales d'apparence latine ne contournent pas les mots réservés", () => {
    const cp = (code: number) => String.fromCodePoint(code);
    const lookalikes = [
      `${cp(0x405)}tratavault`, // Ѕ cyrillique
      `${cp(0x410)}dmin`, // А cyrillique
      `${cp(0x391)}dministrateur`, // Α grec
      `Stratavau${cp(0x4cf)}t`, // ӏ cyrillique (palotchka)
      `${cp(0x43e)}fficiel`, // о cyrillique
      `M${cp(0x3bf)}d${cp(0x3b5)}rateur`, // ο et ε grecs
      [0x1d00, 0x1d05, 0x1d0d, 0x26a, 0x274].map(cp).join(""), // ᴀᴅᴍɪɴ, petites capitales
      `Adm${cp(0x131)}n`, // ı sans point
    ];
    for (const name of lookalikes) expect(displayNameProblem(name), name).toBe("reserved");
    // De vrais noms écrits dans ces alphabets restent acceptés.
    for (const name of ["Александр Пушкин", "Σοφία Παπαδοπούλου", "Ольга", "Νίκος"]) {
      expect(displayNameProblem(name), name).toBeNull();
    }
  });

  it("table des confusables : chaque lettre une seule fois, inchangée par NFKD, vers une lettre a-z", () => {
    const letters = DISPLAY_NAME_CONFUSABLES.flatMap(([from]) => [...from]);
    for (const [from, to] of DISPLAY_NAME_CONFUSABLES) {
      expect([...from]).toHaveLength(to.length);
      expect(to).toMatch(/^[a-z]+$/);
    }
    expect(new Set(letters).size).toBe(letters.length);
    for (const letter of letters) {
      expect(letter.normalize("NFKD"), letter).toBe(letter);
      expect(letter, letter).not.toMatch(/[a-zA-Z]/);
    }
    expect(displayNameComparable(DISPLAY_NAME_CONFUSABLES.map(([from]) => from).join(""))).toBe(
      DISPLAY_NAME_CONFUSABLES.map(([, to]) => to).join(""),
    );
    expect(displayNameWords("Équipe  Strata-vault 2026")).toEqual(["equipe", "stratavauit", "2o26"]);
  });

  it("présentation : 280 caractères, 6 lignes, retours à la ligne normalisés", () => {
    expect(normalizeBio("\r\n  Bonjour\r\nà tous \n\n")).toBe("Bonjour\nà tous");
    expect(bioProblem("")).toBeNull();
    expect(bioProblem("a".repeat(281))).toBe("too-long");
    expect(bioProblem("1\n2\n3\n4\n5\n6")).toBeNull();
    expect(bioProblem("1\n2\n3\n4\n5\n6\n7")).toBe("too-many-lines");
    expect(bioProblem("a\tb")).toBe("forbidden-chars");
    expect(bioProblem(`x${rlo}`)).toBe("forbidden-chars");
  });

  it("initiales de l'avatar par défaut", () => {
    expect(initialsOf("Léo Velard")).toBe("LV");
    expect(initialsOf("émile")).toBe("É");
    expect(initialsOf("  ")).toBe("?");
  });
});

describe("formulaire de profil (zod)", () => {
  const valid = { handle: " @Alice ", displayName: "  Alice  ", bio: "Ligne\r\n", visibility: "members" };

  it("valeurs normalisées comme la base les enregistre", () => {
    expect(profileSchema.parse(valid)).toEqual({ handle: "alice", displayName: "Alice", bio: "Ligne", visibility: "members" });
  });

  it("messages sous les champs concernés", () => {
    const result = profileSchema.safeParse({ ...valid, handle: "a", displayName: "", visibility: "public" });
    expect(result.success).toBe(false);
    const fields = result.error?.issues.map((issue) => issue.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["handle", "displayName", "visibility"]));
    expect(result.error?.issues.find((i) => i.path[0] === "handle")?.message).toBe(HANDLE_INVALID);
    expect(profileSchema.safeParse({ ...valid, handle: "admin" }).error?.issues[0].message).toBe(HANDLE_RESERVED);
  });

  it("borne la saisie avant toute transformation", () => {
    expect(profileSchema.safeParse({ ...valid, bio: " ".repeat(5000) }).success).toBe(false);
  });
});

describe("adresses", () => {
  it("page d'un profil, image d'un avatar, recherche par identifiant exact", () => {
    expect(profilePath("alice")).toBe("/profil/alice");
    expect(avatarPath("11111111-1111-4111-8111-111111111111")).toBe("/avatars/11111111-1111-4111-8111-111111111111");
    expect(searchTarget(" @Alice ")).toBe("/profil/alice");
    // Pas de requête pour une saisie qui n'est pas un identifiant (adresse e-mail comprise).
    for (const bad of ["alice@exemple.fr", "a", "../compte", ""]) expect(searchTarget(bad), bad).toBeNull();
  });
});

describe("liens « Mon profil »", () => {
  it("depuis /espace et /compte, vers une page qui existe", () => {
    expect(routeExists("/profil")).toBe(true);
    for (const page of ["espace", "compte"]) {
      const source = readFileSync(join(ROOT, "src", "app", page, "page.tsx"), "utf8");
      expect(source, page).toMatch(/href=\{MY_PROFILE_PAGE\}[^>]*>\s*Mon profil/);
    }
  });
});

describe("textes de visibilité et de suppression du profil", () => {
  it("l'aide de visibilité donne tous les cas où l'identifiant reste montré (comme les CGU)", () => {
    for (const where of [
      "vos éléments de la carte collective",
      "aux membres de vos cartes partagées",
      "aux contacts que vous y invitez",
      "ouvre un lien d’invitation",
      "au propriétaire des cartes partagées avec vous",
      "aux modérateurs",
    ]) {
      expect(VISIBILITY_ALWAYS_SHOWN, where).toContain(where);
    }
  });

  it("la suppression du profil dit que les éléments de la carte collective ne sont plus montrés", () => {
    expect(DELETE_PROFILE_CONFIRM).toContain("Vos éléments de la carte collective ne sont plus montrés aux autres membres");
    const page = readFileSync(join(ROOT, "src/app/profil/page.tsx"), "utf8").replace(/\s+/g, " ");
    expect(page).toContain("Vos éléments de la carte collective ne sont plus montrés aux autres membres");
  });
});
