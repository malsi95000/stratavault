import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ConditionsPage from "@/app/conditions/page";
import ConfidentialitePage from "@/app/confidentialite/page";
import CookiesPage from "@/app/cookies/page";
import MentionsLegalesPage from "@/app/mentions-legales/page";
import SiteFooter from "@/components/SiteFooter";
import { PROCESSINGS } from "@/features/legal/processing";
import { STORAGE_INVENTORY } from "@/features/legal/storageInventory";
import {
  CNIL,
  CONTACT_EMAIL,
  DATA_PROVIDER,
  HOST,
  HOST_FUNCTION_LOCATION,
  LEGAL_PAGES,
  LCEN,
  LEGAL_UPDATED_ON,
  PUBLISHER,
} from "@/lib/legal";
import { APP_VERSION } from "@/lib/version";
import { routeExists, sourceFiles } from "@/test/sourceFiles";

const render = (component: ComponentType) => renderToStaticMarkup(createElement(component));

const PAGES = {
  "/mentions-legales": MentionsLegalesPage,
  "/confidentialite": ConfidentialitePage,
  "/cookies": CookiesPage,
  "/conditions": ConditionsPage,
} as const;

/** Texte HTML échappé comme le fait React (pour chercher une valeur dans le rendu). */
const escaped = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replaceAll("&amp;", "&"));

describe("pied de page commun", () => {
  const html = render(SiteFooter);

  it("donne les quatre pages légales, le contact et la version", () => {
    const links = hrefs(html);
    expect(links).toEqual([...LEGAL_PAGES.map((page) => page.href), `mailto:${CONTACT_EMAIL}`]);
    expect(html).toContain(APP_VERSION);
  });

  it("chaque lien interne mène à une page existante", () => {
    for (const href of hrefs(html).filter((h) => h.startsWith("/"))) expect(routeExists(href), href).toBe(true);
  });

  it("est présent sur les pages prévues, mais pas dans l'éditeur plein écran", () => {
    const files = new Map(sourceFiles().map((file) => [file.path, file.text]));
    const withFooter = [
      "src/app/page.tsx",
      "src/app/historique/page.tsx",
      "src/app/espace/page.tsx",
      "src/app/compte/page.tsx",
      // Connexion, inscription, mots de passe, confirmation : toutes rendues dans AuthCard.
      "src/components/auth/AuthCard.tsx",
      "src/components/legal/LegalDocument.tsx",
    ];
    for (const path of withFooter) expect(files.get(path), path).toContain("<SiteFooter />");
    for (const path of ["src/app/connexion/page.tsx", "src/app/inscription/page.tsx", "src/app/mot-de-passe-oublie/page.tsx", "src/app/nouveau-mot-de-passe/page.tsx"]) {
      expect(files.get(path), path).toContain("<AuthCard");
    }
    expect(files.get("src/app/carte/page.tsx")).not.toContain("SiteFooter");
    expect(files.get("src/app/page.tsx")).not.toContain("à venir");
  });
});

describe("pages légales", () => {
  it("ont un sommaire dont chaque entrée vise une partie de la page, et la date de mise à jour", () => {
    for (const [href, Page] of Object.entries(PAGES)) {
      const html = render(Page);
      const anchors = hrefs(html).filter((h) => h.startsWith("#"));
      expect(anchors.length, href).toBeGreaterThan(1);
      for (const anchor of anchors) expect(html, `${href} ${anchor}`).toContain(`id="${anchor.slice(1)}"`);
      expect(html).toContain(LEGAL_UPDATED_ON);
    }
  });

  it("ne mènent qu'à des pages existantes, et à toutes les autres pages légales", () => {
    for (const [href, Page] of Object.entries(PAGES)) {
      const links = hrefs(render(Page)).filter((h) => h.startsWith("/"));
      for (const link of links) expect(routeExists(link), `${href} → ${link}`).toBe(true);
      for (const other of LEGAL_PAGES) if (other.href !== href) expect(links, href).toContain(other.href);
    }
  });

  it("les mentions légales reprennent l'éditeur, l'hébergeur et le prestataire de legal.ts", () => {
    const html = render(MentionsLegalesPage);
    for (const value of [PUBLISHER.name, CONTACT_EMAIL, HOST.name, HOST.address, DATA_PROVIDER.name, DATA_PROVIDER.address]) {
      expect(html).toContain(escaped(value));
    }
    // Téléphone non vérifié : signalé, jamais inventé.
    expect(HOST.phone).toBeNull();
    expect(html).toContain("non publié par l’hébergeur");
  });

  it("la confidentialité donne le responsable, le contact et la CNIL", () => {
    const html = render(ConfidentialitePage);
    for (const value of [PUBLISHER.name, CONTACT_EMAIL, CNIL.address, CNIL.complaint]) expect(html).toContain(escaped(value));
  });

  it("la confidentialité donne les garanties des transferts et les listes de sous-traitants", () => {
    const links = hrefs(render(ConfidentialitePage));
    for (const href of [HOST.subprocessors, HOST.terms, HOST.privacyPolicy, DATA_PROVIDER.dpa, DATA_PROVIDER.subprocessors, DATA_PROVIDER.privacyPolicy]) {
      expect(links).toContain(href);
    }
    // Le DPA de Vercel (et ses clauses contractuelles types) : offre Pro, ou Hobby avec confirmation écrite.
    if (HOST.plan === "pro") expect(HOST.dpaApplies).toBe(true);
    if (HOST.dpaApplies) {
      expect(links).toContain(HOST.dpa);
    } else {
      expect(links).not.toContain(HOST.dpa);
      expect(links).toContain(HOST.dpfList);
      expect(HOST.transfers).not.toContain("clauses contractuelles");
      expect(HOST.transfers).toContain("2023/1795");
    }
  });

  it("la confidentialité présente le droit d'opposition séparément et l'article 22 en entier", () => {
    const html = render(ConfidentialitePage);
    expect(html).toContain("Droit d’opposition.");
    expect(html).toContain("affectant de manière significative de façon similaire");
  });

  it("chaque traitement dit si les données sont obligatoires, et les durées sont précises", () => {
    for (const processing of PROCESSINGS) {
      expect(processing.provision, processing.id).toBeTruthy();
    }
    const contact = PROCESSINGS.find((p) => p.id === "contact");
    expect(contact?.retention).toMatch(/un an après la dernière réponse/);
    // Liens au format par défaut de Supabase : l'IP de la personne lui parvient, ce que la page signale.
    expect(PROCESSINGS.find((p) => p.id === "compte")?.data.join(" ")).toContain("format par défaut de Supabase");
    expect(PROCESSINGS.find((p) => p.id === "journaux")?.data.join(" ")).toContain("format par défaut de Supabase");
  });

  it("conditions et confidentialité s'accordent sur les comptes inactifs et le mode démo", () => {
    const html = render(ConditionsPage);
    expect(html).toContain("ans est supprimé, après un e-mail");
    expect(html).not.toContain("peut être supprimé");
    expect(html).toContain("En mode démo");
    expect(PROCESSINGS.find((p) => p.id === "compte")?.retention).toContain("s’engage à supprimer");
  });

  it("distingue le lieu d'exécution du proxy (toutes les régions) de celui des fonctions", () => {
    for (const id of ["compte", "cartes", "securite"]) {
      const location = PROCESSINGS.find((p) => p.id === id)?.location ?? "";
      expect(location, id).toContain(HOST.proxyLocation);
      expect(location, id).toContain(HOST_FUNCTION_LOCATION);
    }
    expect(HOST.proxyLocation).toContain("toutes les régions");
    expect(PROCESSINGS.find((p) => p.id === "securite")?.location).toContain("celle du proxy");
  });

  it("dit que Vercel utilise les données techniques de trafic pour son propre compte", () => {
    const journaux = PROCESSINGS.find((p) => p.id === "journaux");
    expect(journaux?.retention).toContain(HOST.systemDataClause);
    expect(journaux?.retention).toContain("pour son propre compte");
    expect(journaux?.retention).not.toContain("sécurité, obligations légales");
    expect(journaux?.recipients).toContain("pour son propre compte");
    // Contenu d'une entrée du journal d'audit Auth (doc Supabase : user_id, ip_address, user_agent, metadata).
    const authLine = journaux?.data.find((line) => line.includes("journaux d’authentification")) ?? "";
    expect(authLine).toContain("identifiant du compte");
    expect(authLine).toContain("adresse IP et le navigateur");
    expect(authLine).toContain("le cas échéant, l’adresse e-mail");
    expect(authLine).not.toContain("l’identifiant et l’adresse e-mail du compte");
    // Journaux de la plateforme Supabase (Auth compris) : hors de la base du projet, lieu propre (pas la région de la base).
    expect(journaux?.data.join(" ")).toContain("pas dans la base du projet");
    expect(journaux?.location).toContain(DATA_PROVIDER.logLocation);
    expect(journaux?.location).not.toContain("voir ci-dessus");
    expect(hrefs(render(ConfidentialitePage))).toContain(DATA_PROVIDER.residencyFaq);
  });

  it("distingue la durée des journaux d'authentification Supabase de celle des journaux de l'API et de la base", () => {
    // supabase.com/pricing, consulté le 10 octobre 2026 : « Auth Audit Logs » Free 1 hour ; « Log retention (API & Database) » Free 1 day.
    expect(DATA_PROVIDER.authLogRetention).toContain("1 heure avec l’offre gratuite");
    expect(DATA_PROVIDER.logRetention).toContain("1 jour avec l’offre gratuite");
    const retention = PROCESSINGS.find((p) => p.id === "journaux")?.retention ?? "";
    expect(retention).toContain(`${DATA_PROVIDER.logRetention} pour les journaux de l’API et de la base`);
    expect(retention).toContain(`${DATA_PROVIDER.authLogRetention} pour les journaux d’authentification`);
    expect(render(ConfidentialitePage)).toContain(DATA_PROVIDER.authLogRetention);
    // La FAQ de Supabase ne dit pas « en partie ».
    expect(DATA_PROVIDER.logLocation).not.toContain("en partie");
    expect(DATA_PROVIDER.logLocation).toContain("métadonnées du service sont traités hors de la région du projet");
  });

  it("l'hébergeur est destinataire de tout ce qui passe par le serveur de l'application", () => {
    for (const id of ["compte", "cartes", "securite", "journaux"]) {
      const processing = PROCESSINGS.find((p) => p.id === id);
      expect(processing?.recipients, id).toContain(HOST.name);
      expect(processing?.location, id).toContain(HOST.name);
    }
    // Données obligatoires du compte et conséquence d'un refus (RGPD art. 13.2.e).
    expect(PROCESSINGS.find((p) => p.id === "compte")?.provision).toContain("mode démo");
  });

  it("cite l'article de la LCEN en vigueur (1-1 depuis la loi SREN), et non plus l'ancien article 6", () => {
    const html = render(MentionsLegalesPage);
    expect(html).toContain("article 1-1");
    expect(html).not.toMatch(/article 6(?![0-9])/);
  });

  it("énonce la condition de l'article 1-1, II sans affirmer qu'elle est remplie", () => {
    const html = render(MentionsLegalesPage);
    expect(html).toContain(`sous réserve d’avoir communiqué à celui-ci ses éléments d’identification personnelle (${LCEN.personalIdentification})`);
    expect(html).toContain("publie son nom, mais ni son domicile ni son numéro de téléphone");
    expect(html).not.toMatch(/qui a communiqué|a (?:déjà )?(?:communiqué|transmis)|ont été (?:communiqués|transmis)/);
  });

  it("la page cookies liste tout l'inventaire", () => {
    const html = render(CookiesPage);
    for (const item of STORAGE_INVENTORY) expect(html).toContain(escaped(item.name));
  });

  it("les informations légales ne sont écrites qu'une fois, dans legal.ts", () => {
    const facts = [
      "@gmail.com",
      "Barranca",
      "Covina",
      "Chulia",
      "Fontenoy",
      "Velard",
      "Sciences Po",
      "Menton",
      "eu-west-3",
      "Vercel Inc",
      "Pte. Ltd",
      "2004-575",
      "/legal/dpa",
    ];
    const legalCode = sourceFiles().filter(
      ({ path }) =>
        path !== "src/lib/legal.ts" &&
        (/^src\/app\/(mentions-legales|confidentialite|cookies|conditions)\//.test(path) ||
          path.startsWith("src/components/legal/") ||
          path.startsWith("src/features/legal/") ||
          path === "src/components/SiteFooter.tsx" ||
          path.startsWith("src/components/auth/")),
    );
    expect(legalCode.length).toBeGreaterThan(10);
    for (const { path, text } of legalCode) {
      for (const fact of facts) expect(text.includes(fact), `${path} contient « ${fact} »`).toBe(false);
    }
    // Les liens des formulaires de compte et du pied de page viennent aussi de legal.ts.
    for (const { path, text } of legalCode.filter((f) => !f.path.startsWith("src/app/"))) {
      for (const { href } of LEGAL_PAGES) expect(text.includes(`"${href}"`), `${path} écrit « ${href} »`).toBe(false);
    }
  });
});
