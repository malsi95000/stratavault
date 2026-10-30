"use server";

// Server Actions du partage des cartes (mode compte seulement) : inviter un contact, créer et
// révoquer un lien, changer le rôle d'un membre, le retirer, répondre à une invitation, rejoindre une
// carte par un lien, quitter une carte.
//
// Chacune : limite par IP avant tout appel à Supabase, session vérifiée auprès de l'API Auth
// (getUser, jamais getSession), compte attendu par la page (champ `account` : si un autre compte a
// été ouvert dans un autre onglet, rien n'est fait), entrées revalidées (zod), messages génériques.
// La base vérifie en plus auth.uid(), n'agit que sur les cartes du compte (ou ses propres
// appartenances) et tient ses limites anti-abus par compte
// (supabase/migrations/20261019120000_map_sharing.sql). Protection CSRF : voir
// src/features/account/actions.ts.
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { RATE_LIMITED } from "@/features/auth/messages";
import { checkAttempt, clientIp, trustedProxyHops } from "@/features/auth/rateLimit";
import { textField } from "@/features/profiles/formState";
import * as data from "@/lib/supabase/sharing";
import { createClient, type ServerSupabaseClient } from "@/lib/supabase/server";
import { checkActiveUser } from "@/lib/supabase/user";
import { sharingError, sharingSuccess, type SharingActionState } from "./actionState";
import {
  INVITATION_CANCELLED,
  INVITE_MESSAGES,
  JOIN_MESSAGES,
  LINKS_FULL,
  LINK_CREATED,
  LINK_REVOKED,
  MAP_GONE_OR_FORBIDDEN,
  MAP_LEFT,
  MEMBER_REMOVED,
  MEMBER_ROLE_UPDATED,
  SHARE_GONE,
  SHARING_INVALID,
  SHARING_NO_PROFILE,
  SHARING_RATE_LIMITED,
  SHARING_SESSION_CHANGED,
  SHARING_SESSION_ENDED,
  SHARING_UNAVAILABLE,
} from "./messages";
import { invitationAnswerSchema, linkOptionsSchema, linkTokenSchema, memberRoleSchema, sharingRefSchema } from "./schemas";

type Run = (db: ServerSupabaseClient) => Promise<SharingActionState>;

/** Exécute `run` pour le compte connecté, s'il est bien celui attendu par la page. */
async function asAccount(formData: FormData, run: Run): Promise<SharingActionState> {
  if (checkAttempt("shareWrite", clientIp(await headers(), trustedProxyHops())) !== "allowed") {
    return sharingError(RATE_LIMITED);
  }
  const check = await checkActiveUser();
  if (check.status === "unavailable") return sharingError(SHARING_UNAVAILABLE);
  if (check.status === "signed-out") return sharingError(SHARING_SESSION_ENDED);
  if (textField(formData, "account") !== check.user.id) return sharingError(SHARING_SESSION_CHANGED);
  const db = await createClient();
  if (!db) return sharingError(SHARING_SESSION_ENDED);
  try {
    return await run(db);
  } catch (error) {
    return failureState(error);
  }
}

/** Message d'une erreur des données (déjà classée), sans jamais renvoyer l'erreur brute. */
function failureState(error: unknown): SharingActionState {
  if (!(error instanceof data.SharingDataError)) {
    console.error("[sharing] Erreur inattendue.");
    return sharingError(SHARING_UNAVAILABLE);
  }
  switch (error.kind) {
    case "no-profile":
      return sharingError(SHARING_NO_PROFILE);
    case "rate-limited":
      return sharingError(SHARING_RATE_LIMITED);
    case "links-full":
      return sharingError(LINKS_FULL);
    case "not-found":
      return sharingError(MAP_GONE_OR_FORBIDDEN);
    case "invalid":
      return sharingError(SHARING_INVALID);
    case "unauthorized":
      return sharingError(SHARING_SESSION_ENDED);
    default:
      return sharingError(SHARING_UNAVAILABLE);
  }
}

/** Succès : la page relit ses listes. */
function done(message: string, extra: Parameters<typeof sharingSuccess>[1] = {}): SharingActionState {
  refresh();
  return sharingSuccess(message, extra);
}

const ref = (formData: FormData, name: string) => sharingRefSchema.safeParse(textField(formData, name));

/** Invite le contact « contact » à rejoindre la carte « map » avec le rôle « role ». */
export async function inviteContact(_previous: SharingActionState, formData: FormData): Promise<SharingActionState> {
  const map = ref(formData, "map");
  const contact = ref(formData, "contact");
  const role = memberRoleSchema.safeParse(textField(formData, "role"));
  if (!map.success || !contact.success || !role.success) return sharingError(SHARING_INVALID);
  return asAccount(formData, async (db) => {
    const result = await data.inviteContact(db, map.data, contact.data, role.data);
    return result === "invited" ? done(INVITE_MESSAGES.invited) : sharingError(INVITE_MESSAGES[result]);
  });
}

/** Annule l'invitation « invitation » d'une carte du compte. */
export async function cancelInvitation(_previous: SharingActionState, formData: FormData): Promise<SharingActionState> {
  const invitation = ref(formData, "invitation");
  if (!invitation.success) return sharingError(SHARE_GONE);
  return asAccount(formData, async (db) => {
    const result = await data.cancelInvitation(db, invitation.data);
    return result === "cancelled" ? done(INVITATION_CANCELLED) : sharingError(SHARE_GONE);
  });
}

/**
 * Crée un lien d'invitation à la carte « map » (rôle, nombre d'usages, durée). Le jeton est renvoyé
 * une seule fois au navigateur, qui compose l'adresse du lien ; la base n'en garde que l'empreinte.
 */
export async function createLink(_previous: SharingActionState, formData: FormData): Promise<SharingActionState> {
  const map = ref(formData, "map");
  const options = linkOptionsSchema.safeParse({
    role: textField(formData, "role"),
    maxUses: textField(formData, "maxUses"),
    hours: textField(formData, "hours"),
  });
  if (!map.success || !options.success) return sharingError(SHARING_INVALID);
  return asAccount(formData, async (db) => {
    const token = await data.createLink(db, map.data, options.data);
    return done(LINK_CREATED, { link: token });
  });
}

/** Révoque le lien « link » d'une carte du compte. */
export async function revokeLink(_previous: SharingActionState, formData: FormData): Promise<SharingActionState> {
  const link = ref(formData, "link");
  if (!link.success) return sharingError(SHARE_GONE);
  return asAccount(formData, async (db) => {
    const result = await data.revokeLink(db, link.data);
    return result === "revoked" ? done(LINK_REVOKED) : sharingError(SHARE_GONE);
  });
}

/** Change le rôle (« role ») du membre « member ». */
export async function setMemberRole(_previous: SharingActionState, formData: FormData): Promise<SharingActionState> {
  const member = ref(formData, "member");
  const role = memberRoleSchema.safeParse(textField(formData, "role"));
  if (!member.success || !role.success) return sharingError(SHARE_GONE);
  return asAccount(formData, async (db) => {
    const result = await data.setMemberRole(db, member.data, role.data);
    return result === "updated" ? done(MEMBER_ROLE_UPDATED) : sharingError(SHARE_GONE);
  });
}

/** Retire le membre « member » d'une carte du compte. */
export async function removeMember(_previous: SharingActionState, formData: FormData): Promise<SharingActionState> {
  const member = ref(formData, "member");
  if (!member.success) return sharingError(SHARE_GONE);
  return asAccount(formData, async (db) => {
    const result = await data.removeMember(db, member.data);
    return result === "removed" ? done(MEMBER_REMOVED) : sharingError(SHARE_GONE);
  });
}

/** Accepte (« answer » = accept) ou refuse (refuse) l'invitation reçue « invitation ». */
export async function answerInvitation(_previous: SharingActionState, formData: FormData): Promise<SharingActionState> {
  const invitation = ref(formData, "invitation");
  const answer = invitationAnswerSchema.safeParse(textField(formData, "answer"));
  if (!invitation.success || !answer.success) return sharingError(JOIN_MESSAGES["not-found"]);
  return asAccount(formData, async (db) => {
    const { status, mapId } = await data.answerInvitation(db, invitation.data, answer.data === "accept");
    if (status === "joined" || status === "refused") return done(JOIN_MESSAGES[status], mapId ? { mapId } : {});
    return sharingError(JOIN_MESSAGES[status]);
  });
}

/** Quitte la carte partagée « map ». */
export async function leaveMap(_previous: SharingActionState, formData: FormData): Promise<SharingActionState> {
  const map = ref(formData, "map");
  if (!map.success) return sharingError(MAP_GONE_OR_FORBIDDEN);
  return asAccount(formData, async (db) => {
    const result = await data.leaveMap(db, map.data);
    return result === "left" ? done(MAP_LEFT) : sharingError(MAP_GONE_OR_FORBIDDEN);
  });
}

/** Aperçu du lien d'invitation de jeton « token » (sans le consommer). */
export async function previewLink(_previous: SharingActionState, formData: FormData): Promise<SharingActionState> {
  const token = linkTokenSchema.safeParse(textField(formData, "token"));
  if (!token.success) return sharingError(JOIN_MESSAGES["not-found"]);
  return asAccount(formData, async (db) => {
    const preview = await data.previewLink(db, token.data);
    return preview ? sharingSuccess("", { preview }) : sharingError(JOIN_MESSAGES["not-found"]);
  });
}

/** Rejoint la carte du lien d'invitation de jeton « token ». */
export async function acceptLink(_previous: SharingActionState, formData: FormData): Promise<SharingActionState> {
  const token = linkTokenSchema.safeParse(textField(formData, "token"));
  if (!token.success) return sharingError(JOIN_MESSAGES["not-found"]);
  return asAccount(formData, async (db) => {
    const { status, mapId } = await data.acceptLink(db, token.data);
    if (mapId && (status === "joined" || status === "already-member" || status === "owner")) {
      return sharingSuccess(JOIN_MESSAGES[status], { mapId });
    }
    return sharingError(JOIN_MESSAGES[status]);
  });
}
