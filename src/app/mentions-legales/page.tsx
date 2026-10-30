import type { Metadata } from "next";
import Link from "next/link";
import ExternalLink from "@/components/legal/ExternalLink";
import LegalDocument from "@/components/legal/LegalDocument";
import LegalSection from "@/components/legal/LegalSection";
import { list, paragraph, textLink } from "@/components/legal/prose";
import { CREDITS, NATURAL_EARTH } from "@/features/legal/credits";
import { CONTACT_EMAIL, CONTACT_LANGUAGES, CONTACT_MAILTO, DATA_PROVIDER, DSA, HOST, LCEN, PUBLISHER } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Mentions légales",
  description:
    "Éditeur, hébergeur, prestataire de données, signalement des contenus illicites, propriété intellectuelle et crédits de Stratavault.",
};

const SECTIONS = [
  { id: "editeur", title: "Éditeur" },
  { id: "hebergeur", title: "Hébergeur" },
  { id: "donnees", title: "Prestataire des comptes et des données" },
  { id: "signalement", title: "Contenus des membres et signalement" },
  { id: "propriete", title: "Propriété intellectuelle" },
  { id: "credits", title: "Crédits et licences" },
  { id: "frontieres", title: "Frontières, noms et statuts" },
] as const;

export default function MentionsLegalesPage() {
  const [editeur, hebergeur, donnees, signalement, propriete, credits, frontieres] = SECTIONS;
  const mail = (
    <a href={CONTACT_MAILTO} className={textLink}>
      {CONTACT_EMAIL}
    </a>
  );

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
          <li>Contact : {mail}.</li>
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
          Les comptes (authentification), les cartes enregistrées dans un compte, les profils et leurs avatars, les
          contacts, les partages de cartes et la carte collective sont confiés à {DATA_PROVIDER.service},
          service fourni par <strong>{DATA_PROVIDER.name}</strong>, {DATA_PROVIDER.address}. La base de données et
          l’authentification du projet sont hébergées chez {DATA_PROVIDER.region}. Les avatars sont conservés dans le{" "}
          {DATA_PROVIDER.avatarStorage}. Les e-mails de confirmation et de réinitialisation du mot de passe sont envoyés par le
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

      <LegalSection {...signalement}>
        <p className={paragraph}>
          Stratavault conserve des contenus fournis par ses membres et visibles d’autres membres connectés : profils
          (identifiant, nom affiché, présentation, avatar), cartes partagées entre membres et éléments de la carte
          collective. Pour ces contenus, l’éditeur agit comme hébergeur, au sens de l’{LCEN.hostArticle} de la LCEN et du{" "}
          {DSA.name}. Il ne les vérifie pas avant leur publication et n’a pas d’obligation générale de les surveiller ;
          il retire ou rend inaccessible promptement un contenu illicite dès qu’il en a connaissance.
        </p>
        <ul className={list}>
          <li>
            Point de contact unique, pour les autorités comme pour les utilisateurs (articles 11 et 12 du DSA) : {mail}.
            Langues acceptées : {CONTACT_LANGUAGES} (l’article 11, paragraphe 3 du DSA demande, pour les autorités,
            une langue officielle de l’État d’établissement et une langue largement comprise dans l’Union).
          </li>
          <li>
            Dans l’application, tout membre connecté peut signaler un élément de la carte collective depuis sa fiche,
            en choisissant un motif. Avec le motif « Contenu illicite », il doit expliquer pourquoi il estime le
            contenu illicite et déclarer de bonne foi que ses informations sont exactes et complètes ; l’élément est
            désigné par la fiche signalée et le signalement est rattaché à son compte, donc à son adresse e-mail,
            mais pas à son nom, que l’application ne demande pas. Ce signalement est traité comme une notification
            au sens de l’article 16 du DSA ; pour une notification qui comporte aussi son nom (article 16,
            paragraphe 2, c), il peut écrire à {mail} (ci-dessous). Les autres motifs signalent un manquement aux{" "}
            <Link href="/conditions#signalement" className={textLink}>
              conditions d’utilisation
            </Link>
            .
          </li>
          <li>
            Toute personne, membre ou non, peut signaler par e-mail à {mail} un contenu qu’elle estime illicite (article
            16 du DSA), en indiquant : les raisons pour lesquelles elle l’estime illicite ; où il se trouve (identifiant
            du profil, titre et sorte de l’élément de la carte collective et son emplacement, ou nom de la carte partagée
            et identifiant de son propriétaire) ; ses nom et adresse e-mail (sauf pour un contenu relevant des abus
            sexuels sur mineurs, de l’exploitation sexuelle d’enfants ou de la pédopornographie, articles 3 à 7 de la
            directive 2011/93/UE) ; et une déclaration confirmant qu’elle croit de bonne foi que les informations
            fournies sont exactes et complètes. Elle reçoit un accusé de réception, puis la décision prise et les voies
            de recours, à l’adresse depuis laquelle elle a écrit, même si son message ne comporte pas son nom (il est
            alors examiné, sans être une notification complète au sens de l’article 16). Dans l’application, les liens « Signaler ce profil » (page d’un profil) et « Signaler cette
            carte » (cartes partagées) préparent ce message.
          </li>
          <li>
            Les signalements sont examinés et les décisions sur un contenu publié prises par des personnes (l’éditeur
            et les modérateurs qu’il désigne), sans traitement automatisé ; seules des limites de volume et des règles
            de forme (caractères refusés, noms qui imitent l’équipe ou le service) s’appliquent automatiquement, à la
            saisie. L’auteur d’un contenu retiré, masqué ou restreint en est informé avec le motif de la décision (règle
            en cause et faits retenus ; pour un contenu jugé illicite, le texte de loi en cause et en quoi le contenu
            y contrevient), son origine et les voies de recours (voir les{" "}
            <Link href="/conditions#signalement" className={textLink}>
              conditions d’utilisation
            </Link>
            ).
          </li>
          <li>
            Moyens consacrés à la lutte contre les contenus et activités illicites : signalement dans l’application
            (carte collective) et par e-mail (liens « Signaler » à côté des profils et des cartes partagées) ; examen humain de chaque signalement par l’éditeur et par des modérateurs bénévoles qu’il
            désigne parmi les membres ; masquage, suppression et suspension des contributions de la carte collective,
            avec un journal des décisions ; limites anti-abus tenues par la base de données ; information des
            autorités ci-dessous.
          </li>
          <li>
            L’éditeur informe les autorités compétentes des activités illicites qui lui sont signalées dans les cas
            prévus par l’{LCEN.hostArticle}, IV de la LCEN, et de toute information laissant soupçonner une infraction
            pénale qui menace la vie ou la sécurité de personnes (article 18 du DSA).
          </li>
          <li>
            Présenter sciemment un contenu comme illicite pour en obtenir le retrait, en sachant cette information
            inexacte, est puni de {LCEN.abusiveNoticePenalty} ({LCEN.hostArticle}, VII de la LCEN).
          </li>
          <li>
            En France, le coordinateur pour les services numériques est l’{DSA.coordinator} (
            <ExternalLink href={DSA.coordinatorWebsite} />
            ), auprès de qui les utilisateurs d’un service peuvent déposer une plainte (article 53 du DSA).
          </li>
        </ul>
      </LegalSection>

      <LegalSection {...propriete}>
        <p className={paragraph}>
          Le logo, les textes et le code propres au site sont protégés par le droit d’auteur au profit de leurs auteurs.
          Toute reproduction ou réutilisation hors de l’usage normal du service nécessite leur accord préalable, sous
          réserve des licences des données et bibliothèques ci-dessous, qui restent la propriété de leurs auteurs.
        </p>
        <p className={paragraph}>
          Les cartes, profils et contributions des utilisateurs leur appartiennent (voir les{" "}
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
