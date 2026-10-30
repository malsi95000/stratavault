import type { Metadata } from "next";
import SessionProblem from "@/components/auth/SessionProblem";
import { getPageSession } from "@/features/auth/getPageSession";
import CollectiveEditor from "@/features/collective/components/CollectiveEditor";
import CollectiveNoAccount from "@/features/collective/components/CollectiveNoAccount";
import { COLLECTIVE_TITLE } from "@/features/collective/messages";
import { COLLECTIVE_PAGE } from "@/features/collective/paths";

export const metadata: Metadata = { title: COLLECTIVE_TITLE, robots: { index: false } };

// Carte collective (CMY-01), comptes connectés seulement : sans session, le proxy renvoie d'abord à
// la connexion (y compris en mode démo). Session vérifiée ici auprès de l'API Auth (getUser) ; chaque
// lecture et chaque écriture de la carte est revérifiée par sa Server Action et par la base.
export default async function CollectiveMapPage() {
  const session = await getPageSession();
  if (session.kind === "unavailable" || session.kind === "signed-out") {
    return <SessionProblem kind={session.kind} retry={COLLECTIVE_PAGE} />;
  }
  if (session.kind === "demo") return <CollectiveNoAccount />;
  return <CollectiveEditor userId={session.account.userId} />;
}
