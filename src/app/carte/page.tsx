import type { Metadata } from "next";
import SessionProblem from "@/components/auth/SessionProblem";
import { getPageSession } from "@/features/auth/getPageSession";
import Editor from "@/features/editor/components/Editor";
import StorageScope from "@/features/editor/components/StorageScope";

export const metadata: Metadata = { title: "Carte" };

export default async function CartePage() {
  // Session vérifiée côté serveur : elle choisit le dépôt (compte ou démo locale choisie).
  const session = await getPageSession();
  if (session.kind === "unavailable" || session.kind === "signed-out") {
    return <SessionProblem kind={session.kind} retry="/carte" />;
  }
  const account = session.kind === "account" ? session.account : null;

  return (
    <StorageScope
      account={account}
      fallback={
        <div className="fixed inset-0 bg-bg">
          <p role="status" className="absolute top-1/2 left-1/2 m-0 -translate-1/2 text-mute">
            Chargement de la carte…
          </p>
        </div>
      }
    >
      <Editor account={account} />
    </StorageScope>
  );
}
