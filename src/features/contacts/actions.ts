"use server";

// Server Actions des contacts (mode compte seulement) : envoyer une demande, y répondre, l'annuler,
// retirer un contact, bloquer et débloquer un membre.
//
// Chacune : limite par IP avant tout appel à Supabase, session vérifiée auprès de l'API Auth
// (getUser, jamais getSession), compte attendu par la page (champ `account` : si un autre compte a
// été ouvert dans un autre onglet, rien n'est fait), entrées revalidées (zod), messages génériques.
// La base vérifie en plus auth.uid(), n'agit que sur les relations du compte et tient ses limites
// anti-abus par compte (supabase/migrations/20261018120000_contacts.sql). Protection CSRF : voir
// src/features/account/actions.ts.
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { RATE_LIMITED } from "@/features/auth/messages";
import { checkAttempt, clientIp, trustedProxyHops } from "@/features/auth/rateLimit";
import { textField } from "@/features/profiles/formState";
import * as data from "@/lib/supabase/contacts";
import { createClient, type ServerSupabaseClient } from "@/lib/supabase/server";
import { checkActiveUser } from "@/lib/supabase/user";
import { LEAVE_AFTER_SUCCESS, contactError, contactSuccess, type ContactActionState } from "./actionState";
import {
  BLOCK_MESSAGES,
  CONTACTS_FULL,
  CONTACT_RATE_LIMITED,
  CONTACT_REMOVED,
  CONTACT_SESSION_CHANGED,
  CONTACT_SESSION_ENDED,
  CONTACT_UNAVAILABLE,
  MEMBER_UNBLOCKED,
  NO_PROFILE,
  RELATION_GONE,
  REQUEST_ACCEPTED,
  REQUEST_CANCELLED,
  REQUEST_REFUSED,
  SEND_MESSAGES,
} from "./messages";
import { answerSchema, blockTargetSchema, memberHandleSchema, relationRefSchema } from "./schemas";

type Run = (db: ServerSupabaseClient) => Promise<ContactActionState>;

/** Exécute `run` pour le compte connecté, s'il est bien celui attendu par la page. */
async function asAccount(formData: FormData, run: Run): Promise<ContactActionState> {
  if (checkAttempt("contactWrite", clientIp(await headers(), trustedProxyHops())) !== "allowed") {
    return contactError(RATE_LIMITED);
  }
  const check = await checkActiveUser();
  if (check.status === "unavailable") return contactError(CONTACT_UNAVAILABLE);
  if (check.status === "signed-out") return contactError(CONTACT_SESSION_ENDED);
  if (textField(formData, "account") !== check.user.id) return contactError(CONTACT_SESSION_CHANGED);
  const db = await createClient();
  if (!db) return contactError(CONTACT_SESSION_ENDED);
  try {
    return await run(db);
  } catch (error) {
    return failureState(error);
  }
}

/** Message d'une erreur des données (déjà classée), sans jamais renvoyer l'erreur brute. */
function failureState(error: unknown): ContactActionState {
  if (!(error instanceof data.ContactDataError)) {
    console.error("[contacts] Erreur inattendue.");
    return contactError(CONTACT_UNAVAILABLE);
  }
  switch (error.kind) {
    case "no-profile":
      return contactError(NO_PROFILE);
    case "rate-limited":
      return contactError(CONTACT_RATE_LIMITED);
    case "unauthorized":
      return contactError(CONTACT_SESSION_ENDED);
    default:
      return contactError(CONTACT_UNAVAILABLE);
  }
}

/**
 * Succès : la page relit les listes. Sauf si le bouton quitte la page (champ « after » = leave : page
 * du profil d'un membre, qui peut ne plus être visible après un retrait, un refus, une annulation ou
 * un blocage) : relire la page n'y montrerait que « Profil introuvable » ; le navigateur va alors sur
 * la page « Contacts ».
 */
function done(formData: FormData, message: string): ContactActionState {
  if (textField(formData, "after") !== LEAVE_AFTER_SUCCESS) refresh();
  return contactSuccess(message);
}

/** Envoie une demande au membre d'identifiant exact (champ « handle »). */
export async function sendContactRequest(_previous: ContactActionState, formData: FormData): Promise<ContactActionState> {
  const handle = memberHandleSchema.safeParse(textField(formData, "handle"));
  if (!handle.success) return contactError(handle.error.issues[0].message);
  return asAccount(formData, async (db) => {
    const result = await data.sendContactRequest(db, handle.data);
    return result === "sent" ? done(formData, SEND_MESSAGES.sent) : contactError(SEND_MESSAGES[result]);
  });
}

/** Accepte (« answer » = accept) ou refuse (refuse) la demande reçue « request ». */
export async function answerContactRequest(_previous: ContactActionState, formData: FormData): Promise<ContactActionState> {
  const request = relationRefSchema.safeParse(textField(formData, "request"));
  const answer = answerSchema.safeParse(textField(formData, "answer"));
  if (!request.success || !answer.success) return contactError(RELATION_GONE);
  return asAccount(formData, async (db) => {
    if (answer.data === "accept") {
      const result = await data.acceptContactRequest(db, request.data);
      if (result === "accepted") return done(formData, REQUEST_ACCEPTED);
      return contactError(result === "contacts-full" ? CONTACTS_FULL : RELATION_GONE);
    }
    const result = await data.refuseContactRequest(db, request.data);
    return result === "refused" ? done(formData, REQUEST_REFUSED) : contactError(RELATION_GONE);
  });
}

/** Annule la demande envoyée « request ». */
export async function cancelContactRequest(_previous: ContactActionState, formData: FormData): Promise<ContactActionState> {
  const request = relationRefSchema.safeParse(textField(formData, "request"));
  if (!request.success) return contactError(RELATION_GONE);
  return asAccount(formData, async (db) => {
    const result = await data.cancelContactRequest(db, request.data);
    return result === "cancelled" ? done(formData, REQUEST_CANCELLED) : contactError(RELATION_GONE);
  });
}

/** Retire le contact « contact » (pour les deux membres). */
export async function removeContact(_previous: ContactActionState, formData: FormData): Promise<ContactActionState> {
  const contact = relationRefSchema.safeParse(textField(formData, "contact"));
  if (!contact.success) return contactError(RELATION_GONE);
  return asAccount(formData, async (db) => {
    const result = await data.removeContact(db, contact.data);
    return result === "removed" ? done(formData, CONTACT_REMOVED) : contactError(RELATION_GONE);
  });
}

/** Bloque un membre : « kind » = handle (identifiant exact), request ou contact (référence), « value ». */
export async function blockMember(_previous: ContactActionState, formData: FormData): Promise<ContactActionState> {
  const target = blockTargetSchema.safeParse({ kind: textField(formData, "kind"), value: textField(formData, "value") });
  if (!target.success) return contactError(target.error.issues[0]?.message ?? RELATION_GONE);
  return asAccount(formData, async (db) => {
    const result = await data.blockMember(db, target.data.kind, target.data.value);
    if (result === "blocked") return done(formData, BLOCK_MESSAGES.blocked);
    // Introuvable par identifiant : même texte qu'une demande (rien ne dit si l'identifiant existe).
    if (result === "not-found" && target.data.kind === "handle") return contactError(SEND_MESSAGES["not-found"]);
    return contactError(BLOCK_MESSAGES[result]);
  });
}

/** Lève le blocage « block ». */
export async function unblockMember(_previous: ContactActionState, formData: FormData): Promise<ContactActionState> {
  const block = relationRefSchema.safeParse(textField(formData, "block"));
  if (!block.success) return contactError(RELATION_GONE);
  return asAccount(formData, async (db) => {
    const result = await data.unblockMember(db, block.data);
    return result === "unblocked" ? done(formData, MEMBER_UNBLOCKED) : contactError(RELATION_GONE);
  });
}
