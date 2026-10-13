import Link from "next/link";
import { CONTACT_EMAIL, CONTACT_MAILTO, DATA_PROVIDER, LEGAL_PAGE } from "@/lib/legal";
import type { AccountDetails } from "@/lib/supabase/user";
import { formatAccountDate } from "../format";
import { NO_EMAIL } from "../messages";
import AccountSection from "./AccountSection";
import DeleteAccountDialog from "./DeleteAccountDialog";
import ExportDownload from "./ExportDownload";
import PasswordChange from "./PasswordChange";

const text = "m-0 max-w-[62ch] text-[14px] text-mute";
const term = "text-xs tracking-[.08em] text-mute uppercase";
const contactLink = "text-ink underline underline-offset-3";

type Props = {
  account: AccountDetails;
  /** Échec du dernier téléchargement des données (?erreur=…), déjà traduit. */
  exportError?: string;
};

/** Rubriques de la page « Mon compte » pour le compte vérifié par la page. */
export default function AccountPanel({ account, exportError }: Props) {
  const contact = (
    <a href={CONTACT_MAILTO} className={contactLink}>
      {CONTACT_EMAIL}
    </a>
  );

  return (
    <div className="grid gap-5">
      <AccountSection id="informations" title="Informations du compte">
        <dl className="m-0 grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr] sm:items-baseline">
          <dt className={term}>Adresse e-mail</dt>
          <dd className="m-0 break-all">{account.email ?? "aucune"}</dd>
          <dt className={term}>Compte créé le</dt>
          <dd className="m-0">{formatAccountDate(account.createdAt)}</dd>
        </dl>
        <p className={text}>Pour changer d’adresse e-mail, écrivez à {contact} depuis l’adresse du compte.</p>
      </AccountSection>

      <AccountSection id="donnees" title="Télécharger mes données">
        <p className={text}>
          Un fichier JSON avec la fiche du compte (identifiant, adresse e-mail, dates de création, de confirmation et de
          dernière connexion) et toutes vos cartes (nom, dates, contenu). Pour toute autre donnée vous concernant, écrivez
          à {contact}.
        </p>
        <ExportDownload key={exportError ?? ""} error={exportError} />
      </AccountSection>

      <AccountSection id="mot-de-passe" title="Changer mon mot de passe">
        <p className={text}>
          Un lien est envoyé à l’adresse du compte ; il ouvre la page où choisir un nouveau mot de passe.
        </p>
        {account.email ? (
          <PasswordChange email={account.email} />
        ) : (
          <p className={text}>
            {NO_EMAIL} Écrivez à {contact}.
          </p>
        )}
      </AccountSection>

      <AccountSection id="suppression" title="Supprimer mon compte" danger>
        <p className={text}>
          Supprime immédiatement et définitivement le compte, toutes ses cartes et ses sessions. Ce n’est pas
          réversible. Sauvegardes de la base chez {DATA_PROVIDER.service} : {DATA_PROVIDER.backupRetention} ; une copie
          peut y subsister jusqu’à l’expiration de la dernière sauvegarde qui la contient. Les journaux techniques de
          l’hébergeur et de {DATA_PROVIDER.service} ne sont pas effacés : ils suivent leurs propres durées (voir la{" "}
          <Link href={`${LEGAL_PAGE.privacy.href}#traitements`} className={contactLink}>
            politique de confidentialité
          </Link>
          ). Les cartes du mode démo enregistrées dans ce navigateur ne sont pas concernées.
        </p>
        {account.email ? (
          <div>
            <DeleteAccountDialog userId={account.id} email={account.email} />
          </div>
        ) : (
          <p className={text}>
            {NO_EMAIL} Écrivez à {contact}.
          </p>
        )}
      </AccountSection>
    </div>
  );
}
