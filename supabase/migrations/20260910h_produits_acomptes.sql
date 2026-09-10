-- ============================================================
-- 20260910h — CHIFFRE D'AFFAIRES NET DES ACOMPTES DÉDUITS
--
-- Une facture de solde porte l'affaire entière ; l'acompte, déjà
-- facturé, est déjà compté en produit. Le journal (20260910g) reprend
-- la part d'acompte ; le tableau de bord, le rapport mensuel et la
-- séance hebdomadaire l'additionnaient encore deux fois.
--
-- produit_vente_ht() donne le produit d'une vente ou d'un avoir, signé,
-- net de la part HT des acomptes déduits — le même calcul que le FEC.
-- Les trois fonctions ne changent qu'à cet endroit.
--
-- Aucune donnée n'est modifiée par ce script.
-- ============================================================

create or replace function public.produit_vente_ht(p_sens text, p_origine text, p_ht numeric,
                                                   p_tva numeric, p_ttc numeric, p_acomptes numeric)
 returns numeric
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case
    when p_sens = 'credit' then
      p_ht - case when p_origine = 'solde' and p_acomptes > 0.005 and p_ttc > 0
                  then p_acomptes - round(p_acomptes * p_tva / p_ttc, 2)
                  else 0 end
    else -p_ht
  end;
$function$;

revoke execute on function public.produit_vente_ht(text, text, numeric, numeric, numeric, numeric) from public, anon;
grant  execute on function public.produit_vente_ht(text, text, numeric, numeric, numeric, numeric) to authenticated, service_role;

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
  where  left(compte_num, 1) = '6';

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

CREATE OR REPLACE FUNCTION public.rapport_mensuel(p_debut date, p_fin date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e          record;
  v_charges  numeric;
  v_produits numeric;
  v_immo     numeric;
  v_encaisse numeric;
begin
  -- CORRECTIF MIGRATION 106 : chevauchement d'intervalle plutôt que
  -- confinement de p_debut. Sur le premier mois d'un exercice qui
  -- s'ouvre en cours de mois civil, p_debut (le 1er) précède le vrai
  -- début (l'immatriculation) — l'ancien test ne trouvait alors rien.
  select date_debut, date_fin, regime_tva into e
  from   public.exercices
  where  p_debut <= date_fin and p_fin >= date_debut
  order  by date_debut desc
  limit  1;

  if not found then
    -- Aucun exercice ne recoupe la période demandée : on prend le
    -- premier exercice connu, pour ne jamais afficher de dates nulles.
    select date_debut, date_fin, regime_tva into e
    from   public.exercices order by date_debut asc limit 1;
  end if;

  -- Les mêmes règles que partout ailleurs.
  select coalesce(sum(public.charge_comptable(
           sens, montant_ht, montant_tva, tva_comptable)), 0)
  into   v_charges from public.pieces
  where  etat = 'validee' and nature in ('achat','creation','km','amortissement')
    and  not public.est_immobilisation(compte)
    and  public.date_ecriture(nature, date_piece) between p_debut and p_fin;

  select coalesce(sum(public.produit_vente_ht(sens, origine, montant_ht, montant_tva, montant_ttc, acomptes_deduits)), 0)
  into   v_produits from public.pieces
  where  etat = 'validee' and nature in ('vente','avoir')
    and  public.date_ecriture(nature, date_piece) between p_debut and p_fin;

  select coalesce(sum(montant_ht), 0) into v_immo
  from   public.pieces
  where  etat = 'validee' and nature in ('achat','creation')
    and  public.est_immobilisation(compte)
    and  public.date_ecriture(nature, date_piece) between p_debut and p_fin;

  select coalesce(sum(r.montant), 0) into v_encaisse
  from   public.reglements r join public.pieces p on p.id = r.piece_id
  where  p.nature = 'vente' and p.etat = 'validee'
    and  coalesce(r.moyen, '') <> 'compensation'
    and  r.date_reglement between p_debut and p_fin;

  return jsonb_build_object(
    'periode_debut', p_debut,
    'periode_fin',   p_fin,
    'exercice_debut', e.date_debut,
    'exercice_fin',   e.date_fin,
    'regime',         e.regime_tva,

    'charges',   v_charges,
    'produits',  v_produits,
    'resultat',  v_produits - v_charges,
    'immobilisations', v_immo,
    'encaisse',  v_encaisse,

    -- Les charges du mois, par poste.
    'postes', (
      select coalesce(jsonb_agg(x order by (x->>'montant')::numeric desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'libelle', coalesce(c.libelle, 'Non classé'),
          'compte',  coalesce(p.compte, '—'),
          'montant', sum(public.charge_comptable(
                       p.sens, p.montant_ht, p.montant_tva, p.tva_comptable)),
          'lignes',  count(*)) as x
        from   public.pieces p
        left join public.categories c on c.id = p.categorie_id
        where  p.etat = 'validee'
          and  p.nature in ('achat','creation','km','amortissement')
          and  not public.est_immobilisation(p.compte)
          and  public.date_ecriture(p.nature, p.date_piece) between p_debut and p_fin
        group  by c.libelle, p.compte
        having sum(public.charge_comptable(
                 p.sens, p.montant_ht, p.montant_tva, p.tva_comptable)) <> 0
      ) s),

    -- Les ventes du mois.
    'ventes', (
      select coalesce(jsonb_agg(x order by x->>'date_piece'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'numero_piece', numero_piece, 'date_piece', date_piece,
          'tiers', tiers_libelle, 'montant_ht', montant_ht,
          'montant_ttc', montant_ttc,
          'regle', montant_regle >= net_a_payer - 0.005) as x
        from   public.pieces
        where  etat = 'validee' and nature = 'vente'
          and  date_piece between p_debut and p_fin
      ) s),

    'tva', jsonb_build_object(
      'collectee', (select coalesce(sum(tva), 0) from public.v_tva_exigible
                    where sens = 'credit'
                      and date_exigibilite between p_debut and p_fin),
      'deductible', (select coalesce(sum(tva), 0) from public.v_tva_exigible
                     where sens = 'debit'
                       and date_exigibilite between p_debut and p_fin)),

    'tresorerie', jsonb_build_object(
      'solde_fin', (
        select coalesce(sum(case when sens = 'credit' then montant else -montant end), 0)
        from   public.transactions_qonto
        where  statut_qonto = 'completed' and date_operation <= p_fin),
      'entrees', (
        select coalesce(sum(montant), 0) from public.transactions_qonto
        where  statut_qonto = 'completed' and sens = 'credit'
          and  date_operation between p_debut and p_fin),
      'sorties', (
        select coalesce(sum(montant), 0) from public.transactions_qonto
        where  statut_qonto = 'completed' and sens = 'debit'
          and  date_operation between p_debut and p_fin),
      'a_encaisser', (
        select coalesce(sum(net_a_payer - montant_regle), 0) from public.pieces
        where  etat = 'validee' and nature = 'vente'
          and  montant_regle < net_a_payer - 0.005 and date_piece <= p_fin),
      'compte_courant', (
        select coalesce(sum(case when sens = 'debit' then montant_ttc
                                 else -montant_ttc end), 0)
        from   public.pieces
        where  etat = 'validee' and moyen_paiement = 'avance_associe'
          and  date_piece <= p_fin)),

    -- Ce qui reste à faire : un rapport honnête dit aussi ce qui manque.
    'points_ouverts', jsonb_build_object(
      'factures_manquantes', (
        select count(*) from public.v_pieces_completes where facture_manquante),
      'sans_ecriture', (
        select count(*) from public.transactions_qonto
        where statut_traitement = 'a_traiter' and statut_qonto = 'completed'
          and abs(montant) > 0.005),
      'a_valider', (
        select count(*) from public.pieces where etat = 'a_valider')),

    -- Le cumul depuis l'ouverture, pour situer le mois.
    'cumul', jsonb_build_object(
      'charges', (
        select coalesce(sum(public.charge_comptable(
                 sens, montant_ht, montant_tva, tva_comptable)), 0)
        from   public.pieces
        where  etat = 'validee'
          and  nature in ('achat','creation','km','amortissement')
          and  not public.est_immobilisation(compte)
          and  public.date_ecriture(nature, date_piece)
               between e.date_debut and p_fin),
      'produits', (
        select coalesce(sum(public.produit_vente_ht(sens, origine, montant_ht, montant_tva, montant_ttc, acomptes_deduits)), 0)
        from   public.pieces
        where  etat = 'validee' and nature in ('vente','avoir')
          and  public.date_ecriture(nature, date_piece)
               between e.date_debut and p_fin))
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.seance_hebdomadaire()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_non_explique jsonb;
  v_a_confirmer  jsonb;
  v_a_valider    jsonb;
  v_anomalies    jsonb;
  v_chiffres     jsonb;
  v_creation     jsonb;
  v_debut_mois   date := date_trunc('month', current_date)::date;
begin
  -- ---- 1. Opérations bancaires sans écriture ----
  select coalesce(jsonb_agg(x order by x->>'date_operation' desc), '[]'::jsonb)
  into   v_non_explique
  from (
    select jsonb_build_object(
      'id', t.id,
      'numero_piece', t.numero_piece,
      'date_operation', t.date_operation,
      'libelle', coalesce(nullif(trim(t.contrepartie),''), t.libelle),
      'montant', abs(t.montant),
      'sens', t.sens,
      'a_justificatif', coalesce(t.chemin_justificatif is not null, false),
      'regle', public.regle_pour_transaction(t.id),
      -- AJOUT : l'avis faible du moteur, jusqu'ici tu.
      'candidat_faible', (
        select jsonb_build_object(
                 'piece_id', c.piece_id, 'piece', c.numero_piece,
                 'tiers', c.tiers, 'score', c.score, 'motifs', c.motifs)
        from   public.candidats_pour_transaction(t.id) c
        where  c.decision = 'incertain'
        order  by c.score desc
        limit  1)
    ) as x
    from public.transactions_qonto t
    where t.statut_traitement = 'a_traiter'
      and t.statut_qonto = 'completed'
      and abs(t.montant) > 0.005
      and not exists (
        select 1 from public.candidats_pour_transaction(t.id) c
        where c.decision in ('automatique','propose'))
  ) s;

  -- ---- 2. Propositions du moteur ----
  select coalesce(jsonb_agg(x order by (x->>'score')::int desc), '[]'::jsonb)
  into   v_a_confirmer
  from (
    select jsonb_build_object(
      'transaction_id', t.id,
      'operation', t.numero_piece,
      'date_operation', t.date_operation,
      'libelle_banque', coalesce(nullif(trim(t.contrepartie),''), t.libelle),
      'montant', abs(t.montant),
      'piece_id', c.piece_id,
      'piece', c.numero_piece,
      'tiers', c.tiers,
      'reste_du', c.reste_du,
      'score', c.score,
      'motifs', c.motifs
    ) as x
    from public.transactions_qonto t
    cross join lateral (
      select * from public.candidats_pour_transaction(t.id)
      where decision in ('automatique','propose')
      order by score desc limit 1
    ) c
    where t.statut_traitement = 'a_traiter'
      and t.statut_qonto = 'completed'
  ) s;

  -- ---- 3. Saisies en attente ----
  select coalesce(jsonb_agg(x order by x->>'date_piece'), '[]'::jsonb)
  into   v_a_valider
  from (
    select jsonb_build_object(
      'id', p.id,
      'nature', p.nature,
      'date_piece', p.date_piece,
      'tiers', p.tiers_libelle,
      'objet', p.objet,
      'montant_ttc', p.montant_ttc,
      'categorie', p.categorie_libelle,
      -- Une facture attendue, pas seulement une facture absente.
      'a_justificatif', (p.nb_justificatifs > 0 or not p.justificatif_requis),
      'extrait_par_ia', p.extrait_par_ia
    ) as x
    from public.v_pieces_completes p
    where p.etat = 'a_valider' and p.nature <> 'creation'
  ) s;

  -- ---- 3 bis. Ce qui attend l'assemblée ----
  select jsonb_build_object(
    'lignes',   count(*),
    'montant',  coalesce(sum(montant_ttc), 0),
    'tva',      coalesce(sum(tva_comptable), 0)
  )
  into   v_creation
  from   public.pieces
  where  nature = 'creation' and etat = 'a_valider';

  -- ---- 4. Anomalies ----
  select coalesce(jsonb_agg(x order by x->>'gravite', x->>'date_piece'), '[]'::jsonb)
  into   v_anomalies
  from (
    -- `facture_manquante` porte la règle : une pièce attendue et absente.
    select jsonb_build_object(
      'gravite', '1', 'type', 'sans_justificatif',
      'id', p.id, 'lien', '/depenses/' || p.id,
      'numero_piece', p.numero_piece, 'date_piece', p.date_piece,
      'tiers', p.tiers_libelle, 'montant_ttc', p.montant_ttc,
      'detail', 'Aucune facture rattachée — TVA non déductible'
    ) as x
    from public.v_pieces_completes p
    where p.facture_manquante

    union all

    select jsonb_build_object(
      'gravite', '2', 'type', 'sans_banque',
      'id', p.id, 'lien', '/depenses/' || p.id,
      'numero_piece', p.numero_piece, 'date_piece', p.date_piece,
      'tiers', p.tiers_libelle, 'montant_ttc', p.montant_ttc,
      'detail', 'Aucune opération bancaire rattachée'
    )
    from public.v_pieces_completes p
    where p.banque_manquante

    union all

    select jsonb_build_object(
      'gravite', '3', 'type', 'impayee',
      'id', p.id, 'lien', '/ventes/' || p.id,
      'numero_piece', p.numero_piece, 'date_piece', p.date_echeance,
      'tiers', p.tiers_libelle, 'montant_ttc', p.net_a_payer - p.montant_regle,
      'detail', 'Échue le ' || to_char(p.date_echeance, 'DD/MM/YYYY') || ', non réglée'
    )
    from public.pieces p
    where p.etat = 'validee' and p.nature = 'vente'
      and p.montant_regle < p.net_a_payer - 0.005
      and p.date_echeance < current_date
  ) s;

  -- ---- 5. Les chiffres ----
  -- Mêmes règles que le tableau de bord : `charge_comptable` pour le
  -- coût réel, `date_ecriture` pour le rattachement à la période.
  v_chiffres := jsonb_build_object(
    'charges_mois', (
      select coalesce(sum(public.charge_comptable(
               sens, montant_ht, montant_tva, tva_comptable)), 0)
      from   public.pieces
      where  etat = 'validee' and nature in ('achat','creation','km')
        and  public.date_ecriture(nature, date_piece) >= v_debut_mois),
    'ventes_mois', (
      select coalesce(sum(public.produit_vente_ht(sens, origine, montant_ht, montant_tva, montant_ttc, acomptes_deduits)), 0)
      from   public.pieces
      where  etat = 'validee' and nature in ('vente','avoir')
        and  public.date_ecriture(nature, date_piece) >= v_debut_mois),
    'encaisse_mois', (
      select coalesce(sum(r.montant), 0)
      from   public.reglements r join public.pieces p on p.id = r.piece_id
      where  p.nature = 'vente' and p.etat = 'validee'
        and  coalesce(r.moyen, '') <> 'compensation'
        and  r.date_reglement >= v_debut_mois),
    'tva_collectee', (
      select coalesce(sum(tva), 0) from public.v_tva_exigible where sens = 'credit'),
    'tva_deductible', (
      select coalesce(sum(tva), 0) from public.v_tva_exigible where sens = 'debit'),
    'a_encaisser', (
      select coalesce(sum(net_a_payer - montant_regle), 0) from public.pieces
      where  etat = 'validee' and nature = 'vente'
        and  montant_regle < net_a_payer - 0.005),
    'compte_courant', (
      select coalesce(sum(case when sens = 'debit' then montant_ttc
                               else -montant_ttc end), 0)
      from   public.pieces
      where  etat = 'validee' and moyen_paiement = 'avance_associe'),
    'solde_banque', (
      select coalesce(sum(case when sens = 'credit' then montant else -montant end), 0)
      from   public.transactions_qonto where statut_qonto = 'completed')
  );

  return jsonb_build_object(
    'non_explique', v_non_explique,
    'a_confirmer',  v_a_confirmer,
    'a_valider',    v_a_valider,
    'anomalies',    v_anomalies,
    'creation',     v_creation,
    'chiffres',     v_chiffres,
    'compteurs', jsonb_build_object(
      'non_explique', jsonb_array_length(v_non_explique),
      'a_confirmer',  jsonb_array_length(v_a_confirmer),
      'a_valider',    jsonb_array_length(v_a_valider),
      'anomalies',    jsonb_array_length(v_anomalies)),
    'close', (jsonb_array_length(v_non_explique) = 0
              and jsonb_array_length(v_a_confirmer) = 0),
    'arretee_le', now()
  );
end;
$function$;

