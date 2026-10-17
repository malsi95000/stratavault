"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HOME_SECTIONS, type HomeSectionId } from "./homeNav";
import Reveal from "./Reveal";
import { staggerDelay } from "./revealState";
import { watchSectionRequests, whenPanelOpened } from "./sectionRequests";

// Texte de chaque onglet (titres et ancres : HOME_SECTIONS, partagés avec le menu fixe).
const TEXTS: Record<HomeSectionId, string> = {
  apropos: "Ce service a été créé par Léo Velard, étudiant en deuxième année à Sciences Po, au campus de Menton, à la suite d’une révélation. En effet, si la géopolitique permet de comprendre l’influence des territoires sur les intérêts étatiques, si les cultures politiques et l’étude des régimes permettent d’aborder les comportements des sociétés entre elles, ces différentes approches sont trop rarement mises en relation, ce qui empêche de révéler tout le spectre des relations internationales. Telle est la tragédie : approche libérale, réaliste, constructiviste… politique comparée, relations internationales, histoire, géographie, théories politiques appliquées… Autant d’approches et de disciplines qui sont ici conciliées en un seul espace, au creux de votre coffre-fort personnel, qui organise les vastes quantités de données indispensables à la compréhension de notre monde.",
  projection: "Par ailleurs, deux vues sont proposées dans l’éditeur : le planisphère, en projection Winkel Tripel, utilisée notamment par le National Geographic, et le globe, en projection orthographique, que l’on fait tourner au glisser.",
  limites: "Toutefois, l’approche de cette cartographie reste pour le moment trop stato-centrée, malgré l’attention portée au développement de nouvelles fonctionnalités pour une représentation plus fine des enjeux gravitant autour des acteurs non étatiques. À l’avenir, il sera possible de télécharger de larges bases de données directement dans vos cartes stratégiques, et de modifier ou annoter la frontière elle-même — qui ne doit pas être le simple support de notre analyse, mais doit pleinement l’intégrer.",
};

const PAGES = [
  { href: "/historique", title: "Historique des mises à jour" },
  { href: "/connexion", title: "Accéder à mon espace stratégique" },
];

const row =
  "group flex w-full cursor-pointer items-center justify-between rounded px-1 py-[22px] text-left text-[clamp(18px,2.6vw,26px)] text-ink transition-colors duration-150 hover:bg-hover";

// Petit espace sous le menu fixe quand on arrive sur un onglet par son ancre (la hauteur du menu
// est déjà réservée par scroll-padding : voir globals.css).
const anchorOffset = "scroll-mt-4";

/** Demande d'ouverture venue du menu ou de l'adresse : un nouvel objet à chaque demande. */
type SectionRequest = { id: HomeSectionId };

export default function HomeTabs() {
  const [open, setOpen] = useState<HomeSectionId | null>(null);
  const [request, setRequest] = useState<SectionRequest | null>(null);

  // Ouverture depuis le menu fixe ou l'adresse (/#projection), y compris au chargement.
  useEffect(
    () =>
      watchSectionRequests(window, (id) => {
        setOpen(id);
        setRequest({ id });
      }),
    [],
  );

  // Une fois l'onglet demandé déplié, la page se recale sur son titre (l'ancre visée au clic ne
  // pouvait pas encore être atteinte). Défilement fluide ou non : celui de la page (layout.tsx).
  useEffect(() => {
    if (!request) return;
    const panel = document.getElementById(`tab-${request.id}`);
    const target = document.getElementById(request.id);
    if (!panel || !target) return;
    const animated = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return whenPanelOpened(panel, animated, () => target.scrollIntoView({ block: "start" }));
  }, [request]);

  return (
    <div id="faq" className={`relative z-1 mx-auto max-w-[840px] px-6 pb-[90px] ${anchorOffset}`}>
      {HOME_SECTIONS.map(({ id, title }, index) => {
        const isOpen = open === id;
        return (
          <Reveal key={id} id={id} delay={staggerDelay(index)} className={`border-t border-line ${anchorOffset}`}>
            <button
              type="button"
              className={row}
              aria-expanded={isOpen}
              aria-controls={`tab-${id}`}
              onClick={() => setOpen(isOpen ? null : id)}
            >
              <span className="brut tracking-[.02em]">{title}</span>
              <span
                aria-hidden="true"
                className={`text-[26px] text-mute transition-transform duration-200 motion-reduce:transition-none ${isOpen ? "rotate-45" : ""}`}
              >
                +
              </span>
            </button>
            <div
              id={`tab-${id}`}
              inert={!isOpen}
              className={`overflow-hidden transition-[max-height] duration-250 ease-in-out motion-reduce:transition-none ${isOpen ? "max-h-[600px]" : "max-h-0"}`}
            >
              <p className="mx-1 mb-[22px] max-w-[68ch] text-mute">{TEXTS[id]}</p>
            </div>
          </Reveal>
        );
      })}
      {PAGES.map(({ href, title }, index) => (
        <Reveal key={href} delay={staggerDelay(HOME_SECTIONS.length + index)} className="border-t border-line last:border-b">
          <Link href={href} className={row}>
            <span className="brut tracking-[.02em]">{title}</span>
            <span
              aria-hidden="true"
              className="text-[26px] text-mute transition-[translate,color] duration-200 group-hover:translate-x-1.5 group-hover:text-acc group-focus-visible:translate-x-1.5 motion-reduce:transition-none"
            >
              →
            </span>
          </Link>
        </Reveal>
      ))}
    </div>
  );
}
