// Informations légales du site : seule source pour les pages légales, le pied de page et les
// mentions des formulaires. Ce qui n'a pas pu être vérifié est listé dans UNVERIFIED (et dans
// docs/legal.md) : rien n'y est inventé. À relire avant toute mise en ligne.

/** Date de dernière mise à jour des textes légaux (affichée sur chaque page légale). */
export const LEGAL_UPDATED_ON = "10 octobre 2026";

const SCHOOL = { name: "Sciences Po", campus: "Menton" } as const;

/**
 * Vrai seulement une fois que l'éditeur a communiqué à l'hébergeur (Vercel) son identité réelle :
 * nom, prénoms, domicile et numéro de téléphone (LCEN art. 1-1, I, 1°), dans les réglages du compte
 * Vercel ou par écrit au support, avec une preuve conservée (docs/legal.md, point 2). C'est la
 * condition de l'art. 1-1, II pour ne pas publier son domicile ni son téléphone : la mise en
 * production est bloquée tant qu'il est faux (src/lib/legalReadiness.ts). Rien ne le vérifie
 * automatiquement : ne le passer à true qu'après l'avoir fait.
 */
const PUBLISHER_IDENTIFIED_TO_HOST = false;

/** Éditeur et directeur de la publication (personne physique, aucune société). */
export const PUBLISHER = {
  name: "Léo Velard",
  description: `personne physique, étudiant à ${SCHOOL.name} (campus de ${SCHOOL.campus})`,
  project: "projet étudiant indépendant, non commercial et gratuit",
  /** Mention courte du pied de page. */
  footer: `Projet étudiant indépendant — ${SCHOOL.name}, campus de ${SCHOOL.campus}`,
  /** Identité communiquée à l'hébergeur (LCEN art. 1-1, II) : déclaration de l'éditeur, voir PUBLISHER_IDENTIFIED_TO_HOST. */
  identifiedToHost: PUBLISHER_IDENTIFIED_TO_HOST,
} as const;

/** Texte qui fixe les mentions d'identification de l'éditeur (LCEN, rédaction issue de la loi SREN). */
export const LCEN = {
  name: "loi n° 2004-575 du 21 juin 2004 pour la confiance dans l’économie numérique (LCEN)",
  amendedBy: "loi n° 2024-449 du 21 mai 2024 (SREN)",
  /** Mentions de l'éditeur (I) ; éditeur non professionnel (II). Article 48 de la loi SREN, vérifié sur Légifrance. */
  publisherArticle: "article 1-1",
  /** Éléments d'identification d'une personne physique (art. 1-1, I, 1°), à communiquer à l'hébergeur pour bénéficier du II. */
  personalIdentification: "nom, prénoms, domicile et numéro de téléphone",
} as const;

/**
 * Adresse de contact publique.
 * VALEUR PROVISOIRE : à remplacer par une vraie adresse avant la mise en ligne (docs/legal.md).
 */
export const CONTACT_EMAIL = "exemple@gmail.com";

/** Vrai tant que CONTACT_EMAIL est la valeur provisoire (rappelé dans docs/legal.md). */
export const CONTACT_IS_PLACEHOLDER = true;

export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;

/**
 * Fournisseur de la messagerie de contact (destinataire des messages, RGPD art. 13.1.e et f).
 * À renseigner avec l'adresse définitive : la mise en production est bloquée tant qu'il manque
 * (src/lib/legalReadiness.ts, appelé par next.config.ts).
 */
export const CONTACT_PROVIDER = null as { name: string; location: string } | null;

/**
 * Offre Vercel du projet : "hobby" (gratuite) tant qu'aucune offre payante n'est souscrite.
 * Elle change les garanties : le DPA de Vercel (vercel.com/legal/dpa, mis à jour le 17 mars 2026)
 * dit, en sections 1 et 4.1, ne s'appliquer qu'aux offres Pro et Enterprise, alors que les conditions
 * de Vercel (vercel.com/legal/terms, mises à jour le 1er juin 2026), communes à toutes les offres,
 * disent en section 10.1 que Vercel traite les données « in accordance with » ce DPA, « incorporated
 * by reference ». Les deux textes se contredisent pour l'offre Hobby (voir UNVERIFIED et docs/legal.md).
 */
const VERCEL_PLAN = "hobby" as "hobby" | "pro";

/**
 * Vrai seulement après une confirmation écrite de Vercel que son DPA (et ses clauses contractuelles
 * types) s'applique au compte Hobby du projet (confirmation à conserver). Sans elle, ou sans l'offre
 * Pro, la mise en production est bloquée (src/lib/legalReadiness.ts) : RGPD art. 28.
 */
const VERCEL_HOBBY_DPA_CONFIRMED_IN_WRITING = false;

/**
 * Vrai une fois « Model Training » désactivé dans les réglages de l'équipe Vercel : en offre Hobby,
 * les conditions de Vercel (section 3) l'autorisent sinon à utiliser le contenu du compte pour
 * entraîner ses modèles d'IA et à le partager à cette fin. Bloque la mise en production tant qu'il est faux.
 */
const VERCEL_MODEL_TRAINING_DISABLED = false;

/** Décision d'adéquation de la Commission pour le Data Privacy Framework UE–États-Unis. */
const DPF_ADEQUACY =
  "décision d’adéquation (UE) 2023/1795 de la Commission européenne du 10 juillet 2023, qui couvre les sociétés américaines inscrites au cadre de protection des données UE–États-Unis (Data Privacy Framework), auquel Vercel Inc. déclare adhérer dans sa politique de confidentialité";

/**
 * Hébergeur (LCEN art. 1-1). Nom et adresse relevés le 7 octobre 2026 sur les pages officielles
 * de Vercel (politique de confidentialité, conditions, DPA). Aucun numéro de téléphone n'y figure :
 * `phone` reste null tant qu'il n'a pas été obtenu de Vercel (voir UNVERIFIED) ; il n'est pas
 * exigé d'un éditeur non professionnel (art. 1-1, II : nom et adresse de l'hébergeur).
 */
export const HOST = {
  name: "Vercel Inc.",
  address: "440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis",
  phone: null as string | null,
  website: "https://vercel.com",
  privacyPolicy: "https://vercel.com/legal/privacy-policy",
  dpa: "https://vercel.com/legal/dpa",
  terms: "https://vercel.com/legal/terms",
  /** Clause des conditions de Vercel sur les données techniques (« System Data ») qu'elle utilise pour son propre compte. */
  systemDataClause: "section 10.4 des conditions de Vercel",
  /** Liste officielle des sociétés inscrites au Data Privacy Framework. */
  dpfList: "https://www.dataprivacyframework.gov/list",
  subprocessors: "https://vercel.com/legal/sub-processors",
  plan: VERCEL_PLAN,
  /**
   * Vrai si le DPA de Vercel (contrat de sous-traitance et clauses contractuelles types) s'applique :
   * offre Pro, ou offre Hobby avec confirmation écrite de Vercel.
   */
  dpaApplies: VERCEL_PLAN === "pro" || VERCEL_HOBBY_DPA_CONFIRMED_IN_WRITING,
  modelTrainingDisabled: VERCEL_MODEL_TRAINING_DISABLED,
  /**
   * Région d'exécution des fonctions (serveur de l'application) choisie pour le projet, ou null
   * tant qu'elle n'est pas fixée : Vercel exécute alors les fonctions à Washington, D.C. (iad1),
   * d'après sa documentation (« Configuring regions for Vercel Functions », 11 août 2026).
   */
  functionRegion: null as string | null,
  defaultFunctionRegion: "Washington, D.C., États-Unis",
  /**
   * Lieu d'exécution du proxy (src/proxy.ts, Routing Middleware chez Vercel) : « Vercel deploys Routing
   * Middleware to all regions by default, regardless of your region settings. On the Hobby plan,
   * Routing Middleware runs in fewer regions » (« Configuring regions for Vercel Functions », 11 août 2026).
   */
  proxyLocation:
    "dans toutes les régions de son réseau mondial (moins nombreuses en offre gratuite Hobby), quelle que soit la région choisie pour les fonctions, y compris hors de l’Union européenne",
  /** Garanties des transferts vers les États-Unis, selon l'offre (politique de confidentialité et DPA de Vercel). */
  transfers:
    VERCEL_PLAN === "pro" || VERCEL_HOBBY_DPA_CONFIRMED_IN_WRITING
      ? `${DPF_ADEQUACY} ; son accord de traitement des données (DPA) prévoit en outre les clauses contractuelles types de la Commission européenne (décision 2021/914)`
      : DPF_ADEQUACY,
  /** Durée de consultation des journaux d'exécution par l'éditeur (documentation Vercel). */
  logRetention: VERCEL_PLAN === "pro" ? "1 jour (offre Pro)" : "1 heure (offre gratuite Hobby)",
} as const;

/**
 * Prestataire des comptes et de la base de données. Entité, adresse et mécanisme de transfert
 * relevés le 7 octobre 2026 dans les conditions et l'accord de traitement des données (DPA,
 * version du 1er août 2026) de Supabase : sans achat par une place de marché, le cocontractant
 * est Supabase Pte. Ltd. (Singapour).
 */
export const DATA_PROVIDER = {
  service: "Supabase",
  name: "Supabase Pte. Ltd.",
  address: "65 Chulia Street #38-02/03, OCBC Centre, Singapour 049513",
  website: "https://supabase.com",
  privacyPolicy: "https://supabase.com/privacy",
  dpa: "https://supabase.com/legal/dpa",
  subprocessors: "https://supabase.com/legal/customer-resources/subprocessor-list",
  region: "Amazon Web Services, région eu-west-3 (Paris, France)",
  transfers:
    "clauses contractuelles types de la Commission européenne (module 2, responsable de traitement vers sous-traitant), prévues par l’accord de traitement des données de Supabase",
  /**
   * Durée pendant laquelle l'éditeur peut consulter les journaux de l'API et de la base de la
   * plateforme Supabase, d'après la ligne « Log retention (API & Database) » de supabase.com/pricing
   * (consultée le 10 octobre 2026 : Free 1 day, Pro 7 days). Durée documentée, non constatée depuis
   * le projet, et distincte de la conservation propre de Supabase (sa politique de confidentialité).
   */
  logRetention: "1 jour avec l’offre gratuite (7 jours avec l’offre Pro)",
  /**
   * Durée pendant laquelle l'éditeur peut consulter les journaux d'authentification (Auth Audit Logs)
   * de la plateforme Supabase, d'après la ligne « Auth Audit Logs » du tableau Auth de
   * supabase.com/pricing (consultée le 10 octobre 2026 : Free 1 hour, Pro 7 days, Team 28 days).
   * Vérifié le 10 octobre 2026 : auth.audit_log_entries est vide malgré des connexions, le service
   * Auth hébergé n'écrit pas ses événements dans la base du projet (docs/legal.md, point 6).
   */
  authLogRetention: "1 heure avec l’offre gratuite (7 jours avec l’offre Pro)",
  /**
   * Lieu des journaux de la plateforme (hors de la base du projet), d'après la FAQ « Data Residency
   * and Transfers » de Supabase (version 1 du 6 octobre 2026) : « Logs are ingested and stored at
   * EU-based data centers » ; « Telemetry, logs, and service metadata are processed outside your
   * region to operate and secure the platform ».
   */
  logLocation:
    "journaux tenus par la plateforme Supabase, hors de la base du projet ; d’après la FAQ « Data Residency and Transfers » de Supabase (6 octobre 2026), ils sont stockés dans des centres de données situés dans l’Union européenne, et les journaux, la télémétrie et les métadonnées du service sont traités hors de la région du projet pour exploiter et sécuriser la plateforme",
  residencyFaq: "https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq",
  /** Sauvegardes de la base (documentation « Database Backups » de Supabase). */
  backupRetention:
    "aucune sauvegarde automatique avec l’offre gratuite ; sauvegardes quotidiennes conservées 7 jours avec l’offre Pro",
} as const;

/** Lieu d'exécution du serveur de l'application (fonctions Vercel), en clair. */
export const HOST_FUNCTION_LOCATION = HOST.functionRegion ?? `${HOST.defaultFunctionRegion}, région par défaut de Vercel`;

/** Autorité de contrôle (adresse du service des plaintes relevée sur cnil.fr le 7 octobre 2026). */
export const CNIL = {
  name: "Commission nationale de l’informatique et des libertés (CNIL)",
  address: "Service des plaintes, 3 place de Fontenoy, 75007 Paris",
  website: "https://www.cnil.fr",
  complaint: "https://www.cnil.fr/fr/adresser-une-plainte",
} as const;

/** Âge à partir duquel on peut créer un compte sans autorisation parentale. */
export const MINIMUM_AGE = 15;

/** Comptes inactifs : suppression manuelle après ce délai, avec prévenance par e-mail. */
export const INACTIVE_ACCOUNT_YEARS = 3;

/** Pages légales, par rôle. */
export const LEGAL_PAGE = {
  notice: { href: "/mentions-legales", title: "Mentions légales" },
  privacy: { href: "/confidentialite", title: "Confidentialité" },
  cookies: { href: "/cookies", title: "Cookies" },
  terms: { href: "/conditions", title: "Conditions d’utilisation" },
} as const;

/** Pages légales, dans l'ordre du pied de page. */
export const LEGAL_PAGES = [LEGAL_PAGE.notice, LEGAL_PAGE.privacy, LEGAL_PAGE.cookies, LEGAL_PAGE.terms] as const;

export type LegalPageHref = (typeof LEGAL_PAGES)[number]["href"];

/** Points non vérifiés ou à compléter avant la mise en ligne (repris dans docs/legal.md). */
export const UNVERIFIED = [
  "Identification de l’éditeur auprès de Vercel (LCEN art. 1-1, II) : les mentions légales ne publient ni le domicile ni le téléphone de l’éditeur, ce qui suppose qu’il ait communiqué à Vercel son nom, ses prénoms, son domicile et son numéro de téléphone ; rien ne le vérifie automatiquement (PUBLISHER_IDENTIFIED_TO_HOST) ; la mise en production est bloquée tant que ce n’est pas fait.",
  "Adresse de contact : exemple@gmail.com est une valeur provisoire ; son fournisseur de messagerie (CONTACT_PROVIDER) est à renseigner.",
  "Téléphone de Vercel Inc. : absent des pages officielles consultées (conditions, politique de confidentialité, DPA, page de contact).",
  "Offre Vercel et Supabase utilisée (durées des journaux pour les offres gratuites : 1 heure chez Vercel ; chez Supabase, 1 jour pour les journaux de l’API et de la base et 1 heure pour les journaux d’authentification).",
  "Contrat de sous-traitance avec Vercel en offre Hobby : les sections 1 et 4.1 du DPA de Vercel le limitent aux offres Pro et Enterprise, mais la section 10.1 des conditions de Vercel, communes à toutes les offres, dit que Vercel traite les données conformément à ce DPA, « incorporated by reference ». Les deux textes se contredisent : sans l’offre Pro ou une confirmation écrite de Vercel que le DPA s’applique au compte Hobby (VERCEL_HOBBY_DPA_CONFIRMED_IN_WRITING), l’existence d’un contrat conforme à l’article 28 du RGPD n’est pas établie, et la mise en production est bloquée.",
  "« Model Training » de Vercel (conditions, section 3) : en offre Hobby, Vercel peut utiliser le contenu du compte pour entraîner ses modèles d’IA et le partager à cette fin, sauf désactivation dans les réglages de l’équipe (VERCEL_MODEL_TRAINING_DISABLED) ; la mise en production est bloquée tant que ce n’est pas fait.",
  "Inscription active de Vercel Inc. sur la liste officielle du Data Privacy Framework (dataprivacyframework.gov) : déclarée dans la politique de confidentialité de Vercel, non vérifiée sur la liste.",
  "Modèles d’e-mail de Supabase Auth : vérifier que les modèles « token_hash » sont en place (docs/supabase.md) ; avec les modèles par défaut, le lien reçu par e-mail passe d’abord par Supabase, qui reçoit alors l’adresse IP et le navigateur de la personne (cas signalé sur /confidentialite).",
  "Région d’exécution des fonctions Vercel du projet (à choisir dans les réglages du projet, puis à renseigner dans HOST.functionRegion). Le proxy (src/proxy.ts) s’exécute, lui, dans toutes les régions de Vercel quel que soit ce réglage (HOST.proxyLocation, d’après la documentation de Vercel) ; la page consultée indique moins de régions en offre Hobby sans en donner la liste.",
  "Prestataire d’envoi des e-mails de Supabase et sa localisation (liste des sous-traitants de Supabase, au format PDF).",
] as const;
