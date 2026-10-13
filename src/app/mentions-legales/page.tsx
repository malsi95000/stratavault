import type { Metadata } from "next";
import Link from "next/link";
import ExternalLink from "@/components/legal/ExternalLink";
import LegalDocument from "@/components/legal/LegalDocument";
import LegalSection from "@/components/legal/LegalSection";
import { list, paragraph, textLink } from "@/components/legal/prose";
import { CREDITS, NATURAL_EARTH } from "@/features/legal/credits";
import { CONTACT_EMAIL, CONTACT_MAILTO, DATA_PROVIDER, HOST, LCEN, PUBLISHER } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Éditeur, hébergeur, prestataire de données, propriété intellectuelle et crédits de Stratavault.",
};

const SECTIONS = [
  { id: "editeur", title: "Éditeur" },
  { id: "hebergeur", title: "Hébergeur" },
  { id: "donnees", title: "Prestataire des comptes et des données" },
  { id: "propriete", title: "Propriété intellectuelle" },
  { id: "credits", title: "Crédits et licences" },
  { id: "frontieres", title: "Frontières, noms et statuts" },
] as const;

export default function MentionsLegalesPage() {
  const [editeur, hebergeur, donnees, propriete, credits, frontieres] = SECTIONS;

  return (
    <LegalDocument
      current="/mentions-legales"
      title="Mentions légales"
      lead={`Informations prévues par l’${LCEN.publisherArticle} de la ${LCEN.name}, dans sa rédaction issue de la ${LCEN.amendedBy}.`}
      sections={SECTIONS}
    >
      <LegalSection {...editeur}>
        <p className={paragraph}>
          Stratavault est un {PUBLISHER.project}, édité par <strong>{PUBLISHER.name}</strong>, {PUBLISHER.description}.
          Aucune société n’est enregistrée pour ce projet.
        </p>
        <ul className={list}>
          <li>Directeur de la publication : {PUBLISHER.name}.</li>
          <li>
            Contact : <a href={CONTACT_MAILTO} className={textLink}>{CONTACT_EMAIL}</a>.
          </li>
        </ul>
        <p className={paragraph}>
          L’éditeur publie son nom, mais ni son domicile ni son numéro de téléphone. L’{LCEN.publisherArticle}, II de la
          LCEN permet à un éditeur non professionnel de ne mettre à la disposition du public que le nom et l’adresse de
          l’hébergeur, sous réserve d’avoir communiqué à celui-ci ses éléments d’identification personnelle (
          {LCEN.personalIdentification}).
        </p>
      </LegalSection>

      <LegalSection {...hebergeur}>
        <ul className={list}>
          <li>{HOST.name}</li>
          <li>{HOST.address}</li>
          <li>{HOST.phone ? `Téléphone : ${HOST.phone}` : "Téléphone : non publié par l’hébergeur sur ses pages officielles."}</li>
          <li>
            Site : <ExternalLink href={HOST.website} />
          </li>
        </ul>
      </LegalSection>

      <LegalSection {...donnees}>
        <p className={paragraph}>
          Les comptes (authentification) et les cartes enregistrées dans un compte sont confiés à {DATA_PROVIDER.service},
          service fourni par <strong>{DATA_PROVIDER.name}</strong>, {DATA_PROVIDER.address}. Le projet est hébergé chez{" "}
          {DATA_PROVIDER.region}. Les e-mails de confirmation et de réinitialisation du mot de passe sont envoyés par le
          service d’e-mail de {DATA_PROVIDER.service}.
        </p>
        <p className={paragraph}>
          Le détail des données traitées figure dans la{" "}
          <Link href="/confidentialite" className={textLink}>
            politique de confidentialité
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection {...propriete}>
        <p className={paragraph}>
          Le logo, les textes et le code propres au site sont protégés par le droit d’auteur au profit de{" "}
          {PUBLISHER.name}. Toute reproduction ou réutilisation hors de l’usage normal du service nécessite son accord préalable, sous
          réserve des licences des données et bibliothèques ci-dessous, qui restent la propriété de leurs auteurs.
        </p>
        <p className={paragraph}>
          Les cartes créées par les utilisateurs leur appartiennent (voir les{" "}
          <Link href="/conditions" className={textLink}>
            conditions d’utilisation
          </Link>
          ).
        </p>
      </LegalSection>

      <LegalSection {...credits}>
        <p className={paragraph}>
          Géométries des pays : <ExternalLink href={NATURAL_EARTH.url}>{NATURAL_EARTH.name}</ExternalLink> (version{" "}
          {NATURAL_EARTH.version}, {NATURAL_EARTH.license}), au format TopoJSON fourni par world-atlas.
        </p>
        <p className={paragraph}>Bibliothèques libres utilisées, avec leur licence et leurs titulaires :</p>
        <ul className={list}>
          {CREDITS.map((credit) => (
            <li key={credit.pkg}>
              <ExternalLink href={credit.url}>{credit.name}</ExternalLink> — licence {credit.license}, © {credit.holder}
              {credit.notice ? ` ; ${credit.notice}` : ""}
            </li>
          ))}
        </ul>
        <p className={paragraph}>Polices : polices du système de votre appareil, aucune police téléchargée.</p>
      </LegalSection>

      <LegalSection {...frontieres}>
        <p className={paragraph}>
          Les frontières, noms et statuts des pays et territoires sont donnés à titre indicatif. Les tracés proviennent
          des données {NATURAL_EARTH.name} ; les noms et statuts (État membre de l’ONU, territoire, territoire disputé…)
          suivent des formulations neutres. Ils ne préjugent d’aucune position sur le statut juridique d’un territoire
          ni sur le tracé de ses frontières.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
