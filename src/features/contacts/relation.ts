// Relation du compte connecté avec un membre, d'après ses listes (page du profil d'un membre).
import type { ContactOverview } from "./types";

export type Relation =
  | { kind: "none" }
  | { kind: "contact"; contactId: string }
  | { kind: "incoming"; requestId: string }
  | { kind: "outgoing"; requestId: string };

/**
 * Relation avec le membre d'identifiant `handle` (déjà normalisé), dont le profil vient d'être lu.
 * Pas de cas « bloqué » : un blocage, dans un sens ou dans l'autre, rend les deux profils invisibles
 * l'un à l'autre (la page du profil répond « introuvable »), et l'identifiant gardé avec un blocage
 * a pu passer depuis à un autre membre. Un blocage se lève depuis la page « Contacts ».
 */
export function relationWith(overview: ContactOverview, handle: string): Relation {
  const contact = overview.contacts.find((item) => item.handle === handle);
  if (contact) return { kind: "contact", contactId: contact.id };
  const incoming = overview.incoming.find((item) => item.handle === handle);
  if (incoming) return { kind: "incoming", requestId: incoming.id };
  const outgoing = overview.outgoing.find((item) => item.handle === handle);
  if (outgoing) return { kind: "outgoing", requestId: outgoing.id };
  return { kind: "none" };
}
