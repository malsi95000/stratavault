# Comptes Supabase

Sans configuration, Stratavault fonctionne en **mode démo** : les cartes restent dans le navigateur
(IndexedDB) et les formulaires de compte sont désactivés. Pour activer les comptes :

## 1. Créer le projet

1. Créez un projet sur [supabase.com](https://supabase.com) (région proche de vos utilisateurs).
2. **Project Settings → API Keys** : copiez l’URL du projet et la clé **publishable** (`sb_publishable_…`).
   N’utilisez **jamais** la clé secrète ni `service_role` : l’application la refuse.

## 2. Variables d’environnement

Copiez `.env.example` en `.env.local` (jamais versionné) et remplissez :

```
NEXT_PUBLIC_SUPABASE_URL=https://<projet>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
SITE_URL=https://votre-domaine.fr   # facultatif en local
```

Les variables `NEXT_PUBLIC_` sont figées à la compilation : relancez `npm run dev` ou `npm run build`
après les avoir modifiées. Sur l’hébergeur, déclarez les mêmes variables.

## 3. Base de données (cartes des comptes)

Les cartes des comptes sont stockées dans la table `public.maps`, créée par les fichiers de
`supabase/migrations/`. Appliquez-les **dans l’ordre de leur nom** (horodatage), une seule fois :

- **Depuis le tableau de bord** : **SQL Editor → New query**, collez le contenu de
  `supabase/migrations/20261005120000_maps.sql`, puis **Run** ; recommencez avec
  `supabase/migrations/20261006120000_maps_revision.sql` (colonne `revision`), puis avec
  `supabase/migrations/20261007120000_maps_revision_sequence.sql` (versions tirées d’une séquence
  globale). Un projet qui a déjà appliqué les premiers fichiers n’applique que les suivants : la banque
  du compte a besoin de `revision` (toutes ses requêtes la lisent) ; sans le troisième fichier, elle
  fonctionne, mais une carte supprimée puis recréée sous le même identifiant directement dans la base
  repartirait à la version 1 (l’application, elle, recrée toujours sous un nouvel identifiant).
- **Écritures par fonctions bornées** (deux fichiers, à appliquer **en deux temps** autour du
  déploiement de l’application, pour ne jamais bloquer les enregistrements) :
  1. `supabase/migrations/20261008120000_maps_write_functions.sql` : ajoute les fonctions
     `create_map` et `update_map_data`. Sans effet sur la version déjà en ligne, qui écrit encore
     directement dans la table ;
  2. déployez la version de l’application qui appelle ces fonctions (avant l’étape 1, elle ne peut
     pas enregistrer : « indisponible », modifications gardées dans le navigateur et renvoyées) ;
  3. `supabase/migrations/20261008120100_maps_revoke_direct_writes.sql` : retire les écritures
     directes du contenu. Appliquée avant l’étape 2, l’ancienne version verrait ses enregistrements
     refusés (« session terminée »).

  En local, ou si rien n’est encore en ligne, appliquez simplement les deux fichiers à la suite.
- **Suppression du compte** (page « Mon compte ») : `supabase/migrations/20261009120000_delete_my_account.sql`
  ajoute la fonction `delete_my_account()`. À appliquer **avant** de déployer la version de
  l’application qui contient `/compte` : sans elle, « Supprimer mon compte » répond « Le compte n’a
  pas pu être supprimé » (rien n’est effacé), le reste de l’application fonctionne.
- **Bêta 2.1** (format de carte v2, logo des cartes) : `supabase/migrations/20261014120000_maps_doc_v2.sql`
  puis `supabase/migrations/20261014120100_maps_cover.sql`. À appliquer **avant** de déployer la
  bêta 2.1 : elles acceptent tout ce qu’écrit la version précédente (cartes v1, mêmes fonctions). Sans
  elles, la bêta 2.1 ne fonctionne pas en mode compte : la liste de la banque échoue (colonne `cover`
  absente) et les cartes qui utilisent les nouveautés
  (fiches supplémentaires, catégories, styles) sont refusées (« carte invalide »). Les autres cartes
  passeraient : la bêta 2.1 les envoie sans les clés v2 vides (`portableDoc`), exactement au format v1.

Vérifiez ensuite dans **Database → Tables** que `maps` existe avec **RLS enabled**, dans
**Authentication → Policies** les quatre politiques `maps_select_own`, `maps_insert_own`,
`maps_update_own` et `maps_delete_own`, et dans **Database → Functions** `create_map`,
`update_map_data`, `set_map_cover` et `delete_my_account`.
- **Ou avec la CLI Supabase** : `npx supabase link --project-ref <projet>` puis `npx supabase db push`
  (le dossier `supabase/migrations/` est déjà au format attendu).

Ce que les migrations mettent en place :

- une ligne par carte : `id` (uuid), `user_id` (= `auth.uid()`, supprimé avec le compte), `name`
  (1 à 120 caractères), `data` (jsonb, borné à 8 Mo de texte), `stats` (nombre de pays annotés, liens,
  balises, zones et textes, calculé par un déclencheur : la liste des cartes ne lit jamais leur contenu),
  `created_at`, `updated_at` (mis à jour par un déclencheur quand le contenu change ; renommer une carte
  ne change pas sa date, comme dans la bêta), `revision` (version du contenu, attribuée par un
  déclencheur à la création et à chaque changement réel du contenu, tirée d’une séquence commune à
  toutes les cartes : une version n’est jamais attribuée deux fois, même à une carte supprimée puis
  recréée sous le même identifiant ; renvoyer une carte identique la fait remonter sans changer sa
  version, donc sans conflit sur les autres appareils) ; index `(user_id, updated_at desc)` ;
- **RLS activé** : chaque utilisateur connecté ne lit, crée, modifie et supprime que ses propres cartes
  (`auth.uid() = user_id`, avec `with check` à la création et à la modification) ;
- droits minimaux : rien pour `anon` ; `authenticated` lit et supprime ses cartes et les renomme
  (`name`) — jamais d’INSERT ni d’écriture directe de `data`, `user_id`, `stats`, `data_bytes`,
  `revision` ou des dates ;
- **contenu écrit uniquement par deux fonctions** (appelées en RPC, `EXECUTE` réservé à
  `authenticated`) : `create_map(p_name, p_data)` et `update_map_data(p_id, p_data,
  p_expected_revision)`. Elles reçoivent la carte en **texte** et, dans cet ordre : vérifient
  `auth.uid()` (non nul ; seules les cartes de cet utilisateur sont modifiées), refusent plus de
  **4 Mo** (octets, la limite de l’application) **avant** toute conversion en `jsonb`, vérifient la
  version attendue (`maps_conflict` sinon ; aucune ligne si la carte n’existe pas ou appartient à un
  autre compte), refusent les nombres écrits avec un exposant (`1e131071` s’écrirait en 131 072
  chiffres dans la base), puis contrôlent la forme à moindre coût : objet aux neuf clés d’une carte,
  clés connues pour chaque élément, au plus 20 000 éléments par collection, 50 000 en tout et
  200 000 sommets. Elles ne renvoient que `id`, `name`, `updated_at` et `revision`.
  `SECURITY DEFINER` avec `search_path = ''` et noms entièrement qualifiés : elles ne sont pas
  soumises à RLS, d’où leurs propres contrôles. Coût mesuré (PGlite, WebAssembly, plus lent qu’un
  serveur) : environ 1 s pour le contenu le plus fragmenté accepté (4 Mo, 2 millions de nombres),
  moins de 0,1 s pour refuser 8 Mo. Avant ces fonctions, un `POST /rest/v1/maps` de 8 Mo très
  fragmenté occupait l’API plus de 100 s ;
- **suppression de son propre compte** par la fonction `delete_my_account()` (RPC, sans argument,
  `EXECUTE` réservé à `authenticated`, `SECURITY DEFINER` avec `search_path = ''`) : elle refuse un
  appel sans `auth.uid()`, un jeton dont la session (claim `session_id`) n’existe plus dans
  `auth.sessions` (déconnexion, révocation), et un jeton sans authentification par **mot de passe
  datant de moins de 5 minutes** (claim `amr`, méthode `password` ; Supabase Auth date cette entrée de
  la saisie du mot de passe et ne la change pas au rafraîchissement de la session). Le mot de passe
  est donc exigé par la base elle-même : une copie du cookie de session ne permet pas d’appeler
  `/rest/v1/rpc/delete_my_account` directement, sauf dans les 5 minutes qui suivent une connexion par
  mot de passe (limite qui reste). Elle ne supprime que la ligne `auth.users` de `auth.uid()` ; les clés
  étrangères `on delete cascade` suppriment ensuite les cartes (`public.maps`) et, dans le schéma
  `auth` de Supabase, les identités, les sessions et leurs jetons de rafraîchissement. Elle
  s’exécute avec les droits du rôle qui applique la migration (`postgres` dans l’éditeur SQL), qui
  doit pouvoir lire `auth.sessions` et supprimer des lignes de `auth.users` : si l’appel échoue avec
  « permission denied for table sessions » ou « … table users », c’est ce droit qui manque. Une ligne qui référencerait l’utilisateur sans
  `on delete cascade` (fichiers de Supabase Storage par exemple, inutilisé ici) ferait échouer la
  suppression ;
- **format de carte v2** (bêta 2.1, `20261014120000_maps_doc_v2.sql`) : `maps_doc_is_valid` est
  remplacée (même signature) pour accepter, en plus des neuf clés d’une carte v1, les clés facultatives
  `fiches` (fiches supplémentaires par élément : 1 à 50 par élément, 5 000 en tout), `categories` (50 au
  plus, nom de 1 à 60 caractères) et `styles` (20 000 éléments au plus), et la palette étoffée des flux
  (22 couleurs, fonction `maps_flux_colors()`). Clés inconnues refusées à tous les niveaux ; couleurs :
  un jeton de la palette ou `#rrggbb` en minuscules ; identifiants et longueurs des textes vérifiés. Une
  carte v1 reste acceptée telle quelle ;
- **logo ou aperçu d’une carte** (bêta 2.1, `20261014120100_maps_cover.sql`) : colonne facultative
  `cover` (jsonb, 18 000 octets au plus), écrite uniquement par la fonction `set_map_cover(p_id,
  p_cover)` (RPC, `EXECUTE` réservé à `authenticated`, `SECURITY DEFINER`, seules les cartes de
  `auth.uid()`) : 16 000 octets au plus **avant** conversion, aucun nombre, puis forme exacte (icône
  `[a-z0-9-]`, couleur de la palette ; ou aperçu SVG de 12 000 octets au plus — une vignette —, sans
  script, lien, référence externe ni déclaration XML). Changer le logo ne change ni la date ni la
  version du contenu. Le logo n’entre pas dans le quota de 50 Mo du contenu : le stockage réel d’un
  compte est borné par 50 Mo + 500 × 18 Ko, soit environ **59 Mo**. La liste de la banque renvoie le
  logo de chaque carte (au plus 500 × 16 Ko, environ 8 Mo) : d’où des bornes petites. Le logo figure
  dans « Télécharger mes données » (champ `cover`, lu carte par carte avec le contenu) ;
- espace borné par compte : 500 cartes et 50 Mo de contenu au total (`data_bytes`, tenu par un
  déclencheur ; une modification qui n’agrandit pas une carte reste permise). Les écritures d’un même
  compte sont sérialisées par un verrou, pour que des écritures simultanées ne dépassent pas la limite.
  Sur un projet gratuit (base de 500 Mo), ajustez ces valeurs dans la migration et dans
  `src/features/maps/limits.ts` selon le nombre de comptes attendus.

Les politiques, les droits et les fonctions sont testés sur un vrai PostgreSQL (PGlite) par
`src/features/maps/migration.test.ts`, `writeFunctions.test.ts` et `writeFunctions.cost.test.ts`
(temps de traitement compris), `docV2.sql.test.ts` et `cover.sql.test.ts` (bêta 2.1), et `src/features/account/deleteMyAccount.sql.test.ts` pour la
suppression du compte.

## 4. Cartes : ce qui se passe dans l’application

- **Mode compte** (session ouverte) : les cartes passent uniquement par les Server Actions de
  `src/features/maps/actions.ts` (requêtes dans `src/lib/supabase/maps.ts` ; le contenu est envoyé
  en texte aux fonctions `create_map` et `update_map_data`). Chacune vérifie la session
  auprès de l’API Auth (`getUser()`, comme le chargement de `/carte` et `/espace`) : une session
  révoquée par « Se déconnecter » est refusée tout de suite, même avec une copie du cookie. Elle refuse la requête si la session appartient à un autre compte que celui pour
  lequel la page a été ouverte (déconnexion puis connexion dans un autre onglet), revalide l’identifiant
  (uuid), le nom et la carte (`parseMapDoc`, qui arrondit aussi chaque nombre au millionième : la taille
  vérifiée est celle stockée en `jsonb`), refuse une carte de plus de 4 Mo en JSON, filtre sur
  `user_id` en plus de RLS et ne renvoie que les champs affichés, avec des erreurs génériques.
  La taille des requêtes de Server Actions est portée à 5 Mo (`next.config.ts`,
  `experimental.serverActions.bodySizeLimit`).
- Le brouillon courant et la carte ouverte restent aussi dans le navigateur, dans une base IndexedDB
  **propre à chaque compte** (`stratavault-u-<id>`). Elle est effacée à la déconnexion, et celles d’autres
  comptes sont effacées quand un compte s’ouvre dans ce navigateur. Si la déconnexion n’a pas pu l’effacer
  (formulaire envoyé sans JavaScript, réponse perdue, session expirée), elle l’est à l’ouverture de la
  démo ou de la page de connexion sans session, sauf si elle contient une carte jamais envoyée au compte
  (gardée pour être renvoyée à la prochaine connexion).
- Si la session ne peut pas être vérifiée au chargement de `/carte` ou `/espace` (Supabase injoignable),
  la page affiche « Connexion indisponible » avec « Réessayer » : elle ne bascule jamais vers la démo,
  dont la base est partagée par tous les visiteurs de ce navigateur.
- Sauvegarde automatique une seconde après la dernière modification. Si le serveur est injoignable, les
  modifications restent dans le navigateur, un nouvel essai a lieu toutes les 10 secondes, et elles sont
  renvoyées au prochain chargement. S’il est injoignable dès le chargement, la copie du navigateur est
  affichée et sauvegardée localement ; la prochaine modification repart vers le compte quand le serveur
  répond.
- **Plusieurs appareils** : chaque envoi porte la version (`revision`) de la carte dont il dérive, et la
  base ne l’applique que si la carte en est toujours à cette version (`update … where revision = …`).
  Si la carte a été modifiée entre-temps sur un autre appareil ou dans un autre onglet, rien n’est
  écrasé : la version de ce navigateur est détachée de la banque, reste dans l’éditeur et est proposée
  à l’enregistrement sous un autre nom (avant « + Nouvelle carte », « Continuer » ou la déconnexion).
  Deux onglets de ce navigateur sur le même compte partagent la copie locale : l’onglet en retard est
  détaché, celui qui enregistre reste rattaché à la carte de la banque (y compris après rechargement),
  et chaque onglet affiche un avertissement dès qu’un autre onglet de l’éditeur est ouvert.
  La version de référence est aussi gardée dans le navigateur, pour les modifications renvoyées après
  un rechargement. L’application n’envoie jamais une modification sans version de référence : si elle
  est inconnue, absente ou illisible (dans le navigateur comme dans la requête reçue par le serveur),
  la carte est traitée comme modifiée ailleurs (rien n’est écrasé). « + Nouvelle carte » ne réécrit
  plus la carte active en mode compte (une carte supprimée sur un autre appareil n’est pas recréée).
- **Carte supprimée sur un autre appareil** : elle est détachée de la banque et reste dans l’éditeur
  (« Carte supprimée de la banque… »). « + Nouvelle carte » et « Continuer » proposent alors de
  l’enregistrer avant de la remplacer (Annuler garde la carte en cours). « Mettre à jour la banque » la
  recrée toujours sous un **nouvel identifiant choisi par la base**, jamais l’ancien : une copie périmée
  de la carte supprimée ne peut pas viser la nouvelle.
- Le statut d’enregistrement (dont le message de conflit) est affiché sous la barre du haut sur écran
  étroit, et doublé d’une notification pour un conflit ou une carte supprimée ailleurs.
- « Se déconnecter » propose d’abord d’enregistrer dans la banque une carte qui n’y est pas (sinon elle
  serait effacée de ce navigateur), envoie les modifications en attente et demande confirmation si
  certaines n’ont pas pu partir (y compris depuis un autre onglet). La copie locale n’est effacée
  qu’une fois la session fermée par le serveur : hors ligne, la déconnexion échoue et rien n’est perdu.
  Les autres onglets ouverts sur ce compte dans ce navigateur rechargent alors la page au lieu de
  continuer à écrire.
- Si Supabase est injoignable au moment de vérifier la session, les Server Actions répondent
  « indisponible » (nouvel essai automatique), et non « session expirée ».
- **Mode démo** (« Accès temporaire », ou Supabase non configuré) : rien ne change, tout reste dans la base
  IndexedDB historique `stratavault` du navigateur. Les cartes de démo ne sont pas copiées dans un compte :
  exportez-les puis importez-les une fois connecté. Sans contrôle de version local, deux onglets de
  l’éditeur ouverts en même temps s’écrasent (comme dans la bêta) : chaque onglet affiche un
  avertissement dès qu’un autre onglet de l’éditeur utilise la même base de ce navigateur.
- **Cartes importées** : en plus des bornes par collection (20 000 éléments, 20 000 sommets par
  tracé), une carte compte au plus 50 000 éléments en tout et 200 000 sommets de zones et de flux
  (`src/features/map-doc/types.ts`) ; l’éditeur applique les mêmes bornes. Le rendu des zones et des
  flux est lui aussi borné (`src/features/editor/shapeBudget.ts`, comme les arcs des liens) : un
  fichier hostile ne peut pas geler l’onglet.

## 5. Réglages d’authentification

Dans **Authentication** :

- **URL Configuration**
  - *Site URL* : `http://localhost:3000` en local, l’adresse publique en production.
  - *Redirect URLs* : ajoutez `http://localhost:3000/auth/confirm**` et `https://votre-domaine.fr/auth/confirm**`
    (`**` couvre le paramètre `?next=…`). Supabase refuse toute autre adresse de redirection.
- **Sign In / Providers → Email** : laissez **Confirm email** activé (sinon l’inscription peut révéler
  qu’une adresse a déjà un compte) et fixez **Minimum password length** à **12**.
- **Emails → Templates** (recommandé : le lien marche alors depuis n’importe quel navigateur) :
  - *Confirm signup* : `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/espace`
  - *Reset password* : `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/nouveau-mot-de-passe`

  Avec les modèles par défaut, le lien fonctionne aussi (paramètre `code`), mais seulement dans le navigateur
  qui a fait la demande.

  Le lien mène à une page « Continuer » : le jeton n’est consommé qu’au clic (les antivirus de messagerie
  qui ouvrent les liens ne le « grillent » pas, et un simple affichage piégé n’ouvre aucune session).
  Limite : le clic ouvre la session du compte auquel le lien appartient ; un tiers qui transmet un lien
  reçu pour **son** compte peut y connecter la victime. Atténuations : la page prévient de n’utiliser
  que ses propres liens ; une fois le jeton consommé, la page « Compte ouvert » (`/auth/compte`)
  affiche l’adresse du compte avant d’entrer, avec « Ce n’est pas mon compte — se déconnecter » ;
  l’adresse reste affichée sur /espace et dans l’éditeur. Limite résiduelle : une victime qui ne lit pas
  l’adresse et continue travaille dans le compte du tiers, qui peut lire ce qu’elle y enregistre. Seul
  un lien lié au navigateur qui a fait la demande (modèles d’e-mail par défaut, paramètre `code`, PKCE)
  l’empêche, au prix de liens qui ne marchent que dans ce navigateur.
- **Sign In / Providers → Email** : activez **Secure password change** (réauthentification exigée pour
  changer de mot de passe). L’application exige déjà, côté serveur, une authentification de moins de
  30 minutes (celle ouverte par le lien de réinitialisation) pour changer le mot de passe.
- **Page « Mon compte »** (`/compte`, protégée comme `/espace`, lien « Mon compte » depuis l’espace) :
  - **Télécharger mes données** : `GET /compte/export` (`src/app/compte/export/route.ts`) renvoie un
    fichier JSON compact (`Content-Disposition: attachment`, `Cache-Control: no-store`) avec la fiche
    du compte (identifiant, e-mail, dates de création, de confirmation et de dernière connexion,
    lues par `getUser()`) et toutes ses cartes (filtre `user_id` en plus de la RLS). Le fichier est
    produit en flux : la liste des cartes sans leur contenu, puis le contenu de chaque carte lu
    séparément (`data::text`, recopié sans être décodé) au rythme du téléchargement ; la mémoire du
    serveur reste bornée par la taille d’une carte. Un seul téléchargement à la fois par compte, deux
    par adresse IP et au plus 4 en même temps par instance du serveur
    (`src/features/account/exportSlots.ts`) ; une place est libérée à la fin du téléchargement, quand
    le fichier n’est plus lu (10 secondes sans première lecture, 2 minutes entre deux lectures) et au
    plus tard 15 minutes après son début. `HEAD /compte/export` est refusé (405) sans rien réserver
    ni compter : sinon Next.js y répondrait avec GET, dont le corps ne serait jamais lu. Une
    requête venue d’un autre site (en-tête `Sec-Fetch-Site` autre que `same-origin` ou `none`) est
    renvoyée vers `/compte` sans rien lire ni compter : un site tiers ne peut pas lire le fichier,
    mais il pourrait sinon épuiser le quota de téléchargements de la personne. En cas d’échec avant
    le début du fichier, retour à `/compte` avec un message ; une lecture qui échoue en cours de
    route interrompt le téléchargement (signalé comme échoué par le navigateur) ;
  - **Changer mon mot de passe** : envoie le lien du flux « mot de passe oublié » à l’adresse du
    compte (mêmes limites ; au-delà du plafond de l’adresse, rien n’est envoyé, et la page invite à
    réessayer dans une heure si le lien n’arrive pas) ;
  - **Supprimer mon compte** : Server Action `deleteMyAccount` (`src/features/account/actions.ts`).
    Elle vérifie la session (`getUser()`), que le compte est bien celui affiché par la page, le mot
    « SUPPRIMER », puis le mot de passe : un client Supabase **temporaire**, sans cookies ni stockage
    (`withPasswordSession`, `src/lib/supabase/passwordCheck.ts`), ouvre une session avec l’adresse et
    le mot de passe, et c’est avec le jeton de cette session toute neuve que `delete_my_account()` est
    appelée (la base exige un mot de passe saisi depuis moins de 5 minutes, voir plus haut). La
    session du navigateur n’est pas touchée ; la session temporaire est fermée ensuite. Enfin,
    effacement des cookies de session et du mode démo. Le navigateur efface la base locale du compte,
    ferme les autres onglets du compte (canal `stratavault-comptes`) et revient à l’accueil avec un
    message de confirmation : ce nettoyage se fait dans la suite de l’appel
    (`src/features/account/deleteFlow.ts`), car l’effacement des cookies fait re-rendre `/compte`
    dans la même réponse et démonte le dialogue. Protection CSRF :
    celle des Server Actions (POST uniquement, en-tête `Origin` comparé à l’hôte par Next.js) et
    cookies `SameSite=Lax` ;
  - en mode démo, `/espace` propose « Effacer les données de ce navigateur » (base IndexedDB
    `stratavault` et vue mémorisée), après confirmation ; les autres onglets de la démo se rechargent.
    Si un onglet garde la base ouverte au-delà de 3 secondes, l’effacement reste en attente et
    aboutit à sa fermeture (la page le dit) ; si le navigateur le refuse, rien n’est effacé.
- Pour la production, configurez un **SMTP** personnalisé : le service d’e-mail intégré est très limité.
- **Rate Limits** : toutes les requêtes arrivent à Supabase depuis le serveur de l’application, donc
  avec **son** adresse IP. Les limites « par IP » de Supabase sont ainsi partagées par tous les visiteurs :
  relevez-les (connexions, inscriptions, vérifications, rafraîchissement des jetons) en fonction de votre
  trafic. L’application applique ses propres limites (`src/features/auth/rateLimit.ts`), gardées en
  mémoire, par instance du serveur :
  - par IP du visiteur (y compris le clic « Continuer » des liens reçus par e-mail : 10 par IP en
    15 minutes, car chaque essai consomme la limite « token verifications » ou celle de `/token` de
    Supabase, elle aussi commune à tous les visiteurs ; épuiser `/token` bloquerait aussi les connexions
    et le rafraîchissement des sessions) ;
  - par couple (IP, adresse e-mail) : un tiers qui s’acharne sur l’adresse d’une victime n’épuise que
    son propre quota, la victime peut toujours se connecter ou demander un lien depuis son IP ;
  - un plafond par adresse, beaucoup plus haut, commun à toutes les IP (attaque distribuée). Pour la
    réinitialisation, au-delà de ce plafond, la réponse reste « e-mail envoyé » mais rien n’est envoyé.
    Limite connue : ce plafond (100 tentatives de connexion par 15 minutes) s’atteint avec une dizaine
    d’IP ou de préfixes IPv6 /64 (10 tentatives chacune). Un tiers qui dispose de quelques IP peut donc bloquer la connexion
    d’un compte précis, et recommencer à chaque fenêtre de 15 minutes, tant qu’il insiste. Seul le
    CAPTCHA ci-dessous règle ce point.

  - en IPv6, une IP compte pour tout son préfixe /64 (un abonnement ou un serveur en reçoit en général
    un entier : changer d’adresse à chaque requête ne donne pas de nouveau quota) ; une IPv4 écrite
    `::ffff:a.b.c.d` compte comme `a.b.c.d` ;
  - rafraîchissement des sessions par le proxy (`src/proxy.ts`, `src/lib/supabase/refreshGuard.ts`) :
    un cookie de session expiré coûte un appel à `/token` de Supabase, même s’il est faux. Ces
    rafraîchissements sont limités à 30 par IP en 5 minutes ; au-delà, la requête est traitée comme
    non connectée, sans appeler Supabase (un utilisateur réel derrière une IP très partagée peut voir
    « Session terminée » jusqu’à la fenêtre suivante). Les cookies restent dans la requête : « Se
    déconnecter » révoque quand même la session (quota séparé de 10 par IP en 15 minutes) et efface
    toujours les cookies dans la réponse ; si la révocation est impossible (quota atteint, Supabase
    injoignable), la page de connexion le signale au lieu d’afficher une déconnexion complète ;
  - page « Mon compte » : suppression du compte limitée à 10 essais par IP en 15 minutes (avant tout
    appel à Supabase) et à 5 par compte et par heure, toutes IP confondues (chaque essai vérifie le
    mot de passe, donc coûte un appel `/token`) ; téléchargement des données limité à 20 par IP en
    15 minutes et à 10 par compte et par heure (un téléchargement refusé parce qu’un autre est en
    cours ne compte pas). Un tiers muni d’une copie du cookie de session peut ainsi bloquer la
    suppression du compte depuis l’application pendant une heure ; il ne peut pas la faire sans le
    mot de passe, ni par l’application ni en appelant la base directement (voir `delete_my_account()`).

  La vraie protection contre les robots est le **CAPTCHA** : activez **Attack Protection → CAPTCHA**
  (Turnstile ou hCaptcha) en production, surtout si l’hébergeur lance plusieurs instances — il faudra
  alors ajouter le widget aux formulaires.
- L’IP du visiteur est lue dans `x-forwarded-for`, **à partir de la droite** (élément ajouté par le
  proxy de confiance ; ceux de gauche viennent du client). Ne publiez jamais `next start` directement :
  placez-le derrière l’hébergeur (Vercel, Netlify) ou un proxy inverse qui **écrase** l’en-tête
  (`proxy_set_header X-Forwarded-For $remote_addr;` avec nginx) ou y **ajoute** l’adresse vue. Avec
  plusieurs proxys en chaîne qui ajoutent chacun l’adresse, indiquez leur nombre dans
  `TRUSTED_PROXY_HOPS` (1 par défaut).

## Sécurité en bref

- Les mots de passe (12 caractères minimum, 72 octets maximum, limite de bcrypt) ne sont ni stockés ni hachés par l’application :
  Supabase Auth les hache avec **bcrypt** (sel compris). Ils ne sont jamais journalisés.
- Aucun client Supabase dans le navigateur : tout passe par le serveur (`src/lib/supabase/`, Server Actions,
  `src/proxy.ts`). Les cookies de session sont `HttpOnly`, `Secure` en production, `SameSite=Lax`.
- Sessions : `getClaims()` (signature du jeton, sans appel réseau) ne sert qu’aux redirections
  rapides du proxy et à l’affichage (adresse du compte). Toute décision d’accès qui compte passe par
  `getUser()`, qui interroge l’API Auth et répond `session_not_found` dès que la session a été
  révoquée par « Se déconnecter » : rendu de `/carte` et `/espace`, toutes les Server Actions des
  cartes, et le changement de mot de passe. Une copie du cookie volée avant la déconnexion n’y donne
  donc plus accès. Si l’API Auth est injoignable, la réponse est « indisponible » (nouvel essai),
  jamais « session terminée ». Jamais `getSession()`.
- Limite qui reste : l’API de données (PostgREST) ne vérifie que la signature du jeton d’accès. Avec
  une copie du cookie volée avant la déconnexion, on peut encore l’interroger **directement**
  (lire, renommer, supprimer les cartes du compte, écrire par les fonctions bornées) jusqu’à
  l’expiration du jeton : une heure par défaut. La suppression du compte n’en fait pas partie :
  `delete_my_account()` vérifie elle-même que la session existe encore et que le mot de passe a été
  saisi il y a moins de 5 minutes. Défense supplémentaire recommandée : raccourcir
  cette durée dans **Authentication → Sessions** (ou **Project Settings → JWT Keys** selon la
  version du tableau de bord, réglage *Access token expiry*), par exemple à **10 à 15 minutes** ; le
  proxy renouvelle la session des utilisateurs actifs sans qu’ils le voient (au prix d’un appel
  `/token` de plus : voir les limites de rafraîchissement ci-dessus).
- Messages d’erreur génériques : on ne peut pas savoir si une adresse possède un compte (seule exception,
  « adresse pas encore confirmée », que Supabase ne renvoie qu’avec le bon mot de passe).
- Tentatives limitées par IP et par couple (IP, adresse e-mail), plus un plafond par adresse qu’un tiers disposant d’une dizaine d’IP (ou de préfixes IPv6 /64) peut atteindre ; rafraîchissements de session limités par IP (blocage temporaire et renouvelable de la connexion de ce compte : activez le CAPTCHA) ; changement de mot de passe réservé à une session récente.
- Suppression du compte : mot de passe revérifié côté serveur sans toucher à la session, mot
  « SUPPRIMER » exigé, compte attendu par la page vérifié, fonction de la base qui ne peut viser que
  `auth.uid()` et exige un jeton d’une session encore ouverte, avec un mot de passe saisi depuis
  moins de 5 minutes.
- Redirections internes uniquement ; en-têtes de sécurité (CSP à nonce, HSTS en production…).
- Cartes : RLS strict (`auth.uid() = user_id`), droits par colonne, contenu écrit seulement par deux
  fonctions bornées (taille vérifiée avant lecture), Server Actions authentifiées et validées, copie
  locale cloisonnée par compte et effacée à la déconnexion.
- Limite connue de l’API de données : PostgREST lit le corps JSON de toute requête avant que la base
  ne refuse l’écriture. Les écritures directes sont refusées et les fonctions bornent ce que la base
  traite, mais un corps énorme envoyé directement à `/rest/v1/…` reste lu par PostgREST : surveillez
  **Reports → API** et, si besoin, limitez la taille des requêtes en amont.
