// Dates des fiches, lues pour la frise et les filtres. Le champ « Date » des fiches enregistre
// AAAA-MM-JJ ; un import peut contenir une année seule, AAAA-MM ou JJ/MM/AAAA, que l'on accepte aussi.
// Toute autre écriture est une date illisible : la fiche est traitée comme « sans date ».

/** Date lue : année, mois et jour connus, et sa position sur un axe en années décimales. */
export type FicheDate = {
  year: number;
  /** 1 à 12, absent pour une année seule. */
  month?: number;
  /** 1 à 31, absent si le jour n'est pas précisé. */
  day?: number;
  /** Position en années décimales : 1914.0 est le 1er janvier 1914 (début de la période). */
  value: number;
};

const ISO = /^(\d{1,4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/;
const FRENCH = /^(\d{1,2})\/(\d{1,2})\/(\d{1,4})$/;

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInYear = (y: number) => (isLeap(y) ? 366 : 365);

/** Nombre de jours d'un mois (1 à 12). */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeap(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Jours écoulés depuis le 1er janvier jusqu'au premier jour du mois (1 à 12). */
function daysBefore(year: number, month: number): number {
  let days = 0;
  for (let m = 1; m < month; m++) days += daysInMonth(year, m);
  return days;
}

function build(year: number, month?: number, day?: number): FicheDate | null {
  if (month !== undefined && (month < 1 || month > 12)) return null;
  if (day !== undefined && (month === undefined || day < 1 || day > daysInMonth(year, month))) return null;
  const offset = month === undefined ? 0 : daysBefore(year, month) + (day ?? 1) - 1;
  const date: FicheDate = { year, value: year + offset / daysInYear(year) };
  if (month !== undefined) date.month = month;
  if (day !== undefined) date.day = day;
  return date;
}

/** Position du premier jour d'un mois (1 à 12) en années décimales. */
export function monthStart(year: number, month: number): number {
  return year + daysBefore(year, month) / daysInYear(year);
}

/**
 * Fin de la période désignée par une date (exclue) : le lendemain d'un jour, le mois suivant d'un mois,
 * l'année suivante d'une année. Une fiche datée « 1916 » couvre toute l'année 1916.
 */
export function endOf(date: FicheDate): number {
  const { year, month, day } = date;
  if (month === undefined) return year + 1;
  if (day === undefined) return month === 12 ? year + 1 : monthStart(year, month + 1);
  return date.value + 1 / daysInYear(year);
}

/** Lit la date d'une fiche ; null si elle est absente, vide ou illisible. */
export function parseFicheDate(text: string | undefined): FicheDate | null {
  const s = text?.trim();
  if (!s) return null;
  const iso = ISO.exec(s);
  if (iso) {
    const [, y, m, d] = iso;
    return build(Number(y), m === undefined ? undefined : Number(m), d === undefined ? undefined : Number(d));
  }
  const fr = FRENCH.exec(s);
  if (fr) return build(Number(fr[3]), Number(fr[2]), Number(fr[1]));
  return null;
}

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Date écrite en français, à la précision connue : « 1914 », « août 1914 », « 3 août 1914 », « 1er mai 1945 ». */
export function formatFicheDate(date: FicheDate): string {
  if (date.month === undefined) return String(date.year);
  const month = MONTHS[date.month - 1];
  if (date.day === undefined) return `${month} ${date.year}`;
  return `${date.day === 1 ? "1er" : date.day} ${month} ${date.year}`;
}

/** Ordre chronologique de deux dates (à valeur égale, la moins précise d'abord). */
export function compareFicheDates(a: FicheDate, b: FicheDate): number {
  if (a.value !== b.value) return a.value - b.value;
  const precision = (d: FicheDate) => (d.day !== undefined ? 2 : d.month !== undefined ? 1 : 0);
  return precision(a) - precision(b);
}
