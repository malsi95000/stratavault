import type { Metadata } from "next";
import Link from "next/link";
import LegalDocument from "@/components/legal/LegalDocument";
import LegalSection from "@/components/legal/LegalSection";
import { list, paragraph, textLink } from "@/components/legal/prose";
import { BREACH_GROUNDS, GROUND_LABELS } from "@/features/collective/decisionGrounds";
import { CONTACT_EMAIL, CONTACT_MAILTO, DSA, INACTIVE_ACCOUNT_YEARS, MINIMUM_AGE, PUBLISHER } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Conditions d’utilisation",
  description: "Conditions générales d’utilisation de Stratavault, service gratuit en version bêta.",
};

const SECTIONS = [
  { id: "objet", title: "Objet" },
  { id: "acces", title: "Accès au service" },
  { id: "compte", title: "Compte" },
  { id: "contenus", title: "Vos contenus" },
  { id: "profil", title: "Votre profil" },
  { id: "contacts", title: "Contacts entre membres" },
  { id: "partage", title: "Cartes partagées" },
  { id: "collective", title: "Carte collective, signalement et modération" },
  { id: "signalement", title: "Signalement, décisions et recours" },
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
  const [
    objet,
    acces,
    compte,
    contenus,
    profil,
    contacts,
    partage,
    collective,
    signalement,
    interdits,
    suspension,
    propriete,
    responsabilite,
    donnees,
    modification,
    droit,
    contact,
  ] = SECTIONS;
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
            de l’autorité parentale est nécessaire. Ce titulaire peut demander à tout moment, à {mail}, la suspension
            ou la suppression du compte d’un mineur de moins de {MINIMUM_AGE} ans dont il a la charge.
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
            a accès, sauf les membres avec qui vous choisissez de partager une carte (voir « Cartes partagées »). En mode démo, elles restent dans le navigateur utilisé et sont accessibles à toute personne qui
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

      <LegalSection {...profil}>
        <ul className={list}>
          <li>
            Le profil est facultatif : il n’existe que si vous le créez sur la page « Mon profil » (mode compte
            seulement). Son identifiant, son nom affiché, sa présentation et son avatar sont visibles par les membres
            connectés qui saisissent votre identifiant exact, si vous choisissez la visibilité « tous les membres
            connectés » ; avec la visibilité « mes contacts seulement », par vos contacts et les membres à qui vous
            envoyez une demande de contact. Il n’existe ni annuaire des membres ni recherche par adresse e-mail.
          </li>
          <li>
            Quelle que soit cette visibilité, votre identifiant et votre nom affiché sont aussi montrés avec vos
            contributions à la carte collective (à tous les membres connectés), aux membres des cartes que vous
            partagez (y compris ceux arrivés par un lien d’invitation), à toute personne connectée qui ouvre
            un lien d’invitation d’une de vos cartes (avant même de la rejoindre, et même si elle ne la
            rejoint pas), aux contacts que vous invitez à une carte, au propriétaire des cartes partagées
            avec vous, et aux modérateurs quand un de vos éléments de la carte collective est signalé ou modéré.
            Les autres membres d’une carte partagée avec vous ne voient que votre nom affiché, et seulement quand
            vous la modifiez (« X modifie cette carte »).
          </li>
          <li>
            Vous accordez à l’éditeur, gratuitement et pour la seule durée de sa conservation, le droit de stocker votre
            profil et son avatar, de réencoder l’image et de les afficher aux membres connectés selon la visibilité
            choisie, dans le seul but de fournir le service.
          </li>
          <li>
            Votre profil doit respecter la loi et les droits des tiers. Il est interdit de se faire passer pour une autre
            personne ou pour l’équipe du service (identifiant, nom affiché, avatar), et d’y publier un contenu illicite,
            injurieux, diffamatoire, haineux, pornographique ou portant atteinte à la vie privée ou à l’image d’autrui
            (par exemple la photo d’une autre personne sans son accord).
          </li>
          <li>
            Pour signaler un profil contraire à ces règles, utilisez le lien « Signaler ce profil » de sa page, ou
            écrivez à {mail} en indiquant son identifiant et la raison du signalement. L’éditeur peut retirer un nom affiché, une présentation ou un avatar contraires à ces règles,
            ou supprimer le profil ; il vous en informe par e-mail et vous indique le motif, sauf obligation légale
            contraire (voir « Signalement, décisions et recours »). Vous pouvez répondre à la même adresse.
          </li>
          <li>Vous pouvez modifier ou supprimer votre profil et son avatar à tout moment depuis « Mon profil ».</li>
        </ul>
      </LegalSection>

      <LegalSection {...contacts}>
        <ul className={list}>
          <li>
            Avec un profil, vous pouvez envoyer une demande de contact à un membre dont vous connaissez l’identifiant
            exact. Tant qu’elle est en attente, il voit votre profil ; s’il l’accepte, vous voyez chacun le profil de
            l’autre, même réservé aux contacts. Chacun peut refuser une demande, l’annuler ou retirer un contact à tout
            moment, sans que l’autre en soit prévenu ; retirer un contact supprime aussi les invitations à une carte
            en attente entre vous (les cartes déjà rejointes restent).
          </li>
          <li>
            Vous pouvez bloquer un membre : le contact et les demandes entre vous sont supprimés, vous ne voyez plus vos
            profils l’un l’autre et il ne peut plus vous envoyer de demande ; vous êtes aussi chacun retiré des
            cartes partagées de l’autre (invitations comprises), et vous ne voyez plus vos éléments respectifs de
            la carte collective (ni ne pouvez les signaler). Il n’en est pas averti. Vous pouvez le bloquer depuis la
            page « Contacts », depuis son profil, ou depuis l’un de ses éléments de la carte collective (« Bloquer
            l’auteur », même si son profil n’est visible que de ses contacts), et le débloquer depuis la page
            « Contacts ».
          </li>
          <li>
            Il est interdit d’utiliser les demandes de contact pour harceler, solliciter en masse ou importuner un
            membre. Le nombre de demandes est limité ; un abus peut être signalé à {mail} et entraîner la suspension du
            compte (voir « Suspension et suppression »).
          </li>
        </ul>
      </LegalSection>

      <LegalSection {...partage}>
        <ul className={list}>
          <li>
            Avec un profil, vous pouvez partager une de vos cartes avec d’autres membres, en invitant un de vos contacts
            ou par un lien d’invitation, avec le rôle d’éditeur (il peut modifier la carte) ou de lecteur (il la
            consulte). Vous seul, propriétaire, pouvez renommer, supprimer ou partager la carte, changer le rôle de ses
            membres et les retirer ; chaque membre peut la quitter à tout moment.
          </li>
          <li>
            Une carte se modifie à plusieurs, une personne à la fois : celle qui la modifie la verrouille, les autres la
            voient en lecture seule avec son nom affiché, jusqu’à ce qu’elle rende la main (ou au bout de quelques minutes
            d’inactivité).
          </li>
          <li>
            Un lien d’invitation permet à toute personne connectée qui le reçoit de rejoindre la carte, dans la limite de
            son nombre d’usages et de sa durée : ne le confiez qu’à des personnes de confiance, et révoquez-le s’il
            circule au-delà. Les membres d’une carte peuvent en copier ou en exporter le contenu.
          </li>
          <li>
            Vous restez responsable du contenu de vos cartes, y compris des modifications faites par vos éditeurs ;
            chaque membre est responsable de ce qu’il y ajoute. Une carte partagée doit respecter la loi et les droits
            des tiers (voir « Vos contenus »). Il est interdit d’utiliser une carte partagée ou un lien d’invitation pour
            diffuser un contenu illicite ou pour importuner un membre. Un abus peut être signalé avec le lien
            « Signaler cette carte » (dans « Partagées avec moi » et dans l’éditeur de la carte) ou à {mail}.
          </li>
          <li>
            Un blocage entre deux membres retire chacun des cartes partagées de l’autre et supprime les
            invitations entre eux (voir « Contacts entre membres »).
          </li>
          <li>
            Vous accordez aux membres que vous invitez le droit de consulter la carte et, s’ils sont éditeurs, de la
            modifier, pour la seule durée du partage ; et à l’éditeur du service le droit de la leur afficher, dans le
            seul but de fournir le service.
          </li>
        </ul>
      </LegalSection>

      <LegalSection {...collective}>
        <ul className={list}>
          <li>
            La carte collective est commune à tous les membres connectés. Avec un profil, vous pouvez y ajouter des
            éléments (balises, points, textes, zones, liens, flux), signés de votre nom affiché et de votre identifiant
            public, et ne modifier ou supprimer que les vôtres. Ce que vous y publiez est visible par tous les membres
            connectés, avec cette signature, même si votre profil n’est visible que de vos contacts. Si vous supprimez
            votre profil, vos éléments ne sont plus montrés aux autres membres ; ils reviennent, signés, si vous en créez
            un nouveau.
          </li>
          <li>
            Ces contenus sont publiés par la communauté : l’éditeur du service ne les vérifie pas avant leur publication
            et ne les approuve pas. Chaque auteur est responsable de ce qu’il publie, qui doit respecter la loi, les
            droits des tiers et les règles de publication rappelées à l’entrée de la carte : pas de contenu illicite,
            haineux, violent ou diffamatoire, pas de harcèlement, pas de données personnelles d’autrui, pas
            d’information manifestement fausse présentée comme vraie, pas de publicité.
          </li>
          <li>
            Tout membre peut signaler un élément depuis sa fiche, en choisissant un motif ; pour un contenu illicite,
            il explique pourquoi il l’estime illicite et déclare de bonne foi que ses informations sont exactes et
            complètes. Un contenu illicite peut aussi être signalé à {mail}. Le signalement est transmis aux
            modérateurs sans le nom de son auteur, avec le contenu de l’élément au moment du signalement (s’il est modifié ensuite, les modérateurs
            voient les deux ; s’il est retiré par son auteur, le signalement reste soumis à leur décision). Un
            signalement traité peut être refait si l’élément a été modifié depuis.
          </li>
          <li>
            Des modérateurs désignés par l’éditeur examinent les signalements et peuvent masquer, rétablir ou supprimer
            un élément, ou classer les signalements. Chaque décision est motivée et enregistrée au journal de
            modération : un masquage ou une suppression indique la règle en cause, choisie parmi les motifs de
            retrait ci-dessous (pour un contenu illicite, avec le texte de loi en cause), et les faits retenus ; un
            rétablissement ou un classement indique qu’aucun manquement n’est retenu, et pourquoi. Supprimer un
            élément supprime aussi, au titre de la même décision, les liens de son auteur qui y sont rattachés.
            L’auteur d’un élément masqué, rétabli ou supprimé en est informé dans l’application (« Avis de
            modération »), avec le motif ; les membres qui l’avaient signalé sont informés de la décision et de son
            motif (règle en cause et faits retenus), avec le titre de l’élément, y compris d’un classement (l’auteur
            ne l’est pas d’un classement, qui laisse son élément inchangé). Si l’auteur supprime son compte avant la
            décision, ses éléments et les signalements qui les visent sont supprimés avec lui : il n’y a alors ni
            décision ni avis. Avec un
            masquage ou une suppression, les modérateurs peuvent suspendre pendant 30 jours vos contributions (ni ajout ni
            modification ; vous pouvez toujours supprimer vos éléments) ; rétablir l’élément lève cette suspension, sauf
            si une autre décision encore en vigueur la justifie. Un élément masqué n’est plus montré aux autres
            membres : seuls son auteur et les modérateurs le voient encore ; vous pouvez le supprimer définitivement à tout moment depuis « Avis de modération »
            (« Vos éléments masqués »), même après l’effacement de son avis. Un élément masqué ou supprimé ne peut pas être republié
            sous le même identifiant, pas plus que les liens supprimés avec lui, et le retrait par son auteur d’un
            élément masqué ou signalé reste inscrit au journal. Pour contester une décision, voir « Signalement,
            décisions et recours ». Des manquements répétés peuvent conduire à la suspension du compte (voir
            « Suspension et suppression »).
          </li>
          <li>
            Le nombre d’éléments, leur taille, ce que chacun peut publier en 24 heures et le nombre de signalements par
            jour sont limités pour prévenir les abus.
          </li>
          <li>
            Vous accordez aux membres connectés le droit de consulter vos éléments de la carte collective, et à
            l’éditeur du service le droit de les héberger et de les afficher, dans le seul but de fournir le service,
            tant qu’ils y figurent. Les membres peuvent copier ce qui y est affiché.
          </li>
        </ul>
      </LegalSection>

      <LegalSection {...signalement}>
        <p className={paragraph}>
          Ces règles valent pour tous les contenus que les membres rendent visibles à d’autres (profils, cartes
          partagées, carte collective). Pour ces contenus, l’éditeur agit comme hébergeur ; il applique les règles de
          signalement et de motivation des décisions du {DSA.short} (voir les{" "}
          <Link href="/mentions-legales#signalement" className={textLink}>
            mentions légales
          </Link>
          ).
        </p>
        <ul className={list}>
          <li>
            <strong>Signaler.</strong> Un élément de la carte collective se signale depuis sa fiche : pour un contenu
            illicite, le formulaire demande pourquoi il l’est et une déclaration de bonne foi ; le signalement est
            rattaché à votre compte (son adresse e-mail, mais pas votre nom, que l’application ne demande pas : pour
            une notification qui le comporte, écrivez à {mail}). Tout autre contenu (profil, carte partagée), ou un contenu illicite signalé par une personne qui
            n’est pas membre, se signale par e-mail à {mail} (les liens « Signaler ce profil » et « Signaler cette
            carte » préparent ce message), en indiquant les raisons du signalement, où se trouve le contenu, vos nom
            et adresse e-mail (sauf pour un contenu relevant des abus sexuels sur mineurs, de l’exploitation
            sexuelle d’enfants ou de la pédopornographie, articles 3 à 7 de la directive 2011/93/UE), et en
            confirmant que vous croyez de bonne foi que ces informations sont exactes et complètes. Vous recevez un
            accusé de réception puis la décision à l’adresse depuis laquelle vous avez écrit, même si votre message
            ne comporte pas votre nom (il est alors examiné, sans être une notification complète au sens du{" "}
            {DSA.short}).
          </li>
          <li>
            <strong>Motifs de retrait.</strong> Un contenu peut être masqué, retiré ou supprimé s’il est illicite ou
            contraire à ces conditions : {BREACH_GROUNDS.map((ground) => GROUND_LABELS[ground]).join(" ; ")}. Toute
            décision de masquage, de retrait ou de suppression indique lequel de ces motifs est en cause et, pour
            un contenu illicite, le texte de loi en cause ; un rétablissement ou un classement indique qu’aucun
            manquement n’est retenu.
          </li>
          <li>
            <strong>Mesures possibles.</strong> Selon la gravité et la répétition : masquage ou suppression d’un élément
            de la carte collective ; retrait d’un nom affiché, d’une présentation ou d’un avatar, ou suppression du
            profil ; pour une carte partagée, retrait du contenu en cause, révocation de ses liens d’invitation,
            retrait d’un membre ou arrêt du partage ; suspension de vos contributions à la carte collective pendant
            30 jours ; suspension ou suppression du compte (voir « Suspension et suppression »).
          </li>
          <li>
            <strong>Décisions humaines.</strong> Les signalements sont examinés et les décisions sur un contenu
            publié prises par des personnes (l’éditeur et les modérateurs qu’il désigne), sans traitement automatisé.
            Seuls s’appliquent automatiquement, à la saisie, des limites de volume (nombre d’ajouts, de signalements,
            de demandes, taille des contenus) et des règles de forme : caractères de contrôle et marques d’inversion du
            sens de lecture refusés dans les profils et dans les textes de la carte collective (pas dans le nom ni le
            contenu des cartes, partagées ou non), autres marques invisibles refusées aussi dans les profils,
            et refus des identifiants et des noms affichés qui imitent l’équipe ou le service (mots réservés, comme
            « admin », « modérateur » ou le nom du service, y compris sous une forme approchante, et « support » dans
            les identifiants). Ces règles empêchent l’enregistrement ; elles ne retirent jamais un
            contenu déjà publié.
          </li>
          <li>
            <strong>Information de l’auteur.</strong> L’auteur d’un contenu visé par une mesure en est informé au plus
            tard quand elle prend effet : dans l’application pour la carte collective (« Avis de modération »), par
            e-mail à l’adresse de son compte dans les autres cas. L’avis indique la mesure, sa durée s’il y a lieu, la
            règle de ces conditions en cause (parmi les motifs de retrait ci-dessus) et, pour un contenu jugé
            illicite, le texte de loi en cause et en quoi le contenu y contrevient, les faits retenus, si la
            décision fait suite à des signalements ou à l’initiative de la modération, qu’elle a été prise sans
            traitement automatisé, et les voies de recours. Il ne nomme pas le modérateur ; il ne nomme pas non plus
            le membre ou la personne qui a signalé, sauf, pour un signalement par e-mail, si c’est strictement
            nécessaire (par exemple, quand la personne signale une atteinte à ses propres droits). L’avis n’est
            pas envoyé si une obligation légale l’interdit (par exemple, à la demande d’une autorité).
          </li>
          <li>
            <strong>Recours.</strong> Vous pouvez contester une décision, que vous en soyez l’auteur ou que vous ayez
            fait le signalement, en écrivant à {mail} et en indiquant le contenu concerné : la décision est réexaminée
            par l’éditeur, qui peut l’annuler (par exemple en rétablissant l’élément). Vous pouvez aussi saisir les
            juridictions françaises (voir « Droit applicable »).
          </li>
          <li>
            <strong>Signalements abusifs.</strong> Signaler de façon répétée des contenus manifestement licites est un
            usage interdit et peut conduire à la suspension du compte ; présenter sciemment un contenu comme illicite
            pour en obtenir le retrait est en outre puni par la loi (voir les mentions légales).
          </li>
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
          <li>de créer des comptes en masse ou au nom d’autrui ;</li>
          <li>de se faire passer pour une autre personne ou pour l’équipe du service ;</li>
          <li>de harceler un membre ou de lui envoyer des demandes de contact ou des invitations non désirées ;</li>
          <li>de diffuser un lien d’invitation pour donner accès à une carte à des personnes que son propriétaire n’a pas choisies ;</li>
          <li>de publier dans la carte collective un contenu contraire à ses règles, ou de signaler abusivement les éléments d’autres membres.</li>
        </ul>
      </LegalSection>

      <LegalSection {...suspension}>
        <ul className={list}>
          <li>
            Vous pouvez supprimer votre compte à tout moment depuis la page « Mon compte », ou le demander par e-mail à{" "}
            {mail} ; ses cartes, son profil, ses contacts, ses partages, ses éléments de la carte collective et ses
            signalements sont supprimés avec lui (les membres de ses cartes partagées n’y ont alors plus accès).
          </li>
          <li>
            En cas de manquement à ces conditions, l’éditeur peut suspendre ou supprimer le compte concerné. Il vous en
            informe par e-mail, avec le motif et les voies de recours, au plus tard quand la mesure prend effet ; sauf
            urgence (atteinte à la sécurité du service ou aux droits d’autrui), il le fait avant.
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
          Le logo, les textes et le code propres au site sont protégés par le droit d’auteur au profit de leurs
          auteurs. Les données géographiques et les
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
          date de mise à jour. En cas de changement important, les titulaires d’un compte en sont informés à l’avance
          par e-mail, à l’adresse de leur compte, puis par un avis dans leur espace ; continuer d’utiliser le service
          après l’entrée en vigueur des nouvelles conditions vaut acceptation. Si vous ne les acceptez pas, vous pouvez
          télécharger vos données et supprimer votre compte à tout moment depuis la page « Mon compte ».
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
