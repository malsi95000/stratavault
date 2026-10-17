-- Format de carte v2 (bêta 2.1) : la base accepte les nouvelles clés facultatives d'une carte
-- (fiches supplémentaires, catégories, styles) et la palette étoffée des flux, tout en acceptant
-- toujours le format v1 (exactement les neuf clés d'avant).
--
-- Remplace public.maps_doc_is_valid (20261008120000_maps_write_functions.sql, qui n'est pas
-- modifiée) : même signature, donc public.maps_parse_doc, create_map et update_map_data l'utilisent
-- sans changement. Les contrôles restent aussi stricts : clés connues seulement, types, nombres
-- d'éléments bornés, couleurs dans la liste connue. Pour les ajouts v2, la base vérifie en plus les
-- identifiants, les couleurs et la longueur des textes (la relecture par l'application, parseMapDoc,
-- vérifie le reste : existence des éléments et des catégories visés).
--
-- Compatible avec l'application déjà en production (format v1, dix couleurs) : à appliquer AVANT le
-- déploiement de la bêta 2.1, qui écrit des cartes v2.
--
-- Bornes : celles de l'application (src/features/map-doc/limits.ts et types.ts).

-- ---------------------------------------------------------------------------------------------
-- Couleurs et petits contrôles de valeurs (fonctions internes, appelées par maps_doc_is_valid).
-- ---------------------------------------------------------------------------------------------

-- Couleurs de flux, jetons de la palette (FLUX_COLOR_IDS de src/features/map-doc/palette.ts) : les
-- dix de la bêta, puis celles de la bêta 2.1.
create function public.maps_flux_colors()
returns text[]
language sql
immutable
security invoker
set search_path = ''
as $$
  select array[
    'jaune', 'orange', 'violet', 'bleu-fonce', 'bleu-clair', 'rouge', 'marron', 'gris-clair', 'vert', 'vert-fonce',
    'magenta', 'lavande', 'indigo', 'bleu', 'cyan', 'turquoise', 'menthe', 'olive', 'citron', 'corail', 'bordeaux',
    'sable'
  ]::text[]
$$;

-- Couleur d'un élément, d'une fiche ou d'une catégorie : jeton de la palette ou « #rrggbb » en
-- minuscules (forme écrite par l'application).
create function public.maps_color_ok(p_value jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_value) is distinct from 'string' then false
    else (p_value #>> '{}') = any (public.maps_flux_colors()) or (p_value #>> '{}') ~ '^#[0-9a-f]{6}$'
  end
$$;

-- Identifiant d'élément, de fiche ou de catégorie (ID_PATTERN de l'application).
create function public.maps_id_ok(p_value jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_value) is distinct from 'string' then false
    else (p_value #>> '{}') ~ '^[A-Za-z0-9_-]{1,64}$'
  end
$$;

-- Texte d'au plus `p_max` caractères.
create function public.maps_text_ok(p_value jsonb, p_max integer)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_value) is distinct from 'string' then false
    else char_length(p_value #>> '{}') <= p_max
  end
$$;

-- Clé d'un élément qui porte des fiches ou un style : "c:FRA", "l:<id>", "p:<id>", "o:<id>",
-- "z:<id>", "t:<id>".
create function public.maps_element_key_ok(p_key text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_key ~ '^[clpozt]:[A-Za-z0-9_-]{1,64}$'
$$;

-- ---------------------------------------------------------------------------------------------
-- Ajouts du format v2.
-- ---------------------------------------------------------------------------------------------

-- Catégories : au plus 50, chacune exactement { id, label (1 à 60 caractères), color }.
create function public.maps_categories_ok(p_list jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_list) is distinct from 'array' then false
    when jsonb_array_length(p_list) > 50 then false
    else not exists (
      select 1
      from jsonb_array_elements(p_list) as e (item)
      where case
        when jsonb_typeof(e.item) <> 'object' then true
        when not (e.item ?& array['id', 'label', 'color']) then true
        when (e.item - array['id', 'label', 'color']) <> '{}'::jsonb then true
        when not public.maps_id_ok(e.item -> 'id') then true
        when not public.maps_text_ok(e.item -> 'label', 60) then true
        when char_length(e.item ->> 'label') < 1 then true
        else not public.maps_color_ok(e.item -> 'color')
      end
    )
  end
$$;

-- Style d'un élément : { color?, category? }, jamais vide.
create function public.maps_style_ok(p_style jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_style) is distinct from 'object' then false
    when p_style = '{}'::jsonb then false
    when (p_style - array['color', 'category']) <> '{}'::jsonb then false
    when p_style ? 'color' and not public.maps_color_ok(p_style -> 'color') then false
    when p_style ? 'category' and not public.maps_id_ok(p_style -> 'category') then false
    else true
  end
$$;

-- Styles : au plus 20 000 éléments (MAX_STYLES), clés d'éléments, valeurs maps_style_ok.
create function public.maps_styles_ok(p_styles jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_styles) is distinct from 'object' then false
    when (select count(*) from jsonb_object_keys(p_styles)) > 20000 then false
    else not exists (
      select 1
      from jsonb_each(p_styles) as e
      where not public.maps_element_key_ok(e.key) or not public.maps_style_ok(e.value)
    )
  end
$$;

-- Fiche supplémentaire : { id, title, note, date?, color?, category? } (titre 200 caractères, notes
-- 100 000, date 32, comme les fiches du format v1 dans l'application).
create function public.maps_fiche_ok(p_fiche jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_fiche) is distinct from 'object' then false
    when not (p_fiche ?& array['id', 'title', 'note']) then false
    when (p_fiche - array['id', 'title', 'note', 'date', 'color', 'category']) <> '{}'::jsonb then false
    when not public.maps_id_ok(p_fiche -> 'id') then false
    when not public.maps_text_ok(p_fiche -> 'title', 200) then false
    when not public.maps_text_ok(p_fiche -> 'note', 100000) then false
    when p_fiche ? 'date' and not public.maps_text_ok(p_fiche -> 'date', 32) then false
    when p_fiche ? 'color' and not public.maps_color_ok(p_fiche -> 'color') then false
    when p_fiche ? 'category' and not public.maps_id_ok(p_fiche -> 'category') then false
    else true
  end
$$;

-- Fiches supplémentaires : par élément, une liste de 1 à 50 fiches (MAX_FICHES_PER_ELEMENT) ;
-- 5 000 fiches au plus dans toute la carte (MAX_TOTAL_FICHES). Les nombres sont vérifiés avant de
-- parcourir les fiches une à une.
create function public.maps_fiches_ok(p_fiches jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(p_fiches) is distinct from 'object' then
    return false;
  end if;
  if (select count(*) from jsonb_object_keys(p_fiches)) > 5000 then
    return false;
  end if;
  if exists (
    select 1
    from jsonb_each(p_fiches) as e
    where case
      when not public.maps_element_key_ok(e.key) then true
      when jsonb_typeof(e.value) <> 'array' then true
      else jsonb_array_length(e.value) not between 1 and 50
    end
  ) then
    return false;
  end if;
  if (select sum(jsonb_array_length(e.value)) from jsonb_each(p_fiches) as e) > 5000 then
    return false;
  end if;
  return not exists (
    select 1
    from jsonb_each(p_fiches) as e, jsonb_array_elements(e.value) as f (item)
    where not public.maps_fiche_ok(f.item)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Forme d'une carte, v1 ou v2.
-- ---------------------------------------------------------------------------------------------
create or replace function public.maps_doc_is_valid(p_doc jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_colors constant text[] := public.maps_flux_colors();
  v_strokes jsonb := '[]'::jsonb;
  v_list jsonb;
  v_items bigint;
  v_points bigint;
begin
  -- Un objet avec les neuf clés du format v1, et au plus les trois clés facultatives du format v2.
  if jsonb_typeof(p_doc) is distinct from 'object' then
    return false;
  end if;
  if not (p_doc ?& array['notes', 'dates', 'links', 'pings', 'points', 'zones', 'texts', 'flux', 'fluxFiches']) then
    return false;
  end if;
  if exists (
    select 1
    from jsonb_object_keys(p_doc) as k (key)
    where k.key <> all (array[
      'notes', 'dates', 'links', 'pings', 'points', 'zones', 'texts', 'flux', 'fluxFiches',
      'fiches', 'categories', 'styles'
    ])
  ) then
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
  if not public.maps_object_ok(p_doc -> 'flux', v_colors, 'array', cardinality(v_colors))
    or not public.maps_object_ok(p_doc -> 'fluxFiches', v_colors, 'object', cardinality(v_colors)) then
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

  -- Ajouts du format v2, facultatifs (absents d'une carte v1).
  if p_doc ? 'categories' and not public.maps_categories_ok(p_doc -> 'categories') then
    return false;
  end if;
  if p_doc ? 'styles' and not public.maps_styles_ok(p_doc -> 'styles') then
    return false;
  end if;
  if p_doc ? 'fiches' and not public.maps_fiches_ok(p_doc -> 'fiches') then
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

-- Les contrôles internes ne sont appelables par personne d'autre que le propriétaire (via
-- create_map et update_map_data). « create or replace » garde les droits de maps_doc_is_valid :
-- retirés de nouveau par précaution.
revoke all on function public.maps_flux_colors() from public, anon, authenticated;
revoke all on function public.maps_color_ok(jsonb) from public, anon, authenticated;
revoke all on function public.maps_id_ok(jsonb) from public, anon, authenticated;
revoke all on function public.maps_text_ok(jsonb, integer) from public, anon, authenticated;
revoke all on function public.maps_element_key_ok(text) from public, anon, authenticated;
revoke all on function public.maps_categories_ok(jsonb) from public, anon, authenticated;
revoke all on function public.maps_style_ok(jsonb) from public, anon, authenticated;
revoke all on function public.maps_styles_ok(jsonb) from public, anon, authenticated;
revoke all on function public.maps_fiche_ok(jsonb) from public, anon, authenticated;
revoke all on function public.maps_fiches_ok(jsonb) from public, anon, authenticated;
revoke all on function public.maps_doc_is_valid(jsonb) from public, anon, authenticated;
