import type { Metadata } from "next";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import FlashToast from "@/components/FlashToast";
import SiteFooter from "@/components/SiteFooter";
import AccountBar from "@/components/auth/AccountBar";
import SessionProblem from "@/components/auth/SessionProblem";
import ClearDemoData from "@/features/account/components/ClearDemoData";
import { ACCOUNT_PAGE, spaceNotice } from "@/features/account/notices";
import { getPageSession } from "@/features/auth/getPageSession";
import Bank from "@/features/bank/components/Bank";
import StorageScope from "@/features/editor/components/StorageScope";

export const metadata: Metadata = { title: "Mon espace stratégique" };

export default async function EspacePage({ searchParams }: PageProps<"/espace">) {
  // Session vérifiée côté serveur : elle choisit le dépôt (compte ou démo locale choisie).
  const session = await getPageSession();
  if (session.kind === "unavailable" || session.kind === "signed-out") {
    return <SessionProblem kind={session.kind} retry="/espace" />;
  }
  const account = session.kind === "account" ? session.account : null;
  // Confirmation après l'effacement des données de démo (?donnees=effacees).
  const notice = account ? undefined : spaceNotice(await searchParams);

  return (
    <>
      {notice && <FlashToast message={notice} />}
      <main className="mx-auto max-w-[760px] px-6 pt-8 pb-[90px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BackLink href="/" label="Retour à l’accueil" />
          <div className="flex flex-wrap items-center gap-3">
            {account && (
              <Link
                href={ACCOUNT_PAGE}
                className="rounded border border-line bg-panel px-3 py-1.5 text-[13px] text-ink transition-colors duration-150 hover:border-mute"
              >
                Mon compte
              </Link>
            )}
            <AccountBar />
          </div>
        </div>
        <h1 className="brut mt-[30px] mb-8 text-[clamp(28px,5vw,44px)]">Mon espace stratégique</h1>
        <p className="mb-[22px] max-w-[60ch] text-mute">
          Retrouvez ici toutes vos cartes stratégiques enregistrées, ou repartez d’une carte vierge. Depuis la page
          d’édition, le bouton « Enregistrer dans la banque » ajoute ou met à jour la carte en cours.
        </p>
        <StorageScope
          account={account}
          fallback={
            <p role="status" className="mt-2.5 text-mute">
              Chargement de vos cartes…
            </p>
          }
        >
          <Bank remote={account !== null} />
        </StorageScope>
        {!account && (
          <section aria-labelledby="donnees-navigateur" className="mt-12 border-t border-line pt-6">
            <h2 id="donnees-navigateur" className="brut mb-2 text-[19px]">
              Données de ce navigateur
            </h2>
            <p className="mb-4 max-w-[60ch] text-[14px] text-mute">
              En mode démo, vos cartes ne sont enregistrées que dans ce navigateur. Vous pouvez les effacer, avec la vue
              mémorisée de l’éditeur. Exportez d’abord les cartes à garder (« Exporter », dans l’éditeur).
            </p>
            <ClearDemoData />
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
