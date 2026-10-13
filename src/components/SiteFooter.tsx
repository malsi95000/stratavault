import Link from "next/link";
import { CONTACT_MAILTO, LEGAL_PAGES, PUBLISHER } from "@/lib/legal";
import { APP_VERSION } from "@/lib/version";

// Zone cliquable d'au moins 24 px de haut (WCAG 2.5.8), sans changer l'aspect du texte.
const link = "inline-flex min-h-6 items-center underline-offset-3 transition-colors duration-150 hover:text-ink hover:underline";

/** Pied de page commun (style de l'accueil de la bêta) : projet, version, pages légales, contact. */
export default function SiteFooter() {
  return (
    <footer className="relative z-1 mx-auto flex max-w-[840px] flex-wrap items-center justify-between gap-x-[18px] gap-y-2 border-t border-line px-6 pt-[18px] pb-7 text-[12.5px] text-mute">
      <span className="brut tracking-[.03em] text-ink">Stratavault</span>
      <span className="rounded-[10px] border border-line px-2 py-px text-[11px] tracking-[.04em]">{APP_VERSION}</span>
      <span>{PUBLISHER.footer}</span>
      <nav aria-label="Informations légales" className="basis-full">
        <ul className="m-0 flex list-none flex-wrap gap-x-[18px] gap-y-0.5 p-0">
          {LEGAL_PAGES.map(({ href, title }) => (
            <li key={href}>
              <Link href={href} className={link}>
                {title}
              </Link>
            </li>
          ))}
          <li>
            <a href={CONTACT_MAILTO} className={link}>
              Contact
            </a>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
