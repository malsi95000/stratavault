import { describe, expect, it } from "vitest";
import type { z } from "@/lib/zod";
import { PASSWORD_MISMATCH, PASSWORD_TOO_LONG, PASSWORD_TOO_SHORT } from "./messages";
import { newPasswordSchema, resetRequestSchema, signInSchema, signUpSchema } from "./schemas";

const firstIssue = (result: z.ZodSafeParseResult<unknown>) => result.error?.issues[0];

describe("schémas des formulaires de compte", () => {
  it("valide et nettoie l'adresse e-mail", () => {
    expect(resetRequestSchema.parse({ email: "  vous@exemple.fr " })).toEqual({ email: "vous@exemple.fr" });
    for (const email of ["", "vous", "vous@", "@exemple.fr", "vous exemple@fr.fr", `${"a".repeat(250)}@exemple.fr`]) {
      expect(resetRequestSchema.safeParse({ email }).success).toBe(false);
    }
  });

  it("connexion : mot de passe non vide, sans rappel de la politique", () => {
    expect(signInSchema.safeParse({ email: "vous@exemple.fr", password: "court" }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "vous@exemple.fr", password: "" }).success).toBe(false);
  });

  it("inscription : 12 à 72 caractères", () => {
    const base = { email: "vous@exemple.fr" };
    const pair = (password: string) => ({ ...base, password, confirm: password });
    expect(firstIssue(signUpSchema.safeParse(pair("a".repeat(11))))?.message).toBe(PASSWORD_TOO_SHORT);
    expect(signUpSchema.safeParse(pair("a".repeat(12))).success).toBe(true);
    expect(signUpSchema.safeParse(pair("a".repeat(72))).success).toBe(true);
    expect(firstIssue(signUpSchema.safeParse(pair("a".repeat(73))))?.message).toBe(PASSWORD_TOO_LONG);
  });

  it("compte la limite de bcrypt en octets (lettres accentuées)", () => {
    const accented = "é".repeat(37); // 37 caractères, 74 octets
    const result = newPasswordSchema.safeParse({ password: accented, confirm: accented });
    expect(firstIssue(result)?.message).toBe(PASSWORD_TOO_LONG);
  });

  it("exige une confirmation identique, signalée sur le champ de confirmation", () => {
    const result = newPasswordSchema.safeParse({ password: "un mot de passe sûr", confirm: "un autre mot de passe" });
    expect(firstIssue(result)).toMatchObject({ message: PASSWORD_MISMATCH, path: ["confirm"] });
    const ok = signUpSchema.safeParse({ email: "a@b.fr", password: "un mot de passe sûr", confirm: "un mot de passe sûr" });
    expect(ok.success).toBe(true);
  });
});
