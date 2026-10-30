import type { Metadata } from "next";
import Link from "next/link";
import ExternalLink from "@/components/legal/ExternalLink";
import LegalDocument from "@/components/legal/LegalDocument";
import LegalSection from "@/components/legal/LegalSection";
import ProcessingCard from "@/components/legal/ProcessingCard";
import { list, paragraph, textLink } from "@/components/legal/prose";
import { MODERATION_TITLE, PROCESSINGS } from "@/features/legal/processing";
import { CNIL, CONTACT_EMAIL, CONTACT_MAILTO, DATA_PROVIDER, DSA, HOST, LCEN, MINIMUM_AGE, PUBLISHER } from "@/lib/legal";

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
        <p className={paragraph}>
          Quand ce texte désigne « l’éditeur » comme destinataire, il s’agit de l’éditeur et des personnes qu’il
          autorise à l’aider (administration technique, réponses aux messages, modération) : elles n’accèdent aux
          données que sous son autorité, selon ses instructions et tenues à la confidentialité (article 29 du RGPD).
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
        <p className={paragraph}>
          Pour les contenus que les membres rendent visibles à d’autres (profils, cartes partagées, carte collective),
          l’éditeur agit comme hébergeur : il informe les autorités compétentes des activités illicites qui lui sont
          signalées dans les cas prévus par l’{LCEN.hostArticle}, IV de la LCEN, et de toute information laissant
          soupçonner une infraction pénale qui menace la vie ou la sécurité de personnes (article 18 du {DSA.short}) ;
          il répond aussi aux réquisitions des autorités judiciaires prévues par la loi. Seules les données nécessaires
          sont alors communiquées.
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
            Les signalements et les décisions de modération (masquer, supprimer, suspendre des contributions) sont
            examinés et pris par des personnes, jamais par un traitement automatisé.
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
          situation particulière, aux traitements fondés sur l’intérêt légitime, selon l’article 21 du RGPD :
          « Sécurité et lutte contre les abus », « Journaux d’hébergement », et, pour leur part fondée sur
          l’intérêt légitime, « Carte collective et modération » (signalements, modération et journal des
          décisions), « {MODERATION_TITLE} » et « Demandes envoyées par e-mail » (hors demandes d’exercice de
          droits). Écrivez à {contact} ; le traitement cesse, sauf motifs légitimes et impérieux de l’éditeur
          (notamment la sécurité du service, ou le respect des règles de publication par tous les membres) ou
          constatation, exercice ou défense de droits en justice.
        </p>
        <p className={paragraph}>
          Le droit d’opposition ne s’applique pas à ce qui repose sur une obligation légale (article 6, paragraphe 1,
          point c) du RGPD) : le traitement des signalements de contenus illicites, la motivation des décisions de
          modération et l’information des autorités, dans la mesure où les obligations d’un hébergeur s’appliquent
          au service, ni aux demandes d’exercice de droits.
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
            de dernière connexion), votre profil s’il existe (identifiant, nom affiché, présentation, visibilité, dates de
            création, de modification et du dernier changement d’identifiant, image de l’avatar), les autres fichiers
            d’avatar en attente d’effacement (ancien avatar ou envoi interrompu ; d’ordinaire aucun), vos
            autorisations d’affichage de l’avatar d’autres membres (identifiant de l’avatar, échéance), votre jeton
            d’envoi d’avatar (nom du fichier attendu, échéance ; d’ordinaire aucun), vos contacts, vos demandes de
            contact en cours et les comptes que vous avez bloqués (identifiant et nom affiché de l’autre membre s’il vous
            est visible ; pour un blocage, seulement l’identifiant du membre au moment du blocage, s’il vous était
            visible ; dates), vos partages de cartes (cartes d’autres membres partagées avec vous, avec votre rôle et
            leur propriétaire ; invitations reçues encore valables ; membres, invitations en attente et liens d’invitation actifs de vos
            cartes, sans le jeton des liens, que la base ne conserve pas ; verrous d’édition en cours ; liens
            d’invitation que vous avez déjà utilisés), vos contributions à la carte collective (vos éléments, y compris
            masqués ; vos signalements ; les avis de modération qui vous concernent, avec leur motif, leur origine et la
            suspension éventuelle de vos contributions ; les décisions de modération qui visent vos éléments, même
            quand leur avis a été effacé, y compris votre retrait d’un élément masqué et la suppression d’un de vos
            liens masqués avec l’élément auquel il était rattaché ; votre suspension en cours et votre désignation comme
            modérateur ; les identifiants des éléments que vous avez publiés, avec l’indication de ceux qui ont été
            modérés ; si vous êtes modérateur, vos décisions), les compteurs anti-abus de votre
            compte tenus par la base (action, début de la fenêtre en cours, nombre d’appels) et toutes vos cartes (nom,
            dates, version, logo ou aperçu, contenu). Exceptions, pour protéger les droits d’autres membres (RGPD,
            article 15, paragraphe 4) : les blocages dont votre compte fait l’objet ne sont communiqués ni dans ce
            fichier ni sur demande (pour la sécurité du membre qui vous a bloqué) ; les décisions de modération sur
            vos éléments qui révèlent qu’un membre les a signalés (classement des signalements d’un de vos éléments,
            retrait par vous-même d’un élément signalé, lien signalé supprimé avec l’élément auquel il était
            rattaché) ne figurent pas dans ce fichier, mais vous pouvez les demander par e-mail : elles vous sont
            alors communiquées après un examen au cas par cas, sans ce qui permettrait d’identifier la personne qui
            a signalé (la personne qui signale n’y est jamais nommée ; seul le nombre de signalements y figure) ; les
            signalements qui visent vos éléments (motif, précisions, copie du contenu signalé, y compris un contenu
            modifié ou retiré depuis) ne figurent pas non plus dans ce fichier, mais vous pouvez les demander par
            e-mail : ils vous sont alors communiqués après un examen au cas par cas, sans ce qui permettrait
            d’identifier la personne qui a signalé. Les invitations et les liens d’invitation échus, en attente
            d’effacement, ne figurent pas dans ce fichier non plus : ils se demandent par e-mail ;
          </li>
          <li>
            de supprimer votre compte (droit à l’effacement, article 17) : après saisie de votre mot de passe et du mot
            « SUPPRIMER », le compte, son profil et son avatar, ses contacts, ses demandes de contact et ses blocages,
            ses partages (ses cartes, avec leurs membres, invitations et liens, et sa place dans les cartes des autres),
            ses éléments de la carte collective et les signalements qui les visent, ses signalements, ses avis de
            modération, sa suspension éventuelle et sa désignation comme modérateur (les décisions de modération restent au journal, un an, et les identifiants des éléments restent pris,
            sans l’identifiant du compte),
            toutes ses cartes et ses sessions sont supprimés
            immédiatement et définitivement
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
            la page{" "}
            <Link href="/profil" className={textLink}>
              Mon profil
            </Link>{" "}
            permet de créer, modifier et supprimer votre profil et son avatar (droits de rectification et à
            l’effacement) ;
          </li>
          <li>
            la page{" "}
            <Link href="/contacts" className={textLink}>
              Contacts
            </Link>{" "}
            permet d’annuler une demande envoyée, de refuser une demande reçue, de retirer un contact, de bloquer et de
            débloquer un membre (droits à l’effacement et d’opposition) ;
          </li>
          <li>
            dans votre espace, le bouton « Partager » d’une carte permet de changer le rôle de ses membres, de les
            retirer, d’annuler une invitation et de révoquer un lien ; la section « Partagées avec moi » permet de refuser
            une invitation et de quitter une carte (droits à l’effacement et d’opposition) ;
          </li>
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
          compte nécessite l’autorisation d’un titulaire de l’autorité parentale. Le service ne vérifie pas l’âge : cette
          condition figure dans les conditions d’utilisation, acceptées à la création du compte. Un titulaire de l’autorité parentale
          peut demander à tout moment, à {contact}, la suspension ou la suppression du compte d’un mineur de moins de{" "}
          {MINIMUM_AGE} ans dont il a la charge (et donc de son profil et de ses contributions visibles des autres
          membres).
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
            Cartes : un compte n’accède directement qu’à ses propres cartes, règle appliquée par la base de données
            elle-même (Row Level Security pour la lecture, le renommage et la suppression ; fonctions d’écriture qui
            vérifient le compte pour la création et l’enregistrement du contenu) en plus des contrôles du serveur. Les
            membres d’une carte partagée la lisent, et ses éditeurs la modifient, seulement par des fonctions de la
            base qui vérifient leur rôle et le verrou d’édition.
          </li>
          <li>
            Profils, contacts, partages et carte collective : un compte ne lit et ne supprime directement que son
            propre profil, et ne le crée ou ne le modifie que par des fonctions de la base qui en vérifient le
            contenu ; les relations entre membres, les partages et la carte collective sont fermés à tout accès direct
            et ne passent que par des fonctions de la base qui vérifient le compte connecté et appliquent les règles de
            visibilité, de rôle et de blocage, avec des limites anti-abus tenues par la base. Les avatars sont dans un
            espace de stockage privé, servis seulement aux membres connectés.
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
