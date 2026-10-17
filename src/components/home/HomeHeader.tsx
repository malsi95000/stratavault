"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import Logo from "@/components/Logo";
import MusicButton from "./MusicButton";
import { NAV_LINKS, requestSection, sectionFromHash, type NavLink } from "./homeNav";
import { useScrolledPast } from "./useScrolledPast";

const navLink =
  "inline-flex min-h-9 items-center rounded px-2.5 text-[13px] tracking-[.06em] text-mute uppercase transition-colors duration-150 hover:bg-hover hover:text-ink";

/** Lien du menu : ancre d'un onglet de la page (qu'il ouvre), ou page de l'application. */
function MenuLink({ link, onFollow, className }: { link: NavLink; onFollow: () => void; className: string }) {
  const section = sectionFromHash(link.href);
  if (!link.href.startsWith("#")) {
    return (
      <Link href={link.href} className={className} onClick={onFollow}>
        {link.label}
      </Link>
    );
  }
  return (
    <a
      href={link.href}
      className={className}
      onClick={() => {
        if (section) requestSection(section);
        onFollow();
      }}
    >
      {link.label}
    </a>
  );
}

/**
 * Menu fixe de l'accueil (ACC-04) : logo, liens vers les parties de la page, accès au compte et
 * musique. Transparent sur l'écran titre, il prend un fond presque opaque dès que la page
 * défile (sans flou d'arrière-plan, coûteux à chaque image du défilement). Sous 768 px, les
 * liens passent dans un menu déroulant (Échap le referme).
 */
export default function HomeHeader({ access }: { access: NavLink }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const scrolled = useScrolledPast(sentinel);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  const closeMenu = () => setMenuOpen(false);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape" || !menuOpen) return;
    setMenuOpen(false);
    toggle.current?.focus();
  }

  return (
    <>
      {/* Repère du haut de page : quand il sort de l'écran, le menu prend son fond. */}
      <div ref={sentinel} aria-hidden="true" className="pointer-events-none absolute top-0 left-0 h-12 w-px" />
      {/* data-home-header : réserve la hauteur du menu au défilement (scroll-padding, globals.css). */}
      <header
        data-home-header=""
        data-solid={scrolled || menuOpen}
        onKeyDown={onKeyDown}
        className="fixed inset-x-0 top-0 z-20 border-b border-transparent transition-colors duration-200 motion-reduce:transition-none data-[solid=true]:border-line data-[solid=true]:bg-header"
      >
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
          <a href="#accueil" className="mr-auto flex min-h-9 items-center gap-2 text-ink" onClick={closeMenu}>
            <Logo className="h-7 w-auto text-acc" />
            <span className="brut text-[19px] tracking-[.04em] max-sm:sr-only">Stratavault</span>
          </a>
          <nav aria-label="Menu principal" className="max-md:hidden">
            <ul className="m-0 flex list-none items-center gap-0.5 p-0">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <MenuLink link={link} onFollow={closeMenu} className={navLink} />
                </li>
              ))}
            </ul>
          </nav>
          <Link
            href={access.href}
            className="inline-flex min-h-9 shrink-0 items-center rounded border border-ink px-3 text-[13px] tracking-[.04em] text-ink uppercase transition-colors duration-150 hover:border-acc hover:bg-acc hover:text-on-acc"
          >
            {access.label}
          </Link>
          <MusicButton />
          <button
            ref={toggle}
            type="button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
            className="grid size-9 shrink-0 place-items-center rounded border border-line text-ink md:hidden"
          >
            {menuOpen ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}
          </button>
        </div>
        <nav id={menuId} aria-label="Menu principal" hidden={!menuOpen} className="border-t border-line md:hidden">
          <ul className="m-0 grid list-none gap-0.5 px-4 py-2 sm:px-6">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <MenuLink link={link} onFollow={closeMenu} className={`${navLink} w-full`} />
              </li>
            ))}
          </ul>
        </nav>
      </header>
    </>
  );
}
