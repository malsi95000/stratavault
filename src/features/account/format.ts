// Dates de la fiche du compte, en français (« 9 octobre 2026 »), à l'heure de Paris.

const DATE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" });

/** Date lisible ; « inconnue » si la valeur est absente ou illisible. */
export function formatAccountDate(iso: string | null): string {
  if (!iso) return "inconnue";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "inconnue" : DATE.format(date);
}
