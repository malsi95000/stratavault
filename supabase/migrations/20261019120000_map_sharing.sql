-- Partage et coopération (CMY-02, bêta 2.1, socle communautaire) : membres d'une carte avec un rôle
-- (propriétaire, éditeur, lecteur), invitation d'un contact ou par lien à jeton, acceptation par un
-- compte connecté, retrait d'un membre, départ volontaire, et verrou d'édition (un seul éditeur à la
-- fois, bail renouvelé tant qu'il est actif).
--
-- Tables (RLS activé SANS politique et aucun droit pour l'API : chaque ligne contient l'identifiant
-- de compte d'un membre, qui ne doit jamais sortir de la base). Tout passe par les fonctions
-- SECURITY DEFINER ci-dessous, qui vérifient auth.uid(), bornent leurs entrées en texte avant toute
-- conversion et ne renvoient que des champs publics (identifiant, nom affiché) et des références
-- opaques (uuid tirés au hasard) :
--   - public.map_members : membres d'une carte (rôle « editor » ou « reader ») ; le propriétaire est
--     celui de la carte (public.maps.user_id), il n'y figure pas. Supprimés avec la carte et avec le
--     profil du membre ;
--   - public.map_invitations : invitation d'un contact du propriétaire, en attente de sa réponse
--     (30 jours au plus) ; supprimée quand elle est acceptée, refusée ou annulée, avec la carte ou
--     le profil de l'invité, et quand le propriétaire et l'invité ne sont plus contacts (contact
--     retiré par l'un ou l'autre, blocage : déclencheurs). Une invitation montre l'identifiant et le
--     nom affiché de chacun à l'autre : elle ne survit pas au contact qui la justifiait ;
--   - public.map_links : liens d'invitation. Le jeton (64 caractères hexadécimaux, 244 bits tirés par
--     le générateur aléatoire fort de PostgreSQL) n'est montré qu'une fois, à sa création ; seule son
--     empreinte SHA-256 est enregistrée. Chaque lien a un rôle, une échéance (30 jours au plus) et un
--     nombre d'usages borné (50 au plus) ; le propriétaire le révoque en le supprimant ;
--   - public.map_link_uses : comptes qui ont rejoint une carte par un lien. Un lien ne sert qu'une
--     fois à chaque compte : un membre retiré, ou passé lecteur puis parti, ne revient pas par le lien
--     déjà utilisé (seule une nouvelle invitation, ou un autre lien, le fait revenir) ;
--   - public.map_locks : verrou d'édition d'une carte (qui la modifie, jusqu'à quand). Bail de deux
--     minutes, renouvelé par l'éditeur tant qu'il est actif ; libéré à la sortie ; un bail échu peut
--     être repris par un autre éditeur.
-- Une invitation, un lien ou un verrou échus ne servent plus et ne sont plus affichés ; ils sont
-- effacés à la prochaine invitation pour la carte, à la prochaine création d'un lien pour la carte, à
-- la prochaine prise de verrou sur la carte ou par le même compte, et avec la carte, le profil ou le compte.
--
-- Lecture et écriture du contenu d'une carte partagée :
--   - lecture : par public.open_shared_map (propriétaire et membres), qui compte chaque lecture
--     complète, et public.shared_map_state (version et verrou, pour le rafraîchissement périodique),
--     comptée elle aussi.
--     Les politiques RLS de public.maps ne changent PAS : une politique « membres » donnerait aux
--     membres la ligne entière, dont public.maps.user_id, l'identifiant de compte du propriétaire
--     (le droit SELECT de l'API porte sur toute la table : l'application en production filtre sur
--     cette colonne). La lecture des membres passe donc par ces fonctions, qui vérifient
--     l'appartenance à la carte et ne renvoient jamais d'identifiant de compte ;
--   - écriture : par la fonction existante public.update_map_data, remplacée ici (mêmes paramètres,
--     mêmes droits, même contrôle de version) : le propriétaire et les éditeurs peuvent écrire, les
--     lecteurs jamais ; un éditeur doit tenir le verrou d'édition ; personne ne peut écrire pendant
--     le bail d'un autre (erreur maps_locked), sauf le propriétaire qui renvoie le contenu tel quel
--     (ouverture depuis son espace : rien ne change). Sans verrou posé, le propriétaire écrit comme
--     avant : l'application en production (qui ne connaît pas les verrous) continue de fonctionner.
--     Dans une carte qui a des membres, chaque écriture du propriétaire qui change le contenu prend
--     (ou renouvelle) le verrou pour deux minutes, même hors de l'éditeur coopératif : les membres
--     voient qu'il la modifie. Une carte sans membre n'a jamais de verrou. L'application mène le
--     propriétaire d'une carte qui a des membres à l'éditeur coopératif (« Continuer ») ;
--   - renommer, supprimer, changer le logo et partager restent réservés au propriétaire
--     (politiques RLS et set_map_cover inchangées ; fonctions de partage ci-dessous).
--
-- Ce que chacun voit :
--   - le propriétaire voit, pour ses cartes, l'identifiant et le nom affiché de ses membres et des
--     contacts invités, et ses liens (rôle, usages, échéance ; jamais le jeton) ;
--   - un membre voit le nom de la carte, son rôle, l'identifiant et le nom affiché du propriétaire, et
--     le nom affiché de celui qui modifie la carte (« X modifie cette carte ») ; il ne voit pas la
--     liste des autres membres ;
--   - un invité voit le nom de la carte, le rôle proposé et le propriétaire ;
--   - celui qui ouvre un lien voit, avant de rejoindre la carte, son nom, le rôle et le propriétaire.
-- Rejoindre une carte montre donc son identifiant et son nom affiché au propriétaire, et son nom
-- affiché aux autres membres quand on la modifie.
-- Blocage (public.contact_blocks) : un blocage entre deux comptes, dans un sens ou dans l'autre,
-- retire chacun des cartes de l'autre et supprime les invitations entre eux (déclencheur) ; un lien
-- d'un compte bloqué répond comme un lien inconnu ; le nom d'un éditeur bloqué n'est pas montré.
-- Profil : il faut un profil pour partager, être invité ou rejoindre une carte. Supprimer son profil
-- retire le compte des cartes des autres (cascade) et arrête tous les partages de ses propres cartes
-- (membres, invitations, liens et verrous des autres supprimés, déclencheur). Une écriture de partage
-- garde le profil du propriétaire (for key share) jusqu'à la fin : une suppression simultanée attend,
-- puis supprime aussi ce qui vient d'être écrit ; un profil déjà supprimé donne « not-found ».
--
-- Anti-énumération : les cartes sont désignées par leur uuid (tiré au hasard par la base) ; une carte
-- inconnue, une carte d'un autre compte et une carte où l'on n'est pas membre donnent la même
-- réponse. Un lien inconnu, échu, épuisé, révoqué, celui d'un compte bloqué ou un lien déjà utilisé
-- par un compte qui n'est plus membre donnent la même réponse « not-found », et chaque essai est
-- compté AVANT de chercher le jeton. Les contacts invités sont désignés par la référence de leur
-- contact (public.my_contacts) : seuls les contacts du propriétaire peuvent être invités.
--
-- Limites anti-abus (public.rate_limits, par compte ; mêmes valeurs que src/features/sharing/limits.ts,
-- vérifiées par les tests) : 100 partages par jour (invitations et liens créés), 60 essais de lien
-- par jour (aperçu ou acceptation), 300 autres opérations par jour (rôle, retrait, départ, réponse,
-- annulation, révocation), 600 prises ou renouvellements de verrou par heure, 600 lectures complètes
-- de cartes partagées par heure, 1 200 lectures de l'état d'une carte (version et verrou) par heure.
-- Toute fonction comptée répond par un statut, jamais par une erreur, une fois le compteur pris
-- (une erreur annulerait l'incrément avec le reste de l'instruction). Bornes : 50 membres et invitations en attente par carte, 10 liens
-- actifs par carte, 200 cartes partagées avec un compte, 100 invitations reçues en attente par compte.
--
-- Concurrence : les opérations qui changent les membres d'une carte prennent d'abord un verrou
-- consultatif propre à la carte, puis (pour un compte qui rejoint ou est invité) un verrou propre à
-- ce compte, toujours dans cet ordre (aucun interblocage) ; les bornes sont vérifiées après. Entrer
-- dans une carte (answer_map_invitation, accept_map_link) commence par le verrou du couple
-- propriétaire-compte (public.contacts_lock_pair), celui que prend un blocage : l'entrée et le blocage
-- ne se croisent jamais, et le blocage est revérifié après les verrous. Ordres complets :
--   - entrer : couple, profil du propriétaire, carte, compte, puis ligne du lien ;
--   - inviter : profil du propriétaire, ligne du contact, carte, compte invité ;
--   - créer un lien : profil du propriétaire, carte ;
--   - bloquer : couple, puis lignes des membres, des invitations et du contact ;
--   - supprimer un profil : sa ligne, puis celles de ses partages et de ses contacts.
-- Nul n'attend le verrou d'un couple en tenant celui d'une carte ou une ligne de contact, ni le profil
-- en tenant une ligne qu'une suppression de profil doit prendre : aucun cycle.
--
-- Droit d'accès : chaque compte relit ses partages par public.maps_shared_with_me(),
-- public.my_map_invitations(), public.my_map_shares(), public.my_map_locks() et
-- public.my_map_link_uses() (« Télécharger mes données »).
--
-- Compatible avec l'application déjà en production (v2.0) et avec l'étape 1 et les profils et
-- contacts de la bêta 2.1 : nouvelles tables et nouvelles fonctions ; seules changent la liste fermée
-- des actions de public.rate_limits (six actions ajoutées : les lignes existantes restent valides) et
-- public.update_map_data (mêmes paramètres et mêmes droits ; pour un compte sans carte partagée, même
-- comportement). À appliquer après 20261018120000_contacts.sql.

-- Compteurs : actions du partage ajoutées à la liste fermée.
alter table public.rate_limits drop constraint rate_limits_action;
alter table public.rate_limits add constraint rate_limits_action check (
  action in (
    'profile_create', 'profile_handle', 'profile_change', 'handle_attempt', 'profile_lookup', 'avatar_upload', 'avatar_change', 'avatar_read',
    'contact_request', 'contact_block', 'contact_change',
    'map_share', 'map_join', 'map_change', 'map_lock', 'map_read', 'map_state'
  )
);

create table public.map_members (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  map_id uuid not null references public.maps (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  role text not null constraint map_members_role check (role in ('editor', 'reader')),
  created_at timestamptz not null default now(),
  constraint map_members_pair_key unique (map_id, user_id)
);

create index map_members_user on public.map_members (user_id);

comment on table public.map_members is
  'Membres des cartes partagées (carte, compte, rôle) ; le propriétaire est celui de la carte. Aucun accès par l''API.';

create table public.map_invitations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  map_id uuid not null references public.maps (id) on delete cascade,
  invitee_id uuid not null references public.profiles (user_id) on delete cascade,
  role text not null constraint map_invitations_role check (role in ('editor', 'reader')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint map_invitations_pair_key unique (map_id, invitee_id)
);

create index map_invitations_invitee on public.map_invitations (invitee_id);

comment on table public.map_invitations is
  'Invitations de contacts à rejoindre une carte, en attente de réponse ; aucun accès par l''API.';

create table public.map_links (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  map_id uuid not null references public.maps (id) on delete cascade,
  -- Empreinte SHA-256 du jeton ; le jeton lui-même n'est jamais enregistré.
  token_hash bytea not null constraint map_links_token_hash_key unique
    constraint map_links_token_hash_length check (octet_length(token_hash) = 32),
  role text not null constraint map_links_role check (role in ('editor', 'reader')),
  max_uses integer not null constraint map_links_max_uses check (max_uses between 1 and 50),
  uses integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint map_links_uses check (uses between 0 and max_uses)
);

create index map_links_map on public.map_links (map_id);

comment on table public.map_links is
  'Liens d''invitation à une carte (empreinte du jeton, rôle, usages, échéance) ; aucun accès par l''API.';

-- Comptes qui ont déjà rejoint une carte par un lien : un lien ne sert qu'une fois à chaque compte.
-- Sans cela, un membre retiré (ou passé lecteur, qui quitte la carte) la rejoindrait aussitôt par le
-- lien déjà utilisé, avec le rôle du lien : la décision du propriétaire serait annulée. Supprimé avec
-- le lien (révocation, échéance, carte supprimée) et avec le compte ; il survit à la suppression du
-- profil (sinon supprimer puis recréer son profil rouvrirait le lien).
create table public.map_link_uses (
  link_id uuid not null references public.map_links (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  used_at timestamptz not null default now(),
  constraint map_link_uses_pkey primary key (link_id, user_id)
);

create index map_link_uses_user on public.map_link_uses (user_id);

comment on table public.map_link_uses is
  'Comptes qui ont rejoint une carte par un lien d''invitation (un lien sert une fois par compte) ; aucun accès par l''API.';

create table public.map_locks (
  map_id uuid primary key references public.maps (id) on delete cascade,
  holder_id uuid not null references auth.users (id) on delete cascade,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index map_locks_holder on public.map_locks (holder_id);

comment on table public.map_locks is
  'Verrou d''édition des cartes (qui modifie, jusqu''à quand : bail de deux minutes renouvelé) ; aucun accès par l''API.';

alter table public.map_members enable row level security;
alter table public.map_invitations enable row level security;
alter table public.map_links enable row level security;
alter table public.map_locks enable row level security;
alter table public.map_link_uses enable row level security;
revoke all on table public.map_members from public, anon, authenticated;
revoke all on table public.map_invitations from public, anon, authenticated;
revoke all on table public.map_links from public, anon, authenticated;
revoke all on table public.map_locks from public, anon, authenticated;
revoke all on table public.map_link_uses from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Fonctions internes (EXECUTE retiré à tous : appelées par les fonctions SECURITY DEFINER).
-- ---------------------------------------------------------------------------------------------

-- Rôle de `p_user` sur la carte `p_map` : « owner », « editor », « reader », ou null.
create function public.map_sharing_role(p_map uuid, p_user uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when p_user is null or p_map is null then null
    when exists (select 1 from public.maps as m where m.id = p_map and m.user_id = p_user) then 'owner'
    else (select mm.role from public.map_members as mm where mm.map_id = p_map and mm.user_id = p_user)
  end
$$;

-- Identifiant (uuid en minuscules) reçu en texte : null s'il est mal formé. Longueur vérifiée avant
-- l'expression régulière, conversion seulement ensuite.
create function public.map_sharing_uuid(p_value text)
returns uuid
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_value is not null
      and octet_length(p_value) = 36
      and p_value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then p_value::uuid
  end
$$;

-- Rôle proposé (invitation, lien, changement de rôle) : « editor » ou « reader », sinon erreur.
create function public.map_sharing_check_role(p_role text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_role is null or octet_length(p_role) > 16 or p_role not in ('editor', 'reader') then
    raise exception 'sharing_invalid' using errcode = 'P0001';
  end if;
  return p_role;
end;
$$;

-- Empreinte d'un jeton de lien (64 caractères hexadécimaux en minuscules) ; null s'il est mal formé.
-- Longueur vérifiée avant l'expression régulière.
create function public.map_sharing_token_hash(p_token text)
returns bytea
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_token is not null and octet_length(p_token) = 64 and p_token ~ '^[0-9a-f]{64}$'
    then pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8'))
  end
$$;

-- Verrous consultatifs, levés à la fin de la transaction : d'abord celui de la carte, puis celui du
-- compte qui la rejoint ou y est invité (toujours dans cet ordre).
create function public.map_sharing_lock_map(p_map uuid)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('public.map_sharing.map:' || p_map::text, 0))
$$;

create function public.map_sharing_lock_user(p_user uuid)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('public.map_sharing.user:' || p_user::text, 0))
$$;

-- Garde le profil `p_user` jusqu'à la fin de la transaction : sa suppression attend, et son déclencheur
-- et ses cascades voient alors ce que la transaction a écrit. Faux s'il n'existe plus.
create function public.map_sharing_keep_profile(p_user uuid)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.profiles as p where p.user_id = p_user for key share;
  return found;
end;
$$;

-- Compte une opération du compte ; erreur sharing_rate_limited au-delà de la limite.
create function public.map_sharing_take(p_user uuid, p_action text, p_limit integer, p_window interval)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if not public.rate_limit_take(p_user, p_action, p_limit, p_window) then
    raise exception 'sharing_rate_limited' using errcode = 'P0001';
  end if;
end;
$$;

-- Erreurs communes : pas de compte, pas de profil.
create function public.map_sharing_require_profile(p_user uuid)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_user is null then
    raise exception 'sharing_not_authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles as p where p.user_id = p_user) then
    raise exception 'sharing_no_profile' using errcode = 'P0001';
  end if;
end;
$$;

-- Nombre de membres et d'invitations en attente (non échues) de la carte `p_map`.
create function public.map_sharing_seats(p_map uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select (select count(*) from public.map_members as mm where mm.map_id = p_map)
    + (select count(*) from public.map_invitations as i where i.map_id = p_map and i.expires_at > now())
$$;

-- Nom affiché de `p_user` pour `p_viewer` dans le cadre d'une carte partagée : null s'il n'a pas de
-- profil ou si un blocage existe entre eux (dans un sens ou dans l'autre).
create function public.map_sharing_name(p_user uuid, p_viewer uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select p.display_name
  from public.profiles as p
  where p.user_id = p_user
    and (p_user = p_viewer or not public.contacts_blocked_either(p_user, p_viewer))
$$;

-- Verrou d'édition encore valide de la carte `p_map` : son titulaire, ou null.
create function public.map_sharing_holder(p_map uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select l.holder_id from public.map_locks as l where l.map_id = p_map and l.expires_at > now()
$$;

-- Prend ou renouvelle pour deux minutes le verrou d'édition de la carte `p_map` au nom de `p_user` :
-- échéance du bail, ou null si un autre compte tient un bail en cours (jamais remplacé : atomique).
create function public.map_sharing_hold(p_map uuid, p_user uuid)
returns timestamptz
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.map_locks as l (map_id, holder_id, acquired_at, expires_at)
  values (p_map, p_user, now(), now() + interval '2 minutes')
  on conflict (map_id) do update
  set holder_id = excluded.holder_id,
    acquired_at = case when l.holder_id = excluded.holder_id and l.expires_at > now() then l.acquired_at else now() end,
    expires_at = excluded.expires_at
  where l.holder_id = excluded.holder_id or l.expires_at <= now()
  returning l.expires_at
$$;

-- ---------------------------------------------------------------------------------------------
-- Déclencheurs : un membre retiré (ou passé lecteur) perd son verrou ; un blocage sépare les deux
-- comptes ; un profil supprimé arrête les partages des cartes de son compte.
-- ---------------------------------------------------------------------------------------------

create function public.map_members_drop_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.map_locks as l where l.map_id = old.map_id and l.holder_id = old.user_id;
    return old;
  end if;
  if new.role = 'reader' then
    delete from public.map_locks as l where l.map_id = new.map_id and l.holder_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger map_members_drop_lock
after delete or update of role on public.map_members
for each row execute function public.map_members_drop_lock();

create function public.map_sharing_separate_pair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.map_members as mm
  using public.maps as m
  where m.id = mm.map_id
    and ((m.user_id = new.blocker_id and mm.user_id = new.blocked_id)
      or (m.user_id = new.blocked_id and mm.user_id = new.blocker_id));
  delete from public.map_invitations as i
  using public.maps as m
  where m.id = i.map_id
    and ((m.user_id = new.blocker_id and i.invitee_id = new.blocked_id)
      or (m.user_id = new.blocked_id and i.invitee_id = new.blocker_id));
  return new;
end;
$$;

create trigger map_sharing_separate_pair
after insert on public.contact_blocks
for each row execute function public.map_sharing_separate_pair();

-- Contact retiré (par l'un ou l'autre, ou par un blocage) : les invitations en attente entre les deux,
-- dans un sens comme dans l'autre, sont supprimées. Sinon, pendant 30 jours, chacun suivrait dans
-- ses invitations l'identifiant et le nom affiché de l'autre, même masqué ou renommé ensuite, et
-- l'invité pourrait encore rejoindre la carte. Les membres déjà entrés restent (ils ne dépendent pas
-- du contact).
create function public.map_sharing_on_contact_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.map_invitations as i
  using public.maps as m
  where m.id = i.map_id
    and ((m.user_id = old.user_low and i.invitee_id = old.user_high)
      or (m.user_id = old.user_high and i.invitee_id = old.user_low));
  return old;
end;
$$;

create trigger map_sharing_on_contact_delete
after delete on public.contacts
for each row execute function public.map_sharing_on_contact_delete();

create function public.map_sharing_on_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.map_members as mm using public.maps as m where m.id = mm.map_id and m.user_id = old.user_id;
  delete from public.map_invitations as i using public.maps as m where m.id = i.map_id and m.user_id = old.user_id;
  delete from public.map_links as k using public.maps as m where m.id = k.map_id and m.user_id = old.user_id;
  delete from public.map_locks as l using public.maps as m
  where m.id = l.map_id and m.user_id = old.user_id and l.holder_id <> old.user_id;
  return old;
end;
$$;

create trigger map_sharing_on_profile_delete
after delete on public.profiles
for each row execute function public.map_sharing_on_profile_delete();

-- ---------------------------------------------------------------------------------------------
-- Écriture du contenu : public.update_map_data remplacée (voir l'en-tête).
-- ---------------------------------------------------------------------------------------------

-- Remplace le contenu d'une carte si elle en est encore à la version `p_expected_revision`. Peuvent
-- écrire : le propriétaire, et un éditeur qui tient le verrou d'édition ; personne pendant le bail
-- d'un autre compte, sauf le propriétaire qui renvoie le contenu tel quel (« Continuer » depuis son
-- espace : rien ne change). Aucune ligne : la carte n'existe pas ou le compte n'en est pas membre.
-- Erreurs : maps_not_authenticated (42501), maps_too_large, maps_invalid, maps_conflict (version
-- différente), maps_locked (lecteur, verrou d'un autre, ou éditeur sans verrou) (P0001).
create or replace function public.update_map_data(p_id uuid, p_data text, p_expected_revision bigint)
returns table (id uuid, name text, updated_at timestamptz, revision bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_revision bigint;
  v_role text;
  v_holder uuid;
  v_doc jsonb;
  v_id uuid;
  v_name text;
  v_updated timestamptz;
  v_new_revision bigint;
begin
  if v_uid is null then
    raise exception 'maps_not_authenticated' using errcode = '42501';
  end if;
  -- Contrôles qui ne coûtent rien d'abord ; le contenu n'est lu que pour une écriture possible.
  if p_data is not null and octet_length(p_data) > 4000000 then
    raise exception 'maps_too_large' using errcode = 'P0001';
  end if;
  v_role := public.map_sharing_role(p_id, v_uid);
  if v_role is null then
    return;
  end if;
  select m.revision into v_revision from public.maps as m where m.id = p_id;
  if not found then
    return;
  end if;
  v_holder := public.map_sharing_holder(p_id);
  if v_role = 'reader' or (v_role = 'editor' and v_holder is distinct from v_uid) then
    raise exception 'maps_locked' using errcode = 'P0001';
  end if;
  -- Pendant le bail d'un autre membre, le propriétaire ne peut que renvoyer le contenu enregistré tel
  -- quel (ouverture d'une carte depuis son espace) : sa version ne change pas, rien n'est écrasé.
  if v_role = 'owner' and v_holder is not null and v_holder <> v_uid then
    v_doc := public.maps_parse_doc(p_data);
    if not exists (select 1 from public.maps as m where m.id = p_id and m.data = v_doc) then
      raise exception 'maps_locked' using errcode = 'P0001';
    end if;
  end if;
  -- Il n'existe pas d'écriture sans version attendue.
  if p_expected_revision is null or v_revision <> p_expected_revision then
    raise exception 'maps_conflict' using errcode = 'P0001';
  end if;
  if v_doc is null then
    v_doc := public.maps_parse_doc(p_data);
  end if;
  update public.maps as m
  set data = v_doc
  where m.id = p_id and m.revision = p_expected_revision
  returning m.id, m.name, m.updated_at, m.revision into v_id, v_name, v_updated, v_new_revision;
  -- Modifiée (ou supprimée) entre la lecture et l'écriture : rien n'est écrasé.
  if not found then
    raise exception 'maps_conflict' using errcode = 'P0001';
  end if;
  -- Le propriétaire qui modifie le contenu sans passer par l'éditeur coopératif (éditeur de son
  -- espace, ou application d'avant le partage) dans une carte qui a des membres prend (ou renouvelle)
  -- le verrou pour deux minutes : les membres voient qu'il la modifie et n'écrivent pas en même temps.
  -- Un contenu renvoyé tel quel garde sa version (maps_assign_revision) et ne prend pas le verrou. Une
  -- carte sans membre n'a jamais de verrou (rien ne change pour elle).
  if v_role = 'owner'
    and v_new_revision <> p_expected_revision
    and exists (select 1 from public.map_members as mm where mm.map_id = p_id) then
    perform public.map_sharing_hold(p_id, v_uid);
  end if;
  id := v_id;
  name := v_name;
  updated_at := v_updated;
  revision := v_new_revision;
  return next;
end;
$$;

comment on function public.update_map_data(uuid, text, bigint) is
  'Remplace le contenu d''une carte (propriétaire, ou éditeur qui tient le verrou d''édition) si elle est à la version attendue.';

-- ---------------------------------------------------------------------------------------------
-- Invitations de contacts (propriétaire → contact) et réponses.
-- ---------------------------------------------------------------------------------------------

-- Invite le contact `p_contact` (référence renvoyée par my_contacts) à rejoindre la carte `p_map`
-- avec le rôle `p_role`. Réponses : « invited » ; « not-found » (carte inconnue ou d'un autre compte,
-- contact inconnu : même réponse) ; « already-member » ; « already-invited » ; « map-full » (50
-- membres et invitations) ; « unavailable » (le contact a 100 invitations en attente). 100 partages
-- par jour, comptés avant de chercher. Erreurs : sharing_not_authenticated (42501), sharing_no_profile,
-- sharing_invalid, sharing_rate_limited (P0001).
create function public.invite_contact_to_map(p_map text, p_contact text, p_role text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_map uuid := public.map_sharing_uuid(p_map);
  v_contact uuid := public.map_sharing_uuid(p_contact);
  v_role text;
  v_target uuid;
begin
  perform public.map_sharing_require_profile(v_uid);
  v_role := public.map_sharing_check_role(p_role);
  if v_map is null or v_contact is null then
    return 'not-found';
  end if;
  perform public.map_sharing_take(v_uid, 'map_share', 100, interval '1 day');
  if public.map_sharing_role(v_map, v_uid) is distinct from 'owner' then
    return 'not-found';
  end if;
  -- Avant la ligne du contact, que la suppression du profil supprime après avoir pris le profil.
  if not public.map_sharing_keep_profile(v_uid) then
    return 'not-found';
  end if;
  -- Ligne du contact verrouillée (for key share) jusqu'à la fin : un retrait ou un blocage simultané
  -- attend que l'invitation soit écrite, puis la supprime avec le contact (déclencheur
  -- map_sharing_on_contact_delete). Sans ce verrou, l'invitation écrite juste après le retrait du
  -- contact lui survivrait.
  select case when c.user_low = v_uid then c.user_high else c.user_low end into v_target
  from public.contacts as c
  where c.id = v_contact
    and v_uid in (c.user_low, c.user_high)
    and not public.contacts_blocked_either(c.user_low, c.user_high)
  for key share of c;
  if v_target is null then
    return 'not-found';
  end if;
  perform public.map_sharing_lock_map(v_map);
  perform public.map_sharing_lock_user(v_target);
  if exists (select 1 from public.map_members as mm where mm.map_id = v_map and mm.user_id = v_target) then
    return 'already-member';
  end if;
  -- Les invitations échues de la carte (plus utilisables ni affichées) sont effacées.
  delete from public.map_invitations as i where i.map_id = v_map and i.expires_at <= now();
  if exists (select 1 from public.map_invitations as i where i.map_id = v_map and i.invitee_id = v_target) then
    return 'already-invited';
  end if;
  if public.map_sharing_seats(v_map) >= 50 then
    return 'map-full';
  end if;
  if (select count(*) from public.map_invitations as i where i.invitee_id = v_target and i.expires_at > now()) >= 100 then
    return 'unavailable';
  end if;
  insert into public.map_invitations (map_id, invitee_id, role, expires_at)
  values (v_map, v_target, v_role, now() + interval '30 days');
  return 'invited';
end;
$$;

comment on function public.invite_contact_to_map(text, text, text) is
  'Invite un contact du propriétaire à rejoindre une carte avec un rôle (éditeur ou lecteur) ; 100 partages par jour.';

-- Fait entrer `p_user` dans la carte `p_map` avec le rôle `p_role` (verrous déjà pris par
-- l'appelant). Réponses : « joined », « already-member », « map-full », « memberships-full ». Une
-- invitation en attente du compte pour cette carte est supprimée.
create function public.map_sharing_join(p_map uuid, p_user uuid, p_role text, p_free_seats bigint)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if exists (select 1 from public.map_members as mm where mm.map_id = p_map and mm.user_id = p_user) then
    return 'already-member';
  end if;
  -- `p_free_seats` : places déjà comptées pour ce compte (son invitation en attente).
  if public.map_sharing_seats(p_map) - p_free_seats >= 50 then
    return 'map-full';
  end if;
  if (select count(*) from public.map_members as mm where mm.user_id = p_user) >= 200 then
    return 'memberships-full';
  end if;
  delete from public.map_invitations as i where i.map_id = p_map and i.invitee_id = p_user;
  insert into public.map_members (map_id, user_id, role) values (p_map, p_user, p_role);
  return 'joined';
end;
$$;

-- Répond à l'invitation reçue `p_invitation` : `p_accept` vrai pour la rejoindre, faux pour la
-- refuser. Réponses : « joined » (et l'identifiant de la carte), « refused », « not-found »
-- (référence inconnue, invitation échue ou adressée à un autre compte : même réponse),
-- « already-member », « map-full », « memberships-full » (200 cartes partagées). Erreurs :
-- sharing_not_authenticated (42501), sharing_no_profile, sharing_rate_limited (P0001).
create function public.answer_map_invitation(p_invitation text, p_accept boolean)
returns table (status text, map_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_ref uuid := public.map_sharing_uuid(p_invitation);
  v_map uuid;
  v_owner uuid;
  v_role text;
  v_status text;
begin
  perform public.map_sharing_require_profile(v_uid);
  if v_ref is null or p_accept is null then
    return query select 'not-found'::text, null::uuid;
    return;
  end if;
  perform public.map_sharing_take(v_uid, 'map_change', 300, interval '1 day');
  select i.map_id, m.user_id into v_map, v_owner
  from public.map_invitations as i
  join public.maps as m on m.id = i.map_id
  where i.id = v_ref and i.invitee_id = v_uid;
  if v_map is null then
    return query select 'not-found'::text, null::uuid;
    return;
  end if;
  -- Couple d'abord : un blocage simultané attend la fin de cette transaction, puis retire le membre ;
  -- s'il est passé avant, la relecture ci-dessous le voit (voir « Concurrence » en tête de fichier).
  perform public.contacts_lock_pair(v_owner, v_uid);
  if not public.map_sharing_keep_profile(v_owner) then
    return query select 'not-found'::text, null::uuid;
    return;
  end if;
  perform public.map_sharing_lock_map(v_map);
  perform public.map_sharing_lock_user(v_uid);
  -- Relue après les verrous : annulée, échue, ou supprimée par un blocage ou le retrait du contact
  -- entre-temps (défense en profondeur : sans contact entre le propriétaire et l'invité, l'invitation
  -- ne sert plus et elle est supprimée).
  select i.role into v_role
  from public.map_invitations as i
  join public.maps as m on m.id = i.map_id
  where i.id = v_ref
    and i.invitee_id = v_uid
    and i.expires_at > now()
    and not public.contacts_blocked_either(m.user_id, v_uid)
    and public.contacts_linked(m.user_id, v_uid);
  if v_role is null then
    delete from public.map_invitations as i where i.id = v_ref and i.invitee_id = v_uid;
    return query select 'not-found'::text, null::uuid;
    return;
  end if;
  if not p_accept then
    delete from public.map_invitations as i where i.id = v_ref;
    return query select 'refused'::text, null::uuid;
    return;
  end if;
  v_status := public.map_sharing_join(v_map, v_uid, v_role, 1);
  return query select v_status, case when v_status in ('joined', 'already-member') then v_map end;
end;
$$;

comment on function public.answer_map_invitation(text, boolean) is
  'Accepte ou refuse une invitation à une carte reçue par le compte connecté.';

-- Annule l'invitation `p_invitation` d'une carte du compte connecté. Réponses : « cancelled »,
-- « not-found ». Erreurs : sharing_not_authenticated (42501), sharing_rate_limited (P0001).
create function public.cancel_map_invitation(p_invitation text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ref uuid := public.map_sharing_uuid(p_invitation);
begin
  if v_uid is null then
    raise exception 'sharing_not_authenticated' using errcode = '42501';
  end if;
  if v_ref is null then
    return 'not-found';
  end if;
  perform public.map_sharing_take(v_uid, 'map_change', 300, interval '1 day');
  delete from public.map_invitations as i
  using public.maps as m
  where i.id = v_ref and m.id = i.map_id and m.user_id = v_uid;
  return case when found then 'cancelled' else 'not-found' end;
end;
$$;

comment on function public.cancel_map_invitation(text) is
  'Annule une invitation d''une carte du compte connecté ; « cancelled » ou « not-found ».';

-- ---------------------------------------------------------------------------------------------
-- Liens d'invitation.
-- ---------------------------------------------------------------------------------------------

-- Crée un lien d'invitation à la carte `p_map` (du compte connecté) : rôle `p_role`, au plus
-- `p_max_uses` usages (1 à 50), valable `p_hours` heures (1 à 720). Réponses : « created » et le
-- JETON, montré une seule fois (seule son empreinte est gardée) ; « not-found » (carte inconnue ou
-- d'un autre compte : même réponse) ; « links-full » (10 liens actifs par carte ; les liens échus ou
-- épuisés sont d'abord supprimés). 100 partages par jour, comptés avant de chercher la carte : les
-- refus sont des réponses et non des erreurs, pour que le compteur ne soit pas annulé avec elles.
-- Erreurs : sharing_not_authenticated (42501), sharing_no_profile, sharing_invalid,
-- sharing_rate_limited (P0001).
create function public.create_map_link(p_map text, p_role text, p_max_uses integer, p_hours integer)
returns table (status text, token text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_map uuid := public.map_sharing_uuid(p_map);
  v_role text;
  v_token text;
begin
  perform public.map_sharing_require_profile(v_uid);
  v_role := public.map_sharing_check_role(p_role);
  if p_max_uses is null or p_max_uses not between 1 and 50 or p_hours is null or p_hours not between 1 and 720 then
    raise exception 'sharing_invalid' using errcode = 'P0001';
  end if;
  if v_map is null then
    return query select 'not-found'::text, null::text;
    return;
  end if;
  perform public.map_sharing_take(v_uid, 'map_share', 100, interval '1 day');
  if public.map_sharing_role(v_map, v_uid) is distinct from 'owner' then
    return query select 'not-found'::text, null::text;
    return;
  end if;
  if not public.map_sharing_keep_profile(v_uid) then
    return query select 'not-found'::text, null::text;
    return;
  end if;
  perform public.map_sharing_lock_map(v_map);
  delete from public.map_links as k where k.map_id = v_map and (k.expires_at <= now() or k.uses >= k.max_uses);
  if (select count(*) from public.map_links as k where k.map_id = v_map) >= 10 then
    return query select 'links-full'::text, null::text;
    return;
  end if;
  -- Deux uuid v4 tirés par le générateur aléatoire fort de PostgreSQL : 244 bits.
  v_token := pg_catalog.replace(pg_catalog.gen_random_uuid()::text || pg_catalog.gen_random_uuid()::text, '-', '');
  insert into public.map_links (map_id, token_hash, role, max_uses, expires_at)
  values (v_map, public.map_sharing_token_hash(v_token), v_role, p_max_uses, now() + pg_catalog.make_interval(hours => p_hours));
  return query select 'created'::text, v_token;
end;
$$;

comment on function public.create_map_link(text, text, integer, integer) is
  'Crée un lien d''invitation à une carte du compte connecté : « created » et son jeton (montré une fois, seule son empreinte est gardée), « not-found » ou « links-full ».';

-- Révoque (supprime) le lien `p_link` d'une carte du compte connecté. Réponses : « revoked »,
-- « not-found ». Erreurs : sharing_not_authenticated (42501), sharing_rate_limited (P0001).
create function public.revoke_map_link(p_link text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ref uuid := public.map_sharing_uuid(p_link);
begin
  if v_uid is null then
    raise exception 'sharing_not_authenticated' using errcode = '42501';
  end if;
  if v_ref is null then
    return 'not-found';
  end if;
  perform public.map_sharing_take(v_uid, 'map_change', 300, interval '1 day');
  delete from public.map_links as k
  using public.maps as m
  where k.id = v_ref and m.id = k.map_id and m.user_id = v_uid;
  return case when found then 'revoked' else 'not-found' end;
end;
$$;

comment on function public.revoke_map_link(text) is
  'Révoque un lien d''invitation d''une carte du compte connecté ; « revoked » ou « not-found ».';

-- Lien encore utilisable de jeton `p_token`, pour `p_viewer` : null pour un jeton mal formé, inconnu,
-- échu, épuisé, d'une carte dont le propriétaire et `p_viewer` sont séparés par un blocage, ou déjà
-- utilisé par `p_viewer` s'il n'est plus membre de la carte (retiré, ou parti).
create function public.map_sharing_usable_link(p_token text, p_viewer uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select k.id
  from public.map_links as k
  join public.maps as m on m.id = k.map_id
  where k.token_hash = public.map_sharing_token_hash(p_token)
    and k.expires_at > now()
    and k.uses < k.max_uses
    and not public.contacts_blocked_either(m.user_id, p_viewer)
    and (
      not exists (select 1 from public.map_link_uses as u where u.link_id = k.id and u.user_id = p_viewer)
      or public.map_sharing_role(k.map_id, p_viewer) is not null
    )
$$;

-- Aperçu du lien de jeton `p_token`, avant de rejoindre la carte : nom de la carte, rôle proposé,
-- identifiant et nom affiché du propriétaire (null sans profil), échéance, et ce qu'est déjà le
-- compte pour cette carte (« owner », « editor », « reader » ou null). Aucune ligne pour un lien
-- inutilisable (même réponse dans tous les cas). Chaque essai est compté (60 par jour, partagés avec
-- l'acceptation) avant de chercher le jeton ; un jeton mal formé n'est pas compté (son refus ne dit
-- rien). Erreurs : sharing_not_authenticated (42501), sharing_rate_limited (P0001).
create function public.preview_map_link(p_token text)
returns table (map_name text, role text, owner_handle text, owner_display_name text, expires_at timestamptz, my_role text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_link uuid;
begin
  if v_uid is null then
    raise exception 'sharing_not_authenticated' using errcode = '42501';
  end if;
  if public.map_sharing_token_hash(p_token) is null then
    return;
  end if;
  perform public.map_sharing_take(v_uid, 'map_join', 60, interval '1 day');
  v_link := public.map_sharing_usable_link(p_token, v_uid);
  if v_link is null then
    return;
  end if;
  return query
    select m.name, k.role, p.handle, p.display_name, k.expires_at, public.map_sharing_role(m.id, v_uid)
    from public.map_links as k
    join public.maps as m on m.id = k.map_id
    left join public.profiles as p on p.user_id = m.user_id
    where k.id = v_link;
end;
$$;

comment on function public.preview_map_link(text) is
  'Aperçu d''un lien d''invitation (carte, rôle, propriétaire) pour le compte connecté ; aucune ligne pour un lien inutilisable.';

-- Rejoint la carte du lien de jeton `p_token`. Réponses : « joined » (un usage consommé),
-- « already-member » ou « owner » (rien n'est consommé, le rôle ne change pas), avec l'identifiant de
-- la carte ; « not-found » (lien inutilisable, ou déjà utilisé par ce compte qui n'est plus membre :
-- même réponse dans tous les cas, rien n'est consommé), « map-full »,
-- « memberships-full », sans carte. 60 essais par jour (partagés avec l'aperçu), comptés avant de
-- chercher le jeton. Erreurs : sharing_not_authenticated (42501), sharing_no_profile,
-- sharing_rate_limited (P0001).
create function public.accept_map_link(p_token text)
returns table (status text, map_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_link uuid;
  v_map uuid;
  v_owner uuid;
  v_role text;
  v_current text;
  v_status text;
begin
  perform public.map_sharing_require_profile(v_uid);
  if public.map_sharing_token_hash(p_token) is null then
    return query select 'not-found'::text, null::uuid;
    return;
  end if;
  perform public.map_sharing_take(v_uid, 'map_join', 60, interval '1 day');
  v_link := public.map_sharing_usable_link(p_token, v_uid);
  if v_link is null then
    return query select 'not-found'::text, null::uuid;
    return;
  end if;
  select k.map_id, m.user_id into v_map, v_owner
  from public.map_links as k
  join public.maps as m on m.id = k.map_id
  where k.id = v_link;
  if v_map is null then
    return query select 'not-found'::text, null::uuid;
    return;
  end if;
  -- Couple d'abord : un blocage simultané attend la fin de cette transaction, puis retire le membre ;
  -- s'il est passé avant, la relecture ci-dessous le voit (voir « Concurrence » en tête de fichier).
  perform public.contacts_lock_pair(v_owner, v_uid);
  if not public.map_sharing_keep_profile(v_owner) then
    return query select 'not-found'::text, null::uuid;
    return;
  end if;
  perform public.map_sharing_lock_map(v_map);
  perform public.map_sharing_lock_user(v_uid);
  -- Relu après les verrous (révoqué, épuisé, échu ou blocage entre-temps) et verrouillé jusqu'à la fin.
  select k.role into v_role
  from public.map_links as k
  where k.id = v_link and k.expires_at > now() and k.uses < k.max_uses
  for update;
  if v_role is null or public.map_sharing_usable_link(p_token, v_uid) is distinct from v_link then
    return query select 'not-found'::text, null::uuid;
    return;
  end if;
  v_current := public.map_sharing_role(v_map, v_uid);
  if v_current = 'owner' then
    return query select 'owner'::text, v_map;
    return;
  end if;
  v_status := public.map_sharing_join(
    v_map, v_uid, v_role,
    (select count(*) from public.map_invitations as i where i.map_id = v_map and i.invitee_id = v_uid and i.expires_at > now())
  );
  if v_status = 'joined' then
    update public.map_links as k set uses = k.uses + 1 where k.id = v_link;
    insert into public.map_link_uses (link_id, user_id) values (v_link, v_uid) on conflict do nothing;
  end if;
  return query select v_status, case when v_status in ('joined', 'already-member') then v_map end;
end;
$$;

comment on function public.accept_map_link(text) is
  'Rejoint la carte d''un lien d''invitation (un usage consommé) ; « joined », « already-member », « owner », « not-found », « map-full » ou « memberships-full ».';

-- ---------------------------------------------------------------------------------------------
-- Membres : rôle, retrait, départ.
-- ---------------------------------------------------------------------------------------------

-- Change le rôle du membre `p_member` (référence renvoyée par my_map_shares) d'une carte du compte
-- connecté. Passer lecteur retire son verrou d'édition. Réponses : « updated », « not-found ».
-- Erreurs : sharing_not_authenticated (42501), sharing_invalid, sharing_rate_limited (P0001).
create function public.set_map_member_role(p_member text, p_role text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ref uuid := public.map_sharing_uuid(p_member);
  v_role text;
begin
  if v_uid is null then
    raise exception 'sharing_not_authenticated' using errcode = '42501';
  end if;
  v_role := public.map_sharing_check_role(p_role);
  if v_ref is null then
    return 'not-found';
  end if;
  perform public.map_sharing_take(v_uid, 'map_change', 300, interval '1 day');
  update public.map_members as mm
  set role = v_role
  from public.maps as m
  where mm.id = v_ref and m.id = mm.map_id and m.user_id = v_uid;
  return case when found then 'updated' else 'not-found' end;
end;
$$;

comment on function public.set_map_member_role(text, text) is
  'Change le rôle d''un membre d''une carte du compte connecté ; « updated » ou « not-found ».';

-- Retire le membre `p_member` d'une carte du compte connecté (son verrou d'édition aussi). Réponses :
-- « removed », « not-found ». Erreurs : sharing_not_authenticated (42501), sharing_rate_limited (P0001).
create function public.remove_map_member(p_member text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ref uuid := public.map_sharing_uuid(p_member);
begin
  if v_uid is null then
    raise exception 'sharing_not_authenticated' using errcode = '42501';
  end if;
  if v_ref is null then
    return 'not-found';
  end if;
  perform public.map_sharing_take(v_uid, 'map_change', 300, interval '1 day');
  delete from public.map_members as mm
  using public.maps as m
  where mm.id = v_ref and m.id = mm.map_id and m.user_id = v_uid;
  return case when found then 'removed' else 'not-found' end;
end;
$$;

comment on function public.remove_map_member(text) is
  'Retire un membre d''une carte du compte connecté ; « removed » ou « not-found ».';

-- Quitte la carte partagée `p_map` (le compte connecté en est membre). Réponses : « left »,
-- « not-found ». Erreurs : sharing_not_authenticated (42501), sharing_rate_limited (P0001).
create function public.leave_shared_map(p_map text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_map uuid := public.map_sharing_uuid(p_map);
begin
  if v_uid is null then
    raise exception 'sharing_not_authenticated' using errcode = '42501';
  end if;
  if v_map is null then
    return 'not-found';
  end if;
  perform public.map_sharing_take(v_uid, 'map_change', 300, interval '1 day');
  delete from public.map_members as mm where mm.map_id = v_map and mm.user_id = v_uid;
  return case when found then 'left' else 'not-found' end;
end;
$$;

comment on function public.leave_shared_map(text) is
  'Le compte connecté quitte une carte partagée avec lui ; « left » ou « not-found ».';

-- ---------------------------------------------------------------------------------------------
-- Verrou d'édition.
-- ---------------------------------------------------------------------------------------------

-- Prend ou renouvelle le verrou d'édition de la carte `p_map` pour deux minutes. Réponses :
-- « acquired » (le compte le tient jusqu'à `expires_at`) ; « held » (un autre compte le tient :
-- `holder_name`, son nom affiché, null s'il n'a pas de profil ou si un blocage les sépare) ;
-- « read-only » (lecteur) ; « not-found » (carte inconnue ou compte qui n'en est pas membre). 600
-- appels par heure (prises, renouvellements et libérations). Erreurs : sharing_not_authenticated
-- (42501), sharing_rate_limited (P0001).
create function public.acquire_map_lock(p_map text)
returns table (status text, holder_name text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_map uuid := public.map_sharing_uuid(p_map);
  v_role text;
  v_expires timestamptz;
  v_holder uuid;
begin
  if v_uid is null then
    raise exception 'sharing_not_authenticated' using errcode = '42501';
  end if;
  if v_map is null then
    return query select 'not-found'::text, null::text, null::timestamptz;
    return;
  end if;
  perform public.map_sharing_take(v_uid, 'map_lock', 600, interval '1 hour');
  -- Verrous échus du compte sur d'autres cartes (sans effet) : effacés.
  delete from public.map_locks as l where l.holder_id = v_uid and l.expires_at <= now() and l.map_id <> v_map;
  v_role := public.map_sharing_role(v_map, v_uid);
  if v_role is null then
    return query select 'not-found'::text, null::text, null::timestamptz;
    return;
  end if;
  if v_role = 'reader' then
    return query select 'read-only'::text, null::text, null::timestamptz;
    return;
  end if;
  -- Atomique : un bail en cours d'un autre compte n'est jamais remplacé.
  v_expires := public.map_sharing_hold(v_map, v_uid);
  if v_expires is not null then
    return query select 'acquired'::text, null::text, v_expires;
    return;
  end if;
  select l.holder_id, l.expires_at into v_holder, v_expires from public.map_locks as l where l.map_id = v_map;
  return query select 'held'::text, public.map_sharing_name(v_holder, v_uid), v_expires;
end;
$$;

comment on function public.acquire_map_lock(text) is
  'Prend ou renouvelle (deux minutes) le verrou d''édition d''une carte ; « acquired », « held », « read-only » ou « not-found ».';

-- Libère le verrou d'édition de la carte `p_map` s'il est tenu par le compte connecté ; vrai s'il
-- l'était. Compté avec les prises de verrou. Erreurs : sharing_not_authenticated (42501),
-- sharing_rate_limited (P0001).
create function public.release_map_lock(p_map text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_map uuid := public.map_sharing_uuid(p_map);
begin
  if v_uid is null then
    raise exception 'sharing_not_authenticated' using errcode = '42501';
  end if;
  if v_map is null then
    return false;
  end if;
  perform public.map_sharing_take(v_uid, 'map_lock', 600, interval '1 hour');
  delete from public.map_locks as l where l.map_id = v_map and l.holder_id = v_uid;
  return found;
end;
$$;

comment on function public.release_map_lock(text) is
  'Libère le verrou d''édition d''une carte tenu par le compte connecté.';

-- ---------------------------------------------------------------------------------------------
-- Lectures.
-- ---------------------------------------------------------------------------------------------

-- Carte `p_map` complète pour son propriétaire ou un membre : nom, rôle du compte, version, date,
-- contenu, identifiant et nom affiché du propriétaire. Aucune ligne sinon. 600 lectures par heure.
-- Erreurs : sharing_not_authenticated (42501), sharing_rate_limited (P0001).
create function public.open_shared_map(p_map text)
returns table (
  id uuid, name text, role text, revision bigint, updated_at timestamptz, data jsonb,
  owner_handle text, owner_display_name text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_map uuid := public.map_sharing_uuid(p_map);
  v_role text;
begin
  if v_uid is null then
    raise exception 'sharing_not_authenticated' using errcode = '42501';
  end if;
  if v_map is null then
    return;
  end if;
  perform public.map_sharing_take(v_uid, 'map_read', 600, interval '1 hour');
  v_role := public.map_sharing_role(v_map, v_uid);
  if v_role is null then
    return;
  end if;
  return query
    select m.id, m.name, v_role, m.revision, m.updated_at, m.data, p.handle, public.map_sharing_name(m.user_id, v_uid)
    from public.maps as m
    left join public.profiles as p on p.user_id = m.user_id
    where m.id = v_map;
end;
$$;

comment on function public.open_shared_map(text) is
  'Carte complète pour son propriétaire ou un membre (rôle, version, contenu, propriétaire) ; 600 lectures par heure.';

-- État d'une carte pour le rafraîchissement périodique (propriétaire ou membre) : nom, rôle, version,
-- date, et verrou d'édition en cours (le compte le tient-il ; sinon nom affiché du titulaire, null
-- s'il n'a pas de profil ou si un blocage les sépare ; échéance). Aucune ligne sinon. Lecture seule,
-- mais comptée (1 200 appels par heure : un onglet ouvert en fait 240, toutes les 15 secondes).
-- Erreurs : sharing_not_authenticated (42501), sharing_rate_limited (P0001).
create function public.shared_map_state(p_map text)
returns table (
  name text, role text, revision bigint, updated_at timestamptz,
  lock_mine boolean, lock_held boolean, lock_holder_name text, lock_expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_map uuid := public.map_sharing_uuid(p_map);
  v_role text;
begin
  if v_uid is null then
    raise exception 'sharing_not_authenticated' using errcode = '42501';
  end if;
  if v_map is null then
    return;
  end if;
  perform public.map_sharing_take(v_uid, 'map_state', 1200, interval '1 hour');
  v_role := public.map_sharing_role(v_map, v_uid);
  if v_role is null then
    return;
  end if;
  return query
    select
      m.name,
      v_role,
      m.revision,
      m.updated_at,
      coalesce(l.holder_id = v_uid, false),
      l.holder_id is not null,
      case when l.holder_id <> v_uid then public.map_sharing_name(l.holder_id, v_uid) end,
      l.expires_at
    from public.maps as m
    left join public.map_locks as l on l.map_id = m.id and l.expires_at > now()
    where m.id = v_map;
end;
$$;

comment on function public.shared_map_state(text) is
  'Version, rôle et verrou d''édition d''une carte pour son propriétaire ou un membre ; lecture seule.';

-- Cartes partagées avec le compte connecté : identifiant, nom, rôle, date, statistiques, identifiant
-- et nom affiché du propriétaire, date d'entrée. 200 lignes au plus (limite des cartes partagées).
create function public.maps_shared_with_me()
returns table (
  id uuid, name text, role text, updated_at timestamptz, stats jsonb,
  owner_handle text, owner_display_name text, joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.name, mm.role, m.updated_at, m.stats, p.handle, public.map_sharing_name(m.user_id, (select auth.uid())), mm.created_at
  from public.map_members as mm
  join public.maps as m on m.id = mm.map_id
  left join public.profiles as p on p.user_id = m.user_id
  where mm.user_id = (select auth.uid())
  order by m.updated_at desc, m.id
  limit 200
$$;

comment on function public.maps_shared_with_me() is
  'Cartes partagées avec le compte connecté (rôle, propriétaire) ; lecture seule.';

-- Invitations en attente reçues par le compte connecté : référence, nom de la carte, rôle proposé,
-- identifiant et nom affiché du propriétaire, dates. Un couple bloqué, ou qui n'est plus contact,
-- n'y figure jamais. 100 lignes au plus (limite des invitations reçues).
create function public.my_map_invitations()
returns table (
  id uuid, map_name text, role text, owner_handle text, owner_display_name text,
  created_at timestamptz, expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, m.name, i.role, p.handle, p.display_name, i.created_at, i.expires_at
  from public.map_invitations as i
  join public.maps as m on m.id = i.map_id
  left join public.profiles as p on p.user_id = m.user_id
  where i.invitee_id = (select auth.uid())
    and i.expires_at > now()
    and not public.contacts_blocked_either(m.user_id, i.invitee_id)
    and public.contacts_linked(m.user_id, i.invitee_id)
  order by i.created_at desc, i.id
  limit 100
$$;

comment on function public.my_map_invitations() is
  'Invitations à des cartes reçues par le compte connecté ; lecture seule.';

-- Partages des cartes du compte connecté (toutes, ou la seule carte `p_map`) : pour chaque carte, ses
-- membres (« member » : référence, identifiant, nom affiché, rôle, date d'entrée), ses invitations
-- en attente (« invitation » : référence, identifiant et nom affiché du contact, rôle, dates ; jamais
-- celles d'un compte qui n'est plus contact, ou bloqué) et ses liens actifs (« link » : référence,
-- rôle, usages, dates ; jamais le jeton). Lecture seule.
create function public.my_map_shares(p_map text default null)
returns table (
  map_id uuid, kind text, id uuid, handle text, display_name text, role text,
  uses integer, max_uses integer, created_at timestamptz, expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with owned as (
    select m.id
    from public.maps as m
    where m.user_id = (select auth.uid())
      and (p_map is null or m.id = public.map_sharing_uuid(p_map))
  )
  select mm.map_id, 'member', mm.id, p.handle, p.display_name, mm.role, null::integer, null::integer, mm.created_at, null::timestamptz
  from public.map_members as mm
  join owned on owned.id = mm.map_id
  join public.profiles as p on p.user_id = mm.user_id
  union all
  select i.map_id, 'invitation', i.id, p.handle, p.display_name, i.role, null, null, i.created_at, i.expires_at
  from public.map_invitations as i
  join owned on owned.id = i.map_id
  join public.profiles as p on p.user_id = i.invitee_id
  where i.expires_at > now()
    and public.contacts_linked((select auth.uid()), i.invitee_id)
    and not public.contacts_blocked_either((select auth.uid()), i.invitee_id)
  union all
  select k.map_id, 'link', k.id, null, null, k.role, k.uses, k.max_uses, k.created_at, k.expires_at
  from public.map_links as k
  join owned on owned.id = k.map_id
  where k.expires_at > now() and k.uses < k.max_uses
  order by 1, 2, 9, 3
$$;

comment on function public.my_map_shares(text) is
  'Membres, invitations en attente et liens actifs des cartes du compte connecté ; lecture seule.';

-- Verrous d'édition tenus par le compte connecté (droit d'accès) : carte, échéance. Lecture seule.
create function public.my_map_locks()
returns table (map_id uuid, acquired_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.map_id, l.acquired_at, l.expires_at
  from public.map_locks as l
  where l.holder_id = (select auth.uid())
  order by l.map_id
$$;

comment on function public.my_map_locks() is
  'Verrous d''édition tenus par le compte connecté ; lecture seule.';

-- Liens d'invitation déjà utilisés par le compte connecté (droit d'accès) : carte, date. Un lien ne
-- sert qu'une fois à chaque compte. Lecture seule.
create function public.my_map_link_uses()
returns table (map_id uuid, used_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select k.map_id, u.used_at
  from public.map_link_uses as u
  join public.map_links as k on k.id = u.link_id
  where u.user_id = (select auth.uid())
  order by u.used_at, k.map_id
$$;

comment on function public.my_map_link_uses() is
  'Liens d''invitation déjà utilisés par le compte connecté (carte, date) ; lecture seule.';

-- ---------------------------------------------------------------------------------------------
-- Droits : les fonctions appelées par l'application sont réservées aux comptes connectés ; tout le
-- reste est interne (évalué avec les droits du propriétaire des fonctions SECURITY DEFINER).
-- ---------------------------------------------------------------------------------------------
revoke all on function public.invite_contact_to_map(text, text, text) from public, anon, authenticated;
grant execute on function public.invite_contact_to_map(text, text, text) to authenticated;
revoke all on function public.answer_map_invitation(text, boolean) from public, anon, authenticated;
grant execute on function public.answer_map_invitation(text, boolean) to authenticated;
revoke all on function public.cancel_map_invitation(text) from public, anon, authenticated;
grant execute on function public.cancel_map_invitation(text) to authenticated;
revoke all on function public.create_map_link(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.create_map_link(text, text, integer, integer) to authenticated;
revoke all on function public.revoke_map_link(text) from public, anon, authenticated;
grant execute on function public.revoke_map_link(text) to authenticated;
revoke all on function public.preview_map_link(text) from public, anon, authenticated;
grant execute on function public.preview_map_link(text) to authenticated;
revoke all on function public.accept_map_link(text) from public, anon, authenticated;
grant execute on function public.accept_map_link(text) to authenticated;
revoke all on function public.set_map_member_role(text, text) from public, anon, authenticated;
grant execute on function public.set_map_member_role(text, text) to authenticated;
revoke all on function public.remove_map_member(text) from public, anon, authenticated;
grant execute on function public.remove_map_member(text) to authenticated;
revoke all on function public.leave_shared_map(text) from public, anon, authenticated;
grant execute on function public.leave_shared_map(text) to authenticated;
revoke all on function public.acquire_map_lock(text) from public, anon, authenticated;
grant execute on function public.acquire_map_lock(text) to authenticated;
revoke all on function public.release_map_lock(text) from public, anon, authenticated;
grant execute on function public.release_map_lock(text) to authenticated;
revoke all on function public.open_shared_map(text) from public, anon, authenticated;
grant execute on function public.open_shared_map(text) to authenticated;
revoke all on function public.shared_map_state(text) from public, anon, authenticated;
grant execute on function public.shared_map_state(text) to authenticated;
revoke all on function public.maps_shared_with_me() from public, anon, authenticated;
grant execute on function public.maps_shared_with_me() to authenticated;
revoke all on function public.my_map_invitations() from public, anon, authenticated;
grant execute on function public.my_map_invitations() to authenticated;
revoke all on function public.my_map_shares(text) from public, anon, authenticated;
grant execute on function public.my_map_shares(text) to authenticated;
revoke all on function public.my_map_locks() from public, anon, authenticated;
grant execute on function public.my_map_locks() to authenticated;
revoke all on function public.my_map_link_uses() from public, anon, authenticated;
grant execute on function public.my_map_link_uses() to authenticated;

revoke all on function public.map_sharing_role(uuid, uuid) from public, anon, authenticated;
revoke all on function public.map_sharing_uuid(text) from public, anon, authenticated;
revoke all on function public.map_sharing_check_role(text) from public, anon, authenticated;
revoke all on function public.map_sharing_token_hash(text) from public, anon, authenticated;
revoke all on function public.map_sharing_lock_map(uuid) from public, anon, authenticated;
revoke all on function public.map_sharing_lock_user(uuid) from public, anon, authenticated;
revoke all on function public.map_sharing_keep_profile(uuid) from public, anon, authenticated;
revoke all on function public.map_sharing_take(uuid, text, integer, interval) from public, anon, authenticated;
revoke all on function public.map_sharing_require_profile(uuid) from public, anon, authenticated;
revoke all on function public.map_sharing_seats(uuid) from public, anon, authenticated;
revoke all on function public.map_sharing_name(uuid, uuid) from public, anon, authenticated;
revoke all on function public.map_sharing_holder(uuid) from public, anon, authenticated;
revoke all on function public.map_sharing_hold(uuid, uuid) from public, anon, authenticated;
revoke all on function public.map_sharing_join(uuid, uuid, text, bigint) from public, anon, authenticated;
revoke all on function public.map_sharing_usable_link(text, uuid) from public, anon, authenticated;
revoke all on function public.map_members_drop_lock() from public, anon, authenticated;
revoke all on function public.map_sharing_separate_pair() from public, anon, authenticated;
revoke all on function public.map_sharing_on_contact_delete() from public, anon, authenticated;
revoke all on function public.map_sharing_on_profile_delete() from public, anon, authenticated;
-- Le remplacement garde les droits de la fonction d'origine ; rappelés ici par sûreté.
revoke all on function public.update_map_data(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.update_map_data(uuid, text, bigint) to authenticated;
