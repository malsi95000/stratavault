-- Suppression du compte et avatars (DIV-03, bêta 2.1) : public.delete_my_account() refuse de
-- supprimer un compte qui a encore un fichier dans le compartiment « avatars ».
--
-- Un fichier de Storage ne peut pas être supprimé par SQL (seule l'API Storage efface le fichier
-- lui-même) : l'application supprime donc les avatars par l'API Storage AVANT d'appeler cette
-- fonction (src/features/account/actions.ts, removeAllAvatars). Sans vérification dans la base, le
-- fichier survivrait au compte, sans plus personne pour le lire ni le supprimer par l'API (RGPD,
-- article 17), quand :
--   - la fonction est appelée directement (/rest/v1/rpc/delete_my_account, avec le jeton d'une
--     session ouverte par mot de passe il y a moins de 5 minutes), sans passer par l'application ;
--   - un autre onglet envoie un avatar entre la suppression des fichiers et l'appel de la fonction.
-- La fonction refuse donc l'appel (account_avatars_remain, P0001 ; rien n'est supprimé) tant qu'il
-- reste un fichier du compte (storage.objects.owner_id) dans le compartiment. L'application traite
-- ce refus comme un échec de la suppression ; un nouvel essai efface d'abord les fichiers restants.
--
-- Avant de supprimer le compte, la fonction efface aussi le jeton d'envoi d'avatar du compte et son
-- profil (ce que la cascade ferait de toute façon) : aucun fichier ne peut plus être écrit pour ce
-- compte, pas même par une adresse d'envoi signée obtenue avant (le déclencheur de storage.objects,
-- public.avatars_guard_write de 20261017120200_avatars.sql, exige à l'écriture réelle un profil et
-- un jeton en cours, qu'il consomme). Un envoi concurrent se range derrière la suppression du jeton
-- (verrou sur sa ligne) : s'il l'a consommé le premier, la fonction attend la fin de son écriture,
-- puis voit le fichier lors de la vérification, qui vient APRÈS la suppression (chaque instruction
-- voit ce qui est validé avant elle), et refuse ; sinon, il ne trouve plus de jeton et il est
-- refusé.
--
-- Tout le reste est inchangé (voir 20261009120000_delete_my_account.sql) : aucun argument, compte
-- du jeton seulement (auth.uid()), session du jeton toujours ouverte, mot de passe saisi il y a
-- moins de 5 minutes, SECURITY DEFINER avec un search_path vide et des noms qualifiés, réservée aux
-- comptes connectés.
--
-- Compatible avec l'application déjà en production (v2.0) et avec l'étape 1 de la bêta 2.1 : même
-- nom, même signature, même résultat. Leurs comptes n'ont aucun avatar (le compartiment est
-- nouveau) ; un compte qui en aurait envoyé un directement par l'API Storage voit sa suppression
-- refusée par ces versions (message d'échec générique), ce qui est le comportement voulu.
-- À appliquer après 20261017120200_avatars.sql.

create or replace function public.delete_my_account()
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
  v_deleted boolean;
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

  -- Plus aucun envoi d'avatar possible pour ce compte (jeton et profil effacés).
  delete from public.avatar_upload_tickets as t where t.user_id = v_uid;
  delete from public.profiles as p where p.user_id = v_uid;

  delete from auth.users as u where u.id = v_uid;
  v_deleted := found;

  -- Un fichier du compte reste dans le compartiment : tout est annulé (voir l'en-tête).
  if exists (
    select 1
    from storage.objects as o
    where o.bucket_id = 'avatars'
      and o.owner_id = v_uid::text
  ) then
    raise exception 'account_avatars_remain' using errcode = 'P0001';
  end if;

  return v_deleted;
end;
$$;

comment on function public.delete_my_account() is
  'Supprime le compte de l''utilisateur connecté (auth.uid()) et, en cascade, son profil, ses cartes et ses sessions. Exige un jeton d''une session ouverte par mot de passe il y a moins de 5 minutes ; refusée tant qu''il reste un fichier du compte dans le compartiment « avatars ».';

-- Droits inchangés (CREATE OR REPLACE les conserve) ; rappelés ici pour qu'aucun écart ne subsiste.
revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
