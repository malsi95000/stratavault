// Messages transmis par l'adresse d'une page (?compte=…, ?donnees=…, ?erreur=…) : listes fermées,
// toute autre valeur est ignorée. Les paramètres ne contiennent jamais de donnée personnelle.
import {
  ACCOUNT_DELETED,
  DEMO_DATA_CLEARED,
  EXPORT_IN_PROGRESS,
  EXPORT_RATE_LIMITED,
  EXPORT_SERVER_BUSY,
  EXPORT_UNAVAILABLE,
} from "./messages";

type SearchParams = Record<string, string | string[] | undefined>;

/** Accueil après la suppression du compte. */
export const ACCOUNT_DELETED_PATH = "/?compte=supprime";
/** /espace après l'effacement des données de démo. */
export const DEMO_CLEARED_PATH = "/espace?donnees=effacees";
/** Page du compte, et ses erreurs de téléchargement. */
export const ACCOUNT_PAGE = "/compte";
export const EXPORT_RATE_LIMITED_PATH = `${ACCOUNT_PAGE}?erreur=trop`;
export const EXPORT_UNAVAILABLE_PATH = `${ACCOUNT_PAGE}?erreur=indisponible`;
export const EXPORT_IN_PROGRESS_PATH = `${ACCOUNT_PAGE}?erreur=en-cours`;
export const EXPORT_SERVER_BUSY_PATH = `${ACCOUNT_PAGE}?erreur=occupe`;

function read(params: SearchParams, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" ? value : undefined;
}

/** Confirmation affichée sur l'accueil (toast). */
export const homeNotice = (params: SearchParams) => (read(params, "compte") === "supprime" ? ACCOUNT_DELETED : undefined);

/** Confirmation affichée sur /espace (toast). */
export const spaceNotice = (params: SearchParams) => (read(params, "donnees") === "effacees" ? DEMO_DATA_CLEARED : undefined);

const EXPORT_ERRORS = new Map<string, string>([
  ["trop", EXPORT_RATE_LIMITED],
  ["indisponible", EXPORT_UNAVAILABLE],
  ["en-cours", EXPORT_IN_PROGRESS],
  ["occupe", EXPORT_SERVER_BUSY],
]);

/** Erreur du téléchargement des données, affichée sur /compte. */
export function exportError(params: SearchParams): string | undefined {
  const code = read(params, "erreur");
  return code === undefined ? undefined : EXPORT_ERRORS.get(code);
}
