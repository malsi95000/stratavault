-- Écriture du contenu des cartes par deux fonctions bornées (appelées en RPC), au lieu d'INSERT et
-- d'UPDATE directs sur public.maps.
--
-- Pourquoi : un compte connecté pouvait envoyer directement à l'API de données (PostgREST, avec son
-- jeton et la clé publishable) un contenu JSON de 8 Mo très fragmenté (des millions d'éléments) :
-- plus de 100 secondes de traitement et une API du projet brièvement indisponible. L'application,
-- elle, borne chaque carte (parseMapDoc : 4 Mo, 50 000 éléments), mais pas l'accès direct.
--
-- Ces fonctions reçoivent le contenu en TEXTE et refusent tout ce qui dépasse la limite de
-- l'application AVANT de le convertir en jsonb (seule étape coûteuse), puis contrôlent sa forme à
-- moindre coût (objet, clés attendues, longueurs des listes bornées comme dans l'application).
--
-- Déploiement en deux temps, sans coupure :
--   1. ce fichier (ajoute les fonctions ; les écritures directes restent permises : l'ancienne
--      version de l'application continue de fonctionner) ;
--   2. déploiement de l'application qui appelle ces fonctions ;
--   3. 20261008120100_maps_revoke_direct_writes.sql (retire les écritures directes du contenu).
-- Les migrations précédentes, déjà appliquées, ne sont pas modifiées.

-- ---------------------------------------------------------------------------------------------
-- Contrôles de forme (fonctions internes : personne d'autre que les deux fonctions d'écriture ne
-- les appelle). Elles ne vérifient pas tout le détail d'une carte (titres, coordonnées…) : la
-- relecture par l'application (parseMapDoc) s'en charge. Elles bornent ce qui coûte : le nombre de
-- nœuds à parcourir et la taille du texte que la base produira ensuite.
-- ---------------------------------------------------------------------------------------------

-- Liste d'éléments (liens, balises, points, zones, textes, traits de flux) : un tableau d'au plus
-- 20 000 objets (MAX_ITEMS de l'application) dont les clés sont parmi `p_keys`. Si `ll` en fait
-- partie, c'est une paire [longitude, latitude].
create function public.maps_list_ok(p_list jsonb, p_keys text[])
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_list) is distinct from 'array' then false
    when jsonb_array_length(p_list) > 20000 then false
    else not exists (
      select 1
      from jsonb_array_elements(p_list) as e (item)
      where case
        when jsonb_typeof(e.item) <> 'object' then true
        when (e.item - p_keys) <> '{}'::jsonb then true
        when 'll' = any (p_keys) then
          case
            when jsonb_typeof(e.item -> 'll') = 'array' then jsonb_array_length(e.item -> 'll') <> 2
            else true
          end
        else false
      end
    )
  end
$$;

-- Nombre de sommets des tracés d'une liste déjà vérifiée (anneaux des zones, traits de flux) ;
-- null si un tracé n'est pas un tableau.
create function public.maps_path_points(p_list jsonb, p_key text)
returns bigint
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when bool_and(jsonb_typeof(e.item -> p_key) = 'array') is false then null
    else coalesce(sum(case when jsonb_typeof(e.item -> p_key) = 'array' then jsonb_array_length(e.item -> p_key) end), 0)
  end
  from jsonb_array_elements(p_list) as e (item)
$$;

-- Objet dont les clés sont parmi `p_allowed` (null : toutes) et dont chaque valeur est du type
-- `p_value_type` (jsonb_typeof). Au plus `p_max_keys` clés.
create function public.maps_object_ok(p_object jsonb, p_allowed text[], p_value_type text, p_max_keys integer)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_object) is distinct from 'object' then false
    else (
      select count(*) <= p_max_keys
        and coalesce(bool_and(jsonb_typeof(e.value) = p_value_type), true)
        and coalesce(bool_and(p_allowed is null or e.key = any (p_allowed)), true)
      from jsonb_each(p_object) as e
    )
  end
$$;

-- Forme d'une carte (format produit par parseMapDoc), avec les plafonds de l'application
-- (src/features/map-doc/types.ts) : 20 000 éléments par collection, 20 000 traits de flux,
-- 50 000 éléments en tout, 200 000 sommets de zones et de flux.
create function public.maps_doc_is_valid(p_doc jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  -- Couleurs de flux (FLUX_COLOR_IDS de l'application).
  v_colors constant text[] := array[
    'jaune', 'orange', 'violet', 'bleu-fonce', 'bleu-clair', 'rouge', 'marron', 'gris-clair', 'vert', 'vert-fonce'
  ];
  v_strokes jsonb := '[]'::jsonb;
  v_list jsonb;
  v_items bigint;
  v_points bigint;
begin
  -- Un objet avec exactement les neuf clés d'une carte.
  if jsonb_typeof(p_doc) is distinct from 'object' then
    return false;
  end if;
  if not (p_doc ?& array['notes', 'dates', 'links', 'pings', 'points', 'zones', 'texts', 'flux', 'fluxFiches']) then
    return false;
  end if;
  if (select count(*) from jsonb_object_keys(p_doc)) <> 9 then
    return false;
  end if;

  -- Notes et dates des pays : du texte, une entrée par pays au plus (moins de 400 pays).
  if not public.maps_object_ok(p_doc -> 'notes', null, 'string', 400)
    or not public.maps_object_ok(p_doc -> 'dates', null, 'string', 400) then
    return false;
  end if;

  -- Collections d'éléments, avec leurs seules clés connues.
  if not public.maps_list_ok(p_doc -> 'links', array['id', 'a', 'b', 'title', 'note', 'date'])
    or not public.maps_list_ok(p_doc -> 'pings', array['id', 'll', 'type', 'title', 'note', 'date'])
    or not public.maps_list_ok(p_doc -> 'points', array['id', 'll', 'title', 'note', 'date'])
    or not public.maps_list_ok(p_doc -> 'zones', array['id', 'ring', 'title', 'note', 'date'])
    or not public.maps_list_ok(p_doc -> 'texts', array['id', 'll', 'title', 'note', 'date', 'size']) then
    return false;
  end if;

  -- Flux : une liste de traits par couleur connue ; fiches : un objet par couleur connue.
  if not public.maps_object_ok(p_doc -> 'flux', v_colors, 'array', 10)
    or not public.maps_object_ok(p_doc -> 'fluxFiches', v_colors, 'object', 10) then
    return false;
  end if;
  for v_list in select e.value from jsonb_each(p_doc -> 'flux') as e loop
    if not public.maps_list_ok(v_list, array['id', 'points', 'width', 'opacity']) then
      return false;
    end if;
    v_strokes := v_strokes || v_list;
  end loop;
  if exists (
    select 1 from jsonb_each(p_doc -> 'fluxFiches') as e
    where not public.maps_object_ok(e.value, array['title', 'note', 'date'], 'string', 3)
  ) then
    return false;
  end if;

  -- Plafonds de toute la carte.
  if jsonb_array_length(v_strokes) > 20000 then
    return false;
  end if;
  v_items := jsonb_array_length(p_doc -> 'links') + jsonb_array_length(p_doc -> 'pings')
    + jsonb_array_length(p_doc -> 'points') + jsonb_array_length(p_doc -> 'zones')
    + jsonb_array_length(p_doc -> 'texts') + jsonb_array_length(v_strokes);
  if v_items > 50000 then
    return false;
  end if;
  v_points := public.maps_path_points(p_doc -> 'zones', 'ring') + public.maps_path_points(v_strokes, 'points');
  return v_points is not null and v_points <= 200000;
end;
$$;

-- Lit le contenu envoyé en texte : taille vérifiée d'abord (4 Mo, MAX_MAP_BYTES de l'application,
-- en octets du JSON compact), puis absence de nombres à exposant, puis conversion en jsonb et forme.
-- Erreurs : maps_too_large, maps_invalid (P0001) ; JSON mal formé : 22P02.
create function public.maps_parse_doc(p_data text)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_doc jsonb;
begin
  if p_data is null then
    raise exception 'maps_invalid' using errcode = 'P0001';
  end if;
  if octet_length(p_data) > 4000000 then
    raise exception 'maps_too_large' using errcode = 'P0001';
  end if;
  -- Un nombre écrit avec un exposant (1e131071 : 8 caractères) s'écrirait en toutes lettres dans la
  -- base (131 072 chiffres) : quelques Mo de texte deviendraient des Go. L'application n'en envoie
  -- jamais (nombres bornés et arrondis au millionième). Hors des chaînes (retirées d'abord), un
  -- chiffre suivi de « e » ne peut être qu'un exposant ; le premier test évite ce travail le plus
  -- souvent.
  if p_data ~ '[0-9][eE]' then
    if pg_catalog.regexp_replace(p_data, '"(?:[^\x22\x5c]|\x5c.)*"', '', 'g') ~ '[0-9][eE]' then
      raise exception 'maps_invalid' using errcode = 'P0001';
    end if;
  end if;
  v_doc := p_data::jsonb;
  if not public.maps_doc_is_valid(v_doc) then
    raise exception 'maps_invalid' using errcode = 'P0001';
  end if;
  return v_doc;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Fonctions d'écriture appelées par l'application (RPC). SECURITY DEFINER : elles écrivent avec les
-- droits du propriétaire de la table, que l'utilisateur n'a plus (migration suivante), et ne sont
-- donc PAS soumises à RLS : chacune vérifie elle-même auth.uid() et filtre sur user_id.
-- Les déclencheurs de la table (date, version, statistiques, quota) s'appliquent comme avant.
-- ---------------------------------------------------------------------------------------------

-- Crée une carte pour l'utilisateur connecté. L'identifiant est tiré par la base.
create function public.create_map(p_name text, p_data text)
returns table (id uuid, name text, updated_at timestamptz, revision bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_doc jsonb;
begin
  if v_uid is null then
    raise exception 'maps_not_authenticated' using errcode = '42501';
  end if;
  if p_name is null or char_length(p_name) not between 1 and 120 then
    raise exception 'maps_invalid' using errcode = 'P0001';
  end if;
  v_doc := public.maps_parse_doc(p_data);
  return query
    insert into public.maps as m (user_id, name, data)
    values (v_uid, p_name, v_doc)
    returning m.id, m.name, m.updated_at, m.revision;
end;
$$;

-- Remplace le contenu d'une carte de l'utilisateur connecté, seulement si elle en est encore à la
-- version `p_expected_revision` (contrôle optimiste entre appareils). Aucune ligne : la carte
-- n'existe pas (ou appartient à un autre compte). Version différente : erreur maps_conflict.
create function public.update_map_data(p_id uuid, p_data text, p_expected_revision bigint)
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
  v_doc jsonb;
begin
  if v_uid is null then
    raise exception 'maps_not_authenticated' using errcode = '42501';
  end if;
  -- Contrôles qui ne coûtent rien d'abord ; le contenu n'est lu que pour une écriture possible.
  if p_data is not null and octet_length(p_data) > 4000000 then
    raise exception 'maps_too_large' using errcode = 'P0001';
  end if;
  select m.revision into v_revision from public.maps as m where m.id = p_id and m.user_id = v_uid;
  if not found then
    return;
  end if;
  -- Il n'existe pas d'écriture sans version attendue.
  if p_expected_revision is null or v_revision <> p_expected_revision then
    raise exception 'maps_conflict' using errcode = 'P0001';
  end if;
  v_doc := public.maps_parse_doc(p_data);
  return query
    update public.maps as m
    set data = v_doc
    where m.id = p_id and m.user_id = v_uid and m.revision = p_expected_revision
    returning m.id, m.name, m.updated_at, m.revision;
  -- Modifiée (ou supprimée) entre la lecture et l'écriture : rien n'est écrasé.
  if not found then
    raise exception 'maps_conflict' using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.create_map(text, text) is
  'Crée une carte de l''utilisateur connecté (contenu JSON en texte, 4 Mo au plus).';
comment on function public.update_map_data(uuid, text, bigint) is
  'Remplace le contenu d''une carte de l''utilisateur connecté si elle est à la version attendue.';

-- Droits : seuls les utilisateurs connectés appellent les deux fonctions d'écriture (Supabase
-- accorde par défaut EXECUTE à anon et à public sur les nouvelles fonctions : retiré ici).
revoke all on function public.create_map(text, text) from public, anon, authenticated;
revoke all on function public.update_map_data(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.create_map(text, text) to authenticated;
grant execute on function public.update_map_data(uuid, text, bigint) to authenticated;

-- Les contrôles internes ne sont appelables par personne d'autre (seulement par le propriétaire,
-- via les deux fonctions ci-dessus).
revoke all on function public.maps_list_ok(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.maps_path_points(jsonb, text) from public, anon, authenticated;
revoke all on function public.maps_object_ok(jsonb, text[], text, integer) from public, anon, authenticated;
revoke all on function public.maps_doc_is_valid(jsonb) from public, anon, authenticated;
revoke all on function public.maps_parse_doc(text) from public, anon, authenticated;
