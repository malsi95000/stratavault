import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ConditionsPage from "@/app/conditions/page";
import ConfidentialitePage from "@/app/confidentialite/page";
import CookiesPage from "@/app/cookies/page";
import MentionsLegalesPage from "@/app/mentions-legales/page";
import SiteFooter from "@/components/SiteFooter";
import { BREACH_GROUNDS, GROUND_LABELS } from "@/features/collective/decisionGrounds";
import { REPORT_ILLEGAL_HINT, REPORT_REASON_LABELS } from "@/features/collective/messages";
import { COLLECTIVE_WARNING } from "@/features/collective/warning";
import { ACCOUNT_EXPORT_NOTE } from "@/features/account/exportData";
import { MODERATION_TITLE, PROCESSINGS } from "@/features/legal/processing";
import { STORAGE_INVENTORY } from "@/features/legal/storageInventory";
import {
  CNIL,
  CONTACT_EMAIL,
  CONTACT_LANGUAGES,
  DATA_PROVIDER,
  DSA,
  HOST,
  HOST_FUNCTION_LOCATION,
  LEGAL_PAGES,
  LCEN,
  LEGAL_UPDATED_ON,
  PUBLISHER,
} from "@/lib/legal";
import { APP_VERSION } from "@/lib/version";
import { ROOT, routeExists, sourceFiles } from "@/test/sourceFiles";

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
    // L'article 6 ne vise plus que les services intermédiaires : il n'apparaît que pour l'hébergement des contenus des membres.
    const editor = html.slice(html.indexOf('id="editeur"'), html.indexOf('id="signalement"'));
    expect(editor).not.toMatch(/article 6(?![0-9])/);
    const hosting = html.slice(html.indexOf('id="signalement"'), html.indexOf('id="propriete"'));
    expect(hosting).toMatch(/article 6(?![0-9])/);
    expect(hosting).toContain(escaped(DSA.name));
  });

  it("les mentions légales donnent le point de contact et la façon de signaler un contenu illicite", () => {
    const html = render(MentionsLegalesPage);
    const hosting = html.slice(html.indexOf('id="signalement"'), html.indexOf('id="propriete"'));
    for (const value of [CONTACT_EMAIL, CONTACT_LANGUAGES, DSA.coordinator, LCEN.abusiveNoticePenalty]) {
      expect(hosting).toContain(escaped(value));
    }
    // Point de contact des autorités : une langue officielle de l'État d'établissement et une langue
    // largement comprise dans l'Union (DSA, art. 11, paragraphe 3).
    expect(CONTACT_LANGUAGES).toContain("français");
    expect(CONTACT_LANGUAGES).toContain("anglais");
    // Éléments d'une notification (DSA, art. 16, paragraphe 2).
    for (const element of ["raisons", "où il se trouve", "nom et adresse e-mail", "de bonne foi"]) expect(hosting).toContain(element);
    expect(hrefs(hosting)).toContain("/conditions#signalement");
    expect(render(ConditionsPage)).toContain('id="signalement"');
    // Signalement dans l'application : un compte n'a pas de nom (art. 16.2.c) ; les textes ne disent pas le contraire.
    expect(hosting).toContain("mais pas à son nom");
    expect(hosting).not.toContain("vaut notification");
    expect(render(ConditionsPage)).not.toContain("votre compte vous identifie");
    expect(REPORT_ILLEGAL_HINT).toContain("pas votre nom");
  });

  it("énonce la condition de l'article 1-1, II sans affirmer qu'elle est remplie", () => {
    const html = render(MentionsLegalesPage);
    expect(html).toContain(`sous réserve d’avoir communiqué à celui-ci ses éléments d’identification personnelle (${LCEN.personalIdentification})`);
    expect(html).toContain("publie son nom, mais ni son domicile ni son numéro de téléphone");
    expect(html).not.toMatch(/qui a communiqué|a (?:déjà )?(?:communiqué|transmis)|ont été (?:communiqués|transmis)/);
  });

  it("les CGU donnent comme motifs de retrait chaque motif de signalement et chaque règle des décisions de modération", () => {
    const terms = render(ConditionsPage).toLowerCase();
    for (const [reason, label] of Object.entries(REPORT_REASON_LABELS)) {
      if (reason !== "other") expect(terms, reason).toContain(escaped(label.toLowerCase()));
    }
    // Liste des « Motifs de retrait » : celle que le modérateur choisit comme règle en cause.
    const grounds = terms.slice(terms.indexOf("motifs de retrait."), terms.indexOf("mesures possibles."));
    for (const ground of BREACH_GROUNDS) expect(grounds, ground).toContain(escaped(GROUND_LABELS[ground].toLowerCase()));
    // Les règles de l'avertissement d'entrée sont celles des CGU.
    expect(COLLECTIVE_WARNING.paragraphs.join(" ")).toContain("information manifestement fausse");
  });

  it("la page cookies liste tout l'inventaire", () => {
    const html = render(CookiesPage);
    for (const item of STORAGE_INVENTORY) expect(html).toContain(escaped(item.name));
  });

  it("la page cookies ne dit pas que les cartes partagées du compte restent hors du navigateur", () => {
    // La carte en cours du compte, même partagée, est copiée dans stratavault-u-<id> (Editor.tsx
    // la recharge avant de basculer vers l'éditeur coopératif).
    const text = render(CookiesPage).replace(/\s+/g, " ");
    expect(text).not.toContain("La carte collective et les cartes partagées ne sont pas enregistrées");
    expect(text).toContain("les cartes d’autres membres ouvertes dans l’éditeur coopératif, ne sont pas enregistrées dans le navigateur");
    expect(text).toContain("la carte en cours de votre compte, partagée ou non, l’est");
    expect(STORAGE_INVENTORY.some((item) => item.name === "stratavault-u-<identifiant du compte>")).toBe(true);
  });

  it("le traitement du partage reprend la règle de la page cookies sur le navigateur", () => {
    const partage = PROCESSINGS.find((p) => p.id === "partage");
    expect(partage?.location).toContain("Seule la carte d’un autre membre, ouverte dans l’éditeur coopératif, n’est pas enregistrée");
    expect(partage?.location).toContain("la carte en cours de votre compte, partagée ou non, l’est");
    expect(partage?.retention).toContain("cas limite");
    const registre = readFileSync(join(ROOT, "docs", "registre-traitements.md"), "utf8");
    expect(registre).toContain("la carte en cours de son propre compte, partagée ou non, l’est");
    expect(registre).toContain("passe désormais lui aussi par l’éditeur coopératif");
  });

  it("les signalements visant le compte et les invitations échues sont annoncés comme absents de l'export", () => {
    const text = render(ConfidentialitePage).replace(/\s+/g, " ");
    const registre = readFileSync(join(ROOT, "docs", "registre-traitements.md"), "utf8").replace(/\s+/g, " ");
    const legal = readFileSync(join(ROOT, "docs", "legal.md"), "utf8").replace(/\s+/g, " ");
    for (const source of [text, ACCOUNT_EXPORT_NOTE]) {
      expect(source).toContain("signalements qui visent vos éléments");
      expect(source).toContain("y compris un contenu modifié ou retiré depuis");
      expect(source).toContain("invitations reçues encore valables");
      expect(source).toContain("en attente d’effacement,");
    }
    for (const source of [registre, legal]) {
      expect(source).toContain("collective_report_copies`, y compris le contenu modifié ou retiré depuis");
    }
    expect(legal).toContain("from public.collective_reports as r");
    expect(legal).toContain("**Information des comptes**");
    expect(legal).toContain("collective_reports_illegal_details");
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

describe("textes de la bêta 2.1 (signalement, modération, mineurs)", () => {
  const terms = () => render(ConditionsPage);
  const privacy = () => render(ConfidentialitePage);
  const byId = (id: string) => PROCESSINGS.find((p) => p.id === id);

  it("un signalement par e-mail sans nom reçoit quand même l'accusé de réception et la décision", () => {
    const provision = byId("contact")?.provision ?? "";
    expect(provision).not.toContain("ni accusé de réception");
    expect(provision).toContain("sans nom, il est quand même examiné");
    expect(terms()).toContain("même si votre message ne comporte pas votre nom");
    expect(render(MentionsLegalesPage)).toContain("même si son message ne comporte pas son nom");
  });

  it("la modération des profils, des cartes partagées et des comptes est un traitement décrit", () => {
    const moderation = byId("moderation");
    expect(moderation?.title).toBe(MODERATION_TITLE);
    expect(moderation?.legalBasis).toContain("point f)");
    expect(moderation?.legalBasis).toContain("point c)");
    expect(moderation?.retention).toContain("un an");
    for (const id of ["compte", "profil", "partage"]) expect(byId(id)?.purpose, id).toContain(MODERATION_TITLE);
    expect(privacy()).toContain(escaped(MODERATION_TITLE));
  });

  it("le droit d'opposition est limité à la part fondée sur l'intérêt légitime", () => {
    const html = privacy();
    expect(html).toContain("pour leur part fondée sur l’intérêt légitime");
    expect(html).toContain("Le droit d’opposition ne s’applique pas à ce qui repose sur une obligation légale");
  });

  it("un élément masqué reste visible de son auteur ; la décision manque si l'auteur supprime son compte", () => {
    const html = terms();
    expect(html).not.toContain("plus visible que des modérateurs");
    expect(html).toContain("seuls son auteur et les modérateurs le voient encore");
    expect(html).toContain("Si l’auteur supprime son compte avant la décision");
    expect(byId("collective")?.recipients).toContain("si l’auteur supprime son compte avant la décision");
  });

  it("les règles de forme ne prétendent pas valoir pour les cartes partagées", () => {
    const html = terms();
    expect(html).not.toContain("refusés dans tous les textes");
    expect(html).toContain("pas dans le nom ni le contenu des cartes, partagées ou non");
  });

  it("mineurs : un parent peut demander la suspension ou la suppression du compte ; changements annoncés à l'avance", () => {
    expect(terms()).toContain("la suspension ou la suppression du compte d’un mineur de moins de");
    expect(privacy()).toContain("la suspension ou la suppression du compte d’un mineur de moins de");
    expect(terms()).toContain("informés à l’avance par e-mail");
  });

  it("les avatars ne sont pas présentés comme stockés dans la région vérifiée de la base", () => {
    expect(DATA_PROVIDER.avatarStorage).toContain("ne confirme pas expressément");
    expect(render(MentionsLegalesPage)).toContain(DATA_PROVIDER.avatarStorage);
    expect(byId("profil")?.location).toContain(DATA_PROVIDER.avatarStorage);
  });

  it("le registre porte la même date de mise à jour que les pages légales", () => {
    const registre = readFileSync(join(ROOT, "docs", "registre-traitements.md"), "utf8");
    expect(registre).toContain(`Dernière mise à jour : ${LEGAL_UPDATED_ON}.`);
  });
});
