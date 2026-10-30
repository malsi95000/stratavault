import type { Metadata } from "next";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import FlashToast from "@/components/FlashToast";
import SiteFooter from "@/components/SiteFooter";
import PageBackdrop from "@/components/backdrop/PageBackdrop";
import AccountBar from "@/components/auth/AccountBar";
import SessionProblem from "@/components/auth/SessionProblem";
import TermsChangeNotice from "@/components/legal/TermsChangeNotice";
import { navLink } from "@/components/auth/styles";
import ClearDemoData from "@/features/account/components/ClearDemoData";
import { ACCOUNT_PAGE, spaceNotice } from "@/features/account/notices";
import CollectiveEntry from "@/features/collective/components/CollectiveEntry";
import { readUnreadCollectiveNotices } from "@/features/collective/unreadNotices";
import { getPageSession } from "@/features/auth/getPageSession";
import Bank from "@/features/bank/components/Bank";
import { CONTACTS_PAGE } from "@/features/contacts/paths";
import StorageScope from "@/features/editor/components/StorageScope";
import { MY_PROFILE_PAGE } from "@/features/profiles/paths";
import SharedWithMe from "@/features/sharing/components/SharedWithMe";
import { termsChangeShownToAccount } from "@/features/legal/termsChangeForAccount";
import { readOwnSharedMapIds } from "@/features/sharing/ownSharedMaps";

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
  // Cartes du compte qui ont des membres : « Continuer » ouvre l'éditeur coopératif.
  const sharedMapIds = account ? await readOwnSharedMapIds() : [];
  // Avis de modération non lus de la carte collective (auteur d'un élément masqué ou supprimé).
  const unreadNotices = account ? await readUnreadCollectiveNotices() : 0;
  // Avis de changement des textes : comptes créés avant l'entrée en vigueur seulement.
  const showTermsChange = account ? await termsChangeShownToAccount() : false;

  return (
    <>
      {notice && <FlashToast message={notice} />}
      <PageBackdrop variant="graticule" />
      <main className="mx-auto max-w-[760px] px-6 pt-8 pb-[90px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BackLink href="/" label="Retour à l’accueil" />
          <div className="flex flex-wrap items-center gap-3">
            {account && (
              <>
                <Link href={MY_PROFILE_PAGE} className={navLink}>
                  Mon profil
                </Link>
                <Link href={CONTACTS_PAGE} className={navLink}>
                  Contacts
                </Link>
                <Link href={ACCOUNT_PAGE} className={navLink}>
                  Mon compte
                </Link>
              </>
            )}
            <AccountBar />
          </div>
        </div>
        <h1 className="brut mt-[30px] mb-8 text-[clamp(28px,5vw,44px)]">Mon espace stratégique</h1>
        {showTermsChange && <TermsChangeNotice />}
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
          <Bank remote={account !== null} sharedMapIds={sharedMapIds} />
        </StorageScope>
        {account && <SharedWithMe userId={account.userId} />}
        {account && <CollectiveEntry unreadNotices={unreadNotices} />}
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
