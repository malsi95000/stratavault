// Navigation de l'accueil (ACC-04) : liens du menu fixe et ouverture d'un onglet « En savoir plus »
// depuis ce menu ou depuis l'adresse (/#projection).

/** Onglets dépliables de l'accueil (HomeTabs), dans l'ordre de la page. */
export const HOME_SECTIONS = [
  { id: "apropos", title: "À propos" },
  { id: "projection", title: "Projection" },
  { id: "limites", title: "Limites & futures mises à jour" },
] as const;

export type HomeSectionId = (typeof HOME_SECTIONS)[number]["id"];

export type NavLink = { href: string; label: string };

/** Liens du menu fixe : les onglets de la page (libellés courts), puis l'historique. */
export const NAV_LINKS: readonly NavLink[] = [
  { href: "#apropos", label: "À propos" },
  { href: "#projection", label: "Projection" },
  { href: "#limites", label: "Limites" },
  { href: "/historique", label: "Historique" },
];

/** Accès au compte : l'espace pour une session ouverte, sinon la connexion (qui propose aussi la démo). */
export function accessLink(signedIn: boolean): NavLink {
  return signedIn ? { href: "/espace", label: "Mon espace" } : { href: "/connexion", label: "Connexion" };
}

/** Onglet visé par une ancre (« #projection »), ou null si l'ancre ne désigne pas un onglet. */
export function sectionFromHash(hash: string): HomeSectionId | null {
  const id = hash.startsWith("#") ? hash.slice(1) : hash;
  return HOME_SECTIONS.find((section) => section.id === id)?.id ?? null;
}

/**
 * Événement envoyé par le menu quand on choisit un onglet. Le changement d'ancre ne suffit pas :
 * cliquer deux fois sur « À propos » (après avoir refermé l'onglet) ne change pas l'adresse.
 */
export const OPEN_SECTION_EVENT = "stratavault:open-section";

export function requestSection(id: HomeSectionId): void {
  window.dispatchEvent(new CustomEvent<HomeSectionId>(OPEN_SECTION_EVENT, { detail: id }));
}
