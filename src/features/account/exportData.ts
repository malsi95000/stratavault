// Fichier « Télécharger mes données » (RGPD, articles 15 et 20) : le compte, son profil (avec
// l'image de l'avatar), ses autres fichiers d'avatar éventuels, ses autorisations d'affichage
// d'avatars, son jeton d'envoi d'avatar, ses contacts, demandes de contact et blocages, ses
// partages de cartes (cartes partagées avec lui, invitations reçues, membres, invitations et liens de
// ses cartes, verrous d'édition, liens d'invitation déjà utilisés), sa place dans la carte collective
// (éléments, masqués compris, signalements, avis de modération, décisions qui visent ses éléments,
// désignation comme modérateur et suspension, identifiants d'éléments utilisés, décisions s'il est
// modérateur), ses compteurs anti-abus tenus par la base et toutes ses cartes (avec leur logo ou
// aperçu), dans un format JSON structuré, lisible par une machine comme par une personne. Les
// exceptions de l'article 15, paragraphe 4 du RGPD sont dans ACCOUNT_EXPORT_NOTE.
//
// Le fichier est produit en flux, carte par carte, en JSON compact : le serveur ne garde jamais en
// mémoire qu'une carte à la fois (au plus 4 Mo dans l'application, 8 Mo dans la base), et le contenu
// de chaque carte est recopié tel que la base l'écrit, sans être décodé en objets.
import type { ExportedMapContent, ExportedMapSummary } from "@/lib/supabase/account";
import type { AccountDetails } from "@/lib/supabase/user";

export const ACCOUNT_EXPORT_FORMAT = "stratavault-donnees-du-compte";
/**
 * 2 : ajout du profil, des fichiers, autorisations et jeton d'envoi d'avatar, des contacts, demandes
 * de contact et blocages, des partages de cartes, de la carte collective et des compteurs anti-abus
 * (bêta 2.1).
 */
export const ACCOUNT_EXPORT_VERSION = 2;

/** Présentation placée en tête du fichier. */
export const ACCOUNT_EXPORT_NOTE =
  "Données de votre compte Stratavault : la fiche du compte, votre profil (null si vous n’en avez pas ; l’avatar y figure en base64, au format WebP), les autres fichiers d’avatar encore enregistrés pour votre compte (« otherAvatarFiles » : ancien avatar ou envoi interrompu, en attente d’effacement ; d’ordinaire vide), vos autorisations techniques d’affichage de l’avatar d’autres membres (« avatarReadGrants » : identifiant de l’avatar, échéance), votre jeton technique d’envoi d’avatar (« avatarUploadTicket » : nom du fichier attendu, échéance ; d’ordinaire null), vos contacts (« contacts » : identifiant et nom affiché du membre, date), vos demandes de contact en cours (« contactRequests » : reçue ou envoyée, identifiant et nom affiché du membre si son profil vous est visible, sinon null, date), les comptes que vous avez bloqués (« blockedMembers » : identifiant du membre au moment du blocage, null s’il ne vous était pas visible, date), les cartes d’autres membres partagées avec vous (« sharedWithMe » : carte, nom, votre rôle, propriétaire, date d’entrée ; leur contenu reste celui de leur propriétaire et ne figure pas ici), les invitations reçues encore valables (« mapInvitations »), les partages de vos cartes (« mapShares » : membres, invitations en attente et liens d’invitation actifs, avec le rôle, les usages et l’échéance ; jamais le jeton d’un lien, que la base ne conserve pas), vos verrous d’édition en cours (« mapLocks » : carte, début, échéance ; d’ordinaire vide), les liens d’invitation que vous avez déjà utilisés (« mapLinkUses » : carte, date ; un lien ne sert qu’une fois à chaque compte), vos éléments de la carte collective (« collectiveItems » : sorte, contenu, état « visible » ou « hidden » s’il a été masqué par la modération, dates), vos signalements (« collectiveReports » : élément, motif, précisions, état ; l’auteur signalé ne sait pas qui l’a signalé), les avis de modération qui vous concernent (« collectiveNotices » : décision, élément, motif, nombre de signalements à l’origine d’une décision sur vos éléments, fin de la suspension de vos contributions si elle a été prononcée, date ; le modérateur n’y est pas nommé), les décisions de modération qui visent vos éléments, y compris celles dont l’avis a été effacé (« collectiveDecisions » : décision, élément, motif, nombre de signalements traités, suspension prononcée, date ; dont le retrait par vous-même d’un élément masqué, « withdraw », et la suppression d’un de vos liens masqués avec l’élément auquel il était rattaché), votre situation dans la carte collective (« collectiveAccount » : date de votre désignation comme modérateur, suspension en cours ou échue non encore effacée, sinon null), les identifiants des éléments que vous avez publiés (« collectiveItemIds » : identifiant, « moderated » s’il a été masqué ou supprimé par la modération et ne peut plus resservir), les décisions que vous avez prises si vous êtes modérateur (« moderationDecisions », avec la suspension éventuellement prononcée ; d’ordinaire vide), les compteurs anti-abus de votre compte tenus par la base (« securityCounters » : action, début de la fenêtre en cours, nombre d’appels), puis toutes vos cartes. Ne figurent pas ici, pour protéger les droits d’autres membres (RGPD, article 15, paragraphe 4) : les blocages dont vous faites l’objet (pour protéger le membre qui bloque), les décisions de modération sur vos éléments qui révéleraient qu’un membre les a signalés (classement de signalements, retrait par vous-même d’un élément signalé, lien signalé supprimé avec l’élément auquel il était rattaché), et les signalements qui visent vos éléments (motif, précisions, copie du contenu signalé, y compris un contenu modifié ou retiré depuis) ; ces décisions et ces signalements peuvent être demandés par e-mail et sont alors communiqués après examen au cas par cas, sans ce qui permettrait d’identifier la personne qui a signalé (voir la politique de confidentialité). Les invitations et les liens d’invitation échus, en attente d’effacement, ne figurent pas non plus ici : ils se demandent par e-mail. Le champ « cover » de chaque carte est son logo ou son aperçu (null s’il n’y en a pas). Le champ « data » est au format des fichiers de l’éditeur : enregistré seul dans un fichier .json, il s’importe avec le bouton « Importer ». Les mots de passe ne sont jamais conservés en clair et ne figurent pas ici.";

/** Forme du fichier (les clés apparaissent dans cet ordre). */
export type AccountExport = {
  format: typeof ACCOUNT_EXPORT_FORMAT;
  version: typeof ACCOUNT_EXPORT_VERSION;
  note: string;
  exportedAt: string;
  account: {
    id: string;
    email: string | null;
    createdAt: string | null;
    emailConfirmedAt: string | null;
    lastSignInAt: string | null;
  };
  profile: ExportedProfile | null;
  otherAvatarFiles: ExportedFile[];
  avatarReadGrants: ExportedAvatarReadGrant[];
  avatarUploadTicket: ExportedAvatarUploadTicket | null;
  contacts: ExportedContact[];
  contactRequests: ExportedContactRequest[];
  blockedMembers: ExportedBlockedMember[];
  sharedWithMe: ExportedSharedMap[];
  mapInvitations: ExportedMapInvitation[];
  mapShares: ExportedMapShare[];
  mapLocks: ExportedMapLock[];
  mapLinkUses: ExportedMapLinkUse[];
  collectiveItems: ExportedCollectiveItem[];
  collectiveReports: ExportedCollectiveReport[];
  collectiveNotices: ExportedCollectiveNotice[];
  collectiveDecisions: ExportedModerationDecision[];
  collectiveAccount: ExportedCollectiveAccount;
  collectiveItemIds: ExportedCollectiveItemId[];
  moderationDecisions: ExportedModerationDecision[];
  securityCounters: ExportedSecurityCounter[];
  maps: {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    revision: number;
    /** Logo (icône et couleur) ou aperçu SVG de la carte ; null s'il n'y en a pas. */
    cover: unknown;
    data: unknown;
  }[];
};

/** Profil du compte tel qu'il figure dans le fichier. */
export type ExportedProfile = {
  handle: string;
  displayName: string;
  bio: string;
  visibility: string;
  /** Date du dernier changement d'identifiant (ou de la création du profil). */
  handleChangedAt: string;
  createdAt: string;
  updatedAt: string;
  /** Image de l'avatar (WebP en base64) ; null sans avatar, ou si son fichier est introuvable. */
  avatar: ExportedFile | null;
};

/** Fichier du compte dans le compartiment « avatars », en base64. */
export type ExportedFile = { contentType: string; base64: string };

/** Autorisation d'afficher l'avatar d'un autre membre (public.avatar_read_grants). */
export type ExportedAvatarReadGrant = { avatarId: string; expiresAt: string };

/** Jeton d'envoi d'avatar du compte (public.avatar_upload_tickets) : nom du fichier attendu, échéance. */
export type ExportedAvatarUploadTicket = { avatarId: string; expiresAt: string };

/** Contact du compte (public.contacts) : l'autre membre, désigné par son identifiant public. */
export type ExportedContact = { handle: string; displayName: string; since: string };

/** Demande de contact en cours (public.contact_requests). */
export type ExportedContactRequest = {
  direction: "incoming" | "outgoing";
  /** Identifiant et nom affiché : null si le profil de l'autre membre ne vous est plus visible. */
  handle: string | null;
  displayName: string | null;
  createdAt: string;
};

/**
 * Compte bloqué par le compte (public.contact_blocks) : identifiant au moment du blocage (null s'il ne
 * vous était pas visible), jamais mis à jour.
 */
export type ExportedBlockedMember = { handle: string | null; blockedAt: string };

/** Carte d'un autre membre partagée avec le compte (public.map_members). */
export type ExportedSharedMap = {
  mapId: string;
  name: string;
  role: string;
  ownerHandle: string | null;
  ownerName: string | null;
  joinedAt: string;
};

/** Invitation à une carte reçue par le compte (public.map_invitations). */
export type ExportedMapInvitation = {
  mapName: string;
  role: string;
  ownerHandle: string | null;
  ownerName: string | null;
  createdAt: string;
  expiresAt: string;
};

/** Partage d'une carte du compte : membre, invitation en attente ou lien actif (sans son jeton). */
export type ExportedMapShare = {
  mapId: string;
  kind: "member" | "invitation" | "link";
  handle: string | null;
  displayName: string | null;
  role: string;
  uses: number | null;
  maxUses: number | null;
  createdAt: string;
  expiresAt: string | null;
};

/** Verrou d'édition tenu par le compte (public.map_locks). */
export type ExportedMapLock = { mapId: string; acquiredAt: string; expiresAt: string };

/** Lien d'invitation déjà utilisé par le compte (public.map_link_uses) : carte, date. */
export type ExportedMapLinkUse = { mapId: string; usedAt: string };

/** Élément de la carte collective ajouté par le compte (public.collective_items), masqué compris. */
export type ExportedCollectiveItem = { id: string; kind: string; data: unknown; status: string; createdAt: string; updatedAt: string };

/** Signalement fait par le compte (public.collective_reports). */
export type ExportedCollectiveReport = {
  itemId: string;
  reason: string;
  details: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
};

/** Avis de modération reçu par le compte (public.collective_notices) ; le modérateur n'y est pas nommé. */
export type ExportedCollectiveNotice = {
  role: string;
  action: string;
  itemId: string;
  itemKind: string;
  itemTitle: string;
  reason: string;
  /** Avis d'auteur : nombre de signalements traités par la décision (0 : initiative de la modération) ; sinon null. */
  reports: number | null;
  /** Fin de la suspension de ses contributions annoncée par l'avis ; null : aucune. */
  suspendedUntil: string | null;
  createdAt: string;
  readAt: string | null;
};

/**
 * Situation du compte dans la carte collective : désignation comme modérateur (public.moderators) et
 * suspension de ses contributions (public.collective_suspensions), null si aucune.
 */
export type ExportedCollectiveAccount = {
  moderatorSince: string | null;
  suspension: { until: string; createdAt: string } | null;
};

/** Identifiant d'élément utilisé par le compte (public.collective_item_ids) ; « modéré » : ne peut plus resservir. */
export type ExportedCollectiveItemId = { itemId: string; moderated: boolean };

/**
 * Décision de modération (public.collective_decisions), prise par le compte comme modérateur
 * (« moderationDecisions ») ou visant ses éléments (« collectiveDecisions ») ; le modérateur n'est jamais nommé.
 */
export type ExportedModerationDecision = {
  action: string;
  itemId: string;
  itemKind: string;
  itemTitle: string;
  reason: string;
  reports: number;
  /** Fin de la suspension de l'auteur prononcée avec la décision ; null : aucune. */
  suspendedUntil: string | null;
  createdAt: string;
};

/** Données du compte lues avant le début du fichier (absentes : vides). */
export type ExportExtras = {
  /** Profil du compte ; null s'il n'en a pas. */
  profile?: ExportedProfile | null;
  /** Fichiers d'avatar du compte autres que l'avatar actuel. */
  otherAvatarFiles?: readonly ExportedFile[];
  avatarReadGrants?: readonly ExportedAvatarReadGrant[];
  /** Jeton d'envoi d'avatar du compte ; null s'il n'en a pas. */
  avatarUploadTicket?: ExportedAvatarUploadTicket | null;
  contacts?: readonly ExportedContact[];
  contactRequests?: readonly ExportedContactRequest[];
  blockedMembers?: readonly ExportedBlockedMember[];
  sharedWithMe?: readonly ExportedSharedMap[];
  mapInvitations?: readonly ExportedMapInvitation[];
  mapShares?: readonly ExportedMapShare[];
  mapLocks?: readonly ExportedMapLock[];
  mapLinkUses?: readonly ExportedMapLinkUse[];
  collectiveItems?: readonly ExportedCollectiveItem[];
  collectiveReports?: readonly ExportedCollectiveReport[];
  collectiveNotices?: readonly ExportedCollectiveNotice[];
  /** Décisions qui visent les éléments du compte, sauf celles qui révéleraient un signalement. */
  collectiveDecisions?: readonly ExportedModerationDecision[];
  collectiveAccount?: ExportedCollectiveAccount;
  collectiveItemIds?: readonly ExportedCollectiveItemId[];
  moderationDecisions?: readonly ExportedModerationDecision[];
  /** Compteurs anti-abus du compte. */
  securityCounters?: readonly ExportedSecurityCounter[];
};

/** Compteur anti-abus du compte tenu par la base (public.rate_limits). */
export type ExportedSecurityCounter = { action: string; windowStart: string; hits: number };

/** Début du fichier, jusqu'à l'ouverture de la liste des cartes. */
export function exportHead(account: AccountDetails, now: Date, extras: ExportExtras = {}): string {
  const head: Omit<AccountExport, "maps"> = {
    format: ACCOUNT_EXPORT_FORMAT,
    version: ACCOUNT_EXPORT_VERSION,
    note: ACCOUNT_EXPORT_NOTE,
    exportedAt: now.toISOString(),
    account: {
      id: account.id,
      email: account.email,
      createdAt: account.createdAt,
      emailConfirmedAt: account.emailConfirmedAt,
      lastSignInAt: account.lastSignInAt,
    },
    profile: extras.profile ?? null,
    otherAvatarFiles: [...(extras.otherAvatarFiles ?? [])],
    avatarReadGrants: [...(extras.avatarReadGrants ?? [])],
    avatarUploadTicket: extras.avatarUploadTicket ?? null,
    contacts: [...(extras.contacts ?? [])],
    contactRequests: [...(extras.contactRequests ?? [])],
    blockedMembers: [...(extras.blockedMembers ?? [])],
    sharedWithMe: [...(extras.sharedWithMe ?? [])],
    mapInvitations: [...(extras.mapInvitations ?? [])],
    mapShares: [...(extras.mapShares ?? [])],
    mapLocks: [...(extras.mapLocks ?? [])],
    mapLinkUses: [...(extras.mapLinkUses ?? [])],
    collectiveItems: [...(extras.collectiveItems ?? [])],
    collectiveReports: [...(extras.collectiveReports ?? [])],
    collectiveNotices: [...(extras.collectiveNotices ?? [])],
    collectiveDecisions: [...(extras.collectiveDecisions ?? [])],
    collectiveAccount: extras.collectiveAccount ?? { moderatorSince: null, suspension: null },
    collectiveItemIds: [...(extras.collectiveItemIds ?? [])],
    moderationDecisions: [...(extras.moderationDecisions ?? [])],
    securityCounters: [...(extras.securityCounters ?? [])],
  };
  // `{…}` sans son accolade fermante, puis la clé « maps ».
  return `${JSON.stringify(head).slice(0, -1)},"maps":[`;
}

/**
 * Une carte du fichier ; `content` porte son logo et son contenu en JSON, tels que la base les écrit
 * (cover::text, data::text).
 */
export function exportMapEntry(map: ExportedMapSummary, { dataText, coverText }: ExportedMapContent): string {
  const fields = {
    id: map.id,
    name: map.name,
    createdAt: map.created_at,
    updatedAt: map.updated_at,
    revision: map.revision,
  };
  return `${JSON.stringify(fields).slice(0, -1)},"cover":${coverText ?? "null"},"data":${dataText}}`;
}

/** Fin du fichier. */
export const EXPORT_TAIL = "]}";

/**
 * Délai pour la première lecture du flux. Le serveur commence à envoyer le fichier dès la réponse
 * prête ; sans lecture dans ce délai (requête HEAD, connexion perdue), le flux est abandonné et sa
 * place libérée.
 */
export const EXPORT_FIRST_READ_TIMEOUT_MS = 10_000;
/**
 * Délai entre deux lectures : un navigateur qui cesse de lire le fichier (sans fermer la connexion)
 * ne garde pas sa place au-delà. Assez long pour qu'une carte de 4 Mo parte sur une connexion lente.
 */
export const EXPORT_IDLE_TIMEOUT_MS = 2 * 60_000;

/** Erreur du flux quand le navigateur ne lit plus le fichier. */
export class ExportStalledError extends Error {
  constructor() {
    super("Téléchargement abandonné : le fichier n’est plus lu.");
    this.name = "ExportStalledError";
  }
}

type ExportStreamOptions = {
  account: AccountDetails;
  /** Profil, fichiers et autorisations d'avatar, compteurs (lus avant le début du fichier). */
  extras?: ExportExtras;
  maps: readonly ExportedMapSummary[];
  now: Date;
  /** Contenu et logo d'une carte en texte JSON ; null si elle n'existe plus (elle est alors omise). */
  readData: (mapId: string) => Promise<ExportedMapContent | null>;
  /** Appelée une seule fois, quand le flux se termine, échoue, est abandonné ou n'est plus lu. */
  onEnd: () => void;
  /** Délais de lecture (pour les tests) ; par défaut EXPORT_FIRST_READ_TIMEOUT_MS et EXPORT_IDLE_TIMEOUT_MS. */
  timeouts?: { firstReadMs: number; idleMs: number };
};

/**
 * Flux du fichier : la tête, puis une carte à chaque lecture du navigateur (une seule requête à la
 * base à la fois, au rythme où le fichier est téléchargé), puis la fin. Une lecture en échec
 * interrompt le téléchargement (le navigateur le signale comme échoué) : jamais de fichier tronqué
 * présenté comme complet. Un flux qui n'est pas lu à temps (voir les délais plus haut) est
 * interrompu de la même façon, et sa place libérée.
 */
export function createAccountExportStream({
  account,
  extras = {},
  maps,
  now,
  readData,
  onEnd,
  timeouts = { firstReadMs: EXPORT_FIRST_READ_TIMEOUT_MS, idleMs: EXPORT_IDLE_TIMEOUT_MS },
}: ExportStreamOptions) {
  const encoder = new TextEncoder();
  let ended = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const end = () => {
    stopTimer();
    if (ended) return;
    ended = true;
    onEnd();
  };
  /** Attend la prochaine lecture au plus `ms` millisecondes, sinon interrompt le flux. */
  const awaitRead = (controller: ReadableStreamDefaultController<Uint8Array>, ms: number) => {
    stopTimer();
    timer = setTimeout(() => {
      timer = undefined;
      if (ended) return;
      end();
      controller.error(new ExportStalledError());
    }, ms);
    // La minuterie ne retient pas le processus.
    timer.unref?.();
  };
  let index = -1; // -1 : tête pas encore écrite
  let written = 0; // cartes écrites (pour les virgules)

  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        awaitRead(controller, timeouts.firstReadMs);
      },
      async pull(controller) {
        // Pas de délai pendant la lecture d'une carte dans la base : seulement entre deux lectures du navigateur.
        stopTimer();
        if (ended) return;
        try {
          if (index < 0) {
            index = 0;
            controller.enqueue(encoder.encode(exportHead(account, now, extras)));
            awaitRead(controller, timeouts.idleMs);
            return;
          }
          while (index < maps.length) {
            const map = maps[index];
            index += 1;
            const content = await readData(map.id);
            if (content === null) continue;
            controller.enqueue(encoder.encode((written > 0 ? "," : "") + exportMapEntry(map, content)));
            written += 1;
            awaitRead(controller, timeouts.idleMs);
            return;
          }
          controller.enqueue(encoder.encode(EXPORT_TAIL));
          controller.close();
          end();
        } catch (error) {
          end();
          controller.error(error);
        }
      },
      cancel() {
        end();
      },
    },
    // Rien n'est lu d'avance : une carte n'est demandée à la base que quand la précédente est partie.
    { highWaterMark: 0 },
  );
}

/** Nom du fichier téléchargé : `stratavault-donnees-AAAA-MM-JJ.json` (date UTC), sans donnée personnelle. */
export const accountExportFileName = (now: Date) => `stratavault-donnees-${now.toISOString().slice(0, 10)}.json`;
