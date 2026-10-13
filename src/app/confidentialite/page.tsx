import type { Metadata } from "next";
import Link from "next/link";
import ExternalLink from "@/components/legal/ExternalLink";
import LegalDocument from "@/components/legal/LegalDocument";
import LegalSection from "@/components/legal/LegalSection";
import ProcessingCard from "@/components/legal/ProcessingCard";
import { list, paragraph, textLink } from "@/components/legal/prose";
import { PROCESSINGS } from "@/features/legal/processing";
import { CNIL, CONTACT_EMAIL, CONTACT_MAILTO, DATA_PROVIDER, HOST, MINIMUM_AGE, PUBLISHER } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description: "Données personnelles traitées par Stratavault, finalités, durées de conservation et droits.",
};

const SECTIONS = [
  { id: "responsable", title: "Responsable du traitement" },
  { id: "traitements", title: "Données traitées" },
  { id: "transferts", title: "Transferts hors de l’Union européenne" },
  { id: "absence", title: "Ce que Stratavault ne fait pas" },
  { id: "droits", title: "Vos droits" },
  { id: "reclamation", title: "Réclamation auprès de la CNIL" },
  { id: "mineurs", title: "Âge minimum" },
  { id: "securite", title: "Sécurité" },
  { id: "modifications", title: "Modifications" },
] as const;

export default function ConfidentialitePage() {
  const [responsable, traitements, transferts, absence, droits, reclamation, mineurs, securite, modifications] = SECTIONS;
  const contact = (
    <a href={CONTACT_MAILTO} className={textLink}>
      {CONTACT_EMAIL}
    </a>
  );

  return (
    <LegalDocument
      current="/confidentialite"
      title="Politique de confidentialité"
      lead="Cette page décrit les données personnelles traitées par Stratavault, pourquoi, combien de temps, et comment exercer vos droits (articles 13 et 15 à 22 du règlement général sur la protection des données, RGPD)."
      sections={SECTIONS}
    >
      <LegalSection {...responsable}>
        <p className={paragraph}>
          Le responsable du traitement est {PUBLISHER.name}, {PUBLISHER.description}, éditeur de Stratavault ({PUBLISHER.project}).
          Contact : {contact}.
        </p>
      </LegalSection>

      <LegalSection {...traitements}>
        <p className={paragraph}>
          Stratavault s’utilise avec un compte ou en mode démo, sans compte. Chaque traitement est décrit ci-dessous.
          Les cookies et stockages du navigateur sont détaillés sur la page{" "}
          <Link href="/cookies" className={textLink}>
            Cookies
          </Link>
          .
        </p>
        {PROCESSINGS.map((processing) => (
          <ProcessingCard key={processing.id} processing={processing} />
        ))}
      </LegalSection>

      <LegalSection {...transferts}>
        <p className={paragraph}>
          Les deux prestataires techniques de Stratavault sont des sociétés établies hors de l’Union européenne. Les
          transferts de données vers ces sociétés sont encadrés comme suit :
        </p>
        <ul className={list}>
          <li>
            {HOST.name} (hébergeur) : {HOST.transfers}.{" "}
            {HOST.dpaApplies ? (
              <ExternalLink href={HOST.dpa}>Accord de traitement des données</ExternalLink>
            ) : (
              <ExternalLink href={HOST.dpfList}>Liste officielle du Data Privacy Framework</ExternalLink>
            )}
            , <ExternalLink href={HOST.subprocessors}>liste des sous-traitants</ExternalLink>,{" "}
            <ExternalLink href={HOST.terms}>conditions</ExternalLink>,{" "}
            <ExternalLink href={HOST.privacyPolicy}>politique de confidentialité</ExternalLink>.
          </li>
          <li>
            {DATA_PROVIDER.name} ({DATA_PROVIDER.service}, comptes et base de données) : {DATA_PROVIDER.transfers}.{" "}
            <ExternalLink href={DATA_PROVIDER.dpa}>Accord de traitement des données</ExternalLink>,{" "}
            <ExternalLink href={DATA_PROVIDER.subprocessors}>liste des sous-traitants</ExternalLink>,{" "}
            <ExternalLink href={DATA_PROVIDER.residencyFaq}>lieux de stockage et transferts (FAQ)</ExternalLink>,{" "}
            <ExternalLink href={DATA_PROVIDER.privacyPolicy}>politique de confidentialité</ExternalLink>.
          </li>
        </ul>
        <p className={paragraph}>
          Les clauses contractuelles types figurent dans les accords de traitement des données publiés en ligne (liens
          ci-dessus) ; vous pouvez aussi en demander une copie à {contact}.
        </p>
      </LegalSection>

      <LegalSection {...absence}>
        <ul className={list}>
          <li>Aucun outil de mesure d’audience, aucune publicité, aucun traceur tiers.</li>
          <li>
            Aucun script ni aucune police chargés depuis un autre site ; la politique de sécurité du contenu (CSP) bloque
            les scripts que le site n’a pas autorisés et toute connexion des pages vers un autre site.
          </li>
          <li>Aucune vente ni location de données, aucun profilage.</li>
          <li>
            Aucune décision fondée exclusivement sur un traitement automatisé produisant des effets juridiques vous
            concernant ou vous affectant de manière significative de façon similaire (article 22 du RGPD). Le blocage
            temporaire après trop de tentatives (voir « Sécurité et lutte contre les abus ») n’a pas de tels effets.
          </li>
        </ul>
      </LegalSection>

      <LegalSection {...droits}>
        <p className={paragraph}>
          Vous disposez des droits d’accès, de rectification, d’effacement, de limitation du traitement, de portabilité et
          d’opposition (articles 15 à 21 du RGPD), ainsi que du droit de définir des directives sur le sort de vos données
          après votre décès (article 85 de la loi Informatique et Libertés).
        </p>
        <p className={paragraph}>
          <strong>Droit d’opposition.</strong> Vous pouvez vous opposer à tout moment, pour des raisons tenant à votre
          situation particulière, aux traitements fondés sur l’intérêt légitime : « Sécurité et lutte contre les abus »,
          « Journaux d’hébergement » et « Demandes envoyées par e-mail » (hors demandes d’exercice de droits), selon
          l’article 21 du RGPD. Écrivez à {contact} ; le
          traitement cesse, sauf motifs légitimes et impérieux de l’éditeur (notamment la sécurité du service) ou
          constatation, exercice ou défense de droits en justice.
        </p>
        <p className={paragraph}>
          Dans l’application, la page{" "}
          <Link href="/compte" className={textLink}>
            Mon compte
          </Link>{" "}
          (accessible depuis votre espace une fois connecté) permet :
        </p>
        <ul className={list}>
          <li>
            de télécharger toutes les données de votre compte (droits d’accès et à la portabilité, articles 15 et 20) :
            un fichier JSON avec la fiche du compte (identifiant, adresse e-mail, dates de création, de confirmation et
            de dernière connexion) et toutes vos cartes (nom, dates, version, contenu) ;
          </li>
          <li>
            de supprimer votre compte (droit à l’effacement, article 17) : après saisie de votre mot de passe et du mot
            « SUPPRIMER », le compte, toutes ses cartes et ses sessions sont supprimés immédiatement et définitivement
            de la base, et la copie de travail du compte est effacée de ce navigateur. Les sauvegardes et les journaux
            décrits plus haut suivent leurs propres durées de conservation ;
          </li>
          <li>de recevoir par e-mail un lien pour changer votre mot de passe.</li>
        </ul>
        <p className={paragraph}>Par ailleurs :</p>
        <ul className={list}>
          <li>« Exporter », dans l’éditeur, télécharge la carte ouverte au format JSON ;</li>
          <li>la banque de cartes permet de renommer et de supprimer chaque carte ;</li>
          <li>
            en mode démo, vos cartes ne sont que dans votre navigateur : « Effacer les données de ce navigateur », dans
            votre espace, les supprime avec la vue mémorisée de l’éditeur (vous pouvez aussi supprimer chaque carte
            depuis la banque, ou effacer les données du site dans les réglages du navigateur).
          </li>
        </ul>
        <p className={paragraph}>
          Pour toute autre demande (changement d’adresse e-mail, limitation, opposition, copie des journaux ou de toute
          autre donnée vous concernant…), écrivez à {contact} depuis l’adresse de votre compte, afin que la demande
          puisse être rattachée à celui-ci. Une réponse vous est apportée dans un délai d’un mois, prolongeable de deux
          mois si la demande est complexe, auquel cas vous en êtes informé (article 12 du RGPD).
        </p>
      </LegalSection>

      <LegalSection {...reclamation}>
        <p className={paragraph}>
          Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la{" "}
          {CNIL.name} : en ligne sur <ExternalLink href={CNIL.complaint}>cnil.fr</ExternalLink>, ou par courrier :{" "}
          {CNIL.address}. Site : <ExternalLink href={CNIL.website} />.
        </p>
      </LegalSection>

      <LegalSection {...mineurs}>
        <p className={paragraph}>
          Le service est destiné aux personnes de {MINIMUM_AGE} ans et plus. Avant {MINIMUM_AGE} ans, la création d’un
          compte nécessite l’autorisation d’un titulaire de l’autorité parentale.
        </p>
      </LegalSection>

      <LegalSection {...securite}>
        <ul className={list}>
          <li>
            Mots de passe : jamais stockés en clair ni journalisés ; {DATA_PROVIDER.service} Auth les hache avec bcrypt
            (sel compris).
          </li>
          <li>
            Session : cookies HttpOnly (illisibles par le JavaScript des pages), Secure en production, SameSite=Lax ; aucun
            client ni aucune clé d’API Supabase dans les pages : tout passe par le serveur de l’application.
          </li>
          <li>
            Cartes : chaque compte n’accède qu’à ses propres cartes, règle appliquée par la base de données elle-même
            (Row Level Security pour la lecture, le renommage et la suppression ; fonctions d’écriture qui vérifient le
            compte pour la création et l’enregistrement du contenu) en plus des contrôles du serveur.
          </li>
          <li>Échanges chiffrés en transit (HTTPS), en-têtes de sécurité stricts, tentatives limitées contre la force brute.</li>
        </ul>
      </LegalSection>

      <LegalSection {...modifications}>
        <p className={paragraph}>
          Cette politique peut évoluer avec le service. La date de dernière mise à jour figure en haut de la page ; en cas
          de changement important, les titulaires d’un compte en sont informés.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
