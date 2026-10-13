// Textes de la page « Mon compte » (/compte) et de l'effacement des données de démo.

/** Mot exact à taper pour confirmer la suppression du compte. */
export const DELETE_CONFIRMATION_WORD = "SUPPRIMER";

export const CONFIRMATION_REQUIRED = `Tapez ${DELETE_CONFIRMATION_WORD} en majuscules pour confirmer.`;
export const WRONG_PASSWORD = "Mot de passe incorrect.";
export const SESSION_ENDED = "Votre session a pris fin : reconnectez-vous, puis recommencez.";
export const SESSION_CHANGED =
  "Un autre compte est maintenant ouvert dans ce navigateur : rechargez la page avant de supprimer un compte.";
export const DELETE_FAILED = "Le compte n’a pas pu être supprimé : rien n’a été effacé. Réessayez plus tard.";
/**
 * « Changer mon mot de passe » : la personne est connectée et voit son adresse, le message
 * anti-énumération du mot de passe oublié n'a pas lieu d'être. Au-delà du plafond de demandes de
 * l'adresse (10 par heure), rien n'est envoyé : d'où l'invitation à réessayer dans une heure.
 */
export const passwordChangeRequested = (email: string) =>
  `Un lien de changement de mot de passe a été demandé pour ${email}. S’il n’arrive pas d’ici quelques minutes (pensez aux courriers indésirables), réessayez dans une heure.`;
export const NO_EMAIL = "Ce compte n’a pas d’adresse e-mail : cette action se demande par e-mail.";

/** Affiché sur l'accueil après la suppression (paramètre ?compte=supprime). */
export const ACCOUNT_DELETED = "Votre compte et toutes ses cartes ont été supprimés.";

/** Mode démo : effacement des données de ce navigateur. */
export const CLEAR_DEMO_CONFIRM =
  "Effacer les cartes du mode démo et les préférences enregistrées dans ce navigateur ? Les cartes non exportées seront définitivement perdues.";
export const DEMO_DATA_CLEARED = "Les données du mode démo ont été effacées de ce navigateur.";
export const DEMO_DATA_PENDING =
  "Les préférences ont été effacées. L’effacement des cartes du mode démo est en attente : un autre onglet de Stratavault garde la base ouverte. Il se terminera dès que cet onglet sera fermé.";
export const DEMO_DATA_NOT_CLEARED =
  "Les données du mode démo n’ont pas pu être effacées de ce navigateur : rien n’a été effacé. Réessayez plus tard.";

/** Erreurs du téléchargement des données, transmises par l'adresse de /compte (?erreur=…). */
export const EXPORT_RATE_LIMITED = "Trop de téléchargements. Réessayez dans quelques minutes.";
export const EXPORT_UNAVAILABLE = "Le téléchargement de vos données a échoué. Réessayez plus tard.";
export const EXPORT_IN_PROGRESS =
  "Un téléchargement de vos données est déjà en cours. Attendez qu’il se termine, puis réessayez si besoin.";
export const EXPORT_SERVER_BUSY = "Trop de téléchargements sont en cours. Réessayez dans quelques minutes.";
