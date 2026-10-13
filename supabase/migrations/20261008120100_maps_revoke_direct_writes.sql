-- Plus d'écriture directe du contenu des cartes par l'API de données.
-- La création et la modification du contenu passent par public.create_map et
-- public.update_map_data (20261008120000_maps_write_functions.sql), qui bornent la taille AVANT
-- toute conversion en jsonb. Un INSERT ou un UPDATE direct de `data` (POST ou PATCH sur
-- /rest/v1/maps) est désormais refusé (permission denied), quelle que soit sa taille.
--
-- À appliquer APRÈS le déploiement de l'application qui appelle ces fonctions : l'ancienne version
-- écrit directement dans la table et verrait ses enregistrements refusés.

-- Retrait au niveau de la table et des colonnes (la migration initiale accordait insert (id, name, data)).
revoke insert on table public.maps from authenticated;
revoke insert (id, name, data) on table public.maps from authenticated;
revoke update (data) on table public.maps from authenticated;

-- Restent aux utilisateurs connectés, sous RLS : lire et supprimer leurs cartes, et les renommer
-- (colonne name, 1 à 120 caractères : contrainte maps_name_length).
grant select, delete on table public.maps to authenticated;
grant update (name) on table public.maps to authenticated;
