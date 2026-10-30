-- Limites anti-abus tenues PAR LA BASE (bêta 2.1, socle communautaire).
--
-- Les limites de l'application (src/features/auth/rateLimit.ts) sont en mémoire, par instance du
-- serveur : elles ne voient pas un appel fait directement à l'API de Supabase avec le jeton d'un
-- compte. Les fonctions de la base qui ouvrent une action coûteuse ou sensible (changement
-- d'identifiant ou de nom affiché, recherche d'un profil, envoi et changement d'avatar…) comptent donc elles-mêmes
-- les appels de chaque compte dans cette table.
--
-- Une ligne par (compte, action) : début de la fenêtre en cours et nombre d'appels. Rien d'autre
-- n'est enregistré (ni adresse IP, ni paramètre). La table n'est lisible ni modifiable par personne
-- d'autre que les fonctions SECURITY DEFINER de la base : RLS activé SANS politique, aucun droit.
-- Chaque compte peut seulement relire SES compteurs par public.my_rate_limits() (« Télécharger mes
-- données », droit d'accès). Les lignes d'un compte disparaissent avec lui (on delete cascade).
--
-- Compatible avec l'application déjà en production : nouvelle table et nouvelle fonction interne,
-- rien d'existant ne change.

create table public.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Liste fermée : une fonction ne peut pas créer de compteur arbitraire.
  action text not null constraint rate_limits_action check (
    action in (
      'profile_create', 'profile_handle', 'profile_change', 'handle_attempt', 'profile_lookup', 'avatar_upload', 'avatar_change', 'avatar_read'
    )
  ),
  window_start timestamptz not null,
  hits integer not null constraint rate_limits_hits check (hits >= 1),
  primary key (user_id, action)
);

comment on table public.rate_limits is
  'Compteurs anti-abus par compte et par action (fenêtre glissante), tenus par les fonctions de la base ; aucun accès par l''API.';

alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from public, anon, authenticated;

-- Compte un appel de `p_action` pour `p_user` ; vrai si la limite (`p_limit` appels par fenêtre de
-- `p_window`) n'est pas dépassée. Une fenêtre échue repart à 1. Atomique (insert … on conflict) :
-- deux appels simultanés ne voient jamais le même compte. Un appel refusé est compté aussi (la
-- fonction appelante lève alors une erreur ou répond par un statut, sans rien écrire d'autre).
-- Réservée aux fonctions de la base (EXECUTE retiré à tous) : `p_user` n'est jamais choisi par un client.
create function public.rate_limit_take(p_user uuid, p_action text, p_limit integer, p_window interval)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  if p_user is null then
    return false;
  end if;
  insert into public.rate_limits as r (user_id, action, window_start, hits)
  values (p_user, p_action, now(), 1)
  on conflict (user_id, action) do update
  set
    window_start = case when r.window_start <= now() - p_window then now() else r.window_start end,
    hits = case when r.window_start <= now() - p_window then 1 else least(r.hits, p_limit) + 1 end
  returning r.hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

comment on function public.rate_limit_take(uuid, text, integer, interval) is
  'Compte un appel d''une action pour un compte ; faux au-delà de la limite de la fenêtre. Interne (aucun EXECUTE pour l''API).';

revoke all on function public.rate_limit_take(uuid, text, integer, interval) from public, anon, authenticated;

-- Compteurs du compte connecté, pour « Télécharger mes données » (droit d'accès) : action, début de
-- la fenêtre en cours et nombre d'appels. Rien sur les autres comptes ; lecture seule.
create function public.my_rate_limits()
returns table (action text, window_start timestamptz, hits integer)
language sql
stable
security definer
set search_path = ''
as $$
  select r.action, r.window_start, r.hits
  from public.rate_limits as r
  where r.user_id = (select auth.uid())
  order by r.action
$$;

comment on function public.my_rate_limits() is
  'Compteurs anti-abus du compte connecté (droit d''accès) ; lecture seule.';

revoke all on function public.my_rate_limits() from public, anon, authenticated;
grant execute on function public.my_rate_limits() to authenticated;
