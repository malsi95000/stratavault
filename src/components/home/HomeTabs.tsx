"use client";

import Link from "next/link";
import { useState } from "react";

const SECTIONS = [
  {
    id: "apropos",
    title: "À propos",
    text: "Ce service a été créé par Léo Velard, étudiant en deuxième année à Sciences Po, au campus de Menton, à la suite d’une révélation. En effet, si la géopolitique permet de comprendre l’influence des territoires sur les intérêts étatiques, si les cultures politiques et l’étude des régimes permettent d’aborder les comportements des sociétés entre elles, ces différentes approches sont trop rarement mises en relation, ce qui empêche de révéler tout le spectre des relations internationales. Telle est la tragédie : approche libérale, réaliste, constructiviste… politique comparée, relations internationales, histoire, géographie, théories politiques appliquées… Autant d’approches et de disciplines qui sont ici conciliées en un seul espace, au creux de votre coffre-fort personnel, qui organise les vastes quantités de données indispensables à la compréhension de notre monde.",
  },
  {
    id: "projection",
    title: "Projection",
    text: "Par ailleurs, deux vues sont proposées dans l’éditeur : le planisphère, en projection Winkel Tripel, utilisée notamment par le National Geographic, et le globe, en projection orthographique, que l’on fait tourner au glisser.",
  },
  {
    id: "limites",
    title: "Limites & futures mises à jour",
    text: "Toutefois, l’approche de cette cartographie reste pour le moment trop stato-centrée, malgré l’attention portée au développement de nouvelles fonctionnalités pour une représentation plus fine des enjeux gravitant autour des acteurs non étatiques. À l’avenir, il sera possible de télécharger de larges bases de données directement dans vos cartes stratégiques, et de modifier ou annoter la frontière elle-même — qui ne doit pas être le simple support de notre analyse, mais doit pleinement l’intégrer.",
  },
];

const PAGES = [
  { href: "/historique", title: "Historique des mises à jour" },
  { href: "/connexion", title: "Accéder à mon espace stratégique" },
];

const row =
  "flex w-full cursor-pointer items-center justify-between rounded px-1 py-[22px] text-left text-[clamp(18px,2.6vw,26px)] text-ink transition-colors duration-150 hover:bg-hover";

export default function HomeTabs() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div id="faq" className="relative z-1 mx-auto max-w-[840px] px-6 pb-[90px]">
      {SECTIONS.map(({ id, title, text }) => {
        const isOpen = open === id;
        return (
          <div key={id} className="border-t border-line">
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
                className={`text-[26px] text-mute transition-transform duration-200 ${isOpen ? "rotate-45" : ""}`}
              >
                +
              </span>
            </button>
            <div
              id={`tab-${id}`}
              inert={!isOpen}
              className={`overflow-hidden transition-[max-height] duration-250 ease-in-out motion-reduce:transition-none ${isOpen ? "max-h-[600px]" : "max-h-0"}`}
            >
              <p className="mx-1 mb-[22px] max-w-[68ch] text-mute">{text}</p>
            </div>
          </div>
        );
      })}
      {PAGES.map(({ href, title }) => (
        <div key={href} className="border-t border-line last:border-b">
          <Link href={href} className={row}>
            <span className="brut tracking-[.02em]">{title}</span>
            <span aria-hidden="true" className="text-[26px] text-mute">
              →
            </span>
          </Link>
        </div>
      ))}
    </div>
  );
}
