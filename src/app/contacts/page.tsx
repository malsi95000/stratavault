import type { Metadata } from "next";
import Link from "next/link";
import SessionProblem from "@/components/auth/SessionProblem";
import { navLink } from "@/components/auth/styles";
import AccountSection from "@/features/account/components/AccountSection";
import { getPageSession } from "@/features/auth/getPageSession";
import BlockedList from "@/features/contacts/components/BlockedList";
import ContactList from "@/features/contacts/components/ContactList";
import ContactsNoAccount from "@/features/contacts/components/ContactsNoAccount";
import RequestList from "@/features/contacts/components/RequestList";
import SendRequestForm from "@/features/contacts/components/SendRequestForm";
import { CONTACT_REQUESTS_PER_DAY, MAX_OUTGOING_REQUESTS } from "@/features/contacts/limits";
import { CONTACTS_ONLY_SEND_HINT, CONTACTS_PAGE_TITLE } from "@/features/contacts/messages";
import { CONTACTS_PAGE } from "@/features/contacts/paths";
import type { ContactOverview } from "@/features/contacts/types";
import ProfileShell from "@/features/profiles/components/ProfileShell";
import { MY_PROFILE_PAGE } from "@/features/profiles/paths";
import type { OwnProfile } from "@/features/profiles/types";
import { getContactOverview } from "@/lib/supabase/contacts";
import { getOwnProfile } from "@/lib/supabase/profiles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contacts", robots: { index: false } };

const text = "m-0 max-w-[62ch] text-[14px] text-mute";

/** Profil et relations du compte ; undefined si une lecture échoue (jamais pris pour « aucun contact »). */
async function readState(userId: string): Promise<{ profile: OwnProfile | null; overview: ContactOverview } | undefined> {
  const db = await createClient();
  if (!db) return undefined;
  try {
    const [profile, overview] = await Promise.all([getOwnProfile(db, userId), getContactOverview(db)]);
    return { profile, overview };
  } catch {
    return undefined;
  }
}

// « Contacts » (mode compte) : ajouter un contact par son identifiant exact, demandes reçues et
// envoyées, contacts, comptes bloqués. Session vérifiée auprès de l'API Auth (getUser). Il faut un
// profil pour envoyer ou recevoir des demandes ; on peut bloquer un membre sans profil.
export default async function ContactsPage() {
  const session = await getPageSession();
  if (session.kind === "unavailable" || session.kind === "signed-out") {
    return <SessionProblem kind={session.kind} retry={CONTACTS_PAGE} />;
  }
  if (session.kind === "demo") return <ContactsNoAccount />;
  const { userId } = session.account;
  const state = await readState(userId);
  if (!state) return <SessionProblem kind="unavailable" retry={CONTACTS_PAGE} />;
  const { profile, overview } = state;

  return (
    <ProfileShell title={CONTACTS_PAGE_TITLE} current="contacts">
      <AccountSection id="ajouter" title="Ajouter un contact">
        {profile ? (
          <>
            <p className={text}>
              Saisissez l’identifiant exact d’un membre : il n’existe ni annuaire, ni recherche par adresse e-mail. Il
              reçoit votre demande et voit votre profil tant qu’elle est en attente. Au plus {CONTACT_REQUESTS_PER_DAY}{" "}
              demandes par jour et {MAX_OUTGOING_REQUESTS} en attente.
            </p>
            {profile.visibility === "contacts" && <p className={text}>{CONTACTS_ONLY_SEND_HINT}</p>}
            <SendRequestForm userId={userId} />
          </>
        ) : (
          <>
            <p className={text}>
              Pour envoyer ou recevoir des demandes de contact, créez d’abord votre profil : vos contacts vous
              reconnaissent à votre identifiant.
            </p>
            <div>
              <Link href={MY_PROFILE_PAGE} className={navLink}>
                Créer mon profil
              </Link>
            </div>
          </>
        )}
      </AccountSection>
      <AccountSection id="recues" title={`Demandes reçues (${overview.incoming.length})`}>
        <RequestList userId={userId} requests={overview.incoming} direction="incoming" />
      </AccountSection>
      <AccountSection id="envoyees" title={`Demandes envoyées (${overview.outgoing.length})`}>
        <RequestList userId={userId} requests={overview.outgoing} direction="outgoing" />
      </AccountSection>
      <AccountSection id="contacts" title={`Mes contacts (${overview.contacts.length})`}>
        <p className={text}>
          Vos contacts voient votre profil même s’il est réservé à vos contacts. Retirer un contact ou bloquer un membre
          ne le prévient pas.
        </p>
        <ContactList userId={userId} contacts={overview.contacts} />
      </AccountSection>
      <AccountSection id="bloques" title={`Comptes bloqués (${overview.blocked.length})`}>
        <p className={text}>
          Un compte bloqué ne voit plus votre profil, ni votre avatar, et ne peut plus vous envoyer de demande. Pour lui,
          tout se passe comme si votre identifiant n’existait pas. De votre côté, son profil vous est masqué de la même
          façon tant que le blocage dure : seul l’identifiant qu’il avait au moment du blocage reste affiché ici.
        </p>
        <BlockedList userId={userId} blocked={overview.blocked} />
      </AccountSection>
    </ProfileShell>
  );
}
