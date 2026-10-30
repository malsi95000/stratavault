-- Profils des comptes (DIV-03, bêta 2.1, socle communautaire).
--
-- Une ligne par compte qui a créé son profil depuis la page « Mon profil » (/profil) : aucun profil
-- n'est créé sans que la personne le demande. Champs : identifiant public choisi (`handle`), nom
-- affiché, courte présentation, avatar facultatif (fichier dans le compartiment privé « avatars » de
-- Supabase Storage, 20261017120200_avatars.sql) et visibilité :
--   - « members » : visible par tous les comptes connectés ;
--   - « contacts » : visible par les contacts du compte. Les contacts n'existent pas encore : d'ici
--     là, un profil « contacts » n'est visible que par son titulaire. La règle tient dans une seule
--     fonction, public.profiles_visible_to, que la migration des contacts remplacera.
--
-- Accès :
--   - table : RLS activé ; chaque compte lit et supprime SA ligne seulement (auth.uid() = user_id).
--     Il n'existe aucune lecture directe des profils des autres : sinon n'importe quel compte
--     pourrait lister tous les membres (GET /rest/v1/profiles).
--   - profil d'un autre compte : uniquement par la fonction public.profile_by_handle(handle), qui ne
--     renvoie qu'un profil, désigné par son identifiant EXACT, et seulement s'il est visible pour le
--     compte qui demande (même réponse vide pour un identifiant inconnu ou un profil masqué). Aucune
--     recherche par adresse e-mail (anti-énumération), aucune liste.
--   - écritures : AUCUNE écriture directe (ni INSERT ni UPDATE pour l'API). Création et modification
--     par public.create_my_profile et public.update_my_profile, qui comptent chaque essai
--     d'identifiant AVANT de savoir s'il est pris et répondent « pris » sans lever d'erreur : le
--     compteur reste écrit. Sinon, l'erreur d'unicité (qui annule tout, compteur compris) dirait
--     gratuitement et sans limite si un identifiant existe, même celui d'un profil masqué.
--     avatar_id s'écrit par public.set_profile_avatar (20261017120200_avatars.sql) ; dates tenues
--     par un déclencheur.
--
-- Contrôles de la base (les mêmes que l'application, src/features/profiles/) :
--   - handle : 3 à 30 caractères, minuscules, chiffres et « _ », commence et finit par une lettre ou
--     un chiffre, au moins une lettre ; enregistré en minuscules (la casse saisie est ramenée en
--     minuscules). Forme « repliée » (public.profiles_handle_fold) : 0 → o, 1 et l → i, 3 → e, 4 → a,
--     5 → s, 7 → t, 8 → b, « _ » retiré, puis rn → m et vv → w. Unique SOUS CETTE FORME : « Alice »,
--     « alice », « a1ice », « al_ice » et « aiice » sont le même identifiant (un membre ne peut pas en
--     imiter un autre de façon presque invisible). Identifiants réservés refusés, comparés sous forme
--     repliée : la liste exacte, et tout identifiant qui CONTIENT un mot réservé (admin, moderat,
--     stratavault, officiel, official, support) ; « adm1n », « adrnin », « la_moderation » ou
--     « equipe_stratavault » sont donc refusés ;
--   - nom affiché : 1 à 50 caractères, sans espace (Unicode) au début ni à la fin, ne commence pas par
--     une marque combinante, sans caractère de contrôle ni caractère invisible ou de remplissage
--     (inversion du sens de lecture, espace sans chasse, remplissage hangûl, braille vide, sélecteurs
--     de variante, caractères « étiquette », tous les points de code « ignorables par défaut »
--     d'Unicode…) qui permettrait un nom vide ou trompeur ; aucun mot du nom (décomposition de
--     compatibilité NFKD, minuscules, lettres cyrilliques, grecques ou en petites capitales
--     d'apparence latine ramenées à cette lettre, accents et signes retirés, forme repliée) ne
--     contient admin, moderat, stratavault, officiel ni official, et le nom entier sans ses espaces
--     ne contient pas stratavault : « Équipe Stratavault — Modération », un « Admin » en lettres
--     mathématiques ou avec un А cyrillique, et « Strata Vault » sont refusés ;
--   - présentation : 280 caractères au plus, 6 lignes au plus, mêmes caractères refusés (sauf le retour
--     à la ligne).
-- Limites anti-abus (public.rate_limits) : 30 essais d'identifiant par jour (création ou changement,
-- comptés qu'ils réussissent ou non), 5 créations de profil et 5 changements d'identifiant réussis par
-- jour et par compte, 50 changements de nom affiché par jour et par compte (un enregistrement qui ne
-- change pas le nom ne compte pas), 300 consultations de profil par heure et par compte.
--
-- Suppression : le profil est supprimé avec le compte (on delete cascade). L'avatar, lui, est un
-- fichier de Supabase Storage : l'application le supprime par l'API Storage avant de supprimer le
-- profil ou le compte (src/features/account/actions.ts, src/features/profiles/actions.ts).
--
-- Compatible avec l'application déjà en production (v2.0) et avec l'étape 1 de la bêta 2.1 : nouvelle
-- table et nouvelles fonctions seulement. delete_my_account() est remplacée plus loin, par
-- 20261017120300_delete_my_account_avatars.sql (même signature) : elle efface le jeton d'envoi et le
-- profil, puis le compte, et refuse tant qu'un fichier du compte reste dans le compartiment
-- « avatars ».
-- À appliquer après 20261017120000_rate_limits.sql (public.rate_limit_take).

-- Format d'un identifiant (déjà en minuscules). La longueur est vérifiée avant l'expression régulière.
create function public.profiles_handle_format_ok(p_handle text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_handle is not null
    and octet_length(p_handle) between 3 and 30
    and p_handle ~ '^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$'
    and p_handle ~ '[a-z]'
$$;

-- Forme « repliée » d'un identifiant, pour le comparer aux mots réservés et aux autres identifiants
-- malgré les substitutions courantes : 0 → o, 1 et l → i, 3 → e, 4 → a, 5 → s, 7 → t, 8 → b ; « _ »
-- retiré ; puis rn → m et vv → w. Même règle que foldHandle (src/features/profiles/handle.ts),
-- vérifiée par les tests. IMMUTABLE : sert aussi à l'index unique profiles_handle_fold_key.
create function public.profiles_handle_fold(p_handle text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select pg_catalog.replace(
    pg_catalog.replace(pg_catalog.translate(p_handle, '01l34578_', 'oiieastb'), 'rn', 'm'),
    'vv',
    'w'
  )
$$;

-- Identifiants réservés : noms du service, de ses pages et de ses rôles (pour qu'aucun compte ne se
-- fasse passer pour l'équipe), comparés sous forme repliée ; et tout identifiant qui contient un mot
-- réservé. Mêmes listes que RESERVED_HANDLES et RESERVED_HANDLE_WORDS (src/features/profiles/handle.ts),
-- vérifiées par les tests.
create function public.profiles_handle_reserved(p_handle text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select exists (
      select 1
      from pg_catalog.unnest(array[
        'abuse', 'aide', 'anonyme', 'anonymous', 'api', 'auth', 'avatars', 'bot', 'carte', 'cartes',
        'cnil', 'collectif', 'collective', 'communaute', 'community', 'compte', 'comptes', 'conditions',
        'confidentialite', 'connexion', 'contact', 'contacts', 'cookies', 'demo', 'equipe', 'espace',
        'everyone', 'help', 'historique', 'hostmaster', 'info', 'infos', 'inscription', 'invite', 'legal',
        'mail', 'member', 'members', 'membre', 'membres', 'mentions_legales', 'moi', 'modo', 'modos',
        'noreply', 'no_reply', 'nous', 'null', 'partage', 'postmaster', 'profil', 'profile', 'profils',
        'robot', 'root', 'securite', 'security', 'signalement', 'signalements', 'staff', 'system',
        'systeme', 'team', 'tous', 'undefined', 'webmaster', 'www'
      ]) as w (word)
      where public.profiles_handle_fold(w.word) = public.profiles_handle_fold(p_handle)
    )
    or exists (
      select 1
      from pg_catalog.unnest(array[
        'admin', 'moderat', 'stratavault', 'officiel', 'official', 'support'
      ]) as w (word)
      where pg_catalog.strpos(public.profiles_handle_fold(p_handle), public.profiles_handle_fold(w.word)) > 0
    )
$$;

-- Caractères refusés dans un nom affiché et dans une présentation : invisibles, de mise en forme ou
-- de remplissage (trait d'union conditionnel, joignant de graphèmes, marques de sens de lecture,
-- remplissages hangûl, voyelles inhérentes khmères, sélecteurs mongols, espaces sans chasse,
-- séparateurs de ligne, inversions du sens de lecture, opérateurs invisibles, braille vide,
-- sélecteurs de variante, indicateur d'ordre des octets, annotations interlinéaires et leurs
-- réserves, remplissage khitan, contrôles de format sténographiques, mise en forme musicale,
-- caractères « étiquette » et toute la plage E0000-E0FFF). Couvre toute la propriété Unicode
-- Default_Ignorable_Code_Point. Même liste que FORMAT_CHARS (src/features/profiles/text.ts).
create function public.profiles_has_format_chars(p_text text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_text ~ '[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u2028-\u202e\u2060-\u206f\u2800\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff0-\ufffb\U00016fe4\U0001bca0-\U0001bca3\U0001d173-\U0001d17a\U000e0000-\U000e0fff]'
$$;

-- Forme comparable d'un nom affiché, pour la recherche des mots réservés : décomposition de
-- compatibilité (NFKD : lettres stylisées ou pleine chasse ramenées aux lettres simples, accents
-- séparés), majuscules ASCII en minuscules, lettres d'autres alphabets qui ressemblent à une lettre
-- latine ramenées à cette lettre (confusables courants : cyrillique, grec, petites capitales et
-- quelques lettres latines ; toutes inchangées par NFKD), puis tout sauf a-z, 0-9 et les espaces
-- retiré (accents, ponctuation : « Strata-vault » donne « stratavault »). Même table que
-- DISPLAY_NAME_CONFUSABLES et même règle que displayNameComparable (src/features/profiles/text.ts),
-- vérifiées par les tests.
create function public.profiles_display_name_comparable(p_name text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select pg_catalog.regexp_replace(
    pg_catalog.translate(
      pg_catalog.normalize(p_name, 'NFKD'),
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        -- Cyrillique, majuscules : А В Е К М Н О Р С Т У Х Ѕ І Ј Ӏ Ү Һ Ԁ Ԛ Ԝ
        || U&'\0410\0412\0415\041a\041c\041d\041e\0420\0421\0422\0423\0425\0405\0406\0408\04c0\04ae\04ba\0500\051a\051c'
        -- Cyrillique, minuscules : а в г е к м н о п р с т у х ѕ і ј ӏ ү һ ԁ ԛ ԝ
        || U&'\0430\0432\0433\0435\043a\043c\043d\043e\043f\0440\0441\0442\0443\0445\0455\0456\0458\04cf\04af\04bb\0501\051b\051d'
        -- Grec, majuscules : Α Β Ε Ζ Η Ι Κ Μ Ν Ο Ρ Τ Υ Χ
        || U&'\0391\0392\0395\0396\0397\0399\039a\039c\039d\039f\03a1\03a4\03a5\03a7'
        -- Grec, minuscules : α ε η ι κ ν ο ρ τ υ χ ω ϳ
        || U&'\03b1\03b5\03b7\03b9\03ba\03bd\03bf\03c1\03c4\03c5\03c7\03c9\03f3'
        -- Latin : ı ȷ ɑ ɡ ɩ, petites capitales ᴀ ʙ ᴄ ᴅ ᴇ ɢ ʜ ɪ ᴊ ᴋ ʟ ᴍ ɴ ᴏ ᴘ ʀ ꜱ ᴛ ᴜ ᴠ ᴡ ʏ ᴢ
        || U&'\0131\0237\0251\0261\0269\1d00\0299\1d04\1d05\1d07\0262\029c\026a\1d0a\1d0b\029f\1d0d\0274\1d0f\1d18\0280\a731\1d1b\1d1c\1d20\1d21\028f\1d22',
      'abcdefghijklmnopqrstuvwxyz'
        || 'abekmhopctyxsijlyhdqw'
        || 'abrekmhonpctyxsijlyhdqw'
        || 'abezhikmnoptyx'
        || 'aenikvoptuxwj'
        || 'ijagiabcdeghijklmnoprstuvwyz'
    ),
    '[^a-z0-9 \u1680]',
    '',
    'g'
  )
$$;

-- Nom affiché qui laisse croire à un compte de l'équipe : un de ses mots CONTIENT un mot réservé
-- (admin, moderat, stratavault, officiel, official ; « support » est trop courant dans un nom), ou
-- le nom entier, sans ses espaces, contient « stratavault » (« Strata Vault »). Les autres mots ne
-- sont cherchés que mot par mot : sinon « Conrad Mint » contiendrait « admin ». Mots comparés sous
-- la forme de profiles_display_name_comparable, découpée aux espaces, puis sous la forme repliée
-- des identifiants. Même règle que isReservedDisplayName (src/features/profiles/text.ts), vérifiée
-- par les tests. Appelée avec une entrée déjà bornée (profiles_display_name_ok, fonctions d'écriture).
create function public.profiles_display_name_reserved(p_name text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  with c as (select public.profiles_display_name_comparable(p_name) as name)
  select exists (
      select 1
      from c
        cross join pg_catalog.regexp_split_to_table(c.name, '[ \u1680]+') as t (token)
        cross join pg_catalog.unnest(array['admin', 'moderat', 'stratavault', 'officiel', 'official']) as w (word)
      where pg_catalog.strpos(public.profiles_handle_fold(t.token), public.profiles_handle_fold(w.word)) > 0
    )
    or exists (
      select 1
      from c
      where pg_catalog.strpos(
          public.profiles_handle_fold(pg_catalog.regexp_replace(c.name, '[ \u1680]+', '', 'g')),
          public.profiles_handle_fold('stratavault')
        ) > 0
    )
$$;

-- Nom affiché : voir l'en-tête. Les espaces de bord refusés sont ceux que retire trim() en JavaScript
-- (l'application enregistre le nom « trimé ») ; les marques combinantes refusées au début sont
-- celles des blocs principaux (src/features/profiles/text.ts, LEADING_COMBINING).
create function public.profiles_display_name_ok(p_name text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_name is not null
    and octet_length(p_name) <= 400
    and char_length(p_name) between 1 and 50
    and p_name !~ '^[ \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]'
    and p_name !~ '[ \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]$'
    and p_name !~ '^[\u0300-\u036f\u0483-\u0489\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]'
    and p_name !~ '[\x01-\x1f\x7f-\x9f]'
    and not public.profiles_has_format_chars(p_name)
    and not public.profiles_display_name_reserved(p_name)
$$;

create function public.profiles_bio_ok(p_bio text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_bio is not null
    and octet_length(p_bio) <= 2400
    and char_length(p_bio) <= 280
    and p_bio = pg_catalog.btrim(p_bio, E' \n')
    and char_length(p_bio) - char_length(pg_catalog.replace(p_bio, E'\n', '')) <= 5
    and p_bio !~ '[\x01-\x09\x0b-\x1f\x7f-\x9f]'
    and not public.profiles_has_format_chars(p_bio)
$$;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  handle text not null
    constraint profiles_handle_format check (public.profiles_handle_format_ok(handle))
    constraint profiles_handle_reserved check (not public.profiles_handle_reserved(handle)),
  display_name text not null constraint profiles_display_name check (public.profiles_display_name_ok(display_name)),
  bio text not null default '' constraint profiles_bio check (public.profiles_bio_ok(bio)),
  -- Fichier de l'avatar : storage.objects « avatars/<avatar_id> », envoyé par ce compte ; null : aucun avatar.
  avatar_id uuid constraint profiles_avatar_id_key unique,
  visibility text not null default 'members' constraint profiles_visibility check (visibility in ('members', 'contacts')),
  handle_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Identifiant unique : enregistré en minuscules (contrainte de format), donc unique sans tenir compte de la casse.
create unique index profiles_handle_key on public.profiles (handle);
-- Et unique sous sa forme repliée : « a1ice », « al_ice » ou « aiice » ne peuvent pas imiter « alice ».
-- Les écritures passant toutes par les fonctions SECURITY DEFINER, l'index est évalué avec les droits
-- de leur propriétaire (la fonction de pli n'est ouverte à personne).
create unique index profiles_handle_fold_key on public.profiles (public.profiles_handle_fold(handle));

comment on table public.profiles is
  'Profils des comptes (identifiant public, nom affiché, présentation, avatar, visibilité) ; chaque compte ne lit directement que le sien.';

-- Avant chaque écriture : identifiant ramené en minuscules, dates tenues par la base, avatar jamais
-- fixé à la création, limites anti-abus des écritures réussies (une écriture refusée est annulée,
-- compteur compris). SECURITY DEFINER pour écrire dans public.rate_limits, qui n'est ouverte à
-- personne ; n'est appelée que par le déclencheur.
create function public.profiles_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Taille bornée avant toute transformation (la contrainte de format refuse de toute façon au-delà de 30).
  if octet_length(new.handle) <= 120 then
    new.handle := pg_catalog.lower(new.handle);
  end if;
  if tg_op = 'INSERT' then
    if new.user_id is null then
      raise exception 'profiles_not_authenticated' using errcode = '42501';
    end if;
    if not public.rate_limit_take(new.user_id, 'profile_create', 5, interval '1 day') then
      raise exception 'profiles_rate_limited' using errcode = 'P0001';
    end if;
    new.avatar_id := null;
    new.created_at := now();
    new.handle_changed_at := now();
  else
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    if new.handle is distinct from old.handle then
      if not public.rate_limit_take(old.user_id, 'profile_handle', 5, interval '1 day') then
        raise exception 'profiles_rate_limited' using errcode = 'P0001';
      end if;
      new.handle_changed_at := now();
    else
      new.handle_changed_at := old.handle_changed_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_before_write
before insert or update on public.profiles
for each row execute function public.profiles_before_write();

-- Sécurité au niveau des lignes : chaque compte ne lit et ne supprime directement que sa ligne.
-- Aucune politique d'écriture : les écritures passent par les fonctions ci-dessous.
alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "profiles_delete_own" on public.profiles
for delete to authenticated
using ((select auth.uid()) = user_id);

-- Droits : rien pour les visiteurs anonymes ; les comptes connectés lisent et suppriment leur ligne.
revoke all on table public.profiles from public, anon, authenticated;
grant select, delete on table public.profiles to authenticated;

-- Entrées d'une écriture bornées en texte avant toute transformation (les contraintes de la table
-- décident ensuite du contenu).
create function public.profiles_inputs_bounded(p_handle text, p_display_name text, p_bio text, p_visibility text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_handle is not null and octet_length(p_handle) <= 120
    and p_display_name is not null and octet_length(p_display_name) <= 400
    and p_bio is not null and octet_length(p_bio) <= 2400
    and p_visibility is not null and octet_length(p_visibility) <= 16
$$;

-- Crée le profil du compte connecté. Renvoie « created », ou « handle-taken » si l'identifiant est
-- déjà pris ou a la même forme repliée qu'un identifiant pris (réponse sans erreur : l'essai reste
-- compté). Erreurs : profiles_not_authenticated
-- (42501), profiles_invalid, profiles_exists, profiles_rate_limited (P0001), contraintes de la table
-- (23514 : format, identifiant réservé, nom, présentation, visibilité ; vérifiées avant l'unicité,
-- elles ne disent rien de l'existence d'un identifiant).
create function public.create_my_profile(p_handle text, p_display_name text, p_bio text, p_visibility text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_constraint text;
begin
  if v_uid is null then
    raise exception 'profiles_not_authenticated' using errcode = '42501';
  end if;
  if not public.profiles_inputs_bounded(p_handle, p_display_name, p_bio, p_visibility) then
    raise exception 'profiles_invalid' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles as p where p.user_id = v_uid) then
    raise exception 'profiles_exists' using errcode = 'P0001';
  end if;
  -- Essai compté AVANT de savoir si l'identifiant est pris.
  if not public.rate_limit_take(v_uid, 'handle_attempt', 30, interval '1 day') then
    raise exception 'profiles_rate_limited' using errcode = 'P0001';
  end if;
  begin
    insert into public.profiles (user_id, handle, display_name, bio, visibility)
    values (v_uid, p_handle, p_display_name, p_bio, p_visibility);
  exception
    when unique_violation then
      -- Seule l'insertion (et le compteur de créations du déclencheur) est annulée ; l'essai reste compté.
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('profiles_handle_key', 'profiles_handle_fold_key') then
        return 'handle-taken';
      end if;
      raise exception 'profiles_exists' using errcode = 'P0001';
  end;
  return 'created';
end;
$$;

comment on function public.create_my_profile(text, text, text, text) is
  'Crée le profil du compte connecté ; « created » ou « handle-taken » (essai compté).';

-- Modifie le profil du compte connecté (les quatre champs du formulaire). Renvoie « saved »,
-- « handle-taken » (identifiant pris, ou de même forme repliée qu'un identifiant pris : rien n'est
-- modifié ; l'essai reste compté), ou « rate-limited » (plus de 50 changements de nom affiché en un
-- jour : rien n'est modifié ; un statut et non une erreur, pour que le refus reste compté). Garder son
-- identifiant ne compte pas comme un essai ; garder son nom affiché ne compte pas comme un changement
-- de nom. Chaque changement de nom d'un auteur fait changer la version de la carte collective
-- (20261020120000_collective_map.sql) : sans cette limite, des appels directs la feraient changer sans
-- fin et obligeraient chaque membre à relire la carte. Erreurs : profiles_not_authenticated (42501), profiles_invalid, profiles_not_found,
-- profiles_rate_limited (P0001), contraintes de la table (23514).
create function public.update_my_profile(p_handle text, p_display_name text, p_bio text, p_visibility text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_current text;
  v_name text;
begin
  if v_uid is null then
    raise exception 'profiles_not_authenticated' using errcode = '42501';
  end if;
  if not public.profiles_inputs_bounded(p_handle, p_display_name, p_bio, p_visibility) then
    raise exception 'profiles_invalid' using errcode = 'P0001';
  end if;
  select p.handle, p.display_name into v_current, v_name
  from public.profiles as p
  where p.user_id = v_uid
  for update;
  if not found then
    raise exception 'profiles_not_found' using errcode = 'P0001';
  end if;
  if pg_catalog.lower(p_handle) <> v_current
    and not public.rate_limit_take(v_uid, 'handle_attempt', 30, interval '1 day') then
    raise exception 'profiles_rate_limited' using errcode = 'P0001';
  end if;
  begin
    -- Dans ce bloc : un identifiant pris annule aussi ce compteur (le nom n'a pas changé).
    if p_display_name <> v_name
      and not public.rate_limit_take(v_uid, 'profile_change', 50, interval '1 day') then
      return 'rate-limited';
    end if;
    update public.profiles as p
    set handle = p_handle, display_name = p_display_name, bio = p_bio, visibility = p_visibility
    where p.user_id = v_uid;
  exception
    when unique_violation then
      return 'handle-taken';
  end;
  return 'saved';
end;
$$;

comment on function public.update_my_profile(text, text, text, text) is
  'Modifie le profil du compte connecté ; « saved », « handle-taken » (essai compté) ou « rate-limited » (50 changements de nom affiché par jour).';

-- Règle de visibilité d'un profil pour le compte `p_viewer` (unique source de la règle).
-- Contacts pas encore en place : un profil « contacts » n'est visible que par son titulaire.
create function public.profiles_visible_to(p_owner uuid, p_visibility text, p_viewer uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_viewer is not null and (p_owner = p_viewer or p_visibility = 'members')
$$;

-- Profil désigné par son identifiant EXACT (casse ignorée), s'il est visible pour le compte connecté.
-- Identifiant inconnu, mal formé ou profil masqué : aucune ligne (réponse identique). L'entrée est
-- bornée en texte avant toute transformation. 300 consultations par heure et par compte au plus
-- (profiles_rate_limited) : deviner des identifiants en masse reste lent.
-- SECURITY DEFINER : la table n'est pas lisible directement pour les autres comptes ; la fonction
-- applique elle-même la règle de visibilité et ne renvoie que les champs publics (jamais user_id).
create function public.profile_by_handle(p_handle text)
returns table (handle text, display_name text, bio text, avatar_id uuid, is_self boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_handle text;
begin
  if v_uid is null then
    raise exception 'profiles_not_authenticated' using errcode = '42501';
  end if;
  if p_handle is null or octet_length(p_handle) > 60 then
    return;
  end if;
  v_handle := pg_catalog.lower(pg_catalog.btrim(p_handle));
  if not public.profiles_handle_format_ok(v_handle) then
    return;
  end if;
  if not public.rate_limit_take(v_uid, 'profile_lookup', 300, interval '1 hour') then
    raise exception 'profiles_rate_limited' using errcode = 'P0001';
  end if;
  return query
  select p.handle, p.display_name, p.bio, p.avatar_id, p.user_id = v_uid
  from public.profiles as p
  where p.handle = v_handle
    and public.profiles_visible_to(p.user_id, p.visibility, v_uid);
end;
$$;

comment on function public.profile_by_handle(text) is
  'Profil public (handle, nom affiché, présentation, avatar) désigné par son identifiant exact, s''il est visible pour le compte connecté.';

-- Droits des fonctions : la recherche par identifiant, la création et la modification de son profil
-- sont appelables par les comptes connectés. Tout le reste est interne : les contraintes de la table
-- ne s'évaluent plus que dans les fonctions SECURITY DEFINER (aucune écriture directe), avec les
-- droits de leur propriétaire.
revoke all on function public.profile_by_handle(text) from public, anon, authenticated;
grant execute on function public.profile_by_handle(text) to authenticated;
revoke all on function public.create_my_profile(text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_my_profile(text, text, text, text) to authenticated;
revoke all on function public.update_my_profile(text, text, text, text) from public, anon, authenticated;
grant execute on function public.update_my_profile(text, text, text, text) to authenticated;
revoke all on function public.profiles_before_write() from public, anon, authenticated;
revoke all on function public.profiles_visible_to(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.profiles_inputs_bounded(text, text, text, text) from public, anon, authenticated;
revoke all on function public.profiles_handle_format_ok(text) from public, anon, authenticated;
revoke all on function public.profiles_handle_fold(text) from public, anon, authenticated;
revoke all on function public.profiles_handle_reserved(text) from public, anon, authenticated;
revoke all on function public.profiles_has_format_chars(text) from public, anon, authenticated;
revoke all on function public.profiles_display_name_ok(text) from public, anon, authenticated;
revoke all on function public.profiles_display_name_comparable(text) from public, anon, authenticated;
revoke all on function public.profiles_display_name_reserved(text) from public, anon, authenticated;
revoke all on function public.profiles_bio_ok(text) from public, anon, authenticated;
