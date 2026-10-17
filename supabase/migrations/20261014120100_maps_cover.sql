-- Logo ou aperçu des cartes de la banque (DIV-01, bêta 2.1).
--
-- Nouvelle colonne public.maps.cover (jsonb, facultative) et fonction d'écriture bornée
-- public.set_map_cover. Le format est celui de src/features/maps/cover.ts :
--   { "kind": "icon", "icon": "<nom>", "color": "<jeton de la palette ou #rrggbb>" }
--   { "kind": "preview", "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" …>…</svg>" }
-- L'aperçu est affiché par l'application dans un <img> (adresse data:), jamais inséré dans le HTML ;
-- la base refuse en plus tout SVG qui contient un script, un lien ou une référence externe.
--
-- Compatible avec l'application déjà en production : la colonne est facultative (null), aucune
-- fonction existante ne change (create_map et update_map_data gardent leurs signatures), et la
-- production ne lit que les colonnes qu'elle nomme. Comme la colonne data, cover n'est pas
-- modifiable directement (seule la colonne name l'est, 20261008120100_maps_revoke_direct_writes.sql) :
-- elle s'écrit uniquement par set_map_cover. Changer le logo ne change ni la date de mise à jour ni
-- la version du contenu (les déclencheurs ne portent que sur data).
-- À appliquer après 20261014120000_maps_doc_v2.sql (public.maps_color_ok).

-- Au plus 18 000 octets en texte jsonb (16 000 octets envoyés, plus la mise en forme de la base).
-- Bornes volontairement petites (une vignette) : la liste de la banque renvoie le logo de chaque carte
-- (au plus 500 × 16 Ko), et le logo n'entre pas dans le quota de 50 Mo du contenu (data_bytes) : le
-- stockage réel d'un compte est borné par 50 Mo + 500 × 18 Ko, soit environ 59 Mo.
alter table public.maps
  add column cover jsonb
  constraint maps_cover_size check (cover is null or octet_length(cover::text) <= 18000);

comment on column public.maps.cover is
  'Logo (icône + couleur) ou aperçu SVG de la carte, écrit par public.set_map_cover ; null : aucun.';

-- Aperçu SVG : 12 000 octets au plus, début et fin attendus, puis mêmes contrôles que l'application
-- (src/features/maps/cover.ts) : liste blanche des caractères (COVER_SVG_ALLOWED_CHARS : ni `&`, ni
-- `\`, ni `(`, donc aucune entité XML ni échappement CSS pour reconstituer `url(` ou `@import`),
-- liste blanche des balises (COVER_SVG_UNKNOWN_TAG : svg, g, path, rect, circle), et aucun contenu
-- actif ni référence externe (COVER_SVG_FORBIDDEN).
create function public.maps_cover_svg_ok(p_svg text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select octet_length(p_svg) <= 12000
    and starts_with(p_svg, '<svg xmlns="http://www.w3.org/2000/svg"')
    and right(p_svg, 6) = '</svg>'
    and p_svg ~ '^[A-Za-z0-9 <>/=".#:,-]*$'
    and p_svg !~ '<(?!/?(?:svg|g|path|rect|circle)[ />])'
    and p_svg !~* '<script|<foreignobject|<iframe|<embed|<object|href|url\(|@import|javascript:|<!|<\?|\son[a-z]+\s*='
$$;

-- Forme d'un logo ou d'un aperçu : exactement les clés de son type.
create function public.maps_cover_is_valid(p_cover jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_cover) is distinct from 'object' then false
    when jsonb_typeof(p_cover -> 'kind') is distinct from 'string' then false
    when p_cover ->> 'kind' = 'icon' then
      case
        when not (p_cover ?& array['kind', 'icon', 'color']) then false
        when (p_cover - array['kind', 'icon', 'color']) <> '{}'::jsonb then false
        when jsonb_typeof(p_cover -> 'icon') is distinct from 'string' then false
        when (p_cover ->> 'icon') !~ '^[a-z0-9-]{1,32}$' then false
        else public.maps_color_ok(p_cover -> 'color')
      end
    when p_cover ->> 'kind' = 'preview' then
      case
        when not (p_cover ?& array['kind', 'svg']) then false
        when (p_cover - array['kind', 'svg']) <> '{}'::jsonb then false
        when jsonb_typeof(p_cover -> 'svg') is distinct from 'string' then false
        else public.maps_cover_svg_ok(p_cover ->> 'svg')
      end
    else false
  end
$$;

-- Remplace (ou retire, avec null) le logo d'une carte de l'utilisateur connecté. Le contenu est reçu
-- en TEXTE : taille vérifiée avant toute conversion (16 000 octets, MAX_COVER_BYTES de
-- l'application), puis absence de tout nombre (un logo n'en contient pas : rien à convertir en
-- numeric, même pas un exposant démesuré), puis conversion en jsonb et forme.
-- Renvoie true si la carte a été modifiée, false si elle n'existe pas (ou appartient à un autre compte).
-- Erreurs : maps_not_authenticated (42501), maps_too_large, maps_invalid (P0001) ; JSON mal formé : 22P02.
create function public.set_map_cover(p_id uuid, p_cover text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_cover jsonb;
begin
  if v_uid is null then
    raise exception 'maps_not_authenticated' using errcode = '42501';
  end if;
  if p_cover is not null then
    if octet_length(p_cover) > 16000 then
      raise exception 'maps_too_large' using errcode = 'P0001';
    end if;
    -- Hors des chaînes (retirées d'abord), aucun chiffre : aucun nombre.
    if pg_catalog.regexp_replace(p_cover, '"(?:[^\x22\x5c]|\x5c.)*"', '', 'g') ~ '[0-9]' then
      raise exception 'maps_invalid' using errcode = 'P0001';
    end if;
    v_cover := p_cover::jsonb;
    if not public.maps_cover_is_valid(v_cover) then
      raise exception 'maps_invalid' using errcode = 'P0001';
    end if;
  end if;
  update public.maps as m
  set cover = v_cover
  where m.id = p_id and m.user_id = v_uid;
  return found;
end;
$$;

comment on function public.set_map_cover(uuid, text) is
  'Remplace ou retire (null) le logo ou l''aperçu d''une carte de l''utilisateur connecté (16 000 octets au plus).';

-- Droits : seuls les utilisateurs connectés appellent la fonction d'écriture ; les contrôles internes
-- ne sont appelables par personne d'autre que le propriétaire.
revoke all on function public.set_map_cover(uuid, text) from public, anon, authenticated;
grant execute on function public.set_map_cover(uuid, text) to authenticated;
revoke all on function public.maps_cover_svg_ok(text) from public, anon, authenticated;
revoke all on function public.maps_cover_is_valid(jsonb) from public, anon, authenticated;
