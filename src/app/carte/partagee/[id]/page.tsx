import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SessionProblem from "@/components/auth/SessionProblem";
import { getPageSession } from "@/features/auth/getPageSession";
import CoopEditor from "@/features/sharing/coop/CoopEditor";
import SharingNoAccount from "@/features/sharing/components/SharingNoAccount";
import { sharedMapPath } from "@/features/sharing/paths";
import { sharingRefSchema } from "@/features/sharing/schemas";

export const metadata: Metadata = { title: "Carte partagée", robots: { index: false } };

// Éditeur coopératif d'une carte (propriétaire, éditeurs, lecteurs), mode compte seulement. Session
// vérifiée auprès de l'API Auth (getUser). Le droit d'ouvrir la carte est vérifié par la base à chaque
// requête de l'éditeur (open_shared_map, verrou, enregistrement) : une carte inconnue et une carte
// sans accès donnent le même message.
export default async function SharedMapPage({ params }: PageProps<"/carte/partagee/[id]">) {
  const { id } = await params;
  if (!sharingRefSchema.safeParse(id).success) notFound();
  const session = await getPageSession();
  if (session.kind === "unavailable" || session.kind === "signed-out") {
    return <SessionProblem kind={session.kind} retry={sharedMapPath(id)} />;
  }
  if (session.kind === "demo") return <SharingNoAccount />;
  return <CoopEditor userId={session.account.userId} mapId={id} />;
}
