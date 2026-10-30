// Logique pure des contacts : entrées des Server Actions, relation avec un membre, liens de navigation.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, routeExists } from "@/test/sourceFiles";
import { BLOCKS_PER_DAY, CONTACT_CHANGES_PER_DAY, CONTACT_REQUESTS_PER_DAY } from "./limits";
import { CONTACTS_ONLY_SEND_HINT, CONTACT_RATE_LIMITED, HANDLE_REQUIRED, RELATION_GONE, SEND_MESSAGES } from "./messages";
import { VISIBILITY_HINTS } from "@/features/profiles/messages";
import { CONTACTS_PAGE } from "./paths";
import { relationWith } from "./relation";
import { blockTargetSchema, memberHandleSchema, relationRefSchema } from "./schemas";
import type { ContactOverview } from "./types";

const REF = "12345678-1234-4234-8234-123456789abc";

describe("entrées", () => {
  it("identifiant exact normalisé ; jamais une adresse e-mail ni un motif", () => {
    expect(memberHandleSchema.parse(" @Alice ")).toBe("alice");
    for (const bad of ["alice@exemple.fr", "al", "a%", "", "x".repeat(10_000)]) {
      const result = memberHandleSchema.safeParse(bad);
      expect(result.success, bad).toBe(false);
      if (!result.success) expect(result.error.issues[0].message).toBe(HANDLE_REQUIRED);
    }
  });

  it("références : uuid en minuscules seulement", () => {
    expect(relationRefSchema.parse(REF)).toBe(REF);
    for (const bad of [REF.toUpperCase(), `${REF} `, "1", ""]) expect(relationRefSchema.safeParse(bad).success, bad).toBe(false);
    expect(relationRefSchema.safeParse("1").error?.issues[0].message).toBe(RELATION_GONE);
  });

  it("blocage : par identifiant, par demande ou par contact ; aucun autre type", () => {
    expect(blockTargetSchema.parse({ kind: "handle", value: "@Bob" })).toEqual({ kind: "handle", value: "bob" });
    expect(blockTargetSchema.parse({ kind: "request", value: REF })).toEqual({ kind: "request", value: REF });
    expect(blockTargetSchema.parse({ kind: "contact", value: REF })).toEqual({ kind: "contact", value: REF });
    expect(blockTargetSchema.safeParse({ kind: "request", value: "bob" }).success).toBe(false);
    expect(blockTargetSchema.safeParse({ kind: "handle", value: REF }).success).toBe(false);
    expect(blockTargetSchema.safeParse({ kind: "account", value: REF }).success).toBe(false);
  });

  it("« introuvable » dit la même chose qu'une recherche de profil sans résultat", () => {
    expect(SEND_MESSAGES["not-found"]).not.toMatch(/bloqu|masqu|existe/i);
  });
});

describe("textes", () => {
  it("la limite atteinte cite les trois limites de la base (demandes, blocages, autres opérations)", () => {
    for (const limit of [CONTACT_REQUESTS_PER_DAY, BLOCKS_PER_DAY, CONTACT_CHANGES_PER_DAY]) {
      expect(CONTACT_RATE_LIMITED).toContain(String(limit));
    }
  });

  it("un profil « contacts » est prévenu qu'il ne peut pas recevoir de demande", () => {
    for (const text of [VISIBILITY_HINTS.contacts, CONTACTS_ONLY_SEND_HINT]) expect(text).toMatch(/envoyer de demande/);
    const page = readFileSync(join(ROOT, "src", "app", "contacts", "page.tsx"), "utf8");
    expect(page).toMatch(/profile\.visibility === "contacts" && .*CONTACTS_ONLY_SEND_HINT/);
  });
});

describe("relationWith", () => {
  const overview: ContactOverview = {
    contacts: [{ id: "c1", handle: "bob", displayName: "Bob", avatarId: null, createdAt: "" }],
    incoming: [{ id: "r1", direction: "incoming", handle: "carol", displayName: "Carol", avatarId: null, createdAt: "" }],
    outgoing: [{ id: "r2", direction: "outgoing", handle: "dave", displayName: null, avatarId: null, createdAt: "" }],
    // Identifiant gardé au moment du blocage : il a pu passer depuis à un autre membre, dont le profil
    // est visible ; le blocage ne le désigne pas.
    blocked: [{ id: "b1", handle: "zoe", createdAt: "" }],
  };

  it("donne la relation et sa référence", () => {
    expect(relationWith(overview, "bob")).toEqual({ kind: "contact", contactId: "c1" });
    expect(relationWith(overview, "carol")).toEqual({ kind: "incoming", requestId: "r1" });
    expect(relationWith(overview, "dave")).toEqual({ kind: "outgoing", requestId: "r2" });
    expect(relationWith(overview, "zoe")).toEqual({ kind: "none" });
    expect(relationWith(overview, "inconnu")).toEqual({ kind: "none" });
  });
});

describe("page « Contacts »", () => {
  it("existe et est accessible depuis /espace, /compte et les pages de profil", () => {
    expect(routeExists(CONTACTS_PAGE)).toBe(true);
    for (const file of [
      ["src", "app", "espace", "page.tsx"],
      ["src", "app", "compte", "page.tsx"],
      ["src", "features", "profiles", "components", "ProfileShell.tsx"],
    ]) {
      const source = readFileSync(join(ROOT, ...file), "utf8");
      expect(source, file.join("/")).toMatch(/href=\{CONTACTS_PAGE\}[^>]*>\s*Contacts/);
    }
  });
});
