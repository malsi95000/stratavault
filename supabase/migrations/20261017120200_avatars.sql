-- Avatars des profils (DIV-03, bêta 2.1) : compartiment PRIVÉ « avatars » de Supabase Storage.
--
-- Nom d'un fichier : « <avatar_id> » (un uuid aléatoire tiré par le serveur, en minuscules), avatar_id
-- étant la colonne public.profiles.avatar_id. Le nom ne contient PAS l'identifiant du compte : la
-- propriété d'un fichier se lit dans storage.objects.owner_id, que l'API Storage remplit elle-même
-- avec le « sub » du jeton qui l'envoie (le client ne le choisit pas).
-- Le fichier est une image WebP de 256 × 256 pixels produite par le serveur de l'application :
-- l'image envoyée est vérifiée (signature PNG, JPEG ou WebP, taille bornée) puis RÉ-ENCODÉE
-- (src/features/profiles/avatarImage.ts). Aucun SVG. Un compte pourrait toutefois envoyer d'autres
-- octets directement par l'API Storage avec son jeton : la base ne voit pas le contenu. La route
-- d'affichage ré-encode donc à nouveau chaque fichier avant de le servir (rien de ce qu'un compte a
-- envoyé n'est transmis tel quel aux autres).
--
-- Affichage : par la route /avatars/<avatar_id> du site (src/app/avatars/[id]/route.ts), réservée
-- aux comptes connectés, qui relit le fichier avec le jeton du compte qui le demande : le navigateur
-- ne parle jamais à Supabase Storage (la CSP n'a pas à l'autoriser) et le compartiment n'est pas
-- public (aucune adresse publique ; l'application ne crée aucune adresse signée).
-- Limite connue : l'API Storage accorde une adresse signée (createSignedUrl, durée choisie par le
-- client) à tout compte qui peut LIRE le fichier. Un membre qui vient d'ouvrir l'avatar d'un autre
-- (open_avatar_read, une minute) peut donc, avec son jeton, en créer une adresse signée qui reste
-- valable sans session, même si le titulaire masque ensuite son profil. Ce n'est pas plus qu'une
-- copie des octets, que tout membre qui voit l'image peut faire de toute façon : /confidentialite
-- le signale. Changer ou retirer son avatar supprime le fichier, ce qui coupe ces adresses.
--
-- Aucune liste : l'API Storage applique la même politique de lecture au téléchargement d'un fichier
-- et à la liste du compartiment. Si l'avatar actuel de tout profil visible était lisible, la liste
-- donnerait les avatars de tous les membres. Un compte ne lit donc l'avatar d'un autre que pendant
-- une minute après l'avoir demandé par public.open_avatar_read(avatar_id), qui vérifie que c'est
-- l'avatar actuel d'un profil visible pour lui (identifiant connu par profile_by_handle, déjà limité)
-- et compte la demande (600 par heure). La liste ne montre donc que ce qu'il vient de demander.
-- Les autorisations (public.avatar_read_grants : compte, avatar, échéance) sont effacées dès leur
-- échéance passée, à chaque nouvelle demande d'un compte, et avec le compte ; chaque compte relit
-- les siennes par public.my_avatar_read_grants() (« Télécharger mes données »).
--
-- Politiques de storage.objects, pour le compartiment « avatars » seulement (rôle authenticated ;
-- rien pour anon) :
--   - lecture : ses propres fichiers (owner_id), et l'avatar ACTUEL d'un profil visible que le compte
--     vient de demander (public.avatars_read_granted ; le fichier doit appartenir au titulaire du
--     profil) ;
--   - création : nom « <uuid> » exact, owner_id = auth.uid(), profil existant, deux fichiers au plus
--     par compte (l'avatar actuel et son remplaçant, le temps du changement), et JETON D'ENVOI en
--     cours pour ce nom (public.avatars_upload_allowed) ;
--   - suppression : ses propres fichiers, sauf l'avatar actuel (retirez-le d'abord du profil :
--     set_profile_avatar(null)) ; ainsi un profil ne désigne jamais un fichier supprimé ;
--   - aucune modification ni remplacement (pas d'upsert, pas de déplacement).
-- Le compartiment n'accepte que image/webp, 100 Ko au plus (limites appliquées par l'API Storage).
--
-- Les politiques ne suffisent pas : l'API Storage les évalue par une écriture « sonde », faite avec
-- le rôle du compte dans un SAVEPOINT puis annulée (ROLLBACK TO SAVEPOINT), avant d'écrire la ligne
-- elle-même avec son propre rôle, sans RLS. Tout ce qu'une politique écrit est annulé avec la sonde,
-- et l'écriture réelle peut venir bien après : une adresse d'envoi signée (createSignedUploadUrl,
-- sonde à sa création) sert ensuite pendant deux heures sans aucune politique (uploadToSignedUrl),
-- y compris pour réécrire le fichier (x-upsert). Les règles d'envoi sont donc appliquées AUSSI à
-- l'écriture réelle, par un déclencheur de storage.objects (public.avatars_guard_write, plus bas),
-- qui s'exécute pour toute écriture du compartiment, quel que soit le rôle : il refuse tout
-- remplacement, déplacement ou changement de propriétaire, et n'accepte un nouveau fichier que pour
-- un compte qui a un profil, moins de deux fichiers et un jeton en cours pour ce nom, jeton qu'il
-- CONSOMME dans la même transaction.
--
-- Limite d'envois (30 par jour et par compte), y compris pour un envoi fait directement à l'API
-- Storage avec le jeton du compte : l'envoi passe par un jeton. public.open_avatar_upload() compte
-- la demande (compteur « avatar_upload » de public.rate_limits, 30 par jour), tire le nom du fichier
-- (un uuid aléatoire, choisi par la base) et l'enregistre pour cinq minutes dans
-- public.avatar_upload_tickets (un jeton par compte : une nouvelle demande remplace la précédente).
-- La politique d'envoi exige un jeton en cours pour ce nom, et le déclencheur le consomme à
-- l'écriture du fichier : chaque jeton donne au plus UN fichier (plusieurs adresses signées
-- obtenues avant tout envoi, ou un même nom envoyé, supprimé et renvoyé, ne donnent rien de plus).
-- Le jeton est aussi annulé par cancel_avatar_upload(), remplacé par la demande suivante, effacé
-- avec le compte, et chaque compte relit le sien par public.my_avatar_upload_ticket() (« Télécharger
-- mes données »).
--
-- Suppression : un fichier de Storage ne peut pas être supprimé par SQL (Supabase l'interdit : seule
-- l'API Storage efface aussi le fichier lui-même). L'application supprime donc les avatars par l'API
-- Storage avant de supprimer le profil ou le compte : elle retire l'avatar du profil, annule le jeton
-- d'envoi, supprime chaque fichier, puis relit ses fichiers (my_avatar_files) et ne va pas plus loin
-- s'il en reste un (l'API Storage ignore sans erreur un fichier que la politique refuse d'effacer).
-- La base, elle, refuse de supprimer un compte dont un fichier reste dans le compartiment (appel
-- direct de delete_my_account, ou envoi depuis un autre onglet pendant la suppression) : voir
-- 20261017120300_delete_my_account_avatars.sql. Une fois le compte supprimé, plus aucun fichier ne
-- peut être écrit pour lui (ni profil ni jeton : le déclencheur refuse, même par une adresse signée
-- obtenue avant).
-- Un fichier resté orphelin (échec entre les deux étapes) n'est lisible que par son titulaire, et
-- disparaît au prochain changement ou retrait d'avatar ; voir docs/supabase.md pour le retrouver. Un compte supprimé à la main par l'éditeur
-- (Authentication → Users) garde ses fichiers dans le compartiment : docs/supabase.md (section 3)
-- et docs/legal.md (points 10 et 11) disent de les supprimer d'abord depuis Storage.
--
-- Compatible avec l'application déjà en production (v2.0) et avec l'étape 1 de la bêta 2.1 : nouveau
-- compartiment, nouvelles tables, nouvelles politiques (limitées à ce compartiment) et nouvelles
-- fonctions. À appliquer après 20261017120100_profiles.sql.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 102400, array['image/webp'])
on conflict (id) do update
set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Nom de fichier (et identifiant d'avatar) attendu : un uuid en minuscules, rien d'autre. La longueur
-- est vérifiée avant l'expression régulière. Fonction pure, évaluée par les politiques.
create function public.avatars_name_ok(p_name text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_name is not null
    and octet_length(p_name) = 36
    and p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

-- Autorisations de lecture de l'avatar d'un autre compte, d'une minute. RLS activé SANS politique et
-- aucun droit : seules les fonctions de la base les lisent et les écrivent.
create table public.avatar_read_grants (
  viewer_id uuid not null references auth.users (id) on delete cascade,
  avatar_id uuid not null,
  expires_at timestamptz not null,
  primary key (viewer_id, avatar_id)
);

create index avatar_read_grants_expires_at on public.avatar_read_grants (expires_at);

comment on table public.avatar_read_grants is
  'Autorisations d''une minute de lire l''avatar d''un autre profil (route /avatars/<id>) ; aucun accès par l''API.';

alter table public.avatar_read_grants enable row level security;
revoke all on table public.avatar_read_grants from public, anon, authenticated;

-- Vrai si le compte connecté peut lire le fichier `p_name` d'un autre compte (`p_owner`, owner_id du
-- fichier) : autorisation en cours, fichier qui est l'avatar ACTUEL d'un profil visible pour lui et
-- qui appartient au titulaire de ce profil. SECURITY DEFINER : lit public.profiles et
-- public.avatar_read_grants, qui ne sont pas lisibles directement ; ne lit jamais storage.objects.
-- Appelée par la politique de lecture (EXECUTE accordé à authenticated pour cette raison ; appelée
-- directement, elle ne renseigne que sur les autorisations du compte lui-même).
create function public.avatars_read_granted(p_name text, p_owner text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_owner is null or octet_length(p_owner) > 64 or not public.avatars_name_ok(p_name) then
    return false;
  end if;
  return exists (
    select 1
    from public.avatar_read_grants as g
    join public.profiles as p on p.avatar_id = g.avatar_id
    where g.viewer_id = v_uid
      and g.avatar_id = p_name::uuid
      and g.expires_at > now()
      and p.user_id::text = p_owner
      and public.profiles_visible_to(p.user_id, p.visibility, v_uid)
  );
end;
$$;

-- Lecture : ses propres fichiers, ou l'avatar actuel d'un profil visible que le compte vient de demander.
create policy "avatars_select_own_or_granted" on storage.objects
for select to authenticated
using (
  bucket_id = 'avatars'
  and (
    owner_id = (select auth.uid())::text
    or public.avatars_read_granted(name, owner_id)
  )
);

-- Jetons d'envoi d'un avatar (voir l'en-tête) : un par compte au plus, cinq minutes. RLS activé SANS
-- politique et aucun droit : seules les fonctions de la base les lisent et les écrivent.
create table public.avatar_upload_tickets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  avatar_id uuid not null,
  expires_at timestamptz not null
);

create index avatar_upload_tickets_expires_at on public.avatar_upload_tickets (expires_at);

comment on table public.avatar_upload_tickets is
  'Jeton d''envoi d''avatar de chaque compte (nom du fichier attendu, échéance de cinq minutes) ; aucun accès par l''API.';

alter table public.avatar_upload_tickets enable row level security;
revoke all on table public.avatar_upload_tickets from public, anon, authenticated;

-- Vrai si le compte connecté a un jeton d'envoi EN COURS pour le fichier `p_name`. SECURITY DEFINER :
-- lit public.avatar_upload_tickets, qui n'est pas lisible directement. Lecture seule ; évaluée par
-- la politique d'envoi (EXECUTE accordé à authenticated pour cette raison ;
-- appelée directement, elle ne renseigne que sur le jeton du compte lui-même).
create function public.avatars_upload_pending(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.avatars_name_ok(p_name) then
    return false;
  end if;
  return exists (
    select 1
    from public.avatar_upload_tickets as t
    where t.user_id = v_uid
      and t.avatar_id = p_name::uuid
      and t.expires_at > now()
  );
end;
$$;

-- Envoi d'un fichier `p_name` par le compte connecté : nom « <uuid> » exact, profil existant, moins
-- de deux fichiers déjà à lui (l'avatar actuel et son remplaçant, le temps du changement : un compte
-- occupe au plus 2 × 100 Ko) et jeton d'envoi en cours pour ce nom (la limite de 30 envois par jour
-- est comptée par open_avatar_upload, qui délivre le jeton). SECURITY DEFINER : une politique de
-- storage.objects ne peut pas relire storage.objects elle-même (récursion) ; la fonction ne compte
-- que les fichiers du compte connecté et ne renvoie qu'un booléen. Lecture seule (STABLE) : l'API
-- Storage annule tout ce qu'écrit l'évaluation de ses politiques (voir l'en-tête).
create function public.avatars_upload_allowed(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.avatars_name_ok(p_name) then
    return false;
  end if;
  if not exists (select 1 from public.profiles as p where p.user_id = v_uid) then
    return false;
  end if;
  if (
    select count(*)
    from storage.objects as o
    where o.bucket_id = 'avatars'
      and o.owner_id = v_uid::text
  ) >= 2 then
    return false;
  end if;
  return public.avatars_upload_pending(p_name);
end;
$$;

-- Création : fichier à soi (owner_id rempli par l'API Storage), voir public.avatars_upload_allowed.
create policy "avatars_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'avatars'
  and owner_id = (select auth.uid())::text
  and public.avatars_upload_allowed(name)
);

-- Écriture réelle d'un fichier du compartiment (voir l'en-tête) : déclencheur BEFORE INSERT et
-- BEFORE UPDATE de storage.objects, qui s'exécute pour toute écriture, sonde comprise, quel que soit
-- le rôle (celui du compte pour la sonde, celui de l'API Storage pour l'écriture réelle, qui
-- échappe aux politiques). Il ne lit ni auth.uid() ni le jeton de la requête (l'écriture réelle
-- n'en a pas forcément) : seulement owner_id, que l'API Storage remplit avec le « sub » du jeton du
-- compte, et que la politique d'envoi compare à auth.uid() lors de la sonde.
--   - UPDATE : refusé dès qu'il change le compartiment, le nom, le propriétaire ou la version du
--     fichier (remplacement par x-upsert, déplacement, changement de propriétaire), pour toute
--     ligne qui entre dans le compartiment ou en sort. Les autres colonnes (dates, métadonnées
--     techniques) restent modifiables par l'API Storage.
--   - INSERT : nom « <uuid> » exact, owner_id « <uuid> », profil existant pour ce compte, jeton
--     d'envoi EN COURS de ce compte pour ce nom, CONSOMMÉ ici (supprimé dans la même transaction),
--     et moins de deux fichiers déjà à ce compte. Le verrou pris sur la ligne du jeton range les
--     écritures concurrentes d'un même compte l'une après l'autre (un seul jeton par compte) : la
--     deuxième ne trouve plus de jeton. delete_my_account() supprime ce même jeton : un envoi
--     concurrent de la suppression du compte attend l'une ou l'autre, et ne peut plus aboutir après.
-- Le jeton consommé pendant une sonde est rétabli avec elle (ROLLBACK TO SAVEPOINT) ; un refus annule
-- toute l'écriture (erreur avatars_write_refused, 42501). SECURITY DEFINER : lit et écrit
-- public.avatar_upload_tickets et lit public.profiles, sans droits pour les comptes, et compte les
-- fichiers du compte dans storage.objects. Aucun droit d'exécution : seul le déclencheur l'appelle.
create function public.avatars_guard_write()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if tg_op = 'UPDATE' then
    if new.bucket_id is distinct from old.bucket_id
      or new.name is distinct from old.name
      or new.owner_id is distinct from old.owner_id
      or new.version is distinct from old.version then
      raise exception 'avatars_write_refused' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op <> 'INSERT'
    or not public.avatars_name_ok(new.name)
    or not public.avatars_name_ok(new.owner_id) then
    raise exception 'avatars_write_refused' using errcode = '42501';
  end if;
  v_owner := new.owner_id::uuid;

  delete from public.avatar_upload_tickets as t
  where t.user_id = v_owner
    and t.avatar_id = new.name::uuid
    and t.expires_at > now();
  if not found then
    raise exception 'avatars_write_refused' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles as p where p.user_id = v_owner) then
    raise exception 'avatars_write_refused' using errcode = '42501';
  end if;

  if (
    select count(*)
    from storage.objects as o
    where o.bucket_id = 'avatars'
      and o.owner_id = new.owner_id
  ) >= 2 then
    raise exception 'avatars_write_refused' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.avatars_guard_write() is
  'Déclencheur de storage.objects (compartiment « avatars ») : refuse tout remplacement ou déplacement, et n''accepte un fichier qu''avec un jeton d''envoi en cours, qu''il consomme.';

revoke all on function public.avatars_guard_write() from public, anon, authenticated;

create trigger avatars_guard_insert
before insert on storage.objects
for each row
when (new.bucket_id = 'avatars')
execute function public.avatars_guard_write();

create trigger avatars_guard_update
before update on storage.objects
for each row
when (old.bucket_id = 'avatars' or new.bucket_id = 'avatars')
execute function public.avatars_guard_write();

-- Suppression : ses fichiers, sauf l'avatar actuel de son profil. (Le jeton d'un fichier est
-- consommé à son écriture : supprimer puis renvoyer le même nom est impossible.)
create policy "avatars_delete_own_unused" on storage.objects
for delete to authenticated
using (
  bucket_id = 'avatars'
  and owner_id = (select auth.uid())::text
  and not exists (
    select 1
    from public.profiles as p
    where p.user_id = (select auth.uid())
      and p.avatar_id::text = name
  )
);

-- Délivre un jeton d'envoi au compte connecté et renvoie le nom du fichier à envoyer (un uuid
-- aléatoire tiré par la base, en minuscules), valable cinq minutes. Remplace le jeton précédent du
-- compte ; efface les jetons échus de tous les comptes. Profil requis ; 30 demandes par jour et par
-- compte au plus (compteur « avatar_upload », pris après la vérification du profil). Erreurs :
-- profiles_not_authenticated (42501), profiles_not_found, profiles_rate_limited (P0001).
create function public.open_avatar_upload()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_avatar uuid := pg_catalog.gen_random_uuid();
begin
  if v_uid is null then
    raise exception 'profiles_not_authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles as p where p.user_id = v_uid) then
    raise exception 'profiles_not_found' using errcode = 'P0001';
  end if;
  if not public.rate_limit_take(v_uid, 'avatar_upload', 30, interval '1 day') then
    raise exception 'profiles_rate_limited' using errcode = 'P0001';
  end if;
  delete from public.avatar_upload_tickets as t where t.expires_at <= now();
  insert into public.avatar_upload_tickets as t (user_id, avatar_id, expires_at)
  values (v_uid, v_avatar, now() + interval '5 minutes')
  on conflict (user_id) do update set avatar_id = excluded.avatar_id, expires_at = excluded.expires_at;
  return v_avatar::text;
end;
$$;

comment on function public.open_avatar_upload() is
  'Délivre au compte connecté un jeton d''envoi d''avatar de cinq minutes et renvoie le nom du fichier à envoyer (30 par jour).';

-- Annule le jeton d'envoi du compte connecté (envoi abandonné, avatar retiré, profil ou compte
-- supprimé) : son fichier, s'il a été envoyé, peut alors être supprimé, et son nom ne peut plus
-- servir. Erreur : profiles_not_authenticated (42501).
create function public.cancel_avatar_upload()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'profiles_not_authenticated' using errcode = '42501';
  end if;
  delete from public.avatar_upload_tickets as t where t.user_id = v_uid;
end;
$$;

comment on function public.cancel_avatar_upload() is
  'Annule le jeton d''envoi d''avatar du compte connecté.';

-- Désigne (ou retire, avec null) l'avatar du profil du compte connecté ; renvoie l'avatar précédent
-- (null s'il n'y en avait pas), que l'application supprime ensuite de Storage. Le fichier
-- « <p_avatar> » doit exister et appartenir au compte (envoyé juste avant par l'application) : un
-- profil ne désigne jamais un fichier manquant ni celui d'un autre.
-- Le jeton d'envoi de ce fichier, s'il court encore, est consommé. Entrée bornée en texte avant
-- conversion. 20 changements par jour et par compte au plus (retirer l'avatar n'est jamais limité),
-- en plus des 30 envois de fichiers par jour (open_avatar_upload). Erreurs :
-- profiles_not_authenticated (42501), profiles_invalid, profiles_not_found, profiles_rate_limited (P0001).
create function public.set_profile_avatar(p_avatar text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_new uuid;
  v_old uuid;
begin
  if v_uid is null then
    raise exception 'profiles_not_authenticated' using errcode = '42501';
  end if;
  if p_avatar is not null then
    if not public.avatars_name_ok(p_avatar) then
      raise exception 'profiles_invalid' using errcode = 'P0001';
    end if;
    v_new := p_avatar::uuid;
  end if;
  select p.avatar_id into v_old
  from public.profiles as p
  where p.user_id = v_uid
  for update;
  if not found then
    raise exception 'profiles_not_found' using errcode = 'P0001';
  end if;
  if v_new is not null then
    if not exists (
      select 1
      from storage.objects as o
      where o.bucket_id = 'avatars'
        and o.name = p_avatar
        and o.owner_id = v_uid::text
    ) then
      raise exception 'profiles_invalid' using errcode = 'P0001';
    end if;
    if not public.rate_limit_take(v_uid, 'avatar_change', 20, interval '1 day') then
      raise exception 'profiles_rate_limited' using errcode = 'P0001';
    end if;
  end if;
  update public.profiles as p
  set avatar_id = v_new
  where p.user_id = v_uid;
  if v_new is not null then
    delete from public.avatar_upload_tickets as t where t.user_id = v_uid and t.avatar_id = v_new;
  end if;
  return v_old::text;
end;
$$;

comment on function public.set_profile_avatar(text) is
  'Désigne ou retire (null) l''avatar du profil du compte connecté ; renvoie l''identifiant de l''avatar précédent.';

-- Ouvre la lecture de l'avatar `p_avatar` pour le compte connecté (route /avatars/<id>), pour une
-- minute. Vrai si c'est son propre avatar (lisible sans autorisation) ou l'avatar actuel d'un profil
-- visible pour lui ; faux sinon (inconnu ou masqué : même réponse). Ne renvoie qu'un booléen : ni
-- chemin, ni identifiant de compte. 600 demandes par heure et par compte au plus
-- (profiles_rate_limited) ; les autorisations échues de tous les comptes sont effacées à chaque
-- demande. Erreurs : profiles_not_authenticated (42501), profiles_rate_limited (P0001).
create function public.open_avatar_read(p_avatar text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_avatar uuid;
begin
  if v_uid is null then
    raise exception 'profiles_not_authenticated' using errcode = '42501';
  end if;
  if not public.avatars_name_ok(p_avatar) then
    return false;
  end if;
  v_avatar := p_avatar::uuid;
  if exists (select 1 from public.profiles as p where p.user_id = v_uid and p.avatar_id = v_avatar) then
    return true;
  end if;
  if not public.rate_limit_take(v_uid, 'avatar_read', 600, interval '1 hour') then
    raise exception 'profiles_rate_limited' using errcode = 'P0001';
  end if;
  delete from public.avatar_read_grants as g where g.expires_at <= now();
  if not exists (
    select 1
    from public.profiles as p
    where p.avatar_id = v_avatar
      and public.profiles_visible_to(p.user_id, p.visibility, v_uid)
  ) then
    return false;
  end if;
  insert into public.avatar_read_grants as g (viewer_id, avatar_id, expires_at)
  values (v_uid, v_avatar, now() + interval '1 minute')
  on conflict (viewer_id, avatar_id) do update set expires_at = excluded.expires_at;
  return true;
end;
$$;

comment on function public.open_avatar_read(text) is
  'Autorise pour une minute la lecture de l''avatar désigné s''il est l''avatar actuel d''un profil visible pour le compte connecté ; vrai ou faux.';

-- Noms des fichiers du compte connecté dans le compartiment (avatar actuel, remplaçant ou fichier
-- resté après un envoi interrompu ; deux au plus d'après la politique d'envoi). SECURITY DEFINER
-- pour ne lister que ses fichiers à lui (la liste de l'API Storage montrerait aussi les avatars que
-- le compte vient de demander).
create function public.my_avatar_files()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects as o
  where o.bucket_id = 'avatars'
    and o.owner_id = (select auth.uid())::text
  order by o.name
  limit 10
$$;

comment on function public.my_avatar_files() is
  'Noms des fichiers du compte connecté dans le compartiment « avatars ».';

-- Autorisations d'affichage en cours ou échues (pas encore effacées) du compte connecté, pour
-- « Télécharger mes données » (droit d'accès) : avatar et échéance. Rien sur les autres comptes ;
-- lecture seule. Au plus quelques centaines de lignes (600 demandes par heure, et chaque demande
-- efface les autorisations échues de tous les comptes) ; la borne n'est jamais atteinte en pratique.
create function public.my_avatar_read_grants()
returns table (avatar_id uuid, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select g.avatar_id, g.expires_at
  from public.avatar_read_grants as g
  where g.viewer_id = (select auth.uid())
  order by g.expires_at, g.avatar_id
  limit 5000
$$;

comment on function public.my_avatar_read_grants() is
  'Autorisations d''affichage d''avatars du compte connecté (droit d''accès) ; lecture seule.';

-- Jeton d'envoi du compte connecté (en cours ou échu, pas encore effacé), pour « Télécharger mes
-- données » (droit d'accès) : nom du fichier attendu et échéance. Une ligne au plus ; lecture seule.
create function public.my_avatar_upload_ticket()
returns table (avatar_id uuid, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select t.avatar_id, t.expires_at
  from public.avatar_upload_tickets as t
  where t.user_id = (select auth.uid())
$$;

comment on function public.my_avatar_upload_ticket() is
  'Jeton d''envoi d''avatar du compte connecté (droit d''accès) ; lecture seule.';

-- Droits : les fonctions appelées par l'application, et celles qu'évaluent les politiques de
-- Storage (avec les droits du compte), sont réservées aux comptes connectés ; rien pour anon.
revoke all on function public.set_profile_avatar(text) from public, anon, authenticated;
grant execute on function public.set_profile_avatar(text) to authenticated;
revoke all on function public.open_avatar_read(text) from public, anon, authenticated;
grant execute on function public.open_avatar_read(text) to authenticated;
revoke all on function public.my_avatar_files() from public, anon, authenticated;
grant execute on function public.my_avatar_files() to authenticated;
revoke all on function public.my_avatar_read_grants() from public, anon, authenticated;
grant execute on function public.my_avatar_read_grants() to authenticated;
revoke all on function public.open_avatar_upload() from public, anon, authenticated;
grant execute on function public.open_avatar_upload() to authenticated;
revoke all on function public.cancel_avatar_upload() from public, anon, authenticated;
grant execute on function public.cancel_avatar_upload() to authenticated;
revoke all on function public.my_avatar_upload_ticket() from public, anon, authenticated;
grant execute on function public.my_avatar_upload_ticket() to authenticated;
revoke all on function public.avatars_upload_pending(text) from public, anon, authenticated;
grant execute on function public.avatars_upload_pending(text) to authenticated;
revoke all on function public.avatars_read_granted(text, text) from public, anon, authenticated;
grant execute on function public.avatars_read_granted(text, text) to authenticated;
revoke all on function public.avatars_upload_allowed(text) from public, anon, authenticated;
grant execute on function public.avatars_upload_allowed(text) to authenticated;
revoke all on function public.avatars_name_ok(text) from public, anon, authenticated;
grant execute on function public.avatars_name_ok(text) to authenticated;
