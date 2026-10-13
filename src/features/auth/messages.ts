// Textes des formulaires de compte. Les messages d'échec sont volontairement génériques :
// ils ne révèlent jamais si une adresse possède un compte (anti-énumération).

/** Note de bas de carte en mode démo (texte de la bêta pour l’inscription). */
export const DEMO_NOTE = "Démo uniquement — aucune donnée de connexion n’est enregistrée.";
export const NOT_CONFIGURED = "Les comptes ne sont pas encore configurés : utilisez l’accès temporaire (démo).";
export const INVALID_CREDENTIALS = "Adresse e-mail ou mot de passe incorrect.";
export const SIGN_UP_SENT = "Si l’adresse est valide, un e-mail de confirmation vient d’être envoyé.";
export const RESET_SENT = "Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d’être envoyé.";
export const RATE_LIMITED = "Trop de tentatives. Réessayez dans quelques minutes.";
export const UNAVAILABLE = "Le service de comptes est momentanément indisponible. Réessayez plus tard.";
export const CHECK_FIELDS = "Vérifiez les champs signalés.";
export const WEAK_PASSWORD = "Ce mot de passe est trop faible ou trop courant : choisissez-en un autre.";
export const SAME_PASSWORD = "Choisissez un mot de passe différent de l’ancien.";
export const RECOVERY_EXPIRED = "Ce lien a expiré : demandez un nouveau lien de réinitialisation.";
export const UPDATE_FAILED = "Impossible de modifier le mot de passe. Réessayez.";
/**
 * Supabase ne renvoie « adresse non confirmée » qu'après avoir vérifié le mot de passe :
 * ce message ne révèle donc rien à qui ne connaît pas déjà le mot de passe.
 */
export const EMAIL_NOT_CONFIRMED = "Adresse e-mail pas encore confirmée : ouvrez le lien reçu par e-mail.";

export const EMAIL_INVALID = "Saisissez une adresse e-mail valide.";
export const PASSWORD_REQUIRED = "Saisissez votre mot de passe.";
export const PASSWORD_TOO_SHORT = "Le mot de passe doit contenir au moins 12 caractères.";
export const PASSWORD_TOO_LONG =
  "Le mot de passe ne doit pas dépasser 72 octets (certains caractères, comme les lettres accentuées, en comptent plusieurs).";
/** Connexion : borne de sécurité seulement (aucun mot de passe valide n'en approche). */
export const PASSWORD_INPUT_TOO_LONG = "Ce mot de passe est trop long.";
export const PASSWORD_HINT = "12 caractères minimum, 72 octets maximum (une lettre accentuée compte pour deux).";
export const PASSWORD_MISMATCH = "Les mots de passe ne correspondent pas.";

export const LINK_INVALID = "Ce lien est invalide ou a expiré. Recommencez la démarche.";
export const LINK_RATE_LIMITED =
  "Trop de tentatives. Patientez quelques minutes, puis rouvrez le lien reçu par e-mail.";

/**
 * Déconnexion : cookies effacés de ce navigateur, mais session pas révoquée chez Supabase. Changer
 * de mot de passe ferme les autres sessions du compte (Supabase Auth).
 */
export const SESSION_NOT_REVOKED =
  "Vous êtes déconnecté de ce navigateur, mais la session n’a pas pu être fermée sur le serveur (service injoignable ou trop de requêtes depuis votre réseau). Elle reste valable pour qui en aurait une copie : en cas de doute, changez votre mot de passe.";

/** Erreurs transmises par l'adresse de la page de connexion (`?erreur=…`), liste fermée. */
const LOGIN_PAGE_ERRORS = new Map<string, string>([
  ["lien", LINK_INVALID],
  ["session", SESSION_NOT_REVOKED],
]);

/** Message pour `?erreur=…` ; toute autre valeur (y compris `__proto__`, `constructor`…) est ignorée. */
export function loginPageError(code: unknown): string | undefined {
  return typeof code === "string" ? LOGIN_PAGE_ERRORS.get(code) : undefined;
}
