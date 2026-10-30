// Textes des profils (« Mon profil », pages publiques, avatar).
import { BIO_MAX, BIO_MAX_NEWLINES, DISPLAY_NAME_MAX } from "./text";
import { HANDLE_MAX, HANDLE_MIN } from "./handle";

export const HANDLE_HINT = `${HANDLE_MIN} à ${HANDLE_MAX} caractères : lettres minuscules sans accent, chiffres et « _ ». Les majuscules sont ramenées en minuscules.`;
export const HANDLE_INVALID = `Identifiant invalide : ${HANDLE_MIN} à ${HANDLE_MAX} caractères, lettres minuscules sans accent, chiffres et « _ », au moins une lettre, sans « _ » au début ni à la fin.`;
export const HANDLE_RESERVED = "Cet identifiant est réservé : choisissez-en un autre.";
export const HANDLE_TAKEN =
  "Cet identifiant est déjà pris, ou trop proche d’un identifiant existant (« a1ice » pour « alice ») : choisissez-en un autre.";

export const DISPLAY_NAME_REQUIRED = "Saisissez le nom à afficher.";
export const DISPLAY_NAME_RESERVED =
  "Ce nom laisse croire à un compte de l’équipe (admin, modération, Stratavault, officiel) : choisissez-en un autre.";
export const DISPLAY_NAME_TOO_LONG = `Le nom affiché ne doit pas dépasser ${DISPLAY_NAME_MAX} caractères.`;
export const BIO_TOO_LONG = `La présentation ne doit pas dépasser ${BIO_MAX} caractères.`;
export const BIO_TOO_MANY_LINES = `La présentation ne doit pas dépasser ${BIO_MAX_NEWLINES + 1} lignes.`;
export const FORBIDDEN_CHARS = "Ce texte contient des caractères invisibles ou de contrôle : retirez-les.";
export const VISIBILITY_INVALID = "Choisissez qui peut voir votre profil.";

export const PROFILE_CREATED = "Votre profil est créé.";
export const PROFILE_SAVED = "Profil enregistré.";
export const PROFILE_DELETED = "Votre profil a été supprimé.";
/** Confirmation de « Supprimer mon profil » : tout ce que la suppression touche (le compte reste). */
export const DELETE_PROFILE_CONFIRM =
  "Supprimer votre profil et son avatar ? Vos contacts et vos demandes de contact sont supprimés avec lui (vos blocages restent). Vous quittez les cartes partagées avec vous, et les partages de vos cartes s’arrêtent (membres, invitations et liens). Vos éléments de la carte collective ne sont plus montrés aux autres membres (ils restent, vous pouvez toujours les supprimer, et ils reviennent, signés, si vous recréez un profil). Votre identifiant sera libéré et pourra être choisi par un autre membre. Votre compte et vos cartes ne sont pas touchés.";
export const PROFILE_MISSING = "Vous n’avez pas encore de profil : créez-le d’abord.";
export const PROFILE_EXISTS = "Votre profil existe déjà : rechargez la page.";
export const PROFILE_RATE_LIMITED = "Trop de modifications. Réessayez plus tard.";
export const PROFILE_UNAVAILABLE = "Le profil n’a pas pu être enregistré. Réessayez plus tard.";
export const PROFILE_SESSION_ENDED = "Votre session a pris fin : reconnectez-vous, puis recommencez.";
export const PROFILE_SESSION_CHANGED =
  "Un autre compte est maintenant ouvert dans ce navigateur : rechargez la page.";

export const AVATAR_REQUIRED = "Choisissez une image.";
export const AVATAR_TOO_LARGE = "Image trop lourde : 2 Mo au plus.";
export const AVATAR_BAD_TYPE = "Format refusé : choisissez une image PNG, JPEG ou WebP.";
export const AVATAR_UNREADABLE = "Cette image est illisible ou trop grande (4 096 pixels de côté au plus).";
export const AVATAR_SAVED = "Avatar enregistré.";
export const AVATAR_REMOVED = "Avatar retiré.";
export const AVATAR_FILES_REMOVED = "Fichiers de l’avatar effacés.";
export const AVATAR_REMOVE_INCOMPLETE =
  "L’avatar est retiré de votre profil, mais son fichier n’a pas pu être effacé pour l’instant : réessayez dans un moment avec « Effacer les fichiers de l’avatar ».";
export const AVATAR_RATE_LIMITED = "Trop de changements d’avatar. Réessayez plus tard.";
export const AVATAR_UNAVAILABLE = "L’avatar n’a pas pu être enregistré. Réessayez plus tard.";

export const VISIBILITY_LABELS = {
  members: "Tous les membres connectés",
  contacts: "Mes contacts seulement",
} as const;

/**
 * Quelle que soit la visibilité, l'identifiant et le nom affiché sont montrés là où le compte agit
 * auprès d'autres membres (mêmes cas que /conditions, section « Votre profil », et /confidentialite).
 */
export const VISIBILITY_ALWAYS_SHOWN =
  "Dans les deux cas, votre identifiant et votre nom affiché restent montrés avec vos éléments de la carte collective, aux membres de vos cartes partagées et aux contacts que vous y invitez, à toute personne connectée qui ouvre un lien d’invitation d’une de vos cartes, au propriétaire des cartes partagées avec vous, et aux modérateurs quand un de vos éléments de la carte collective est signalé ou modéré. Les autres membres d’une carte partagée avec vous ne voient que votre nom affiché, quand vous la modifiez.";

export const VISIBILITY_HINTS = {
  members: `Tout compte connecté qui connaît votre identifiant peut voir votre profil, sauf entre comptes qui se sont bloqués (dans un sens ou dans l’autre). ${VISIBILITY_ALWAYS_SHOWN}`,
  contacts: `Seuls vos contacts voient votre profil, ainsi que les membres à qui vous envoyez une demande de contact, tant qu’elle est en attente. Les autres membres ne peuvent pas le trouver, ni donc vous envoyer de demande de contact : c’est à vous de l’envoyer. ${VISIBILITY_ALWAYS_SHOWN}`,
} as const;

export const SEARCH_INVALID = "Saisissez un identifiant exact (3 à 30 caractères).";
export const LOOKUP_RATE_LIMITED = "Trop de recherches de profils. Réessayez dans un moment.";
