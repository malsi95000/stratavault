// Textes affichés des fiches supplémentaires (listes, en-têtes).
import type { ExtraFiche } from "@/features/map-doc/types";

/** Titre d'une fiche supplémentaire ; « Fiche sans titre » s'il est vide. */
export const extraFicheTitle = (fiche: Pick<ExtraFiche, "title">) => fiche.title.trim() || "Fiche sans titre";

/** Date d'une fiche (AAAA-MM-JJ) écrite en français (« 3 oct. 2026 ») ; autre format : telle quelle. */
export function frenchDate(date: string | undefined): string {
  if (!date) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
