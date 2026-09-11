-- ============================================================
-- 20260911a — CLÔTURE DE L'EXERCICE
--
-- 1. Écritures d'inventaire : charges et produits constatés d'avance,
--    factures non parvenues, produits à recevoir — passés à la date de
--    clôture, extournés automatiquement le lendemain. L'impôt sur les
--    sociétés se calcule et se comptabilise (695 / 444).
-- 2. Le journal gagne un journal « IN » (inventaire, dotations aux
--    amortissements) et, au premier jour d'un exercice qui en suit un
--    autre, les à-nouveaux (« AN ») : soldes des comptes de bilan et
--    report à nouveau du résultat antérieur.
-- 3. Clôture : un exercice clos ne se modifie plus (même règle que le
--    verrou TVA : les tâches automatiques ne sont pas bloquées). Il se
--    rouvre, avec un motif, tant qu'il n'est pas déclaré.
-- 4. Suivi des obligations (fait le, référence) et état de préparation
--    de la clôture.
-- 5. Correctif : constater_amortissements écrivait un moyen de paiement
--    « aucun » que la contrainte refuse — elle aurait échoué au premier
--    usage.
--
-- Aucune donnée existante n'est modifiée par ce script.
-- ============================================================

alter table public.pieces drop constraint pieces_nature_check;
alter table public.pieces add constraint pieces_nature_check check (nature = any (array[
  'achat', 'vente', 'avoir', 'km', 'creation', 'banque', 'paie', 'amortissement', 'devis',
  'inventaire']));

alter table public.exercices
  add column if not exists cloture_le  timestamptz,
  add column if not exists cloture_par uuid;

create or replace function public.prefixe_piece(p_nature text, p_origine text)
 returns text
 language sql
 immutable
as $function$
  select case p_nature
    when 'creation' then 'CRE'
    when 'km'       then 'KM'
    when 'vente'    then 'VTE'
    when 'avoir'    then 'AVO'
    when 'banque'   then 'BAN'
    when 'paie'     then 'PAI'
    -- Le devis a sa propre séquence. S'il devait passer par ici, il ne
    -- doit surtout pas emprunter celle des achats.
    when 'devis'    then 'DEV'
    -- Les écritures de clôture ont chacune la leur.
    when 'inventaire'    then 'INV'
    when 'amortissement' then 'DOT'
    when 'achat'    then case when p_origine = 'abonnement' then 'ABO' else 'ACH' end
    else 'ACH'
  end;
$function$;

-- ---- Suivi des obligations : « fait le », référence du dépôt ----
create table if not exists public.obligations_suivi (
  cle        text primary key,
  fait_le    date not null,
  reference  text,
  note       text,
  fait_par   uuid default auth.uid(),
  modifie_le timestamptz not null default now()
);
alter table public.obligations_suivi enable row level security;
create policy obligations_suivi_lecture on public.obligations_suivi
  for select to authenticated using (public.a_permission('tva', 'read'));
create policy obligations_suivi_ecriture on public.obligations_suivi
  for all to authenticated
  using (public.a_permission('tva', 'validate'))
  with check (public.a_permission('tva', 'validate'));
revoke all on public.obligations_suivi from anon, public;
grant select, insert, update, delete on public.obligations_suivi to authenticated;
grant all on public.obligations_suivi to service_role;

-- ---- À-nouveaux ----
-- Soldes de tous les comptes à la veille d'un début d'exercice, relus
-- sur le journal depuis l'origine. Vide pour le premier exercice : la
-- garde est en plpgsql, pour que l'appel récursif de lignes_fec ne
-- puisse jamais boucler.
create or replace function public.soldes_a_nouveau(p_debut date)
 returns table(compte_num text, compte_lib text, comp_aux_num text, comp_aux_lib text, solde numeric)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_origine date;
begin
  select min(date_debut) into v_origine from public.exercices;
  if v_origine is null or p_debut <= v_origine
     or not exists (select 1 from public.exercices where date_debut = p_debut) then
    return;
  end if;

  return query
    select a.compte_num, max(a.compte_lib), a.comp_aux_num, max(a.comp_aux_lib),
           round(sum(a.debit - a.credit), 2)
    from   public.lignes_fec(v_origine, p_debut - 1) a
    group  by a.compte_num, a.comp_aux_num;
end;
$function$;


CREATE OR REPLACE FUNCTION public.lignes_fec(p_debut date, p_fin date)
 RETURNS TABLE(journal_code text, journal_lib text, ecriture_num text, ecriture_date date, compte_num text, compte_lib text, comp_aux_num text, comp_aux_lib text, piece_ref text, piece_date date, ecriture_lib text, debit numeric, credit numeric, valid_date date, ordre integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with reprise as (
    select coalesce(min(date_debut), p_debut) as ouverture
    from   public.exercices
  ),
  ecr as (
    select p.*,
           case when p.nature = 'creation'
                then greatest(p.date_piece, r.ouverture)
                else p.date_piece
           end as date_ecriture,
           -- Un avoir fournisseur inverse tout : la charge passe au
           -- crédit, la TVA déduite est reversée, la dette s'éteint au
           -- débit.
           case when p.nature in ('achat','creation','km') and p.sens = 'credit'
                then -1 else 1 end as signe,
           -- Compte de tiers de la pièce : 411 pour les ventes et avoirs
           -- de vente, 401 pour tout le reste.
           case when p.nature in ('vente','avoir') then '411' else '401' end as compte_tiers,
           -- Prestation de services taxée en France : la TVA n'est due
           -- qu'à l'encaissement, elle attend au 44574 jusque-là.
           (p.nature in ('vente','avoir') and p.type_operation = 'service'
            and p.regime_tva = 'france') as tva_en_attente
    from   public.pieces p cross join reprise r
    where  p.etat = 'validee'
  ),
  brut as (

  -- ---- ACHATS : charge ----
  select 'AC'::text as journal_code, 'Achats'::text as journal_lib,
         coalesce(p.numero_piece, p.id::text) as ecriture_num,
         p.date_ecriture as ecriture_date,
         coalesce(p.compte, '606') as compte_num, coalesce(c.libelle, 'Achats') as compte_lib,
         'F' || left(regexp_replace(upper(p.tiers_libelle), '[^A-Z0-9]', '', 'g'), 8) as comp_aux_num,
         p.tiers_libelle as comp_aux_lib,
         coalesce(p.numero_piece, '—') as piece_ref, p.date_piece as piece_date,
         left(coalesce(p.objet, p.tiers_libelle), 200) as ecriture_lib,
         greatest(p.montant_ht * p.signe, 0) as debit,
         greatest(-p.montant_ht * p.signe, 0) as credit,
         coalesce(p.valide_le::date, p.date_ecriture) as valid_date, 1 as ordre
  from   ecr p
  left join public.categories c on c.id = p.categorie_id
  where  p.nature in ('achat','creation','km')
    and  p.date_ecriture between p_debut and p_fin

  union all

  -- ---- ACHATS : TVA déductible ----
  select 'AC', 'Achats',
         coalesce(p.numero_piece, p.id::text), p.date_ecriture,
         '44566', 'TVA déductible sur autres biens et services',
         null, null,
         coalesce(p.numero_piece, '—'), p.date_piece,
         'TVA — ' || left(coalesce(p.objet, p.tiers_libelle), 180),
         greatest(abs(p.tva_comptable) * p.signe, 0),
         greatest(-abs(p.tva_comptable) * p.signe, 0),
         coalesce(p.valide_le::date, p.date_ecriture), 2
  from   ecr p
  where  p.nature in ('achat','creation','km')
    and  p.regime_tva <> 'autoliquidation'
    and  abs(p.tva_comptable) > 0.005
    and  p.date_ecriture between p_debut and p_fin

  union all

  -- ---- ACHATS : TVA autoliquidée, volet déduit ----
  select 'AC', 'Achats',
         coalesce(p.numero_piece, p.id::text), p.date_ecriture,
         '44566', 'TVA déductible sur autres biens et services',
         null, null,
         coalesce(p.numero_piece, '—'), p.date_piece,
         'TVA autoliquidée — ' || left(p.tiers_libelle, 170),
         p.tva_autoliquidee, 0,
         coalesce(p.valide_le::date, p.date_ecriture), 3
  from   ecr p
  where  p.regime_tva = 'autoliquidation' and p.tva_autoliquidee > 0
    and  p.date_ecriture between p_debut and p_fin

  union all

  -- ---- ACHATS : TVA non déductible, laissée dans la charge ----
  select 'AC', 'Achats',
         coalesce(p.numero_piece, p.id::text), p.date_ecriture,
         coalesce(p.compte, '606'), coalesce(c.libelle, 'Achats'),
         null, null,
         coalesce(p.numero_piece, '—'), p.date_piece,
         'TVA non déductible — ' || left(p.tiers_libelle, 170),
         greatest((p.montant_tva - abs(p.tva_comptable)) * p.signe, 0),
         greatest(-(p.montant_tva - abs(p.tva_comptable)) * p.signe, 0),
         coalesce(p.valide_le::date, p.date_ecriture), 4
  from   ecr p
  left join public.categories c on c.id = p.categorie_id
  where  p.nature in ('achat','creation','km')
    and  p.regime_tva = 'france'
    and  p.montant_tva - abs(p.tva_comptable) > 0.005
    and  p.date_ecriture between p_debut and p_fin

  union all

  -- ---- ACHATS : TVA due sur autoliquidation ----
  select 'AC', 'Achats',
         coalesce(p.numero_piece, p.id::text), p.date_ecriture,
         '4452', 'TVA due intracommunautaire',
         null, null,
         coalesce(p.numero_piece, '—'), p.date_piece,
         'Autoliquidation — ' || left(p.tiers_libelle, 170),
         0, p.tva_autoliquidee,
         coalesce(p.valide_le::date, p.date_ecriture), 5
  from   ecr p
  where  p.regime_tva = 'autoliquidation' and p.tva_autoliquidee > 0
    and  p.date_ecriture between p_debut and p_fin

  union all

  -- ---- ACHATS : contrepartie de tiers ----
  select 'AC', 'Achats',
         coalesce(p.numero_piece, p.id::text), p.date_ecriture,
         case when p.moyen_paiement = 'avance_associe' then '4551' else '401' end,
         case when p.moyen_paiement = 'avance_associe'
              then 'Comptes courants d''associés' else 'Fournisseurs' end,
         case when p.moyen_paiement = 'avance_associe'
              then 'A' || left(upper(coalesce(p.paye_par,'ASSOCIE')), 8)
              else 'F' || left(regexp_replace(upper(p.tiers_libelle), '[^A-Z0-9]', '', 'g'), 8) end,
         case when p.moyen_paiement = 'avance_associe'
              then public.nom_associe(p.paye_par) else p.tiers_libelle end,
         coalesce(p.numero_piece, '—'), p.date_piece,
         left(coalesce(p.objet, p.tiers_libelle), 200),
         greatest(-p.montant_ttc * p.signe, 0),
         greatest(p.montant_ttc * p.signe, 0),
         coalesce(p.valide_le::date, p.date_ecriture), 6
  from   ecr p
  where  p.nature in ('achat','creation','km')
    and  p.date_ecriture between p_debut and p_fin

  union all

  -- ---- VENTES ET AVOIRS DE VENTE : client ----
  -- Une facture débite le client ; un avoir le crédite.
  select 'VE', 'Ventes',
         coalesce(p.numero_piece, p.id::text), p.date_ecriture,
         '411', 'Clients',
         'C' || left(regexp_replace(upper(p.tiers_libelle), '[^A-Z0-9]', '', 'g'), 8),
         p.tiers_libelle,
         coalesce(p.numero_piece, '—'), p.date_piece,
         left(coalesce(p.objet, p.tiers_libelle), 200),
         case when p.nature = 'vente' then p.montant_ttc else 0 end,
         case when p.nature = 'avoir' then p.montant_ttc else 0 end,
         coalesce(p.valide_le::date, p.date_ecriture), 1
  from   ecr p
  where  p.nature in ('vente','avoir') and p.date_ecriture between p_debut and p_fin

  union all

  select 'VE', 'Ventes',
         coalesce(p.numero_piece, p.id::text), p.date_ecriture,
         '706', 'Prestations de services',
         null, null,
         coalesce(p.numero_piece, '—'), p.date_piece,
         left(coalesce(p.objet, p.tiers_libelle), 200),
         case when p.nature = 'avoir' then p.montant_ht else 0 end,
         case when p.nature = 'vente' then p.montant_ht else 0 end,
         coalesce(p.valide_le::date, p.date_ecriture), 2
  from   ecr p
  where  p.nature in ('vente','avoir') and p.date_ecriture between p_debut and p_fin

  union all

  -- TVA des services au 44574 en attendant l'encaissement ; celle des
  -- biens, exigible à la facture, directement au 44571.
  select 'VE', 'Ventes',
         coalesce(p.numero_piece, p.id::text), p.date_ecriture,
         case when p.tva_en_attente then '44574' else '44571' end,
         case when p.tva_en_attente then 'TVA collectée en attente d''encaissement'
              else 'TVA collectée' end,
         null, null,
         coalesce(p.numero_piece, '—'), p.date_piece,
         'TVA — ' || left(coalesce(p.objet, p.tiers_libelle), 180),
         case when p.nature = 'avoir' then p.montant_tva else 0 end,
         case when p.nature = 'vente' then p.montant_tva else 0 end,
         coalesce(p.valide_le::date, p.date_ecriture), 3
  from   ecr p
  where  p.nature in ('vente','avoir') and p.montant_tva > 0
    and  p.date_ecriture between p_debut and p_fin

  union all

  -- ---- FACTURE DE SOLDE : les acomptes déjà facturés sont repris ----
  -- Produit et TVA au prorata du montant de la facture ; la TVA reprise
  -- est arrondie et le produit en est le complément, pour que l'écriture
  -- s'équilibre au centime.
  select 'VE', 'Ventes',
         coalesce(p.numero_piece, p.id::text), p.date_ecriture,
         '706', 'Prestations de services',
         null, null,
         coalesce(p.numero_piece, '—'), p.date_piece,
         'Acomptes déduits — ' || left(p.tiers_libelle, 170),
         p.acomptes_deduits - round(p.acomptes_deduits * p.montant_tva / p.montant_ttc, 2), 0,
         coalesce(p.valide_le::date, p.date_ecriture), 4
  from   ecr p
  where  p.nature = 'vente' and p.origine = 'solde'
    and  p.acomptes_deduits > 0.005 and p.montant_ttc > 0
    and  p.date_ecriture between p_debut and p_fin

  union all

  select 'VE', 'Ventes',
         coalesce(p.numero_piece, p.id::text), p.date_ecriture,
         case when p.tva_en_attente then '44574' else '44571' end,
         case when p.tva_en_attente then 'TVA collectée en attente d''encaissement'
              else 'TVA collectée' end,
         null, null,
         coalesce(p.numero_piece, '—'), p.date_piece,
         'TVA sur acomptes déduits — ' || left(p.tiers_libelle, 160),
         round(p.acomptes_deduits * p.montant_tva / p.montant_ttc, 2), 0,
         coalesce(p.valide_le::date, p.date_ecriture), 5
  from   ecr p
  where  p.nature = 'vente' and p.origine = 'solde'
    and  p.acomptes_deduits > 0.005 and p.montant_ttc > 0 and p.montant_tva > 0
    and  p.date_ecriture between p_debut and p_fin

  union all

  select 'VE', 'Ventes',
         coalesce(p.numero_piece, p.id::text), p.date_ecriture,
         '411', 'Clients',
         'C' || left(regexp_replace(upper(p.tiers_libelle), '[^A-Z0-9]', '', 'g'), 8),
         p.tiers_libelle,
         coalesce(p.numero_piece, '—'), p.date_piece,
         'Acomptes déduits — ' || left(p.tiers_libelle, 170),
         0, p.acomptes_deduits,
         coalesce(p.valide_le::date, p.date_ecriture), 6
  from   ecr p
  where  p.nature = 'vente' and p.origine = 'solde'
    and  p.acomptes_deduits > 0.005 and p.montant_ttc > 0
    and  p.date_ecriture between p_debut and p_fin

  union all

  -- ---- BANQUE ----
  -- Côté débit : la banque quand l'argent entre (sens crédit), le tiers
  -- quand il sort. Côté crédit : l'inverse. Le compte de tiers suit la
  -- NATURE de la pièce — 411 pour une vente ou un avoir de vente, 401
  -- pour un achat ou un avoir d'achat.
  select 'BQ', 'Banque',
         'REG-' || to_char(r.date_reglement, 'YYYYMMDD') || '-' || left(r.id::text, 8),
         r.date_reglement,
         case when p.sens = 'debit' then p.compte_tiers else '512' end,
         case when p.sens = 'credit' then 'Banque'
              when p.compte_tiers = '411' then 'Clients' else 'Fournisseurs' end,
         case when p.sens = 'debit'
              then (case when p.compte_tiers = '411' then 'C' else 'F' end)
                   || left(regexp_replace(upper(p.tiers_libelle), '[^A-Z0-9]', '', 'g'), 8)
              else null end,
         case when p.sens = 'debit' then p.tiers_libelle else null end,
         coalesce(p.numero_piece, '—'), r.date_reglement,
         'Règlement ' || left(p.tiers_libelle, 180),
         r.montant, 0,
         r.date_reglement, 1
  from   public.reglements r
  join   ecr p on p.id = r.piece_id
  where  coalesce(r.moyen, '') not in ('avance_associe', 'compensation')
    and  p.nature <> 'banque'
    and  r.date_reglement between p_debut and p_fin

  union all

  select 'BQ', 'Banque',
         'REG-' || to_char(r.date_reglement, 'YYYYMMDD') || '-' || left(r.id::text, 8),
         r.date_reglement,
         case when p.sens = 'debit' then '512' else p.compte_tiers end,
         case when p.sens = 'debit' then 'Banque'
              when p.compte_tiers = '411' then 'Clients' else 'Fournisseurs' end,
         case when p.sens = 'credit'
              then (case when p.compte_tiers = '411' then 'C' else 'F' end)
                   || left(regexp_replace(upper(p.tiers_libelle), '[^A-Z0-9]', '', 'g'), 8)
              else null end,
         case when p.sens = 'credit' then p.tiers_libelle else null end,
         coalesce(p.numero_piece, '—'), r.date_reglement,
         'Règlement ' || left(p.tiers_libelle, 180),
         0, r.montant,
         r.date_reglement, 2
  from   public.reglements r
  join   ecr p on p.id = r.piece_id
  where  coalesce(r.moyen, '') not in ('avance_associe', 'compensation')
    and  p.nature <> 'banque'
    and  r.date_reglement between p_debut and p_fin

  union all

  -- ---- BANQUE : la TVA encaissée devient exigible ----
  -- La part de TVA du règlement passe du 44574 au 44571 (l'inverse pour
  -- un avoir remboursé), calculée comme dans v_tva_exigible. Une
  -- compensation facture / avoir ne transite pas : les deux montants
  -- s'annulent au 44574.
  select 'BQ', 'Banque',
         'REG-' || to_char(r.date_reglement, 'YYYYMMDD') || '-' || left(r.id::text, 8),
         r.date_reglement,
         case when p.nature = 'vente' then '44574' else '44571' end,
         case when p.nature = 'vente' then 'TVA collectée en attente d''encaissement'
              else 'TVA collectée' end,
         null, null,
         coalesce(p.numero_piece, '—'), r.date_reglement,
         'TVA exigible — ' || left(p.tiers_libelle, 170),
         round(abs(p.tva_comptable) * r.montant / p.montant_ttc, 2), 0,
         r.date_reglement, 3
  from   public.reglements r
  join   ecr p on p.id = r.piece_id
  where  p.tva_en_attente
    and  coalesce(r.moyen, '') not in ('avance_associe', 'compensation')
    and  abs(p.tva_comptable) > 0.005 and p.montant_ttc > 0
    and  r.date_reglement between p_debut and p_fin

  union all

  select 'BQ', 'Banque',
         'REG-' || to_char(r.date_reglement, 'YYYYMMDD') || '-' || left(r.id::text, 8),
         r.date_reglement,
         case when p.nature = 'vente' then '44571' else '44574' end,
         case when p.nature = 'vente' then 'TVA collectée'
              else 'TVA collectée en attente d''encaissement' end,
         null, null,
         coalesce(p.numero_piece, '—'), r.date_reglement,
         'TVA exigible — ' || left(p.tiers_libelle, 170),
         0, round(abs(p.tva_comptable) * r.montant / p.montant_ttc, 2),
         r.date_reglement, 4
  from   public.reglements r
  join   ecr p on p.id = r.piece_id
  where  p.tva_en_attente
    and  coalesce(r.moyen, '') not in ('avance_associe', 'compensation')
    and  abs(p.tva_comptable) > 0.005 and p.montant_ttc > 0
    and  r.date_reglement between p_debut and p_fin

  union all

  -- ---- INVENTAIRE : régularisations de clôture ----
  -- Une charge constatée d'avance sort de la charge (486), une facture
  -- non parvenue y entre (408, TVA en attente au 44586) ; de même pour
  -- les produits (487, 418, 44587). L'impôt sur les sociétés : 695 / 444.
  -- La date de validation ne précède jamais celle de l'écriture.
  select 'IN', 'Inventaire',
         coalesce(p.numero_piece, p.id::text), p.date_piece,
         p.compte,
         coalesce((select c.libelle from public.categories c
                   where c.compte = p.compte order by c.ordre limit 1),
                  case when p.origine = 'is' then 'Impôts sur les bénéfices'
                       else 'Régularisation' end),
         null, null,
         coalesce(p.numero_piece, '—'), p.date_piece,
         left(coalesce(p.objet, p.tiers_libelle), 200),
         case when p.origine in ('fnp', 'pca', 'is') then p.montant_ht else 0 end,
         case when p.origine in ('cca', 'par') then p.montant_ht else 0 end,
         greatest(coalesce(p.valide_le::date, p.date_piece), p.date_piece), 1
  from   ecr p
  where  p.nature = 'inventaire'
    and  p.date_piece between p_debut and p_fin

  union all

  select 'IN', 'Inventaire',
         coalesce(p.numero_piece, p.id::text), p.date_piece,
         case p.origine when 'cca' then '486' when 'fnp' then '408'
                        when 'pca' then '487' when 'par' then '418' else '444' end,
         case p.origine when 'cca' then 'Charges constatées d''avance'
                        when 'fnp' then 'Fournisseurs — factures non parvenues'
                        when 'pca' then 'Produits constatés d''avance'
                        when 'par' then 'Clients — factures à établir'
                        else 'État — impôt sur les bénéfices' end,
         null, null,
         coalesce(p.numero_piece, '—'), p.date_piece,
         left(coalesce(p.objet, p.tiers_libelle), 200),
         case when p.origine in ('cca', 'par') then p.montant_ttc else 0 end,
         case when p.origine in ('fnp', 'pca', 'is') then p.montant_ttc else 0 end,
         greatest(coalesce(p.valide_le::date, p.date_piece), p.date_piece), 2
  from   ecr p
  where  p.nature = 'inventaire'
    and  p.date_piece between p_debut and p_fin

  union all

  select 'IN', 'Inventaire',
         coalesce(p.numero_piece, p.id::text), p.date_piece,
         case when p.origine = 'fnp' then '44586' else '44587' end,
         case when p.origine = 'fnp' then 'TVA sur factures non parvenues'
              else 'TVA sur factures à établir' end,
         null, null,
         coalesce(p.numero_piece, '—'), p.date_piece,
         'TVA — ' || left(coalesce(p.objet, p.tiers_libelle), 180),
         case when p.origine = 'fnp' then p.montant_tva else 0 end,
         case when p.origine = 'par' then p.montant_tva else 0 end,
         greatest(coalesce(p.valide_le::date, p.date_piece), p.date_piece), 3
  from   ecr p
  where  p.nature = 'inventaire' and p.origine in ('fnp', 'par') and p.montant_tva > 0
    and  p.date_piece between p_debut and p_fin

  union all

  -- ---- INVENTAIRE : extourne au premier jour de l'exercice suivant ----
  -- La régularisation s'annule le lendemain de la clôture : la facture,
  -- ou la charge, arrive alors normalement dans le nouvel exercice.
  select 'IN', 'Inventaire',
         coalesce(p.numero_piece, p.id::text) || '-EXT', p.date_piece + 1,
         p.compte,
         coalesce((select c.libelle from public.categories c
                   where c.compte = p.compte order by c.ordre limit 1), 'Régularisation'),
         null, null,
         coalesce(p.numero_piece, '—'), p.date_piece + 1,
         'Extourne — ' || left(coalesce(p.objet, p.tiers_libelle), 185),
         case when p.origine in ('cca', 'par') then p.montant_ht else 0 end,
         case when p.origine in ('fnp', 'pca') then p.montant_ht else 0 end,
         greatest(coalesce(p.valide_le::date, p.date_piece + 1), p.date_piece + 1), 1
  from   ecr p
  where  p.nature = 'inventaire' and p.origine in ('cca', 'fnp', 'pca', 'par')
    and  p.date_piece + 1 between p_debut and p_fin

  union all

  select 'IN', 'Inventaire',
         coalesce(p.numero_piece, p.id::text) || '-EXT', p.date_piece + 1,
         case p.origine when 'cca' then '486' when 'fnp' then '408'
                        when 'pca' then '487' else '418' end,
         case p.origine when 'cca' then 'Charges constatées d''avance'
                        when 'fnp' then 'Fournisseurs — factures non parvenues'
                        when 'pca' then 'Produits constatés d''avance'
                        else 'Clients — factures à établir' end,
         null, null,
         coalesce(p.numero_piece, '—'), p.date_piece + 1,
         'Extourne — ' || left(coalesce(p.objet, p.tiers_libelle), 185),
         case when p.origine in ('fnp', 'pca') then p.montant_ttc else 0 end,
         case when p.origine in ('cca', 'par') then p.montant_ttc else 0 end,
         greatest(coalesce(p.valide_le::date, p.date_piece + 1), p.date_piece + 1), 2
  from   ecr p
  where  p.nature = 'inventaire' and p.origine in ('cca', 'fnp', 'pca', 'par')
    and  p.date_piece + 1 between p_debut and p_fin

  union all

  select 'IN', 'Inventaire',
         coalesce(p.numero_piece, p.id::text) || '-EXT', p.date_piece + 1,
         case when p.origine = 'fnp' then '44586' else '44587' end,
         case when p.origine = 'fnp' then 'TVA sur factures non parvenues'
              else 'TVA sur factures à établir' end,
         null, null,
         coalesce(p.numero_piece, '—'), p.date_piece + 1,
         'Extourne TVA — ' || left(coalesce(p.objet, p.tiers_libelle), 180),
         case when p.origine = 'par' then p.montant_tva else 0 end,
         case when p.origine = 'fnp' then p.montant_tva else 0 end,
         greatest(coalesce(p.valide_le::date, p.date_piece + 1), p.date_piece + 1), 3
  from   ecr p
  where  p.nature = 'inventaire' and p.origine in ('fnp', 'par') and p.montant_tva > 0
    and  p.date_piece + 1 between p_debut and p_fin

  union all

  -- ---- DOTATIONS AUX AMORTISSEMENTS ----
  -- Charge calculée, sans décaissement : 6811 contre 281. La pièce
  -- regroupe les immobilisations de la période ; le détail est au
  -- registre des immobilisations.
  select 'IN', 'Inventaire',
         coalesce(p.numero_piece, p.id::text), p.date_ecriture,
         coalesce(p.compte, '6811'), 'Dotations aux amortissements',
         null, null,
         coalesce(p.numero_piece, '—'), p.date_piece,
         left(coalesce(p.objet, 'Dotation aux amortissements'), 200),
         p.montant_ht, 0,
         greatest(coalesce(p.valide_le::date, p.date_ecriture), p.date_ecriture), 1
  from   ecr p
  where  p.nature = 'amortissement' and p.date_ecriture between p_debut and p_fin

  union all

  select 'IN', 'Inventaire',
         coalesce(p.numero_piece, p.id::text), p.date_ecriture,
         '281', 'Amortissements des immobilisations corporelles',
         null, null,
         coalesce(p.numero_piece, '—'), p.date_piece,
         left(coalesce(p.objet, 'Dotation aux amortissements'), 200),
         0, p.montant_ht,
         greatest(coalesce(p.valide_le::date, p.date_ecriture), p.date_ecriture), 2
  from   ecr p
  where  p.nature = 'amortissement' and p.date_ecriture between p_debut and p_fin

  union all

  -- ---- À-NOUVEAUX ----
  -- Au premier jour d'un exercice qui en suit un autre : les soldes des
  -- comptes de bilan (classes 1 à 5), puis le résultat des exercices
  -- précédents en report à nouveau (110 créditeur, 119 débiteur), en
  -- attendant la décision d'affectation des associés.
  select 'AN', 'À-nouveaux',
         'AN-' || to_char(p_debut, 'YYYYMMDD'), p_debut,
         s.compte_num, s.compte_lib, s.comp_aux_num, s.comp_aux_lib,
         'AN', p_debut,
         'Reprise des soldes au ' || to_char(p_debut, 'DD/MM/YYYY'),
         greatest(s.solde, 0), greatest(-s.solde, 0),
         p_debut, 1
  from   public.soldes_a_nouveau(p_debut) s
  where  left(s.compte_num, 1) in ('1', '2', '3', '4', '5')
    and  abs(s.solde) > 0.005

  union all

  select 'AN', 'À-nouveaux',
         'AN-' || to_char(p_debut, 'YYYYMMDD'), p_debut,
         case when sum(s.solde) <= 0 then '110' else '119' end,
         case when sum(s.solde) <= 0 then 'Report à nouveau (solde créditeur)'
              else 'Report à nouveau (solde débiteur)' end,
         null, null,
         'AN', p_debut,
         'Résultat des exercices antérieurs',
         greatest(sum(s.solde), 0), greatest(-sum(s.solde), 0),
         p_debut, 2
  from   public.soldes_a_nouveau(p_debut) s
  where  left(s.compte_num, 1) in ('6', '7')
  having abs(sum(s.solde)) > 0.005

  union all

  -- ---- OPÉRATIONS DIVERSES ----
  select 'OD', 'Opérations diverses',
         coalesce(p.numero_piece, p.id::text), p.date_ecriture,
         case when p.sens = 'credit' then '512' else coalesce(p.compte, '627') end,
         case when p.sens = 'credit' then 'Banque' else 'Opération diverse' end,
         null, null,
         coalesce(p.numero_piece, '—'), p.date_piece,
         left(coalesce(p.objet, p.tiers_libelle), 200),
         p.montant_ttc, 0,
         coalesce(p.valide_le::date, p.date_ecriture), 1
  from   ecr p
  where  p.nature = 'banque' and p.date_ecriture between p_debut and p_fin

  union all

  select 'OD', 'Opérations diverses',
         coalesce(p.numero_piece, p.id::text), p.date_ecriture,
         case when p.sens = 'credit' then coalesce(p.compte, '7581') else '512' end,
         case when p.sens = 'credit' then 'Opération diverse' else 'Banque' end,
         null, null,
         coalesce(p.numero_piece, '—'), p.date_piece,
         left(coalesce(p.objet, p.tiers_libelle), 200),
         0, p.montant_ttc,
         coalesce(p.valide_le::date, p.date_ecriture), 2
  from   ecr p
  where  p.nature = 'banque' and p.date_ecriture between p_debut and p_fin
  )

  -- ---- Numérotation continue par journal, dans l'ordre de validation ----
  -- Une écriture validée garde son numéro : les suivantes, validées plus
  -- tard, prennent les numéros d'après.
  select b.journal_code, b.journal_lib,
         b.journal_code || '-' || lpad((dense_rank() over (
           partition by b.journal_code
           order by b.valid_date, b.ecriture_date, b.ecriture_num))::text, 5, '0'),
         b.ecriture_date, b.compte_num, b.compte_lib, b.comp_aux_num, b.comp_aux_lib,
         b.piece_ref, b.piece_date, b.ecriture_lib, b.debit, b.credit, b.valid_date, b.ordre
  from   brut b;
$function$;

CREATE OR REPLACE FUNCTION public.constater_amortissements(p_debut date, p_fin date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r         record;
  v_total   numeric := 0;
  v_nb      integer := 0;
  v_id      uuid;
  v_piece   text;
  v_detail  jsonb := '[]'::jsonb;
begin
  if auth.uid() is not null and not public.a_permission('depenses','validate') then
    raise exception 'Seul le propriétaire constate les amortissements';
  end if;
  if p_fin < p_debut then raise exception 'Période invalide'; end if;
  if p_fin >= current_date then
    raise exception 'On ne constate pas une période en cours';
  end if;

  if exists (select 1 from public.pieces
             where nature = 'amortissement' and etat <> 'annulee'
               and periode_debut = p_debut and periode_fin = p_fin) then
    raise exception 'Les amortissements de cette période sont déjà constatés';
  end if;

  -- La dotation d'une période est la part du plan qui tombe dedans.
  for r in
    select i.id, i.libelle, i.compte,
           sum(round(p.dotation * (
             (least(p.fin, p_fin) - greatest(p.debut, p_debut) + 1)::numeric
             / nullif(p.jours, 0)), 2)) as dotation
    from   public.immobilisations i
    cross join lateral public.plan_amortissement(i.id) p
    where  p.debut <= p_fin and p.fin >= p_debut
    group  by i.id, i.libelle, i.compte
    having sum(p.dotation) > 0
  loop
    v_total := v_total + r.dotation;
    v_nb := v_nb + 1;
    v_detail := v_detail || jsonb_build_object(
      'libelle', r.libelle, 'compte', r.compte, 'dotation', r.dotation);
  end loop;

  if v_nb = 0 then
    return jsonb_build_object('constate', false,
      'motif', 'Aucun amortissement à constater sur cette période.');
  end if;

  insert into public.pieces (
    nature, sens, origine, date_piece,
    tiers_libelle, objet, compte,
    montant_ht, taux_tva, montant_tva, montant_ttc,
    tva_comptable, type_operation, regime_tva,
    etat, moyen_paiement, paye_par, attendu_en_banque,
    periode_debut, periode_fin, notes,
    cree_par, valide_par, valide_le
  ) values (
    'amortissement', 'debit', 'amortissement', p_fin,
    'Dotation aux amortissements',
    'Amortissement de ' || v_nb || ' immobilisation' || case when v_nb > 1 then 's' else '' end,
    '6811',
    v_total, 0, 0, v_total,
    0, 'service', 'hors_champ',
    'validee', null, 'societe', false,
    p_debut, p_fin,
    'Charge calculée, sans décaissement. Contrepartie au compte 28.',
    auth.uid(), auth.uid(), now()
  )
  returning id into v_id;

  v_piece := public.numeroter_piece(v_id);

  perform public.journaliser(
    'creation', 'pieces', v_id::text,
    jsonb_build_object(
      'resume', v_piece || ' · dotation aux amortissements — '
                || to_char(v_total, 'FM999999D00') || ' €',
      'champs', jsonb_build_object('immobilisations', v_nb, 'detail', v_detail)));

  return jsonb_build_object(
    'constate', true, 'id', v_id, 'numero_piece', v_piece,
    'immobilisations', v_nb, 'dotation', v_total, 'detail', v_detail);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tableau_de_bord()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e            record;
  v_mois       jsonb;
  v_categories jsonb;
  v_tresorerie jsonb;
  v_controles  jsonb;
  v_charges    numeric;
  v_par_cat    numeric;
  v_tva_ecr    numeric;
  v_tva_dec    numeric;
  v_fec        jsonb;
  v_classe6    numeric;
  v_immo       numeric;
begin
  select date_debut, date_fin, regime_tva into e
  from   public.exercices
  where  current_date between date_debut and date_fin
  limit  1;

  if not found then
    select date_debut, date_fin, regime_tva into e
    from   public.exercices where date_debut <= current_date
    order  by date_debut desc limit 1;
  end if;
  if not found then raise exception 'Aucun exercice déclaré'; end if;

  -- ---- 1. Le résultat, mois par mois ----
  select coalesce(jsonb_agg(x order by x->>'mois'), '[]'::jsonb)
  into   v_mois
  from (
    select jsonb_build_object(
      'mois',     to_char(m, 'YYYY-MM'),
      'libelle',  to_char(m, 'TMMon'),
      'charges',  coalesce((
        select sum(public.charge_comptable(sens, montant_ht, montant_tva, tva_comptable))
        from   public.pieces
        where  etat = 'validee' and nature in ('achat','creation','km')
          and  not public.est_immobilisation(compte)
          and  date_trunc('month', public.date_ecriture(nature, date_piece)) = m), 0),
      'produits', coalesce((
        select sum(public.produit_vente_ht(sens, origine, montant_ht, montant_tva, montant_ttc, acomptes_deduits))
        from   public.pieces
        where  etat = 'validee' and nature in ('vente','avoir')
          and  date_trunc('month', public.date_ecriture(nature, date_piece)) = m), 0)
    ) as x
    from generate_series(
      date_trunc('month', e.date_debut),
      date_trunc('month', least(e.date_fin, current_date)),
      interval '1 month') as m
  ) s;

  -- ---- 2. Où part l'argent ----
  select coalesce(jsonb_agg(x order by (x->>'montant')::numeric desc), '[]'::jsonb)
  into   v_categories
  from (
    select jsonb_build_object(
      'categorie', coalesce(c.libelle, 'Non classé'),
      'compte',    coalesce(p.compte, '—'),
      'montant',   sum(public.charge_comptable(
                     p.sens, p.montant_ht, p.montant_tva, p.tva_comptable)),
      'lignes',    count(*)
    ) as x
    from   public.pieces p
    left join public.categories c on c.id = p.categorie_id
    where  p.etat = 'validee' and p.nature in ('achat','creation','km')
      and  not public.est_immobilisation(p.compte)
      and  public.date_ecriture(p.nature, p.date_piece)
           between e.date_debut and e.date_fin
    group  by c.libelle, p.compte
    having sum(public.charge_comptable(
             p.sens, p.montant_ht, p.montant_tva, p.tva_comptable)) <> 0
  ) s;

  -- Les immobilisations acquises sur l'exercice : à part, parce qu'elles
  -- ne pèsent pas sur le résultat mais bien sur la trésorerie.
  select coalesce(sum(montant_ht), 0) into v_immo
  from   public.pieces
  where  etat = 'validee' and nature in ('achat','creation')
    and  public.est_immobilisation(compte)
    and  public.date_ecriture(nature, date_piece) between e.date_debut and e.date_fin;

  -- ---- 3. La trésorerie ----
  v_tresorerie := jsonb_build_object(
    'solde_banque', (
      select coalesce(sum(case when sens = 'credit' then montant else -montant end), 0)
      from   public.transactions_qonto where statut_qonto = 'completed'),
    'a_encaisser', (
      select coalesce(sum(net_a_payer - montant_regle), 0) from public.pieces
      where  etat = 'validee' and nature = 'vente'
        and  montant_regle < net_a_payer - 0.005),
    'echu_non_regle', (
      select coalesce(sum(net_a_payer - montant_regle), 0) from public.pieces
      where  etat = 'validee' and nature = 'vente'
        and  montant_regle < net_a_payer - 0.005
        and  date_echeance < current_date),
    'a_payer', (
      select coalesce(sum(case when sens = 'debit' then net_a_payer - montant_regle
                               else -(net_a_payer - montant_regle) end), 0)
      from   public.pieces
      where  etat = 'validee' and nature in ('achat','creation')
        and  abs(net_a_payer - montant_regle) > 0.005),
    'compte_courant', (
      select coalesce(sum(case when sens = 'debit' then montant_ttc else -montant_ttc end), 0)
      from   public.pieces
      where  etat = 'validee' and moyen_paiement = 'avance_associe'),
    'tva_a_payer', (
      select coalesce(sum(case when sens = 'credit' then tva else -tva end), 0)
      from   public.v_tva_exigible
      where  date_exigibilite between e.date_debut and e.date_fin),
    'immobilisations', v_immo
  );

  -- ---- 4. Contrôles ----
  select coalesce(sum(public.charge_comptable(
           sens, montant_ht, montant_tva, tva_comptable)), 0)
  into   v_charges from public.pieces
  where  etat = 'validee' and nature in ('achat','creation','km')
    and  not public.est_immobilisation(compte)
    and  public.date_ecriture(nature, date_piece) between e.date_debut and e.date_fin;

  select coalesce(sum((x->>'montant')::numeric), 0)
  into   v_par_cat from jsonb_array_elements(v_categories) x;

  select coalesce(sum(abs(tva_comptable)), 0) into v_tva_ecr
  from   public.pieces
  where  etat = 'validee' and nature in ('achat','creation','km')
    and  regime_tva = 'france' and montant_regle >= montant_ttc - 0.005;

  -- CORRECTIF MIGRATION 104 : on ne restreint plus à
  -- fait_generateur = 'reglement'. Un bien (fait_generateur =
  -- 'date_piece') porte, lui aussi, de la TVA déductible réellement
  -- déclarée — l'exclure ici alors que declaration_tva() l'inclut
  -- créait un écart structurel et permanent, sans rapport avec une
  -- vraie erreur de saisie.
  select coalesce(sum(abs(tva)), 0) into v_tva_dec
  from   public.v_tva_exigible
  where  sens = 'debit';

  v_fec := public.controle_fec(e.date_debut, e.date_fin);

  -- ⚠️ La classe 2 est EXCLUE : une immobilisation figure au bilan, pas
  -- au compte de résultat. L'inclure faisait concorder deux chiffres
  -- également faux — un contrôle qui valide une erreur est pire que pas
  -- de contrôle.
  select coalesce(sum(debit - credit), 0) into v_classe6
  from   public.lignes_fec(e.date_debut, e.date_fin)
  where  left(compte_num, 1) = '6'
    -- Les écritures de clôture ne sont pas des pièces : hors du rapprochement.
    and  journal_code not in ('IN', 'AN');

  v_controles := jsonb_build_array(
    jsonb_build_object(
      'libelle', 'Écritures équilibrées',
      'detail',  'Le total des débits égale celui des crédits',
      'ok',      coalesce((v_fec->>'equilibre')::boolean, false),
      'mesure',  to_char(coalesce((v_fec->>'ecart')::numeric, 0), 'FM999990D00') || ' € d''écart'),
    jsonb_build_object(
      'libelle', 'Charges du bilan et du journal concordantes',
      'detail',  'Le total des charges retombe sur les comptes de classe 6 du fichier',
      'ok',      abs(v_charges - v_classe6) < 0.02,
      'mesure',  to_char(abs(v_charges - v_classe6), 'FM999990D00') || ' € d''écart'),
    jsonb_build_object(
      'libelle', 'Ventilation par catégorie complète',
      'detail',  'La somme des catégories retombe sur le total — un avoir compté à l''endroit fausserait les deux',
      'ok',      abs(v_charges - v_par_cat) < 0.005,
      'mesure',  to_char(abs(v_charges - v_par_cat), 'FM999990D00') || ' € d''écart'),
    jsonb_build_object(
      'libelle', 'TVA déclarée conforme aux écritures',
      'detail',  'La déclaration ne réclame pas plus que ce que les pièces portent',
      'ok',      abs(v_tva_ecr - v_tva_dec) < 0.02,
      'mesure',  to_char(abs(v_tva_ecr - v_tva_dec), 'FM999990D00') || ' € d''écart'),
    jsonb_build_object(
      'libelle', 'Mouvements bancaires expliqués',
      'detail',  'Chaque opération consolidée est rattachée à une écriture',
      'ok',      (select count(*) = 0 from public.transactions_qonto
                  where statut_traitement = 'a_traiter' and statut_qonto = 'completed'
                    and abs(montant) > 0.005),
      'mesure',  (select count(*)::text from public.transactions_qonto
                  where statut_traitement = 'a_traiter' and statut_qonto = 'completed'
                    and abs(montant) > 0.005) || ' sans écriture'),
    jsonb_build_object(
      'libelle', 'Factures rattachées',
      'detail',  'Sans pièce, la charge est rejetée et la TVA contestée',
      'ok',      (select count(*) = 0 from public.v_pieces_completes where facture_manquante),
      'mesure',  (select count(*)::text from public.v_pieces_completes
                  where facture_manquante) || ' à déposer'),
    -- Un bien durable passé en charge est un redressement classique.
    jsonb_build_object(
      'libelle', 'Immobilisations inscrites au registre',
      'detail',  'Un bien durable acquis doit figurer au registre et être amorti',
      'ok',      not exists (
                   select 1 from public.pieces p
                   where p.etat = 'validee' and public.est_immobilisation(p.compte)
                     and not exists (select 1 from public.immobilisations i
                                     where i.piece_id = p.id)),
      'mesure',  (select count(*)::text from public.pieces p
                  where p.etat = 'validee' and public.est_immobilisation(p.compte)
                    and not exists (select 1 from public.immobilisations i
                                    where i.piece_id = p.id)) || ' à inscrire')
  );

  return jsonb_build_object(
    'exercice_debut', e.date_debut,
    'exercice_fin',   e.date_fin,
    'regime',         e.regime_tva,
    'par_mois',       v_mois,
    'categories',     v_categories,
    'tresorerie',     v_tresorerie,
    'controles',      v_controles,
    'charges_total',  v_charges,
    'immobilisations', v_immo,
    'produits_total', (
      select coalesce(sum(public.produit_vente_ht(sens, origine, montant_ht, montant_tva, montant_ttc, acomptes_deduits)), 0)
      from   public.pieces
      where  etat = 'validee' and nature in ('vente','avoir')
        and  public.date_ecriture(nature, date_piece) between e.date_debut and e.date_fin),
    'anomalies', (
      select count(*) from jsonb_array_elements(v_controles) c
      where  not (c->>'ok')::boolean)
  );
end;
$function$;

-- ============================================================
-- VERROU DES EXERCICES CLOS
-- ============================================================

create or replace function public.exercice_clos(p_date date)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select 'du ' || to_char(date_debut, 'DD/MM/YYYY') || ' au ' || to_char(date_fin, 'DD/MM/YYYY')
  from   public.exercices
  where  statut = 'clos' and p_date between date_debut and date_fin
  limit  1;
$function$;

create or replace function public.verrou_exercice_pieces()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ex text;
begin
  -- Les tâches automatiques (synchronisation, sauvegarde) passent.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  -- Rien de ce que lit le journal n'a changé : la modification passe
  -- (notes, justificatif, montant réglé par un paiement ultérieur…).
  if tg_op = 'UPDATE'
     and (old.etat, old.nature, old.sens, old.origine, old.date_piece, old.compte,
          old.categorie_id, old.montant_ht, old.montant_tva, old.montant_ttc,
          old.tva_comptable, old.taux_tva, old.regime_tva, old.type_operation,
          old.tva_autoliquidee, old.acomptes_deduits, old.moyen_paiement, old.paye_par,
          old.tiers_libelle, old.periode_debut, old.periode_fin)
         is not distinct from
         (new.etat, new.nature, new.sens, new.origine, new.date_piece, new.compte,
          new.categorie_id, new.montant_ht, new.montant_tva, new.montant_ttc,
          new.tva_comptable, new.taux_tva, new.regime_tva, new.type_operation,
          new.tva_autoliquidee, new.acomptes_deduits, new.moyen_paiement, new.paye_par,
          new.tiers_libelle, new.periode_debut, new.periode_fin) then
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.etat = 'validee' then
    v_ex := public.exercice_clos(public.date_ecriture(old.nature, old.date_piece));
  end if;
  if v_ex is null and tg_op in ('INSERT', 'UPDATE') and new.etat = 'validee' then
    v_ex := public.exercice_clos(public.date_ecriture(new.nature, new.date_piece));
  end if;

  if v_ex is not null then
    raise exception
      'L''exercice % est clos : ses écritures ne changent plus. Enregistrez la correction '
      'dans l''exercice en cours, ou rouvrez l''exercice (Comptabilité → Clôture) s''il '
      'n''est pas encore déclaré.', v_ex;
  end if;
  return coalesce(new, old);
end;
$function$;

create or replace function public.verrou_exercice_reglements()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ex text;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  -- Rattacher le règlement à l'opération bancaire ne change pas le journal.
  if tg_op = 'UPDATE'
     and (old.piece_id, old.date_reglement, old.montant, old.moyen)
         is not distinct from (new.piece_id, new.date_reglement, new.montant, new.moyen) then
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_ex := public.exercice_clos(old.date_reglement);
  end if;
  if v_ex is null and tg_op in ('INSERT', 'UPDATE') then
    v_ex := public.exercice_clos(new.date_reglement);
  end if;

  if v_ex is not null then
    raise exception
      'L''exercice % est clos : un règlement daté de cet exercice ne s''ajoute, ne se '
      'modifie ni ne se supprime plus. Datez-le dans l''exercice en cours.', v_ex;
  end if;
  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_verrou_exercice on public.pieces;
create trigger trg_verrou_exercice
  before insert or update or delete on public.pieces
  for each row execute function public.verrou_exercice_pieces();

drop trigger if exists trg_verrou_exercice on public.reglements;
create trigger trg_verrou_exercice
  before insert or update or delete on public.reglements
  for each row execute function public.verrou_exercice_reglements();

-- ============================================================
-- ÉCRITURES D'INVENTAIRE
-- ============================================================

create or replace function public.creer_ecriture_inventaire(
  p_type text, p_exercice uuid, p_compte text, p_libelle text,
  p_montant numeric, p_tva numeric default 0, p_tiers text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  e       record;
  v_id    uuid;
  v_piece text;
  v_tva   numeric := round(coalesce(p_tva, 0), 2);
begin
  if auth.uid() is not null and not public.a_permission('tva', 'validate') then
    raise exception 'Seul le propriétaire passe les écritures de clôture';
  end if;

  select * into e from public.exercices where id = p_exercice;
  if not found then raise exception 'Exercice introuvable'; end if;
  if e.statut = 'clos' then raise exception 'Cet exercice est clos'; end if;

  if p_type not in ('cca', 'fnp', 'pca', 'par') then
    raise exception 'Type d''écriture inconnu : %', p_type;
  end if;
  p_compte := trim(coalesce(p_compte, ''));
  if p_type in ('cca', 'fnp') and p_compte !~ '^6[0-9]+$' then
    raise exception 'Une charge constatée d''avance ou une facture non parvenue porte '
                    'sur un compte de charge (6…).';
  end if;
  if p_type in ('pca', 'par') and p_compte !~ '^7[0-9]+$' then
    raise exception 'Un produit constaté d''avance ou à recevoir porte sur un compte '
                    'de produit (7…).';
  end if;
  if coalesce(p_montant, 0) <= 0 then raise exception 'Le montant doit être positif'; end if;
  if v_tva < 0 then raise exception 'La TVA ne peut pas être négative'; end if;
  if p_type in ('cca', 'pca') and v_tva <> 0 then
    raise exception 'Une écriture constatée d''avance se passe hors taxe : la TVA a déjà '
                    'suivi la facture.';
  end if;
  if trim(coalesce(p_libelle, '')) = '' then
    raise exception 'Un libellé est obligatoire';
  end if;

  insert into public.pieces (
    nature, sens, origine, date_piece, tiers_libelle, objet, compte,
    montant_ht, taux_tva, montant_tva, montant_ttc, tva_comptable,
    type_operation, regime_tva, etat, attendu_en_banque,
    periode_debut, periode_fin, notes, cree_par, valide_par, valide_le
  ) values (
    'inventaire', case when p_type in ('fnp', 'pca') then 'debit' else 'credit' end,
    p_type, e.date_fin,
    coalesce(nullif(trim(p_tiers), ''), 'Écriture de clôture'), trim(p_libelle), p_compte,
    round(p_montant, 2),
    case when v_tva > 0 then round(v_tva / p_montant * 100, 2) else 0 end,
    v_tva, round(p_montant, 2) + v_tva, 0,
    'service', 'hors_champ', 'validee', false,
    e.date_debut, e.date_fin,
    'Extournée le ' || to_char(e.date_fin + 1, 'DD/MM/YYYY') || '.',
    auth.uid(), auth.uid(), now()
  )
  returning id into v_id;

  v_piece := public.numeroter_piece(v_id);

  perform public.journaliser(
    'creation', 'pieces', v_id::text,
    jsonb_build_object(
      'resume', v_piece || ' · '
                || case p_type when 'cca' then 'charge constatée d''avance'
                               when 'fnp' then 'facture non parvenue'
                               when 'pca' then 'produit constaté d''avance'
                               else 'produit à recevoir' end
                || ' — ' || to_char(p_montant, 'FM999999990D00') || ' € HT'));

  return jsonb_build_object('id', v_id, 'numero_piece', v_piece);
end;
$function$;

-- ============================================================
-- RÉSULTAT FISCAL ET IMPÔT SUR LES SOCIÉTÉS
-- ============================================================

-- Les produits et charges d'un exercice, lus sur le journal.
create or replace function public.resultat_comptable(p_debut date, p_fin date)
 returns table(produits numeric, charges numeric, impot numeric, amendes numeric, tvs numeric)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(sum(credit - debit) filter (where left(compte_num, 1) = '7'), 0),
         coalesce(sum(debit - credit) filter (where left(compte_num, 1) = '6'
                                              and compte_num not like '695%'), 0),
         coalesce(sum(debit - credit) filter (where compte_num like '695%'), 0),
         coalesce(sum(debit - credit) filter (where compte_num like '6712%'), 0),
         coalesce(sum(debit - credit) filter (where compte_num like '63512%'), 0)
  from   public.lignes_fec(p_debut, p_fin);
$function$;

-- Résultat fiscal estimé : le résultat avant impôt, plus les charges que
-- la loi ne laisse pas déduire et que le plan de comptes isole (amendes,
-- taxe sur les véhicules de tourisme), moins les déficits antérieurs.
-- Taux réduit de 15 % jusqu'au plafond, ajusté à la durée de l'exercice,
-- si le capital est entièrement libéré.
create or replace function public.resultat_fiscal(p_exercice uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  e          record;
  r          record;
  a          record;
  v_stock    numeric := 0;
  v_rf       numeric;
  v_avant    numeric;
  v_fiscal   numeric;
  v_impute   numeric;
  v_base     numeric;
  v_jours    integer;
  v_plafond  numeric;
  v_reduit   numeric;
  v_capital  numeric;
  v_libere   numeric;
  v_eligible boolean;
begin
  select * into e from public.exercices where id = p_exercice;
  if not found then raise exception 'Exercice introuvable'; end if;

  -- Déficits des exercices précédents, imputés dans l'ordre.
  for a in select * from public.exercices where date_fin < e.date_debut order by date_debut loop
    select * into r from public.resultat_comptable(a.date_debut, a.date_fin);
    v_rf := r.produits - r.charges + r.amendes + r.tvs;
    v_stock := v_stock + greatest(-v_rf, 0) - least(v_stock, greatest(v_rf, 0));
  end loop;

  select * into r from public.resultat_comptable(e.date_debut, e.date_fin);
  v_avant  := r.produits - r.charges;
  v_fiscal := round(v_avant + r.amendes + r.tvs);
  v_impute := least(v_stock, greatest(v_fiscal, 0));
  v_base   := greatest(v_fiscal - v_impute, 0);

  v_jours   := e.date_fin - e.date_debut + 1;
  v_plafond := round(42500 * v_jours / 365.0);
  select coalesce(sum(capital_souscrit), 0), coalesce(sum(capital_libere), 0)
  into   v_capital, v_libere
  from   public.associes where actif;
  v_eligible := v_capital > 0 and v_libere >= v_capital;
  v_reduit   := case when v_eligible then least(v_base, v_plafond) else 0 end;

  return jsonb_build_object(
    'debut', e.date_debut, 'fin', e.date_fin, 'jours', v_jours,
    'produits', r.produits, 'charges', r.charges,
    'is_comptabilise', r.impot,
    'resultat_avant_is', v_avant,
    'resultat_comptable', v_avant - r.impot,
    'reintegrations', jsonb_build_object('amendes', r.amendes, 'tvs', r.tvs,
                                         'impot', r.impot),
    'resultat_fiscal', v_fiscal,
    'deficits_anterieurs', v_stock,
    'deficit_impute', v_impute,
    'deficit_reportable', greatest(v_stock - v_impute, 0) + greatest(-v_fiscal, 0),
    'base_imposable', v_base,
    'taux_reduit_applicable', v_eligible,
    'plafond_taux_reduit', v_plafond,
    'base_taux_reduit', v_reduit,
    'base_taux_normal', v_base - v_reduit,
    'impot', round(v_reduit * 0.15 + (v_base - v_reduit) * 0.25));
end;
$function$;

create or replace function public.comptabiliser_is(p_exercice uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  e          record;
  r          jsonb;
  v_id       uuid;
  v_piece    text;
  v_remplace integer;
  v_impot    numeric;
begin
  if auth.uid() is not null and not public.a_permission('tva', 'validate') then
    raise exception 'Seul le propriétaire comptabilise l''impôt';
  end if;
  select * into e from public.exercices where id = p_exercice;
  if not found then raise exception 'Exercice introuvable'; end if;
  if e.statut = 'clos' then raise exception 'Cet exercice est clos'; end if;

  -- Recalcul : l'écriture précédente est annulée, la nouvelle la remplace.
  update public.pieces
  set    etat = 'annulee', motif_annulation = 'Impôt recalculé',
         annule_le = now(), annule_par = auth.uid(), modifie_le = now()
  where  nature = 'inventaire' and origine = 'is' and etat <> 'annulee'
    and  date_piece = e.date_fin;
  get diagnostics v_remplace = row_count;

  r := public.resultat_fiscal(p_exercice);
  v_impot := (r->>'impot')::numeric;

  if v_impot <= 0 then
    return r || jsonb_build_object('comptabilise', false, 'remplacees', v_remplace);
  end if;

  insert into public.pieces (
    nature, sens, origine, date_piece, tiers_libelle, objet, compte,
    montant_ht, taux_tva, montant_tva, montant_ttc, tva_comptable,
    type_operation, regime_tva, etat, attendu_en_banque,
    periode_debut, periode_fin, notes, cree_par, valide_par, valide_le
  ) values (
    'inventaire', 'debit', 'is', e.date_fin, 'Impôt sur les sociétés',
    'IS de l''exercice clos le ' || to_char(e.date_fin, 'DD/MM/YYYY'), '695',
    v_impot, 0, 0, v_impot, 0,
    'service', 'hors_champ', 'validee', false,
    e.date_debut, e.date_fin,
    'Résultat fiscal ' || (r->>'resultat_fiscal') || ' € — 15 % sur '
      || (r->>'base_taux_reduit') || ' €, 25 % sur ' || (r->>'base_taux_normal') || ' €.',
    auth.uid(), auth.uid(), now()
  )
  returning id into v_id;

  v_piece := public.numeroter_piece(v_id);

  perform public.journaliser(
    'creation', 'pieces', v_id::text,
    jsonb_build_object('resume', v_piece || ' · impôt sur les sociétés — '
                                 || to_char(v_impot, 'FM999999990D00') || ' €'));

  return r || jsonb_build_object('comptabilise', true, 'id', v_id, 'numero_piece', v_piece,
                                 'remplacees', v_remplace);
end;
$function$;

-- ============================================================
-- PRÉPARATION ET CLÔTURE
-- ============================================================

create or replace function public.etat_cloture(p_exercice uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  e        record;
  v_fec    jsonb;
  v_512    numeric;
  v_qonto  numeric;
  v_n      integer;
  v_immo   integer;
  v_regist integer;
  v_dot    boolean;
  v_decl   text;
  v_inv    integer;
  v_rf     jsonb;
  v_is     numeric;
  v_etapes jsonb := '[]'::jsonb;
begin
  select * into e from public.exercices where id = p_exercice;
  if not found then raise exception 'Exercice introuvable'; end if;

  -- 1. Chaque opération bancaire a son écriture.
  select count(*) into v_n from public.transactions_qonto
  where  statut_qonto = 'completed' and statut_traitement = 'a_traiter'
    and  abs(montant) > 0.005 and date_operation between e.date_debut and e.date_fin;
  v_etapes := v_etapes || jsonb_build_object('cle', 'banque',
    'libelle', 'Opérations bancaires rattachées', 'ok', v_n = 0,
    'mesure', case when v_n = 0 then 'Toutes rattachées' else v_n || ' à traiter' end,
    'lien', '/banque');

  -- 2. La banque du journal retombe sur le relevé.
  select coalesce(sum(debit - credit), 0) into v_512
  from   public.lignes_fec(e.date_debut, e.date_fin) where compte_num like '512%';
  select coalesce(sum(case when sens = 'credit' then montant else -montant end), 0)
  into   v_qonto from public.transactions_qonto
  where  statut_qonto = 'completed' and date_operation <= e.date_fin;
  v_etapes := v_etapes || jsonb_build_object('cle', 'rapprochement',
    'libelle', 'Banque du journal = relevé Qonto', 'ok', abs(v_512 - v_qonto) < 0.005,
    'mesure', 'Journal ' || to_char(v_512, 'FM999999990D00') || ' € · relevé '
              || to_char(v_qonto, 'FM999999990D00') || ' €',
    'lien', '/banque');

  -- 3. Plus rien n'attend une décision.
  select count(*) into v_n from public.pieces
  where  etat = 'a_valider' and date_piece between e.date_debut and e.date_fin;
  v_etapes := v_etapes || jsonb_build_object('cle', 'validation',
    'libelle', 'Aucune pièce en attente de validation', 'ok', v_n = 0,
    'mesure', case when v_n = 0 then 'Rien en attente' else v_n || ' à valider' end,
    'lien', '/depenses');

  -- 4. Chaque dépense a sa facture.
  select count(*) into v_n from public.v_pieces_completes
  where  facture_manquante and date_piece between e.date_debut and e.date_fin;
  v_etapes := v_etapes || jsonb_build_object('cle', 'justificatifs',
    'libelle', 'Factures rattachées aux dépenses', 'ok', v_n = 0,
    'mesure', case when v_n = 0 then 'Toutes rattachées' else v_n || ' sans facture' end,
    'lien', '/banque/justificatifs');

  -- 5. Les trajets de l'exercice sont indemnisés.
  select count(*) into v_n from public.deplacements d
  where  d.statut in ('validee', 'en_attente') and d.date_trajet <= e.date_fin
    and  d.date_trajet >= e.date_debut
    and  not exists (select 1 from public.pieces p
                     where p.nature = 'km' and p.etat <> 'annulee'
                       and p.periode_debut <= d.date_trajet and p.periode_fin >= d.date_trajet);
  v_etapes := v_etapes || jsonb_build_object('cle', 'km',
    'libelle', 'Indemnités kilométriques constatées', 'ok', v_n = 0,
    'mesure', case when v_n = 0 then 'Tous les trajets indemnisés'
                   else v_n || ' trajet(s) à valider ou constater' end,
    'lien', '/deplacements');

  -- 6. Les frais de création sont repris par la société.
  select count(*) into v_n from public.pieces
  where  nature = 'creation' and etat = 'a_valider';
  v_etapes := v_etapes || jsonb_build_object('cle', 'creation',
    'libelle', 'Frais de création ratifiés', 'ok', v_n = 0,
    'mesure', case when v_n = 0 then 'Ratifiés' else v_n || ' à ratifier' end,
    'lien', '/depenses/creation');

  -- 7. Immobilisations inscrites et amorties.
  select count(*) into v_n from public.pieces p
  where  p.etat = 'validee' and public.est_immobilisation(p.compte)
    and  p.date_piece <= e.date_fin
    and  not exists (select 1 from public.immobilisations i where i.piece_id = p.id);
  select count(*) into v_regist from public.immobilisations;
  select exists (select 1 from public.pieces where nature = 'amortissement'
                 and etat <> 'annulee' and periode_fin = e.date_fin) into v_dot;
  v_etapes := v_etapes || jsonb_build_object('cle', 'immobilisations',
    'libelle', 'Immobilisations inscrites et amorties',
    'ok', v_n = 0 and (v_regist = 0 or v_dot),
    'mesure', case when v_n > 0 then v_n || ' à inscrire au registre'
                   when v_regist = 0 then 'Aucune immobilisation'
                   when v_dot then 'Dotation constatée'
                   else 'Dotation de l''exercice à constater' end,
    'lien', '/comptabilite/immobilisations');

  -- 8. Écritures de clôture : une revue, pas un compte à zéro.
  select count(*) into v_inv from public.pieces
  where  nature = 'inventaire' and origine in ('cca', 'fnp', 'pca', 'par')
    and  etat = 'validee' and date_piece = e.date_fin;
  v_etapes := v_etapes || jsonb_build_object('cle', 'inventaire',
    'libelle', 'Charges et produits rattachés au bon exercice', 'ok', null,
    'mesure', case when v_inv = 0 then 'À revoir — aucune écriture passée'
                   else v_inv || ' écriture(s) passée(s)' end,
    'lien', null);

  -- 9. Le journal s'équilibre.
  v_fec := public.controle_fec(e.date_debut, e.date_fin);
  v_etapes := v_etapes || jsonb_build_object('cle', 'equilibre',
    'libelle', 'Journal équilibré', 'ok', coalesce((v_fec->>'equilibre')::boolean, true),
    'mesure', coalesce(v_fec->>'ecart', '0') || ' € d''écart',
    'lien', '/comptabilite');

  -- 10. La TVA de l'exercice est déclarée.
  select coalesce(reference, formulaire) || ' jusqu''au ' || to_char(periode_fin, 'DD/MM/YYYY')
  into   v_decl from public.declarations_tva
  where  etat <> 'annulee' and periode_fin >= e.date_fin and periode_debut <= e.date_fin
  order  by periode_fin desc limit 1;
  v_etapes := v_etapes || jsonb_build_object('cle', 'tva',
    'libelle', 'TVA de l''exercice déclarée', 'ok', v_decl is not null,
    'mesure', coalesce(v_decl, case when e.date_fin < current_date then 'À déclarer'
                                    else 'Après la clôture' end),
    'lien', '/tva/cloture');

  -- 11. L'impôt est comptabilisé s'il est dû.
  v_rf := public.resultat_fiscal(p_exercice);
  select coalesce(sum(montant_ht), 0) into v_is from public.pieces
  where  nature = 'inventaire' and origine = 'is' and etat = 'validee'
    and  date_piece = e.date_fin;
  v_etapes := v_etapes || jsonb_build_object('cle', 'is',
    'libelle', 'Impôt sur les sociétés comptabilisé',
    'ok', abs(v_is - (v_rf->>'impot')::numeric) < 0.5,
    'mesure', case when (v_rf->>'impot')::numeric = 0 and v_is = 0 then 'Aucun impôt dû'
                   else 'Dû ' || (v_rf->>'impot') || ' € · comptabilisé '
                        || to_char(v_is, 'FM999999990') || ' €' end,
    'lien', null);

  return jsonb_build_object(
    'exercice', jsonb_build_object('id', e.id, 'debut', e.date_debut, 'fin', e.date_fin,
                                   'statut', e.statut, 'regime_tva', e.regime_tva,
                                   'cloture_le', e.cloture_le,
                                   'termine', e.date_fin < current_date),
    'etapes', v_etapes,
    'resultat', v_rf);
end;
$function$;

create or replace function public.cloturer_exercice(p_exercice uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  e     record;
  v_fec jsonb;
  v_n   integer;
begin
  if auth.uid() is not null and not public.a_permission('tva', 'validate') then
    raise exception 'Seul le propriétaire clôture un exercice';
  end if;
  select * into e from public.exercices where id = p_exercice for update;
  if not found then raise exception 'Exercice introuvable'; end if;
  if e.statut = 'clos' then raise exception 'Cet exercice est déjà clos'; end if;
  if e.date_fin >= current_date then
    raise exception 'L''exercice n''est pas terminé : il se clôture à partir du %.',
                    to_char(e.date_fin + 1, 'DD/MM/YYYY');
  end if;
  if exists (select 1 from public.exercices where date_fin < e.date_debut and statut <> 'clos') then
    raise exception 'Clôturez d''abord l''exercice précédent.';
  end if;

  v_fec := public.controle_fec(e.date_debut, e.date_fin);
  if not coalesce((v_fec->>'equilibre')::boolean, true) then
    raise exception 'Le journal est déséquilibré de % € : corrigez avant de clôturer.',
                    v_fec->>'ecart';
  end if;

  select count(*) into v_n from public.pieces
  where  etat = 'a_valider' and date_piece between e.date_debut and e.date_fin;
  if v_n > 0 then
    raise exception '% pièce(s) de l''exercice attendent une validation : décidez avant '
                    'de clôturer.', v_n;
  end if;

  update public.exercices
  set    statut = 'clos', cloture_le = now(), cloture_par = auth.uid()
  where  id = p_exercice;

  perform public.journaliser(
    'cloture', 'exercices', p_exercice::text,
    jsonb_build_object('resume', 'Exercice du ' || to_char(e.date_debut, 'DD/MM/YYYY')
                                 || ' au ' || to_char(e.date_fin, 'DD/MM/YYYY') || ' clos'));

  return jsonb_build_object('id', p_exercice, 'statut', 'clos');
end;
$function$;

create or replace function public.rouvrir_exercice(p_exercice uuid, p_motif text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  e record;
begin
  if auth.uid() is not null and not public.a_permission('tva', 'validate') then
    raise exception 'Seul le propriétaire rouvre un exercice';
  end if;
  select * into e from public.exercices where id = p_exercice for update;
  if not found then raise exception 'Exercice introuvable'; end if;
  if e.statut <> 'clos' then raise exception 'Cet exercice n''est pas clos'; end if;
  if trim(coalesce(p_motif, '')) = '' then
    raise exception 'Un motif est obligatoire : il reste au journal d''audit.';
  end if;
  if exists (select 1 from public.exercices where date_debut > e.date_fin and statut = 'clos') then
    raise exception 'Rouvrez d''abord l''exercice suivant.';
  end if;

  update public.exercices
  set    statut = 'ouvert', cloture_le = null, cloture_par = null
  where  id = p_exercice;

  perform public.journaliser(
    'reouverture', 'exercices', p_exercice::text,
    jsonb_build_object('resume', 'Exercice du ' || to_char(e.date_debut, 'DD/MM/YYYY')
                                 || ' au ' || to_char(e.date_fin, 'DD/MM/YYYY') || ' rouvert',
                       'motif', trim(p_motif)));

  return jsonb_build_object('id', p_exercice, 'statut', 'ouvert');
end;
$function$;

-- ============================================================
-- ÉTATS DE SYNTHÈSE
-- ============================================================

-- Les soldes de chaque compte sur l'exercice, à-nouveaux compris : la
-- mise en forme du bilan et du compte de résultat se fait à l'écran.
create or replace function public.etats_financiers(p_exercice uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  e record;
begin
  select * into e from public.exercices where id = p_exercice;
  if not found then raise exception 'Exercice introuvable'; end if;

  return jsonb_build_object(
    'exercice', jsonb_build_object('id', e.id, 'debut', e.date_debut, 'fin', e.date_fin,
                                   'statut', e.statut, 'regime_tva', e.regime_tva),
    'comptes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'compte', compte_num, 'libelle', libelle,
               'debit', debit, 'credit', credit) order by compte_num), '[]'::jsonb)
      from (select compte_num, max(compte_lib) as libelle,
                   round(sum(debit), 2) as debit, round(sum(credit), 2) as credit
            from   public.lignes_fec(e.date_debut, e.date_fin)
            group  by compte_num) s),
    'fiscal', public.resultat_fiscal(p_exercice),
    'capital', (select coalesce(sum(capital_souscrit), 0) from public.associes where actif));
end;
$function$;

-- ============================================================
-- DROITS
-- ============================================================

revoke execute on function public.soldes_a_nouveau(date) from public, anon;
revoke execute on function public.exercice_clos(date) from public, anon;
revoke execute on function public.verrou_exercice_pieces() from public, anon;
revoke execute on function public.verrou_exercice_reglements() from public, anon;
revoke execute on function public.creer_ecriture_inventaire(text, uuid, text, text, numeric, numeric, text) from public, anon;
revoke execute on function public.resultat_comptable(date, date) from public, anon;
revoke execute on function public.resultat_fiscal(uuid) from public, anon;
revoke execute on function public.comptabiliser_is(uuid) from public, anon;
revoke execute on function public.etat_cloture(uuid) from public, anon;
revoke execute on function public.cloturer_exercice(uuid) from public, anon;
revoke execute on function public.rouvrir_exercice(uuid, text) from public, anon;
revoke execute on function public.etats_financiers(uuid) from public, anon;

grant execute on function public.soldes_a_nouveau(date) to authenticated, service_role;
grant execute on function public.exercice_clos(date) to authenticated, service_role;
grant execute on function public.creer_ecriture_inventaire(text, uuid, text, text, numeric, numeric, text) to authenticated, service_role;
grant execute on function public.resultat_comptable(date, date) to authenticated, service_role;
grant execute on function public.resultat_fiscal(uuid) to authenticated, service_role;
grant execute on function public.comptabiliser_is(uuid) to authenticated, service_role;
grant execute on function public.etat_cloture(uuid) to authenticated, service_role;
grant execute on function public.cloturer_exercice(uuid) to authenticated, service_role;
grant execute on function public.rouvrir_exercice(uuid, text) to authenticated, service_role;
grant execute on function public.etats_financiers(uuid) to authenticated, service_role;
