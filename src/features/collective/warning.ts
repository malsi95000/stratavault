// Avertissement de la carte collective (COM-02), affiché à l'entrée et rappelable depuis la barre du
// haut ; sa phrase courte (`short`) est reprise dans la section « Carte collective » de l'espace.
// TEXTE PROVISOIRE, neutre, à remplacer par le texte définitif : c'est le seul endroit où il est écrit.

export const COLLECTIVE_WARNING = {
  title: "Avant d’entrer dans la carte collective",
  /** Résumé repris hors de la carte (espace). */
  short:
    "Les contenus publiés par la communauté ne sont ni vérifiés ni approuvés par l’éditeur du service ; tout membre peut signaler un élément aux modérateurs.",
  paragraphs: [
    "La carte collective est publiée par la communauté : chaque élément est ajouté par un membre et signé de son nom affiché et de son identifiant public (@…). Ces contenus ne sont ni vérifiés ni approuvés par l’éditeur du service ; ils n’engagent que leurs auteurs.",
    "Règles de publication : respectez la loi et les personnes. Pas de contenu illicite, haineux, violent ou diffamatoire, pas de harcèlement, pas de données personnelles d’autrui, pas d’information manifestement fausse présentée comme vraie, pas de publicité. Citez vos sources quand vous le pouvez.",
    "Tout membre peut signaler un élément depuis sa fiche. Les modérateurs peuvent masquer ou supprimer un élément contraire à ces règles, et suspendre les contributions de son auteur ; il en est informé, avec le motif.",
    "Ce que vous ajoutez est visible par tous les membres connectés, avec votre nom affiché et votre identifiant public, même si votre profil n’est visible que de vos contacts.",
  ],
  accept: "J’ai compris",
} as const;
