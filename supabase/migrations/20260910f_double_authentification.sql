-- ============================================================
-- 20260910f — DOUBLE AUTHENTIFICATION
--
-- Un compte qui a activé la double authentification n'obtient AUCUN
-- droit tant que sa session n'a pas été confirmée par le code à six
-- chiffres (niveau « aal2 »). Un mot de passe volé, seul, n'ouvre plus
-- rien : ni lecture des tables, ni fonction d'écriture.
--
-- Toutes les politiques RLS et toutes les fonctions protégées passent
-- par `a_permission` : c'est le seul endroit à modifier.
-- Un compte sans double authentification garde ses droits habituels.
-- ============================================================

create or replace function public.a_permission(p_module text, p_action text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1
    from   public.permissions p
    join   public.profils u on u.role = p.role
    where  u.id = auth.uid()
      and  u.actif = true
      and  p.module = p_module
      and  p.action = p_action
  )
  and (
    coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where  f.user_id = auth.uid() and f.status = 'verified'
    )
  );
$function$;
