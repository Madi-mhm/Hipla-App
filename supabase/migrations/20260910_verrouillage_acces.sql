-- ============================================================
-- 20260910 — VERROUILLAGE DES ACCÈS
--
-- Constat du 10/09/2026, vérifié avec la seule clé publique (anon),
-- sans connexion :
--   · lecture du grand livre (lignes_fec), du tableau de bord, de la
--     TVA, des comptes courants, de l'IBAN, de six vues ;
--   · exécution de fonctions d'écriture (annuler_piece…) : leur garde
--     `if auth.uid() is not null and not a_permission(...)` est sautée
--     quand auth.uid() est nul, ce qui est le cas d'un visiteur anonyme ;
--   · inscription publique ouverte, rôle choisi par l'inscrit.
--
-- Ce script ne touche à AUCUNE donnée. Il retire des droits et
-- remplace une fonction de déclenchement. Il est rejouable.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. FONCTIONS : aucun appel anonyme
--
-- Après ce bloc, auth.uid() n'est plus nul que pour service_role
-- (cron, sauvegarde) et l'éditeur SQL : la garde existante redevient
-- correcte sans réécrire chaque fonction.
-- ------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated, service_role;

-- Réservées à la sauvegarde et à la restauration (service_role).
revoke execute on function public.schema_public()      from authenticated;
revoke execute on function public.tables_publiques()   from authenticated;
revoke execute on function public.ordre_restauration() from authenticated;

-- Les fonctions créées plus tard naissent fermées aux anonymes.
alter default privileges in schema public revoke execute on functions from public, anon;

-- ------------------------------------------------------------
-- 2. TABLES ET VUES : rien pour les anonymes
-- ------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- Les vues s'exécutaient avec les droits de leur propriétaire, donc
-- sans RLS. Elles appliquent désormais les droits de l'utilisateur.
alter view public.v_anomalies            set (security_invoker = on);
alter view public.v_audit_comptable      set (security_invoker = on);
alter view public.v_completude           set (security_invoker = on);
alter view public.v_compte_courant       set (security_invoker = on);
alter view public.v_contrats_a_facturer  set (security_invoker = on);
alter view public.v_couts_abonnements    set (security_invoker = on);
alter view public.v_deplacements_actifs  set (security_invoker = on);
alter view public.v_devis                set (security_invoker = on);
alter view public.v_echeances            set (security_invoker = on);
alter view public.v_justificatifs_qonto  set (security_invoker = on);
alter view public.v_pieces_completes     set (security_invoker = on);
alter view public.v_tva_exigible         set (security_invoker = on);

-- ------------------------------------------------------------
-- 3. INSCRIPTION : plus jamais de rôle choisi par l'inscrit
--
-- Un compte créé naît INACTIF et sans droit d'écriture. Le
-- propriétaire l'active et lui donne son rôle. À compléter dans le
-- tableau de bord Supabase : Authentication → Sign In / Providers →
-- désactiver « Allow new users to sign up ».
-- ------------------------------------------------------------
create or replace function public.creer_profil()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profils (id, email, nom_complet, role, actif)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nom_complet', split_part(new.email, '@', 1)),
    'lecture_seule',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

commit;

-- ------------------------------------------------------------
-- 4. VÉRIFICATION (à exécuter après)
-- ------------------------------------------------------------
-- Aucune fonction exécutable par anon — doit renvoyer 0 :
-- select count(*) from information_schema.routine_privileges
-- where routine_schema = 'public' and grantee in ('anon', 'PUBLIC');
--
-- Aucune table ou vue lisible par anon — doit renvoyer 0 :
-- select count(*) from information_schema.table_privileges
-- where table_schema = 'public' and grantee = 'anon';
--
-- Les trois comptes existants restent actifs — doit renvoyer 3 :
-- select count(*) from public.profils where actif;
