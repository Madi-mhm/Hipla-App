-- ============================================================
-- 20260910b — CONTREPARTIES DU JOURNAL (FEC)
--
-- Deux erreurs dans `lignes_fec`, qui produit le journal et le FEC :
--
-- 1. La contrepartie d'un règlement était choisie par le seul SENS de
--    la pièce. Un remboursement reçu d'un fournisseur (avoir d'achat,
--    sens crédit) était passé au crédit du 411 Clients au lieu du 401
--    Fournisseurs. Constaté : l'avoir Qonto de 22,07 € laissait le 401
--    débiteur de 22,07 € et le 411 amputé d'autant.
--    Même défaut, inversé, pour un remboursement fait à un client
--    (avoir de vente) : il aurait été débité au 401.
--
-- 2. Le journal des ventes ignorait les avoirs de vente : un avoir émis
--    n'aurait produit aucune écriture.
--
-- Rien d'autre ne change : mêmes journaux, mêmes numéros, mêmes dates.
-- Un règlement par compensation (moyen « compensation », qui éteint une
-- facture par son avoir) ne passe pas en banque : il n'y a eu aucun
-- mouvement d'argent.
-- ============================================================

create or replace function public.lignes_fec(p_debut date, p_fin date)
 returns table(journal_code text, journal_lib text, ecriture_num text, ecriture_date date,
               compte_num text, compte_lib text, comp_aux_num text, comp_aux_lib text,
               piece_ref text, piece_date date, ecriture_lib text,
               debit numeric, credit numeric, valid_date date, ordre integer)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
           case when p.nature in ('vente','avoir') then '411' else '401' end as compte_tiers
    from   public.pieces p cross join reprise r
    where  p.etat = 'validee'
  )

  -- ---- ACHATS : charge ----
  select 'AC', 'Achats',
         coalesce(p.numero_piece, p.id::text), p.date_ecriture,
         coalesce(p.compte, '606'), coalesce(c.libelle, 'Achats'),
         'F' || left(regexp_replace(upper(p.tiers_libelle), '[^A-Z0-9]', '', 'g'), 8),
         p.tiers_libelle,
         coalesce(p.numero_piece, '—'), p.date_piece,
         left(coalesce(p.objet, p.tiers_libelle), 200),
         greatest(p.montant_ht * p.signe, 0),
         greatest(-p.montant_ht * p.signe, 0),
         coalesce(p.valide_le::date, p.date_ecriture), 1
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

  select 'VE', 'Ventes',
         coalesce(p.numero_piece, p.id::text), p.date_ecriture,
         '44571', 'TVA collectée',
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

  -- ---- BANQUE ----
  -- Côté débit : la banque quand l'argent entre (sens crédit), le tiers
  -- quand il sort. Côté crédit : l'inverse. Le compte de tiers suit la
  -- NATURE de la pièce — 411 pour une vente ou un avoir de vente, 401
  -- pour un achat ou un avoir d'achat — et plus seulement son sens.
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
  where  p.nature = 'banque' and p.date_ecriture between p_debut and p_fin;
$function$;
