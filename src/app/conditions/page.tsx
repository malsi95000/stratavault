import type { Metadata } from "next";
import Link from "next/link";
import LegalDocument from "@/components/legal/LegalDocument";
import LegalSection from "@/components/legal/LegalSection";
import { list, paragraph, textLink } from "@/components/legal/prose";
import { CONTACT_EMAIL, CONTACT_MAILTO, INACTIVE_ACCOUNT_YEARS, MINIMUM_AGE, PUBLISHER } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Conditions d’utilisation",
  description: "Conditions générales d’utilisation de Stratavault, service gratuit en version bêta.",
};

const SECTIONS = [
  { id: "objet", title: "Objet" },
  { id: "acces", title: "Accès au service" },
  { id: "compte", title: "Compte" },
  { id: "contenus", title: "Vos contenus" },
  { id: "interdits", title: "Usages interdits" },
  { id: "suspension", title: "Suspension et suppression" },
  { id: "propriete", title: "Propriété intellectuelle" },
  { id: "responsabilite", title: "Responsabilité" },
  { id: "donnees", title: "Données personnelles" },
  { id: "modification", title: "Modification des conditions" },
  { id: "droit", title: "Droit applicable" },
  { id: "contact", title: "Contact" },
] as const;

export default function ConditionsPage() {
  const [objet, acces, compte, contenus, interdits, suspension, propriete, responsabilite, donnees, modification, droit, contact] =
    SECTIONS;
  const mail = (
    <a href={CONTACT_MAILTO} className={textLink}>
      {CONTACT_EMAIL}
    </a>
  );

  return (
    <LegalDocument
      current="/conditions"
      title="Conditions d’utilisation"
      lead="Ces conditions encadrent l’utilisation de Stratavault. Créer un compte ou utiliser le service vaut acceptation de ces conditions."
      sections={SECTIONS}
    >
      <LegalSection {...objet}>
        <p className={paragraph}>
          Stratavault est un outil de cartes stratégiques interactives pour l’analyse géopolitique : annoter les pays,
          tracer des liens, des zones et des flux, placer des balises et des textes, et enregistrer ses cartes. Il est
          édité par {PUBLISHER.name} ({PUBLISHER.project}).
        </p>
      </LegalSection>

      <LegalSection {...acces}>
        <ul className={list}>
          <li>Le service est gratuit. Il peut être utilisé avec un compte ou en mode démo, sans compte.</li>
          <li>
            Il est en version bêta : il est fourni « en l’état », sans garantie de disponibilité, de continuité ni
            d’absence d’erreur. Il peut être interrompu, notamment pour maintenance, ou modifié à tout moment.
          </li>
          <li>
            En mode démo, les cartes ne sont enregistrées que dans votre navigateur : elles sont perdues si ses données
            sont effacées. Pensez à les exporter.
          </li>
        </ul>
      </LegalSection>

      <LegalSection {...compte}>
        <ul className={list}>
          <li>
            Le service s’adresse aux personnes de {MINIMUM_AGE} ans et plus ; avant cet âge, l’autorisation d’un titulaire
            de l’autorité parentale est nécessaire.
          </li>
          <li>Vous indiquez une adresse e-mail exacte, dont vous avez l’usage.</li>
          <li>
            Vous gardez votre mot de passe confidentiel et êtes responsable de l’utilisation de votre compte. En cas de
            doute, changez-le (« Mot de passe oublié ») et prévenez l’éditeur.
          </li>
          <li>Un compte par personne ; un compte est personnel et ne se partage pas.</li>
        </ul>
      </LegalSection>

      <LegalSection {...contenus}>
        <ul className={list}>
          <li>
            Les cartes que vous créez restent les vôtres. Les cartes d’un compte sont privées : aucun autre utilisateur n’y
            a accès. En mode démo, elles restent dans le navigateur utilisé et sont accessibles à toute personne qui
            utilise ce navigateur.
          </li>
          <li>
            Vous êtes seul responsable de leur contenu, qui doit respecter la loi et les droits des tiers, y compris leurs
            données personnelles.
          </li>
          <li>
            Vous accordez à l’éditeur, pour la seule durée de leur conservation et gratuitement, le droit de les stocker,
            de les copier techniquement et de vous les afficher, dans le seul but de fournir le service. L’éditeur ne les
            publie pas et ne les exploite pas autrement.
          </li>
          <li>Conservez vos propres copies (« Exporter ») : le service ne garantit pas la conservation de vos cartes.</li>
        </ul>
      </LegalSection>

      <LegalSection {...interdits}>
        <p className={paragraph}>Il est interdit :</p>
        <ul className={list}>
          <li>d’utiliser le service à des fins illégales ou pour stocker des contenus illicites ;</li>
          <li>
            de tenter d’accéder aux comptes ou aux données d’autrui, ou de contourner les mesures de sécurité et les
            limites du service ;
          </li>
          <li>
            de surcharger le service (envois automatisés, requêtes massives, robots) ou d’en perturber le fonctionnement ;
          </li>
          <li>de créer des comptes en masse ou au nom d’autrui.</li>
        </ul>
      </LegalSection>

      <LegalSection {...suspension}>
        <ul className={list}>
          <li>
            Vous pouvez supprimer votre compte à tout moment depuis la page « Mon compte », ou le demander par e-mail à{" "}
            {mail} ; ses cartes sont supprimées avec lui.
          </li>
          <li>
            En cas de manquement à ces conditions, l’éditeur peut suspendre ou supprimer le compte concerné, après vous en
            avoir informé, sauf urgence (atteinte à la sécurité du service ou aux droits d’autrui).
          </li>
          <li>
            Un compte resté sans connexion pendant {INACTIVE_ACCOUNT_YEARS} ans est supprimé, après un e-mail de
            prévenance.
          </li>
          <li>
            Si le service devait fermer, les titulaires d’un compte en seraient informés à l’avance pour pouvoir exporter
            leurs cartes.
          </li>
        </ul>
      </LegalSection>

      <LegalSection {...propriete}>
        <p className={paragraph}>
          Le logo, les textes et le code propres au site sont protégés par le droit d’auteur au profit de {PUBLISHER.name}.
          Les données géographiques et les
          bibliothèques libres utilisées restent la propriété de leurs auteurs, sous leurs licences (voir les{" "}
          <Link href="/mentions-legales" className={textLink}>
            mentions légales
          </Link>
          ).
        </p>
      </LegalSection>

      <LegalSection {...responsabilite}>
        <p className={paragraph}>
          Stratavault est un service gratuit édité par un particulier, à titre non commercial. L’éditeur s’efforce d’en
          assurer le bon fonctionnement et la sécurité, sans obligation de résultat. Dans les limites permises par la loi,
          il ne peut être tenu responsable des interruptions du service, de la perte de cartes non exportées, ni de
          l’usage fait des cartes et de leur contenu. Les frontières, noms et statuts affichés sont indicatifs. Rien dans
          ces conditions n’écarte la responsabilité de l’éditeur en cas de faute lourde ou intentionnelle.
        </p>
      </LegalSection>

      <LegalSection {...donnees}>
        <p className={paragraph}>
          Le traitement de vos données personnelles est décrit dans la{" "}
          <Link href="/confidentialite" className={textLink}>
            politique de confidentialité
          </Link>{" "}
          et la page{" "}
          <Link href="/cookies" className={textLink}>
            Cookies
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection {...modification}>
        <p className={paragraph}>
          Ces conditions peuvent évoluer avec le service. La version en vigueur est celle publiée sur cette page, avec sa
          date de mise à jour. En cas de changement important, les titulaires d’un compte en sont informés ; continuer
          d’utiliser le service vaut acceptation des nouvelles conditions.
        </p>
      </LegalSection>

      <LegalSection {...droit}>
        <p className={paragraph}>
          Ces conditions sont régies par le droit français. En cas de litige, une solution amiable est recherchée en
          premier lieu ; à défaut, les juridictions françaises sont compétentes.
        </p>
      </LegalSection>

      <LegalSection {...contact}>
        <p className={paragraph}>Pour toute question sur ces conditions : {mail}.</p>
      </LegalSection>
    </LegalDocument>
  );
}
