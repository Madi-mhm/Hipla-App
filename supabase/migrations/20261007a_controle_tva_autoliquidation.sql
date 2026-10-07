-- ============================================================
-- 20261007a — CONTRÔLE « TVA DÉCLARÉE CONFORME AUX ÉCRITURES »
--
-- Le contrôle comparait la TVA déductible des pièces au régime
-- France à toute la TVA déductible de la déclaration, autoliquidation
-- comprise. Chaque facture étrangère autoliquidée (Vercel, Anthropic)
-- creusait donc un écart sans erreur réelle : 30,34 € au 07/10/2026.
--
-- Seul le calcul du contrôle change, dans tableau_de_bord() (STABLE,
-- lecture seule). Aucune donnée n'est modifiée par ce script.
-- ============================================================

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

  -- CORRECTIF 20261007a : la déclaration compte aussi la TVA
  -- autoliquidée déductible (Vercel, Anthropic…) ; les pièces non.
  -- L'écart, égal à cette TVA, n'était pas une erreur de saisie.
  -- Mêmes conditions que v_tva_exigible (autoliquidation_deduite).
  v_tva_ecr := v_tva_ecr + (
    select coalesce(sum(abs(tva_autoliquidee)), 0)
    from   public.pieces
    where  etat = 'validee' and regime_tva = 'autoliquidation'
      and  tva_autoliquidee > 0);

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
