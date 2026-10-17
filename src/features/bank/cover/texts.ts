// Textes du choix du logo d'une carte (DIV-01).

export const COVER_LEGEND = "Logo de la carte";
export const COVER_HINT =
  "Une icône et sa couleur, ou un aperçu de la carte : il s’affiche dans « Mon espace stratégique ».";
export const PREVIEW_LOADING = "Préparation de l’aperçu…";
export const PREVIEW_FAILED = "Aperçu impossible pour le moment : vérifiez votre connexion, puis réessayez.";
export const PREVIEW_UNREADABLE = "Aperçu impossible : cette carte est illisible ou n’existe plus.";
export const PREVIEW_NOTE =
  "L’aperçu montre la carte telle qu’elle est maintenant ; « Actualiser l’aperçu » le refait après vos modifications.";
export const PREVIEW_REFRESH = "Actualiser l’aperçu";

/** Titre du dialogue « Logo » d'une carte de la banque. */
export const coverDialogTitle = (name: string) => `Logo de « ${name} »`;
export const COVER_SAVE_FAILED = "Logo non enregistré : réessayez.";
/** Après « Enregistrer dans la banque » : la carte est enregistrée, mais pas son logo. */
export const COVER_AFTER_SAVE_FAILED =
  "Carte enregistrée, mais son logo n’a pas pu l’être : choisissez-le depuis « Mon espace stratégique ».";
