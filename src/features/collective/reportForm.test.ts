// Formulaire de signalement : aucun motif présélectionné, envoi refusé tant qu'il n'est pas choisi ;
// contenu illicite : explication et déclaration de bonne foi exigées (DSA, art. 16, paragraphe 2).
import { describe, expect, it } from "vitest";
import { MIN_ILLEGAL_DETAILS, reasonChoice, reportFormData, reportFormProblem } from "./reportForm";
import { reportSchema } from "./schemas";
import { REPORT_REASONS } from "./types";

const why = "Publie l’adresse et le téléphone d’une personne.";

describe("formulaire de signalement", () => {
  it("rien n'est envoyé tant qu'aucun motif n'est choisi", () => {
    expect(reportFormProblem("", "Précisions", true)).toBe("reason");
    expect(reportFormData("compte", "p1", "", "Précisions", true)).toBeNull();
    // Le serveur refuse lui aussi un motif vide.
    expect(reportSchema.safeParse({ item: "p1", reason: "", details: "", goodFaith: "" }).success).toBe(false);
  });

  it("le motif choisi est envoyé avec l'élément, le compte, les précisions et la déclaration", () => {
    const data = reportFormData("compte", "p1", "spam", "Pub", false);
    expect(data && Object.fromEntries(data.entries())).toEqual({ account: "compte", item: "p1", reason: "spam", details: "Pub", goodFaith: "" });
  });

  it("hors contenu illicite, les précisions et la déclaration restent facultatives", () => {
    for (const reason of REPORT_REASONS.filter((r) => r !== "illegal")) {
      expect(reportFormProblem(reason, "", false), reason).toBeNull();
      expect(reportSchema.safeParse({ item: "p1", reason, details: "", goodFaith: "" }).success, reason).toBe(true);
    }
  });

  it("contenu illicite : explication puis déclaration de bonne foi exigées, ici comme sur le serveur", () => {
    const short = "x".repeat(MIN_ILLEGAL_DETAILS - 1);
    expect(reportFormProblem("illegal", "", true)).toBe("details");
    expect(reportFormProblem("illegal", ` ${short} `, true)).toBe("details");
    expect(reportFormProblem("illegal", why, false)).toBe("good-faith");
    expect(reportFormProblem("illegal", why, true)).toBeNull();
    expect(reportFormData("compte", "p1", "illegal", why, false)).toBeNull();
    const data = reportFormData("compte", "p1", "illegal", why, true);
    expect(data?.get("goodFaith")).toBe("on");

    const parse = (details: string, goodFaith: string) => reportSchema.safeParse({ item: "p1", reason: "illegal", details, goodFaith }).success;
    expect(parse(short, "on")).toBe(false);
    expect(parse(why, "")).toBe(false);
    expect(parse(why, "oui")).toBe(false);
    expect(parse(why, "on")).toBe(true);
  });

  it("seuls les motifs de la liste sont retenus", () => {
    for (const reason of REPORT_REASONS) expect(reasonChoice(reason)).toBe(reason);
    expect(reasonChoice("")).toBe("");
    expect(reasonChoice("inconnu")).toBe("");
  });
});
