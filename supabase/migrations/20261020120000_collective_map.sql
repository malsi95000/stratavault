-- Carte collective et modération (CMY-01, COM-01 à COM-03, bêta 2.1, socle communautaire).
--
-- Une carte commune à tous les comptes connectés : chaque membre y ajoute ses propres éléments
-- (balises, points, textes, zones, liens et traits de flux, avec leur fiche : titre, notes, date),
-- signés de son nom affiché ET de son identifiant public (@handle, unique : le nom affiché, lui, ne
-- l'est pas et pourrait être copié), et ne modifie ou ne supprime que les siens. Tout membre peut
-- signaler un élément d'un autre ; des modérateurs désignés à la main (public.moderators) masquent,
-- rétablissent ou suppriment un élément, ou classent les signalements, avec un motif enregistré, et
-- peuvent suspendre 30 jours les contributions de son auteur ; l'auteur (et les membres qui l'ont
-- signalé) en sont informés dans l'application ; chaque décision est journalisée.
--
-- Tables (RLS activé SANS politique et aucun droit pour l'API : chaque ligne porte un identifiant de
-- compte, qui ne doit jamais sortir de la base). Tout passe par les fonctions SECURITY DEFINER
-- ci-dessous, qui vérifient auth.uid(), bornent leurs entrées en texte avant toute conversion et ne
-- renvoient que des champs publics (nom affiché et identifiant public de l'auteur) :
--   - public.collective_items : éléments de la carte (identifiant choisi par l'application, au format
--     des identifiants d'éléments d'une carte, auteur, sorte, contenu jsonb validé, état « visible » ou
--     « hidden » (masqué par un modérateur), dates). Supprimés avec le compte de l'auteur ;
--   - public.collective_state : une seule ligne, version de la carte (incrémentée à chaque
--     changement, pour le rafraîchissement périodique) et totaux (éléments, octets, sommets), tenus
--     par un déclencheur ;
--   - public.collective_reports : signalements (identifiant et sorte de l'élément, membre qui
--     signale, motif, précisions, état, copie du contenu signalé tant que le signalement est en
--     attente). Un seul signalement en attente par membre et par élément ; un signalement traité peut
--     être refait si l'élément a été modifié depuis la décision. Rattachés à l'IDENTIFIANT de
--     l'élément (public.collective_item_ids), pas à l'élément : son retrait par son auteur ne les
--     efface pas (ils restent dans la file, « retiré par son auteur », avec la copie signalée, et
--     visent de nouveau l'élément si l'auteur le recrée sous le même identifiant). Supprimés avec le
--     compte du membre qui signale, ou avec celui de l'auteur de l'élément ;
--   - public.collective_report_copies : copies des contenus signalés, une seule par élément et par
--     contenu (quel que soit le nombre de membres qui le signalent), effacées dès que plus aucun
--     signalement en attente n'y renvoie. 8 Mio au plus pour toute la carte (total tenu dans
--     public.collective_state) : au-delà, le signalement est enregistré sans copie ;
--   - public.collective_decisions : journal des décisions de modération (élément, sorte, titre au
--     moment de la décision, auteur, modérateur, action, motif, nombre de signalements traités,
--     suspension prononcée, date). Conservé un an (les décisions plus anciennes sont effacées à la
--     décision suivante) ; l'auteur et le modérateur deviennent null à la suppression de leur compte.
--     L'action « withdraw » (sans modérateur) trace le retrait par son auteur d'un élément masqué ou
--     signalé : supprimer son élément n'efface pas la trace de sa modération ; ses signalements en
--     attente restent à juger (les membres qui les ont faits sont informés de cette décision-là, pas
--     du retrait). Un lien signalé ou
--     masqué, supprimé par un modérateur avec l'élément auquel il est rattaché, a sa propre décision
--     « delete » (les membres qui l'avaient signalé en sont informés) ;
--   - public.collective_item_ids : tout identifiant d'élément déjà utilisé (auteur, « modéré »). Un
--     identifiant n'est jamais repris par un autre compte, ni par son auteur après une décision qu'il
--     connaît (masquage, suppression par un modérateur, avec les liens rattachés ; retrait d'un
--     élément masqué). Le retrait d'un élément seulement signalé ne le marque pas : l'auteur ne doit
--     pas pouvoir apprendre qu'il a été signalé en essayant de reprendre son identifiant. L'auteur
--     devient null à la suppression de son compte (l'identifiant reste pris) ;
--   - public.collective_suspensions : contributions suspendues (ajout et modification refusés) d'un
--     compte jusqu'à une date, prononcées par un modérateur avec un masquage ou une suppression (une
--     ligne par compte, avec la dernière décision qui la justifie). Rétablir l'élément de cette
--     décision la recalcule d'après les autres décisions encore valables (suspension d'un autre
--     élément toujours masqué ou supprimé), ou la lève s'il n'en reste aucune ; levée aussi à la main
--     (éditeur SQL). Supprimées avec le compte ;
--   - public.collective_notices : avis de modération montrés dans l'application à l'auteur de
--     l'élément (masqué, rétabli, supprimé) et aux membres qui l'avaient signalé (signalement traité).
--     100 au plus par compte ; supprimés avec la décision ou le compte ;
--   - public.moderators : comptes modérateurs, alimentée à la main par l'éditeur (éditeur SQL du
--     tableau de bord, voir docs/supabase.md). Aucune fonction ne l'écrit.
--
-- Contenu d'un élément (fonction public.collective_item_data_ok, mêmes règles que
-- src/features/collective/itemData.ts, vérifiées par les tests) : les clés exactes de sa sorte,
-- coordonnées dans les bornes (6 décimales au plus), 1 000 sommets au plus par tracé, titre de
-- 200 caractères et notes de 2 000 caractères au plus, sans caractère de contrôle ni marque de sens
-- de lecture (U+202A à U+202E, U+2066 à U+2069), date « AAAA-MM-JJ », type de balise et couleur de
-- flux connus. Un lien relie un pays ou un élément VISIBLE de son propre auteur : personne ne peut
-- rattacher un lien à l'élément d'un autre membre (sa suppression ne touche que ses propres liens).
--
-- Ce que chacun voit (public.collective_map) : les éléments visibles dont l'auteur a un profil, avec
-- son nom affiché et son identifiant public (publier dans la carte collective rend son identifiant
-- public visible des membres, quelle que soit la visibilité de son profil, qui reste appliquée par
-- profile_by_handle) et l'indication « c'est le mien » ; jamais l'identifiant de compte d'un auteur.
-- Un élément n'est donc jamais montré sans signature : l'auteur qui supprime son profil voit encore
-- ses éléments (non signés) et peut les supprimer, les autres ne les voient plus (ni ne peuvent les
-- signaler) ; ils réapparaissent, signés, si un profil est recréé. Un blocage entre deux comptes
-- (public.contact_blocks), dans un sens ou dans l'autre, masque à chacun les éléments de l'autre ;
-- l'auteur d'un élément visible se bloque depuis cet élément (block_collective_author), même si son
-- profil n'est visible que de ses contacts. Un élément masqué n'est plus montré sur la carte : seuls son auteur (my_hidden_collective_items) et les modérateurs le voient. Les modérateurs voient en plus, pour les
-- éléments signalés, masqués ou retirés avec des signalements en attente, l'identifiant public et le
-- nom affiché de l'auteur, les motifs et précisions des signalements (jamais qui les a faits), et le
-- journal des décisions ; jamais ce qui concerne leurs propres éléments (ni dans la file, ni dans le
-- journal : un signalement n'est pas révélé à son auteur).
-- Il faut un profil pour ajouter ou modifier un élément (il est signé de son nom affiché) ; sans
-- profil, ou pendant une suspension, on peut encore supprimer ses éléments et signaler (l'éditeur
-- passe alors en mode « suppression seulement »).
--
-- Anti-énumération : un élément inconnu, masqué ou d'un compte bloqué donne la même réponse
-- « not-found » ; les essais sont comptés avant la recherche. À l'ajout, tout identifiant déjà
-- utilisé par un autre compte (visible, masqué, bloqué ou supprimé) répond « id-taken » : la réponse
-- ne dit rien de l'état de l'élément.
--
-- Limites anti-abus (public.rate_limits, par compte ; mêmes valeurs que
-- src/features/collective/limits.ts, vérifiées par les tests) : 50 éléments ajoutés par jour,
-- 2 000 modifications ou suppressions par jour, 20 signalements par jour, 240 lectures complètes de
-- la carte (ou de la file de modération) par heure, 1 200 lectures de son état par heure,
-- 500 décisions de modération par jour. Toute fonction comptée répond par un statut, jamais par une
-- erreur, une fois le compteur pris (une erreur annulerait l'incrément avec le reste de
-- l'instruction). Stockage borné : par auteur, 200 éléments, 512 Kio et 20 000 sommets, dont 128 Kio
-- et 5 000 sommets ajoutés par période de 24 heures (contenu des éléments ajoutés ou modifiés depuis :
-- remplir toute la carte demande ainsi des dizaines de comptes, et laisse aux modérateurs le temps
-- d'agir) ; pour toute la carte, 5 000 éléments, 6 Mio et 200 000 sommets ; 48 Kio par élément envoyé ;
-- copies des contenus signalés : 8 Mio pour toute la carte (une par élément et par contenu).
--
-- Concurrence : toute écriture (signalement compris) prend d'abord le verrou de la ligne
-- public.collective_state (même ordre partout : aucun interblocage entre ces fonctions), puis vérifie
-- les bornes.
--
-- Droit d'accès : chaque compte relit ses éléments (masqués compris) par
-- public.my_collective_items(), ses signalements par public.my_collective_reports(), ses avis (et les
-- suspensions qu'ils annoncent) par public.my_collective_notices(), sa désignation comme modérateur et
-- sa suspension en cours par public.my_collective_account(), les identifiants d'éléments qu'il a
-- utilisés par public.my_collective_item_ids() et, s'il est modérateur, ses décisions par
-- public.my_moderation_decisions() (« Télécharger mes données »). Les décisions qui le visent sans
-- lui être notifiées (classement, retrait par lui-même d'un élément signalé, lien supprimé avec un
-- élément) ne lui sont pas rendues : elles révéleraient un signalement (RGPD, art. 15, paragraphe 4) ;
-- l'éditeur les communique sur demande, après examen au cas par cas (docs/legal.md, point 22). Ses
-- éléments masqués lui sont aussi listés par public.my_hidden_collective_items(), pour qu'il puisse
-- toujours les supprimer, même après l'effacement de leur avis.
--
-- Compatible avec l'application déjà en production (v2.0), l'étape 1 et les profils, contacts et
-- partages de la bêta 2.1 : nouvelles tables et nouvelles fonctions ; seule change la liste fermée
-- des actions de public.rate_limits (six actions ajoutées : les lignes existantes restent valides),
-- et un déclencheur s'ajoute sur public.profiles (création, suppression, changement de nom ou
-- d'identifiant d'un auteur : la version de la carte change, pour que chacun relise les signatures).
-- Rien n'est écrit dans le schéma storage. À appliquer après 20261019120000_map_sharing.sql.

-- Compteurs : actions de la carte collective ajoutées à la liste fermée.
alter table public.rate_limits drop constraint rate_limits_action;
alter table public.rate_limits add constraint rate_limits_action check (
  action in (
    'profile_create', 'profile_handle', 'profile_change', 'handle_attempt', 'profile_lookup', 'avatar_upload', 'avatar_change', 'avatar_read',
    'contact_request', 'contact_block', 'contact_change',
    'map_share', 'map_join', 'map_change', 'map_lock', 'map_read', 'map_state',
    'collective_create', 'collective_change', 'collective_report', 'collective_read', 'collective_state', 'collective_moderate'
  )
);

-- ---------------------------------------------------------------------------------------------
-- Contrôle du contenu d'un élément (fonctions internes, EXECUTE retiré à tous).
-- ---------------------------------------------------------------------------------------------

-- Texte d'au plus `p_max` caractères (et 4 × `p_max` octets), sans caractère de contrôle (sauf retour
-- à la ligne et tabulation si `p_multiline`) ni marque de sens de lecture.
create function public.collective_text_ok(p_value text, p_max integer, p_multiline boolean)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_value is null then false
    when octet_length(p_value) > 4 * p_max then false
    when char_length(p_value) > p_max then false
    when p_value ~ '[‪-‮⁦-⁩]' then false
    when p_multiline then p_value !~ '[\x01-\x08\x0b-\x1f\x7f-\x9f]'
    else p_value !~ '[\x01-\x1f\x7f-\x9f]'
  end
$$;

-- Valeur jsonb chaîne acceptée par collective_text_ok.
create function public.collective_json_text_ok(p_value jsonb, p_max integer, p_multiline boolean)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_value) is distinct from 'string' then false
    else public.collective_text_ok(p_value #>> '{}', p_max, p_multiline)
  end
$$;

-- Nombre jsonb entre `p_min` et `p_max`, avec 6 décimales au plus (forme arrondie par l'application).
-- Longueur vérifiée avant la conversion.
create function public.collective_number_ok(p_value jsonb, p_min numeric, p_max numeric)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_value) is distinct from 'number' then false
    when octet_length(p_value::text) > 24 then false
    when (p_value::text)::numeric not between p_min and p_max then false
    else pg_catalog.scale((p_value::text)::numeric) <= 6
  end
$$;

-- Position [longitude, latitude].
create function public.collective_lonlat_ok(p_value jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_value) is distinct from 'array' then false
    when jsonb_array_length(p_value) <> 2 then false
    when not public.collective_number_ok(p_value -> 0, -180, 180) then false
    else public.collective_number_ok(p_value -> 1, -90, 90)
  end
$$;

-- Tracé : de `p_min` à 1 000 positions.
create function public.collective_path_ok(p_value jsonb, p_min integer)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_value) is distinct from 'array' then false
    when jsonb_array_length(p_value) not between p_min and 1000 then false
    else not exists (
      select 1 from jsonb_array_elements(p_value) as e (item) where not public.collective_lonlat_ok(e.item)
    )
  end
$$;

-- Objet qui a toutes les clés `p_required`, et au plus les clés `p_optional` en plus.
create function public.collective_keys_ok(p_data jsonb, p_required text[], p_optional text[])
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_data) is distinct from 'object' then false
    when not (p_data ?& p_required) then false
    else (p_data - (p_required || p_optional)) = '{}'::jsonb
  end
$$;

-- Fiche d'un élément : titre (200 caractères, une ligne), notes (2 000) et date facultative « AAAA-MM-JJ ».
create function public.collective_fiche_ok(p_data jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when not public.collective_json_text_ok(p_data -> 'title', 200, false) then false
    when not public.collective_json_text_ok(p_data -> 'note', 2000, true) then false
    when not (p_data ? 'date') then true
    when jsonb_typeof(p_data -> 'date') is distinct from 'string' then false
    else (p_data ->> 'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  end
$$;

-- Extrémité d'un lien : un pays (« c:FRA ») ou une balise, un point, une zone ou un texte (« p:<id> »…).
create function public.collective_ref_ok(p_value jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_value) is distinct from 'string' then false
    when octet_length(p_value #>> '{}') > 66 then false
    else (p_value #>> '{}') ~ '^(c:[A-Z]{3}|[pozt]:[A-Za-z0-9_-]{1,64})$'
  end
$$;

-- Contenu d'un élément de sorte `p_kind` (voir l'en-tête).
create function public.collective_item_data_ok(p_kind text, p_data jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(p_data) is distinct from 'object' then
    return false;
  end if;
  if p_kind = 'ping' then
    return public.collective_keys_ok(p_data, array['ll', 'type', 'title', 'note'], array['date'])
      and public.collective_lonlat_ok(p_data -> 'll')
      and jsonb_typeof(p_data -> 'type') = 'string'
      and (p_data ->> 'type') in ('maritime', 'entreprises', 'armes', 'strategique', 'crise', 'base-militaire')
      and public.collective_fiche_ok(p_data);
  elsif p_kind = 'point' then
    return public.collective_keys_ok(p_data, array['ll', 'title', 'note'], array['date'])
      and public.collective_lonlat_ok(p_data -> 'll')
      and public.collective_fiche_ok(p_data);
  elsif p_kind = 'text' then
    if not public.collective_keys_ok(p_data, array['ll', 'title', 'note'], array['date', 'size']) then
      return false;
    end if;
    if p_data ? 'size' and not public.collective_number_ok(p_data -> 'size', 6, 40) then
      return false;
    end if;
    return public.collective_lonlat_ok(p_data -> 'll') and public.collective_fiche_ok(p_data);
  elsif p_kind = 'zone' then
    -- Anneau fermé (premier sommet = dernier sommet), 4 sommets au moins.
    return public.collective_keys_ok(p_data, array['ring', 'title', 'note'], array['date'])
      and public.collective_path_ok(p_data -> 'ring', 4)
      and (p_data -> 'ring' -> 0) = (p_data -> 'ring' -> -1)
      and public.collective_fiche_ok(p_data);
  elsif p_kind = 'link' then
    return public.collective_keys_ok(p_data, array['a', 'b', 'title', 'note'], array['date'])
      and public.collective_ref_ok(p_data -> 'a')
      and public.collective_ref_ok(p_data -> 'b')
      and (p_data ->> 'a') <> (p_data ->> 'b')
      and public.collective_fiche_ok(p_data);
  elsif p_kind = 'flux' then
    if not public.collective_keys_ok(p_data, array['color', 'points', 'width'], array['opacity']) then
      return false;
    end if;
    if p_data ? 'opacity' and not public.collective_number_ok(p_data -> 'opacity', 0, 1) then
      return false;
    end if;
    return jsonb_typeof(p_data -> 'color') = 'string'
      and (p_data ->> 'color') = any (public.maps_flux_colors())
      and public.collective_number_ok(p_data -> 'width', 1, 16)
      and public.collective_path_ok(p_data -> 'points', 2);
  end if;
  return false;
end;
$$;

-- Sommets du tracé d'un élément (zone, flux), 0 pour les autres.
create function public.collective_path_points(p_kind text, p_data jsonb)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_kind = 'zone' and jsonb_typeof(p_data -> 'ring') = 'array' then jsonb_array_length(p_data -> 'ring')
    when p_kind = 'flux' and jsonb_typeof(p_data -> 'points') = 'array' then jsonb_array_length(p_data -> 'points')
    else 0
  end
$$;

-- ---------------------------------------------------------------------------------------------
-- Tables.
-- ---------------------------------------------------------------------------------------------

create table public.collective_items (
  id text primary key
    constraint collective_items_id_format check (octet_length(id) <= 64 and id ~ '^[A-Za-z0-9_-]{1,64}$'),
  author_id uuid not null references auth.users (id) on delete cascade,
  kind text not null constraint collective_items_kind check (kind in ('ping', 'point', 'text', 'zone', 'link', 'flux')),
  data jsonb not null,
  -- Taille du contenu et sommets de son tracé : tenus par le déclencheur collective_items_before_write.
  data_bytes integer not null constraint collective_items_data_bytes check (data_bytes between 2 and 65536),
  path_points integer not null constraint collective_items_path_points check (path_points between 0 and 1000),
  status text not null default 'visible' constraint collective_items_status check (status in ('visible', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collective_items_data check (public.collective_item_data_ok(kind, data))
);

create index collective_items_author on public.collective_items (author_id);
create index collective_items_order on public.collective_items (created_at, id);

comment on table public.collective_items is
  'Éléments de la carte collective (auteur, sorte, contenu validé, état) ; aucun accès par l''API.';

create table public.collective_state (
  id boolean primary key default true constraint collective_state_single check (id),
  revision bigint not null default 0,
  items integer not null default 0,
  bytes bigint not null default 0,
  path_points bigint not null default 0,
  -- Octets des copies des contenus signalés (public.collective_report_copies), tenus par un déclencheur.
  report_bytes bigint not null default 0
);

insert into public.collective_state (id) values (true);

comment on table public.collective_state is
  'Version et totaux de la carte collective (une ligne), tenus par un déclencheur ; aucun accès par l''API.';

create table public.collective_decisions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  item_id text not null,
  item_kind text not null constraint collective_decisions_kind check (item_kind in ('ping', 'point', 'text', 'zone', 'link', 'flux')),
  item_title text not null default '' constraint collective_decisions_title check (char_length(item_title) <= 200),
  author_id uuid references auth.users (id) on delete set null,
  -- Null pour un retrait par l'auteur (« withdraw »), ou après la suppression du compte du modérateur.
  moderator_id uuid references auth.users (id) on delete set null,
  action text not null constraint collective_decisions_action check (action in ('hide', 'restore', 'delete', 'dismiss', 'withdraw')),
  reason text not null constraint collective_decisions_reason check (public.collective_text_ok(reason, 500, true) and char_length(reason) >= 3),
  reports integer not null default 0 constraint collective_decisions_reports check (reports >= 0),
  -- Fin de la suspension des contributions de l'auteur prononcée avec cette décision (null : aucune).
  suspended_until timestamptz,
  -- Vrai si l'auteur a reçu un avis de cette décision (masquer, rétablir, supprimer) ; faux pour un
  -- classement, un retrait par l'auteur et un lien supprimé avec l'élément auquel il était rattaché.
  author_notified boolean not null default false,
  created_at timestamptz not null default now(),
  constraint collective_decisions_suspension check (suspended_until is null or action in ('hide', 'delete'))
);

create index collective_decisions_created on public.collective_decisions (created_at);
create index collective_decisions_author on public.collective_decisions (author_id);
create index collective_decisions_moderator on public.collective_decisions (moderator_id);

comment on table public.collective_decisions is
  'Journal des décisions de modération de la carte collective (un an) ; aucun accès par l''API.';

create table public.collective_item_ids (
  id text primary key
    constraint collective_item_ids_format check (octet_length(id) <= 64 and id ~ '^[A-Za-z0-9_-]{1,64}$'),
  -- Null après la suppression du compte de l'auteur : l'identifiant reste pris.
  author_id uuid references auth.users (id) on delete set null,
  -- Élément masqué, supprimé par la modération, ou retiré par son auteur alors qu'il était masqué.
  moderated boolean not null default false
);

create index collective_item_ids_author on public.collective_item_ids (author_id);

comment on table public.collective_item_ids is
  'Identifiants d''éléments de la carte collective déjà utilisés (jamais repris par un autre compte, ni après une modération) ; aucun accès par l''API.';

-- Copie d'un contenu signalé : une par élément et par contenu (comparaison exacte du jsonb, sous le
-- verrou de la carte), quel que soit le nombre de signalements qui y renvoient.
create table public.collective_report_copies (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  item_id text not null references public.collective_item_ids (id) on delete cascade,
  data jsonb not null,
  data_bytes integer not null constraint collective_report_copies_bytes check (
    data_bytes = octet_length(data::text) and data_bytes between 2 and 65536
  ),
  -- Date du premier signalement de ce contenu.
  created_at timestamptz not null default now()
);

create index collective_report_copies_item on public.collective_report_copies (item_id, created_at);

comment on table public.collective_report_copies is
  'Copies des contenus signalés de la carte collective (une par élément et par contenu, 8 Mio au plus) ; aucun accès par l''API.';

create table public.collective_reports (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  -- L'identifiant, pas l'élément : le retrait de l'élément par son auteur n'efface pas le signalement.
  item_id text not null references public.collective_item_ids (id) on delete cascade,
  item_kind text not null constraint collective_reports_kind check (item_kind in ('ping', 'point', 'text', 'zone', 'link', 'flux')),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null constraint collective_reports_reason check (
    reason in ('illegal', 'hate', 'harassment', 'personal-data', 'misinformation', 'spam', 'other')
  ),
  details text not null default '' constraint collective_reports_details check (public.collective_text_ok(details, 500, true)),
  status text not null default 'open' constraint collective_reports_status check (status in ('open', 'resolved')),
  -- Contenu de l'élément au moment du signalement (montré aux modérateurs s'il a changé depuis, ou si
  -- l'élément a été retiré) ; null au-delà du budget des copies, et dès que le signalement est traité.
  copy_id uuid references public.collective_report_copies (id),
  decision_id uuid references public.collective_decisions (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint collective_reports_copy check (status = 'open' or copy_id is null),
  -- Contenu illicite : notification au sens de l'article 16 du DSA, qui explique pourquoi le contenu
  -- serait illicite (20 caractères au moins, comme src/features/collective/reportForm.ts).
  constraint collective_reports_illegal_details check (reason <> 'illegal' or char_length(details) >= 20)
);

-- Un seul signalement en attente par membre et par élément (un signalement traité peut être refait
-- si l'élément a changé depuis : report_collective_item).
create unique index collective_reports_open_once on public.collective_reports (item_id, reporter_id) where status = 'open';
create index collective_reports_item_reporter on public.collective_reports (item_id, reporter_id);
create index collective_reports_reporter on public.collective_reports (reporter_id);
create index collective_reports_open on public.collective_reports (status, created_at);
create index collective_reports_copy on public.collective_reports (copy_id);
-- Conservation des signalements traités (collective_purge).
create index collective_reports_resolved on public.collective_reports (resolved_at) where status = 'resolved';

comment on table public.collective_reports is
  'Signalements d''éléments de la carte collective (un en attente par membre et par élément, avec le contenu signalé) ; aucun accès par l''API.';

create table public.collective_notices (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  decision_id uuid not null references public.collective_decisions (id) on delete cascade,
  -- « author » : décision sur l'un de ses éléments ; « reporter » : signalement traité.
  role text not null constraint collective_notices_role check (role in ('author', 'reporter')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint collective_notices_once unique (user_id, decision_id)
);

create index collective_notices_user on public.collective_notices (user_id, created_at);
create index collective_notices_decision on public.collective_notices (decision_id);

comment on table public.collective_notices is
  'Avis de modération de la carte collective montrés aux comptes concernés ; aucun accès par l''API.';

create table public.moderators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

comment on table public.moderators is
  'Comptes modérateurs de la carte collective, désignés à la main (éditeur SQL) ; aucun accès par l''API.';

create table public.collective_suspensions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  until timestamptz not null,
  decision_id uuid references public.collective_decisions (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.collective_suspensions is
  'Contributions à la carte collective suspendues par la modération (jusqu''à une date) ; aucun accès par l''API.';

alter table public.collective_items enable row level security;
alter table public.collective_state enable row level security;
alter table public.collective_decisions enable row level security;
alter table public.collective_reports enable row level security;
alter table public.collective_notices enable row level security;
alter table public.moderators enable row level security;
alter table public.collective_item_ids enable row level security;
alter table public.collective_report_copies enable row level security;
alter table public.collective_suspensions enable row level security;
revoke all on table public.collective_item_ids from public, anon, authenticated;
revoke all on table public.collective_report_copies from public, anon, authenticated;
revoke all on table public.collective_suspensions from public, anon, authenticated;
revoke all on table public.collective_items from public, anon, authenticated;
revoke all on table public.collective_state from public, anon, authenticated;
revoke all on table public.collective_decisions from public, anon, authenticated;
revoke all on table public.collective_reports from public, anon, authenticated;
revoke all on table public.collective_notices from public, anon, authenticated;
revoke all on table public.moderators from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Déclencheurs : taille et sommets d'un élément, identité figée ; version et totaux de la carte,
-- identifiants pris (collective_item_ids).
-- ---------------------------------------------------------------------------------------------

-- Déclencheurs en security invoker : seules les fonctions SECURITY DEFINER ci-dessous écrivent ces tables.
create function public.collective_items_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- Identité, auteur, sorte et date de création ne changent jamais.
    new.id := old.id;
    new.author_id := old.author_id;
    new.kind := old.kind;
    new.created_at := old.created_at;
    if new.data is distinct from old.data then
      new.updated_at := now();
    else
      new.updated_at := old.updated_at;
    end if;
  else
    new.created_at := now();
    new.updated_at := new.created_at;
  end if;
  new.data_bytes := octet_length(new.data::text);
  new.path_points := public.collective_path_points(new.kind, new.data);
  return new;
end;
$$;

create trigger collective_items_before_write
before insert or update on public.collective_items
for each row execute function public.collective_items_before_write();

create function public.collective_items_count()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.collective_state as s
    set revision = s.revision + 1, items = s.items + 1, bytes = s.bytes + new.data_bytes, path_points = s.path_points + new.path_points
    where s.id;
    -- L'identifiant est désormais pris, même après la suppression de l'élément.
    insert into public.collective_item_ids (id, author_id) values (new.id, new.author_id)
    on conflict (id) do nothing;
    return new;
  elsif tg_op = 'UPDATE' then
    update public.collective_state as s
    set revision = s.revision + 1,
      bytes = s.bytes - old.data_bytes + new.data_bytes,
      path_points = s.path_points - old.path_points + new.path_points
    where s.id;
    return new;
  end if;
  update public.collective_state as s
  set revision = s.revision + 1, items = s.items - 1, bytes = s.bytes - old.data_bytes, path_points = s.path_points - old.path_points
  where s.id;
  return old;
end;
$$;

create trigger collective_items_count
after insert or update or delete on public.collective_items
for each row execute function public.collective_items_count();

-- Total des copies des contenus signalés (budget de public.report_collective_item).
create function public.collective_report_copies_count()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.collective_state as s set report_bytes = s.report_bytes + new.data_bytes where s.id;
    return new;
  end if;
  update public.collective_state as s set report_bytes = s.report_bytes - old.data_bytes where s.id;
  return old;
end;
$$;

create trigger collective_report_copies_count
after insert or delete on public.collective_report_copies
for each row execute function public.collective_report_copies_count();

-- Une copie n'est gardée que tant qu'un signalement en attente y renvoie (signalement traité,
-- supprimé avec le compte de son auteur…).
create function public.collective_reports_release_copy()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.collective_report_copies as c
  where c.id = old.copy_id
    and not exists (select 1 from public.collective_reports as r where r.copy_id = c.id);
  return null;
end;
$$;

create trigger collective_reports_release_copy
after update of copy_id or delete on public.collective_reports
for each row
when (old.copy_id is not null)
execute function public.collective_reports_release_copy();

-- Compte de l'auteur supprimé (author_id mis à null par la clé étrangère) : les signalements de ses
-- éléments, et leurs copies, partent avec lui, comme ses éléments.
create function public.collective_item_ids_author_gone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.collective_reports as r where r.item_id = new.id;
  delete from public.collective_report_copies as c where c.item_id = new.id;
  return null;
end;
$$;

create trigger collective_item_ids_author_gone
after update of author_id on public.collective_item_ids
for each row
when (old.author_id is not null and new.author_id is null)
execute function public.collective_item_ids_author_gone();

-- Profil d'un auteur créé, supprimé, renommé ou dont l'identifiant change : la version de la carte
-- change, pour que chacun relise les signatures (un élément sans profil n'est plus montré aux
-- autres). SECURITY DEFINER : le profil s'écrit avec les droits du compte, qui n'en a aucun sur
-- public.collective_state ; rien n'est fait pour un compte sans élément, ni pour un enregistrement
-- qui garde l'identifiant et le nom (update_my_profile les réécrit toujours : sans ce contrôle, des
-- appels directs feraient changer la version sans limite ; les vrais changements sont comptés).
create function public.collective_on_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if tg_op = 'UPDATE' and new.handle = old.handle and new.display_name = old.display_name then
    return null;
  end if;
  if tg_op = 'DELETE' then
    v_user := old.user_id;
  else
    v_user := new.user_id;
  end if;
  if exists (select 1 from public.collective_items as i where i.author_id = v_user) then
    update public.collective_state as s set revision = s.revision + 1 where s.id;
  end if;
  return null;
end;
$$;

create trigger collective_on_profile_change
after insert or delete or update of handle, display_name on public.profiles
for each row execute function public.collective_on_profile_change();

-- ---------------------------------------------------------------------------------------------
-- Fonctions internes (EXECUTE retiré à tous : appelées par les fonctions SECURITY DEFINER).
-- ---------------------------------------------------------------------------------------------

-- Compte connecté, ou erreur collective_not_authenticated.
create function public.collective_user()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'collective_not_authenticated' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- Vrai si `p_user` est modérateur.
create function public.collective_is_moderator(p_user uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.moderators as m where m.user_id = p_user)
$$;

-- Modérateur connecté, ou erreur (collective_not_authenticated, collective_forbidden).
create function public.collective_moderator()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := public.collective_user();
begin
  if not public.collective_is_moderator(v_uid) then
    raise exception 'collective_forbidden' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- Erreur collective_no_profile si `p_user` n'a pas de profil (un élément est signé de son nom affiché).
create function public.collective_require_profile(p_user uuid)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles as p where p.user_id = p_user) then
    raise exception 'collective_no_profile' using errcode = 'P0001';
  end if;
end;
$$;

-- Compte une opération ; erreur collective_rate_limited au-delà de la limite.
create function public.collective_take(p_user uuid, p_action text, p_limit integer, p_window interval)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if not public.rate_limit_take(p_user, p_action, p_limit, p_window) then
    raise exception 'collective_rate_limited' using errcode = 'P0001';
  end if;
end;
$$;

-- Verrou de la carte (ligne public.collective_state), pris par toute écriture avant ses vérifications.
-- Renvoie la version de la carte au moment du verrou : sous ce verrou, elle ne change que par
-- l'écriture en cours.
create function public.collective_lock()
returns bigint
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_revision bigint;
begin
  select s.revision into v_revision from public.collective_state as s where s.id for update;
  return v_revision;
end;
$$;

-- Version actuelle de la carte (dans la transaction en cours).
create function public.collective_revision()
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select s.revision from public.collective_state as s where s.id;
$$;

-- Identifiant d'élément reçu en texte ; null s'il est mal formé (longueur vérifiée d'abord).
create function public.collective_id(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_value is not null and octet_length(p_value) between 1 and 64 and p_value ~ '^[A-Za-z0-9_-]{1,64}$' then p_value
  end
$$;

-- Contenu reçu en texte (JSON compact, 48 Kio au plus) ; erreur collective_invalid sinon.
create function public.collective_parse(p_data text)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_data is null or octet_length(p_data) > 49152 then
    raise exception 'collective_invalid' using errcode = 'P0001';
  end if;
  begin
    return p_data::jsonb;
  exception when others then
    raise exception 'collective_invalid' using errcode = 'P0001';
  end;
end;
$$;

-- Motif ou précisions reçus en texte : collective_text_ok (500 caractères), au moins `p_min` caractères
-- hors espaces ; erreur collective_invalid sinon.
create function public.collective_reason(p_value text, p_min integer)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if not public.collective_text_ok(p_value, 500, true) or char_length(pg_catalog.btrim(p_value, E' \n\t')) < p_min then
    raise exception 'collective_invalid' using errcode = 'P0001';
  end if;
  return pg_catalog.btrim(p_value, E' \n\t');
end;
$$;

-- Vrai si l'extrémité `p_ref` d'un lien est un pays, ou un élément visible de `p_author` de la bonne sorte.
create function public.collective_endpoint_ok(p_ref text, p_author uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when p_ref like 'c:%' then true
    else exists (
      select 1
      from public.collective_items as i
      where i.id = pg_catalog.substr(p_ref, 3)
        and i.author_id = p_author
        and i.status = 'visible'
        and i.kind = case pg_catalog.substr(p_ref, 1, 1)
          when 'p' then 'ping' when 'o' then 'point' when 'z' then 'zone' when 't' then 'text'
        end
    )
  end
$$;

-- Référence d'un élément pour les liens (« p:<id> »…), null pour les sortes qui ne sont pas des extrémités.
create function public.collective_ref_of(p_kind text, p_id text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_kind when 'ping' then 'p:' when 'point' then 'o:' when 'zone' then 'z:' when 'text' then 't:' end || p_id
$$;

-- Supprime les liens de `p_author` rattachés à son élément `p_ref` (élément supprimé).
create function public.collective_drop_links(p_author uuid, p_ref text)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  delete from public.collective_items as i
  where p_ref is not null
    and i.author_id = p_author
    and i.kind = 'link'
    and (i.data ->> 'a' = p_ref or i.data ->> 'b' = p_ref)
$$;

-- Réponse (statut) si un élément de `p_bytes` octets et `p_points` sommets de plus (variation, pour
-- une modification) dépasse les bornes de l'auteur ou de la carte ; null s'il tient. `p_new` : un
-- élément de plus (ajout). « daily-full » : plus de 128 Kio ou 5 000 sommets ajoutés en 24 heures
-- (compte large : tout le contenu des éléments de l'auteur ajoutés ou modifiés depuis, plus la
-- hausse demandée). Appelée verrou pris.
create function public.collective_room(p_author uuid, p_new boolean, p_bytes integer, p_points integer)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_items bigint;
  v_bytes bigint;
  v_points bigint;
  v_day_bytes bigint;
  v_day_points bigint;
  v_state public.collective_state;
begin
  select
    count(*),
    coalesce(sum(i.data_bytes), 0),
    coalesce(sum(i.path_points), 0),
    coalesce(sum(i.data_bytes) filter (where i.updated_at > now() - interval '1 day'), 0),
    coalesce(sum(i.path_points) filter (where i.updated_at > now() - interval '1 day'), 0)
  into v_items, v_bytes, v_points, v_day_bytes, v_day_points
  from public.collective_items as i
  where i.author_id = p_author;
  if (p_new and v_items >= 200) or v_bytes + p_bytes > 524288 or v_points + p_points > 20000 then
    return 'author-full';
  end if;
  if v_day_bytes + greatest(p_bytes, 0) > 131072 or v_day_points + greatest(p_points, 0) > 5000 then
    return 'daily-full';
  end if;
  select * into v_state from public.collective_state as s where s.id;
  if (p_new and v_state.items >= 5000) or v_state.bytes + p_bytes > 6291456 or v_state.path_points + p_points > 200000 then
    return 'map-full';
  end if;
  return null;
end;
$$;

-- Vrai si `p_user` peut prendre l'identifiant `p_id` : aucun élément ne le porte, et il n'a jamais
-- servi qu'à `p_user` lui-même, hors modération (voir public.collective_item_ids).
create function public.collective_id_free(p_id text, p_user uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select not exists (select 1 from public.collective_items as i where i.id = p_id)
    and not exists (
      select 1 from public.collective_item_ids as u
      where u.id = p_id and (u.author_id is distinct from p_user or u.moderated)
    )
$$;

-- Fin de la suspension en cours des contributions de `p_user` ; null s'il n'est pas suspendu.
create function public.collective_suspended_until(p_user uuid)
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select s.until from public.collective_suspensions as s where s.user_id = p_user and s.until > now()
$$;

-- Garde les 100 avis les plus récents de chaque compte informé de la décision `p_decision`.
create function public.collective_notices_trim(p_decision uuid)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  delete from public.collective_notices as n
  where n.user_id in (select x.user_id from public.collective_notices as x where x.decision_id = p_decision)
    and n.id not in (
      select y.id from public.collective_notices as y
      where y.user_id = n.user_id
      order by y.created_at desc, y.id desc
      limit 100
    )
$$;

-- Avant la suppression de l'élément `p_item`, par son auteur (`p_moderator` null) ou par le
-- modérateur `p_moderator` (lien rattaché à un élément qu'il supprime, motif `p_reason`) : s'il est
-- masqué ou a des signalements en attente, la suppression est inscrite au journal (« withdraw » sans
-- modérateur, ou « delete »). Sinon, rien. Supprimé par un modérateur : ses signalements en attente
-- sont traités avec cette décision et les membres qui les avaient faits en sont informés. Retiré par
-- son auteur : ses signalements en attente RESTENT en attente (rattachés à l'identifiant, avec la
-- copie signalée) et l'élément reste dans la file, « retiré » ; les membres qui l'avaient signalé
-- seront informés de la décision du modérateur. L'identifiant ne pourra plus resservir à l'auteur si
-- la suppression vient d'un modérateur ou si l'élément était masqué (décisions qu'il connaît) ;
-- jamais pour un simple signalement, que l'auteur ne doit pas pouvoir deviner (s'il le recrée, les
-- signalements en attente le visent de nouveau). L'auteur n'est pas informé ici : il l'est de la
-- décision principale. Retraits répétés du même identifiant (supprimé, recréé, supprimé…) sans décision
-- d'un modérateur entre-temps : une seule ligne au journal, dont le nombre de signalements est tenu à
-- jour ; sinon un auteur repousserait les vraies décisions hors du journal (200 dernières).
create function public.collective_trace(p_item public.collective_items, p_moderator uuid, p_reason text)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_reports integer;
  v_decision uuid;
  v_last_action text;
begin
  if p_moderator is not null or p_item.status = 'hidden' then
    update public.collective_item_ids as u set moderated = true where u.id = p_item.id;
  end if;
  select count(*)::integer into v_reports
  from public.collective_reports as r
  where r.item_id = p_item.id and r.status = 'open';
  if p_item.status <> 'hidden' and v_reports = 0 then
    return;
  end if;
  if p_moderator is null then
    select d.id, d.action into v_decision, v_last_action
    from public.collective_decisions as d
    where d.item_id = p_item.id
    order by d.created_at desc, d.id desc
    limit 1;
    if v_last_action = 'withdraw' then
      update public.collective_decisions as d set reports = v_reports where d.id = v_decision;
      return;
    end if;
  end if;
  insert into public.collective_decisions (item_id, item_kind, item_title, author_id, moderator_id, action, reason, reports)
  values (
    p_item.id,
    p_item.kind,
    pg_catalog.left(coalesce(p_item.data ->> 'title', ''), 200),
    p_item.author_id,
    p_moderator,
    case when p_moderator is null then 'withdraw' else 'delete' end,
    case
      when p_moderator is null then 'Retiré par son auteur.'
      else pg_catalog.left('Supprimé avec l''élément auquel il était rattaché. ' || p_reason, 500)
    end,
    v_reports
  )
  returning id into v_decision;
  if p_moderator is null then
    return;
  end if;
  insert into public.collective_notices (user_id, decision_id, role)
  select r.reporter_id, v_decision, 'reporter'
  from public.collective_reports as r
  where r.item_id = p_item.id and r.status = 'open' and r.reporter_id <> p_item.author_id
  on conflict on constraint collective_notices_once do nothing;
  update public.collective_reports as r
  set status = 'resolved', resolved_at = now(), decision_id = v_decision, copy_id = null
  where r.item_id = p_item.id and r.status = 'open';
  perform public.collective_notices_trim(v_decision);
end;
$$;

-- Après le rétablissement d'un élément de `p_user` : si sa suspension en cours a été prononcée avec
-- une décision sur cet élément (`p_item`), elle est recalculée d'après les autres décisions encore
-- valables (masquage ou suppression avec suspension, non suivis d'un rétablissement du même élément,
-- dont la suspension court encore), ou levée s'il n'en reste aucune. Une suspension posée à la main
-- (sans décision) ou justifiée par une autre décision ne change pas.
create function public.collective_suspension_review(p_user uuid, p_item text)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_row public.collective_suspensions;
  v_until timestamptz;
  v_decision uuid;
begin
  select * into v_row from public.collective_suspensions as s where s.user_id = p_user for update;
  if not found or v_row.decision_id is null
    or not exists (select 1 from public.collective_decisions as d where d.id = v_row.decision_id and d.item_id = p_item) then
    return;
  end if;
  select d.suspended_until, d.id into v_until, v_decision
  from public.collective_decisions as d
  where d.author_id = p_user
    and d.suspended_until > now()
    and d.item_id <> p_item
    and not exists (
      select 1 from public.collective_decisions as r
      where r.item_id = d.item_id and r.action = 'restore' and r.created_at >= d.created_at
    )
  order by d.suspended_until desc, d.created_at desc
  limit 1;
  if v_decision is null then
    delete from public.collective_suspensions as s where s.user_id = p_user;
  else
    update public.collective_suspensions as s set until = v_until, decision_id = v_decision where s.user_id = p_user;
  end if;
end;
$$;

-- Conservation : journal des décisions et signalements traités, un an ; une suspension échue (sans
-- effet) est effacée. Appelée par collective_map_state (rafraîchissement périodique de la carte par
-- tout membre qui l'a ouverte) et par moderate_collective_item : ce qui a dépassé sa durée est effacé
-- au premier usage de la carte collective qui suit, sans attendre une nouvelle décision. Ne prend le
-- verrou de la carte (même ordre que toute écriture : compteur, puis verrou) que s'il y a quelque
-- chose à effacer.
create function public.collective_purge()
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.collective_decisions as d where d.created_at < now() - interval '1 year')
    and not exists (
      select 1 from public.collective_reports as r where r.status = 'resolved' and r.resolved_at < now() - interval '1 year'
    )
    and not exists (select 1 from public.collective_suspensions as s where s.until <= now()) then
    return;
  end if;
  perform public.collective_lock();
  delete from public.collective_decisions as d where d.created_at < now() - interval '1 year';
  delete from public.collective_reports as r where r.status = 'resolved' and r.resolved_at < now() - interval '1 year';
  delete from public.collective_suspensions as s where s.until <= now();
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Lecture de la carte (tout compte connecté).
-- ---------------------------------------------------------------------------------------------

-- État de la carte pour le compte connecté : version, est-il modérateur, a-t-il un profil (il en faut
-- un pour contribuer), avis non lus, nombre de ses éléments, fin de la suspension de ses contributions
-- (null : aucune). 1 200 lectures par heure. Efface au passage ce qui a dépassé sa durée de
-- conservation (collective_purge).
-- Erreurs : collective_not_authenticated (42501), collective_rate_limited (P0001).
create function public.collective_map_state()
returns table (
  revision bigint, is_moderator boolean, has_profile boolean, unread_notices integer, my_items integer, suspended_until timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.collective_user();
begin
  perform public.collective_take(v_uid, 'collective_state', 1200, interval '1 hour');
  perform public.collective_purge();
  return query
    select
      s.revision,
      public.collective_is_moderator(v_uid),
      exists (select 1 from public.profiles as p where p.user_id = v_uid),
      (select count(*)::integer from public.collective_notices as n where n.user_id = v_uid and n.read_at is null),
      (select count(*)::integer from public.collective_items as i where i.author_id = v_uid),
      public.collective_suspended_until(v_uid)
    from public.collective_state as s
    where s.id;
end;
$$;

comment on function public.collective_map_state() is
  'Version de la carte collective, rôle et avis du compte connecté ; 1 200 lectures par heure.';

-- Éléments visibles de la carte, dans l'ordre d'ajout : identifiant, sorte, contenu, nom affiché et
-- identifiant public de l'auteur (le nom affiché n'est pas unique, l'identifiant public l'est : c'est
-- lui qui distingue deux auteurs), « c'est le mien », dates. Sans les éléments des comptes avec qui un
-- blocage existe, ni ceux d'un auteur sans profil (jamais d'élément non signé), sauf pour leur auteur
-- lui-même (nom et identifiant null : il peut les supprimer). 240 lectures par heure (5 000 éléments
-- au plus).
-- Erreurs : collective_not_authenticated (42501), collective_rate_limited (P0001).
create function public.collective_map()
returns table (
  id text, kind text, data jsonb, author_name text, author_handle text, mine boolean, created_at timestamptz, updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.collective_user();
begin
  perform public.collective_take(v_uid, 'collective_read', 240, interval '1 hour');
  return query
    with blocked as (
      select b.blocked_id as user_id from public.contact_blocks as b where b.blocker_id = v_uid
      union
      select b.blocker_id from public.contact_blocks as b where b.blocked_id = v_uid
    )
    select i.id, i.kind, i.data, p.display_name, p.handle, i.author_id = v_uid, i.created_at, i.updated_at
    from public.collective_items as i
    left join public.profiles as p on p.user_id = i.author_id
    where i.status = 'visible'
      and (p.user_id is not null or i.author_id = v_uid)
      and not exists (select 1 from blocked as x where x.user_id = i.author_id)
    order by i.created_at, i.id;
end;
$$;

comment on function public.collective_map() is
  'Éléments visibles de la carte collective, avec le nom affiché et l''identifiant public de leur auteur ; 240 lectures par heure.';

-- ---------------------------------------------------------------------------------------------
-- Contributions (chacun ses éléments).
-- ---------------------------------------------------------------------------------------------

-- Ajoute l'élément `p_id` de sorte `p_kind` (contenu `p_data`, JSON compact) au nom du compte
-- connecté. Réponses : « created » (avec le nom affiché et la date), « suspended » (contributions
-- suspendues par la modération), « id-taken » (identifiant porté par un élément, ou déjà utilisé par
-- un autre compte, ou par le compte avant une modération : collective_id_free ; même réponse quel que
-- soit l'état de l'élément), « invalid-link » (extrémité qui n'est ni un pays ni un élément visible du
-- compte), « author-full » (200 éléments, 512 Kio ou 20 000 sommets pour le compte), « daily-full »
-- (128 Kio ou 5 000 sommets en 24 heures), « map-full » (carte pleine). 50 ajouts par jour, comptés
-- après la validation du contenu. Chaque réponse donnée sous le verrou de la carte porte aussi la
-- version de la carte avant (revision_from) et après (revision_to) l'écriture : si revision_from est
-- la version que l'application connaît, personne d'autre n'a changé la carte et elle n'a pas à la
-- relire (null pour une réponse donnée avant le verrou, comme « suspended »).
-- Erreurs : collective_not_authenticated (42501), collective_invalid, collective_no_profile,
-- collective_rate_limited (P0001).
create function public.create_collective_item(p_id text, p_kind text, p_data text)
returns table (status text, author_name text, created_at timestamptz, revision_from bigint, revision_to bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.collective_user();
  v_id text := public.collective_id(p_id);
  v_data jsonb;
  v_room text;
  v_created timestamptz;
  v_from bigint;
begin
  if v_id is null or p_kind is null or octet_length(p_kind) > 8
    or p_kind not in ('ping', 'point', 'text', 'zone', 'link', 'flux') then
    raise exception 'collective_invalid' using errcode = 'P0001';
  end if;
  v_data := public.collective_parse(p_data);
  if not public.collective_item_data_ok(p_kind, v_data) then
    raise exception 'collective_invalid' using errcode = 'P0001';
  end if;
  perform public.collective_require_profile(v_uid);
  if public.collective_suspended_until(v_uid) is not null then
    return query select 'suspended'::text, null::text, null::timestamptz, null::bigint, null::bigint;
    return;
  end if;
  perform public.collective_take(v_uid, 'collective_create', 50, interval '1 day');
  v_from := public.collective_lock();
  if not public.collective_id_free(v_id, v_uid) then
    return query select 'id-taken'::text, null::text, null::timestamptz, v_from, v_from;
    return;
  end if;
  if p_kind = 'link' and not (
    public.collective_endpoint_ok(v_data ->> 'a', v_uid) and public.collective_endpoint_ok(v_data ->> 'b', v_uid)
  ) then
    return query select 'invalid-link'::text, null::text, null::timestamptz, v_from, v_from;
    return;
  end if;
  v_room := public.collective_room(v_uid, true, octet_length(v_data::text), public.collective_path_points(p_kind, v_data));
  if v_room is not null then
    return query select v_room, null::text, null::timestamptz, v_from, v_from;
    return;
  end if;
  insert into public.collective_items (id, author_id, kind, data)
  values (v_id, v_uid, p_kind, v_data)
  returning collective_items.created_at into v_created;
  return query
    select
      'created'::text,
      (select p.display_name from public.profiles as p where p.user_id = v_uid),
      v_created,
      v_from,
      public.collective_revision();
end;
$$;

comment on function public.create_collective_item(text, text, text) is
  'Ajoute un élément du compte connecté à la carte collective ; « created », « suspended », « id-taken », « invalid-link », « author-full », « daily-full » ou « map-full ».';

-- Remplace le contenu de l'élément visible `p_id` du compte connecté (même sorte ; les extrémités d'un
-- lien ne changent pas). Réponses : « updated », « unchanged » (contenu identique : rien n'est
-- écrit), « suspended » (contributions suspendues par la modération), « not-found » (inconnu, masqué
-- ou d'un autre compte : même réponse), « invalid » (contenu refusé pour cette sorte),
-- « author-full », « daily-full », « map-full ». 2 000 modifications ou suppressions par jour.
-- Versions avant et après l'écriture comme pour create_collective_item.
-- Erreurs : collective_not_authenticated (42501), collective_invalid (entrée mal formée),
-- collective_no_profile, collective_rate_limited (P0001).
create function public.update_collective_item(p_id text, p_data text)
returns table (status text, revision_from bigint, revision_to bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.collective_user();
  v_id text := public.collective_id(p_id);
  v_data jsonb;
  v_item public.collective_items;
  v_room text;
  v_from bigint;
begin
  if v_id is null then
    raise exception 'collective_invalid' using errcode = 'P0001';
  end if;
  v_data := public.collective_parse(p_data);
  perform public.collective_require_profile(v_uid);
  if public.collective_suspended_until(v_uid) is not null then
    return query select 'suspended'::text, null::bigint, null::bigint;
    return;
  end if;
  perform public.collective_take(v_uid, 'collective_change', 2000, interval '1 day');
  v_from := public.collective_lock();
  select * into v_item
  from public.collective_items as i
  where i.id = v_id and i.author_id = v_uid and i.status = 'visible'
  for update;
  if not found then
    return query select 'not-found'::text, v_from, v_from;
    return;
  end if;
  if not public.collective_item_data_ok(v_item.kind, v_data) then
    return query select 'invalid'::text, v_from, v_from;
    return;
  end if;
  if v_item.kind = 'link' and (
    (v_data ->> 'a') is distinct from (v_item.data ->> 'a') or (v_data ->> 'b') is distinct from (v_item.data ->> 'b')
  ) then
    return query select 'invalid'::text, v_from, v_from;
    return;
  end if;
  if v_data = v_item.data then
    return query select 'unchanged'::text, v_from, v_from;
    return;
  end if;
  v_room := public.collective_room(
    v_uid,
    false,
    octet_length(v_data::text) - v_item.data_bytes,
    public.collective_path_points(v_item.kind, v_data) - v_item.path_points
  );
  if v_room is not null then
    return query select v_room, v_from, v_from;
    return;
  end if;
  update public.collective_items as i set data = v_data where i.id = v_id;
  return query select 'updated'::text, v_from, public.collective_revision();
end;
$$;

comment on function public.update_collective_item(text, text) is
  'Modifie un élément visible du compte connecté dans la carte collective ; « updated », « unchanged », « suspended », « not-found », « invalid », « author-full », « daily-full » ou « map-full ».';

-- Supprime l'élément `p_id` du compte connecté (visible ou masqué), avec ses propres liens rattachés
-- (permis même pendant une suspension, et sans profil). Un élément masqué ou signalé laisse une trace
-- au journal (collective_trace), comme chacun de ses liens qui l'est.
-- Réponses : « deleted », « not-found ». 2 000 modifications ou suppressions par jour. Versions avant
-- et après l'écriture comme pour create_collective_item (liens rattachés compris).
-- Erreurs : collective_not_authenticated (42501), collective_rate_limited (P0001).
create function public.delete_collective_item(p_id text)
returns table (status text, revision_from bigint, revision_to bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.collective_user();
  v_id text := public.collective_id(p_id);
  v_item public.collective_items;
  v_link public.collective_items;
  v_ref text;
  v_from bigint;
begin
  if v_id is null then
    return query select 'not-found'::text, null::bigint, null::bigint;
    return;
  end if;
  perform public.collective_take(v_uid, 'collective_change', 2000, interval '1 day');
  v_from := public.collective_lock();
  select * into v_item from public.collective_items as i where i.id = v_id and i.author_id = v_uid for update;
  if not found then
    return query select 'not-found'::text, v_from, v_from;
    return;
  end if;
  perform public.collective_trace(v_item, null, null);
  v_ref := public.collective_ref_of(v_item.kind, v_id);
  for v_link in
    select * from public.collective_items as i
    where v_ref is not null and i.author_id = v_uid and i.kind = 'link' and (i.data ->> 'a' = v_ref or i.data ->> 'b' = v_ref)
    for update
  loop
    perform public.collective_trace(v_link, null, null);
  end loop;
  delete from public.collective_items as i where i.id = v_id;
  perform public.collective_drop_links(v_uid, v_ref);
  return query select 'deleted'::text, v_from, public.collective_revision();
end;
$$;

comment on function public.delete_collective_item(text) is
  'Supprime un élément du compte connecté de la carte collective (et ses liens rattachés) ; « deleted » ou « not-found ».';

-- ---------------------------------------------------------------------------------------------
-- Signalements (tout compte connecté).
-- ---------------------------------------------------------------------------------------------

-- Signale l'élément visible `p_id` d'un autre membre : motif `p_reason` (liste fermée), précisions
-- `p_details` (500 caractères, peut être vide), déclaration de bonne foi `p_good_faith`. Motif
-- « illegal » (contenu illicite : notification au sens de l'article 16 du DSA) : précisions de
-- 20 caractères au moins (hors espaces de bord) qui expliquent pourquoi, et déclaration de bonne foi
-- exigées (collective_invalid sinon, avant tout compte), comme le formulaire et la Server Action
-- (src/features/collective/reportForm.ts) ; la déclaration n'est pas enregistrée à part (un
-- signalement « illegal » enregistré l'a toujours portée). Le contenu de l'élément est copié avec le
-- signalement (les modérateurs voient ce qui a été signalé, même si l'auteur l'a modifié ou retiré
-- depuis) : une seule copie par élément et par contenu, partagée par tous les signalements de ce
-- contenu ; au-delà de 8 Mio de copies pour toute la carte, le signalement est enregistré sans copie.
-- Réponses : « reported », « already-reported » (signalement du membre déjà en attente, ou déjà
-- traité alors que l'élément n'a pas changé depuis la décision), « own-item », « not-found »
-- (inconnu, masqué, d'un auteur sans profil ou d'un compte avec qui un blocage existe : même
-- réponse). 20 signalements par jour, comptés avant de chercher l'élément.
-- Erreurs : collective_not_authenticated (42501), collective_invalid, collective_rate_limited (P0001).
create function public.report_collective_item(p_id text, p_reason text, p_details text, p_good_faith boolean default false)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.collective_user();
  v_id text := public.collective_id(p_id);
  v_details text;
  v_item public.collective_items;
  v_copy uuid;
  v_used bigint;
begin
  if p_reason is null or octet_length(p_reason) > 32
    or p_reason not in ('illegal', 'hate', 'harassment', 'personal-data', 'misinformation', 'spam', 'other') then
    raise exception 'collective_invalid' using errcode = 'P0001';
  end if;
  v_details := public.collective_reason(coalesce(p_details, ''), 0);
  if p_reason = 'illegal' and (char_length(v_details) < 20 or p_good_faith is not true) then
    raise exception 'collective_invalid' using errcode = 'P0001';
  end if;
  perform public.collective_take(v_uid, 'collective_report', 20, interval '1 day');
  if v_id is null then
    return 'not-found';
  end if;
  -- Verrou de la carte : l'élément ne peut ni disparaître ni changer avant l'écriture du signalement
  -- (une erreur annulerait le compteur ; la copie est celle du contenu signalé), et le budget des
  -- copies est vérifié sans course.
  perform public.collective_lock();
  select * into v_item
  from public.collective_items as i
  where i.id = v_id
    and i.status = 'visible'
    and exists (select 1 from public.profiles as p where p.user_id = i.author_id)
    and (i.author_id = v_uid or not public.contacts_blocked_either(i.author_id, v_uid))
  for share of i;
  if not found then
    return 'not-found';
  end if;
  if v_item.author_id = v_uid then
    return 'own-item';
  end if;
  if exists (
    select 1 from public.collective_reports as r
    where r.item_id = v_id and r.reporter_id = v_uid and (r.status = 'open' or r.resolved_at >= v_item.updated_at)
  ) then
    return 'already-reported';
  end if;
  -- Copie du contenu signalé : celle d'un signalement précédent du même contenu, sinon une nouvelle,
  -- dans la limite de 8 Mio pour toute la carte (au-delà : signalement sans copie).
  select c.id into v_copy
  from public.collective_report_copies as c
  where c.item_id = v_id and c.data = v_item.data
  limit 1;
  if v_copy is null then
    select s.report_bytes into v_used from public.collective_state as s where s.id;
    if v_used + v_item.data_bytes <= 8388608 then
      insert into public.collective_report_copies (item_id, data, data_bytes)
      values (v_id, v_item.data, v_item.data_bytes)
      returning id into v_copy;
    end if;
  end if;
  insert into public.collective_reports (item_id, item_kind, reporter_id, reason, details, copy_id)
  values (v_id, v_item.kind, v_uid, p_reason, v_details, v_copy)
  on conflict (item_id, reporter_id) where status = 'open' do nothing;
  if not found then
    -- Impossible sous le verrou (vérifié ci-dessus) ; une copie créée pour rien est retirée.
    delete from public.collective_report_copies as c
    where c.id = v_copy and not exists (select 1 from public.collective_reports as r where r.copy_id = c.id);
    return 'already-reported';
  end if;
  return 'reported';
end;
$$;

comment on function public.report_collective_item(text, text, text, boolean) is
  'Signale un élément d''un autre membre dans la carte collective ; « reported », « already-reported », « own-item » ou « not-found ».';

-- Bloque l'auteur de l'élément visible `p_id` (public.contacts_block, même blocage que block_member :
-- 20261018120000_contacts.sql). Un élément est signé de l'identifiant public de son auteur quelle
-- que soit la visibilité de son profil : sans ce chemin, un auteur au profil « contacts » ne pourrait
-- être bloqué par personne (block_member ne trouve que les profils visibles). L'auteur est retrouvé
-- dans la base à partir d'un élément que le compte voit (visible, auteur avec profil, aucun blocage
-- entre eux, la même règle que collective_map) ; son identifiant de compte ne sort jamais.
-- L'identifiant public, déjà montré au compte avec l'élément, est gardé avec le blocage.
-- Réponses : « blocked », « blocks-full » (1 000 comptes bloqués), « own-item », « not-found »
-- (inconnu, masqué, d'un auteur sans profil ou d'un compte avec qui un blocage existe : même
-- réponse). 50 blocages par jour, la limite de block_member (action « contact_block »), comptés avant
-- de chercher l'élément (un identifiant mal formé n'est pas compté : son refus ne dit rien).
-- Erreurs : collective_not_authenticated (42501), collective_rate_limited (P0001).
create function public.block_collective_author(p_id text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.collective_user();
  v_id text := public.collective_id(p_id);
  v_author uuid;
  v_result text;
begin
  if v_id is null then
    return 'not-found';
  end if;
  perform public.collective_take(v_uid, 'contact_block', 50, interval '1 day');
  select i.author_id into v_author
  from public.collective_items as i
  join public.profiles as p on p.user_id = i.author_id
  where i.id = v_id
    and i.status = 'visible'
    and not public.contacts_blocked_either(v_uid, i.author_id);
  if v_author is null then
    return 'not-found';
  end if;
  if v_author = v_uid then
    return 'own-item';
  end if;
  v_result := public.contacts_block(v_uid, v_author, true);
  -- Déjà bloqué entre-temps (autre onglet) : l'élément n'était déjà plus visible.
  if v_result = 'already-blocked' then
    return 'not-found';
  end if;
  return v_result;
end;
$$;

comment on function public.block_collective_author(text) is
  'Bloque l''auteur d''un élément visible de la carte collective ; « blocked », « blocks-full », « own-item » ou « not-found ».';

-- ---------------------------------------------------------------------------------------------
-- Modération (modérateurs seulement).
-- ---------------------------------------------------------------------------------------------

-- File de modération, par pages de 100 (`p_page`, à partir de 0 ; 0 à 1 000) : éléments qui ont des
-- signalements en attente (y compris ceux que leur auteur a retirés depuis : état « withdrawn »),
-- ceux dont un signalement porte sur un contenu illicite d'abord, puis les autres, chaque groupe du
-- plus ancien signalement en attente au plus récent (un signalement n'est jamais repoussé par des
-- signalements plus récents, si nombreux soient-ils, et aucune page ne le perd : `total` donne le
-- nombre d'éléments de la file) ; puis les éléments masqués, du plus récemment modifié au plus
-- ancien. Pour chacun, son
-- contenu (pour un élément retiré : le dernier contenu signalé, null s'il n'a pas été copié), sa
-- sorte, son état, l'identifiant public et le nom affiché de son auteur, ses dates (null pour un
-- élément retiré), le nombre de signalements en attente, leurs motifs et leurs dernières précisions
-- (jamais qui les a faits), et les autres contenus signalés qui diffèrent de ce contenu (3 au plus,
-- du plus ancien au plus récent : l'auteur a modifié l'élément après le signalement). Jamais les
-- éléments du modérateur lui-même (un autre modérateur en décide, et un signalement n'est pas révélé
-- à son auteur). 240 lectures par heure (comptées avec celles de la carte).
-- Erreurs : collective_not_authenticated, collective_forbidden (42501), collective_invalid (page hors
-- bornes), collective_rate_limited (P0001).
create function public.collective_moderation_queue(p_page integer default 0)
returns table (
  id text, kind text, data jsonb, status text, author_handle text, author_name text,
  created_at timestamptz, updated_at timestamptz, open_reports integer, reasons text[], details text[], last_report_at timestamptz,
  reported_data jsonb[], total integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.collective_moderator();
begin
  if p_page is null or p_page < 0 or p_page > 1000 then
    raise exception 'collective_invalid' using errcode = 'P0001';
  end if;
  perform public.collective_take(v_uid, 'collective_read', 240, interval '1 hour');
  return query
    with entries as (
      select x.item_id as id from public.collective_reports as x where x.status = 'open'
      union
      select h.id from public.collective_items as h where h.status = 'hidden'
    )
    select
      e.id, coalesce(i.kind, r.last_kind), cur.data, coalesce(i.status, 'withdrawn'), p.handle, p.display_name,
      i.created_at, i.updated_at, r.open_reports, r.reasons, r.details, r.last_report_at,
      coalesce(
        (
          select array_agg(v.data order by v.created_at, v.id)
          from (
            select c.data, c.created_at, c.id
            from public.collective_report_copies as c
            where c.item_id = e.id and c.data <> cur.data
            order by c.created_at, c.id
            limit 3
          ) as v
        ),
        '{}'::jsonb[]
      ),
      (count(*) over ())::integer
    from entries as e
    left join public.collective_items as i on i.id = e.id
    join public.collective_item_ids as u on u.id = e.id
    left join public.profiles as p on p.user_id = coalesce(i.author_id, u.author_id)
    cross join lateral (
      select coalesce(
        i.data,
        (select c.data from public.collective_report_copies as c where c.item_id = e.id order by c.created_at desc, c.id desc limit 1)
      ) as data
    ) as cur
    cross join lateral (
      select
        (count(*) filter (where x.status = 'open'))::integer as open_reports,
        coalesce(array_agg(distinct x.reason) filter (where x.status = 'open'), '{}'::text[]) as reasons,
        coalesce(
          (array_agg(x.details order by x.created_at desc) filter (where x.status = 'open' and x.details <> ''))[1:5],
          '{}'::text[]
        ) as details,
        max(x.created_at) filter (where x.status = 'open') as last_report_at,
        min(x.created_at) filter (where x.status = 'open') as first_report_at,
        coalesce(bool_or(x.reason = 'illegal') filter (where x.status = 'open'), false) as illegal,
        (array_agg(x.item_kind order by x.created_at desc) filter (where x.status = 'open'))[1] as last_kind
      from public.collective_reports as x
      where x.item_id = e.id
    ) as r
    where coalesce(i.author_id, u.author_id) is distinct from v_uid
    order by (r.open_reports > 0) desc, r.illegal desc, r.first_report_at asc nulls last, i.updated_at desc nulls last, e.id
    limit 100 offset p_page * 100;
end;
$$;

comment on function public.collective_moderation_queue(integer) is
  'File de modération de la carte collective (éléments signalés ou masqués) ; modérateurs seulement.';

-- Décision sur l'élément `p_id` : « hide » (masquer), « restore » (rétablir), « delete » (supprimer,
-- avec les liens de son auteur qui y sont rattachés), « dismiss » (classer les signalements sans
-- toucher à l'élément), motif `p_reason` (3 à 500 caractères) enregistré au journal. `p_suspend`
-- (masquer ou supprimer seulement, sinon collective_invalid) : les contributions de l'auteur sont
-- suspendues 30 jours (ou jusqu'à la fin d'une suspension plus longue déjà en cours) ; rétablir
-- l'élément revoit la suspension prononcée sur lui (collective_suspension_review). Un élément masqué
-- ou supprimé ne rend jamais son identifiant (collective_item_ids), pas plus que les liens supprimés
-- avec lui ; chacun de ces liens signalé ou masqué a sa propre décision (collective_trace). Les
-- signalements en attente sont traités ; l'auteur reçoit un avis (sauf pour « dismiss »), et les
-- membres qui l'avaient signalé aussi.
-- Élément retiré par son auteur alors qu'il avait des signalements en attente (état « withdrawn »
-- de la file) : seuls « delete » (signalements retenus : l'identifiant ne resservira pas, suspension
-- possible, auteur informé) et « dismiss » s'appliquent ; « hide » et « restore » répondent
-- « not-found ».
-- Réponses : « hidden », « restored », « deleted », « dismissed », « unchanged » (déjà dans cet état,
-- ou rien à classer), « own-item » (un modérateur ne décide pas sur ses propres éléments : réponse
-- donnée pour tout identifiant qu'il a utilisé, élément présent ou retiré, signalé ou non, avant de
-- regarder les signalements ; sinon « own-item » ou « not-found » lui dirait si son élément retiré a
-- des signalements en attente), « not-found ». 500 décisions par jour. Les décisions de plus d'un an et les signalements traités de
-- plus d'un an sont effacés ; 100 avis au plus par compte.
-- Erreurs : collective_not_authenticated, collective_forbidden (42501), collective_invalid,
-- collective_rate_limited (P0001).
create function public.moderate_collective_item(p_id text, p_action text, p_reason text, p_suspend boolean)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.collective_moderator();
  v_id text := public.collective_id(p_id);
  v_reason text;
  v_item public.collective_items;
  v_withdrawn boolean := false;
  v_author uuid;
  v_kind text;
  v_title text;
  v_status text;
  v_reports integer;
  v_decision uuid;
  v_until timestamptz;
  v_link public.collective_items;
  v_ref text;
begin
  if p_action is null or octet_length(p_action) > 16 or p_action not in ('hide', 'restore', 'delete', 'dismiss') then
    raise exception 'collective_invalid' using errcode = 'P0001';
  end if;
  if p_suspend is null or (p_suspend and p_action not in ('hide', 'delete')) then
    raise exception 'collective_invalid' using errcode = 'P0001';
  end if;
  v_reason := public.collective_reason(p_reason, 3);
  if v_id is null then
    return 'not-found';
  end if;
  perform public.collective_take(v_uid, 'collective_moderate', 500, interval '1 day');
  perform public.collective_lock();
  select * into v_item from public.collective_items as i where i.id = v_id for update;
  if found then
    v_author := v_item.author_id;
    v_kind := v_item.kind;
    v_title := pg_catalog.left(coalesce(v_item.data ->> 'title', ''), 200);
    v_status := v_item.status;
  else
    -- Identifiant utilisé par le modérateur lui-même : même réponse qu'il y ait ou non des
    -- signalements en attente (un signalement n'est pas révélé à son auteur).
    if exists (select 1 from public.collective_item_ids as u where u.id = v_id and u.author_id = v_uid) then
      return 'own-item';
    end if;
    -- Élément retiré par son auteur : ses signalements en attente, et le dernier contenu signalé.
    select r.item_kind into v_kind
    from public.collective_reports as r
    where r.item_id = v_id and r.status = 'open'
    order by r.created_at desc
    limit 1;
    if not found or p_action not in ('delete', 'dismiss') then
      return 'not-found';
    end if;
    v_withdrawn := true;
    v_status := 'withdrawn';
    select u.author_id into v_author from public.collective_item_ids as u where u.id = v_id;
    v_title := pg_catalog.left(coalesce(
      (
        select c.data ->> 'title' from public.collective_report_copies as c
        where c.item_id = v_id order by c.created_at desc, c.id desc limit 1
      ),
      (
        select d.item_title from public.collective_decisions as d
        where d.item_id = v_id and d.action = 'withdraw' order by d.created_at desc limit 1
      ),
      ''
    ), 200);
  end if;
  if v_author = v_uid then
    return 'own-item';
  end if;
  select count(*)::integer into v_reports from public.collective_reports as r where r.item_id = v_id and r.status = 'open';
  if (p_action = 'hide' and v_status = 'hidden')
    or (p_action = 'restore' and v_status = 'visible')
    or (p_action = 'dismiss' and v_reports = 0) then
    return 'unchanged';
  end if;
  if p_suspend and v_author is not null then
    v_until := greatest(now() + interval '30 days', public.collective_suspended_until(v_author));
  end if;

  insert into public.collective_decisions (
    item_id, item_kind, item_title, author_id, moderator_id, action, reason, reports, suspended_until, author_notified
  )
  values (
    v_id, v_kind, v_title, v_author, v_uid, p_action, v_reason, v_reports, v_until, p_action <> 'dismiss' and v_author is not null
  )
  returning id into v_decision;

  if v_until is not null then
    insert into public.collective_suspensions (user_id, until, decision_id)
    values (v_author, v_until, v_decision)
    on conflict (user_id) do update set until = excluded.until, decision_id = excluded.decision_id, created_at = now();
  elsif p_action = 'restore' then
    -- L'élément rétabli : la suspension prononcée sur lui est revue d'après les autres décisions.
    perform public.collective_suspension_review(v_author, v_id);
  end if;

  -- Avis : aux membres qui avaient signalé l'élément, puis à son auteur (sauf classement).
  insert into public.collective_notices (user_id, decision_id, role)
  select r.reporter_id, v_decision, 'reporter'
  from public.collective_reports as r
  where r.item_id = v_id and r.status = 'open' and r.reporter_id is distinct from v_author
  on conflict on constraint collective_notices_once do nothing;
  if p_action <> 'dismiss' and v_author is not null then
    insert into public.collective_notices (user_id, decision_id, role)
    values (v_author, v_decision, 'author')
    on conflict on constraint collective_notices_once do nothing;
  end if;
  update public.collective_reports as r
  set status = 'resolved', resolved_at = now(), decision_id = v_decision, copy_id = null
  where r.item_id = v_id and r.status = 'open';

  if p_action = 'hide' then
    update public.collective_items as i set status = 'hidden' where i.id = v_id;
  elsif p_action = 'restore' then
    update public.collective_items as i set status = 'visible' where i.id = v_id;
  elsif p_action = 'delete' and not v_withdrawn then
    -- Liens de l'auteur rattachés à l'élément : supprimés avec lui, chacun tracé s'il était signalé
    -- ou masqué, et leurs identifiants marqués.
    v_ref := public.collective_ref_of(v_item.kind, v_id);
    for v_link in
      select * from public.collective_items as i
      where v_ref is not null and i.author_id = v_item.author_id and i.kind = 'link'
        and (i.data ->> 'a' = v_ref or i.data ->> 'b' = v_ref)
      for update
    loop
      perform public.collective_trace(v_link, v_uid, v_reason);
    end loop;
    delete from public.collective_items as i where i.id = v_id;
    perform public.collective_drop_links(v_item.author_id, v_ref);
  end if;
  -- Identifiant d'un élément masqué ou supprimé : jamais repris, même par son auteur.
  if p_action in ('hide', 'delete') then
    update public.collective_item_ids as u set moderated = true where u.id = v_id;
  end if;

  -- Conservation : un an pour le journal et les signalements traités, suspension échue effacée
  -- (collective_purge) ; 100 avis par compte.
  perform public.collective_purge();
  perform public.collective_notices_trim(v_decision);

  return case p_action when 'hide' then 'hidden' when 'restore' then 'restored' when 'delete' then 'deleted' else 'dismissed' end;
end;
$$;

comment on function public.moderate_collective_item(text, text, text, boolean) is
  'Décision de modération sur un élément de la carte collective (masquer, rétablir, supprimer, classer ; suspension de l''auteur), motif au journal ; modérateurs seulement.';

-- Journal des décisions (200 dernières) : action, élément (sorte, titre au moment de la décision),
-- motif, nombre de signalements traités, suspension prononcée, nom affiché du modérateur (null pour un
-- retrait par l'auteur), identifiant public et nom affiché de l'auteur, date. Sans les décisions sur
-- les éléments du modérateur lui-même (un classement ou un retrait y révélerait un signalement que
-- l'auteur ne doit pas connaître). 240 lectures par heure (comptées avec celles de la carte).
-- Erreurs : collective_not_authenticated, collective_forbidden (42501), collective_rate_limited (P0001).
create function public.collective_moderation_log()
returns table (
  id uuid, action text, item_id text, item_kind text, item_title text, reason text, reports integer,
  suspended_until timestamptz, moderator_name text, author_handle text, author_name text, created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.collective_moderator();
begin
  perform public.collective_take(v_uid, 'collective_read', 240, interval '1 hour');
  return query
    select d.id, d.action, d.item_id, d.item_kind, d.item_title, d.reason, d.reports,
      d.suspended_until, m.display_name, a.handle, a.display_name, d.created_at
    from public.collective_decisions as d
    left join public.profiles as m on m.user_id = d.moderator_id
    left join public.profiles as a on a.user_id = d.author_id
    where d.author_id is distinct from v_uid
    order by d.created_at desc, d.id desc
    limit 200;
end;
$$;

comment on function public.collective_moderation_log() is
  'Journal des décisions de modération de la carte collective ; modérateurs seulement.';

-- ---------------------------------------------------------------------------------------------
-- Avis et droit d'accès (le compte connecté, ses propres données).
-- ---------------------------------------------------------------------------------------------

-- Avis de modération du compte connecté (100 au plus, les plus récents d'abord) : rôle, décision,
-- sorte et titre de l'élément, motif, nombre de signalements traités par la décision (avis d'auteur
-- seulement ; 0 : décision prise à l'initiative de la modération ; exposé des motifs, DSA art. 17),
-- suspension de ses contributions (avis d'auteur seulement), l'élément est-il encore masqué (il peut
-- alors le supprimer), dates. Le modérateur n'est jamais nommé.
create function public.my_collective_notices()
returns table (
  id uuid, role text, action text, item_id text, item_kind text, item_title text, reason text,
  reports integer, suspended_until timestamptz, item_hidden boolean, created_at timestamptz, read_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.collective_user();
begin
  return query
    select n.id, n.role, d.action, d.item_id, d.item_kind, d.item_title, d.reason,
      case when n.role = 'author' then d.reports end,
      case when n.role = 'author' then d.suspended_until end,
      n.role = 'author' and exists (
        select 1 from public.collective_items as i
        where i.id = d.item_id and i.author_id = v_uid and i.status = 'hidden'
      ),
      n.created_at, n.read_at
    from public.collective_notices as n
    join public.collective_decisions as d on d.id = n.decision_id
    where n.user_id = v_uid
    order by n.created_at desc, n.id desc
    limit 100;
end;
$$;

comment on function public.my_collective_notices() is
  'Avis de modération du compte connecté (carte collective) ; lecture seule.';

-- Marque comme lus les avis du compte connecté ; renvoie leur nombre.
create function public.mark_collective_notices_read()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.collective_user();
  v_count integer;
begin
  update public.collective_notices as n set read_at = now() where n.user_id = v_uid and n.read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.mark_collective_notices_read() is
  'Marque comme lus les avis de modération du compte connecté.';

-- Éléments masqués du compte connecté (identifiant, sorte, titre, date de dernière modification),
-- pour que la fenêtre « Avis de modération » lui propose de les supprimer sans dépendre des avis :
-- un avis disparaît avec sa décision au bout d'un an (collective_purge) ou au-delà des 100 avis les
-- plus récents du compte (collective_notices_trim), alors que l'élément masqué reste jusqu'à sa
-- suppression. 240 lectures par heure, comptées avec celles de la carte (collective_read).
-- Erreurs : collective_not_authenticated (42501), collective_rate_limited (P0001).
create function public.my_hidden_collective_items()
returns table (id text, kind text, title text, updated_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.collective_user();
begin
  perform public.collective_take(v_uid, 'collective_read', 240, interval '1 hour');
  return query
    select i.id, i.kind, pg_catalog.left(coalesce(i.data ->> 'title', ''), 200), i.updated_at
    from public.collective_items as i
    where i.author_id = v_uid and i.status = 'hidden'
    order by i.updated_at desc, i.id;
end;
$$;

comment on function public.my_hidden_collective_items() is
  'Éléments masqués du compte connecté (carte collective), pour les lui proposer à la suppression ; 240 lectures par heure.';

-- Éléments du compte connecté (masqués compris), pour « Télécharger mes données ».
create function public.my_collective_items()
returns table (id text, kind text, data jsonb, status text, created_at timestamptz, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.collective_user();
begin
  return query
    select i.id, i.kind, i.data, i.status, i.created_at, i.updated_at
    from public.collective_items as i
    where i.author_id = v_uid
    order by i.created_at, i.id;
end;
$$;

comment on function public.my_collective_items() is
  'Éléments de la carte collective ajoutés par le compte connecté (droit d''accès) ; lecture seule.';

-- Signalements faits par le compte connecté, pour « Télécharger mes données ».
create function public.my_collective_reports()
returns table (item_id text, reason text, details text, status text, created_at timestamptz, resolved_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.collective_user();
begin
  return query
    select r.item_id, r.reason, r.details, r.status, r.created_at, r.resolved_at
    from public.collective_reports as r
    where r.reporter_id = v_uid
    order by r.created_at, r.id;
end;
$$;

comment on function public.my_collective_reports() is
  'Signalements faits par le compte connecté dans la carte collective (droit d''accès) ; lecture seule.';

-- Décisions prises par le compte connecté comme modérateur, pour « Télécharger mes données »
-- (aucune ligne pour un autre compte).
create function public.my_moderation_decisions()
returns table (
  id uuid, action text, item_id text, item_kind text, item_title text, reason text, reports integer,
  suspended_until timestamptz, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.collective_user();
begin
  return query
    select d.id, d.action, d.item_id, d.item_kind, d.item_title, d.reason, d.reports, d.suspended_until, d.created_at
    from public.collective_decisions as d
    where d.moderator_id = v_uid
    order by d.created_at, d.id;
end;
$$;

comment on function public.my_moderation_decisions() is
  'Décisions de modération prises par le compte connecté (droit d''accès) ; lecture seule.';

-- Décisions de modération qui visent les éléments du compte connecté, pour « Télécharger mes
-- données », même après l'effacement de leur avis (100 avis par compte) : celles dont il a reçu
-- l'avis (masquer, rétablir, supprimer), et celles qui ne suivent aucun signalement en attente
-- (retrait par lui-même d'un élément masqué, lien masqué supprimé avec l'élément auquel il était
-- rattaché), qu'il connaît déjà. Jamais celles qui révéleraient un signalement (RGPD art. 15.4) :
-- classement, retrait par lui-même d'un élément signalé, lien signalé supprimé avec son élément. Le
-- modérateur n'est jamais nommé.
create function public.my_collective_decisions()
returns table (
  id uuid, action text, item_id text, item_kind text, item_title text, reason text, reports integer,
  suspended_until timestamptz, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.collective_user();
begin
  return query
    select d.id, d.action, d.item_id, d.item_kind, d.item_title, d.reason, d.reports, d.suspended_until, d.created_at
    from public.collective_decisions as d
    where d.author_id = v_uid and (d.author_notified or d.reports = 0)
    order by d.created_at, d.id;
end;
$$;

comment on function public.my_collective_decisions() is
  'Décisions de modération sur les éléments du compte connecté, sauf celles qui révéleraient un signalement (droit d''accès) ; lecture seule.';

-- Situation du compte connecté dans la carte collective, pour « Télécharger mes données » : date de
-- sa désignation comme modérateur (null : il ne l'est pas), suspension de ses contributions (fin et
-- date ; null : aucune, ou échue et déjà effacée). Toujours une ligne.
create function public.my_collective_account()
returns table (moderator_since timestamptz, suspended_until timestamptz, suspended_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.collective_user();
begin
  return query
    select (select m.added_at from public.moderators as m where m.user_id = v_uid), s.until, s.created_at
    from (select 1) as one
    left join public.collective_suspensions as s on s.user_id = v_uid;
end;
$$;

comment on function public.my_collective_account() is
  'Désignation comme modérateur et suspension du compte connecté (droit d''accès) ; lecture seule.';

-- Identifiants d'éléments utilisés par le compte connecté, pour « Télécharger mes données » :
-- identifiant, et s'il est « modéré » (masqué ou supprimé par la modération, ou retiré par le compte
-- alors qu'il était masqué : décisions qu'il connaît ; il ne peut plus resservir).
create function public.my_collective_item_ids()
returns table (item_id text, moderated boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.collective_user();
begin
  return query
    select u.id, u.moderated from public.collective_item_ids as u where u.author_id = v_uid order by u.id;
end;
$$;

comment on function public.my_collective_item_ids() is
  'Identifiants d''éléments de la carte collective utilisés par le compte connecté (droit d''accès) ; lecture seule.';

-- ---------------------------------------------------------------------------------------------
-- Droits : fonctions internes fermées à tous ; fonctions de l'API ouvertes aux comptes connectés.
-- ---------------------------------------------------------------------------------------------

revoke all on function public.collective_text_ok(text, integer, boolean) from public, anon, authenticated;
revoke all on function public.collective_json_text_ok(jsonb, integer, boolean) from public, anon, authenticated;
revoke all on function public.collective_number_ok(jsonb, numeric, numeric) from public, anon, authenticated;
revoke all on function public.collective_lonlat_ok(jsonb) from public, anon, authenticated;
revoke all on function public.collective_path_ok(jsonb, integer) from public, anon, authenticated;
revoke all on function public.collective_keys_ok(jsonb, text[], text[]) from public, anon, authenticated;
revoke all on function public.collective_fiche_ok(jsonb) from public, anon, authenticated;
revoke all on function public.collective_ref_ok(jsonb) from public, anon, authenticated;
revoke all on function public.collective_item_data_ok(text, jsonb) from public, anon, authenticated;
revoke all on function public.collective_path_points(text, jsonb) from public, anon, authenticated;
revoke all on function public.collective_items_before_write() from public, anon, authenticated;
revoke all on function public.collective_items_count() from public, anon, authenticated;
revoke all on function public.collective_report_copies_count() from public, anon, authenticated;
revoke all on function public.collective_reports_release_copy() from public, anon, authenticated;
revoke all on function public.collective_item_ids_author_gone() from public, anon, authenticated;
revoke all on function public.collective_on_profile_change() from public, anon, authenticated;
revoke all on function public.collective_user() from public, anon, authenticated;
revoke all on function public.collective_is_moderator(uuid) from public, anon, authenticated;
revoke all on function public.collective_moderator() from public, anon, authenticated;
revoke all on function public.collective_require_profile(uuid) from public, anon, authenticated;
revoke all on function public.collective_take(uuid, text, integer, interval) from public, anon, authenticated;
revoke all on function public.collective_lock() from public, anon, authenticated;
revoke all on function public.collective_revision() from public, anon, authenticated;
revoke all on function public.collective_id(text) from public, anon, authenticated;
revoke all on function public.collective_parse(text) from public, anon, authenticated;
revoke all on function public.collective_reason(text, integer) from public, anon, authenticated;
revoke all on function public.collective_endpoint_ok(text, uuid) from public, anon, authenticated;
revoke all on function public.collective_ref_of(text, text) from public, anon, authenticated;
revoke all on function public.collective_drop_links(uuid, text) from public, anon, authenticated;
revoke all on function public.collective_room(uuid, boolean, integer, integer) from public, anon, authenticated;
revoke all on function public.collective_id_free(text, uuid) from public, anon, authenticated;
revoke all on function public.collective_suspended_until(uuid) from public, anon, authenticated;
revoke all on function public.collective_notices_trim(uuid) from public, anon, authenticated;
revoke all on function public.collective_trace(public.collective_items, uuid, text) from public, anon, authenticated;
revoke all on function public.collective_suspension_review(uuid, text) from public, anon, authenticated;
revoke all on function public.collective_purge() from public, anon, authenticated;

revoke all on function public.collective_map_state() from public, anon, authenticated;
grant execute on function public.collective_map_state() to authenticated;
revoke all on function public.collective_map() from public, anon, authenticated;
grant execute on function public.collective_map() to authenticated;
revoke all on function public.create_collective_item(text, text, text) from public, anon, authenticated;
grant execute on function public.create_collective_item(text, text, text) to authenticated;
revoke all on function public.update_collective_item(text, text) from public, anon, authenticated;
grant execute on function public.update_collective_item(text, text) to authenticated;
revoke all on function public.delete_collective_item(text) from public, anon, authenticated;
grant execute on function public.delete_collective_item(text) to authenticated;
revoke all on function public.report_collective_item(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.report_collective_item(text, text, text, boolean) to authenticated;
revoke all on function public.block_collective_author(text) from public, anon, authenticated;
grant execute on function public.block_collective_author(text) to authenticated;
revoke all on function public.collective_moderation_queue(integer) from public, anon, authenticated;
grant execute on function public.collective_moderation_queue(integer) to authenticated;
revoke all on function public.moderate_collective_item(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.moderate_collective_item(text, text, text, boolean) to authenticated;
revoke all on function public.collective_moderation_log() from public, anon, authenticated;
grant execute on function public.collective_moderation_log() to authenticated;
revoke all on function public.my_collective_notices() from public, anon, authenticated;
grant execute on function public.my_collective_notices() to authenticated;
revoke all on function public.mark_collective_notices_read() from public, anon, authenticated;
grant execute on function public.mark_collective_notices_read() to authenticated;
revoke all on function public.my_hidden_collective_items() from public, anon, authenticated;
grant execute on function public.my_hidden_collective_items() to authenticated;
revoke all on function public.my_collective_items() from public, anon, authenticated;
grant execute on function public.my_collective_items() to authenticated;
revoke all on function public.my_collective_reports() from public, anon, authenticated;
grant execute on function public.my_collective_reports() to authenticated;
revoke all on function public.my_moderation_decisions() from public, anon, authenticated;
grant execute on function public.my_moderation_decisions() to authenticated;
revoke all on function public.my_collective_decisions() from public, anon, authenticated;
grant execute on function public.my_collective_decisions() to authenticated;
revoke all on function public.my_collective_account() from public, anon, authenticated;
grant execute on function public.my_collective_account() to authenticated;
revoke all on function public.my_collective_item_ids() from public, anon, authenticated;
grant execute on function public.my_collective_item_ids() to authenticated;
