-- Cartes stratégiques des comptes Stratavault.
-- Chaque utilisateur ne voit et ne modifie que ses propres cartes : RLS activé, une politique par
-- opération, et droits limités aux colonnes que l'application écrit. Les Server Actions vérifient
-- aussi l'utilisateur et valident chaque carte avant de l'écrire (défense en profondeur).

create table public.maps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null constraint maps_name_length check (char_length(name) between 1 and 120),
  -- Document de carte (format d'export de la bêta). Borne large : l'application refuse déjà
  -- toute carte de plus de 4 Mo en JSON compact ; le texte jsonb ajoute des espaces.
  data jsonb not null constraint maps_data_size check (octet_length(data::text) <= 8000000),
  -- Nombre d'éléments de la carte (pays annotés, liens, balises, zones, textes), tenu par un
  -- déclencheur : la liste des cartes ne lit jamais leur contenu. null si le contenu n'a pas la forme
  -- d'une carte.
  stats jsonb,
  -- Taille du contenu (octets du texte jsonb), tenue par le déclencheur du quota.
  data_bytes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.maps is 'Cartes stratégiques Stratavault, une ligne par carte, visibles par leur seul propriétaire.';

-- Liste des cartes d'un utilisateur, de la plus récemment modifiée à la plus ancienne.
create index maps_user_id_updated_at_idx on public.maps (user_id, updated_at desc);

-- Date de mise à jour tenue par la base (le client ne peut pas la choisir).
create function public.maps_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Seule une écriture du contenu change la date : renommer une carte ne la fait pas remonter dans la
-- liste (comme dans la bêta et le mode démo).
create trigger maps_touch_updated_at
before update of data on public.maps
for each row execute function public.maps_touch_updated_at();

-- Statistiques recalculées à chaque écriture du contenu.
create function public.maps_compute_stats()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(new.data) = 'object'
    and jsonb_typeof(new.data -> 'notes') = 'object'
    and jsonb_typeof(new.data -> 'links') = 'array'
    and jsonb_typeof(new.data -> 'pings') = 'array'
    and jsonb_typeof(new.data -> 'zones') = 'array'
    and jsonb_typeof(new.data -> 'texts') = 'array' then
    new.stats := jsonb_build_object(
      'notes', (select count(*) from jsonb_object_keys(new.data -> 'notes')),
      'links', jsonb_array_length(new.data -> 'links'),
      'pings', jsonb_array_length(new.data -> 'pings'),
      'zones', jsonb_array_length(new.data -> 'zones'),
      'texts', jsonb_array_length(new.data -> 'texts')
    );
  else
    new.stats := null;
  end if;
  return new;
end;
$$;

create trigger maps_compute_stats
before insert or update of data on public.maps
for each row execute function public.maps_compute_stats();

-- Espace borné par compte (abus de stockage) : au plus 500 cartes et 50 Mo de contenu au total
-- (texte jsonb). Le volume de chaque carte est tenu dans data_bytes par ce même déclencheur, pour
-- que le total se calcule sans relire le contenu des autres cartes.
create function public.maps_enforce_quota()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Les écritures d'un même compte passent une à une : sinon, des écritures simultanées verraient
  -- toutes le même total et dépasseraient la limite.
  perform pg_advisory_xact_lock(hashtext('public.maps:' || new.user_id::text));
  new.data_bytes := octet_length(new.data::text);
  if tg_op = 'INSERT' and (select count(*) from public.maps where user_id = new.user_id) >= 500 then
    raise exception 'maps_quota_exceeded' using errcode = 'P0001';
  end if;
  -- Une modification qui n'agrandit pas la carte reste toujours permise (pour pouvoir alléger).
  if (tg_op = 'INSERT' or new.data_bytes > old.data_bytes) and new.data_bytes + (
    select coalesce(sum(data_bytes), 0) from public.maps where user_id = new.user_id and id <> new.id
  ) > 50000000 then
    raise exception 'maps_quota_exceeded' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger maps_enforce_quota
before insert or update of data on public.maps
for each row execute function public.maps_enforce_quota();

-- Sécurité au niveau des lignes : sans politique, aucun accès.
alter table public.maps enable row level security;

create policy "maps_select_own" on public.maps
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "maps_insert_own" on public.maps
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "maps_update_own" on public.maps
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "maps_delete_own" on public.maps
for delete to authenticated
using ((select auth.uid()) = user_id);

-- Droits : rien pour les visiteurs anonymes ; les utilisateurs connectés n'écrivent que l'id
-- (à la création), le nom et le contenu. user_id, stats, data_bytes et les dates restent aux
-- valeurs par défaut et aux déclencheurs.
revoke all on table public.maps from anon, authenticated, public;
grant select, delete on table public.maps to authenticated;
grant insert (id, name, data) on table public.maps to authenticated;
grant update (name, data) on table public.maps to authenticated;

revoke all on function public.maps_touch_updated_at() from anon, authenticated, public;
revoke all on function public.maps_enforce_quota() from anon, authenticated, public;
revoke all on function public.maps_compute_stats() from anon, authenticated, public;
