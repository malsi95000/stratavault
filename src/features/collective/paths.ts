// Adresses des pages de la carte collective (mode compte seulement).
import { LEGAL_PAGE } from "@/lib/legal";

/** Carte collective (COM-03 : lien depuis l'espace ; COM-01 : encart de l'accueil). */
export const COLLECTIVE_PAGE = "/carte-collective";
/** File de modération et journal des décisions (modérateurs seulement). */
export const MODERATION_PAGE = "/carte-collective/moderation";
/** Règles de la carte collective et de sa modération (section des conditions d'utilisation). */
export const COLLECTIVE_RULES_PAGE = `${LEGAL_PAGE.terms.href}#collective`;
/** Traitements de données de la politique de confidentialité (dont « Carte collective et modération »). */
export const COLLECTIVE_PRIVACY_PAGE = `${LEGAL_PAGE.privacy.href}#traitements`;
