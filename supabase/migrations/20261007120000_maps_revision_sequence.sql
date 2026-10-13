-- Versions des cartes tirées d'une séquence globale (contrôle optimiste sans « ABA »).
-- Avant cette migration, une carte supprimée puis recréée avec le même identifiant repartait à la
-- version 1 : une copie périmée de l'ancienne carte, qui attendait aussi la version 1, pouvait alors
-- écraser la nouvelle. Désormais, chaque contenu écrit reçoit une version jamais attribuée
-- auparavant, à aucune carte : une version attendue ne peut désigner qu'un seul contenu.
-- Migration séparée : les précédentes ont déjà été appliquées, elles ne sont pas modifiées.

create sequence public.maps_revision_seq as bigint;

-- Point de départ au-delà de toute version déjà attribuée, y compris aux cartes supprimées (leurs
-- versions ne sont plus visibles) : chaque carte partait de 1 et gagnait 1 par écriture, une marge
-- de 10^12 écritures par carte ne peut pas être atteinte. Les versions restent des entiers exacts
-- en JavaScript (moins de 2^53).
select setval('public.maps_revision_seq', coalesce((select max(revision) from public.maps), 0) + 1000000000000);

-- Ni les visiteurs ni les utilisateurs n'utilisent la séquence : seul le déclencheur ci-dessous
-- (security definer, propriétaire de la table) en tire des valeurs.
revoke all on sequence public.maps_revision_seq from anon, authenticated, public;

-- La version n'a plus de valeur par défaut fixe : le déclencheur l'attribue à chaque création.
alter table public.maps alter column revision drop default;

create function public.maps_assign_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := nextval('public.maps_revision_seq');
  elsif new.data is distinct from old.data then
    new.revision := nextval('public.maps_revision_seq');
  else
    -- Contenu identique (« Continuer » sur un autre appareil) : même version, pas de faux conflit.
    new.revision := old.revision;
  end if;
  return new;
end;
$$;

create trigger maps_assign_revision
before insert or update of data on public.maps
for each row execute function public.maps_assign_revision();

-- Le déclencheur de date ne tient plus la version (maps_assign_revision s'en charge).
create or replace function public.maps_touch_updated_at()
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

revoke all on function public.maps_assign_revision() from anon, authenticated, public;
revoke all on function public.maps_touch_updated_at() from anon, authenticated, public;
