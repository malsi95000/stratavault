-- Contacts entre membres (DIV-02, bêta 2.1, socle communautaire) : demandes de contact par
-- identifiant (envoyer, annuler, accepter, refuser), liste des contacts, retrait, blocage.
--
-- Tables (RLS activé SANS politique et aucun droit pour l'API : chaque ligne contient l'identifiant
-- de compte de l'autre membre, qui ne doit jamais sortir de la base). Tout passe par les fonctions
-- SECURITY DEFINER ci-dessous, qui vérifient auth.uid(), bornent leurs entrées en texte avant toute
-- conversion et ne renvoient que des champs publics (identifiant, nom affiché, avatar) et des
-- références opaques (uuid tirés au hasard) :
--   - public.contact_requests : demande en attente d'un membre (sender_id) à un autre (recipient_id).
--     Une seule par couple et par sens. Supprimée quand elle est acceptée, refusée ou annulée, et
--     avec le profil de l'un ou l'autre (on delete cascade sur public.profiles) ;
--   - public.contacts : une ligne par couple de contacts (user_low < user_high), supprimée quand l'un
--     des deux la retire ou bloque l'autre, et avec le profil de l'un ou l'autre ;
--   - public.contact_blocks : blocages (blocker_id bloque blocked_id). Rattachés aux COMPTES, pas aux
--     profils : supprimer puis recréer son profil (avec un autre identifiant) n'échappe pas à un
--     blocage. Supprimés avec le compte de l'un ou l'autre. blocked_handle garde l'identifiant du
--     membre bloqué AU MOMENT du blocage, tel que le bloqueur le voyait (null si ce profil lui était
--     masqué), jamais mis à jour (voir « Ce que chacun voit »).
--
-- Règle de visibilité des profils (public.profiles_visible_to, remplacée ici ; seule source de la
-- règle, appliquée par profile_by_handle, open_avatar_read et la lecture des avatars). Le profil de
-- O est visible pour V si V est connecté et :
--   - V est O ;
--   - ou aucun blocage n'existe entre O et V (dans un sens ou dans l'autre), et : le profil est
--     « members », OU O et V sont contacts, OU O a envoyé à V une demande de contact en attente
--     (envoyer une demande montre son profil au destinataire, pour qu'il sache qui la lui envoie).
-- Le blocage rend les deux profils invisibles l'un à l'autre, quel que soit l'identifiant : un compte
-- bloqué ne voit plus du tout le profil de celui qui l'a bloqué (ni « contacts », ni « members », ni
-- l'avatar), et celui qui bloque ne voit plus celui du bloqué. Pour chacun, la recherche par
-- identifiant, la demande de contact et le blocage par identifiant donnent la même réponse qu'un
-- identifiant inconnu. Rien ne dit au bloqué qu'il est bloqué ; et rien ne permet au bloqueur de
-- reconnaître le compte bloqué sous un nouvel identifiant ou dans un profil recréé (aucune réponse
-- ne distingue ce compte d'un identifiant inconnu, d'un profil masqué ou d'un membre qui l'a bloqué).
--
-- Anti-énumération : une demande ou un blocage par identifiant ne trouve que les profils VISIBLES
-- pour le compte qui la fait (même règle que profile_by_handle) ; un identifiant inconnu, un profil
-- masqué, un membre qui vous a bloqué et un membre que vous avez bloqué donnent la même réponse
-- « not-found ». Chaque essai est compté AVANT de chercher l'identifiant (réponse sans erreur, le
-- compteur reste écrit). Les autres réponses (« already-contacts », « already-sent »…) ne portent que
-- sur des profils déjà visibles, ou sur les propres relations du compte. Aucune liste des membres.
--
-- Ce que chacun voit de l'autre dans ses listes (jamais plus que ce que la règle de visibilité lui
-- montre déjà, pour qu'aucun membre ne puisse en suivre un autre qui se masque ou change
-- d'identifiant) :
--   - contacts : identifiant actuel, nom affiché et avatar (un contact voit le profil de l'autre) ;
--   - demandes en cours : identifiant actuel, nom affiché et avatar si le profil lui est visible,
--     sinon rien (« profil masqué ») ; la référence suffit pour annuler, refuser ou bloquer ;
--   - comptes bloqués : l'identifiant du membre AU MOMENT du blocage, s'il était alors visible pour
--     le bloqueur (sinon rien : blocage depuis une demande envoyée à un profil masqué depuis), et rien
--     d'autre (ni nom affiché, ni avatar : le profil du bloqué lui est invisible). Un membre bloqué
--     qui se masque, change d'identifiant ou recrée son profil n'est donc pas suivi : le bloqueur ne
--     voit pas sa nouvelle identité.
-- Un couple pour lequel existe un blocage (dans un sens ou dans l'autre) n'apparaît jamais dans les
-- contacts ni dans les demandes, même si une ligne subsistait.
--
-- Concurrence : l'envoi et l'acceptation prennent d'abord un verrou consultatif propre à CHACUN des
-- deux comptes (public.contacts_lock_accounts, dans un ordre fixe : aucun interblocage), puis
-- verrouillent le profil du compte, puis prennent le verrou propre au couple
-- (public.contacts_lock_pair), que prend aussi le blocage ; les blocages et les limites sont
-- vérifiés après. Les demandes reçues et les contacts d'un compte ne s'ajoutent donc que sous son
-- verrou : des membres différents qui écrivent en même temps au même compte (envoi ou acceptation)
-- passent l'un après l'autre et ne dépassent ni ses 200 demandes reçues ni ses 1 000 contacts. Un
-- blocage et une acceptation (ou un envoi) simultanés s'exécutent l'un après l'autre, et le second
-- voit ce qu'a écrit le premier. Le profil du compte est verrouillé en « for no key update » :
-- compatible avec le « for key share » que prennent les clés étrangères sur le profil de l'autre
-- membre (avec « for update », deux membres qui s'ajoutent en même temps pouvaient s'interbloquer).
-- Aucune de ces fonctions n'attend un verrou consultatif en tenant un verrou de ligne.
--
-- Limites anti-abus (public.rate_limits, par compte) : 30 demandes de contact par jour (comptées
-- qu'elles aboutissent ou non), 50 demandes envoyées en attente au plus, 200 demandes reçues en
-- attente au plus (au-delà : « unavailable »), 1 000 contacts au plus, 50 blocages par jour,
-- 1 000 comptes bloqués au plus, 300 autres opérations par jour (accepter, refuser, annuler,
-- retirer, débloquer). Mêmes valeurs que src/features/contacts/limits.ts, vérifiées par les tests.
--
-- Droit d'accès : chaque compte relit ses contacts, ses demandes et ses blocages par my_contacts(),
-- my_contact_requests() et my_blocked_members() (« Télécharger mes données »). Les blocages dont le
-- compte FAIT L'OBJET ne lui sont jamais communiqués (article 15, paragraphe 4 du RGPD : droits et
-- sécurité du membre qui bloque) ; voir docs/legal.md.
--
-- Compatible avec l'application déjà en production (v2.0) et avec l'étape 1 et les profils de la
-- bêta 2.1 : nouvelles tables et nouvelles fonctions ; seules changent la liste fermée des actions de
-- public.rate_limits (trois actions ajoutées : les lignes existantes restent valides) et la règle
-- public.profiles_visible_to (fonction interne, mêmes paramètres ; elle ne fait qu'ajouter les
-- contacts et les demandes, et retirer les couples bloqués, qui n'existent pas encore).
-- À appliquer après 20261017120300_delete_my_account_avatars.sql (dernier fichier des profils et des
-- avatars).

-- Compteurs : actions des contacts ajoutées à la liste fermée.
alter table public.rate_limits drop constraint rate_limits_action;
alter table public.rate_limits add constraint rate_limits_action check (
  action in (
    'profile_create', 'profile_handle', 'profile_change', 'handle_attempt', 'profile_lookup', 'avatar_upload', 'avatar_change', 'avatar_read',
    'contact_request', 'contact_block', 'contact_change'
  )
);

create table public.contact_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  sender_id uuid not null references public.profiles (user_id) on delete cascade,
  recipient_id uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint contact_requests_pair_key unique (sender_id, recipient_id),
  constraint contact_requests_not_self check (sender_id <> recipient_id)
);

create index contact_requests_recipient on public.contact_requests (recipient_id);

comment on table public.contact_requests is
  'Demandes de contact en attente (expéditeur, destinataire) ; aucun accès par l''API.';

create table public.contacts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_low uuid not null references public.profiles (user_id) on delete cascade,
  user_high uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint contacts_pair_key unique (user_low, user_high),
  constraint contacts_ordered check (user_low < user_high)
);

create index contacts_user_high on public.contacts (user_high);

comment on table public.contacts is
  'Couples de contacts (une ligne par couple, user_low < user_high) ; aucun accès par l''API.';

create table public.contact_blocks (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  -- Identifiant du membre bloqué au moment du blocage, s'il était visible pour le bloqueur (sinon
  -- null) ; jamais mis à jour.
  blocked_handle text,
  created_at timestamptz not null default now(),
  constraint contact_blocks_pair_key unique (blocker_id, blocked_id),
  constraint contact_blocks_not_self check (blocker_id <> blocked_id),
  constraint contact_blocks_handle_format check (blocked_handle is null or blocked_handle ~ '^[a-z0-9_]{3,30}$')
);

create index contact_blocks_blocked on public.contact_blocks (blocked_id);

comment on table public.contact_blocks is
  'Blocages entre comptes (qui bloque, qui est bloqué, identifiant du bloqué au moment du blocage) ; aucun accès par l''API.';

alter table public.contact_requests enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_blocks enable row level security;
revoke all on table public.contact_requests from public, anon, authenticated;
revoke all on table public.contacts from public, anon, authenticated;
revoke all on table public.contact_blocks from public, anon, authenticated;

-- Vrai si `p_a` et `p_b` sont contacts. Interne (appelée par les fonctions SECURITY DEFINER).
create function public.contacts_linked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.contacts as c
    where c.user_low = least(p_a, p_b)
      and c.user_high = greatest(p_a, p_b)
  )
$$;

-- Vrai si `p_blocker` a bloqué `p_blocked`. Interne.
create function public.contacts_blocked(p_blocker uuid, p_blocked uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.contact_blocks as b
    where b.blocker_id = p_blocker
      and b.blocked_id = p_blocked
  )
$$;

-- Nombre de contacts de `p_user`. Interne.
create function public.contacts_count(p_user uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)
  from public.contacts as c
  where c.user_low = p_user or c.user_high = p_user
$$;

-- Vrai s'il existe un blocage entre `p_a` et `p_b`, dans un sens ou dans l'autre. Interne.
create function public.contacts_blocked_either(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.contacts_blocked(p_a, p_b) or public.contacts_blocked(p_b, p_a)
$$;

-- Verrou consultatif du couple (`p_a`, `p_b`), le même quel que soit le sens, levé à la fin de la
-- transaction. Pris par l'envoi, l'acceptation et le blocage AVANT leurs dernières vérifications :
-- deux de ces opérations sur un même couple ne se croisent jamais. Interne.
create function public.contacts_lock_pair(p_a uuid, p_b uuid)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public.contacts:' || least(p_a, p_b)::text || ':' || greatest(p_a, p_b)::text, 0)
  )
$$;

-- Verrous consultatifs des comptes `p_a` et `p_b` (un par compte, le même quel que soit l'appel), pris
-- par clé croissante et levés à la fin de la transaction. Pris par l'envoi et l'acceptation AVANT
-- tout autre verrou et avant de compter : les demandes reçues et les contacts d'un compte ne
-- s'ajoutent que sous son verrou, ses limites ne sont donc jamais dépassées par des appels simultanés
-- d'autres membres. Interne.
create function public.contacts_lock_accounts(p_a uuid, p_b uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_a bigint := pg_catalog.hashtextextended('public.contacts.account:' || p_a::text, 0);
  v_b bigint := pg_catalog.hashtextextended('public.contacts.account:' || p_b::text, 0);
begin
  perform pg_catalog.pg_advisory_xact_lock(least(v_a, v_b));
  if v_a <> v_b then
    perform pg_catalog.pg_advisory_xact_lock(greatest(v_a, v_b));
  end if;
end;
$$;

-- Règle de visibilité d'un profil pour le compte `p_viewer` : voir l'en-tête. Remplace la version
-- de 20261017120100_profiles.sql (mêmes paramètres et mêmes droits : interne, appelée par les
-- fonctions SECURITY DEFINER avec les droits de leur propriétaire).
create or replace function public.profiles_visible_to(p_owner uuid, p_visibility text, p_viewer uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_viewer is not null
    and p_owner is not null
    and (
      p_owner = p_viewer
      or (
        not public.contacts_blocked_either(p_owner, p_viewer)
        and (
          p_visibility = 'members'
          or public.contacts_linked(p_owner, p_viewer)
          or exists (
            select 1
            from public.contact_requests as r
            where r.sender_id = p_owner
              and r.recipient_id = p_viewer
          )
        )
      )
    )
$$;

-- Référence opaque d'une demande, d'un contact ou d'un blocage : un uuid en minuscules, rien
-- d'autre. Longueur vérifiée avant l'expression régulière. Fonction pure, interne.
create function public.contacts_ref_ok(p_ref text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_ref is not null
    and octet_length(p_ref) = 36
    and p_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

-- Compte d'un profil VISIBLE pour `p_viewer`, désigné par son identifiant exact (casse et espaces
-- autour ignorés) ; null pour un identifiant mal formé, inconnu ou un profil masqué (même réponse).
-- Entrée bornée en texte avant toute transformation. Interne : ne compte rien (l'appelant compte
-- l'essai avant de l'appeler).
create function public.contacts_visible_target(p_handle text, p_viewer uuid)
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_handle text;
  v_target uuid;
begin
  if p_handle is null or octet_length(p_handle) > 60 then
    return null;
  end if;
  v_handle := pg_catalog.lower(pg_catalog.btrim(p_handle));
  if not public.profiles_handle_format_ok(v_handle) then
    return null;
  end if;
  select p.user_id into v_target
  from public.profiles as p
  where p.handle = v_handle
    and public.profiles_visible_to(p.user_id, p.visibility, p_viewer);
  return v_target;
end;
$$;

-- Envoie une demande de contact au membre d'identifiant `p_handle`. Profil requis (le destinataire
-- voit qui la lui envoie). Réponses (sans erreur : l'essai reste compté) :
--   « sent » ; « not-found » (identifiant mal formé, inconnu, profil masqué, membre qui vous a
--   bloqué ou que vous avez bloqué : même réponse) ; « self » ; « already-contacts » ;
--   « already-sent » ; « incoming-pending » (il vous a déjà envoyé une demande : acceptez-la) ;
--   « outgoing-full » (50 demandes envoyées en attente) ; « contacts-full » (1 000 contacts) ;
--   « unavailable » (il a 200 demandes reçues en attente ou 1 000 contacts).
-- 30 essais par jour, comptés avant de chercher l'identifiant (un identifiant mal formé n'est pas
-- compté : son refus ne dit rien). Une fois le membre trouvé, les deux comptes sont verrouillés
-- (contacts_lock_accounts), puis le profil de l'expéditeur (for no key update, voir l'en-tête), puis
-- le couple (contacts_lock_pair) ; le blocage et les limites sont vérifiés après : ni des demandes
-- simultanées du même compte, ni celles de membres différents vers un même destinataire ne
-- dépassent les limites, et un blocage simultané l'emporte. Erreurs :
-- contacts_not_authenticated (42501), contacts_no_profile, contacts_rate_limited (P0001).
create function public.send_contact_request(p_handle text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
begin
  if v_uid is null then
    raise exception 'contacts_not_authenticated' using errcode = '42501';
  end if;
  perform 1 from public.profiles as p where p.user_id = v_uid;
  if not found then
    raise exception 'contacts_no_profile' using errcode = 'P0001';
  end if;
  if p_handle is null or octet_length(p_handle) > 60
    or not public.profiles_handle_format_ok(pg_catalog.lower(pg_catalog.btrim(p_handle))) then
    return 'not-found';
  end if;
  -- Essai compté AVANT de savoir si l'identifiant existe.
  if not public.rate_limit_take(v_uid, 'contact_request', 30, interval '1 day') then
    raise exception 'contacts_rate_limited' using errcode = 'P0001';
  end if;
  v_target := public.contacts_visible_target(p_handle, v_uid);
  if v_target is null then
    return 'not-found';
  end if;
  if v_target = v_uid then
    return 'self';
  end if;
  perform public.contacts_lock_accounts(v_uid, v_target);
  perform 1 from public.profiles as p where p.user_id = v_uid for no key update;
  if not found then
    -- Profil supprimé entre-temps (autre onglet) : l'essai reste compté, aucune erreur.
    return 'not-found';
  end if;
  perform public.contacts_lock_pair(v_uid, v_target);
  -- Revérifié après le verrou : un blocage validé entre-temps (dans un sens ou dans l'autre) donne
  -- la même réponse qu'avant.
  if public.contacts_blocked_either(v_uid, v_target) then
    return 'not-found';
  end if;
  if public.contacts_linked(v_uid, v_target) then
    return 'already-contacts';
  end if;
  if exists (select 1 from public.contact_requests as r where r.sender_id = v_uid and r.recipient_id = v_target) then
    return 'already-sent';
  end if;
  if exists (select 1 from public.contact_requests as r where r.sender_id = v_target and r.recipient_id = v_uid) then
    return 'incoming-pending';
  end if;
  if (select count(*) from public.contact_requests as r where r.sender_id = v_uid) >= 50 then
    return 'outgoing-full';
  end if;
  if public.contacts_count(v_uid) >= 1000 then
    return 'contacts-full';
  end if;
  if (select count(*) from public.contact_requests as r where r.recipient_id = v_target) >= 200
    or public.contacts_count(v_target) >= 1000 then
    return 'unavailable';
  end if;
  insert into public.contact_requests (sender_id, recipient_id)
  values (v_uid, v_target)
  on conflict on constraint contact_requests_pair_key do nothing;
  return 'sent';
end;
$$;

comment on function public.send_contact_request(text) is
  'Envoie une demande de contact au membre d''identifiant exact donné, s''il est visible pour le compte connecté (30 essais par jour).';

-- Compte une opération sur ses propres relations (accepter, refuser, annuler, retirer, débloquer) :
-- 300 par jour. Interne.
create function public.contacts_take_change(p_user uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if not public.rate_limit_take(p_user, 'contact_change', 300, interval '1 day') then
    raise exception 'contacts_rate_limited' using errcode = 'P0001';
  end if;
end;
$$;

-- Accepte la demande reçue `p_request` : le couple devient contacts et les demandes entre eux (dans
-- les deux sens) sont supprimées. Réponses : « accepted » ; « not-found » (référence mal formée,
-- inconnue ou demande qui n'est pas adressée au compte : même réponse) ; « contacts-full » (l'un
-- des deux a 1 000 contacts). Erreurs : contacts_not_authenticated (42501), contacts_rate_limited (P0001).
create function public.accept_contact_request(p_request text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_sender uuid;
begin
  if v_uid is null then
    raise exception 'contacts_not_authenticated' using errcode = '42501';
  end if;
  if not public.contacts_ref_ok(p_request) then
    return 'not-found';
  end if;
  perform public.contacts_take_change(v_uid);
  select r.sender_id into v_sender
  from public.contact_requests as r
  where r.id = p_request::uuid
    and r.recipient_id = v_uid;
  if v_sender is null then
    return 'not-found';
  end if;
  -- Les deux comptes verrouillés : des acceptations simultanées (de ce compte, ou d'autres membres
  -- qui acceptent une demande de l'expéditeur) ne dépassent pas les 1 000 contacts de l'un ou de
  -- l'autre. Puis le profil du compte (for no key update : voir l'en-tête), puis le couple (comme
  -- pour un blocage), et la demande relue : un blocage validé entre-temps l'a supprimée.
  perform public.contacts_lock_accounts(v_uid, v_sender);
  perform 1 from public.profiles as p where p.user_id = v_uid for no key update;
  perform public.contacts_lock_pair(v_uid, v_sender);
  perform 1
  from public.contact_requests as r
  where r.id = p_request::uuid
    and r.recipient_id = v_uid
    and r.sender_id = v_sender
  for update;
  if not found then
    return 'not-found';
  end if;
  -- Défense en profondeur : un blocage supprime déjà les demandes entre les deux comptes.
  if public.contacts_blocked_either(v_uid, v_sender) then
    delete from public.contact_requests as r where r.id = p_request::uuid;
    return 'not-found';
  end if;
  if public.contacts_count(v_uid) >= 1000 or public.contacts_count(v_sender) >= 1000 then
    return 'contacts-full';
  end if;
  insert into public.contacts (user_low, user_high)
  values (least(v_uid, v_sender), greatest(v_uid, v_sender))
  on conflict on constraint contacts_pair_key do nothing;
  delete from public.contact_requests as r
  where (r.sender_id = v_sender and r.recipient_id = v_uid)
    or (r.sender_id = v_uid and r.recipient_id = v_sender);
  return 'accepted';
end;
$$;

comment on function public.accept_contact_request(text) is
  'Accepte une demande de contact reçue par le compte connecté ; « accepted », « not-found » ou « contacts-full ».';

-- Refuse la demande reçue `p_request` (elle est supprimée ; l'expéditeur n'en est pas averti, mais
-- ne la voit plus en attente). Réponses : « refused », « not-found ». Erreurs :
-- contacts_not_authenticated (42501), contacts_rate_limited (P0001).
create function public.refuse_contact_request(p_request text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'contacts_not_authenticated' using errcode = '42501';
  end if;
  if not public.contacts_ref_ok(p_request) then
    return 'not-found';
  end if;
  perform public.contacts_take_change(v_uid);
  delete from public.contact_requests as r
  where r.id = p_request::uuid
    and r.recipient_id = v_uid;
  return case when found then 'refused' else 'not-found' end;
end;
$$;

comment on function public.refuse_contact_request(text) is
  'Refuse (supprime) une demande de contact reçue par le compte connecté ; « refused » ou « not-found ».';

-- Annule la demande envoyée `p_request`. Réponses : « cancelled », « not-found ». Erreurs :
-- contacts_not_authenticated (42501), contacts_rate_limited (P0001).
create function public.cancel_contact_request(p_request text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'contacts_not_authenticated' using errcode = '42501';
  end if;
  if not public.contacts_ref_ok(p_request) then
    return 'not-found';
  end if;
  perform public.contacts_take_change(v_uid);
  delete from public.contact_requests as r
  where r.id = p_request::uuid
    and r.sender_id = v_uid;
  return case when found then 'cancelled' else 'not-found' end;
end;
$$;

comment on function public.cancel_contact_request(text) is
  'Annule une demande de contact envoyée par le compte connecté ; « cancelled » ou « not-found ».';

-- Retire le contact `p_contact` (pour les deux membres). Réponses : « removed », « not-found ».
-- Erreurs : contacts_not_authenticated (42501), contacts_rate_limited (P0001).
create function public.remove_contact(p_contact text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'contacts_not_authenticated' using errcode = '42501';
  end if;
  if not public.contacts_ref_ok(p_contact) then
    return 'not-found';
  end if;
  perform public.contacts_take_change(v_uid);
  delete from public.contacts as c
  where c.id = p_contact::uuid
    and (c.user_low = v_uid or c.user_high = v_uid);
  return case when found then 'removed' else 'not-found' end;
end;
$$;

comment on function public.remove_contact(text) is
  'Retire un contact du compte connecté (pour les deux membres) ; « removed » ou « not-found ».';

-- Bloque `p_target` pour `p_uid` (le membre a été trouvé et l'essai compté par l'appelant) : verrou du
-- couple, blocage, contact et demandes supprimés dans les deux sens. L'identifiant du bloqué est gardé
-- s'il est visible pour le compte, ou si l'appelant l'a montré au compte (`p_handle_shown` : auteur
-- d'un élément de la carte collective, signé de son identifiant quelle que soit la visibilité de son
-- profil). Réponses : « blocked », « already-blocked », « blocks-full », « not-found » (plus de
-- profil). Fonction interne (EXECUTE retiré à tous).
create function public.contacts_block(p_uid uuid, p_target uuid, p_handle_shown boolean)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_handle text;
  v_visible boolean;
begin
  perform public.contacts_lock_pair(p_uid, p_target);
  -- Ne porte que sur les propres relations du compte (le profil d'un membre déjà bloqué lui est
  -- invisible) : une demande ou un contact qui subsisterait à côté du blocage, ou un blocage validé
  -- entre-temps depuis un autre onglet.
  if public.contacts_blocked(p_uid, p_target) then
    return 'already-blocked';
  end if;
  if (select count(*) from public.contact_blocks as b where b.blocker_id = p_uid) >= 1000 then
    return 'blocks-full';
  end if;
  -- Le membre a un profil (il vient d'être trouvé par lui) ; supprimé entre-temps : introuvable.
  -- Visibilité lue AVANT de supprimer les demandes (une demande reçue rend l'expéditeur visible) :
  -- l'identifiant n'est gardé que si le compte le voit déjà.
  select p.handle, public.profiles_visible_to(p.user_id, p.visibility, p_uid)
    into v_handle, v_visible
  from public.profiles as p
  where p.user_id = p_target;
  if not found then
    return 'not-found';
  end if;
  if not (v_visible or p_handle_shown) then
    v_handle := null;
  end if;
  insert into public.contact_blocks (blocker_id, blocked_id, blocked_handle)
  values (p_uid, p_target, v_handle)
  on conflict on constraint contact_blocks_pair_key do nothing;
  delete from public.contacts as c
  where c.user_low = least(p_uid, p_target)
    and c.user_high = greatest(p_uid, p_target);
  delete from public.contact_requests as r
  where (r.sender_id = p_uid and r.recipient_id = p_target)
    or (r.sender_id = p_target and r.recipient_id = p_uid);
  return 'blocked';
end;
$$;

-- Bloque un membre, désigné par :
--   - `p_kind` = « handle » : son identifiant exact (`p_value`), s'il est visible pour le compte
--     (même règle et même réponse « not-found » que les demandes : un membre déjà bloqué, invisible
--     pour le bloqueur, donne « not-found » sous n'importe quel identifiant) ;
--   - « request » : une demande en cours entre les deux (reçue ou envoyée), par sa référence ;
--   - « contact » : un contact, par sa référence.
-- Le blocage retire le contact et supprime les demandes entre les deux comptes, dans les deux sens.
-- Le membre bloqué n'en est pas averti ; il ne voit plus le profil du compte (ni son avatar) et ne
-- peut plus lui envoyer de demande ; le compte ne voit plus le sien non plus. Réponses :
-- « blocked », « already-blocked », « not-found », « self », « blocks-full » (1 000 comptes bloqués). 50 blocages par jour, comptés avant de chercher
-- le membre (l'auteur d'un élément de la carte collective se bloque aussi depuis cet élément :
-- block_collective_author, 20261020120000_collective_map.sql, même limite et même blocage). Pas de profil requis. Le couple est verrouillé avant d'écrire (contacts_lock_pair).
-- L'identifiant du membre à cet instant est gardé avec le blocage (blocked_handle) seulement si son
-- profil est visible pour le compte (sinon null : bloquer depuis une demande envoyée à un profil
-- masqué depuis ne révèle pas son identifiant actuel). Erreurs :
-- contacts_not_authenticated (42501), contacts_invalid, contacts_rate_limited (P0001).
create function public.block_member(p_kind text, p_value text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
begin
  if v_uid is null then
    raise exception 'contacts_not_authenticated' using errcode = '42501';
  end if;
  if p_kind is null or octet_length(p_kind) > 16 or p_kind not in ('handle', 'request', 'contact') then
    raise exception 'contacts_invalid' using errcode = 'P0001';
  end if;
  if p_value is null or octet_length(p_value) > 60 then
    return 'not-found';
  end if;
  if p_kind = 'handle' then
    if not public.profiles_handle_format_ok(pg_catalog.lower(pg_catalog.btrim(p_value))) then
      return 'not-found';
    end if;
  elsif not public.contacts_ref_ok(p_value) then
    return 'not-found';
  end if;
  if not public.rate_limit_take(v_uid, 'contact_block', 50, interval '1 day') then
    raise exception 'contacts_rate_limited' using errcode = 'P0001';
  end if;
  if p_kind = 'handle' then
    v_target := public.contacts_visible_target(p_value, v_uid);
  elsif p_kind = 'request' then
    select case when r.sender_id = v_uid then r.recipient_id else r.sender_id end into v_target
    from public.contact_requests as r
    where r.id = p_value::uuid
      and (r.sender_id = v_uid or r.recipient_id = v_uid);
  else
    select case when c.user_low = v_uid then c.user_high else c.user_low end into v_target
    from public.contacts as c
    where c.id = p_value::uuid
      and (c.user_low = v_uid or c.user_high = v_uid);
  end if;
  if v_target is null then
    return 'not-found';
  end if;
  if v_target = v_uid then
    return 'self';
  end if;
  return public.contacts_block(v_uid, v_target, false);
end;
$$;

comment on function public.block_member(text, text) is
  'Bloque un membre (par identifiant visible, demande ou contact) : contact retiré, demandes supprimées, profils invisibles l''un à l''autre ; « blocked », « already-blocked », « not-found », « self » ou « blocks-full ».';

-- Lève le blocage `p_block` du compte connecté. Le contact et les demandes supprimés au blocage ne
-- reviennent pas. Réponses : « unblocked », « not-found ». Erreurs : contacts_not_authenticated
-- (42501), contacts_rate_limited (P0001).
create function public.unblock_member(p_block text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'contacts_not_authenticated' using errcode = '42501';
  end if;
  if not public.contacts_ref_ok(p_block) then
    return 'not-found';
  end if;
  perform public.contacts_take_change(v_uid);
  delete from public.contact_blocks as b
  where b.id = p_block::uuid
    and b.blocker_id = v_uid;
  return case when found then 'unblocked' else 'not-found' end;
end;
$$;

comment on function public.unblock_member(text) is
  'Lève un blocage du compte connecté ; « unblocked » ou « not-found ».';

-- Contacts du compte connecté : référence du contact, identifiant, nom affiché et avatar de l'autre
-- membre (un contact voit toujours le profil de l'autre), date. Jamais d'identifiant de compte. Un
-- couple bloqué (dans un sens ou dans l'autre) n'y figure jamais. Lecture seule ; 1 000 lignes au
-- plus (limite des contacts).
create function public.my_contacts()
returns table (id uuid, handle text, display_name text, avatar_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, p.handle, p.display_name, p.avatar_id, c.created_at
  from public.contacts as c
  join public.profiles as p
    on p.user_id = case when c.user_low = (select auth.uid()) then c.user_high else c.user_low end
  where (select auth.uid()) in (c.user_low, c.user_high)
    and not public.contacts_blocked_either(c.user_low, c.user_high)
  order by p.handle
  limit 1000
$$;

comment on function public.my_contacts() is
  'Contacts du compte connecté (référence, identifiant, nom affiché, avatar, date) ; lecture seule.';

-- Demandes en cours du compte connecté, reçues (« incoming ») et envoyées (« outgoing ») : référence,
-- et l'identifiant actuel, le nom affiché et l'avatar de l'autre membre s'il lui est visible
-- (toujours pour une demande reçue ; pour une demande envoyée, null si le destinataire a depuis
-- masqué son profil : l'expéditeur ne suit pas ses changements d'identifiant), date. Jamais
-- d'identifiant de compte. Un couple bloqué n'y figure jamais. Lecture seule ; 250 lignes au plus
-- (limites des demandes reçues et envoyées).
create function public.my_contact_requests()
returns table (id uuid, direction text, handle text, display_name text, avatar_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    case when r.recipient_id = (select auth.uid()) then 'incoming' else 'outgoing' end,
    case when public.profiles_visible_to(p.user_id, p.visibility, (select auth.uid())) then p.handle end,
    case when public.profiles_visible_to(p.user_id, p.visibility, (select auth.uid())) then p.display_name end,
    case when public.profiles_visible_to(p.user_id, p.visibility, (select auth.uid())) then p.avatar_id end,
    r.created_at
  from public.contact_requests as r
  join public.profiles as p
    on p.user_id = case when r.recipient_id = (select auth.uid()) then r.sender_id else r.recipient_id end
  where (select auth.uid()) in (r.sender_id, r.recipient_id)
    and not public.contacts_blocked_either(r.sender_id, r.recipient_id)
  order by r.created_at desc, r.id
  limit 250
$$;

comment on function public.my_contact_requests() is
  'Demandes de contact en cours du compte connecté (reçues et envoyées) ; lecture seule.';

-- Comptes bloqués par le compte connecté : référence du blocage, identifiant du membre AU MOMENT du
-- blocage (null s'il ne lui était pas visible), date. Rien du profil actuel du bloqué, qui lui est
-- invisible : ni nom affiché, ni avatar, ni nouvel identifiant. Jamais d'identifiant de compte.
-- Lecture seule ; 1 000 lignes au plus (limite des blocages).
create function public.my_blocked_members()
returns table (id uuid, handle text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.blocked_handle, b.created_at
  from public.contact_blocks as b
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc, b.id
  limit 1000
$$;

comment on function public.my_blocked_members() is
  'Comptes bloqués par le compte connecté (référence, identifiant au moment du blocage, date) ; lecture seule.';

-- Droits : les fonctions appelées par l'application sont réservées aux comptes connectés ; tout le
-- reste est interne (évalué avec les droits du propriétaire des fonctions SECURITY DEFINER).
revoke all on function public.send_contact_request(text) from public, anon, authenticated;
grant execute on function public.send_contact_request(text) to authenticated;
revoke all on function public.accept_contact_request(text) from public, anon, authenticated;
grant execute on function public.accept_contact_request(text) to authenticated;
revoke all on function public.refuse_contact_request(text) from public, anon, authenticated;
grant execute on function public.refuse_contact_request(text) to authenticated;
revoke all on function public.cancel_contact_request(text) from public, anon, authenticated;
grant execute on function public.cancel_contact_request(text) to authenticated;
revoke all on function public.remove_contact(text) from public, anon, authenticated;
grant execute on function public.remove_contact(text) to authenticated;
revoke all on function public.block_member(text, text) from public, anon, authenticated;
grant execute on function public.block_member(text, text) to authenticated;
revoke all on function public.unblock_member(text) from public, anon, authenticated;
grant execute on function public.unblock_member(text) to authenticated;
revoke all on function public.my_contacts() from public, anon, authenticated;
grant execute on function public.my_contacts() to authenticated;
revoke all on function public.my_contact_requests() from public, anon, authenticated;
grant execute on function public.my_contact_requests() to authenticated;
revoke all on function public.my_blocked_members() from public, anon, authenticated;
grant execute on function public.my_blocked_members() to authenticated;
revoke all on function public.contacts_linked(uuid, uuid) from public, anon, authenticated;
revoke all on function public.contacts_blocked(uuid, uuid) from public, anon, authenticated;
revoke all on function public.contacts_blocked_either(uuid, uuid) from public, anon, authenticated;
revoke all on function public.contacts_lock_pair(uuid, uuid) from public, anon, authenticated;
revoke all on function public.contacts_lock_accounts(uuid, uuid) from public, anon, authenticated;
revoke all on function public.contacts_block(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.contacts_count(uuid) from public, anon, authenticated;
revoke all on function public.contacts_ref_ok(text) from public, anon, authenticated;
revoke all on function public.contacts_visible_target(text, uuid) from public, anon, authenticated;
revoke all on function public.contacts_take_change(uuid) from public, anon, authenticated;
-- Le remplacement garde les droits de la fonction d'origine ; rappelés ici par sûreté.
revoke all on function public.profiles_visible_to(uuid, text, uuid) from public, anon, authenticated;
