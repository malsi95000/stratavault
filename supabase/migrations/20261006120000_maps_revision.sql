-- Version du contenu des cartes (contrôle optimiste entre appareils).
-- Chaque envoi de l'application porte la version dont il dérive ; la base ne l'applique que si la
-- carte en est toujours à cette version (`update … where revision = …`). Une écriture fondée sur une
-- version périmée (autre appareil) est ainsi refusée au lieu d'écraser la carte.
-- Migration séparée de 20261005120000_maps.sql : un projet qui a déjà appliqué celle-ci reçoit la
-- colonne en appliquant seulement ce fichier.

-- Les cartes existantes partent de la version 1.
alter table public.maps add column revision bigint not null default 1;

-- Le déclencheur de date tient aussi la version : le client ne peut pas la choisir (aucun droit
-- d'écriture sur la colonne, voir les « grant » de la migration précédente, limités à id, name, data).
create or replace function public.maps_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  -- Un envoi au contenu identique (« Continuer » sur un autre appareil) fait remonter la carte sans
  -- changer sa version : les autres appareils qui l'ont ouverte ne reçoivent pas de faux conflit.
  if new.data is distinct from old.data then
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$$;

revoke all on function public.maps_touch_updated_at() from anon, authenticated, public;
