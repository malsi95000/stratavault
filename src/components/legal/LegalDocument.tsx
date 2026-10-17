import Link from "next/link";
import type { ReactNode } from "react";
import BackLink from "@/components/BackLink";
import SiteFooter from "@/components/SiteFooter";
import PageBackdrop from "@/components/backdrop/PageBackdrop";
import { LEGAL_PAGES, LEGAL_UPDATED_ON, type LegalPageHref } from "@/lib/legal";
import type { SectionLink } from "./LegalSection";
import TableOfContents from "./TableOfContents";
import { paragraph, textLink } from "./prose";

type Props = {
  /** Page affichée (exclue des liens « Voir aussi »). */
  current: LegalPageHref;
  title: string;
  lead: string;
  sections: readonly SectionLink[];
  children: ReactNode;
};

/** Mise en page d'un document légal : retour, titre, date de mise à jour, sommaire, liens croisés. */
export default function LegalDocument({ current, title, lead, sections, children }: Props) {
  const others = LEGAL_PAGES.filter(({ href }) => href !== current);

  return (
    <>
      <PageBackdrop variant="coastlines" />
      <main className="mx-auto max-w-[760px] px-6 pt-8 pb-[70px]">
        <BackLink href="/" label="Retour à l’accueil" />
        <h1 className="brut mt-[30px] mb-3 text-[clamp(28px,5vw,44px)]">{title}</h1>
        <p className="text-[13px] text-mute">Dernière mise à jour : {LEGAL_UPDATED_ON}</p>
        <p className={paragraph}>{lead}</p>
        <TableOfContents sections={sections} />
        {children}
        <nav aria-label="Autres informations légales" className="mt-14 border-t border-line pt-5">
          <p className="text-xs tracking-[.08em] text-mute uppercase">Voir aussi</p>
          <ul className="mt-2 flex list-none flex-wrap gap-x-5 gap-y-1 p-0">
            {others.map(({ href, title: label }) => (
              <li key={href}>
                <Link href={href} className={textLink}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
      <SiteFooter />
    </>
  );
}
