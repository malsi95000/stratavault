"use server";

// Server Actions des formulaires de la carte collective (mode compte seulement) : signaler un
// élément, bloquer son auteur, décision de modération, suppression d'un de ses éléments masqués
// (fenêtre des avis).
//
// Chacune : limite par IP avant tout appel à Supabase, session vérifiée auprès de l'API Auth
// (getUser, jamais getSession), compte attendu par la page (champ `account`), entrées revalidées
// (zod), messages génériques. La base vérifie en plus auth.uid(), le rôle de modérateur, et tient
// ses limites anti-abus par compte (supabase/migrations/20261020120000_collective_map.sql).
// Protection CSRF : voir src/features/account/actions.ts.
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { checkAttempt, clientIp, trustedProxyHops } from "@/features/auth/rateLimit";
import { textField } from "@/features/profiles/formState";
import * as data from "@/lib/supabase/collective";
import { createClient, type ServerSupabaseClient } from "@/lib/supabase/server";
import { checkActiveUser } from "@/lib/supabase/user";
import { collectiveError, collectiveSuccess, type CollectiveActionState } from "./actionState";
import {
  ACTION_SESSION_CHANGED,
  BLOCK_AUTHOR_INVALID,
  BLOCK_AUTHOR_RATE_LIMITED,
  BLOCK_AUTHOR_RESULTS_TEXT,
  COLLECTIVE_RATE_LIMITED,
  COLLECTIVE_SESSION_ENDED,
  COLLECTIVE_UNAVAILABLE,
  HIDDEN_DELETED,
  MODERATE_INVALID,
  MODERATE_RATE_LIMITED,
  MODERATE_RESULTS_TEXT,
  MODERATION_FORBIDDEN,
  REPORT_INVALID,
  REPORT_RATE_LIMITED,
  REPORT_RESULTS_TEXT,
  REFUSED_UPDATE,
} from "./messages";
import { decisionReason } from "./decisionGrounds";
import { itemIdSchema, moderationSchema, reportSchema } from "./schemas";

type Run = (db: ServerSupabaseClient) => Promise<CollectiveActionState>;
type Messages = { invalid: string; rateLimited: string };

/** Exécute `run` pour le compte connecté, s'il est bien celui attendu par la page. */
async function asAccount(formData: FormData, messages: Messages, run: Run): Promise<CollectiveActionState> {
  if (checkAttempt("collectiveWrite", clientIp(await headers(), trustedProxyHops())) !== "allowed") {
    return collectiveError(COLLECTIVE_RATE_LIMITED);
  }
  const check = await checkActiveUser();
  if (check.status === "unavailable") return collectiveError(COLLECTIVE_UNAVAILABLE);
  if (check.status === "signed-out") return collectiveError(COLLECTIVE_SESSION_ENDED);
  if (textField(formData, "account") !== check.user.id) return collectiveError(ACTION_SESSION_CHANGED);
  const db = await createClient();
  if (!db) return collectiveError(COLLECTIVE_SESSION_ENDED);
  try {
    return await run(db);
  } catch (error) {
    if (!(error instanceof data.CollectiveDataError)) {
      console.error("[collective] Erreur inattendue (formulaire).");
      return collectiveError(COLLECTIVE_UNAVAILABLE);
    }
    switch (error.kind) {
      case "rate-limited":
        return collectiveError(messages.rateLimited);
      case "invalid":
        return collectiveError(messages.invalid);
      case "forbidden":
        return collectiveError(MODERATION_FORBIDDEN);
      case "unauthorized":
        return collectiveError(COLLECTIVE_SESSION_ENDED);
      default:
        return collectiveError(COLLECTIVE_UNAVAILABLE);
    }
  }
}

/**
 * Signale l'élément « item » (motif « reason », précisions « details » ; contenu illicite : précisions
 * obligatoires et déclaration de bonne foi « goodFaith » cochée).
 */
export async function reportCollectiveItem(_previous: CollectiveActionState, formData: FormData): Promise<CollectiveActionState> {
  const input = reportSchema.safeParse({
    item: textField(formData, "item"),
    reason: textField(formData, "reason"),
    details: textField(formData, "details"),
    goodFaith: textField(formData, "goodFaith"),
  });
  if (!input.success) return collectiveError(REPORT_INVALID);
  const { item, reason, details, goodFaith } = input.data;
  return asAccount(formData, { invalid: REPORT_INVALID, rateLimited: REPORT_RATE_LIMITED }, async (db) => {
    const result = await data.reportItem(db, item, reason, details, goodFaith);
    const message = REPORT_RESULTS_TEXT[result];
    return result === "reported" ? collectiveSuccess(message) : collectiveError(message);
  });
}

/**
 * Bloque l'auteur de l'élément « item » (visible pour le compte), même si son profil n'est visible que
 * de ses contacts : la base retrouve l'auteur, son identifiant de compte ne sort jamais.
 */
export async function blockCollectiveAuthor(_previous: CollectiveActionState, formData: FormData): Promise<CollectiveActionState> {
  const item = itemIdSchema.safeParse(textField(formData, "item"));
  if (!item.success) return collectiveError(BLOCK_AUTHOR_INVALID);
  return asAccount(formData, { invalid: BLOCK_AUTHOR_INVALID, rateLimited: BLOCK_AUTHOR_RATE_LIMITED }, async (db) => {
    const result = await data.blockAuthor(db, item.data);
    const message = BLOCK_AUTHOR_RESULTS_TEXT[result];
    return result === "blocked" ? collectiveSuccess(message) : collectiveError(message);
  });
}

/**
 * Décision « action » sur l'élément « item » (modérateurs seulement), avec la règle en cause « ground »,
 * le texte de loi en cause « legalBasis » (contenu illicite seulement) et les faits retenus « reason » :
 * le motif inscrit au journal et transmis à l'auteur est leur réunion (decisionGrounds.ts) ; « suspend » coché : contributions de l'auteur suspendues (masquer ou
 * supprimer seulement).
 */
export async function moderateCollectiveItem(_previous: CollectiveActionState, formData: FormData): Promise<CollectiveActionState> {
  const input = moderationSchema.safeParse({
    item: textField(formData, "item"),
    action: textField(formData, "action"),
    ground: textField(formData, "ground"),
    legalBasis: textField(formData, "legalBasis"),
    reason: textField(formData, "reason"),
    suspend: textField(formData, "suspend"),
  });
  if (!input.success) return collectiveError(MODERATE_INVALID);
  const { item, action, ground, legalBasis, reason, suspend } = input.data;
  return asAccount(formData, { invalid: MODERATE_INVALID, rateLimited: MODERATE_RATE_LIMITED }, async (db) => {
    const result = await data.moderateItem(db, item, action, decisionReason(ground, reason, legalBasis), suspend);
    const message = MODERATE_RESULTS_TEXT[result];
    if (result === "hidden" || result === "restored" || result === "deleted" || result === "dismissed") {
      // La file et le journal sont relus.
      refresh();
      return collectiveSuccess(message);
    }
    return collectiveError(message);
  });
}

/** Supprime définitivement l'élément masqué « item » du compte (liste « Vos éléments masqués » de la fenêtre des avis). */
export async function deleteOwnCollectiveItem(_previous: CollectiveActionState, formData: FormData): Promise<CollectiveActionState> {
  const item = itemIdSchema.safeParse(textField(formData, "item"));
  if (!item.success) return collectiveError(REFUSED_UPDATE["not-found"]);
  return asAccount(formData, { invalid: REFUSED_UPDATE.invalid, rateLimited: REFUSED_UPDATE["rate-limited"] }, async (db) => {
    const result = await data.deleteItem(db, item.data);
    return result.status === "deleted" ? collectiveSuccess(HIDDEN_DELETED) : collectiveError(REFUSED_UPDATE["not-found"]);
  });
}
