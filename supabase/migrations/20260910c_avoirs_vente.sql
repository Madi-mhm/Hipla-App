-- ============================================================
-- 20260910c — AVOIRS DE VENTE
--
-- Une facture émise ne s'annule plus : elle se corrige par un avoir,
-- comme l'exige la règle de l'intangibilité des factures. Jusqu'ici :
--   · `annuler_piece` acceptait d'annuler une facture émise, qui
--     sortait alors des totaux et de la TVA sans laisser de trace ;
--   · aucun écran ne permettait de créer un avoir de vente.
--
-- Ce que fait ce script :
--   1. autorise le moyen de règlement « compensation » ;
--   2. `annuler_piece` refuse une facture ou un avoir émis ;
--   3. `creer_avoir_vente` prépare un avoir en brouillon depuis une
--      facture émise, lignes recopiées (modifiables pour un avoir partiel) ;
--   4. `emettre_vente`, à l'émission d'un avoir, éteint ce qui reste dû
--      sur la facture corrigée par deux règlements « compensation »
--      (aucun mouvement bancaire) ; le surplus reste à rembourser ;
--   5. les chiffres d'encaissement ignorent les compensations.
--
-- Aucune donnée n'est modifiée par ce script.
-- ============================================================

-- ------------------------------------------------------------
-- 1. MOYEN « COMPENSATION »
-- ------------------------------------------------------------
alter table public.reglements drop constraint reglements_moyen_check;
alter table public.reglements add constraint reglements_moyen_check
  check (moyen = any (array['carte','virement','prelevement','especes','cheque',
                            'avance_associe','autre','compensation']));

-- ------------------------------------------------------------
-- 2. ANNULATION : jamais une facture émise
-- ------------------------------------------------------------
create or replace function public.annuler_piece(p_id uuid, p_motif text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare p record; v_liberees integer := 0;
begin
  select * into p from public.pieces where id = p_id;
  if not found then raise exception 'Pièce introuvable'; end if;

  if auth.uid() is not null
     and not public.a_permission(public.module_piece(p.nature), 'delete') then
    raise exception 'Permission insuffisante pour annuler cette pièce';
  end if;

  -- Une facture émise a été remise au client : on ne l'efface pas des
  -- comptes, on la corrige. L'avoir garde la trace de la correction.
  if p.nature in ('vente','avoir') and p.etat = 'validee' then
    raise exception
      'Une facture émise ne s''annule pas (%). Établissez un avoir : il la corrige '
      'en gardant la trace, comme la loi l''exige.',
      coalesce(p.numero_piece, 'sans numéro');
  end if;

  if p.etat = 'annulee' then
    raise exception 'Cette pièce est déjà annulée';
  end if;
  if trim(coalesce(p_motif,'')) = '' then
    raise exception 'Un motif d''annulation est obligatoire';
  end if;

  -- Libérer les opérations bancaires : rattachée à l'écriture, puis
  -- rattachée à chaque règlement.
  if p.transaction_id is not null then
    update public.transactions_qonto
    set    statut_traitement = 'a_traiter', depense_id = null,
           rattachement_auto = false, rattache_le = null, rattache_par = null
    where  id = p.transaction_id;
    v_liberees := v_liberees + 1;
  end if;

  update public.transactions_qonto t
  set    statut_traitement = 'a_traiter', depense_id = null,
         rattachement_auto = false, rattache_le = null, rattache_par = null
  from   public.reglements r
  where  r.piece_id = p_id and r.transaction_id = t.id;

  -- Les règlements disparaissent avec l'écriture : ils n'ont plus d'objet.
  delete from public.reglements where piece_id = p_id;

  update public.pieces
  set    etat = 'annulee',
         motif_annulation = trim(p_motif),
         annule_le = now(), annule_par = auth.uid(),
         transaction_id = null,
         modifie_le = now()
  where  id = p_id;

  perform public.journaliser(
    'annulation', 'pieces', p_id::text,
    jsonb_build_object(
      'resume', coalesce(p.numero_piece,'(brouillon)') || ' annulée · '
                || p.tiers_libelle,
      'motif', p_motif,
      'operations_liberees', v_liberees
    )
  );

  return jsonb_build_object('id', p_id, 'etat', 'annulee',
                            'operations_liberees', v_liberees);
end;
$function$;

-- ------------------------------------------------------------
-- 3. PRÉPARER UN AVOIR DEPUIS UNE FACTURE ÉMISE
-- ------------------------------------------------------------
create or replace function public.creer_avoir_vente(p_facture uuid, p_motif text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  f      record;
  v_id   uuid;
  v_res  jsonb;
  v_motif text := nullif(trim(coalesce(p_motif, '')), '');
begin
  if auth.uid() is not null and not public.a_permission('ventes','create') then
    raise exception 'Permission insuffisante';
  end if;

  select * into f from public.pieces where id = p_facture;
  if not found or f.nature <> 'vente' then
    raise exception 'Facture introuvable';
  end if;
  if f.etat <> 'validee' then
    raise exception
      'Seule une facture émise se corrige par un avoir. Un brouillon se modifie ou se supprime.';
  end if;

  -- Un avoir en préparation existe déjà pour cette facture : on le rouvre
  -- plutôt que d'en créer un second.
  select id into v_id from public.pieces
  where  nature = 'avoir' and piece_liee_id = f.id and etat = 'brouillon'
  limit  1;
  if found then
    return jsonb_build_object('id', v_id, 'existant', true);
  end if;

  v_res := public.creer_vente(
    p_tiers      => f.tiers_id,
    p_nature     => 'avoir',
    p_date       => current_date,
    p_objet      => 'Avoir sur la facture ' || f.numero_piece
                    || coalesce(' — ' || v_motif, ''),
    p_delai      => 0::smallint,
    p_piece_liee => f.id,
    p_notes      => v_motif
  );
  v_id := (v_res->>'id')::uuid;

  -- Les lignes de la facture, à l'identique : un avoir total est prêt à
  -- émettre ; pour un avoir partiel, on retire ou corrige des lignes.
  insert into public.pieces_lignes (
    piece_id, ordre, prestation_id, libelle, description, quantite, unite,
    prix_unitaire_ht, remise_pct, taux_tva, montant_ht, montant_tva, montant_ttc
  )
  select v_id, ordre, prestation_id, libelle, description, quantite, unite,
         prix_unitaire_ht, remise_pct, taux_tva, montant_ht, montant_tva, montant_ttc
  from   public.pieces_lignes
  where  piece_id = f.id
  order  by ordre;

  update public.pieces
  set    date_prestation = f.date_prestation,
         periode_debut   = f.periode_debut,
         periode_fin     = f.periode_fin,
         attendu_en_banque = false,
         modifie_le      = now()
  where  id = v_id;

  perform public.journaliser(
    'creation', 'pieces', v_id::text,
    jsonb_build_object('resume', 'Avoir préparé sur ' || f.numero_piece || ' · ' || f.tiers_libelle,
                       'motif', v_motif));

  return jsonb_build_object('id', v_id, 'existant', false);
end;
$function$;

revoke execute on function public.creer_avoir_vente(uuid, text) from public, anon;
grant  execute on function public.creer_avoir_vente(uuid, text) to authenticated, service_role;

-- ------------------------------------------------------------
-- 4. ÉMISSION : un avoir éteint ce qui reste dû sur sa facture
-- ------------------------------------------------------------
create or replace function public.emettre_vente(p_piece uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  p        record;
  t        record;
  e        record;
  f        record;
  v_lignes integer;
  v_piece  text;
  v_comp   numeric := 0;
  -- `f` n'est lu que si `v_lie` : lire un champ d'un record jamais
  -- rempli lève une erreur, même dans une condition déjà fausse.
  v_lie    boolean := false;
  v_facture text;
begin
  if auth.uid() is not null and not public.a_permission('ventes','validate') then
    raise exception 'Permission insuffisante pour émettre';
  end if;

  select * into p from public.pieces where id = p_piece;
  if not found then raise exception 'Pièce introuvable'; end if;
  if p.nature not in ('vente','avoir') then
    raise exception 'Seule une vente ou un avoir s''émet';
  end if;
  if p.etat <> 'brouillon' then
    raise exception 'Ce document est déjà émis ou annulé (état : %)', p.etat;
  end if;

  select * into t from public.tiers where id = p.tiers_id;
  select * into e from public.entreprise limit 1;

  select count(*) into v_lignes from public.pieces_lignes where piece_id = p_piece;
  if v_lignes = 0 then raise exception 'Document sans ligne : rien à facturer.'; end if;
  if coalesce(p.montant_ttc,0) <= 0 then
    raise exception 'Montant nul. Vérifiez les lignes avant d''émettre.';
  end if;

  if e.iban is null then
    raise exception 'IBAN de l''entreprise absent : la facture ne serait pas payable.';
  end if;
  if t.adresse is null or t.code_postal is null or t.ville is null then
    raise exception 'Adresse du client incomplète : mention obligatoire.';
  end if;
  if p.date_prestation is null and p.periode_debut is null then
    raise exception
      'Date de prestation absente. Une date, ou une période pour un contrat récurrent.';
  end if;
  if t.type = 'particulier' and e.mediateur_nom is null then
    raise exception
      'Client particulier : les coordonnées du médiateur de la consommation '
      'sont obligatoires. Réglages → Entreprise.';
  end if;

  -- Un avoir ne peut pas dépasser la facture qu'il corrige.
  if p.nature = 'avoir' and p.piece_liee_id is not null then
    select * into f from public.pieces where id = p.piece_liee_id;
    if found then
      v_lie := true;
      v_facture := f.numero_piece;
      if p.montant_ttc > f.montant_ttc + 0.005 then
        raise exception 'L''avoir (% €) dépasse la facture % (% €).',
          to_char(p.montant_ttc, 'FM999999D00'), f.numero_piece,
          to_char(f.montant_ttc, 'FM999999D00');
      end if;
    end if;
  end if;

  v_piece := public.numeroter_piece(p_piece);

  update public.pieces
  set    etat = 'validee',
         mentions_gelees = public.mentions_entreprise(),
         emise_le = now(), emise_par = auth.uid(),
         valide_par = auth.uid(), valide_le = now(),
         modifie_le = now()
  where  id = p_piece;

  -- AVOIR : il éteint d'abord ce qui reste dû sur la facture corrigée.
  -- Deux règlements « compensation », sans mouvement bancaire : la
  -- facture n'est plus à relancer et la TVA des deux pièces s'annule.
  -- Le surplus éventuel (facture déjà payée) reste à rembourser.
  if v_lie then
    if f.nature = 'vente' and f.etat = 'validee' then
      v_comp := least(greatest(f.net_a_payer - f.montant_regle, 0), p.montant_ttc);
      if v_comp > 0.005 then
        insert into public.reglements
          (piece_id, date_reglement, montant, moyen, reference, notes, cree_par)
        values
          (f.id, p.date_piece, v_comp, 'compensation', v_piece,
           'Soldée par l''avoir ' || v_piece, auth.uid()),
          (p.id, p.date_piece, v_comp, 'compensation', v_facture,
           'Imputé sur la facture ' || v_facture, auth.uid());
      end if;
    end if;
    update public.pieces
    set    attendu_en_banque = (p.montant_ttc - v_comp) > 0.005
    where  id = p_piece;
  end if;

  perform public.journaliser(
    'emission', 'pieces', p_piece::text,
    jsonb_build_object(
      'resume', v_piece || ' émise · ' || t.nom || ' — '
                || to_char(p.montant_ttc, 'FM999999D00') || ' € TTC'
                || case when v_comp > 0.005
                        then ' · imputé sur ' || v_facture else '' end,
      'champs', jsonb_build_object(
        'client', t.nom, 'type_client', t.type,
        'montant_ht', p.montant_ht, 'montant_tva', p.montant_tva,
        'montant_ttc', p.montant_ttc, 'date_echeance', p.date_echeance,
        'compensation', v_comp)
    )
  );

  return jsonb_build_object('id', p_piece, 'numero_piece', v_piece,
                            'etat', 'validee', 'montant_ttc', p.montant_ttc,
                            'compensation', v_comp);
end;
$function$;


-- ------------------------------------------------------------
-- 5. ENCAISSEMENTS : une compensation n'est pas de l'argent reçu
-- (définitions reprises de la base, seule la ligne marquée change)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.etat_ventes()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'brouillons', (select count(*) from public.pieces
                   where nature = 'vente' and etat = 'brouillon'),
    'emises',     (select count(*) from public.pieces
                   where nature = 'vente' and etat = 'validee'),
    -- Le chiffre d'affaires ENCAISSÉ : c'est lui qui porte la TVA.
    'ca_encaisse', (
      select coalesce(sum(round(r.montant / (1 + p.taux_tva / 100), 2)), 0)
      from   public.reglements r join public.pieces p on p.id = r.piece_id
      where  p.nature = 'vente' and p.etat = 'validee'
        and  coalesce(r.moyen, '') <> 'compensation'),
    'tva_collectee', (
      select coalesce(sum(tva), 0) from public.v_tva_exigible where sens = 'credit'),
    'en_attente', (
      select coalesce(sum(net_a_payer - montant_regle), 0) from public.pieces
      where  nature = 'vente' and etat = 'validee'
        and  montant_regle < net_a_payer - 0.005),
    'nb_en_attente', (
      select count(*) from public.pieces
      where  nature = 'vente' and etat = 'validee'
        and  montant_regle < net_a_payer - 0.005),
    -- Impayée : échue ET non soldée. Avant l'échéance, elle attend.
    'impayees', (
      select count(*) from public.pieces
      where  nature = 'vente' and etat = 'validee'
        and  montant_regle < net_a_payer - 0.005
        and  date_echeance < current_date),
    'anomalies', (
      select count(*) from public.pieces p
      where  p.nature = 'vente' and p.etat = 'validee'
        and  (not exists (select 1 from public.pieces_lignes l where l.piece_id = p.id)
              or p.acomptes_deduits > p.montant_ttc + 0.005
              or exists (select 1 from public.reglements r
                         where r.piece_id = p.id and r.date_reglement is null)))
  );
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

  select coalesce(sum(case when sens = 'credit' then montant_ht
                           else -montant_ht end), 0)
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
        select coalesce(sum(case when sens = 'credit' then montant_ht
                                 else -montant_ht end), 0)
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
      select coalesce(sum(case when sens = 'credit' then montant_ht
                               else -montant_ht end), 0)
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
