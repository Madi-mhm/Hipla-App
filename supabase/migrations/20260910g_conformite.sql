-- ============================================================
-- 20260910g — CONFORMITÉ : FEC, TVA EN ATTENTE, ACOMPTES, VERROU TVA
--
-- 1. Numéro d'écriture continu. Le FEC exige une numérotation continue
--    par journal. Le journal des achats mêlait trois séries de numéros
--    (achats, frais de création, indemnités) et la banque des
--    identifiants techniques : les trous étaient structurels.
--    EcritureNum devient « AC-00001 », « BQ-00001 »…, dans l'ordre de
--    validation ; le numéro de la pièce reste dans PieceRef.
--
-- 2. TVA collectée en attente. Pour une prestation de services, la TVA
--    n'est due qu'à l'encaissement : à l'émission elle va au 44574, et
--    chaque encaissement en fait passer la part au 44571 — par le même
--    calcul que la déclaration. Le 44571 égale ainsi la TVA exigible.
--
-- 3. Facture de solde. Elle porte l'affaire entière, alors que l'acompte
--    a déjà été facturé : sans déduction, le chiffre d'affaires comptait
--    l'acompte deux fois et le client en restait débiteur. L'écriture de
--    solde reprend désormais la part d'acompte (produit, TVA, client).
--
-- 4. Verrou des périodes déclarées. Une fois une déclaration de TVA
--    figée, une saisie ou une modification qui en changerait le contenu
--    est refusée : sinon la déclaration et les écritures divergent en
--    silence. Les tâches automatiques (clé de service) ne sont pas
--    bloquées.
--
-- Aucune donnée n'est modifiée par ce script.
-- ============================================================

create or replace function public.lignes_fec(p_debut date, p_fin date)
 returns table(journal_code text, journal_lib text, ecriture_num text, ecriture_date date, compte_num text, compte_lib text, comp_aux_num text, comp_aux_lib text, piece_ref text, piece_date date, ecriture_lib text, debit numeric, credit numeric, valid_date date, ordre integer)
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

-- ============================================================
-- VERROU DES PÉRIODES DE TVA DÉCLARÉES
-- ============================================================

-- La déclaration (non annulée) qui couvre une date, ou null.
create or replace function public.periode_tva_declaree(p_date date)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(reference, formulaire) || ' du ' || to_char(periode_debut, 'DD/MM/YYYY')
         || ' au ' || to_char(periode_fin, 'DD/MM/YYYY')
  from   public.declarations_tva
  where  etat <> 'annulee' and p_date between periode_debut and periode_fin
  order  by periode_debut
  limit  1;
$function$;

create or replace function public.refuser_periode_declaree(p_periode text)
 returns void
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
begin
  raise exception
    'Période de TVA déjà déclarée (%) : cette opération changerait une déclaration figée. '
    'Si elle n''est pas encore déposée, annulez-la dans TVA → Déclarations puis refaites-la ; '
    'sinon, enregistrez la correction à une date de la période en cours.', p_periode;
end;
$function$;

create or replace function public.verrou_tva_pieces()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_periode text;
begin
  -- Les tâches automatiques (synchronisation, sauvegarde) passent.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  -- Rien de ce que lit la déclaration n'a changé : la modification passe
  -- (notes, justificatif, rapprochement, montant réglé…).
  if tg_op = 'UPDATE'
     and (old.etat, old.nature, old.sens, old.date_piece, old.montant_ht, old.montant_tva,
          old.montant_ttc, old.tva_comptable, old.taux_tva, old.regime_tva,
          old.type_operation, old.tva_autoliquidee)
         is not distinct from
         (new.etat, new.nature, new.sens, new.date_piece, new.montant_ht, new.montant_tva,
          new.montant_ttc, new.tva_comptable, new.taux_tva, new.regime_tva,
          new.type_operation, new.tva_autoliquidee) then
    return new;
  end if;

  -- L'état avant : ce que la déclaration a lu de cette pièce.
  if tg_op in ('UPDATE', 'DELETE') then
    select public.periode_tva_declaree(e.date_exigibilite) into v_periode
    from   public.v_tva_exigible e
    where  e.piece_id = old.id
      and  (e.nature in ('vente','avoir') or abs(e.tva) > 0.005)
      and  public.periode_tva_declaree(e.date_exigibilite) is not null
    limit  1;
  end if;

  -- L'état après : ce qu'elle lirait désormais.
  if v_periode is null and tg_op in ('INSERT', 'UPDATE') and new.etat = 'validee'
     and (new.nature in ('vente','avoir') or abs(coalesce(new.tva_comptable, 0)) > 0.005
          or coalesce(new.tva_autoliquidee, 0) > 0.005) then
    if (new.regime_tva = 'autoliquidation' and coalesce(new.tva_autoliquidee, 0) > 0.005)
       or (new.regime_tva = 'france' and new.type_operation = 'bien') then
      v_periode := public.periode_tva_declaree(public.date_ecriture(new.nature, new.date_piece));
    elsif new.regime_tva = 'france' and new.type_operation = 'service' and tg_op = 'UPDATE' then
      select public.periode_tva_declaree(public.date_ecriture(new.nature, r.date_reglement))
      into   v_periode
      from   public.reglements r
      where  r.piece_id = new.id
        and  public.periode_tva_declaree(public.date_ecriture(new.nature, r.date_reglement)) is not null
      limit  1;
    end if;
  end if;

  if v_periode is not null then
    perform public.refuser_periode_declaree(v_periode);
  end if;
  return coalesce(new, old);
end;
$function$;

-- Un règlement ne compte pour la TVA que sur une prestation de services
-- validée, taxée en France : c'est lui qui rend la TVA exigible.
create or replace function public.reglement_declare(p_piece uuid, p_date date)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select public.periode_tva_declaree(public.date_ecriture(p.nature, p_date))
  from   public.pieces p
  where  p.id = p_piece and p.etat = 'validee'
    and  p.regime_tva = 'france' and p.type_operation = 'service'
    and  (p.nature in ('vente','avoir') or abs(p.tva_comptable) > 0.005);
$function$;

create or replace function public.verrou_tva_reglements()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_periode text;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  -- Rattacher un règlement à l'opération bancaire ne change rien à la TVA.
  if tg_op = 'UPDATE'
     and (old.piece_id, old.date_reglement, old.montant)
         is not distinct from (new.piece_id, new.date_reglement, new.montant) then
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_periode := public.reglement_declare(old.piece_id, old.date_reglement);
  end if;
  if v_periode is null and tg_op in ('INSERT', 'UPDATE') then
    v_periode := public.reglement_declare(new.piece_id, new.date_reglement);
  end if;

  if v_periode is not null then
    perform public.refuser_periode_declaree(v_periode);
  end if;
  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_verrou_tva on public.pieces;
create trigger trg_verrou_tva
  before insert or update or delete on public.pieces
  for each row execute function public.verrou_tva_pieces();

drop trigger if exists trg_verrou_tva on public.reglements;
create trigger trg_verrou_tva
  before insert or update or delete on public.reglements
  for each row execute function public.verrou_tva_reglements();

revoke execute on function public.periode_tva_declaree(date) from public, anon;
revoke execute on function public.refuser_periode_declaree(text) from public, anon;
revoke execute on function public.reglement_declare(uuid, date) from public, anon;
revoke execute on function public.verrou_tva_pieces() from public, anon;
revoke execute on function public.verrou_tva_reglements() from public, anon;
grant  execute on function public.periode_tva_declaree(date) to authenticated, service_role;
grant  execute on function public.refuser_periode_declaree(text) to authenticated, service_role;
grant  execute on function public.reglement_declare(uuid, date) to authenticated, service_role;
