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

- **Bêta 2.1, profils et avatars** (DIV-03) : `supabase/migrations/20261017120000_rate_limits.sql`,
  puis `20261017120100_profiles.sql`, puis `20261017120200_avatars.sql`, puis
  `20261017120300_delete_my_account_avatars.sql`, **dans cet ordre**, après les deux fichiers
  précédents de la bêta 2.1. Ils n’ajoutent que de nouvelles tables, fonctions, politiques et déclencheurs (dont
  celles du compartiment Storage `avatars`, qu’ils créent) ; le dernier remplace
  `delete_my_account()` (même signature, mêmes droits) pour qu’elle refuse de supprimer un compte
  dont un fichier reste dans le compartiment `avatars`. La version en ligne et l’étape 1 de la
  bêta 2.1 continuent de fonctionner sans changement (leurs comptes n’ont pas d’avatar). À appliquer **avant** de
  déployer la version qui contient `/profil` : sans eux, « Mon profil » affiche « Connexion
  indisponible » et le téléchargement des données échoue (il lit le profil). `20261017120200_avatars.sql`
  écrit dans le schéma `storage` (ligne de `storage.buckets`, politiques et deux déclencheurs de
  `storage.objects`) : appliquez-le depuis l’éditeur SQL du tableau de bord (rôle `postgres`). S’il
  est refusé (droit manquant sur `storage.objects`), rien n’est appliqué : ne déployez pas, et
  demandez au support Supabase le droit `TRIGGER` sur cette table plutôt que de retirer les
  déclencheurs (sans eux, les adresses d’envoi signées contournent les limites des avatars). Vérifiez ensuite dans **Storage** que le
  compartiment `avatars` est **privé**, limité à `image/webp` et à 100 Ko.

- **Bêta 2.1, contacts** (DIV-02) : `supabase/migrations/20261018120000_contacts.sql`, **après** les
  quatre fichiers des profils et des avatars (le dernier étant
  `20261017120300_delete_my_account_avatars.sql`). Il ajoute trois tables (`contact_requests`, `contacts`,
  `contact_blocks`) et leurs fonctions, ajoute trois actions à la liste fermée de
  `public.rate_limits` (les lignes existantes restent valides) et remplace la fonction interne
  `public.profiles_visible_to` (mêmes paramètres, mêmes droits). La version en ligne, l’étape 1 et les
  profils continuent de fonctionner. À appliquer **avant** de déployer la version qui contient
  `/contacts` : sans lui, « Contacts » affiche « Connexion indisponible » et le profil d’un membre
  n’affiche pas ses boutons de contact (le téléchargement des données, lui, fonctionne : listes vides).

- **Bêta 2.1, partage et coopération** (CMY-02) : `supabase/migrations/20261019120000_map_sharing.sql`,
  **après** celui des contacts. Il ajoute cinq tables (`map_members`, `map_invitations`,
  `map_links`, `map_link_uses`, `map_locks`) et leurs fonctions, trois déclencheurs (sur `map_members`,
  `contact_blocks` et `profiles`), six actions à la liste fermée de `public.rate_limits` (les
  lignes existantes restent valides), et **remplace `public.update_map_data`** (mêmes paramètres, mêmes
  droits, même contrôle de version) pour laisser écrire les éditeurs qui tiennent le verrou
  d’édition. Pour un compte sans carte partagée, rien ne change : le propriétaire écrit comme avant
  tant que personne ne tient le verrou, et la version en ligne (qui ne connaît pas les verrous)
  continue de fonctionner ; quand une carte a des membres, chaque écriture du propriétaire qui change
  son contenu prend (ou renouvelle) le verrou pour deux minutes, pour que les membres voient qu’il la
  modifie (un contenu renvoyé tel quel, à l’ouverture d’une carte, ne prend ni ne heurte le verrou).
  Il n’écrit pas dans le schéma `storage` : éditeur SQL ou `db push`. À
  appliquer **avant** de déployer la version qui contient `/carte/partagee` : sans lui, « Partagées
  avec moi » affiche une erreur, « Partager » et l’éditeur coopératif « Connexion indisponible » (le
  téléchargement des données, lui, fonctionne : listes vides).

- **Bêta 2.1, carte collective et modération** (CMY-01, COM-01 à 03) :
  `supabase/migrations/20261020120000_collective_map.sql`, **après** celui du partage. Il ajoute neuf
  tables (`collective_items`, `collective_state`, `collective_reports`, `collective_decisions`,
  `collective_notices`, `moderators`, `collective_item_ids`, `collective_report_copies`,
  `collective_suspensions`), leurs
  déclencheurs et leurs fonctions, et six actions à la
  liste fermée de `public.rate_limits` (les lignes existantes restent valides). Il ne remplace
  aucune fonction et ne touche ni aux cartes, ni aux profils, ni à `delete_my_account` : la version
  en ligne, l’étape 1, les profils, les contacts et le partage continuent de fonctionner. Il n’écrit
  pas dans le schéma `storage` : éditeur SQL ou `db push`. À appliquer **avant** de déployer la
  version qui contient `/carte-collective` : sans lui, la carte collective affiche « Carte collective
  indisponible » (le téléchargement des données, lui, fonctionne : listes vides).

  **Désigner un modérateur** (éditeur SQL, en tant que `postgres` ; aucune fonction de l’API n’écrit
  cette table). Un modérateur autre que vous agit sous votre autorité et voit des données
  personnelles : faites-lui d’abord signer la charte des modérateurs (instructions écrites et
  engagement de confidentialité, `docs/legal.md`, point 22) et conservez-la. Retrouvez ensuite
  l’identifiant du compte dans **Authentication → Users**, puis

  ```sql
  insert into public.moderators (user_id) values ('<identifiant du compte>');
  -- retrait :
  delete from public.moderators where user_id = '<identifiant du compte>';
  ```

  Le lien « Modération » apparaît alors dans la barre de la carte collective (rechargez la page) et
  ouvre `/carte-collective/moderation` (file des éléments signalés ou masqués, décisions, journal).

  **Suspensions** : un modérateur qui masque ou supprime un élément peut cocher « Suspendre aussi les
  contributions de l’auteur » (30 jours : ni ajout ni modification ; supprimer ses éléments et
  signaler restent possibles, l’éditeur passe en « suppression seulement »). Rétablir l’élément revoit
  la suspension prononcée sur lui : elle est recalculée d’après les autres décisions encore en vigueur
  (suspension prononcée avec un autre élément toujours masqué ou supprimé), ou levée s’il n’en reste
  aucune. À la main
  (éditeur SQL) : `select user_id, until from public.collective_suspensions;` pour les voir,
  `delete from public.collective_suspensions where user_id = '<identifiant du compte>';` pour en
  lever une, ou un `insert` (`user_id`, `until`) pour en prononcer une sans élément.

  **Motif d’une décision** : la page de modération fait choisir la règle en cause parmi les « Motifs
  de retrait » de `/conditions` (`src/features/collective/decisionGrounds.ts`), puis les faits
  retenus ; le motif enregistré (`p_reason`, 3 à 500 caractères pour la base) commence par cette
  règle. `my_collective_notices()` renvoie aussi, pour un avis d’auteur, le nombre de signalements
  traités (`reports` ; 0 : initiative de la modération), affiché dans l’avis avec la mention d’une
  décision humaine sans traitement automatisé et les voies de recours (DSA art. 17.3).

- **Mesures de modération hors carte collective** (profils, cartes partagées, comptes ; signalements
  reçus par e-mail, `/conditions#signalement`). Aucune interface : éditeur SQL, en tant que
  `postgres`, et tableau de bord. Envoyez l’exposé des motifs par e-mail à l’adresse du compte
  (**Authentication → Users**) au plus tard quand la mesure prend effet (`docs/legal.md`, point 24) :
  mesure, durée, règle en cause (et texte de loi pour un contenu illicite), faits retenus, origine
  (signalement ou initiative de l’éditeur), décision humaine, voies de recours. Cet e-mail, gardé
  un an dans la messagerie de contact, est la trace de la mesure (traitement « Modération des
  profils, des cartes partagées et des comptes » de `/confidentialite`, registre 6 bis) ; envoyez
  aussi la décision à la personne qui a signalé, même si son message ne comportait pas son nom.
  Même procédure pour suspendre ou supprimer le compte d’un mineur de moins de 15 ans à la demande
  d’un titulaire de l’autorité parentale (`docs/legal.md`, point 25). Les blocs
  ci-dessous sont à adapter (`<…>`) et à exécuter un à un.

  ```sql
  -- Profil : retrouver le compte d'un identifiant public.
  select user_id, handle, display_name, avatar_id from public.profiles where handle = '<identifiant>';
  -- Retirer une présentation ou un nom affiché (le nom ne peut pas être vide : nom neutre).
  update public.profiles set bio = '' where user_id = '<compte>';
  update public.profiles set display_name = 'Membre' where user_id = '<compte>';
  -- Retirer l'avatar : d'abord la référence, puis le fichier (étape suivante).
  update public.profiles set avatar_id = null where user_id = '<compte>';
  ```

  Supprimez ensuite le fichier de l’avatar (nom : l’`avatar_id` relevé avant) dans **Storage →
  avatars** ; SQL ne peut pas l’effacer. Pour **supprimer un profil**, retirez d’abord tous les
  fichiers du compte dans **Storage → avatars** (requête des fichiers orphelins de cette section 3), puis
  `delete from public.profiles where user_id = '<compte>';` : ses contacts, demandes, membres de
  cartes, invitations et partages de ses cartes partent avec lui (cascade), et ses éléments de la
  carte collective ne sont plus montrés aux autres.

  ```sql
  -- Carte partagée : retrouver ses membres, invitations et liens.
  select id, user_id, name from public.maps where id = '<carte>';
  select user_id, role from public.map_members where map_id = '<carte>';
  -- Révoquer ses liens d'invitation, retirer un membre, ou arrêter tout le partage.
  delete from public.map_links where map_id = '<carte>';
  delete from public.map_members where map_id = '<carte>' and user_id = '<compte du membre>';
  delete from public.map_invitations where map_id = '<carte>';
  delete from public.map_members where map_id = '<carte>';
  ```

  **Retirer un contenu d’une carte partagée** : demandez-le d’abord à son propriétaire. À défaut,
  lisez `data` (`select data from public.maps where id = '<carte>';`), enregistrez-le dans un
  fichier `.json` hors du dépôt, ouvrez-le avec « Importer » dans l’éditeur en **mode démo**, retirez
  l’élément en cause, exportez la carte, puis remplacez le contenu dans l’éditeur SQL
  (`update public.maps set data = '<contenu exporté>'::jsonb where id = '<carte>';`) : la base
  change alors la révision de la carte (déclencheur), ce qui fait détecter le changement aux
  éditeurs ouverts.
  Supprimez ensuite la copie locale. Si le contenu illicite constitue toute la carte, arrêtez le
  partage (bloc ci-dessus) plutôt que de supprimer la carte de son propriétaire.

  **Suspendre un compte** (bannissement de Supabase Auth, réversible) :

  ```sql
  update auth.users set banned_until = now() + interval '<durée>' where id = '<compte>';
  delete from auth.sessions where user_id = '<compte>';
  -- levée :
  update auth.users set banned_until = null where id = '<compte>';
  ```

  Le compte ne peut plus se connecter ni rafraîchir sa session ; vérifiez avec un compte de test
  qu’une page déjà ouverte est bien déconnectée (un jeton d’accès déjà délivré peut rester valable
  jusqu’à son expiration, une heure par défaut). **Supprimer un compte** : procédure de la
  section 3 (avatars d’abord, puis l’utilisateur).

Vérifiez ensuite dans **Database → Tables** que `maps` existe avec **RLS enabled**, dans
**Authentication → Policies** les quatre politiques `maps_select_own`, `maps_insert_own`,
`maps_update_own` et `maps_delete_own`, et dans **Database → Functions** `create_map`,
`update_map_data`, `set_map_cover` et `delete_my_account`. Pour la bêta 2.1 : `profiles`,
`rate_limits`, `avatar_read_grants`, `avatar_upload_tickets`, `contact_requests`, `contacts`,
`contact_blocks`, `map_members`, `map_invitations`, `map_links`, `map_link_uses`, `map_locks`,
`collective_items`, `collective_state`, `collective_reports`, `collective_decisions`,
`collective_notices`, `moderators`, `collective_item_ids`, `collective_report_copies` et `collective_suspensions` avec **RLS enabled** ; seule `profiles` a des politiques (`profiles_select_own`,
`profiles_delete_own`) ; les autres n’en ont aucune (aucun accès par l’API, tout passe par les
fonctions).
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
  `on delete cascade` (fichiers de Supabase Storage par exemple) ferait échouer la
  suppression. Depuis la bêta 2.1 (`20261017120300_delete_my_account_avatars.sql`), elle refuse
  aussi (`account_avatars_remain`, rien n’est supprimé) tant qu’un fichier du compte reste dans le
  compartiment `avatars` (voir **avatars** ci-dessous) ;
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
- **profils** (bêta 2.1, `20261017120100_profiles.sql`) : table `public.profiles`, une ligne par
  compte qui a créé son profil sur `/profil` (jamais de création silencieuse) : `handle` (identifiant
  public, 3 à 30 caractères `a-z 0-9 _`, enregistré en minuscules ; forme repliée — 0 → o, 1 et
  l → i, 3 → e, 4 → a, 5 → s, 7 → t, 8 → b, « _ » retiré, puis rn → m et vv → w — **unique** (index
  `profiles_handle_fold_key` : « a1ice », « al_ice » ou « aiice » ne peuvent pas imiter « alice ») ;
  identifiants réservés refusés sous cette forme : la liste exacte, et tout identifiant qui
  **contient** admin, moderat, stratavault, officiel, official ou support), `display_name` (1 à
  50 caractères ; aucun mot qui, ramené à des lettres simples par NFKD, sans accents ni signes,
  et après conversion des lettres cyrilliques, grecques ou en petites capitales d’apparence latine
  — « Аdmin » avec un А cyrillique —, contient admin, moderat, stratavault, officiel ou official ; et
  « stratavault » est aussi cherché dans le nom entier sans ses espaces, « Strata Vault »), `bio` (280 caractères,
  6 lignes), `avatar_id`, `visibility` (`members` : tout compte connecté ; `contacts` : ses contacts
  et les membres à qui il a envoyé une demande en attente ; jamais un compte qu’il a bloqué), dates
  tenues par un déclencheur. Caractères de
  contrôle, invisibles, de remplissage (hangûl, braille vide, sélecteurs de variante, « étiquettes »,
  toute la propriété Unicode Default_Ignorable_Code_Point…) ou d’inversion du sens de lecture refusés ; nom sans espace Unicode au bord ni marque combinante
  au début (usurpation d’un nom, nom vide). **RLS** : chaque compte lit et supprime **sa** ligne
  seulement ; **aucune écriture directe** (ni INSERT ni UPDATE) : création et modification par
  `create_my_profile` et `update_my_profile` (RPC, `SECURITY DEFINER`, entrées bornées), qui
  comptent chaque essai d’identifiant **avant** de savoir s’il est pris et répondent
  `handle-taken` sans erreur (sinon l’erreur d’unicité, qui annule le compteur, dirait sans limite
  si un identifiant existe, même masqué). Les profils des autres ne se lisent **que** par
  `profile_by_handle(p_handle)` (RPC, `SECURITY DEFINER`, identifiant **exact**, casse ignorée), qui
  applique la règle de visibilité (`profiles_visible_to`, seule source de la règle, remplacée par la
  migration des contacts), ne renvoie jamais `user_id` et répond pareil pour un identifiant inconnu
  ou un profil masqué. Aucune liste des membres, aucune recherche par adresse e-mail. Limites de la
  base par compte (`public.rate_limits`, `20261017120000_rate_limits.sql`, table sans aucun droit pour
  l’API ; chaque compte relit les siens par `my_rate_limits()`, pour l’export) : 30 essais
  d’identifiant par jour, 5 créations de profil et 5 changements d’identifiant réussis par jour,
  50 changements de nom affiché par jour (`profile_change` ; un enregistrement qui ne change pas le
  nom ne compte pas ; au-delà, `update_my_profile` répond `rate-limited` sans erreur),
  300 consultations de profil par heure. Le profil est supprimé avec le compte (`on delete cascade`) ;
- **avatars** (bêta 2.1, `20261017120200_avatars.sql`) : compartiment Storage **privé** `avatars`
  (WebP seulement, 100 Ko), fichiers `<avatar_id>` (uuid aléatoire) : le nom ne contient **pas**
  l’identifiant du compte ; la propriété se lit dans `owner_id`, rempli par l’API Storage avec le
  `sub` du jeton. L’image envoyée sur `/profil` est vérifiée par sa signature (PNG, JPEG ou WebP ; SVG
  refusé), bornée à 2 Mo et 4 096 pixels de côté, puis **réenregistrée par le serveur** (sharp : WebP
  256 × 256, sans métadonnées). Un compte peut toutefois envoyer d’autres octets directement à l’API
  Storage avec son jeton (la base ne voit pas le contenu) : la route d’affichage revérifie donc
  chaque fichier (WebP 256 × 256, une image) et le **réencode** avant de le servir. Politiques de
  `storage.objects` (compartiment `avatars` seulement, rôle `authenticated`) : lecture de ses
  fichiers (`owner_id`) et, pendant **une minute** après `open_avatar_read(p_avatar)`, de l’avatar
  actuel d’un profil visible (autorisation dans `public.avatar_read_grants`, table sans aucun droit
  pour l’API ; 600 demandes par heure) : l’API Storage applique la même politique à la liste du
  compartiment, qui ne montre donc jamais les avatars des autres ; envoi d’un fichier à soi, nom
  exact, profil existant, deux fichiers au plus, **jeton d’envoi** en cours pour ce nom ; suppression
  de ses fichiers sauf l’avatar actuel ; ni modification ni remplacement. Ces politiques ne voient
  qu’une écriture « sonde » : l’API Storage les évalue avec le rôle du compte, dans un `SAVEPOINT`
  aussitôt annulé, puis écrit la ligne avec son propre rôle, sans RLS — parfois bien plus tard
  (adresse d’envoi signée `createSignedUploadUrl`, contrôlée à sa création puis valable deux heures
  sans politique, y compris pour réécrire le fichier avec `x-upsert`). Les règles d’envoi sont donc
  appliquées **aussi à l’écriture réelle** par un déclencheur de `storage.objects`
  (`public.avatars_guard_write`, déclencheurs `avatars_guard_insert` et `avatars_guard_update`,
  compartiment `avatars` seulement, quel que soit le rôle) : aucun remplacement, déplacement ni
  changement de propriétaire ; un nouveau fichier exige un profil, moins de deux fichiers et un jeton
  en cours pour ce nom, que le déclencheur **consomme** dans la même transaction (erreur
  `avatars_write_refused`). **Limite de 30 envois par jour** : `open_avatar_upload()` compte la
  demande (compteur `avatar_upload`), tire le nom du fichier (uuid aléatoire) et l’enregistre pour
  cinq minutes dans `public.avatar_upload_tickets` (un jeton par compte, table sans aucun droit pour
  l’API) ; un jeton donne au plus un fichier, même directement à l’API Storage avec le jeton de
  session du compte, même avec plusieurs adresses signées obtenues avant tout envoi.
  `cancel_avatar_upload()` annule le jeton (envoi abandonné, avatar retiré, profil ou compte
  supprimé) ; `set_profile_avatar(p_avatar)` désigne ou retire l’avatar (le fichier doit exister et
  appartenir au compte ; 20 changements par jour) ; `my_avatar_files()` donne au serveur les noms des fichiers
  du compte, `my_avatar_read_grants()` ses autorisations d’affichage et `my_avatar_upload_ticket()`
  son jeton d’envoi (export). Les tests PGlite (`src/test/pglite.ts`, `storageUpload` et
  `storageRemove`) reproduisent ce chemin de l’API Storage. L’image s’affiche par la route du site
  `/avatars/<avatar_id>` (comptes connectés seulement, même 404 pour toute absence, image réencodée,
  `nosniff`) : le navigateur ne contacte jamais Supabase et la CSP n’a pas changé. L’application ne
  crée aucune adresse signée ; mais l’API Storage en accorde une (`createSignedUrl`, durée choisie
  par le client) à tout compte qui peut lire le fichier : un membre qui vient d’ouvrir un avatar
  peut donc, avec son jeton, en obtenir une adresse valable sans session. Ce n’est pas plus qu’une
  copie de l’image ; `/confidentialite` le signale, et changer ou retirer l’avatar supprime le
  fichier, ce qui coupe ces adresses. **Suppression** :
  Supabase interdit d’effacer un fichier de Storage par SQL ; l’application supprime donc l’avatar
  par l’API Storage avant de supprimer le profil ou le compte : avatar retiré du profil, jeton
  d’envoi annulé, fichiers supprimés, puis fichiers du compte relus par la base, car l’API Storage
  ignore **sans erreur** un fichier que la politique refuse d’effacer (s’il en reste un, ou si une
  étape échoue, le profil ou le compte n’est pas supprimé ; l’avatar, lui, a pu être déjà retiré).
  La base le vérifie aussi pour le compte (`20261017120300_delete_my_account_avatars.sql`) :
  `delete_my_account()` efface le jeton d’envoi et le profil, supprime le compte, puis **annule
  tout** (`account_avatars_remain`) s’il reste un fichier du compte (`owner_id`) dans le
  compartiment — appel direct de la fonction sans passer par l’application, ou avatar envoyé depuis
  un autre onglet pendant la suppression. Une fois le jeton et le profil effacés, le déclencheur
  refuse toute écriture pour ce compte, même par une adresse signée obtenue avant ; un envoi
  concurrent se range derrière la suppression du jeton (verrou sur sa ligne) et, s’il aboutit le
  premier, la vérification le voit.
  « Retirer l’avatar » efface tous les fichiers du compte ; si Storage échoue, `/profil` le signale
  et propose « Effacer les fichiers de l’avatar ». **Compte supprimé par l’éditeur** (Authentication
  → Users : compte inactif, demande par e-mail, sanction) : la cascade ne supprime que les lignes de
  la base, jamais les fichiers. Avant de supprimer l’utilisateur, listez ses fichiers
  (`select name from storage.objects where bucket_id = 'avatars' and owner_id = '<uuid>';`) et
  supprimez-les depuis **Storage → avatars** ; sur un projet ancien où la contrainte
  `storage.objects_owner_fkey` existe encore, la suppression de l’utilisateur échoue tant qu’ils
  restent. Ensuite, et de temps en temps, vérifiez qu’il ne reste aucun fichier orphelin (échec
  entre deux étapes, compte supprimé à la main ; lisibles par leur seul titulaire, s’il existe
  encore) :
  `select name, owner_id from storage.objects o where bucket_id = 'avatars' and not exists (select 1
  from public.profiles p where p.avatar_id::text = o.name)` dans l’éditeur SQL, puis suppression
  depuis **Storage** dans le tableau de bord (`docs/legal.md`, point 10) ;
- **contacts** (bêta 2.1, `20261018120000_contacts.sql`) : `public.contact_requests` (demande en
  attente, une par couple et par sens), `public.contacts` (une ligne par couple, `user_low <
  user_high`) et `public.contact_blocks` (qui bloque qui, et l’identifiant du bloqué au moment du
  blocage s’il était visible pour le bloqueur, `blocked_handle`, sinon null, jamais mis à jour). Les demandes et les contacts sont
  rattachés aux **profils** (supprimés avec le profil de l’un des deux) ; les blocages aux **comptes**
  (ils survivent à la suppression du profil : recréer un profil sous un autre identifiant n’échappe
  pas à un blocage). **RLS activé sans politique et aucun droit** sur les trois tables : chaque ligne
  contient l’identifiant de compte de l’autre membre, qui ne sort jamais de la base. Tout passe par
  des fonctions `SECURITY DEFINER` (search_path vide, `auth.uid()` vérifié, entrées bornées en texte
  avant conversion) : `send_contact_request(p_handle)` (profil requis ; ne trouve que les profils
  **visibles** pour le demandeur, avec la même règle que `profile_by_handle` : un identifiant
  inconnu, un profil masqué, un membre qui vous a bloqué ou que vous avez bloqué répondent tous
  `not-found` ; essai compté
  **avant** la recherche), `accept_contact_request`, `refuse_contact_request`,
  `cancel_contact_request`, `remove_contact`, `block_member(p_kind, p_value)` (par identifiant
  visible, par demande ou par contact : le contact et les demandes entre les deux sont supprimés ;
  même blocage, fonction interne `contacts_block`, depuis un élément de la carte collective par
  `block_collective_author(p_id)`, qui retrouve l’auteur dans la base même si son profil n’est
  visible que de ses contacts),
  `unblock_member`, et les listes `my_contacts()`, `my_contact_requests()` et
  `my_blocked_members()` (identifiant, nom affiché et avatar de l’autre membre, références opaques :
  jamais d’identifiant de compte ; une demande n’en montre rien si le profil n’est plus visible, et un
  blocage ne montre que l’identifiant du moment du blocage, s’il était visible : aucune liste ni
  aucune réponse ne permet de suivre un membre qui se masque, change d’identifiant ou recrée son
  profil ; un couple bloqué n’apparaît jamais dans les contacts ni
  les demandes). Envoi et acceptation prennent d’abord un verrou consultatif par compte, pour les
  deux comptes et dans un ordre fixe (`contacts_lock_accounts` : des membres différents qui écrivent
  en même temps au même compte ne dépassent pas ses 200 demandes reçues ni ses 1 000 contacts) ;
  envoi, acceptation et blocage prennent ensuite un verrou consultatif par couple
  (`contacts_lock_pair`) avant leurs vérifications : un blocage simultané l’emporte toujours ; le
  profil du compte est verrouillé en `for no key update` (compatible avec le `for key share` des
  clés étrangères : deux membres qui s’ajoutent en même temps ne s’interbloquent pas). Règle de visibilité (`profiles_visible_to`) : soi-même ; sinon,
  s’il n’existe aucun blocage entre les deux comptes (dans un sens ou dans l’autre), un profil
  `members`, un contact, ou l’expéditeur d’une demande en attente (le destinataire voit qui la lui
  envoie). Le blocage rend donc les deux profils (et les avatars) invisibles l’un à l’autre, sous
  tout identifiant : rien ne dit au bloqué qu’il est bloqué, et rien ne permet au bloqueur de
  reconnaître le compte bloqué sous une nouvelle identité. Limites
  de la base par compte : 30 demandes par jour (essais), 50 demandes envoyées en attente, 200 reçues
  en attente, 1 000 contacts, 50 blocages par jour, 1 000 comptes bloqués, 300 autres opérations par
  jour (mêmes valeurs que `src/features/contacts/limits.ts`). Tout disparaît avec le compte
  (`on delete cascade`) ; les relations figurent dans « Télécharger mes données » ;
- **partage et coopération** (bêta 2.1, `20261019120000_map_sharing.sql`) : `public.map_members`
  (carte, compte, rôle `editor` ou `reader` ; le propriétaire est celui de la carte),
  `public.map_invitations` (invitation d’un contact, 30 jours), `public.map_links` (liens
  d’invitation : **empreinte SHA-256** du jeton seulement, rôle, 1 à 50 usages, 1 à 720 heures ;
  révoqués par suppression), `public.map_link_uses` (comptes qui ont rejoint la carte par un lien :
  **un lien ne sert qu’une fois à chaque compte**, pour qu’un membre retiré, ou passé lecteur puis
  parti, ne revienne pas par le lien déjà utilisé avec le rôle du lien ; supprimé avec le lien et
  avec le compte, mais pas avec le profil) et `public.map_locks` (verrou d’édition : titulaire, bail
  de deux minutes). Les cinq tables : RLS activé **sans politique**, aucun droit pour l’API (chaque
  ligne contient l’identifiant de compte d’un membre).
  **Écart assumé au cahier des charges (§16, « RLS des cartes étendue : lecture par les membres »)** :
  les politiques de `public.maps` ne changent pas. Une politique « membres » leur donnerait la ligne
  entière, dont `user_id` (l’identifiant de compte du propriétaire), car le droit `SELECT` de l’API
  porte sur toute la table et la version en ligne filtre sur cette colonne ; la lecture et l’écriture
  des membres passent donc par des fonctions `SECURITY DEFINER` qui vérifient le rôle du compte sur la
  carte, avec le même effet (lecture par les membres, écriture par les éditeurs, le reste réservé au
  propriétaire) sans exposer cet identifiant. À valider par le porteur du cahier des charges. Les
  membres lisent une carte par `open_shared_map(p_map)` (contenu, rôle, version, propriétaire par son
  identifiant public ; 600 lectures par heure) et suivent son état par `shared_map_state(p_map)`
  (version, verrou ; 1 200 lectures par heure, un onglet ouvert en faisant 240) ; ils écrivent par
  `update_map_data`, remplacée : propriétaire, ou éditeur **qui tient le verrou** ; personne pendant
  le bail d’un autre (`maps_locked`), sauf le propriétaire qui renvoie le contenu tel quel ; lecteur
  jamais ; contrôle de version inchangé ; une écriture du propriétaire qui change le contenu d’une
  carte qui a des membres prend ou renouvelle le verrou (deux minutes ; jamais pour une carte sans
  membre ni pour un contenu inchangé). L’écriture d’un éditeur compte dans l’espace du propriétaire (quota
  inchangé, `maps_quota_exceeded`). Renommer, supprimer, changer le
  logo et partager restent réservés au propriétaire (politiques et `set_map_cover` inchangées).
  Fonctions (RPC, `SECURITY DEFINER`, `search_path` vide, `auth.uid()` vérifié, entrées bornées en
  texte avant conversion, `EXECUTE` réservé à `authenticated`) : `invite_contact_to_map` (un contact
  du propriétaire, désigné par la référence de `my_contacts`), `answer_map_invitation`,
  `cancel_map_invitation`, `create_map_link` (statut `created` et le jeton — deux uuid v4 du
  générateur aléatoire fort de PostgreSQL, 244 bits — renvoyé une seule fois, ou `not-found`,
  `links-full`), `revoke_map_link`, `preview_map_link`,
  `accept_map_link`, `set_map_member_role`, `remove_map_member`, `leave_shared_map`,
  `acquire_map_lock` (prise ou renouvellement atomique : un bail en cours d’un autre compte n’est
  jamais remplacé), `release_map_lock`, et les listes `maps_shared_with_me()`, `my_map_invitations()`,
  `my_map_shares(p_map)`, `my_map_locks()` et `my_map_link_uses()`, qui ne renvoient jamais
  d’identifiant de compte ni de jeton. Un lien inconnu, échu, épuisé, révoqué, d’un compte bloqué ou
  déjà utilisé par un compte qui n’est plus membre donne la même réponse ; chaque essai est compté
  **avant** de chercher le jeton. Une fois le compteur pris, les fonctions répondent par un statut
  et jamais par une erreur (une erreur annulerait l’incrément avec le reste de l’instruction). Profil exigé pour partager, être invité ou
  rejoindre. Déclencheurs : un membre retiré ou passé lecteur perd son verrou ; un blocage (dans un
  sens ou dans l’autre) retire chacun des cartes de l’autre et supprime les invitations entre eux ;
  un contact retiré supprime les invitations en attente entre les deux (`map_sharing_on_contact_delete` ;
  l’invitation verrouille la ligne du contact, un retrait simultané attend puis la supprime, et une
  invitation sans contact n’est ni montrée ni acceptée) ;
  supprimer son profil retire le compte des cartes des autres (cascade) et arrête les partages de ses
  propres cartes. Limites de la base par compte : 100 partages par jour, 60 essais de lien par jour,
  300 autres opérations par jour, 600 appels de verrou, 600 lectures complètes et 1 200 lectures
  de l’état par heure ; 50
  membres et invitations par carte, 10 liens actifs par carte, 200 cartes partagées et 100 invitations
  reçues par compte (mêmes valeurs que `src/features/sharing/limits.ts`). Les opérations qui changent
  les membres d’une carte prennent un verrou consultatif de la carte, puis du compte qui entre (même
  ordre partout). Entrer dans une carte (`answer_map_invitation`, `accept_map_link`) prend d’abord le
  verrou du couple propriétaire-compte (`contacts_lock_pair`, le même que le blocage), et revérifie
  le blocage après les verrous : un blocage simultané écarte toujours le membre. Les écritures de
  partage gardent le profil du propriétaire (`for key share`, `not-found` s’il n’existe plus) : une
  suppression simultanée du profil attend, puis supprime aussi ce qui vient d’être écrit ;
- **carte collective et modération** (bêta 2.1, `20261020120000_collective_map.sql`) :
  `public.collective_items` (éléments : identifiant choisi par l'application, auteur, sorte `ping`,
  `point`, `text`, `zone`, `link` ou `flux`, contenu `jsonb` validé par
  `collective_item_data_ok` — mêmes règles que `src/features/collective/itemData.ts` —, état
  `visible` ou `hidden`, dates ; taille et sommets tenus par un déclencheur), `public.collective_state`
  (une ligne : version, pour le rafraîchissement périodique, et totaux), `public.collective_reports`
  (motif d'une liste fermée, précisions de 500 caractères, renvoi à la copie du contenu signalé tant
  que le signalement est en attente — la file la montre si l'auteur a modifié l'élément depuis — ; un
  seul signalement en attente par membre et par élément, et un signalement traité peut être refait si
  l'élément a été modifié depuis la décision ; rattachés à l'**identifiant** de l'élément
  (`collective_item_ids`), pas à l'élément : un retrait par l'auteur ne les efface pas, l'élément
  reste dans la file à l'état `withdrawn` avec le dernier contenu signalé, où le modérateur peut le
  supprimer — signalements retenus, identifiant bloqué, suspension possible, auteur informé — ou
  classer les signalements ; recréé sous le même identifiant, il est de nouveau visé par eux ; partis
  avec le compte qui signale, ou avec celui de l'auteur — déclencheur sur `collective_item_ids`),
  `public.collective_report_copies` (copies des contenus signalés : une par élément et par contenu,
  comparées exactement en `jsonb` sous le verrou de la carte, effacées dès qu'aucun signalement en
  attente n'y renvoie ; 8 Mio pour toute la carte, total `report_bytes` tenu dans `collective_state`
  par un déclencheur ; au-delà, le signalement est enregistré sans copie),
  `public.collective_decisions` (journal : décision, motif — pour un contenu illicite, avec le texte
  de loi en cause, exigé par l'application —, modérateur, auteur, titre de l'élément, suspension
  prononcée, `author_notified` — l'auteur a-t-il reçu un avis — ; un an ; l'action `withdraw`, sans modérateur, trace le retrait par son auteur
  d'un élément masqué ou signalé, sans avis : les membres qui l'avaient signalé sont informés de la
  décision du modérateur qui suivra ; retirer de nouveau un identifiant recréé, sans décision d'un
  modérateur entre-temps, n'ajoute pas de ligne (le nombre de signalements de la dernière est mis à
  jour) ; un lien signalé ou
  masqué supprimé par un modérateur avec l'élément auquel il est rattaché a sa propre décision
  `delete`, avec avis aux membres qui l'avaient signalé),
  `public.collective_notices` (avis à l'auteur et aux membres qui ont signalé ; 100 par compte),
  `public.moderators` (alimentée à la main, voir plus haut), `public.collective_item_ids` (tout
  identifiant déjà utilisé, avec son auteur — null après la suppression de son compte — et
  l'indication « modéré » : un identifiant n'est jamais repris par un autre compte, ni par son auteur
  après un masquage, une suppression par la modération — liens rattachés compris — ou le retrait d'un
  élément masqué ; l'auteur reprend librement celui d'un élément qu'il a supprimé sans décision qu'il
  connaisse, pour l'annulation dans l'éditeur, même s'il était signalé : la réponse ne doit pas lui
  révéler un signalement) et `public.collective_suspensions` (contributions suspendues jusqu'à une date ; une ligne
  par compte, supprimée avec lui). Les neuf tables : RLS activé **sans politique**, aucun droit pour
  l'API. Fonctions (`SECURITY DEFINER`, `search_path` vide,
  `auth.uid()` vérifié, entrées bornées en texte avant conversion, `EXECUTE` réservé à
  `authenticated`) : `collective_map_state()` (version, rôle, profil, avis non lus, fin de la
  suspension en cours), `collective_map()` (éléments visibles avec le **nom affiché** et
  l'**identifiant public** de leur auteur — le nom affiché n'est pas unique et peut être copié par un
  autre membre, l'identifiant public l'est : il est montré quelle que soit la visibilité du profil,
  qui reste appliquée par `profile_by_handle` —, et « c'est le mien », jamais d'identifiant de
  compte ; sans les éléments des comptes avec qui un blocage existe, ni ceux d'un auteur **sans
  profil**, sauf pour lui-même : jamais d'élément non signé ; ils reviennent, signés, avec un nouveau
  profil — le déclencheur `collective_on_profile_change` sur `public.profiles`, `SECURITY DEFINER`,
  change la version de la carte quand un auteur crée, supprime ou renomme son profil),
  `create_collective_item`, `update_collective_item` et `delete_collective_item` (chacun ses
  éléments ; profil exigé pour ajouter ou modifier, et aucune suspension en cours : `suspended` ;
  un lien ne relie qu'un pays ou un élément visible de son propre auteur ; supprimer un élément
  supprime les liens de son auteur qui y sont rattachés, avec une trace au journal pour chacun qui
  était masqué ou signalé ; à l'ajout, `id-taken` pour tout identifiant déjà porté ou utilisé par un
  autre compte, quel que soit l'état de l'élément : la réponse ne révèle ni un masquage ni un
  blocage ; chaque réponse donnée sous le verrou de la carte porte la version de la carte avant et
  après l'écriture, `revision_from` et `revision_to`, pour que la session ne relise pas toute la
  carte après ses propres écritures : les lectures complètes comptent dans la limite de 240 par
  heure), `report_collective_item(p_id, p_reason, p_details, p_good_faith)` (élément inconnu,
  masqué, d'un auteur sans profil ou d'un compte bloqué : même réponse, essai compté avant la
  recherche ; motif `illegal` refusé sans explication de 20 caractères au moins ni déclaration de
  bonne foi, comme par le formulaire), `block_collective_author(p_id)`
  (bloque l'auteur d'un élément visible, même si son profil n'est visible que de ses contacts ;
  même blocage et même limite que `block_member`, 50 par jour comptés avant la recherche ; même
  réponse `not-found` qu'un élément inconnu ; l'identifiant de compte de l'auteur ne sort pas de la
  base), `collective_moderation_queue(p_page)`
  (par pages de 100, avec le nombre total d'éléments : contenus signalés comme illicites d'abord,
  puis du plus ancien signalement en attente au plus récent, puis les éléments masqués ; aucun
  signalement en attente n'est repoussé hors de la file par des signalements plus récents ; sans
  les éléments du modérateur lui-même, comme `collective_moderation_log()` : un signalement
  n'est pas révélé à son auteur),
  `moderate_collective_item(p_id, p_action, p_reason, p_suspend)` (`hide`, `restore`, `delete`,
  `dismiss`, motif de 3 à 500 caractères ; `p_suspend` avec `hide` ou `delete` seulement : 30 jours,
  ou la fin d'une suspension plus longue déjà en cours ; jamais sur ses propres éléments : « own-item »
  pour tout identifiant qu'il a utilisé, élément retiré compris, qu'il soit signalé ou non) et
  `collective_moderation_log()` (modérateurs seulement :
  `collective_forbidden` sinon ; il montre aux modérateurs le nom affiché du modérateur de chaque
  décision), `my_collective_notices()` (avec, pour un avis d’auteur, le nombre de signalements
  traités et la suspension prononcée), `mark_collective_notices_read()`,
  `my_hidden_collective_items()` (éléments masqués du compte, listés dans « Avis de modération »
  pour qu'il puisse toujours les supprimer, même après l'effacement de leur avis ; 240 lectures par
  heure comptées avec la carte), et pour
  « Télécharger mes données » `my_collective_items()`, `my_collective_reports()`,
  `my_moderation_decisions()`, `my_collective_decisions()` (décisions qui visent les éléments du
  compte : celles dont il a reçu l'avis, même effacé depuis, et celles sans signalement — retrait
  d'un élément masqué, lien masqué supprimé avec son élément —, `author_notified or reports = 0`),
  `my_collective_account()` (date de désignation comme modérateur, suspension en cours ou échue
  non encore effacée) et `my_collective_item_ids()` (identifiants utilisés et indication
  « modéré »). Les décisions qui révéleraient un signalement (classement, retrait d’un élément
  signalé, lien signalé supprimé avec son élément) ne sont exposées par aucune fonction (RGPD
  art. 15.4) ; sur demande, l'éditeur les communique après examen au cas par cas
  (`docs/legal.md`, point 22). Les signalements qui visent les éléments du compte ne sont exposés par
  aucune fonction non plus, et se communiquent de la même façon (même point). Conservation : la fonction interne `collective_purge()` (aucun droit d'exécution)
  efface les décisions et les signalements traités de plus d'un an et les suspensions échues ;
  elle est appelée par `moderate_collective_item` et par `collective_map_state` (rafraîchissement
  de la carte par tout membre qui l'a ouverte), et ne prend le verrou de la carte que s'il y a
  quelque chose à effacer. Il n'y a pas de tâche planifiée : si la carte n'est plus utilisée du
  tout, appelez `select public.collective_purge();` dans l'éditeur SQL (ou planifiez-le avec
  `pg_cron`). Les fonctions comptées répondent par un statut une fois le compteur
  pris. Limites par compte (mêmes valeurs que `src/features/collective/limits.ts`) : 50 ajouts,
  2 000 modifications ou suppressions, 20 signalements et 500 décisions par jour ; 240 lectures de
  la carte (ou de la file, du journal) et 1 200 lectures de l'état par heure. Bornes de stockage :
  48 Kio par élément ; par auteur 200 éléments, 512 Kio et 20 000 sommets, dont 128 Kio et 5 000
  sommets ajoutés par période de 24 heures (compte large : contenu des éléments ajoutés ou modifiés
  depuis ; `daily-full`) ; pour toute la carte 5 000 éléments, 6 Mio et 200 000 sommets
  (`author-full`, `map-full`). Saturer la carte demande ainsi des dizaines de comptes avec profil
  pendant au moins une journée ; il n'existe pas d'action de masse : les modérateurs suppriment les
  éléments un à un (500 décisions par jour) et suspendent leurs auteurs. Toute écriture prend d'abord le
  verrou de la ligne `collective_state` (même ordre partout). Un compte supprimé emporte ses
  éléments, signalements et avis ; le journal garde ses décisions sans son identifiant. Rare : la
  suppression d'un compte (cascade) pendant qu'un modérateur décide sur l'un de ses éléments peut
  provoquer un interblocage que PostgreSQL détecte et résout en annulant l'une des deux opérations
  (à refaire) ;
- espace borné par compte : 500 cartes et 50 Mo de contenu au total (`data_bytes`, tenu par un
  déclencheur ; une modification qui n’agrandit pas une carte reste permise). Les écritures d’un même
  compte sont sérialisées par un verrou, pour que des écritures simultanées ne dépassent pas la limite.
  Sur un projet gratuit (base de 500 Mo), ajustez ces valeurs dans la migration et dans
  `src/features/maps/limits.ts` selon le nombre de comptes attendus.

Les politiques, les droits et les fonctions sont testés sur un vrai PostgreSQL (PGlite) par
`src/features/maps/migration.test.ts`, `writeFunctions.test.ts` et `writeFunctions.cost.test.ts`
(temps de traitement compris), `docV2.sql.test.ts` et `cover.sql.test.ts` (bêta 2.1), `src/features/profiles/profiles.sql.test.ts` et
`avatars.sql.test.ts` (profils, avatars, compteurs), `src/features/contacts/contacts.sql.test.ts`
(contacts, blocages, visibilité), `src/features/sharing/sharing.sql.test.ts` (partage, liens, verrou,
écriture par les éditeurs), `src/features/collective/collective.sql.test.ts` (carte collective,
signalements, modération, limites), et `src/features/account/deleteMyAccount.sql.test.ts`
pour la suppression du compte.

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
- **Cartes partagées** (bêta 2.1, `src/features/sharing/`) : « Partager » (page `/espace/partage/<id>`,
  propriétaire seulement) gère les membres, les invitations de contacts et les liens ; le lien
  d’invitation a la forme `/invitation#<jeton>` : le jeton est dans le **fragment**, que le navigateur
  n’envoie jamais au serveur (ni journaux de l’hébergeur, ni en-tête Referer) ; la page le lit, le
  retire de l’adresse et ne l’envoie qu’aux Server Actions d’aperçu et d’acceptation. « Coopérer »
  ouvre l’**éditeur coopératif** (`/carte/partagee/<id>`, propriétaire et membres) ; pour une carte
  du compte qui a des membres, « Continuer » y mène aussi (la carte est marquée « partagée » dans la
  banque), pour que le propriétaire respecte le verrou comme ses membres. L’éditeur coopératif n’utilise
  **jamais** la copie locale du compte : la session de l’éditeur habituel est d’abord suspendue
  (modifications en attente envoyées ; si une page du compte la rouvre entre-temps, elle reste
  ouverte et la suspension recommence), et rien de la carte partagée n’est écrit dans le navigateur.
  Verrou d’édition v1 : l’éditeur qui tient le verrou modifie la carte (envoi une seconde après la
  dernière modification, par `update_map_data` avec la version attendue) et renouvelle son bail
  toutes les 40 secondes tant qu’il est actif ; après cinq minutes sans activité, il rend la main.
  Les autres voient la carte en **lecture seule** (le store de l’éditeur ignore alors toute
  modification) avec « X modifie cette carte », et la carte est relue toutes les 15 secondes si sa
  version a changé, seulement tant que l’onglet est visible (relue dès qu’il le redevient ; un
  rafraîchissement refusé, limite des lectures ou réseau, est annoncé par un avis qui disparaît au
  premier qui réussit) ; un bail échu peut être repris (« Modifier la carte »). Si le bail de l’éditeur a
  expiré sans que personne ne le reprenne (réseau coupé, appareil en veille), l’enregistrement refusé
  (`maps_locked`) le reprend (`acquire_map_lock`) puis est refait avec la même version attendue :
  rien n’est perdu si la carte n’a pas changé, sinon c’est un conflit ; un compte repassé lecteur
  l’apprend par un message propre. Le verrou est tenu par un
  **compte**, pas par un onglet : si le compte le tient déjà ailleurs (autre onglet, autre appareil,
  éditeur de son espace), la carte s’ouvre en lecture seule (« vous modifiez déjà cette carte
  ailleurs ») et seul « Modifier la carte » reprend la main ; un enregistrement refusé parce que la
  carte a changé entre-temps l’annonce comme tel (et non comme « un autre membre a pris la main »).
  À la sortie, le verrou est libéré (Server Action ; à la fermeture de l’onglet, `navigator.sendBeacon`
  vers `/carte/partagee/<id>/verrou`, même origine exigée) ; sinon le bail expire en deux minutes.
  Une page gardée dans le cache du navigateur passe en lecture seule à sa sortie et se recharge si
  elle revient (bouton Précédent). Une carte en cours qui a des membres, ouverte directement sur
  `/carte`, passe en lecture seule et s’ouvre dans l’éditeur coopératif (comme « Continuer » depuis
  l’espace). Le propriétaire qui modifie malgré tout une carte partagée dans l’éditeur habituel
  (lecture des membres impossible au chargement, ou carte partagée pendant qu’elle est ouverte) prend le verrou à chaque enregistrement
  qui change son contenu (les membres voient « <son nom> modifie cette carte » pendant deux minutes
  après sa dernière modification) ; s’il y écrit pendant qu’un éditeur tient le verrou, la carte est
  **détachée** de la banque, comme lors d’un conflit : rien n’est écrasé ni renvoyé, sa version reste
  dans l’éditeur (« Carte partagée qu’un membre modifie en ce moment… ouvrez-la avec « Coopérer » »).
  Limite connue du verrou v1 : un éditeur qui appellerait directement `acquire_map_lock` en boucle
  (600 appels par heure au plus) garderait la main sans être actif ; le propriétaire peut alors le
  passer lecteur ou le retirer, ce qui libère aussitôt le verrou.

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
