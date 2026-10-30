import Link from "next/link";
import type { ReactNode } from "react";
import BackLink from "@/components/BackLink";
import SiteFooter from "@/components/SiteFooter";
import PageBackdrop from "@/components/backdrop/PageBackdrop";
import AccountBar from "@/components/auth/AccountBar";
import { navLink } from "@/components/auth/styles";
import { ACCOUNT_PAGE } from "@/features/account/notices";
import { CONTACTS_PAGE } from "@/features/contacts/paths";
import { MY_PROFILE_PAGE } from "../paths";

type Props = {
  title: string;
  /** Page affichée : son lien n'est pas répété dans la barre. */
  current?: "profil" | "contacts";
  children: ReactNode;
};

/**
 * Cadre des pages de profil et de contacts (mode compte) : retour à l'espace, « Mon profil »,
 * « Contacts », « Mon compte », compte connecté.
 */
export default function ProfileShell({ title, current, children }: Props) {
  return (
    <>
      <PageBackdrop variant="contours" />
      <main className="mx-auto max-w-[760px] px-6 pt-8 pb-[90px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BackLink href="/espace" label="Retour à mon espace" />
          <div className="flex flex-wrap items-center gap-3">
            {current !== "profil" && (
              <Link href={MY_PROFILE_PAGE} className={navLink}>
                Mon profil
              </Link>
            )}
            {current !== "contacts" && (
              <Link href={CONTACTS_PAGE} className={navLink}>
                Contacts
              </Link>
            )}
            <Link href={ACCOUNT_PAGE} className={navLink}>
              Mon compte
            </Link>
            <AccountBar />
          </div>
        </div>
        <h1 className="brut mt-[30px] mb-8 text-[clamp(28px,5vw,44px)] break-words">{title}</h1>
        <div className="grid gap-5">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}
