-- Suppression de son propre compte (RGPD, article 17), depuis la page « Mon compte » (/compte).
--
-- La Server Action deleteMyAccount (src/features/account/actions.ts) vérifie d'abord la session
-- (getUser), le compte attendu par la page et la confirmation « SUPPRIMER », puis ouvre une session
-- TEMPORAIRE avec l'adresse et le mot de passe (client Supabase sans cookies) et appelle cette
-- fonction en RPC avec le jeton de cette session toute neuve. La fonction ne prend AUCUN argument :
-- elle ne peut supprimer que le compte du jeton (auth.uid()), jamais celui d'un autre.
--
-- Le mot de passe est exigé PAR LA BASE, pas seulement par l'application : un jeton d'accès copié
-- (cookie de session volé) ne suffit pas à appeler /rest/v1/rpc/delete_my_account directement.
-- La fonction refuse l'appel si :
--   - le jeton n'a pas d'utilisateur (auth.uid() nul) ;
--   - la session du jeton (claim session_id) n'existe plus dans auth.sessions : session fermée par
--     « Se déconnecter » ou révoquée, même si le jeton n'a pas encore expiré ;
--   - le jeton ne porte pas d'authentification par mot de passe (claim amr, méthode « password »)
--     datant de moins de 5 minutes. Supabase Auth date cette entrée de la saisie du mot de passe, et
--     la conserve telle quelle quand la session est rafraîchie : une session ouverte depuis plus de
--     5 minutes ne suffit donc pas, il faut ressaisir le mot de passe.
-- Limite qui reste : dans les 5 minutes qui suivent une connexion par mot de passe, une copie du
-- jeton de CETTE session permet l'appel direct.
--
-- SECURITY DEFINER : un utilisateur connecté n'a aucun droit sur auth.users ni auth.sessions ; la
-- fonction s'exécute avec les droits de son propriétaire (le rôle qui applique la migration,
-- `postgres` sur Supabase). search_path vide et noms qualifiés : aucune fonction ni table d'un autre
-- schéma ne peut s'y substituer.
--
-- Supprimer la ligne de auth.users supprime en cascade (clés étrangères « on delete cascade ») :
-- les cartes (public.maps.user_id), et dans le schéma auth de Supabase les identités, les sessions
-- et leurs jetons de rafraîchissement, les facteurs MFA et les jetons à usage unique.
--
-- Renvoie true si le compte a été supprimé.

create function public.delete_my_account()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_claims jsonb := auth.jwt();
  v_amr jsonb := v_claims -> 'amr';
begin
  if v_uid is null then
    raise exception 'account_not_authenticated' using errcode = '42501';
  end if;

  -- Session du jeton toujours ouverte (comparaison en texte : un claim mal formé ne lève pas d'erreur).
  if not exists (
    select 1
    from auth.sessions as s
    where s.user_id = v_uid
      and s.id::text = v_claims ->> 'session_id'
  ) then
    raise exception 'account_session_ended' using errcode = '42501';
  end if;

  -- Mot de passe saisi il y a moins de 5 minutes.
  if jsonb_typeof(v_amr) is distinct from 'array' or not exists (
    select 1
    from jsonb_array_elements(v_amr) as e(item)
    where jsonb_typeof(e.item) = 'object'
      and e.item ->> 'method' = 'password'
      and jsonb_typeof(e.item -> 'timestamp') = 'number'
      and to_timestamp((e.item ->> 'timestamp')::double precision) >= now() - interval '5 minutes'
  ) then
    raise exception 'account_reauthentication_required' using errcode = '28000';
  end if;

  delete from auth.users where id = v_uid;
  return found;
end;
$$;

comment on function public.delete_my_account() is
  'Supprime le compte de l''utilisateur connecté (auth.uid()) et, en cascade, ses cartes et ses sessions. Exige un jeton d''une session ouverte par mot de passe il y a moins de 5 minutes.';

-- Réservée aux utilisateurs connectés (les droits par défaut de Supabase l'ouvriraient à anon).
revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
