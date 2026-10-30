import "server-only";

// Profil du compte, fichiers, autorisations et jeton d'envoi d'avatar, contacts et compteurs
// anti-abus de la base pour « Télécharger mes données » : champs du profil, image de son avatar (WebP
// en base64, 100 Ko au plus), autres fichiers du compte dans le compartiment (ancien avatar ou envoi
// interrompu, en attente d'effacement), autorisations d'affichage de l'avatar d'autres membres, jeton
// d'envoi d'avatar, contacts, demandes de contact et blocages (les autres membres y figurent par leur
// identifiant public, jamais par leur identifiant de compte), partages de cartes, carte collective et compteurs, lus avec le jeton du
// compte avant le début du fichier. Toute lecture qui échoue fait échouer l'export
// (« export indisponible ») : le fichier n'omet jamais une donnée sans le dire.
import {
  listDecisionsAboutMe,
  listNotices,
  listOwnDecisions,
  listOwnItemIds,
  listOwnItems,
  listOwnReports,
  readOwnCollectiveAccount,
} from "@/lib/supabase/collective";
import { getContactOverview } from "@/lib/supabase/contacts";
import { listOwnRateLimits } from "@/lib/supabase/rateLimits";
import { listMapInvitations, listMapShareRows, listOwnLinkUses, listOwnLocks, listSharedWithMe } from "@/lib/supabase/sharing";
import {
  AvatarStorageError,
  downloadAvatarObject,
  getOwnAvatarUploadTicket,
  getOwnProfile,
  listOwnAvatarObjects,
  listOwnAvatarReadGrants,
} from "@/lib/supabase/profiles";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import { AVATAR_CONTENT_TYPE, AVATAR_OUTPUT_MAX_BYTES } from "@/features/profiles/avatarImage";
import type { ExportExtras, ExportedFile, ExportedProfile } from "./exportData";

/**
 * Fichier d'avatar du compte, en base64 ; null s'il n'existe plus. Le compartiment refuse tout
 * fichier de plus de 100 Ko et tout type autre que image/webp : au-delà, quelque chose ne va pas
 * (erreur). Le fichier est exporté tel qu'il est enregistré : ce sont les données du compte lui-même,
 * encodées en base64 dans le JSON (rien n'est interprété par le navigateur).
 */
async function readOwnFile(db: ServerSupabaseClient, name: string): Promise<ExportedFile | null> {
  const bytes = await downloadAvatarObject(db, name);
  if (!bytes) return null;
  if (bytes.length > AVATAR_OUTPUT_MAX_BYTES) throw new AvatarStorageError("download");
  return { contentType: AVATAR_CONTENT_TYPE, base64: Buffer.from(bytes).toString("base64") };
}

/**
 * Profil de `userId` pour le fichier (null s'il n'en a pas) et identifiant de son avatar actuel. Un
 * avatar désigné dont le fichier n'existe plus figure avec `avatar: null`.
 */
async function readProfile(
  db: ServerSupabaseClient,
  userId: string,
): Promise<{ profile: ExportedProfile | null; avatarId: string | null }> {
  const profile = await getOwnProfile(db, userId);
  if (!profile) return { profile: null, avatarId: null };
  const exported: ExportedProfile = {
    handle: profile.handle,
    displayName: profile.displayName,
    bio: profile.bio,
    visibility: profile.visibility,
    handleChangedAt: profile.handleChangedAt,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    avatar: profile.avatarId ? await readOwnFile(db, profile.avatarId) : null,
  };
  return { profile: exported, avatarId: profile.avatarId };
}

/**
 * Fichiers du compte dans le compartiment autres que `currentAvatarId` (deux fichiers au plus par
 * compte d'après la politique d'envoi). Un fichier effacé entre la liste et sa lecture est omis.
 */
async function readOtherAvatarFiles(
  db: ServerSupabaseClient,
  currentAvatarId: string | null,
): Promise<ExportedFile[]> {
  const files: ExportedFile[] = [];
  for (const name of await listOwnAvatarObjects(db)) {
    if (name === currentAvatarId) continue;
    const file = await readOwnFile(db, name);
    if (file) files.push(file);
  }
  return files;
}

/**
 * Contacts, demandes en cours et blocages du compte connecté. Base d'avant les contacts (fonctions
 * absentes) : listes vides ; toute autre erreur est levée.
 */
async function readContacts(db: ServerSupabaseClient) {
  const overview = await getContactOverview(db, { missingAsEmpty: true });
  return {
    contacts: overview.contacts.map((c) => ({ handle: c.handle, displayName: c.displayName, since: c.createdAt })),
    contactRequests: [...overview.incoming, ...overview.outgoing].map((r) => ({
      direction: r.direction,
      handle: r.handle,
      displayName: r.displayName,
      createdAt: r.createdAt,
    })),
    blockedMembers: overview.blocked.map((b) => ({ handle: b.handle, blockedAt: b.createdAt })),
  };
}

/**
 * Partages de cartes du compte connecté (cartes partagées avec lui, invitations reçues, partages de
 * ses cartes, verrous d'édition, liens d'invitation déjà utilisés). Base d'avant le partage (fonctions absentes) : listes vides ; toute
 * autre erreur est levée.
 */
async function readSharing(db: ServerSupabaseClient) {
  const options = { missingAsEmpty: true };
  const [shared, invitations, shares, locks, linkUses] = await Promise.all([
    listSharedWithMe(db, options),
    listMapInvitations(db, options),
    listMapShareRows(db, null, options),
    listOwnLocks(db, options),
    listOwnLinkUses(db, options),
  ]);
  return {
    sharedWithMe: shared.map((m) => ({
      mapId: m.id,
      name: m.name,
      role: m.role,
      ownerHandle: m.ownerHandle,
      ownerName: m.ownerName,
      joinedAt: m.joinedAt,
    })),
    mapInvitations: invitations.map((i) => ({
      mapName: i.mapName,
      role: i.role,
      ownerHandle: i.ownerHandle,
      ownerName: i.ownerName,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
    })),
    mapShares: shares,
    mapLocks: locks,
    mapLinkUses: linkUses,
  };
}

/**
 * Carte collective du compte connecté : ses éléments (masqués compris), ses signalements, ses avis de
 * modération, les décisions de modération qui visent ses éléments (sauf celles qui révéleraient un
 * signalement), sa désignation comme modérateur et sa suspension, les identifiants d'éléments qu'il a
 * utilisés et ses décisions de modérateur. Base d'avant la carte collective : listes vides ; toute
 * autre erreur est levée.
 */
async function readCollective(db: ServerSupabaseClient) {
  const options = { missingAsEmpty: true };
  const [items, reports, notices, aboutMe, decisions, account, itemIds] = await Promise.all([
    listOwnItems(db, options),
    listOwnReports(db, options),
    listNotices(db, options),
    listDecisionsAboutMe(db, options),
    listOwnDecisions(db, options),
    readOwnCollectiveAccount(db, options),
    listOwnItemIds(db, options),
  ]);
  const exported = (d: (typeof decisions)[number]) => ({
    action: d.action,
    itemId: d.itemId,
    itemKind: d.itemKind,
    itemTitle: d.itemTitle,
    reason: d.reason,
    reports: d.reports,
    suspendedUntil: d.suspendedUntil,
    createdAt: d.createdAt,
  });
  return {
    collectiveItems: items,
    collectiveReports: reports,
    collectiveAccount: account,
    collectiveItemIds: itemIds,
    collectiveNotices: notices.map((n) => ({
      role: n.role,
      action: n.action,
      itemId: n.itemId,
      itemKind: n.itemKind,
      itemTitle: n.itemTitle,
      reason: n.reason,
      reports: n.reports,
      suspendedUntil: n.suspendedUntil,
      createdAt: n.createdAt,
      readAt: n.readAt,
    })),
    collectiveDecisions: aboutMe.map(exported),
    moderationDecisions: decisions.map(exported),
  };
}

/**
 * Profil, autres fichiers d'avatar, autorisations d'affichage d'avatars, jeton d'envoi d'avatar,
 * contacts et compteurs anti-abus de `userId` (le compte connecté), pour la tête du fichier. Lève une
 * erreur si une lecture échoue.
 */
export async function readExtrasForExport(db: ServerSupabaseClient, userId: string): Promise<ExportExtras> {
  const { profile, avatarId } = await readProfile(db, userId);
  const otherAvatarFiles = await readOtherAvatarFiles(db, avatarId);
  const avatarReadGrants = (await listOwnAvatarReadGrants(db)).map((grant) => ({
    avatarId: grant.avatarId,
    expiresAt: grant.expiresAt,
  }));
  const ticket = await getOwnAvatarUploadTicket(db);
  const avatarUploadTicket = ticket ? { avatarId: ticket.avatarId, expiresAt: ticket.expiresAt } : null;
  const { contacts, contactRequests, blockedMembers } = await readContacts(db);
  const { sharedWithMe, mapInvitations, mapShares, mapLocks, mapLinkUses } = await readSharing(db);
  const {
    collectiveItems,
    collectiveReports,
    collectiveNotices,
    collectiveDecisions,
    collectiveAccount,
    collectiveItemIds,
    moderationDecisions,
  } = await readCollective(db);
  const securityCounters = (await listOwnRateLimits(db)).map((row) => ({
    action: row.action,
    windowStart: row.windowStart,
    hits: row.hits,
  }));
  return {
    profile,
    otherAvatarFiles,
    avatarReadGrants,
    avatarUploadTicket,
    contacts,
    contactRequests,
    blockedMembers,
    sharedWithMe,
    mapInvitations,
    mapShares,
    mapLocks,
    mapLinkUses,
    collectiveItems,
    collectiveReports,
    collectiveNotices,
    collectiveDecisions,
    collectiveAccount,
    collectiveItemIds,
    moderationDecisions,
    securityCounters,
  };
}
