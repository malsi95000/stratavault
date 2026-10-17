import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEMO_COOKIE } from "@/lib/supabase/cookies";
import { ROOT, routeExists } from "@/test/sourceFiles";
import HomeHeader from "./HomeHeader";
import HomeTabs from "./HomeTabs";
import { HOME_SECTIONS, NAV_LINKS, accessLink, sectionFromHash } from "./homeNav";
import Reveal from "./Reveal";
import { initialReveal, staggerDelay } from "./revealState";
import { mayHaveSpace } from "./sessionHint";

const source = (path: string) => readFileSync(join(ROOT, path), "utf8");
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

describe("menu fixe de l'accueil", () => {
  it("mène aux onglets de la page et à des pages existantes", () => {
    const ids = HOME_SECTIONS.map((section) => `#${section.id}`);
    for (const { href } of NAV_LINKS) {
      if (href.startsWith("#")) expect(ids).toContain(href);
      else expect(routeExists(href), href).toBe(true);
    }
  });

  it("propose l'espace à une session ouverte, la connexion sinon", () => {
    expect(accessLink(true)).toEqual({ href: "/espace", label: "Mon espace" });
    expect(accessLink(false)).toEqual({ href: "/connexion", label: "Connexion" });
  });

  it("devine une session ou une démo ouverte à partir des seuls cookies", () => {
    expect(mayHaveSpace([])).toBe(false);
    expect(mayHaveSpace([{ name: "sb-abc-auth-token", value: "base64-x" }])).toBe(true);
    expect(mayHaveSpace([{ name: "sb-abc-auth-token.0", value: "base64-x" }])).toBe(true);
    expect(mayHaveSpace([{ name: DEMO_COOKIE, value: "1" }])).toBe(true);
    // Vérificateur PKCE (connexion pas encore faite), cookie vidé, démo désactivée, cookie étranger.
    expect(mayHaveSpace([{ name: "sb-abc-auth-token-code-verifier", value: "x" }])).toBe(false);
    expect(mayHaveSpace([{ name: "sb-abc-auth-token", value: "" }])).toBe(false);
    expect(mayHaveSpace([{ name: DEMO_COOKIE, value: "0" }])).toBe(false);
    expect(mayHaveSpace([{ name: "autre", value: "1" }])).toBe(false);
  });

  it("n'appelle pas Supabase pour afficher l'accueil", () => {
    const page = source("src/app/page.tsx");
    expect(page).toContain("accessLink(mayHaveSpace((await cookies()).getAll()))");
    expect(page).not.toMatch(/checkCurrentUser|checkActiveUser|getPageSession|createClient/);
  });

  it("reconnaît l'onglet visé par une ancre", () => {
    expect(sectionFromHash("#projection")).toBe("projection");
    expect(sectionFromHash("limites")).toBe("limites");
    expect(sectionFromHash("#faq")).toBeNull();
    expect(sectionFromHash("")).toBeNull();
  });

  it("affiche logo, liens, accès au compte, musique et menu mobile accessible", () => {
    const html = renderToStaticMarkup(createElement(HomeHeader, { access: accessLink(false) }));
    expect(html).toMatch(/<header[^>]*class="fixed inset-x-0 top-0/);
    expect(html).toContain('aria-label="Menu principal"');
    const links = hrefs(html);
    expect(links[0]).toBe("#accueil");
    for (const { href } of NAV_LINKS) expect(links.filter((h) => h === href), href).toHaveLength(2);
    expect(links).toContain("/connexion");
    expect(html).toContain('aria-label="Musique"');
    // Menu mobile : fermé au départ, relié à son bouton.
    const controls = /aria-controls="([^"]+)"/.exec(html)?.[1];
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(`id="${controls}"`);
    expect(html).toMatch(new RegExp(`<nav id="${controls}"[^>]* hidden=""`));
  });

  it("réserve sa hauteur au défilement et se passe de flou d'arrière-plan", () => {
    const html = renderToStaticMarkup(createElement(HomeHeader, { access: accessLink(true) }));
    expect(html).toContain('href="/espace"');
    expect(html).toMatch(/<header data-home-header=""/);
    expect(html).not.toContain("backdrop-blur");
    // Ni l'ancre ni l'élément qui a le focus ne passent sous le menu fixe (h-14 = 3.5rem).
    expect(source("src/app/globals.css")).toMatch(/html:has\(\[data-home-header\]\) \{\s*scroll-padding-top: 4rem;/);
  });

  it("remplace le bouton de musique flottant de la bêta 2.0", () => {
    expect(source("src/components/home/MusicButton.tsx")).not.toMatch(/\bfixed\b/);
    const page = source("src/app/page.tsx");
    expect(page).toContain("<HomeHeader access={access} />");
    expect(page).not.toContain("<MusicButton");
    expect(page).toContain('id="accueil"');
  });
});

describe("onglets de l'accueil", () => {
  it("portent l'ancre visée par le menu, avec une marge sous le menu fixe", () => {
    const html = renderToStaticMarkup(createElement(HomeTabs));
    for (const { id, title } of HOME_SECTIONS) {
      expect(html).toMatch(new RegExp(`<div id="${id}"[^>]* class="[^"]*scroll-mt-4`));
      expect(html).toContain(title.replace("&", "&amp;"));
    }
    expect(html).toContain('id="faq"');
  });
});

describe("animations de l'accueil", () => {
  it("ne cachent un bloc que s'il est sous l'écran, et jamais si les animations sont réduites", () => {
    expect(initialReveal(900, 800, false)).toBe("hidden");
    expect(initialReveal(500, 800, false)).toBe("shown");
    expect(initialReveal(-200, 800, false)).toBe("shown");
    expect(initialReveal(900, 800, true)).toBe("shown");
  });

  it("apparaissent en cascade bornée", () => {
    expect([0, 1, 2, 3].map((i) => staggerDelay(i))).toEqual([0, 70, 140, 210]);
    expect(staggerDelay(20)).toBe(350);
    expect(staggerDelay(-1)).toBe(0);
  });

  it("sont toutes coupées quand l'appareil demande de réduire les animations", () => {
    const files = ["src/app/page.tsx", "src/components/home/HomeHeader.tsx", "src/components/home/HomeTabs.tsx", "src/components/home/Reveal.tsx", "src/components/home/MusicButton.tsx"];
    // Toutes les chaînes du fichier (entre guillemets ou gabarits), où qu'elles soient : className,
    // cn(…), constantes. Seule une transition de couleur (transition-colors) peut rester.
    const animated = /(^|\s)(?:[\w-]+:)*animate-(?!none\b)/;
    const moving = /(^|\s)(?:[\w-]+:)*transition(?:-\[[^\]]*\]|-transform|-all)?(?=\s|$)/;
    expect(moving.test("text-mute transition-transform duration-200 ${x}")).toBe(true);
    expect(moving.test("transition-[opacity,translate] duration-700")).toBe(true);
    expect(moving.test("transition-colors duration-150 motion-reduce:transition-none")).toBe(false);
    let checked = 0;
    for (const path of files) {
      for (const match of source(path).matchAll(/"([^"\n]*)"|`([^`]*)`/g)) {
        const text = match[1] ?? match[2];
        if (animated.test(text)) expect(text, path).toContain("motion-reduce:animate-none");
        if (moving.test(text)) expect(text, path).toContain("motion-reduce:transition-none");
        if (animated.test(text) || moving.test(text)) checked++;
      }
    }
    // Garde-fou : le balayage voit bien les chaînes animées (titre, logo, boutons, flèches, Reveal, onglets…).
    expect(checked).toBeGreaterThanOrEqual(9);
    // Égaliseur de la musique : figé (barres à mi-hauteur) pendant la lecture.
    expect(source("src/components/home/MusicButton.tsx")).toContain('"animate-eq motion-reduce:h-2 motion-reduce:animate-none"');
    const reveal = source("src/components/home/Reveal.tsx");
    expect(reveal).toContain("prefers-reduced-motion: reduce");
  });

  it("rendent au titre son ombre rouge entière, pendant et après l'animation", () => {
    const css = source("src/app/globals.css");
    // « backwards » : le découpage ne reste pas posé sur le h1 une fois l'animation finie.
    expect(css).toMatch(/--animate-title-in: title-in [^;]* backwards;/);
    const frames = /@keyframes title-in \{([\s\S]*?)\n {2}\}/.exec(css)?.[1] ?? "";
    // Le découpage final déborde de la boîte : l'ombre (.04em) et le bas des lettres ne sont pas rognés.
    for (const step of ["55%", "100%"]) expect(frames).toMatch(new RegExp(`${step} \\{[^}]*clip-path: inset\\(-0\\.2em\\)`));
    expect(frames).not.toContain("inset(0 0 0 0)");
  });

  it("ne cachent jamais un bloc qui a le focus, ni à l'impression", () => {
    const html = renderToStaticMarkup(createElement(Reveal, null, "Bloc"));
    for (const name of ["focus-within:opacity-100!", "focus-within:translate-none!", "focus-within:transition-none", "print:opacity-100!", "print:translate-none!"]) {
      expect(html).toContain(name);
    }
    expect(source("src/components/home/Reveal.tsx")).toContain('element.addEventListener("focusin", show)');
  });

  it("utilisent des animations définies dans globals.css", () => {
    const css = source("src/app/globals.css");
    for (const name of ["title-in", "logo-in", "rise"]) {
      expect(css).toContain(`--animate-${name}: ${name} `);
      expect(css).toContain(`@keyframes ${name} {`);
    }
  });
});
