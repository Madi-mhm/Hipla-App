-- ============================================================
-- SCHÉMA COMPLET DE LA BASE — exporté de la base de production
-- le 2026-09-11T14:15:27.336Z (lecture seule). Ne pas modifier à la main :
-- ce fichier se régénère. Les changements passent par supabase/migrations.
-- ============================================================
set check_function_bodies = off;

-- ---------- Extensions ----------
create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists pg_trgm with schema public;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists uuid-ossp with schema extensions;

-- ---------- Types ----------
create type public.role_utilisateur as enum ('proprietaire', 'contributeur', 'comptable', 'salarie', 'lecture_seule');

-- ---------- Séquences ----------
create sequence if not exists public.audit_id_seq as bigint start 1 increment 1;

-- ---------- Tables ----------
create table public.abonnement_echeances (
  id uuid default gen_random_uuid() not null,
  abonnement_id uuid not null,
  periode text not null,
  date_prevue date not null,
  date_constatee date,
  montant_prevu numeric(12,2) not null,
  montant_reel numeric(12,2),
  statut text default 'attendue'::text not null,
  depense_id uuid,
  transaction_qonto_id text,
  cree_le timestamp with time zone default now() not null,
  piece_id uuid
);
create table public.abonnements (
  id uuid default gen_random_uuid() not null,
  numero_piece text,
  nom text not null,
  fournisseur text not null,
  categorie_id uuid,
  montant_ht numeric(12,2) default 0 not null,
  taux_tva numeric(4,2) default 20.00 not null,
  montant_tva numeric(12,2) default 0 not null,
  montant_ttc numeric(12,2) default 0 not null,
  devise text default 'EUR'::text not null,
  autoliquidation boolean default false not null,
  pays_prestataire text default 'FR'::text not null,
  periodicite text default 'mensuel'::text not null,
  date_debut date not null,
  date_fin date,
  mode_paiement text default 'carte'::text,
  engagement_jusquau date,
  preavis_jours smallint default 30,
  url_espace_client text,
  identifiant_contrat text,
  statut text default 'actif'::text not null,
  motif_resiliation text,
  notes text,
  cree_par uuid,
  cree_le timestamp with time zone default now() not null,
  modifie_le timestamp with time zone default now() not null
);
create table public.alias_bancaires (
  id uuid default gen_random_uuid() not null,
  libelle_normalise text not null,
  tiers_id uuid,
  categorie_id uuid,
  occurrences integer default 1 not null,
  derniere_le date default CURRENT_DATE not null,
  cree_le timestamp with time zone default now() not null
);
create table public.associes (
  id uuid default gen_random_uuid() not null,
  profil_id uuid,
  identifiant text not null,
  nom text not null,
  prenom text not null,
  date_naissance date,
  lieu_naissance text,
  nationalite text default 'Française'::text,
  adresse text,
  code_postal text,
  ville text,
  telephone text,
  email text,
  parts integer default 0 not null,
  capital_souscrit numeric(12,2) default 0 not null,
  capital_libere numeric(12,2) default 0 not null,
  fonction text,
  date_entree date,
  date_sortie date,
  actif boolean default true not null,
  notes text,
  cree_le timestamp with time zone default now() not null,
  modifie_le timestamp with time zone default now() not null
);
create table public.audit (
  id bigint default nextval('audit_id_seq'::regclass) not null,
  utilisateur uuid,
  email text,
  action text not null,
  table_cible text,
  id_cible text,
  details jsonb,
  adresse_ip text,
  horodatage timestamp with time zone default now() not null
);
create table public.bareme_km (
  id uuid default gen_random_uuid() not null,
  annee smallint not null,
  cv_min smallint not null,
  cv_max smallint not null,
  km_min integer not null,
  km_max integer,
  coefficient numeric(6,4) not null,
  forfait numeric(8,2) default 0 not null
);
create table public.categories (
  id uuid default gen_random_uuid() not null,
  libelle text not null,
  compte text not null,
  groupe text not null,
  taux_tva_defaut numeric(4,2) default 20.00 not null,
  taux_deductibilite smallint default 100 not null,
  type text default 'charge'::text not null,
  duree_amortissement smallint,
  avertissement text,
  bloque boolean default false not null,
  actif boolean default true not null,
  ordre smallint default 100 not null,
  cree_le timestamp with time zone default now() not null,
  type_operation text default 'service'::text not null,
  justificatif_requis boolean default true not null
);
create table public.clients (
  id uuid default gen_random_uuid() not null,
  numero_piece text,
  type text default 'particulier'::text not null,
  nom text not null,
  contact text,
  email text,
  telephone text,
  adresse text,
  code_postal text,
  ville text,
  pays text default 'France'::text not null,
  siret text,
  tva_intracom text,
  delai_paiement smallint default 15 not null,
  notes text,
  actif boolean default true not null,
  cree_par uuid,
  cree_le timestamp with time zone default now() not null,
  modifie_le timestamp with time zone default now() not null
);
create table public.commentaires (
  id uuid default gen_random_uuid() not null,
  table_cible text not null,
  id_cible uuid,
  numero_piece text,
  contenu text not null,
  type text default 'remarque'::text not null,
  statut text default 'ouvert'::text not null,
  resolu_par uuid,
  resolu_le timestamp with time zone,
  reponse text,
  cree_par uuid not null,
  cree_le timestamp with time zone default now() not null
);
create table public.compteurs_piece (
  prefixe text not null,
  annee smallint not null,
  dernier integer default 0 not null
);
create table public.contrat_echeances (
  id uuid default gen_random_uuid() not null,
  contrat_id uuid not null,
  periode text not null,
  date_prevue date not null,
  montant_prevu numeric(12,2) not null,
  statut text default 'attendue'::text not null,
  piece_id uuid,
  motif text,
  cree_le timestamp with time zone default now() not null
);
create table public.contrats (
  id uuid default gen_random_uuid() not null,
  reference text,
  tiers_id uuid not null,
  libelle text not null,
  objet text,
  prestation_id uuid,
  designation text not null,
  quantite numeric(12,3) default 1 not null,
  prix_unitaire_ht numeric(12,2) not null,
  unite text,
  taux_tva numeric(4,2) default 20.00 not null,
  periodicite text default 'mensuel'::text not null,
  jour_facturation smallint default 1 not null,
  date_debut date not null,
  date_fin date,
  engagement_jusquau date,
  preavis_jours smallint default 30,
  adresse_site text,
  agents_repris smallint default 0,
  actif boolean default true not null,
  notes text,
  cree_le timestamp with time zone default now() not null,
  cree_par uuid,
  modifie_le timestamp with time zone default now() not null
);
create table public.declarations_tva (
  id uuid default gen_random_uuid() not null,
  periode_debut date not null,
  periode_fin date not null,
  regime text not null,
  formulaire text not null,
  collectee numeric(12,2) not null,
  deductible numeric(12,2) not null,
  solde numeric(12,2) not null,
  detail jsonb not null,
  ventilation jsonb not null,
  depose_le date,
  reference text,
  notes text,
  etat text default 'preparee'::text not null,
  cloture_le timestamp with time zone default now() not null,
  cloture_par uuid,
  motif_annulation text
);
create table public.deplacements (
  id uuid default gen_random_uuid() not null,
  date_trajet date not null,
  vehicule_id uuid not null,
  depart text not null,
  arrivee text not null,
  motif text not null,
  kilometres numeric(8,1) not null,
  aller_retour boolean default false not null,
  statut text default 'en_attente'::text not null,
  cree_par uuid not null,
  cree_le timestamp with time zone default now() not null,
  valide_par uuid,
  valide_le timestamp with time zone,
  motif_rejet text,
  numero_piece text,
  revu_le timestamp with time zone,
  revu_par uuid,
  annule_le timestamp with time zone,
  annule_par uuid,
  motif_annulation text
);
create table public.documents_permanents (
  id uuid default gen_random_uuid() not null,
  type_document text not null,
  libelle text not null,
  reference text,
  chemin text not null,
  nom_original text not null,
  type_mime text not null,
  taille_octets integer not null,
  date_document date not null,
  date_effet date,
  date_expiration date,
  remplace_id uuid,
  en_vigueur boolean default true not null,
  notes text,
  cree_le timestamp with time zone default now() not null,
  cree_par uuid
);
create table public.entreprise (
  id uuid default gen_random_uuid() not null,
  raison_sociale text not null,
  forme_juridique text not null,
  capital numeric(12,2) not null,
  siren text not null,
  siret text not null,
  rcs text,
  tva_intracom text,
  code_ape text,
  adresse text not null,
  code_postal text not null,
  ville text not null,
  president text not null,
  directeur_general text,
  email text,
  telephone text,
  modifie_le timestamp with time zone default now() not null,
  modifie_par uuid,
  iban text,
  bic text,
  banque_nom text,
  banque_adresse text,
  penalites_mode text default 'taux_legal_triple'::text not null,
  penalites_taux numeric(5,2),
  indemnite_recouvrement numeric(6,2) default 40.00 not null,
  escompte_accorde boolean default false not null,
  conditions_generales text,
  mediateur_nom text,
  mediateur_adresse text,
  mediateur_site text,
  rc_pro_assureur text,
  rc_pro_police text,
  rc_pro_couverture text,
  site_web text,
  logo_chemin text
);
create table public.exercices (
  id uuid default gen_random_uuid() not null,
  date_debut date not null,
  date_fin date not null,
  statut text default 'ouvert'::text not null,
  regime_tva text not null,
  cree_le timestamp with time zone default now() not null,
  cloture_le timestamp with time zone,
  cloture_par uuid
);
create table public.fournisseurs_connus (
  fournisseur text not null,
  categorie_id uuid,
  occurrences integer default 1 not null,
  siret text,
  tva text,
  derniere_vue timestamp with time zone default now() not null
);
create table public.immobilisations (
  id uuid default gen_random_uuid() not null,
  piece_id uuid not null,
  libelle text not null,
  compte text not null,
  date_acquisition date not null,
  date_mise_en_service date not null,
  base_amortissable numeric(12,2) not null,
  valeur_residuelle numeric(12,2) default 0 not null,
  duree_annees smallint not null,
  mode text default 'lineaire'::text not null,
  date_sortie date,
  motif_sortie text,
  prix_cession numeric(12,2),
  notes text,
  cree_le timestamp with time zone default now() not null,
  cree_par uuid
);
create table public.justificatifs (
  id uuid default gen_random_uuid() not null,
  depense_id uuid,
  chemin text not null,
  nom_original text not null,
  type_mime text not null,
  taille_octets integer not null,
  taille_origine integer,
  cree_par uuid,
  cree_le timestamp with time zone default now() not null,
  frais_creation_id uuid,
  piece_id uuid
);
create table public.libelles_bancaires (
  motif text not null,
  fournisseur text not null,
  categorie_id uuid,
  occurrences integer default 1 not null,
  derniere_vue timestamp with time zone default now() not null
);
create table public.obligations (
  id uuid default gen_random_uuid() not null,
  libelle text not null,
  reference text,
  date_limite date not null,
  categorie text default 'fiscale'::text not null,
  periodicite text,
  accomplie_le date,
  reference_depot text,
  notes text,
  cree_le timestamp with time zone default now() not null
);
create table public.obligations_suivi (
  cle text not null,
  fait_le date not null,
  reference text,
  note text,
  fait_par uuid default auth.uid(),
  modifie_le timestamp with time zone default now() not null
);
create table public.permissions (
  role role_utilisateur not null,
  module text not null,
  action text not null
);
create table public.pieces (
  id uuid default gen_random_uuid() not null,
  numero_piece text,
  nature text not null,
  sens text not null,
  origine text default 'saisie'::text not null,
  date_piece date not null,
  tiers_id uuid,
  tiers_libelle text not null,
  objet text,
  categorie_id uuid,
  compte text,
  montant_ht numeric(12,2) default 0 not null,
  taux_tva numeric(5,2) default 20.00 not null,
  montant_tva numeric(12,2) default 0 not null,
  montant_ttc numeric(12,2) default 0 not null,
  tva_comptable numeric(12,2) default 0 not null,
  taux_deductibilite smallint default 100 not null,
  type_operation text default 'service'::text not null,
  etat text default 'brouillon'::text not null,
  paye_le date,
  montant_regle numeric(12,2) default 0 not null,
  moyen_paiement text,
  paye_par text,
  date_echeance date,
  attendu_en_banque boolean default true not null,
  transaction_id uuid,
  numero_externe text,
  piece_liee_id uuid,
  source_table text,
  source_id uuid,
  notes text,
  cree_par uuid,
  cree_le timestamp with time zone default now() not null,
  valide_par uuid,
  valide_le timestamp with time zone,
  motif_rejet text,
  annule_le timestamp with time zone,
  annule_par uuid,
  motif_annulation text,
  modifie_le timestamp with time zone default now() not null,
  date_prestation date,
  periode_debut date,
  periode_fin date,
  delai_paiement smallint default 15 not null,
  acomptes_deduits numeric(12,2) default 0 not null,
  mentions_gelees jsonb,
  emise_le timestamp with time zone,
  emise_par uuid,
  relances_envoyees smallint default 0 not null,
  derniere_relance date,
  extrait_par_ia boolean default false not null,
  confiance_extraction numeric(3,2),
  net_a_payer numeric(12,2) default (montant_ttc - acomptes_deduits),
  regime_tva text default 'france'::text not null,
  tva_autoliquidee numeric(12,2) default 0 not null,
  revu_le timestamp with time zone,
  revu_par uuid,
  justificatif_exige boolean,
  motif_exemption text,
  valable_jusquau date,
  devis_statut text,
  facture_issue_id uuid
);
create table public.pieces_lignes (
  id uuid default gen_random_uuid() not null,
  piece_id uuid not null,
  ordre smallint default 1 not null,
  prestation_id uuid,
  libelle text not null,
  description text,
  quantite numeric(10,2) default 1 not null,
  unite text,
  prix_unitaire_ht numeric(12,2) default 0 not null,
  remise_pct numeric(5,2) default 0 not null,
  taux_tva numeric(5,2) default 20.00 not null,
  montant_ht numeric(12,2) default 0 not null,
  montant_tva numeric(12,2) default 0 not null,
  montant_ttc numeric(12,2) default 0 not null,
  source_id uuid,
  cree_le timestamp with time zone default now() not null
);
create table public.prestations (
  id uuid default gen_random_uuid() not null,
  libelle text not null,
  description text,
  groupe text default 'Nettoyage'::text not null,
  prix_ht numeric(12,2) default 0 not null,
  unite text default 'forfait'::text not null,
  taux_tva numeric(4,2) default 20.00 not null,
  compte text default '706'::text not null,
  actif boolean default true not null,
  ordre smallint default 100 not null,
  cree_le timestamp with time zone default now() not null
);
create table public.profils (
  id uuid not null,
  email text not null,
  nom_complet text not null,
  role role_utilisateur default 'contributeur'::role_utilisateur not null,
  actif boolean default true not null,
  cree_le timestamp with time zone default now() not null,
  modifie_le timestamp with time zone default now() not null
);
create table public.reglements (
  id uuid default gen_random_uuid() not null,
  piece_id uuid not null,
  date_reglement date not null,
  montant numeric(12,2) not null,
  moyen text,
  transaction_id uuid,
  reference text,
  notes text,
  cree_par uuid,
  cree_le timestamp with time zone default now() not null
);
create table public.regles_appariement (
  id uuid default gen_random_uuid() not null,
  libelle text not null,
  motif text not null,
  sens text,
  tiers_id uuid,
  categorie_id uuid,
  taux_tva numeric(5,2),
  moyen_paiement text,
  jamais_automatique boolean default false not null,
  actif boolean default true not null,
  ordre smallint default 100 not null,
  occurrences integer default 0 not null,
  cree_par uuid,
  cree_le timestamp with time zone default now() not null
);
create table public.relances (
  id uuid default gen_random_uuid() not null,
  piece_id uuid not null,
  degre text not null,
  envoyee_le date default CURRENT_DATE not null,
  reste_du numeric(12,2) not null,
  jours_retard integer not null,
  moyen text,
  notes text,
  cree_le timestamp with time zone default now() not null,
  cree_par uuid
);
create table public.sauvegardes (
  id uuid default gen_random_uuid() not null,
  demarree_le timestamp with time zone default now() not null,
  terminee_le timestamp with time zone,
  declencheur text default 'cron'::text not null,
  statut text default 'en_cours'::text not null,
  chemin_dump text,
  taille_dump bigint,
  lignes_totales integer,
  tables_sauvees integer,
  fichiers_copies integer default 0,
  fichiers_ignores integer default 0,
  octets_copies bigint default 0,
  duree_ms integer,
  erreur text,
  detail jsonb,
  lance_par uuid
);
create table public.synchronisations (
  id uuid default gen_random_uuid() not null,
  demarree_le timestamp with time zone default now() not null,
  terminee_le timestamp with time zone,
  declencheur text default 'cron'::text not null,
  statut text default 'en_cours'::text not null,
  transactions_lues integer default 0,
  transactions_nouvelles integer default 0,
  rapprochees_auto integer default 0,
  solde_qonto numeric(12,2),
  duree_ms integer,
  erreur text,
  detail jsonb
);
create table public.taches (
  id uuid default gen_random_uuid() not null,
  titre text not null,
  description text,
  echeance date,
  priorite text default 'normale'::text not null,
  statut text default 'a_faire'::text not null,
  table_cible text,
  id_cible uuid,
  numero_piece text,
  assignee_a uuid,
  cree_par uuid not null,
  cree_le timestamp with time zone default now() not null,
  faite_le timestamp with time zone,
  recurrence text
);
create table public.tiers (
  id uuid default gen_random_uuid() not null,
  reference text,
  nom text not null,
  type text default 'professionnel'::text not null,
  est_client boolean default false not null,
  est_fournisseur boolean default false not null,
  contact text,
  email text,
  telephone text,
  adresse text,
  code_postal text,
  ville text,
  pays text default 'France'::text not null,
  siret text,
  tva_intracom text,
  delai_paiement smallint default 15 not null,
  notes text,
  actif boolean default true not null,
  source_table text,
  source_id uuid,
  cree_par uuid,
  cree_le timestamp with time zone default now() not null,
  modifie_le timestamp with time zone default now() not null,
  pays_code text default 'FR'::text not null,
  numero_tva text
);
create table public.transactions_qonto (
  id uuid default gen_random_uuid() not null,
  qonto_id text not null,
  numero_piece text,
  date_operation date not null,
  date_valeur date,
  libelle text not null,
  contrepartie text,
  reference text,
  montant numeric(12,2) not null,
  sens text not null,
  devise text default 'EUR'::text not null,
  statut_qonto text default 'completed'::text not null,
  categorie_qonto text,
  a_justificatif boolean default false not null,
  justificatif_recupere boolean default false not null,
  statut_traitement text default 'a_traiter'::text not null,
  motif_ecart text,
  depense_id uuid,
  echeance_id uuid,
  rattachement_auto boolean default false not null,
  rattache_le timestamp with time zone,
  rattache_par uuid,
  synchronise_le timestamp with time zone default now() not null,
  chemin_justificatif text,
  nom_justificatif text,
  type_justificatif text,
  justificatif_traite boolean default false not null,
  erreur_traitement text,
  qonto_uuid uuid,
  attachment_ids text[]
);
create table public.usage_ia (
  id uuid default gen_random_uuid() not null,
  horodatage timestamp with time zone default now() not null,
  utilisateur uuid,
  operation text default 'extraction_facture'::text not null,
  modele text not null,
  tokens_entree integer default 0 not null,
  tokens_sortie integer default 0 not null,
  cout_estime numeric(10,6) default 0 not null,
  nom_fichier text,
  taille_octets integer,
  succes boolean default true not null,
  confiance numeric(3,2),
  erreur text,
  depense_id uuid,
  duree_ms integer
);
create table public.vehicules (
  id uuid default gen_random_uuid() not null,
  libelle text not null,
  immatriculation text not null,
  proprietaire uuid,
  proprietaire_nom text not null,
  cv_fiscaux smallint not null,
  motorisation text default 'thermique'::text not null,
  genre text default 'VP'::text not null,
  usage_societe boolean default false not null,
  date_ct date,
  actif boolean default true not null,
  cree_le timestamp with time zone default now() not null
);

-- ---------- Contraintes (clés étrangères en dernier) ----------
alter table abonnement_echeances add constraint abonnement_echeances_abonnement_id_periode_key UNIQUE (abonnement_id, periode);
alter table abonnement_echeances add constraint abonnement_echeances_pkey PRIMARY KEY (id);
alter table abonnement_echeances add constraint abonnement_echeances_statut_check CHECK ((statut = ANY (ARRAY['attendue'::text, 'payee'::text, 'justificatif_manquant'::text, 'ecart'::text, 'annulee'::text])));
alter table abonnements add constraint abonnements_coherence CHECK ((abs(((montant_ht + montant_tva) - montant_ttc)) < 0.02));
alter table abonnements add constraint abonnements_mode_paiement_check CHECK ((mode_paiement = ANY (ARRAY['carte'::text, 'prelevement'::text, 'virement'::text, 'autre'::text])));
alter table abonnements add constraint abonnements_montant_ht_check CHECK ((montant_ht >= (0)::numeric));
alter table abonnements add constraint abonnements_pays_prestataire_check CHECK ((pays_prestataire = ANY (ARRAY['FR'::text, 'UE'::text, 'HORS_UE'::text])));
alter table abonnements add constraint abonnements_periodicite_check CHECK ((periodicite = ANY (ARRAY['mensuel'::text, 'trimestriel'::text, 'annuel'::text])));
alter table abonnements add constraint abonnements_pkey PRIMARY KEY (id);
alter table abonnements add constraint abonnements_statut_check CHECK ((statut = ANY (ARRAY['actif'::text, 'gratuit'::text, 'suspendu'::text, 'resilie'::text])));
alter table alias_bancaires add constraint alias_bancaires_libelle_normalise_key UNIQUE (libelle_normalise);
alter table alias_bancaires add constraint alias_bancaires_pkey PRIMARY KEY (id);
alter table associes add constraint associes_fonction_check CHECK ((fonction = ANY (ARRAY['president'::text, 'directeur_general'::text, 'associe'::text])));
alter table associes add constraint associes_identifiant_check CHECK ((identifiant = lower(TRIM(BOTH FROM identifiant))));
alter table associes add constraint associes_identifiant_key UNIQUE (identifiant);
alter table associes add constraint associes_parts_check CHECK ((parts >= 0));
alter table associes add constraint associes_pkey PRIMARY KEY (id);
alter table associes add constraint capital_libere_coherent CHECK ((capital_libere <= (capital_souscrit + 0.005)));
alter table audit add constraint audit_pkey PRIMARY KEY (id);
alter table bareme_km add constraint bareme_km_annee_cv_min_cv_max_km_min_key UNIQUE (annee, cv_min, cv_max, km_min);
alter table bareme_km add constraint bareme_km_pkey PRIMARY KEY (id);
alter table categories add constraint categories_pkey PRIMARY KEY (id);
alter table categories add constraint categories_taux_deductibilite_check CHECK ((taux_deductibilite = ANY (ARRAY[0, 80, 100])));
alter table categories add constraint categories_type_check CHECK ((type = ANY (ARRAY['charge'::text, 'immobilisation'::text])));
alter table categories add constraint categories_type_operation CHECK ((type_operation = ANY (ARRAY['service'::text, 'bien'::text])));
alter table clients add constraint clients_pkey PRIMARY KEY (id);
alter table clients add constraint clients_type_check CHECK ((type = ANY (ARRAY['particulier'::text, 'professionnel'::text, 'syndic'::text, 'conciergerie'::text, 'collectivite'::text])));
alter table commentaires add constraint commentaires_contenu_check CHECK ((length(TRIM(BOTH FROM contenu)) > 0));
alter table commentaires add constraint commentaires_pkey PRIMARY KEY (id);
alter table commentaires add constraint commentaires_statut_check CHECK ((statut = ANY (ARRAY['ouvert'::text, 'resolu'::text])));
alter table commentaires add constraint commentaires_table_cible_check CHECK ((table_cible = ANY (ARRAY['depenses'::text, 'frais_creation'::text, 'deplacements'::text, 'general'::text])));
alter table commentaires add constraint commentaires_type_check CHECK ((type = ANY (ARRAY['remarque'::text, 'anomalie'::text, 'question'::text, 'demande_piece'::text])));
alter table compteurs_piece add constraint compteurs_piece_pkey PRIMARY KEY (prefixe, annee);
alter table contrat_echeances add constraint contrat_echeances_contrat_id_periode_key UNIQUE (contrat_id, periode);
alter table contrat_echeances add constraint contrat_echeances_pkey PRIMARY KEY (id);
alter table contrat_echeances add constraint contrat_echeances_statut_check CHECK ((statut = ANY (ARRAY['attendue'::text, 'facturee'::text, 'sautee'::text, 'annulee'::text])));
alter table contrats add constraint contrats_jour_facturation_check CHECK (((jour_facturation >= 1) AND (jour_facturation <= 31)));
alter table contrats add constraint contrats_periodicite_check CHECK ((periodicite = ANY (ARRAY['hebdomadaire'::text, 'mensuel'::text, 'trimestriel'::text, 'annuel'::text])));
alter table contrats add constraint contrats_pkey PRIMARY KEY (id);
alter table contrats add constraint contrats_prix_unitaire_ht_check CHECK ((prix_unitaire_ht >= (0)::numeric));
alter table contrats add constraint contrats_quantite_check CHECK ((quantite > (0)::numeric));
alter table declarations_tva add constraint declarations_tva_etat_check CHECK ((etat = ANY (ARRAY['preparee'::text, 'deposee'::text, 'annulee'::text])));
alter table declarations_tva add constraint declarations_tva_formulaire_check CHECK ((formulaire = ANY (ARRAY['CA12E'::text, 'CA3'::text])));
alter table declarations_tva add constraint declarations_tva_pkey PRIMARY KEY (id);
alter table declarations_tva add constraint declarations_tva_regime_check CHECK ((regime = ANY (ARRAY['simplifie'::text, 'reel_normal'::text])));
alter table declarations_tva add constraint periode_coherente CHECK ((periode_fin >= periode_debut));
alter table deplacements add constraint deplacements_kilometres_check CHECK ((kilometres > (0)::numeric));
alter table deplacements add constraint deplacements_pkey PRIMARY KEY (id);
alter table deplacements add constraint deplacements_statut_check CHECK ((statut = ANY (ARRAY['en_attente'::text, 'validee'::text, 'rejetee'::text, 'annulee'::text])));
alter table documents_permanents add constraint documents_permanents_pkey PRIMARY KEY (id);
alter table documents_permanents add constraint documents_permanents_type_document_check CHECK ((type_document = ANY (ARRAY['statuts'::text, 'kbis'::text, 'capital'::text, 'pv_assemblee'::text, 'contrat'::text, 'assurance'::text, 'bail'::text, 'attestation'::text, 'fiscal'::text, 'autre'::text])));
alter table entreprise add constraint entreprise_penalites_mode CHECK ((penalites_mode = ANY (ARRAY['taux_legal_triple'::text, 'taux_fixe'::text])));
alter table entreprise add constraint entreprise_penalites_taux CHECK (((penalites_mode <> 'taux_fixe'::text) OR (penalites_taux IS NOT NULL)));
alter table entreprise add constraint entreprise_pkey PRIMARY KEY (id);
alter table exercices add constraint exercices_pkey PRIMARY KEY (id);
alter table exercices add constraint exercices_regime_tva_check CHECK ((regime_tva = ANY (ARRAY['simplifie'::text, 'reel_normal'::text])));
alter table exercices add constraint exercices_statut_check CHECK ((statut = ANY (ARRAY['ouvert'::text, 'clos'::text])));
alter table fournisseurs_connus add constraint fournisseurs_connus_pkey PRIMARY KEY (fournisseur);
alter table immobilisations add constraint immobilisations_base_amortissable_check CHECK ((base_amortissable > (0)::numeric));
alter table immobilisations add constraint immobilisations_duree_annees_check CHECK (((duree_annees >= 1) AND (duree_annees <= 50)));
alter table immobilisations add constraint immobilisations_mode_check CHECK ((mode = ANY (ARRAY['lineaire'::text, 'degressif'::text])));
alter table immobilisations add constraint immobilisations_piece_id_key UNIQUE (piece_id);
alter table immobilisations add constraint immobilisations_pkey PRIMARY KEY (id);
alter table immobilisations add constraint sortie_coherente CHECK (((date_sortie IS NULL) OR (date_sortie >= date_mise_en_service)));
alter table justificatifs add constraint justificatifs_pkey PRIMARY KEY (id);
alter table libelles_bancaires add constraint libelles_bancaires_pkey PRIMARY KEY (motif);
alter table obligations add constraint obligations_categorie_check CHECK ((categorie = ANY (ARRAY['fiscale'::text, 'sociale'::text, 'juridique'::text, 'bancaire'::text])));
alter table obligations add constraint obligations_libelle_date_limite_key UNIQUE (libelle, date_limite);
alter table obligations add constraint obligations_periodicite_check CHECK ((periodicite = ANY (ARRAY['unique'::text, 'mensuelle'::text, 'trimestrielle'::text, 'annuelle'::text])));
alter table obligations add constraint obligations_pkey PRIMARY KEY (id);
alter table obligations_suivi add constraint obligations_suivi_pkey PRIMARY KEY (cle);
alter table permissions add constraint permissions_pkey PRIMARY KEY (role, module, action);
alter table pieces add constraint pieces_coherence CHECK ((abs(((montant_ht + montant_tva) - montant_ttc)) < 0.02));
alter table pieces add constraint pieces_devis_statut_valide CHECK (((devis_statut IS NULL) OR (devis_statut = ANY (ARRAY['brouillon'::text, 'envoye'::text, 'accepte'::text, 'refuse'::text, 'expire'::text]))));
alter table pieces add constraint pieces_etat_check CHECK ((etat = ANY (ARRAY['brouillon'::text, 'a_valider'::text, 'rejetee'::text, 'validee'::text, 'annulee'::text])));
alter table pieces add constraint pieces_moyen_paiement_check CHECK ((moyen_paiement = ANY (ARRAY['carte'::text, 'virement'::text, 'prelevement'::text, 'especes'::text, 'cheque'::text, 'avance_associe'::text, 'autre'::text])));
alter table pieces add constraint pieces_nature_check CHECK ((nature = ANY (ARRAY['achat'::text, 'vente'::text, 'avoir'::text, 'km'::text, 'creation'::text, 'banque'::text, 'paie'::text, 'amortissement'::text, 'devis'::text, 'inventaire'::text])));
alter table pieces add constraint pieces_periode CHECK (((periode_fin IS NULL) OR (periode_debut IS NULL) OR (periode_fin >= periode_debut)));
alter table pieces add constraint pieces_pkey PRIMARY KEY (id);
alter table pieces add constraint pieces_regime_tva CHECK ((regime_tva = ANY (ARRAY['france'::text, 'autoliquidation'::text, 'exonere'::text, 'hors_champ'::text])));
alter table pieces add constraint pieces_sens_check CHECK ((sens = ANY (ARRAY['debit'::text, 'credit'::text])));
alter table pieces add constraint pieces_type_operation_check CHECK ((type_operation = ANY (ARRAY['service'::text, 'bien'::text])));
alter table pieces_lignes add constraint pieces_lignes_pkey PRIMARY KEY (id);
alter table prestations add constraint prestations_pkey PRIMARY KEY (id);
alter table prestations add constraint prestations_unite_check CHECK ((unite = ANY (ARRAY['forfait'::text, 'heure'::text, 'm2'::text, 'piece'::text, 'ouvrant'::text, 'rotation'::text, 'vehicule'::text])));
alter table profils add constraint profils_email_key UNIQUE (email);
alter table profils add constraint profils_pkey PRIMARY KEY (id);
alter table reglements add constraint reglements_montant_check CHECK ((montant <> (0)::numeric));
alter table reglements add constraint reglements_moyen_check CHECK ((moyen = ANY (ARRAY['carte'::text, 'virement'::text, 'prelevement'::text, 'especes'::text, 'cheque'::text, 'avance_associe'::text, 'autre'::text, 'compensation'::text])));
alter table reglements add constraint reglements_pkey PRIMARY KEY (id);
alter table regles_appariement add constraint regles_appariement_pkey PRIMARY KEY (id);
alter table regles_appariement add constraint regles_appariement_sens_check CHECK ((sens = ANY (ARRAY['debit'::text, 'credit'::text])));
alter table relances add constraint relances_degre_check CHECK ((degre = ANY (ARRAY['rappel'::text, 'relance'::text, 'mise_en_demeure'::text])));
alter table relances add constraint relances_moyen_check CHECK ((moyen = ANY (ARRAY['courriel'::text, 'courrier'::text, 'remise_en_main'::text, 'autre'::text])));
alter table relances add constraint relances_pkey PRIMARY KEY (id);
alter table sauvegardes add constraint sauvegardes_declencheur_check CHECK ((declencheur = ANY (ARRAY['cron'::text, 'manuel'::text])));
alter table sauvegardes add constraint sauvegardes_pkey PRIMARY KEY (id);
alter table sauvegardes add constraint sauvegardes_statut_check CHECK ((statut = ANY (ARRAY['en_cours'::text, 'reussie'::text, 'echouee'::text])));
alter table synchronisations add constraint synchronisations_declencheur_check CHECK ((declencheur = ANY (ARRAY['cron'::text, 'manuel'::text])));
alter table synchronisations add constraint synchronisations_pkey PRIMARY KEY (id);
alter table synchronisations add constraint synchronisations_statut_check CHECK ((statut = ANY (ARRAY['en_cours'::text, 'reussie'::text, 'echouee'::text])));
alter table taches add constraint taches_pkey PRIMARY KEY (id);
alter table taches add constraint taches_priorite_check CHECK ((priorite = ANY (ARRAY['basse'::text, 'normale'::text, 'haute'::text])));
alter table taches add constraint taches_recurrence_check CHECK ((recurrence = ANY (ARRAY['mensuelle'::text, 'trimestrielle'::text, 'annuelle'::text])));
alter table taches add constraint taches_statut_check CHECK ((statut = ANY (ARRAY['a_faire'::text, 'en_cours'::text, 'faite'::text, 'annulee'::text])));
alter table taches add constraint taches_titre_check CHECK ((length(TRIM(BOTH FROM titre)) > 0));
alter table tiers add constraint tiers_pkey PRIMARY KEY (id);
alter table tiers add constraint tiers_type_check CHECK ((type = ANY (ARRAY['particulier'::text, 'professionnel'::text, 'syndic'::text, 'conciergerie'::text, 'collectivite'::text, 'administration'::text])));
alter table transactions_qonto add constraint transactions_qonto_pkey PRIMARY KEY (id);
alter table transactions_qonto add constraint transactions_qonto_qonto_id_key UNIQUE (qonto_id);
alter table transactions_qonto add constraint transactions_qonto_sens_check CHECK ((sens = ANY (ARRAY['debit'::text, 'credit'::text])));
alter table transactions_qonto add constraint transactions_qonto_statut_qonto_check CHECK ((statut_qonto = ANY (ARRAY['pending'::text, 'completed'::text, 'declined'::text, 'reversed'::text])));
alter table transactions_qonto add constraint transactions_qonto_statut_traitement_check CHECK ((statut_traitement = ANY (ARRAY['a_traiter'::text, 'rattachee'::text, 'ecartee'::text])));
alter table usage_ia add constraint usage_ia_pkey PRIMARY KEY (id);
alter table vehicules add constraint vehicules_cv_fiscaux_check CHECK (((cv_fiscaux >= 1) AND (cv_fiscaux <= 20)));
alter table vehicules add constraint vehicules_genre_check CHECK ((genre = ANY (ARRAY['VP'::text, 'VU'::text])));
alter table vehicules add constraint vehicules_motorisation_check CHECK ((motorisation = ANY (ARRAY['thermique'::text, 'electrique'::text, 'hybride'::text])));
alter table vehicules add constraint vehicules_pkey PRIMARY KEY (id);
alter table abonnement_echeances add constraint abonnement_echeances_abonnement_id_fkey FOREIGN KEY (abonnement_id) REFERENCES abonnements(id) ON DELETE CASCADE;
alter table abonnement_echeances add constraint abonnement_echeances_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES pieces(id) ON DELETE SET NULL;
alter table abonnements add constraint abonnements_categorie_id_fkey FOREIGN KEY (categorie_id) REFERENCES categories(id);
alter table abonnements add constraint abonnements_cree_par_fkey FOREIGN KEY (cree_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table alias_bancaires add constraint alias_bancaires_categorie_id_fkey FOREIGN KEY (categorie_id) REFERENCES categories(id) ON DELETE SET NULL;
alter table alias_bancaires add constraint alias_bancaires_tiers_id_fkey FOREIGN KEY (tiers_id) REFERENCES tiers(id) ON DELETE CASCADE;
alter table associes add constraint associes_profil_id_fkey FOREIGN KEY (profil_id) REFERENCES profils(id) ON DELETE SET NULL;
alter table audit add constraint audit_utilisateur_fkey FOREIGN KEY (utilisateur) REFERENCES profils(id) ON DELETE SET NULL;
alter table clients add constraint clients_cree_par_fkey FOREIGN KEY (cree_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table commentaires add constraint commentaires_cree_par_fkey FOREIGN KEY (cree_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table commentaires add constraint commentaires_resolu_par_fkey FOREIGN KEY (resolu_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table contrat_echeances add constraint contrat_echeances_contrat_id_fkey FOREIGN KEY (contrat_id) REFERENCES contrats(id) ON DELETE CASCADE;
alter table contrat_echeances add constraint contrat_echeances_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES pieces(id) ON DELETE SET NULL;
alter table contrats add constraint contrats_cree_par_fkey FOREIGN KEY (cree_par) REFERENCES profils(id);
alter table contrats add constraint contrats_prestation_id_fkey FOREIGN KEY (prestation_id) REFERENCES prestations(id);
alter table contrats add constraint contrats_tiers_id_fkey FOREIGN KEY (tiers_id) REFERENCES tiers(id) ON DELETE RESTRICT;
alter table declarations_tva add constraint declarations_tva_cloture_par_fkey FOREIGN KEY (cloture_par) REFERENCES profils(id);
alter table deplacements add constraint deplacements_annule_par_fkey FOREIGN KEY (annule_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table deplacements add constraint deplacements_cree_par_fkey FOREIGN KEY (cree_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table deplacements add constraint deplacements_revu_par_fkey FOREIGN KEY (revu_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table deplacements add constraint deplacements_valide_par_fkey FOREIGN KEY (valide_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table deplacements add constraint deplacements_vehicule_id_fkey FOREIGN KEY (vehicule_id) REFERENCES vehicules(id);
alter table documents_permanents add constraint documents_permanents_cree_par_fkey FOREIGN KEY (cree_par) REFERENCES profils(id);
alter table documents_permanents add constraint documents_permanents_remplace_id_fkey FOREIGN KEY (remplace_id) REFERENCES documents_permanents(id) ON DELETE SET NULL;
alter table entreprise add constraint entreprise_modifie_par_fkey FOREIGN KEY (modifie_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table fournisseurs_connus add constraint fournisseurs_connus_categorie_id_fkey FOREIGN KEY (categorie_id) REFERENCES categories(id);
alter table immobilisations add constraint immobilisations_cree_par_fkey FOREIGN KEY (cree_par) REFERENCES profils(id);
alter table immobilisations add constraint immobilisations_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES pieces(id) ON DELETE CASCADE;
alter table justificatifs add constraint justificatifs_cree_par_fkey FOREIGN KEY (cree_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table justificatifs add constraint justificatifs_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES pieces(id) ON DELETE CASCADE;
alter table libelles_bancaires add constraint libelles_bancaires_categorie_id_fkey FOREIGN KEY (categorie_id) REFERENCES categories(id);
alter table pieces add constraint pieces_annule_par_fkey FOREIGN KEY (annule_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table pieces add constraint pieces_categorie_id_fkey FOREIGN KEY (categorie_id) REFERENCES categories(id);
alter table pieces add constraint pieces_cree_par_fkey FOREIGN KEY (cree_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table pieces add constraint pieces_emise_par_fkey FOREIGN KEY (emise_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table pieces add constraint pieces_facture_issue_id_fkey FOREIGN KEY (facture_issue_id) REFERENCES pieces(id) ON DELETE SET NULL;
alter table pieces add constraint pieces_piece_liee_id_fkey FOREIGN KEY (piece_liee_id) REFERENCES pieces(id) ON DELETE SET NULL;
alter table pieces add constraint pieces_revu_par_fkey FOREIGN KEY (revu_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table pieces add constraint pieces_tiers_id_fkey FOREIGN KEY (tiers_id) REFERENCES tiers(id) ON DELETE RESTRICT;
alter table pieces add constraint pieces_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES transactions_qonto(id) ON DELETE SET NULL;
alter table pieces add constraint pieces_valide_par_fkey FOREIGN KEY (valide_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table pieces_lignes add constraint pieces_lignes_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES pieces(id) ON DELETE CASCADE;
alter table profils add constraint profils_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table reglements add constraint reglements_cree_par_fkey FOREIGN KEY (cree_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table reglements add constraint reglements_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES pieces(id) ON DELETE CASCADE;
alter table reglements add constraint reglements_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES transactions_qonto(id) ON DELETE SET NULL;
alter table regles_appariement add constraint regles_appariement_categorie_id_fkey FOREIGN KEY (categorie_id) REFERENCES categories(id) ON DELETE SET NULL;
alter table regles_appariement add constraint regles_appariement_cree_par_fkey FOREIGN KEY (cree_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table regles_appariement add constraint regles_appariement_tiers_id_fkey FOREIGN KEY (tiers_id) REFERENCES tiers(id) ON DELETE CASCADE;
alter table relances add constraint relances_cree_par_fkey FOREIGN KEY (cree_par) REFERENCES profils(id);
alter table relances add constraint relances_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES pieces(id) ON DELETE CASCADE;
alter table sauvegardes add constraint sauvegardes_lance_par_fkey FOREIGN KEY (lance_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table taches add constraint taches_assignee_a_fkey FOREIGN KEY (assignee_a) REFERENCES profils(id) ON DELETE SET NULL;
alter table taches add constraint taches_cree_par_fkey FOREIGN KEY (cree_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table tiers add constraint tiers_cree_par_fkey FOREIGN KEY (cree_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table transactions_qonto add constraint transactions_qonto_echeance_id_fkey FOREIGN KEY (echeance_id) REFERENCES abonnement_echeances(id) ON DELETE SET NULL;
alter table transactions_qonto add constraint transactions_qonto_rattache_par_fkey FOREIGN KEY (rattache_par) REFERENCES profils(id) ON DELETE SET NULL;
alter table usage_ia add constraint usage_ia_utilisateur_fkey FOREIGN KEY (utilisateur) REFERENCES profils(id) ON DELETE SET NULL;
alter table vehicules add constraint vehicules_proprietaire_fkey FOREIGN KEY (proprietaire) REFERENCES profils(id) ON DELETE SET NULL;

-- ---------- Index ----------
CREATE INDEX idx_echeances_date ON public.abonnement_echeances USING btree (date_prevue);
CREATE INDEX idx_echeances_statut ON public.abonnement_echeances USING btree (statut);
CREATE UNIQUE INDEX idx_abonnements_piece ON public.abonnements USING btree (numero_piece) WHERE (numero_piece IS NOT NULL);
CREATE INDEX idx_abonnements_statut ON public.abonnements USING btree (statut);
CREATE INDEX idx_alias_trgm ON public.alias_bancaires USING gin (libelle_normalise gin_trgm_ops);
CREATE INDEX idx_audit_horodatage ON public.audit USING btree (horodatage DESC);
CREATE INDEX idx_audit_utilisateur ON public.audit USING btree (utilisateur);
CREATE INDEX idx_clients_nom ON public.clients USING btree (lower(nom));
CREATE UNIQUE INDEX idx_clients_piece ON public.clients USING btree (numero_piece) WHERE (numero_piece IS NOT NULL);
CREATE INDEX idx_commentaires_cible ON public.commentaires USING btree (table_cible, id_cible);
CREATE INDEX idx_commentaires_piece ON public.commentaires USING btree (numero_piece) WHERE (numero_piece IS NOT NULL);
CREATE INDEX idx_commentaires_statut ON public.commentaires USING btree (statut) WHERE (statut = 'ouvert'::text);
CREATE INDEX idx_contrat_echeances_attendues ON public.contrat_echeances USING btree (date_prevue) WHERE (statut = 'attendue'::text);
CREATE INDEX idx_contrats_actifs ON public.contrats USING btree (tiers_id) WHERE actif;
CREATE UNIQUE INDEX idx_declaration_periode ON public.declarations_tva USING btree (periode_debut, periode_fin) WHERE (etat <> 'annulee'::text);
CREATE INDEX idx_deplacements_date ON public.deplacements USING btree (date_trajet DESC);
CREATE UNIQUE INDEX idx_deplacements_piece ON public.deplacements USING btree (numero_piece) WHERE (numero_piece IS NOT NULL);
CREATE INDEX idx_deplacements_statut ON public.deplacements USING btree (statut);
CREATE INDEX idx_documents_expiration ON public.documents_permanents USING btree (date_expiration) WHERE ((date_expiration IS NOT NULL) AND en_vigueur);
CREATE INDEX idx_documents_type ON public.documents_permanents USING btree (type_document, en_vigueur);
CREATE INDEX idx_justif_frais ON public.justificatifs USING btree (frais_creation_id);
CREATE INDEX idx_justificatifs_depense ON public.justificatifs USING btree (depense_id);
CREATE INDEX idx_justificatifs_piece ON public.justificatifs USING btree (piece_id);
CREATE INDEX idx_pieces_attendu ON public.pieces USING btree (attendu_en_banque, transaction_id) WHERE (attendu_en_banque AND (transaction_id IS NULL));
CREATE INDEX idx_pieces_date ON public.pieces USING btree (date_piece);
CREATE INDEX idx_pieces_devis ON public.pieces USING btree (devis_statut, valable_jusquau) WHERE (nature = 'devis'::text);
CREATE INDEX idx_pieces_etat ON public.pieces USING btree (etat);
CREATE INDEX idx_pieces_nature ON public.pieces USING btree (nature, sens);
CREATE UNIQUE INDEX idx_pieces_numero ON public.pieces USING btree (numero_piece) WHERE (numero_piece IS NOT NULL);
CREATE INDEX idx_pieces_source ON public.pieces USING btree (source_table, source_id);
CREATE UNIQUE INDEX idx_pieces_source_unique ON public.pieces USING btree (source_table, source_id) WHERE (source_table IS NOT NULL);
CREATE INDEX idx_pieces_tiers ON public.pieces USING btree (tiers_id);
CREATE INDEX idx_pieces_lignes ON public.pieces_lignes USING btree (piece_id, ordre);
CREATE INDEX idx_reglements_date ON public.reglements USING btree (date_reglement);
CREATE INDEX idx_reglements_piece ON public.reglements USING btree (piece_id);
CREATE UNIQUE INDEX idx_reglements_transaction ON public.reglements USING btree (transaction_id) WHERE (transaction_id IS NOT NULL);
CREATE INDEX idx_relances_piece ON public.relances USING btree (piece_id, envoyee_le DESC);
CREATE INDEX idx_sauvegardes_date ON public.sauvegardes USING btree (demarree_le DESC);
CREATE INDEX idx_synchro_date ON public.synchronisations USING btree (demarree_le DESC);
CREATE INDEX idx_taches_assignee ON public.taches USING btree (assignee_a);
CREATE INDEX idx_taches_echeance ON public.taches USING btree (echeance);
CREATE INDEX idx_taches_statut ON public.taches USING btree (statut);
CREATE INDEX idx_tiers_client ON public.tiers USING btree (est_client) WHERE est_client;
CREATE INDEX idx_tiers_fournisseur ON public.tiers USING btree (est_fournisseur) WHERE est_fournisseur;
CREATE UNIQUE INDEX idx_tiers_nom ON public.tiers USING btree (lower(nom));
CREATE UNIQUE INDEX idx_tiers_source ON public.tiers USING btree (source_table, source_id) WHERE (source_id IS NOT NULL);
CREATE INDEX idx_qonto_date ON public.transactions_qonto USING btree (date_operation DESC);
CREATE INDEX idx_qonto_montant ON public.transactions_qonto USING btree (montant, date_operation);
CREATE UNIQUE INDEX idx_qonto_piece ON public.transactions_qonto USING btree (numero_piece) WHERE (numero_piece IS NOT NULL);
CREATE INDEX idx_qonto_statut ON public.transactions_qonto USING btree (statut_traitement);
CREATE INDEX idx_transactions_a_recuperer ON public.transactions_qonto USING btree (a_justificatif) WHERE (a_justificatif AND (chemin_justificatif IS NULL));
CREATE INDEX idx_usage_ia_date ON public.usage_ia USING btree (horodatage DESC);

-- ---------- Fonctions ----------
CREATE OR REPLACE FUNCTION public.a_permission(p_module text, p_action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.a_relancer()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(x order by (x->>'jours_retard')::int desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', p.id,
      'numero_piece', p.numero_piece,
      'tiers', p.tiers_libelle,
      'date_piece', p.date_piece,
      'date_echeance', p.date_echeance,
      'montant_ttc', p.montant_ttc,
      'reste_du', round(p.net_a_payer - p.montant_regle, 2),
      'jours_retard', current_date - p.date_echeance,
      'relances_envoyees', p.relances_envoyees,
      'derniere_relance', p.derniere_relance,

      -- Le degré que le retard appelle, calculé comme dans le PDF.
      'degre_suggere', case
        when current_date <= p.date_echeance then 'rappel'
        when current_date - p.date_echeance <= 30 then 'relance'
        else 'mise_en_demeure' end,

      -- Peut-on relancer aujourd'hui ?
      'delai_respecte', p.derniere_relance is null
                        or p.derniere_relance <= current_date - 8,
      'prochaine_possible', case
        when p.derniere_relance is null then current_date
        else p.derniere_relance + 8 end,

      'historique', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'degre', r.degre, 'envoyee_le', r.envoyee_le,
          'reste_du', r.reste_du, 'moyen', r.moyen)
          order by r.envoyee_le desc), '[]'::jsonb)
        from public.relances r where r.piece_id = p.id)
    ) as x
    from   public.pieces p
    where  p.nature = 'vente' and p.etat = 'validee'
      and  p.montant_regle < p.net_a_payer - 0.005
      and  p.date_echeance is not null
  ) s;
$function$;

CREATE OR REPLACE FUNCTION public.accepter_devis(p_id uuid, p_objet text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d        record;
  v_id     uuid;
  v_lignes integer;
begin
  if auth.uid() is not null and not public.a_permission('ventes','create') then
    raise exception 'Droits insuffisants pour transformer un devis en facture';
  end if;

  select * into d from public.pieces where id = p_id and nature = 'devis';
  if not found then raise exception 'Devis introuvable'; end if;

  if d.devis_statut = 'accepte' then
    raise exception
      'Ce devis est déjà accepté et a produit la facture %.',
      coalesce((select numero_piece from public.pieces where id = d.facture_issue_id),
               '(en brouillon)');
  end if;

  select count(*) into v_lignes
  from   public.pieces_lignes where piece_id = p_id;
  if v_lignes = 0 then
    raise exception 'Un devis sans ligne ne peut pas devenir une facture';
  end if;

  -- Un devis périmé n'est pas refusé : le client peut l'accepter avec
  -- votre accord. On le signale, on ne bloque pas.
  if d.valable_jusquau is not null and d.valable_jusquau < current_date then
    raise warning
      'Devis expiré le % : les prix ont pu changer depuis.',
      to_char(d.valable_jusquau, 'DD/MM/YYYY');
  end if;

  insert into public.pieces (
    nature, sens, origine, date_piece,
    tiers_id, tiers_libelle, objet,
    montant_ht, taux_tva, montant_tva, montant_ttc,
    tva_comptable, type_operation, regime_tva,
    etat, attendu_en_banque, notes, cree_par
  ) values (
    'vente', 'credit', 'saisie', current_date,
    d.tiers_id, d.tiers_libelle,
    coalesce(nullif(trim(coalesce(p_objet,'')),''), d.objet),
    0, d.taux_tva, 0, 0,
    0, 'service', d.regime_tva,
    'brouillon', true,
    'Issue du devis ' || coalesce(d.numero_piece, '(sans numéro)'),
    auth.uid()
  )
  returning id into v_id;

  -- Le déclencheur `recalculer_piece` refait les totaux à chaque
  -- insertion ; `net_a_payer` suit, étant calculé depuis le TTC.
  insert into public.pieces_lignes (
    piece_id, ordre, prestation_id, libelle, description,
    quantite, unite, prix_unitaire_ht, taux_tva,
    montant_ht, montant_tva, montant_ttc
  )
  select v_id, ordre, prestation_id, libelle, description,
         quantite, unite, prix_unitaire_ht, taux_tva,
         montant_ht, montant_tva, montant_ttc
  from   public.pieces_lignes
  where  piece_id = p_id
  order  by ordre;

  update public.pieces
  set    devis_statut = 'accepte',
         facture_issue_id = v_id,
         modifie_le = now()
  where  id = p_id;

  perform public.journaliser(
    'creation', 'pieces', v_id::text,
    jsonb_build_object(
      'resume', 'Facture en brouillon issue du devis '
                || coalesce(d.numero_piece, '(sans numéro)'),
      'champs', jsonb_build_object('lignes', v_lignes, 'devis_id', p_id)));

  return jsonb_build_object(
    'devis_id', p_id,
    'facture_id', v_id,
    'lignes', v_lignes,
    'note', 'La facture est en brouillon : émettez-la lorsque la prestation '
            || 'est faite. La TVA deviendra exigible à l''encaissement.');
end;
$function$;

CREATE OR REPLACE FUNCTION public.accomplir_obligation(p_id uuid, p_reference text DEFAULT NULL::text, p_le date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o record; v_suivante date;
begin
  if auth.uid() is not null and not public.a_permission('echeances','update') then
    raise exception 'Permission insuffisante';
  end if;

  select * into o from public.obligations where id = p_id;
  if not found then raise exception 'Obligation introuvable'; end if;

  update public.obligations
  set    accomplie_le = coalesce(p_le, current_date),
         reference_depot = p_reference
  where  id = p_id;

  -- Une obligation périodique engendre la suivante : c'est le seul
  -- moyen de ne pas la redécouvrir dans un an.
  if o.periodicite in ('mensuelle','trimestrielle','annuelle') then
    v_suivante := case o.periodicite
      when 'mensuelle'     then o.date_limite + interval '1 month'
      when 'trimestrielle' then o.date_limite + interval '3 months'
      else                      o.date_limite + interval '1 year'
    end::date;

    insert into public.obligations
      (libelle, reference, date_limite, categorie, periodicite, notes)
    values (o.libelle, o.reference, v_suivante, o.categorie, o.periodicite, o.notes)
    on conflict (libelle, date_limite) do nothing;
  end if;

  return jsonb_build_object('id', p_id, 'suivante', v_suivante);
end;
$function$;

CREATE OR REPLACE FUNCTION public.ajouter_ligne(p_piece uuid, p_libelle text, p_quantite numeric, p_prix_ht numeric, p_taux_tva numeric DEFAULT 20, p_unite text DEFAULT NULL::text, p_prestation uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p       record;
  v_ht    numeric; v_tva numeric;
  v_ordre smallint;
  v_id    uuid;
begin
  select * into p from public.pieces where id = p_piece;
  if not found then raise exception 'Pièce introuvable'; end if;

  if auth.uid() is not null
     and not public.a_permission(public.module_piece(p.nature), 'update') then
    raise exception 'Permission insuffisante';
  end if;

  if p.etat <> 'brouillon' then
    raise exception 'Un document émis ne se modifie plus. Émettez un avoir.';
  end if;

  if trim(coalesce(p_libelle,'')) = '' then
    raise exception 'La désignation est obligatoire';
  end if;

  v_ht  := round(p_quantite * p_prix_ht, 2);
  v_tva := round(v_ht * p_taux_tva / 100, 2);

  select coalesce(max(ordre), 0) + 1 into v_ordre
  from public.pieces_lignes where piece_id = p_piece;

  insert into public.pieces_lignes (
    piece_id, ordre, prestation_id, libelle, description,
    quantite, unite, prix_unitaire_ht, taux_tva,
    montant_ht, montant_tva, montant_ttc
  ) values (
    p_piece, v_ordre, p_prestation, trim(p_libelle), p_description,
    p_quantite, p_unite, p_prix_ht, p_taux_tva,
    v_ht, v_tva, round(v_ht + v_tva, 2)
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'montant_ht', v_ht,
                            'montant_tva', v_tva, 'montant_ttc', round(v_ht + v_tva, 2));
end;
$function$;

CREATE OR REPLACE FUNCTION public.annuler_declaration_tva(p_id uuid, p_motif text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v record;
begin
  if auth.uid() is not null and not public.a_permission('tva','validate') then
    raise exception 'Seul le propriétaire peut annuler une déclaration';
  end if;
  if trim(coalesce(p_motif,'')) = '' then
    raise exception 'Le motif d''annulation est obligatoire';
  end if;

  select * into v from public.declarations_tva where id = p_id;
  if not found then raise exception 'Déclaration introuvable'; end if;
  if v.etat = 'annulee' then raise exception 'Déjà annulée'; end if;

  update public.declarations_tva
  set    etat = 'annulee', motif_annulation = trim(p_motif)
  where  id = p_id;

  perform public.journaliser(
    'annulation', 'declarations_tva', p_id::text,
    jsonb_build_object('resume', v.formulaire || ' annulée', 'motif', trim(p_motif)));

  return jsonb_build_object('id', p_id, 'etat', 'annulee');
end;
$function$;

CREATE OR REPLACE FUNCTION public.annuler_ecriture(p_table text, p_id uuid, p_motif text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_piece uuid;
begin
  -- L'identifiant est-il déjà celui d'une pièce ?
  select id into v_piece from public.pieces where id = p_id;

  if v_piece is null then
    select id into v_piece from public.pieces
    where  source_table = p_table and source_id = p_id;
  end if;

  if v_piece is null then
    raise exception 'Écriture introuvable dans le registre (% %)', p_table, p_id;
  end if;

  return public.annuler_piece(v_piece, p_motif);
end;
$function$;

CREATE OR REPLACE FUNCTION public.annuler_piece(p_id uuid, p_motif text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.annuler_trajet(p_id uuid, p_motif text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d       public.deplacements%rowtype;
  v_piece text;
begin
  if auth.uid() is not null and not public.a_permission('depenses','validate') then
    raise exception 'Permission insuffisante';
  end if;

  select * into d from public.deplacements where id = p_id for update;
  if not found then raise exception 'Trajet introuvable'; end if;
  if d.statut = 'annulee' then raise exception 'Ce trajet est déjà annulé'; end if;
  if d.statut <> 'validee' then
    raise exception 'Seul un trajet validé s''annule ; un trajet en attente se rejette.';
  end if;
  if trim(coalesce(p_motif, '')) = '' then
    raise exception 'Un motif d''annulation est obligatoire';
  end if;

  -- Déjà indemnisé : l'écriture d'indemnités couvre sa date.
  select numero_piece into v_piece from public.pieces
  where  nature = 'km' and etat <> 'annulee'
    and  periode_debut <= d.date_trajet and periode_fin >= d.date_trajet
  limit  1;
  if found then
    raise exception
      'Ce trajet est déjà indemnisé par l''écriture %. Annulez d''abord cette '
      'écriture (Dépenses), puis le trajet.', v_piece;
  end if;

  -- Une indemnité constatée plus tard dans l'année l'a compté dans son
  -- cumul : le retirer fausserait sa tranche du barème.
  select numero_piece into v_piece from public.pieces
  where  nature = 'km' and etat <> 'annulee'
    and  periode_fin > d.date_trajet
    and  extract(year from periode_fin) = extract(year from d.date_trajet)
  order  by periode_fin
  limit  1;
  if found then
    raise exception
      'L''écriture %, constatée après ce trajet, l''a compté dans le cumul annuel. '
      'Annulez-la d''abord, puis le trajet.', v_piece;
  end if;

  update public.deplacements
  set    statut = 'annulee', motif_annulation = trim(p_motif),
         annule_le = now(), annule_par = auth.uid()
  where  id = p_id;

  perform public.journaliser(
    'annulation', 'deplacements', p_id::text,
    jsonb_build_object(
      'resume', coalesce(d.numero_piece, 'Trajet') || ' annulé · ' || d.depart || ' → '
                || d.arrivee || ' · ' || public.km_effectifs(d) || ' km',
      'motif', trim(p_motif)));

  return jsonb_build_object('id', p_id, 'statut', 'annulee');
end;
$function$;

CREATE OR REPLACE FUNCTION public.apercu_associe(p_identifiant text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a         record;
  v_capital numeric;
  v_avance  numeric;
  v_rendu   numeric;
begin
  select * into a from public.associes
  where  identifiant = lower(trim(p_identifiant));
  if not found then return jsonb_build_object('trouvee', false); end if;

  select coalesce(sum(capital_souscrit), 0) into v_capital
  from   public.associes where actif;

  select coalesce(sum(case when sens_courant = 'du' then montant else 0 end), 0),
         -coalesce(sum(case when sens_courant = 'rembourse' then montant else 0 end), 0)
  into   v_avance, v_rendu
  from   public.v_compte_courant where associe = a.identifiant;

  return jsonb_build_object(
    'trouvee', true,
    'identifiant', a.identifiant,
    'nom_complet', a.prenom || ' ' || a.nom,
    'fonction', a.fonction,
    'ville', a.ville,
    'email', a.email,
    'telephone', a.telephone,
    'date_entree', a.date_entree,
    'actif', a.actif,

    'parts', a.parts,
    'capital_souscrit', a.capital_souscrit,
    'capital_libere', a.capital_libere,
    'quote_part', case when v_capital > 0
                       then round(a.capital_souscrit * 100 / v_capital, 2) else 0 end,

    'avance', v_avance,
    'rembourse', v_rendu,
    'solde', v_avance - v_rendu,

    -- Les derniers mouvements : assez pour comprendre d'où vient le
    -- solde, pas assez pour remplacer la fiche.
    'derniers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'numero_piece', c.numero_piece, 'date', c.date_ecriture,
        'motif', c.motif, 'montant', c.montant, 'id', c.id)
        order by c.date_ecriture desc), '[]'::jsonb)
      from (select * from public.v_compte_courant
            where associe = a.identifiant
            order by date_ecriture desc limit 5) c),

    'lien', '/associes/' || a.identifiant
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.apercu_banque(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t record;
begin
  select * into t from public.transactions_qonto where id = p_id;
  if not found then return jsonb_build_object('trouvee', false); end if;

  return jsonb_build_object(
    'trouvee', true,
    'id', t.id,
    'numero_piece', t.numero_piece,
    'date_operation', t.date_operation,
    'libelle', coalesce(nullif(trim(t.contrepartie), ''), t.libelle),
    -- `libelle` est le texte brut de la banque, `reference` le motif
    -- saisi par le payeur : deux colonnes distinctes, pas un doublon.
    'reference', nullif(trim(t.reference), ''),
    'montant', abs(t.montant),
    'sens', t.sens,
    'categorie_qonto', t.categorie_qonto,
    'statut_qonto', t.statut_qonto,
    'statut_traitement', t.statut_traitement,
    'a_justificatif', coalesce(t.a_justificatif, false),
    'justificatif_recupere', coalesce(t.justificatif_recupere, false),

    -- L'écriture rattachée, s'il y en a une. C'est la première chose
    -- qu'on cherche en ouvrant une opération.
    'ecriture', (
      select jsonb_build_object(
        'id', p.id,
        'numero_piece', p.numero_piece,
        'tiers', p.tiers_libelle,
        'objet', p.objet,
        'montant_ttc', p.montant_ttc,
        'etat', p.etat)
      from public.pieces p
      where p.transaction_id = t.id and p.etat <> 'annulee'
      limit 1),

    -- Les candidats du moteur, quand rien n'est encore rattaché : ils
    -- disent quoi faire sans quitter la liste.
    'candidats', case when t.statut_traitement = 'a_traiter' then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'piece_id', c.piece_id, 'numero_piece', c.numero_piece,
        'tiers', c.tiers, 'reste_du', c.reste_du, 'score', c.score)
        order by c.score desc), '[]'::jsonb)
      from public.candidats_pour_transaction(t.id) c
      where c.decision in ('automatique','propose')) end,

    'lien', '/banque/' || t.id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.apercu_piece(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p record; c record; v_regle boolean;
begin
  select * into p from public.v_pieces_completes where id = p_id;
  if not found then return jsonb_build_object('trouvee', false); end if;

  select libelle, justificatif_requis into c
  from   public.categories where id = p.categorie_id;
  v_regle := coalesce(c.justificatif_requis, true);

  return jsonb_build_object(
    'trouvee', true,
    'id', p.id, 'numero_piece', p.numero_piece,
    'nature', p.nature, 'sens', p.sens, 'etat', p.etat,
    'date_piece', p.date_piece, 'date_echeance', p.date_echeance,
    'tiers', p.tiers_libelle, 'objet', p.objet,
    'categorie', c.libelle, 'compte', p.compte,

    'montant_ht', p.montant_ht, 'taux_tva', p.taux_tva,
    'montant_tva', p.montant_tva, 'montant_ttc', p.montant_ttc,
    'tva_comptable', p.tva_comptable, 'regime_tva', p.regime_tva,

    'montant_regle', p.montant_regle, 'net_a_payer', p.net_a_payer,
    'reste_du', greatest(p.net_a_payer - p.montant_regle, 0),

    'moyen_paiement', p.moyen_paiement,
    'paye_par', case when p.moyen_paiement = 'avance_associe'
                     then public.nom_associe(p.paye_par) end,

    'facture_manquante', p.facture_manquante,
    'banque_manquante', p.banque_manquante,
    'nb_justificatifs', p.nb_justificatifs,

    -- La décision, et d'où elle vient : une règle générale ou un choix
    -- assumé. L'écran doit pouvoir dire lequel.
    'justificatif_exige', p.justificatif_exige,
    'justificatif_regle', v_regle,
    'motif_exemption', p.motif_exemption,
    'decision_manuelle', p.justificatif_exige is not null,

    'justificatifs', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', j.id, 'chemin', j.chemin, 'nom', j.nom_original,
        'type_mime', j.type_mime, 'taille', j.taille_octets,
        'depose_le', j.cree_le) order by j.cree_le), '[]'::jsonb)
      from public.justificatifs j where j.piece_id = p.id),

    'modifiable', p.etat <> 'annulee'
      and not exists (
        select 1 from public.declarations_tva d
        where d.etat = 'deposee'
          and public.date_ecriture(p.nature, p.date_piece)
              between d.periode_debut and d.periode_fin),

    'banque', (
      select jsonb_build_object(
        'numero_piece', t.numero_piece, 'date_operation', t.date_operation,
        'libelle', coalesce(nullif(trim(t.contrepartie),''), t.libelle),
        'montant', abs(t.montant))
      from public.transactions_qonto t where t.id = p.transaction_id),

    'reglements', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', r.date_reglement, 'montant', r.montant, 'moyen', r.moyen)
        order by r.date_reglement), '[]'::jsonb)
      from public.reglements r where r.piece_id = p.id),

    'lien', case
      when p.nature in ('vente','avoir') then '/ventes/' || p.id
      when p.nature = 'creation'         then '/frais-creation'
      when p.nature = 'banque'           then '/banque'
      else '/depenses/' || p.id end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.apparier(p_piece uuid, p_transaction uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p        record;
  t        record;
  v_reste  numeric;
  v_montant numeric;
  v_ecart  numeric;
  v_tolerance numeric;
  v_jours  integer;
  v_score  integer := 0;
  v_motifs text[] := array[]::text[];
  v_norm   text;
  v_alias  record;
  v_sim    real;
  v_declare boolean := false;
  v_exact  boolean := false;
  v_decision text;
  v_regle  jsonb;          -- AJOUT
  v_regle_cat uuid;        -- AJOUT
begin
  select * into p from public.pieces where id = p_piece;
  if not found then return jsonb_build_object('score', 0, 'motifs', '[]'::jsonb); end if;

  select * into t from public.transactions_qonto where id = p_transaction;
  if not found then return jsonb_build_object('score', 0, 'motifs', '[]'::jsonb); end if;

  -- ---- Éliminations ----
  if p.sens <> t.sens then
    return jsonb_build_object('score', 0, 'decision', 'ecarte',
      'motifs', to_jsonb(array['sens opposé']));
  end if;
  if p.etat not in ('validee','a_valider') then
    return jsonb_build_object('score', 0, 'decision', 'ecarte',
      'motifs', to_jsonb(array['pièce non comptabilisable']));
  end if;
  if p.transaction_id is not null then
    return jsonb_build_object('score', 0, 'decision', 'ecarte',
      'motifs', to_jsonb(array['déjà rapprochée']));
  end if;

  v_montant := abs(t.montant);

  -- Un montant nul n'est pas un paiement : c'est une empreinte de carte
  -- ou une autorisation, qui ne deviendra jamais une charge.
  if v_montant < 0.005 then
    return jsonb_build_object('score', 0, 'decision', 'ecarte',
      'motifs', to_jsonb(array['opération de montant nul']));
  end if;

  v_reste := p.net_a_payer - p.montant_regle;
  if v_reste <= 0.005 then
    return jsonb_build_object('score', 0, 'decision', 'ecarte',
      'motifs', to_jsonb(array['déjà soldée']));
  end if;

  -- ---- Montant : condition d'entrée ----
  --
  -- Tolérance proportionnelle. Deux centimes couvrent un arrondi ; un
  -- pour cent couvre un frais bancaire ou un écart de change ; deux
  -- euros plafonnent l'ensemble, au-delà l'écart cesse d'être un détail.
  v_tolerance := least(2.00, greatest(0.02, v_reste * 0.01));
  v_ecart := abs(v_reste - v_montant);

  if v_ecart < 0.005 then
    v_score := v_score + 50; v_exact := true;
    v_motifs := array_append(v_motifs, 'montant exact');
  elsif v_ecart <= v_tolerance then
    v_score := v_score + 30;
    v_motifs := array_append(v_motifs,
      'écart de ' || to_char(v_ecart, 'FM990D00') || ' €');
  elsif v_montant < v_reste and v_montant >= 1.00 then
    -- Un règlement partiel n'a de sens qu'au-dessus d'un euro : en
    -- dessous, c'est du bruit qui ferait de chaque petite opération la
    -- candidate de toutes les grandes.
    v_score := v_score + 20;
    v_motifs := array_append(v_motifs, 'règlement partiel possible');
  else
    return jsonb_build_object('score', 0, 'decision', 'ecarte',
      'motifs', to_jsonb(array['montant incompatible']));
  end if;

  -- ---- Date ----
  v_jours := least(
    abs(t.date_operation - p.date_piece),
    abs(t.date_operation - coalesce(p.date_echeance, p.date_piece))
  );
  if v_jours <= 2 then
    v_score := v_score + 20;
    v_motifs := array_append(v_motifs, 'même date');
  elsif v_jours <= 7 then
    v_score := v_score + 14;
    v_motifs := array_append(v_motifs, v_jours || ' jours d''écart');
  elsif v_jours <= 15 then
    v_score := v_score + 7;
    v_motifs := array_append(v_motifs, v_jours || ' jours d''écart');
  elsif v_jours > 90 then
    v_score := v_score - 15;
    v_motifs := array_append(v_motifs, 'plus de 3 mois d''écart');
  end if;

  -- ---- Tiers ----
  v_norm := public.normaliser_tiers(coalesce(t.contrepartie, t.libelle));

  select * into v_alias from public.alias_bancaires
  where  libelle_normalise = v_norm and tiers_id = p.tiers_id;

  if found and v_alias.occurrences >= 2 then
    v_score := v_score + 20;
    v_motifs := array_append(v_motifs, 'fournisseur déjà reconnu');
  else
    v_sim := public.similarite_tiers(
      coalesce(t.contrepartie, t.libelle), p.tiers_libelle);
    if v_sim >= 0.95 then
      v_score := v_score + 20;
      v_motifs := array_append(v_motifs, 'nom du tiers dans le libellé');
    elsif v_sim >= 0.6 then
      v_score := v_score + 15;
      v_motifs := array_append(v_motifs, 'libellé proche du tiers');
    elsif v_sim >= 0.35 then
      v_score := v_score + 6;
    end if;
  end if;

  -- ---- Référence dans le libellé ----
  if p.numero_piece is not null
     and upper(coalesce(t.libelle,'') || ' ' || coalesce(t.contrepartie,''))
         like '%' || upper(p.numero_piece) || '%' then
    v_score := v_score + 20;
    v_motifs := array_append(v_motifs, 'numéro de pièce en référence');
  elsif p.numero_externe is not null and length(p.numero_externe) >= 4
     and upper(coalesce(t.libelle,'') || ' ' || coalesce(t.contrepartie,''))
         like '%' || upper(p.numero_externe) || '%' then
    v_score := v_score + 20;
    v_motifs := array_append(v_motifs, 'numéro de facture en référence');
  end if;

  -- ---- AJOUT : la règle déclarée ----
  --
  -- Elle porte sur un libellé bancaire, pas sur une pièce. Ce qui vaut
  -- preuve, c'est la concordance des catégories : la règle dit « ce
  -- libellé, c'est des frais bancaires », la pièce dit « je suis des
  -- frais bancaires ». Les deux se confirment.
  --
  -- À catégorie différente, la règle témoigne contre le candidat : elle
  -- sait de quoi il s'agit, et ce n'est pas cette pièce-là.
  v_regle := public.regle_pour_transaction(p_transaction);

  if v_regle is not null and (v_regle->>'source') = 'regle' then
    v_regle_cat := nullif(v_regle->>'categorie_id', '')::uuid;

    if v_regle_cat is not null and v_regle_cat = p.categorie_id then
      v_score := v_score + 40;
      v_motifs := array_append(v_motifs,
        'règle « ' || coalesce(v_regle->>'libelle', 'déclarée') || ' »');

      -- Une règle déclarée dit d'avance quoi faire de ce libellé : c'est
      -- le sens même de « connu d'avance ». Sauf si elle l'interdit.
      if not coalesce((v_regle->>'jamais_automatique')::boolean, false) then
        v_declare := true;
      else
        v_motifs := array_append(v_motifs, 'règle sans automatisme');
      end if;

    elsif v_regle_cat is not null then
      v_score := v_score - 10;
      v_motifs := array_append(v_motifs, 'règle pointant une autre catégorie');
    end if;
  end if;

  -- ---- Montant déclaré à l'avance ----
  if p.origine = 'abonnement' or (p.nature = 'vente' and p.etat = 'validee') then
    v_declare := true;
    v_score := v_score + 10;
    v_motifs := array_append(v_motifs, 'montant connu d''avance');
  end if;

  -- ---- Décision ----
  if v_score >= 90 and v_exact and v_declare then
    v_decision := 'automatique';
  elsif v_score >= 60 then
    v_decision := 'propose';
  elsif v_score >= 30 then
    v_decision := 'incertain';
  else
    v_decision := 'ecarte';
  end if;

  return jsonb_build_object(
    'score', v_score,
    'decision', v_decision,
    'montant_exact', v_exact,
    'reste_du', v_reste,
    'montant_operation', v_montant,
    'ecart_jours', v_jours,
    'tolerance', v_tolerance,
    'motifs', to_jsonb(v_motifs)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.appliquer_regle(p_regle uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.regles_appariement
  set    occurrences = occurrences + 1
  where  id = p_regle;
$function$;

CREATE OR REPLACE FUNCTION public.attribuer_numero_abonnement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.numero_piece is null then
    new.numero_piece := public.numero_piece_suivant('ABO', new.date_debut);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.attribuer_numero_piece()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_prefixe text;
  v_date    date;
begin
  if new.numero_piece is not null then
    return new;
  end if;

  case tg_table_name
    when 'depenses'       then v_prefixe := 'ACH'; v_date := new.date_depense;
    when 'frais_creation' then v_prefixe := 'CRE'; v_date := new.date_engagement;
    when 'deplacements'   then v_prefixe := 'KM';  v_date := new.date_trajet;
    else return new;
  end case;

  new.numero_piece := public.numero_piece_suivant(v_prefixe, v_date);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.attribuer_numero_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.numero_piece is null then
    new.numero_piece := public.numero_piece_suivant('BAN', new.date_operation);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.balayer_appariements()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t        record;
  c        record;
  v_auto   integer := 0;
  v_propose integer := 0;
  v_seules integer := 0;
begin
  for t in
    select id from public.transactions_qonto
    where  statut_traitement = 'a_traiter' and statut_qonto = 'completed'
    order  by date_operation
  loop
    -- Un seul candidat automatique : deux écritures au même montant
    -- exact demandent un arbitrage humain.
    select count(*) filter (where decision = 'automatique') as autos,
           count(*) filter (where decision = 'propose')     as proposes
    into   c
    from   public.candidats_pour_transaction(t.id);

    if c.autos = 1 then
      perform public.confirmer_appariement(
        (select piece_id from public.candidats_pour_transaction(t.id)
         where decision = 'automatique' limit 1),
        t.id, true);
      v_auto := v_auto + 1;
    elsif c.autos > 1 then
      v_seules := v_seules + 1;
    elsif c.proposes > 0 then
      v_propose := v_propose + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'rattachees_automatiquement', v_auto,
    'propositions_en_attente', v_propose,
    'ambigues', v_seules,
    'restantes', (select count(*) from public.transactions_qonto
                  where statut_traitement = 'a_traiter' and statut_qonto = 'completed')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.candidats_pour_piece(p_piece uuid)
 RETURNS TABLE(transaction_id uuid, numero_piece text, date_operation date, montant numeric, libelle text, score integer, decision text, motifs jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select t.id, t.numero_piece, t.date_operation, abs(t.montant),
         coalesce(t.contrepartie, t.libelle),
         (public.apparier(p_piece, t.id)->>'score')::integer,
         public.apparier(p_piece, t.id)->>'decision',
         public.apparier(p_piece, t.id)->'motifs'
  from   public.transactions_qonto t
  where  t.statut_traitement = 'a_traiter'
    and  t.statut_qonto = 'completed'
    and  (public.apparier(p_piece, t.id)->>'score')::integer >= 30
  order  by 6 desc
  limit  8;
$function$;

CREATE OR REPLACE FUNCTION public.candidats_pour_transaction(p_transaction uuid)
 RETURNS TABLE(piece_id uuid, numero_piece text, tiers text, date_piece date, reste_du numeric, score integer, decision text, motifs jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.numero_piece, p.tiers_libelle, p.date_piece,
         p.net_a_payer - p.montant_regle,
         (public.apparier(p.id, p_transaction)->>'score')::integer,
         public.apparier(p.id, p_transaction)->>'decision',
         public.apparier(p.id, p_transaction)->'motifs'
  from   public.pieces p
  where  p.etat in ('validee','a_valider')
    and  p.montant_regle < p.net_a_payer - 0.005
    and  (public.apparier(p.id, p_transaction)->>'score')::integer >= 30
  order  by 6 desc
  limit  8;
$function$;

CREATE OR REPLACE FUNCTION public.changer_statut_devis(p_id uuid, p_statut text, p_motif text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d record;
begin
  if auth.uid() is not null and not public.a_permission('ventes','update') then
    raise exception 'Droits insuffisants';
  end if;

  select * into d from public.pieces where id = p_id and nature = 'devis';
  if not found then raise exception 'Devis introuvable'; end if;

  if p_statut not in ('brouillon','envoye','accepte','refuse','expire') then
    raise exception 'Statut inconnu : %', p_statut;
  end if;

  -- Un devis accepté a produit une facture : le rouvrir laisserait une
  -- facture sans devis derrière elle.
  if d.devis_statut = 'accepte' and p_statut <> 'accepte' then
    raise exception
      'Ce devis est accepté et a produit la facture %. Annulez la facture '
      'plutôt que de rouvrir le devis.',
      coalesce((select numero_piece from public.pieces
                where id = d.facture_issue_id), '(introuvable)');
  end if;

  -- L'acceptation passe par `accepter_devis`, qui crée la facture.
  if p_statut = 'accepte' then
    raise exception 'Utilisez accepter_devis() : accepter, c''est facturer.';
  end if;

  update public.pieces
  set    devis_statut = p_statut,
         notes = coalesce(nullif(trim(coalesce(p_motif,'')),''), notes),
         modifie_le = now()
  where  id = p_id;

  perform public.journaliser(
    'modification', 'pieces', p_id::text,
    jsonb_build_object('resume', coalesce(d.numero_piece,'devis') || ' — ' || p_statut,
                       'motif', nullif(trim(coalesce(p_motif,'')),'')));

  return jsonb_build_object('id', p_id, 'devis_statut', p_statut);
end;
$function$;

CREATE OR REPLACE FUNCTION public.charge_comptable(p_sens text, p_montant_ht numeric, p_montant_tva numeric, p_tva_comptable numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select (coalesce(p_montant_ht, 0)
          + greatest(coalesce(p_montant_tva, 0) - abs(coalesce(p_tva_comptable, 0)), 0))
         * case when p_sens = 'credit' then -1 else 1 end;
$function$;

CREATE OR REPLACE FUNCTION public.chercher_doublon(p_fournisseur text, p_numero text, p_montant numeric, p_date date)
 RETURNS TABLE(id uuid, numero_piece text, date_depense date, montant_ttc numeric, motif text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Correspondance forte : même fournisseur et même référence
  select p.id, p.numero_piece, p.date_piece, p.montant_ttc,
         'Même fournisseur et même numéro de facture'::text
  from   public.pieces p
  where  p_numero is not null
    and  p.numero_externe = p_numero
    and  lower(p.tiers_libelle) = lower(p_fournisseur)
    and  p.nature in ('achat','creation')
    and  p.etat <> 'annulee'

  union all

  -- Correspondance probable : même fournisseur, même montant, à sept jours
  select p.id, p.numero_piece, p.date_piece, p.montant_ttc,
         'Même fournisseur et même montant, à quelques jours'::text
  from   public.pieces p
  where  lower(p.tiers_libelle) = lower(p_fournisseur)
    and  abs(p.montant_ttc - p_montant) < 0.02
    and  abs(p.date_piece - p_date) <= 7
    and  p.nature in ('achat','creation')
    and  p.etat <> 'annulee'
    and  (p_numero is null or p.numero_externe is distinct from p_numero)

  limit 5;
$function$;

CREATE OR REPLACE FUNCTION public.cloturer_exercice(p_exercice uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.cloturer_tva(p_debut date, p_fin date, p_depose_le date DEFAULT NULL::date, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d        jsonb;
  e        record;
  v_id     uuid;
  v_form   text;
begin
  if auth.uid() is not null and not public.a_permission('tva','validate') then
    raise exception
      'Seul le propriétaire peut figer une déclaration : c''est lui qui la '
      'dépose et qui en répond.';
  end if;
  if p_fin < p_debut then
    raise exception 'La fin de période précède son début';
  end if;
  if p_fin >= current_date then
    raise exception
      'On ne clôture pas une période en cours : des écritures peuvent '
      'encore y entrer légitimement. Attendez le %.', p_fin + 1;
  end if;

  perform public.periode_tva_libre(p_debut, p_fin);

  select date_debut, date_fin, regime_tva into e
  from   public.exercices
  where  p_debut between date_debut and date_fin
  limit  1;
  v_form := case when coalesce(e.regime_tva, 'simplifie') = 'simplifie'
                 then 'CA12E' else 'CA3' end;

  d := public.declaration_tva(p_debut, p_fin);

  insert into public.declarations_tva (
    periode_debut, periode_fin, regime, formulaire,
    collectee, deductible, solde,
    detail, ventilation,
    depose_le, reference, notes,
    etat, cloture_par
  ) values (
    p_debut, p_fin,
    coalesce(e.regime_tva, 'simplifie'), v_form,
    (d->'collectee'->>'total')::numeric,
    (d->'deductible'->>'total')::numeric,
    (d->>'solde')::numeric,
    d->'lignes',
    jsonb_build_object('collectee', d->'collectee', 'deductible', d->'deductible'),
    p_depose_le, p_reference, p_notes,
    case when p_depose_le is null then 'preparee' else 'deposee' end,
    auth.uid()
  )
  returning id into v_id;

  perform public.journaliser(
    'creation', 'declarations_tva', v_id::text,
    jsonb_build_object(
      'resume', v_form || ' du ' || to_char(p_debut, 'DD/MM/YYYY') || ' au '
                || to_char(p_fin, 'DD/MM/YYYY') || ' — solde '
                || to_char((d->>'solde')::numeric, 'FM999990D00') || ' €',
      'champs', jsonb_build_object(
        'collectee', d->'collectee'->>'total',
        'deductible', d->'deductible'->>'total',
        'faits_generateurs', d->>'nb_lignes')));

  return jsonb_build_object(
    'id', v_id, 'formulaire', v_form,
    'collectee', (d->'collectee'->>'total')::numeric,
    'deductible', (d->'deductible'->>'total')::numeric,
    'solde', (d->>'solde')::numeric,
    'faits_generateurs', (d->>'nb_lignes')::int);
end;
$function$;

CREATE OR REPLACE FUNCTION public.completer_tiers(p_piece uuid, p_siret text DEFAULT NULL::text, p_numero_tva text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p record; v_maj integer := 0;
begin
  if auth.uid() is not null and not public.a_permission('depenses','update') then
    raise exception 'Permission insuffisante';
  end if;

  select * into p from public.pieces where id = p_piece;
  if not found then raise exception 'Écriture introuvable'; end if;
  if p.tiers_id is null then
    return jsonb_build_object('complete', false,
      'motif', 'Cette écriture n''est rattachée à aucun tiers.');
  end if;

  update public.tiers
  set    siret = coalesce(siret, nullif(trim(p_siret), '')),
         numero_tva = coalesce(numero_tva, nullif(trim(p_numero_tva), ''))
  where  id = p.tiers_id
    and  (siret is null or numero_tva is null);

  get diagnostics v_maj = row_count;

  return jsonb_build_object(
    'complete', v_maj > 0,
    'tiers_id', p.tiers_id,
    'siret', (select siret from public.tiers where id = p.tiers_id),
    'numero_tva', (select numero_tva from public.tiers where id = p.tiers_id));
end;
$function$;

CREATE OR REPLACE FUNCTION public.comptabiliser_is(p_exercice uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.confirmer_appariement(p_piece uuid, p_transaction uuid, p_automatique boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p       record;
  t       record;
  v_reste numeric;
  v_montant numeric;
  v_norm  text;
begin
  select * into p from public.pieces where id = p_piece;
  if not found then raise exception 'Pièce introuvable'; end if;

  if not p_automatique and auth.uid() is not null
     and not public.a_permission(public.module_piece(p.nature), 'validate') then
    raise exception 'Permission insuffisante';
  end if;

  select * into t from public.transactions_qonto where id = p_transaction;
  if not found then raise exception 'Opération bancaire introuvable'; end if;
  if t.statut_traitement = 'rattachee' then
    raise exception 'Cette opération est déjà rattachée à une écriture';
  end if;

  v_reste   := p.net_a_payer - p.montant_regle;
  v_montant := least(abs(t.montant), v_reste);

  if v_montant <= 0.005 then
    raise exception 'Cette pièce est déjà soldée';
  end if;

  insert into public.reglements (piece_id, date_reglement, montant, moyen,
                                 transaction_id, reference, cree_par)
  values (p_piece, t.date_operation, v_montant,
          case when t.sens = 'credit' then 'virement'
               else coalesce(p.moyen_paiement, 'prelevement') end,
          p_transaction, t.numero_piece, auth.uid());

  update public.transactions_qonto
  set    statut_traitement = 'rattachee',
         rattachement_auto = p_automatique,
         rattache_le = now(), rattache_par = auth.uid()
  where  id = p_transaction;

  update public.pieces
  set    transaction_id = coalesce(transaction_id, p_transaction),
         modifie_le = now()
  where  id = p_piece;

  -- Apprentissage : ce libellé désigne ce tiers. La prochaine fois, il
  -- vaudra vingt points.
  v_norm := public.normaliser_tiers(coalesce(t.contrepartie, t.libelle));
  if v_norm <> '' and p.tiers_id is not null then
    insert into public.alias_bancaires (libelle_normalise, tiers_id, categorie_id)
    values (v_norm, p.tiers_id, p.categorie_id)
    on conflict (libelle_normalise) do update set
      occurrences = public.alias_bancaires.occurrences + 1,
      tiers_id = excluded.tiers_id,
      derniere_le = current_date;
  end if;

  perform public.journaliser(
    'rapprochement', 'pieces', p_piece::text,
    jsonb_build_object(
      'resume', coalesce(p.numero_piece,'(sans numéro)') || ' ↔ ' || t.numero_piece
                || ' · ' || to_char(v_montant, 'FM999999D00') || ' €'
                || case when p_automatique then ' (automatique)' else '' end,
      'automatique', p_automatique,
      'score', public.apparier(p_piece, p_transaction)->>'score'
    )
  );

  return jsonb_build_object(
    'piece_id', p_piece, 'transaction_id', p_transaction,
    'montant', v_montant,
    'reste_du', round(v_reste - v_montant, 2),
    'automatique', p_automatique
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.confirmer_rapprochement(p_depense uuid, p_transaction uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_piece uuid;
begin
  select id into v_piece from public.pieces where id = p_depense;
  if v_piece is null then
    select id into v_piece from public.pieces
    where source_table = 'depenses' and source_id = p_depense;
  end if;
  if v_piece is null then raise exception 'Écriture introuvable'; end if;

  return public.confirmer_appariement(v_piece, p_transaction, false);
end;
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

CREATE OR REPLACE FUNCTION public.constater_indemnites_km(p_debut date, p_fin date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_annee      integer := extract(year from p_fin)::integer;
  v_km_periode numeric;
  v_km_annee   numeric;
  v_km_avant   numeric;
  v_indemnite  numeric;
  v_avant      numeric;
  v_apres      numeric;
  v_vehicule   uuid;
  v_cv         smallint;
  v_moteur     text;
  v_coef_avant numeric; v_forf_avant numeric;
  v_coef_apres numeric; v_forf_apres numeric;
  v_cat        uuid;
  v_compte     text;
  v_id         uuid;
  v_piece      text;
  v_nb         integer;
  v_nb_veh     integer;
  v_associe    text;
  v_majore     boolean := false;
begin
  if auth.uid() is not null and not public.a_permission('depenses','validate') then
    raise exception 'Permission insuffisante';
  end if;
  if p_fin < p_debut then
    raise exception 'La fin de période précède son début';
  end if;

  -- AJOUT — le barème est annuel : une période à cheval sur deux années
  -- ferait consommer des trajets sans les indemniser.
  if extract(year from p_debut) <> extract(year from p_fin) then
    raise exception
      'Une période d''indemnités ne peut pas franchir le 31 décembre : le '
      'barème est annuel. Constatez décembre, puis janvier.';
  end if;

  -- Un trajet déjà porté par une écriture ne peut pas l'être deux fois.
  select count(*), coalesce(sum(kilometres * case when aller_retour then 2 else 1 end), 0)
  into   v_nb, v_km_periode
  from   public.deplacements d
  where  d.statut = 'validee'
    and  d.date_trajet between p_debut and p_fin
    and  not exists (select 1 from public.pieces p
                     where p.nature = 'km' and p.etat <> 'annulee'
                       and p.periode_debut <= d.date_trajet
                       and p.periode_fin   >= d.date_trajet);

  if v_nb = 0 then
    return jsonb_build_object('constate', false,
      'motif', 'Aucun trajet validé et non encore indemnisé sur cette période.');
  end if;

  -- Le barème est progressif : l'indemnité d'une période est la
  -- DIFFÉRENCE entre le cumul annuel avant et après.
  select coalesce(sum(kilometres * case when aller_retour then 2 else 1 end), 0)
  into   v_km_annee
  from   public.deplacements
  where  statut = 'validee'
    and  extract(year from date_trajet) = v_annee
    and  date_trajet <= p_fin;

  v_km_avant := greatest(v_km_annee - v_km_periode, 0);

  -- AJOUT — un seul véhicule par période, et on le vérifie.
  select count(distinct vehicule_id) into v_nb_veh
  from   public.deplacements
  where  statut = 'validee' and date_trajet between p_debut and p_fin;

  if v_nb_veh > 1 then
    raise exception
      'Cette période mêle % véhicules. Le barème dépend de la puissance '
      'fiscale : constatez une période par véhicule.', v_nb_veh;
  end if;

  select vehicule_id into v_vehicule
  from   public.deplacements
  where  statut = 'validee' and date_trajet between p_debut and p_fin
  group  by vehicule_id order by count(*) desc limit 1;

  select cv_fiscaux, motorisation into v_cv, v_moteur
  from   public.vehicules where id = v_vehicule;

  if v_cv is null then
    return jsonb_build_object('constate', false,
      'motif', 'Puissance fiscale du véhicule non renseignée.');
  end if;

  -- AJOUT — l'associé bénéficiaire.
  -- Le propriétaire du véhicule d'abord : c'est lui qui supporte
  -- l'usure et le carburant. À défaut, l'auteur des trajets.
  select lower(trim(a.identifiant)) into v_associe
  from   public.vehicules v
  join   public.associes a
    on   lower(v.proprietaire_nom) like '%' || lower(a.nom) || '%'
  where  v.id = v_vehicule
  limit  1;

  if v_associe is null then
    select lower(trim(a.identifiant)) into v_associe
    from   public.deplacements d
    join   public.profils  pr on pr.id = d.cree_par
    join   public.associes a  on lower(pr.nom_complet) like '%' || lower(a.nom) || '%'
    where  d.statut = 'validee' and d.date_trajet between p_debut and p_fin
    group  by a.identifiant order by count(*) desc limit 1;
  end if;

  if v_associe is null then
    return jsonb_build_object('constate', false,
      'motif', 'Impossible de désigner l''associé bénéficiaire : renseignez '
               || 'le propriétaire du véhicule dans Réglages → Véhicules.');
  end if;

  select coefficient, forfait into v_coef_avant, v_forf_avant
  from   public.bareme_km
  where  annee = v_annee and v_cv between cv_min and cv_max
    and  v_km_avant >= km_min and (km_max is null or v_km_avant <= km_max)
  limit  1;

  select coefficient, forfait into v_coef_apres, v_forf_apres
  from   public.bareme_km
  where  annee = v_annee and v_cv between cv_min and cv_max
    and  v_km_annee >= km_min and (km_max is null or v_km_annee <= km_max)
  limit  1;

  if v_coef_apres is null then
    return jsonb_build_object('constate', false,
      'motif', 'Barème kilométrique introuvable pour ' || v_annee
               || ' et ' || v_cv || ' CV : Réglages → Véhicules.');
  end if;

  v_avant := case when v_km_avant = 0 then 0
                  else round(v_km_avant * coalesce(v_coef_avant, 0)
                             + coalesce(v_forf_avant, 0), 2) end;
  v_apres := round(v_km_annee * v_coef_apres + v_forf_apres, 2);

  v_indemnite := round(v_apres - v_avant, 2);

  -- AJOUT — la majoration de 20 % pour un véhicule électrique. Elle
  -- s'applique au total, et donc à la différence des deux cumuls.
  if v_moteur = 'electrique' then
    v_indemnite := round(v_indemnite * 1.20, 2);
    v_majore := true;
  end if;

  if v_indemnite <= 0 then
    return jsonb_build_object('constate', false,
      'motif', 'Indemnité nulle sur cette période.');
  end if;

  select id, compte into v_cat, v_compte
  from   public.categories
  where  actif and libelle ilike '%kilom%' limit 1;

  insert into public.pieces (
    nature, sens, origine, date_piece,
    tiers_libelle, objet, categorie_id, compte,
    montant_ht, taux_tva, montant_tva, montant_ttc,
    tva_comptable, type_operation, regime_tva,
    etat, moyen_paiement, paye_par,
    attendu_en_banque, periode_debut, periode_fin,
    notes, cree_par, valide_par, valide_le
  ) values (
    'km', 'debit', 'deplacements', p_fin,
    'Indemnités kilométriques',
    'Barème kilométrique — ' || to_char(v_km_periode, 'FM999990D0') || ' km'
      || case when v_majore then ' · majoration électrique 20 %' else '' end,
    v_cat, coalesce(v_compte, '6251'),
    v_indemnite, 0, 0, v_indemnite,
    0, 'service', 'hors_champ',
    -- L'associé est désigné, plus écrit en dur.
    'validee', 'avance_associe', v_associe,
    false, p_debut, p_fin,
    v_nb || ' trajets · cumul annuel porté de '
      || to_char(v_km_avant, 'FM999990D0') || ' à '
      || to_char(v_km_annee, 'FM999990D0') || ' km'
      || ' · bénéficiaire ' || public.nom_associe(v_associe),
    auth.uid(), auth.uid(), now()
  )
  returning id into v_id;

  v_piece := public.numeroter_piece(v_id);

  insert into public.reglements (piece_id, date_reglement, montant, moyen, cree_par)
  values (v_id, p_fin, v_indemnite, 'avance_associe', auth.uid());

  perform public.journaliser(
    'creation', 'pieces', v_id::text,
    jsonb_build_object(
      'resume', v_piece || ' · indemnités kilométriques — '
                || to_char(v_indemnite, 'FM999999D00') || ' € · '
                || public.nom_associe(v_associe),
      'champs', jsonb_build_object(
        'trajets', v_nb, 'km_periode', v_km_periode,
        'cumul_avant', v_km_avant, 'cumul_apres', v_km_annee,
        'associe', v_associe, 'majoration_electrique', v_majore,
        'periode', p_debut || ' → ' || p_fin)));

  return jsonb_build_object(
    'constate', true,
    'id', v_id, 'numero_piece', v_piece,
    'trajets', v_nb,
    'km_periode', v_km_periode,
    'cumul_annuel', v_km_annee,
    'associe', v_associe,
    'majoration_electrique', v_majore,
    'indemnite', v_indemnite);
end;
$function$;

CREATE OR REPLACE FUNCTION public.controle_fec(p_debut date, p_fin date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'lignes',   count(*),
    'debit',    round(sum(debit), 2),
    'credit',   round(sum(credit), 2),
    'ecart',    round(sum(debit) - sum(credit), 2),
    'equilibre', abs(sum(debit) - sum(credit)) < 0.005,
    'par_journal', (
      select coalesce(jsonb_agg(j order by j->>'journal'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'journal', journal_code,
          'lignes',  count(*),
          'debit',   round(sum(debit), 2),
          'credit',  round(sum(credit), 2),
          'ecart',   round(sum(debit) - sum(credit), 2)
        ) as j
        from public.lignes_fec(p_debut, p_fin)
        group by journal_code
      ) x)
  )
  from public.lignes_fec(p_debut, p_fin);
$function$;

CREATE OR REPLACE FUNCTION public.creer_achat(p_date date, p_tiers text, p_categorie uuid, p_montant_ttc numeric, p_taux_tva numeric DEFAULT NULL::numeric, p_objet text DEFAULT NULL::text, p_etat text DEFAULT 'a_valider'::text, p_origine text DEFAULT 'saisie'::text, p_transaction uuid DEFAULT NULL::uuid, p_numero_externe text DEFAULT NULL::text, p_moyen_paiement text DEFAULT 'carte'::text, p_paye_par text DEFAULT 'societe'::text, p_notes text DEFAULT NULL::text, p_extrait_ia boolean DEFAULT false, p_confiance numeric DEFAULT NULL::numeric, p_tva_facturee numeric DEFAULT NULL::numeric, p_tva_intracom text DEFAULT NULL::text, p_deductibilite smallint DEFAULT NULL::smallint, p_regime text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c        record;
  v_taux   numeric;
  v_ht     numeric; v_tva numeric; v_ttc numeric; v_dedu numeric;
  v_regime text;
  v_auto   numeric := 0;
  v_tiers  uuid;
  v_pays   text := 'FR';
  v_intra  text;
  v_id     uuid;
  v_piece  text;
  v_etat   text := p_etat;
  v_attendu boolean;
  v_deduc  smallint;
  v_date_reglement date;
begin
  if auth.uid() is not null and not public.a_permission('depenses','create') then
    raise exception 'Permission insuffisante';
  end if;

  select * into c from public.categories where id = p_categorie;
  if not found then raise exception 'Catégorie introuvable'; end if;
  if c.bloque then raise exception 'Cette catégorie n''autorise pas la saisie'; end if;

  v_taux  := coalesce(p_taux_tva, c.taux_tva_defaut);
  v_ttc   := round(p_montant_ttc, 2);
  v_tiers := public.trouver_ou_creer_tiers(p_tiers, true, false);

  if p_tva_intracom is not null then
    update public.tiers
    set    tva_intracom = trim(p_tva_intracom),
           pays_code = upper(left(trim(p_tva_intracom), 2)),
           modifie_le = now()
    where  id = v_tiers and tva_intracom is null;
  end if;

  select coalesce(tva_intracom, p_tva_intracom), coalesce(pays_code, 'FR')
  into   v_intra, v_pays
  from   public.tiers where id = v_tiers;

  -- Le régime imposé l'emporte. Il n'est utilisé que là où aucune
  -- facture n'est disponible pour le déduire.
  v_regime := coalesce(p_regime, public.determiner_regime_tva(
    v_intra,
    coalesce(p_tva_facturee, case when v_taux > 0 then v_ttc * v_taux / (100 + v_taux) end),
    v_pays
  ));

  v_deduc := coalesce(p_deductibilite, c.taux_deductibilite);

  if v_regime = 'autoliquidation' then
    v_ht  := v_ttc;
    v_tva := 0;
    v_auto := round(v_ht * (case when v_taux > 0 then v_taux else 20 end) / 100, 2);
    v_dedu := 0;
  elsif v_regime = 'exonere' then
    v_ht := v_ttc; v_tva := 0; v_dedu := 0;
  else
    v_ht   := round(v_ttc / (1 + v_taux / 100), 2);
    v_tva  := round(v_ttc - v_ht, 2);
    v_dedu := round(v_tva * (v_deduc / 100.0), 2);
  end if;

  if v_etat = 'validee' and auth.uid() is not null
     and not public.a_permission('depenses','validate') then
    v_etat := 'a_valider';
  end if;

  v_attendu := (coalesce(p_paye_par,'societe') = 'societe'
                and coalesce(p_moyen_paiement,'carte') not in ('especes','avance_associe'));

  insert into public.pieces (
    nature, sens, origine, date_piece,
    tiers_id, tiers_libelle, objet, categorie_id, compte,
    montant_ht, taux_tva, montant_tva, montant_ttc,
    tva_comptable, taux_deductibilite, type_operation,
    regime_tva, tva_autoliquidee,
    etat, moyen_paiement, paye_par, attendu_en_banque,
    transaction_id, numero_externe, notes,
    extrait_par_ia, confiance_extraction,
    cree_par, valide_par, valide_le
  ) values (
    'achat', 'debit', p_origine, p_date,
    v_tiers, trim(p_tiers), nullif(trim(coalesce(p_objet,'')),''), p_categorie, c.compte,
    v_ht, v_taux, v_tva, v_ttc,
    v_dedu, v_deduc, c.type_operation,
    v_regime, v_auto,
    v_etat, p_moyen_paiement, p_paye_par, v_attendu,
    p_transaction, nullif(trim(coalesce(p_numero_externe,'')),''), p_notes,
    p_extrait_ia, p_confiance,
    auth.uid(),
    case when v_etat = 'validee' then auth.uid() end,
    case when v_etat = 'validee' then now() end
  )
  returning id into v_id;

  if v_etat = 'validee' then
    v_piece := public.numeroter_piece(v_id);
  end if;

  if p_transaction is not null then
    select date_operation into v_date_reglement
    from   public.transactions_qonto where id = p_transaction;

    update public.transactions_qonto
    set    statut_traitement = 'rattachee', rattachement_auto = false,
           rattache_le = now(), rattache_par = auth.uid()
    where  id = p_transaction;

    insert into public.reglements (piece_id, date_reglement, montant,
                                   moyen, transaction_id, cree_par)
    values (v_id, coalesce(v_date_reglement, p_date), v_ttc,
            p_moyen_paiement, p_transaction, auth.uid());

  elsif p_paye_par in ('mahdi','sabir') or p_moyen_paiement = 'especes' then
    insert into public.reglements (piece_id, date_reglement, montant, moyen, cree_par)
    values (v_id, p_date, v_ttc,
            case when p_paye_par in ('mahdi','sabir')
                 then 'avance_associe' else p_moyen_paiement end,
            auth.uid());
  end if;

  perform public.journaliser(
    'creation', 'pieces', v_id::text,
    jsonb_build_object(
      'resume', coalesce(v_piece,'(à valider)') || ' · ' || trim(p_tiers) || ' — '
                || to_char(v_ttc, 'FM999999D00') || ' € '
                || case v_regime when 'autoliquidation' then 'HT, autoliquidée'
                                 when 'exonere' then 'exonéré' else 'TTC' end,
      'origine', p_origine,
      'regime_tva', v_regime,
      'regime_impose', (p_regime is not null),
      'champs', jsonb_build_object(
        'categorie', c.libelle, 'compte', c.compte,
        'montant_ht', v_ht, 'montant_tva', v_tva, 'montant_ttc', v_ttc,
        'tva_deductible', v_dedu, 'tva_autoliquidee', v_auto, 'etat', v_etat)
    )
  );

  return jsonb_build_object(
    'id', v_id, 'numero_piece', v_piece, 'etat', v_etat,
    'regime_tva', v_regime,
    'montant_ht', v_ht, 'montant_tva', v_tva, 'montant_ttc', v_ttc,
    'tva_deductible', v_dedu, 'tva_autoliquidee', v_auto
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.creer_avoir_achat(p_transaction uuid, p_tiers text, p_categorie uuid, p_montant_ttc numeric, p_taux_tva numeric DEFAULT NULL::numeric, p_objet text DEFAULT NULL::text, p_numero text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c       record;
  t       record;
  v_taux  numeric;
  v_ht    numeric; v_tva numeric; v_ttc numeric; v_dedu numeric;
  v_tiers uuid;
  v_id    uuid;
  v_piece text;
begin
  if auth.uid() is not null and not public.a_permission('depenses','create') then
    raise exception 'Permission insuffisante';
  end if;

  select * into c from public.categories where id = p_categorie;
  if not found then raise exception 'Catégorie introuvable'; end if;

  if p_transaction is not null then
    select * into t from public.transactions_qonto where id = p_transaction;
    if not found then raise exception 'Opération bancaire introuvable'; end if;
    if t.sens <> 'credit' then
      raise exception
        'Un avoir fournisseur se rattache à un CRÉDIT bancaire : le '
        'fournisseur vous rembourse. Pour un débit, saisissez une dépense.';
    end if;
  end if;

  v_taux := coalesce(p_taux_tva, c.taux_tva_defaut);
  v_ttc  := abs(round(p_montant_ttc, 2));
  v_ht   := round(v_ttc / (1 + v_taux / 100), 2);
  v_tva  := round(v_ttc - v_ht, 2);
  -- La TVA déduite à l'origine doit être reversée dans la même
  -- proportion que celle où elle avait été récupérée.
  v_dedu := round(v_tva * (c.taux_deductibilite / 100.0), 2);

  v_tiers := public.trouver_ou_creer_tiers(p_tiers, true, false);

  insert into public.pieces (
    nature, sens, origine, date_piece,
    tiers_id, tiers_libelle, objet, categorie_id, compte,
    montant_ht, taux_tva, montant_tva, montant_ttc,
    -- Portée en NÉGATIF : elle vient en diminution de la TVA
    -- déductible de la période, pas en TVA collectée.
    tva_comptable, taux_deductibilite, type_operation, regime_tva,
    etat, moyen_paiement, paye_par, attendu_en_banque,
    transaction_id, numero_externe, notes,
    cree_par, valide_par, valide_le
  ) values (
    'achat', 'credit', 'avoir_fournisseur',
    coalesce(t.date_operation, current_date),
    v_tiers, trim(p_tiers),
    coalesce(nullif(trim(coalesce(p_objet,'')),''), 'Avoir fournisseur'),
    p_categorie, c.compte,
    v_ht, v_taux, v_tva, v_ttc,
    -v_dedu, c.taux_deductibilite, c.type_operation, 'france',
    'validee', 'virement', 'societe', true,
    p_transaction, nullif(trim(coalesce(p_numero,'')),''),
    coalesce(p_notes, 'Avoir : vient en diminution de la charge et de la TVA déduite.'),
    auth.uid(), auth.uid(), now()
  )
  returning id into v_id;

  v_piece := public.numeroter_piece(v_id);

  if p_transaction is not null then
    update public.transactions_qonto
    set    statut_traitement = 'rattachee', rattachement_auto = false,
           rattache_le = now(), rattache_par = auth.uid()
    where  id = p_transaction;

    insert into public.reglements (piece_id, date_reglement, montant,
                                   moyen, transaction_id, cree_par)
    values (v_id, t.date_operation, v_ttc, 'virement', p_transaction, auth.uid());
  end if;

  perform public.journaliser(
    'creation', 'pieces', v_id::text,
    jsonb_build_object(
      'resume', v_piece || ' · avoir ' || trim(p_tiers) || ' — '
                || to_char(v_ttc, 'FM999999D00') || ' € recrédités',
      'champs', jsonb_build_object(
        'charge_annulee', v_ht, 'tva_reversee', v_dedu, 'compte', c.compte)));

  return jsonb_build_object(
    'id', v_id, 'numero_piece', v_piece,
    'montant_ttc', v_ttc, 'charge_annulee', v_ht, 'tva_reversee', v_dedu);
end;
$function$;

CREATE OR REPLACE FUNCTION public.creer_avoir_vente(p_facture uuid, p_motif text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.creer_depense(p_date date, p_fournisseur text, p_categorie uuid, p_montant_ttc numeric, p_taux_tva numeric DEFAULT NULL::numeric, p_libelle text DEFAULT NULL::text, p_statut text DEFAULT 'en_attente'::text, p_origine text DEFAULT 'saisie'::text, p_transaction uuid DEFAULT NULL::uuid, p_numero_facture text DEFAULT NULL::text, p_moyen_paiement text DEFAULT 'carte'::text, p_paye_par text DEFAULT 'societe'::text, p_notes text DEFAULT NULL::text, p_extrait_ia boolean DEFAULT false, p_confiance numeric DEFAULT NULL::numeric, p_tva_facturee numeric DEFAULT NULL::numeric, p_tva_intracom text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  v := public.creer_achat(
    p_date           => p_date,
    p_tiers          => p_fournisseur,
    p_categorie      => p_categorie,
    p_montant_ttc    => p_montant_ttc,
    p_taux_tva       => p_taux_tva,
    p_objet          => p_libelle,
    p_etat           => case p_statut when 'validee' then 'validee' else 'a_valider' end,
    p_origine        => p_origine,
    p_transaction    => p_transaction,
    p_numero_externe => p_numero_facture,
    p_moyen_paiement => p_moyen_paiement,
    p_paye_par       => p_paye_par,
    p_notes          => p_notes,
    p_extrait_ia     => p_extrait_ia,
    p_confiance      => p_confiance,
    p_tva_facturee   => p_tva_facturee,
    p_tva_intracom   => p_tva_intracom
  );

  return v || jsonb_build_object(
    'statut', case v->>'etat' when 'validee' then 'validee' else 'en_attente' end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.creer_devis(p_tiers uuid, p_objet text DEFAULT NULL::text, p_date date DEFAULT NULL::date, p_validite_jours integer DEFAULT 30, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tiers  record;
  v_id     uuid;
  v_numero text;
  v_date   date := coalesce(p_date, current_date);
begin
  if auth.uid() is not null and not public.a_permission('ventes','create') then
    raise exception 'Droits insuffisants pour établir un devis';
  end if;

  select * into v_tiers from public.tiers where id = p_tiers;
  if not found then raise exception 'Client introuvable'; end if;

  -- `nom` — la table `tiers` n'a pas de colonne `libelle`.
  -- `net_a_payer` absent — colonne calculée.
  insert into public.pieces (
    nature, sens, origine, date_piece,
    tiers_id, tiers_libelle, objet,
    montant_ht, taux_tva, montant_tva, montant_ttc,
    tva_comptable, type_operation, regime_tva,
    etat, devis_statut, valable_jusquau,
    attendu_en_banque, notes, cree_par
  ) values (
    'devis', 'credit', 'saisie', v_date,
    p_tiers, v_tiers.nom, nullif(trim(coalesce(p_objet,'')),''),
    0, 20, 0, 0,
    0, 'service', 'france',
    -- `brouillon` toute sa vie : un devis n'entre pas en comptabilité.
    'brouillon', 'brouillon', v_date + coalesce(p_validite_jours, 30),
    false, p_notes, auth.uid()
  )
  returning id into v_id;

  v_numero := public.numeroter_devis_piece(v_id);

  perform public.journaliser(
    'creation', 'pieces', v_id::text,
    jsonb_build_object(
      'resume', v_numero || ' · devis pour ' || v_tiers.nom,
      'origine', 'saisie'));

  return jsonb_build_object('id', v_id, 'numero_piece', v_numero,
                            'valable_jusquau', v_date + coalesce(p_validite_jours, 30));
end;
$function$;

CREATE OR REPLACE FUNCTION public.creer_ecriture_inventaire(p_type text, p_exercice uuid, p_compte text, p_libelle text, p_montant numeric, p_tva numeric DEFAULT 0, p_tiers text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.creer_facture(p_client uuid, p_nature text DEFAULT 'facture'::text, p_devis uuid DEFAULT NULL::uuid, p_facture_liee uuid DEFAULT NULL::uuid, p_date date DEFAULT NULL::date, p_objet text DEFAULT NULL::text, p_delai smallint DEFAULT NULL::smallint, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tiers uuid; v_res jsonb;
begin
  -- L'écran transmet un identifiant de `clients` ; le registre attend un
  -- `tiers`. La correspondance passe par la synchronisation ci-dessus.
  select id into v_tiers from public.tiers
  where  source_table = 'clients' and source_id = p_client;

  if not found then
    select t.id into v_tiers
    from   public.tiers t join public.clients c on lower(c.nom) = lower(t.nom)
    where  c.id = p_client;
  end if;

  if v_tiers is null then
    raise exception 'Client introuvable dans le référentiel des tiers';
  end if;

  v_res := public.creer_vente(
    p_tiers      => v_tiers,
    p_nature     => p_nature,
    p_date       => p_date,
    p_objet      => p_objet,
    p_delai      => p_delai,
    p_piece_liee => p_facture_liee,
    p_notes      => p_notes
  );

  -- Le brouillon n'a pas encore de numéro : c'est voulu, il n'en
  -- consommera un qu'à l'émission.
  return v_res || jsonb_build_object('numero_piece', null);
end;
$function$;

CREATE OR REPLACE FUNCTION public.creer_operation_banque(p_transaction uuid, p_compte text, p_libelle text, p_notes text DEFAULT NULL::text, p_associe text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t         record;
  v_tiers   uuid;
  v_id      uuid;
  v_piece   text;
  v_paye_par text;
begin
  if auth.uid() is not null and not public.a_permission('banque','update') then
    raise exception 'Permission insuffisante';
  end if;

  select * into t from public.transactions_qonto where id = p_transaction;
  if not found then raise exception 'Opération bancaire introuvable'; end if;
  if t.statut_traitement = 'rattachee' then
    raise exception 'Cette opération est déjà rattachée à une écriture';
  end if;

  if trim(coalesce(p_compte,'')) = '' then
    raise exception 'Le compte comptable est obligatoire pour une opération diverse';
  end if;

  -- Un mouvement de compte courant appartient à quelqu'un. Sans
  -- titulaire, il n'entrerait dans le solde d'aucun associé — ce qui
  -- revient à ne pas l'enregistrer.
  if trim(p_compte) = '4551' then
    if trim(coalesce(p_associe,'')) = '' then
      raise exception
        'Un mouvement de compte courant doit désigner l''associé concerné.';
    end if;
    if not exists (select 1 from public.associes
                   where identifiant = lower(trim(p_associe))) then
      raise exception 'Associé inconnu : %', p_associe;
    end if;
    v_paye_par := lower(trim(p_associe));
  else
    v_paye_par := 'societe';
  end if;

  v_tiers := public.trouver_ou_creer_tiers(
    coalesce(nullif(trim(t.contrepartie),''), t.libelle), false, false);

  -- Ni TVA ni déductibilité : un apport n'en porte pas, un produit
  -- divers exonéré non plus. Le régime `hors_champ` le dit explicitement
  -- plutôt que de laisser un zéro ambigu.
  insert into public.pieces (
    nature, sens, origine, date_piece,
    tiers_id, tiers_libelle, objet, compte,
    montant_ht, taux_tva, montant_tva, montant_ttc,
    tva_comptable, type_operation, regime_tva,
    etat, moyen_paiement, paye_par, attendu_en_banque,
    transaction_id, notes, cree_par, valide_par, valide_le
  ) values (
    'banque',
    t.sens,
    'banque',
    t.date_operation,
    v_tiers, coalesce(nullif(trim(t.contrepartie),''), t.libelle),
    trim(p_libelle), trim(p_compte),
    abs(t.montant), 0, 0, abs(t.montant),
    0, 'service', 'hors_champ',
    'validee', 'virement', v_paye_par, true,
    p_transaction, p_notes, auth.uid(), auth.uid(), now()
  )
  returning id into v_id;

  v_piece := public.numeroter_piece(v_id);

  update public.transactions_qonto
  set    statut_traitement = 'rattachee', rattachement_auto = false,
         rattache_le = now(), rattache_par = auth.uid()
  where  id = p_transaction;

  -- Le règlement est l'opération elle-même : l'argent a bougé, la date
  -- est celle du relevé.
  insert into public.reglements (piece_id, date_reglement, montant,
                                 moyen, transaction_id, cree_par)
  values (v_id, t.date_operation, abs(t.montant), 'virement',
          p_transaction, auth.uid());

  perform public.journaliser(
    'creation', 'pieces', v_id::text,
    jsonb_build_object(
      'resume', v_piece || ' · ' || trim(p_libelle) || ' — '
                || to_char(abs(t.montant), 'FM999999D00') || ' € · compte ' || trim(p_compte)
                || case when v_paye_par <> 'societe'
                        then ' · ' || public.nom_associe(v_paye_par) else '' end,
      'origine', 'banque', 'sens', t.sens, 'associe', nullif(v_paye_par, 'societe')));

  return jsonb_build_object('id', v_id, 'numero_piece', v_piece,
                            'montant', abs(t.montant), 'sens', t.sens,
                            'associe', nullif(v_paye_par, 'societe'));
end;
$function$;

CREATE OR REPLACE FUNCTION public.creer_profil()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.creer_vente(p_tiers uuid, p_nature text DEFAULT 'vente'::text, p_date date DEFAULT NULL::date, p_objet text DEFAULT NULL::text, p_delai smallint DEFAULT NULL::smallint, p_piece_liee uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t        record;
  v_date   date := coalesce(p_date, current_date);
  v_delai  smallint;
  v_id     uuid;
  v_acomptes numeric := 0;
begin
  if auth.uid() is not null and not public.a_permission('ventes','create') then
    raise exception 'Permission insuffisante';
  end if;

  select * into t from public.tiers where id = p_tiers;
  if not found then raise exception 'Client introuvable'; end if;

  -- Un solde se calcule à partir d'acomptes. Sans acompte rattaché, ce
  -- n'est pas un solde : c'est une facture ordinaire, et l'appeler
  -- autrement rendrait la piste illisible à un vérificateur.
  if p_nature = 'solde' and p_piece_liee is null then
    raise exception
      'Une facture de solde doit être rattachée à un acompte déjà émis. '
      'Sans acompte, choisissez une facture ordinaire.';
  end if;

  if p_nature = 'solde' then
    if not exists (select 1 from public.pieces
                   where id = p_piece_liee and origine = 'acompte'
                     and etat = 'validee') then
      raise exception 'L''acompte désigné est introuvable ou n''a pas été émis.';
    end if;
  end if;

  update public.tiers set est_client = true where id = p_tiers and not est_client;

  v_delai := coalesce(p_delai, t.delai_paiement, 15);

  -- Une facture de solde déduit les acomptes déjà encaissés sur la même
  -- affaire : sans cela le client paierait deux fois.
  if p_nature = 'solde' then
    select coalesce(sum(montant_ttc), 0) into v_acomptes
    from   public.pieces
    where  (id = p_piece_liee or piece_liee_id = p_piece_liee)
      and  origine = 'acompte' and etat = 'validee';
  end if;

  insert into public.pieces (
    nature, sens, origine, date_piece,
    tiers_id, tiers_libelle, objet,
    type_operation, etat, delai_paiement, date_echeance,
    acomptes_deduits, attendu_en_banque, piece_liee_id, notes, cree_par
  ) values (
    case when p_nature = 'avoir' then 'avoir' else 'vente' end,
    case when p_nature = 'avoir' then 'debit' else 'credit' end,
    case when p_nature in ('acompte','solde') then p_nature else 'saisie' end,
    v_date,
    p_tiers, t.nom, p_objet,
    'service', 'brouillon', v_delai, v_date + v_delai,
    v_acomptes, true, p_piece_liee, p_notes, auth.uid()
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'etat', 'brouillon',
                            'date_echeance', v_date + v_delai);
end;
$function$;

CREATE OR REPLACE FUNCTION public.cumul_km_annuel(p_annee integer)
 RETURNS TABLE(vehicule_id uuid, km numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select d.vehicule_id,
         coalesce(sum(
           case when d.aller_retour then d.kilometres * 2 else d.kilometres end
         ), 0) as km
  from   public.deplacements d
  where  d.statut = 'validee'
    and  extract(year from d.date_trajet) = p_annee
  group by d.vehicule_id;
$function$;

CREATE OR REPLACE FUNCTION public.date_ecriture(p_nature text, p_date_piece date)
 RETURNS date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when p_nature = 'creation'
      then greatest(p_date_piece,
                    coalesce((select min(date_debut) from public.exercices),
                             p_date_piece))
    else p_date_piece
  end;
$function$;

CREATE OR REPLACE FUNCTION public.decider_justificatif(p_piece uuid, p_exige boolean, p_motif text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p record;
begin
  if auth.uid() is not null and not public.a_permission('depenses','update') then
    raise exception 'Permission insuffisante';
  end if;

  select * into p from public.pieces where id = p_piece;
  if not found then raise exception 'Écriture introuvable'; end if;
  if p.etat = 'annulee' then
    raise exception 'Cette écriture est annulée';
  end if;

  -- Dispenser exige un motif. Exiger n'en demande pas : réclamer une
  -- facture est toujours défendable, s'en passer doit s'expliquer.
  if p_exige = false and trim(coalesce(p_motif, '')) = '' then
    raise exception
      'Dispenser une écriture de facture demande un motif. '
      '« Justifié par le relevé » n''est pas une raison — c''est ce que '
      'le motif doit établir.';
  end if;

  -- Une écriture déjà déclarée ne se retouche pas : la TVA déduite
  -- reposait sur l'état d'alors.
  if exists (
    select 1 from public.declarations_tva d
    where d.etat = 'deposee'
      and public.date_ecriture(p.nature, p.date_piece)
          between d.periode_debut and d.periode_fin)
  then
    raise exception
      'Cette écriture relève d''une déclaration de TVA déjà déposée : '
      'son exigence de justificatif ne se modifie plus.';
  end if;

  update public.pieces
  set    justificatif_exige = p_exige,
         motif_exemption = case when p_exige = false
                                then trim(p_motif) else null end
  where  id = p_piece;

  perform public.journaliser(
    'modification', 'pieces', p_piece::text,
    jsonb_build_object(
      'resume', coalesce(p.numero_piece, '') || ' · '
                || case when p_exige then 'facture désormais exigée'
                        else 'dispensée de facture' end,
      'motif', trim(coalesce(p_motif, '')),
      'champs', jsonb_build_object(
        'avant', p.justificatif_exige,
        'apres', p_exige)));

  return jsonb_build_object(
    'id', p_piece, 'exige', p_exige,
    'motif', case when p_exige = false then trim(p_motif) end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.declaration_tva(p_debut date, p_fin date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_collectee_20   numeric := 0;
  v_base_20        numeric := 0;
  v_collectee_10   numeric := 0;
  v_base_10        numeric := 0;
  v_collectee_55   numeric := 0;
  v_base_55        numeric := 0;
  v_auto_collectee numeric := 0;
  v_auto_base      numeric := 0;
  v_deductible     numeric := 0;
  v_auto_deduite   numeric := 0;
  v_lignes         jsonb;
begin
  if p_fin < p_debut then
    raise exception 'La fin de période précède son début';
  end if;

  -- ---- TVA collectée sur les ventes taxées en France ----
  select
    coalesce(sum(case when p.taux_tva = 20   then e.tva end), 0),
    coalesce(sum(case when p.taux_tva = 20   then e.base_ttc - e.tva end), 0),
    coalesce(sum(case when p.taux_tva = 10   then e.tva end), 0),
    coalesce(sum(case when p.taux_tva = 10   then e.base_ttc - e.tva end), 0),
    coalesce(sum(case when p.taux_tva = 5.5  then e.tva end), 0),
    coalesce(sum(case when p.taux_tva = 5.5  then e.base_ttc - e.tva end), 0)
  into v_collectee_20, v_base_20, v_collectee_10, v_base_10, v_collectee_55, v_base_55
  from public.v_tva_exigible e
  join public.pieces p on p.id = e.piece_id
  where e.sens = 'credit'
    and e.regime_tva = 'france'
    and e.date_exigibilite between p_debut and p_fin;

  -- ---- Autoliquidation : collectée ET déduite, même montant ----
  -- Le solde est nul, mais l'omission est une infraction : les deux
  -- lignes doivent figurer.
  select coalesce(sum(tva), 0), coalesce(sum(base_ttc), 0)
  into   v_auto_collectee, v_auto_base
  from   public.v_tva_exigible
  where  fait_generateur = 'autoliquidation_collectee'
    and  date_exigibilite between p_debut and p_fin;

  select coalesce(sum(tva), 0)
  into   v_auto_deduite
  from   public.v_tva_exigible
  where  fait_generateur = 'autoliquidation_deduite'
    and  date_exigibilite between p_debut and p_fin;

  -- ---- TVA déductible sur les achats ----
  select coalesce(sum(e.tva), 0)
  into   v_deductible
  from   public.v_tva_exigible e
  where  e.sens = 'debit'
    and  e.regime_tva = 'france'
    and  e.date_exigibilite between p_debut and p_fin;

  -- ---- Le détail, pièce par pièce ----
  select coalesce(jsonb_agg(x order by x->>'date_exigibilite'), '[]'::jsonb)
  into   v_lignes
  from (
    select jsonb_build_object(
      'piece_id',         e.piece_id,
      'numero_piece',     e.numero_piece,
      'date_exigibilite', e.date_exigibilite,
      'tiers',            e.tiers_libelle,
      'sens',             e.sens,
      'regime',           e.regime_tva,
      'fait_generateur',  e.fait_generateur,
      'base',             e.base_ttc,
      'tva',              e.tva,
      'lien', case when e.nature in ('vente','avoir')
                   then '/ventes/' || e.piece_id
                   else '/depenses/' || e.piece_id end
    ) as x
    from public.v_tva_exigible e
    where e.date_exigibilite between p_debut and p_fin
  ) s;

  return jsonb_build_object(
    'debut', p_debut,
    'fin',   p_fin,
    'collectee', jsonb_build_object(
      'taux_20',   jsonb_build_object('base', v_base_20, 'tva', v_collectee_20),
      'taux_10',   jsonb_build_object('base', v_base_10, 'tva', v_collectee_10),
      'taux_55',   jsonb_build_object('base', v_base_55, 'tva', v_collectee_55),
      'autoliquidation',
                   jsonb_build_object('base', v_auto_base, 'tva', v_auto_collectee),
      'total', v_collectee_20 + v_collectee_10 + v_collectee_55 + v_auto_collectee),
    'deductible', jsonb_build_object(
      'achats',          v_deductible,
      'autoliquidation', v_auto_deduite,
      'total',           v_deductible + v_auto_deduite),
    'solde',
      (v_collectee_20 + v_collectee_10 + v_collectee_55 + v_auto_collectee)
      - (v_deductible + v_auto_deduite),
    'lignes', v_lignes,
    'nb_lignes', jsonb_array_length(v_lignes)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.definir_attente_banque(p_piece uuid, p_attendu boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p record;
begin
  select * into p from public.pieces where id = p_piece;
  if not found then raise exception 'Pièce introuvable'; end if;

  if auth.uid() is not null
     and not public.a_permission(public.module_piece(p.nature), 'update') then
    raise exception 'Permission insuffisante';
  end if;

  if p_attendu = false and p.transaction_id is not null then
    raise exception
      'Cette écriture est rattachée à une opération bancaire. Détachez-la '
      'd''abord si elle ne devait pas l''être.';
  end if;

  update public.pieces
  set    attendu_en_banque = p_attendu, modifie_le = now()
  where  id = p_piece;

  perform public.journaliser(
    'modification', 'pieces', p_piece::text,
    jsonb_build_object('resume',
      coalesce(p.numero_piece, '(brouillon)') || ' · ' ||
      case when p_attendu then 'remise au contrôle bancaire'
           else 'sortie du contrôle bancaire — aucune opération attendue' end));

  return jsonb_build_object('id', p_piece, 'attendu_en_banque', p_attendu);
end;
$function$;

CREATE OR REPLACE FUNCTION public.definir_prestation(p_piece uuid, p_date date DEFAULT NULL::date, p_debut date DEFAULT NULL::date, p_fin date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p record;
begin
  select * into p from public.pieces where id = p_piece;
  if not found then raise exception 'Pièce introuvable'; end if;

  if auth.uid() is not null
     and not public.a_permission(public.module_piece(p.nature), 'update') then
    raise exception 'Permission insuffisante';
  end if;

  if p.etat <> 'brouillon' then
    raise exception 'Un document émis ne se modifie plus';
  end if;

  if p_date is null and p_debut is null then
    raise exception 'Indiquez une date de prestation, ou une période';
  end if;
  if p_debut is not null and p_fin is null then
    raise exception 'Une période a besoin de sa date de fin';
  end if;
  if p_fin is not null and p_debut is not null and p_fin < p_debut then
    raise exception 'La fin de période précède son début';
  end if;

  -- Une prestation à venir relève de l'acompte, pas de la facture.
  -- Une période en cours reste admise : on facture le mois écoulé.
  if p.nature = 'vente' and p.origine <> 'acompte' then
    if p_date is not null and p_date > current_date then
      raise exception
        'Prestation datée du %, soit dans le futur. Une prestation non '
        'réalisée se facture par un acompte, pas par une facture ordinaire.',
        to_char(p_date, 'DD/MM/YYYY');
    end if;
    if p_debut is not null and p_debut > current_date then
      raise exception
        'La période commence dans le futur. Facturez un acompte, ou attendez '
        'que la prestation ait débuté.';
    end if;
  end if;

  -- Les deux formes s'excluent : une pièce porte une date OU une
  -- période, jamais les deux, sans quoi le gabarit aurait à arbitrer.
  update public.pieces
  set    date_prestation = case when p_date is not null then p_date end,
         periode_debut   = case when p_date is null then p_debut end,
         periode_fin     = case when p_date is null then p_fin end,
         modifie_le      = now()
  where  id = p_piece;

  return jsonb_build_object('id', p_piece, 'enregistre', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.deposer_document(p_type text, p_libelle text, p_chemin text, p_nom_original text, p_type_mime text, p_taille integer, p_date_document date, p_reference text DEFAULT NULL::text, p_date_effet date DEFAULT NULL::date, p_date_expiration date DEFAULT NULL::date, p_remplace uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_ancien record;
begin
  if auth.uid() is not null and not public.a_permission('documents','create') then
    raise exception 'Permission insuffisante';
  end if;

  if p_remplace is not null then
    select * into v_ancien from public.documents_permanents where id = p_remplace;
    if not found then raise exception 'Le document remplacé est introuvable'; end if;
    if not v_ancien.en_vigueur then
      raise exception 'Ce document n''est déjà plus en vigueur';
    end if;
  end if;

  insert into public.documents_permanents (
    type_document, libelle, reference,
    chemin, nom_original, type_mime, taille_octets,
    date_document, date_effet, date_expiration,
    remplace_id, notes, cree_par
  ) values (
    p_type, trim(p_libelle), nullif(trim(coalesce(p_reference,'')), ''),
    p_chemin, p_nom_original, p_type_mime, p_taille,
    p_date_document, p_date_effet, p_date_expiration,
    p_remplace, nullif(trim(coalesce(p_notes,'')), ''), auth.uid()
  )
  returning id into v_id;

  -- L'ancien sort de vigueur, mais reste consultable.
  if p_remplace is not null then
    update public.documents_permanents
    set    en_vigueur = false
    where  id = p_remplace;
  end if;

  perform public.journaliser(
    'creation', 'documents_permanents', v_id::text,
    jsonb_build_object(
      'resume', trim(p_libelle) || ' — ' || p_type,
      'champs', jsonb_build_object(
        'remplace', p_remplace,
        'date_document', p_date_document)));

  return jsonb_build_object('id', v_id, 'remplace', p_remplace);
end;
$function$;

CREATE OR REPLACE FUNCTION public.detacher_appariement(p_piece uuid, p_transaction uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p record; v_supprimes integer;
begin
  select * into p from public.pieces where id = p_piece;
  if not found then raise exception 'Pièce introuvable'; end if;

  if auth.uid() is not null
     and not public.a_permission(public.module_piece(p.nature), 'validate') then
    raise exception 'Permission insuffisante';
  end if;

  delete from public.reglements
  where  piece_id = p_piece and transaction_id = p_transaction;
  get diagnostics v_supprimes = row_count;

  update public.transactions_qonto
  set    statut_traitement = 'a_traiter', depense_id = null,
         rattachement_auto = false, rattache_le = null, rattache_par = null
  where  id = p_transaction;

  update public.pieces
  set    transaction_id = case when transaction_id = p_transaction
                               then null else transaction_id end,
         modifie_le = now()
  where  id = p_piece;

  perform public.journaliser(
    'rapprochement', 'pieces', p_piece::text,
    jsonb_build_object('resume',
      coalesce(p.numero_piece, '(brouillon)') || ' · rattachement défait',
      'reglements_supprimes', v_supprimes));

  return jsonb_build_object('detache', true, 'reglements_supprimes', v_supprimes);
end;
$function$;

CREATE OR REPLACE FUNCTION public.detacher_devis(p_devis uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d record;
begin
  if auth.uid() is not null and not public.a_permission('ventes','update') then
    raise exception 'Droits insuffisants';
  end if;

  select * into d from public.pieces where id = p_devis and nature = 'devis';
  if not found then raise exception 'Devis introuvable'; end if;
  if d.facture_issue_id is null then
    raise exception 'Ce devis n''est rattaché à aucune facture';
  end if;

  update public.pieces
  set    facture_issue_id = null,
         devis_statut = 'envoye',
         modifie_le = now()
  where  id = p_devis;

  perform public.journaliser(
    'modification', 'pieces', p_devis::text,
    jsonb_build_object('resume',
      coalesce(d.numero_piece, 'devis') || ' détaché de sa facture'));

  return jsonb_build_object('devis_id', p_devis, 'devis_statut', 'envoye');
end;
$function$;

CREATE OR REPLACE FUNCTION public.determiner_regime_tva(p_tva_intracom text, p_montant_tva numeric, p_pays_code text DEFAULT 'FR'::text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    -- Une taxe facturée est une taxe française : on la déduit telle quelle.
    when coalesce(p_montant_tva, 0) > 0.005 then 'france'

    -- Numéro intracommunautaire non français, sans taxe facturée :
    -- prestation intra-UE, l'acheteur autoliquide.
    when p_tva_intracom is not null
     and upper(left(trim(p_tva_intracom), 2)) ~ '^[A-Z]{2}$'
     and upper(left(trim(p_tva_intracom), 2)) <> 'FR'
      then 'autoliquidation'

    -- Fournisseur hors Union : importation de services, également
    -- autoliquidée.
    when coalesce(p_pays_code, 'FR') not in ('FR')
     and p_tva_intracom is null
      then 'autoliquidation'

    -- Fournisseur français sans taxe : opération exonérée — assurance,
    -- commission bancaire, affranchissement.
    else 'exonere'
  end;
$function$;

CREATE OR REPLACE FUNCTION public.devis_rattachables(p_facture uuid)
 RETURNS TABLE(id uuid, numero_piece text, date_piece date, objet text, montant_ttc numeric, ecart numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select d.id, d.numero_piece, d.date_piece, d.objet, d.montant_ttc,
         round(coalesce(f.montant_ttc,0) - coalesce(d.montant_ttc,0), 2)
  from   public.pieces d
  join   public.pieces f on f.id = p_facture
  where  d.nature = 'devis'
    and  d.tiers_id = f.tiers_id
    and  d.facture_issue_id is null
  order  by d.date_piece desc;
$function$;

CREATE OR REPLACE FUNCTION public.dossier_associe(p_identifiant text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a          record;
  v_capital  numeric;
  v_mouv     jsonb;
  v_avance   numeric;
  v_rembourse numeric;
begin
  select * into a from public.associes
  where  identifiant = lower(trim(p_identifiant));
  if not found then raise exception 'Associé introuvable : %', p_identifiant; end if;

  -- Le capital total de la société, pour calculer la quote-part.
  select coalesce(sum(capital_souscrit), 0) into v_capital
  from   public.associes where actif;

  select coalesce(sum(case when sens_courant = 'du' then montant else 0 end), 0),
         -coalesce(sum(case when sens_courant = 'rembourse' then montant else 0 end), 0)
  into   v_avance, v_rembourse
  from   public.v_compte_courant
  where  associe = a.identifiant;

  select coalesce(jsonb_agg(x order by x->>'date_ecriture' desc), '[]'::jsonb)
  into   v_mouv
  from (
    select jsonb_build_object(
      'id', c.id,
      'numero_piece', c.numero_piece,
      'date_ecriture', c.date_ecriture,
      'date_piece', c.date_piece,
      'tiers', c.tiers_libelle,
      'objet', c.objet,
      'nature', c.nature,
      'motif', c.motif,
      'sens', c.sens_courant,
      'montant', c.montant,
      -- L'opération bancaire, quand elle existe : c'est ce qui rend le
      -- remboursement traçable jusqu'au relevé.
      'transaction', (
        select jsonb_build_object(
          'numero_piece', t.numero_piece,
          'date_operation', t.date_operation,
          'libelle', coalesce(nullif(trim(t.contrepartie),''), t.libelle))
        from public.pieces p
        join public.transactions_qonto t on t.id = p.transaction_id
        where p.id = c.id)
    ) as x
    from public.v_compte_courant c
    where c.associe = a.identifiant
  ) s;

  return jsonb_build_object(
    'identifiant', a.identifiant,
    'nom_complet', a.prenom || ' ' || a.nom,
    'prenom', a.prenom, 'nom', a.nom,
    'fonction', a.fonction,
    'date_naissance', a.date_naissance,
    'lieu_naissance', a.lieu_naissance,
    'nationalite', a.nationalite,
    'adresse', a.adresse, 'code_postal', a.code_postal, 'ville', a.ville,
    'telephone', a.telephone, 'email', a.email,
    'date_entree', a.date_entree,
    'actif', a.actif,

    'parts', a.parts,
    'capital_souscrit', a.capital_souscrit,
    'capital_libere', a.capital_libere,
    'capital_restant', a.capital_souscrit - a.capital_libere,
    'quote_part', case when v_capital > 0
                       then round(a.capital_souscrit * 100 / v_capital, 2)
                       else 0 end,

    'compte_courant', jsonb_build_object(
      'avance', v_avance,
      'rembourse', v_rembourse,
      'solde', v_avance - v_rembourse),

    'mouvements', v_mouv
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.ecarter_empreintes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (coalesce(new.montant, 0) = 0 or new.statut_qonto in ('declined', 'reversed'))
     and new.statut_traitement = 'a_traiter' then
    new.statut_traitement := 'ecartee';
    new.motif_ecart := 'Automatique : ' || case
      when new.statut_qonto in ('declined', 'reversed')
        then 'opération refusée ou annulée par la banque'
      else 'empreinte de carte à 0 €, sans mouvement' end;
  -- Une empreinte devenue une vraie opération redevient à traiter.
  elsif new.statut_traitement = 'ecartee'
     and coalesce(new.motif_ecart, '') like 'Automatique : %'
     and coalesce(new.montant, 0) <> 0 and new.statut_qonto = 'completed' then
    new.statut_traitement := 'a_traiter';
    new.motif_ecart := null;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ecarts_declaration(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v        record;
  v_actuel jsonb;
begin
  select * into v from public.declarations_tva where id = p_id;
  if not found then raise exception 'Déclaration introuvable'; end if;

  v_actuel := public.declaration_tva(v.periode_debut, v.periode_fin);

  return jsonb_build_object(
    'declare', jsonb_build_object(
      'collectee', v.collectee, 'deductible', v.deductible, 'solde', v.solde,
      'faits_generateurs', jsonb_array_length(v.detail)),
    'actuel', jsonb_build_object(
      'collectee', (v_actuel->'collectee'->>'total')::numeric,
      'deductible', (v_actuel->'deductible'->>'total')::numeric,
      'solde', (v_actuel->>'solde')::numeric,
      'faits_generateurs', (v_actuel->>'nb_lignes')::int),
    'ecart_solde', round((v_actuel->>'solde')::numeric - v.solde, 2),
    'ecart', abs((v_actuel->>'solde')::numeric - v.solde) > 0.005,
    -- Les pièces entrées après coup, celles qu'il faudra reprendre.
    'lignes_nouvelles', (
      select coalesce(jsonb_agg(l), '[]'::jsonb)
      from   jsonb_array_elements(v_actuel->'lignes') l
      where  not exists (
        select 1 from jsonb_array_elements(v.detail) d
        where d->>'piece_id' = l->>'piece_id'
          and d->>'fait_generateur' = l->>'fait_generateur'))
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.echeance_pour_transaction(p_transaction uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t record; e record; v_nb integer;
begin
  select * into t from public.transactions_qonto where id = p_transaction;
  if not found then return null; end if;
  if t.sens <> 'debit' then return null; end if;
  if t.statut_qonto <> 'completed' then return null; end if;

  -- Combien d'échéances non constatées correspondent exactement ? Deux
  -- abonnements au même montant prélevés le même jour, cela existe — et
  -- dans ce cas un humain doit trancher.
  select count(*) into v_nb
  from   public.abonnement_echeances ec
  join   public.abonnements ab on ab.id = ec.abonnement_id
  where  ec.depense_id is null
    and  abs(ab.montant_ttc - abs(t.montant)) < 0.005
    and  abs(ec.date_prevue - t.date_operation) <= 7;

  if v_nb <> 1 then return null; end if;

  select ec.id as echeance_id, ec.periode, ec.date_prevue,
         ab.nom, ab.fournisseur, ab.montant_ttc, ab.autoliquidation
  into   e
  from   public.abonnement_echeances ec
  join   public.abonnements ab on ab.id = ec.abonnement_id
  where  ec.depense_id is null
    and  abs(ab.montant_ttc - abs(t.montant)) < 0.005
    and  abs(ec.date_prevue - t.date_operation) <= 7;

  return jsonb_build_object(
    'echeance_id', e.echeance_id,
    'periode',     e.periode,
    'nom',         e.nom,
    'fournisseur', e.fournisseur,
    'montant_ttc', e.montant_ttc,
    'ecart_jours', abs(e.date_prevue - t.date_operation)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.echeancier(p_horizon integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Le découpage se fait en JOURS, pas en mois calendaires.
  --
  -- Un découpage par mois annonçait « rien d'urgent » alors que la
  -- plateforme agréée tombait dans 24 jours : le 1er septembre étant
  -- hors du mois d'août, elle basculait dans « à venir ». Une échéance
  -- ne devient pas moins urgente parce qu'elle franchit un changement
  -- de mois.
  select jsonb_build_object(
    'en_retard', (
      select coalesce(jsonb_agg(x order by x->>'echeance'), '[]'::jsonb)
      from (select to_jsonb(e) as x from public.v_echeances e
            where not e.accomplie and e.echeance < current_date) s),
    'ce_mois', (
      select coalesce(jsonb_agg(x order by x->>'echeance'), '[]'::jsonb)
      from (select to_jsonb(e) as x from public.v_echeances e
            where not e.accomplie and e.echeance >= current_date
              and e.echeance <= current_date + 30) s),
    'a_venir', (
      select coalesce(jsonb_agg(x order by x->>'echeance'), '[]'::jsonb)
      from (select to_jsonb(e) as x from public.v_echeances e
            where not e.accomplie
              and e.echeance > current_date + 30
              and e.echeance <= current_date + p_horizon) s),
    'accomplies', (
      select coalesce(jsonb_agg(x order by x->>'echeance' desc), '[]'::jsonb)
      from (select to_jsonb(e) as x from public.v_echeances e
            where e.accomplie order by e.echeance desc limit 20) s),
    'compteurs', jsonb_build_object(
      'en_retard', (select count(*) from public.v_echeances
                    where not accomplie and echeance < current_date),
      'ce_mois',   (select count(*) from public.v_echeances
                    where not accomplie and echeance >= current_date
                      and echeance <= current_date + 30))
  );
$function$;

CREATE OR REPLACE FUNCTION public.emettre_vente(p_piece uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.encaisser_piece(p_piece uuid, p_date date, p_montant numeric DEFAULT NULL::numeric, p_moyen text DEFAULT 'virement'::text, p_transaction uuid DEFAULT NULL::uuid, p_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p       record;
  v_reste numeric;
  v_montant numeric;
  v_id    uuid;
begin
  select * into p from public.pieces where id = p_piece;
  if not found then raise exception 'Pièce introuvable'; end if;

  if auth.uid() is not null
     and not public.a_permission(public.module_piece(p.nature), 'validate') then
    raise exception 'Permission insuffisante';
  end if;

  if p.etat <> 'validee' then
    raise exception 'Seule une pièce validée peut être réglée (état : %)', p.etat;
  end if;

  v_reste   := p.net_a_payer - p.montant_regle;
  v_montant := round(coalesce(p_montant, v_reste), 2);

  if v_montant <= 0 then
    raise exception 'Le montant du règlement doit être positif';
  end if;
  if v_montant > v_reste + 0.005 then
    raise exception
      'Règlement supérieur au reste dû (% €). Vérifiez le montant ou créez un avoir.',
      to_char(v_reste, 'FM999999D00');
  end if;

  if p_transaction is not null then
    update public.transactions_qonto
    set    statut_traitement = 'rattachee', rattachement_auto = false,
           rattache_le = now(), rattache_par = auth.uid()
    where  id = p_transaction;
  end if;

  insert into public.reglements (piece_id, date_reglement, montant, moyen,
                                 transaction_id, reference, cree_par)
  values (p_piece, p_date, v_montant, p_moyen, p_transaction, p_reference, auth.uid())
  returning id into v_id;

  perform public.journaliser(
    'reglement', 'pieces', p_piece::text,
    jsonb_build_object(
      'resume', coalesce(p.numero_piece,'(sans numéro)') || ' — '
                || to_char(v_montant, 'FM999999D00') || ' € le '
                || to_char(p_date, 'DD/MM/YYYY'),
      'exigibilite_tva', p_date,
      'solde', v_reste - v_montant
    )
  );

  return jsonb_build_object(
    'id', v_id, 'montant', v_montant,
    'reste_du', round(v_reste - v_montant, 2),
    'solde', (v_reste - v_montant) < 0.005
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.enregistrer_relance(p_piece uuid, p_degre text, p_moyen text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p        record;
  v_reste  numeric;
  v_jours  integer;
  v_derniere record;
  v_id     uuid;
begin
  if auth.uid() is not null and not public.a_permission('ventes','update') then
    raise exception 'Permission insuffisante';
  end if;

  select * into p from public.pieces where id = p_piece;
  if not found then raise exception 'Facture introuvable'; end if;
  if p.nature <> 'vente' then
    raise exception 'On ne relance qu''une facture de vente';
  end if;
  if p.etat <> 'validee' then
    raise exception 'Cette facture n''est pas émise';
  end if;

  v_reste := round(p.net_a_payer - p.montant_regle, 2);
  if v_reste <= 0.005 then
    raise exception
      'Cette facture est soldée. Relancer un client qui a payé est la '
      'meilleure façon de le perdre.';
  end if;

  v_jours := greatest(current_date - p.date_echeance, 0);

  -- Huit jours entre deux envois : une relance quotidienne n'accélère
  -- pas le paiement, elle abîme la relation.
  select * into v_derniere from public.relances
  where  piece_id = p_piece order by envoyee_le desc limit 1;

  if found and v_derniere.envoyee_le > current_date - 8 then
    raise exception
      'Une % a été envoyée le %. Attendez le % : relancer tous les jours '
      'n''accélère pas le paiement.',
      replace(v_derniere.degre, '_', ' '),
      to_char(v_derniere.envoyee_le, 'DD/MM/YYYY'),
      to_char(v_derniere.envoyee_le + 8, 'DD/MM/YYYY');
  end if;

  insert into public.relances
    (piece_id, degre, reste_du, jours_retard, moyen, notes, cree_par)
  values
    (p_piece, p_degre, v_reste, v_jours,
     nullif(trim(coalesce(p_moyen, '')), ''),
     nullif(trim(coalesce(p_notes, '')), ''), auth.uid())
  returning id into v_id;

  -- Les deux colonnes de `pieces` répondent à « où en est cette
  -- facture ? » sans qu'il faille lire l'historique.
  update public.pieces
  set    relances_envoyees = relances_envoyees + 1,
         derniere_relance = current_date
  where  id = p_piece;

  perform public.journaliser(
    'relance', 'pieces', p_piece::text,
    jsonb_build_object(
      'resume', coalesce(p.numero_piece, '') || ' · '
                || replace(p_degre, '_', ' ') || ' — '
                || to_char(v_reste, 'FM999990D00') || ' € réclamés',
      'champs', jsonb_build_object(
        'degre', p_degre, 'jours_retard', v_jours, 'moyen', p_moyen)));

  return jsonb_build_object(
    'id', v_id, 'degre', p_degre,
    'reste_du', v_reste, 'jours_retard', v_jours,
    'rang', (select count(*) from public.relances where piece_id = p_piece));
end;
$function$;

CREATE OR REPLACE FUNCTION public.est_immobilisation(p_compte text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select left(coalesce(trim(p_compte), '6'), 1) = '2';
$function$;

CREATE OR REPLACE FUNCTION public.etat_achats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'a_valider',   (select count(*) from public.pieces
                    where nature in ('achat','creation','km') and etat = 'a_valider'),
    'rejetees',    (select count(*) from public.pieces
                    where nature in ('achat','creation','km') and etat = 'rejetee'),
    'validees',    (select count(*) from public.pieces
                    where nature in ('achat','creation','km') and etat = 'validee'),
    'charges_ht',  (select coalesce(sum(public.charge_comptable(
                             sens, montant_ht, montant_tva, tva_comptable)), 0)
                    from public.pieces
                    where nature in ('achat','creation','km') and etat = 'validee'
                      and not public.est_immobilisation(compte)),
    'immobilisations',
                   (select coalesce(sum(montant_ht), 0) from public.pieces
                    where nature in ('achat','creation') and etat = 'validee'
                      and public.est_immobilisation(compte)),
    'tva_deductible',
                   (select coalesce(sum(tva), 0) from public.v_tva_exigible
                    where sens = 'debit'),
    'sans_justificatif',
                   (select count(*) from public.v_pieces_completes
                    where facture_manquante),
    'sans_banque', (select count(*) from public.v_completude
                    where anomalie = 'piece_sans_banque'),
    'compte_courant',
                   (select coalesce(sum(case when sens = 'debit' then montant_ttc
                                             else -montant_ttc end), 0)
                    from public.pieces
                    where etat = 'validee' and moyen_paiement = 'avance_associe')
  );
$function$;

CREATE OR REPLACE FUNCTION public.etat_cloture(p_exercice uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.etat_coffre()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'total',     (select count(*) from public.documents_permanents where en_vigueur),
    'archives',  (select count(*) from public.documents_permanents where not en_vigueur),
    'poids',     (select coalesce(sum(taille_octets), 0)
                  from public.documents_permanents),
    -- Les documents dont la validité expire : assurance, bail, attestation.
    'expirent', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'libelle', libelle, 'date_expiration', date_expiration,
        'jours', date_expiration - current_date) order by date_expiration), '[]'::jsonb)
      from   public.documents_permanents
      where  en_vigueur and date_expiration is not null
        and  date_expiration <= current_date + 90),
    -- Les indispensables absents. La liste est courte et volontairement
    -- normative : ce sont ceux qu'un tiers réclame en premier.
    'manquants', (
      select coalesce(jsonb_agg(t), '[]'::jsonb)
      from   unnest(array['statuts','kbis','capital']) t
      where  not exists (
        select 1 from public.documents_permanents d
        where d.type_document = t and d.en_vigueur))
  );
$function$;

CREATE OR REPLACE FUNCTION public.etat_contrats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'actifs', (select count(*) from public.contrats
               where actif and (date_fin is null or date_fin >= current_date)),
    'a_facturer', (select count(*) from public.v_contrats_a_facturer where echue),
    -- Le récurrent ramené au mois : la seule mesure qui compare un
    -- hebdomadaire et un trimestriel.
    'recurrent_mensuel', (
      select coalesce(sum(
        round(quantite * prix_unitaire_ht * (1 + taux_tva/100), 2)
        * case periodicite
            when 'hebdomadaire' then 52.0/12
            when 'mensuel'      then 1
            when 'trimestriel'  then 1.0/3
            else                     1.0/12
          end), 0)
      from public.contrats
      where actif and (date_fin is null or date_fin >= current_date)),
    'engagements_proches', (
      select count(*) from public.contrats
      where actif and engagement_jusquau is not null
        and engagement_jusquau - coalesce(preavis_jours, 30) <= current_date
        and engagement_jusquau >= current_date)
  );
$function$;

CREATE OR REPLACE FUNCTION public.etat_dossier()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e record;
begin
  select date_debut, date_fin into e from public.exercices
  where  current_date between date_debut and date_fin limit 1;
  if not found then
    select date_debut, date_fin into e from public.exercices
    where date_debut <= current_date order by date_debut desc limit 1;
  end if;
  if not found then raise exception 'Aucun exercice déclaré'; end if;

  return jsonb_build_object(
    'charges_ht', (
      select coalesce(sum(public.charge_comptable(
               sens, montant_ht, montant_tva, tva_comptable)), 0)
      from   public.pieces
      where  etat = 'validee' and nature in ('achat','creation','km')
        and  not public.est_immobilisation(compte)
        and  public.date_ecriture(nature, date_piece)
             between e.date_debut and e.date_fin),
    'tva_deductible', (
      select coalesce(sum(tva), 0) from public.v_tva_exigible
      where  sens = 'debit' and date_exigibilite between e.date_debut and e.date_fin),
    'ecritures_total', (
      select count(*) from public.pieces where etat in ('validee','a_valider')),
    'ecritures_revues', (
      select count(*) from public.pieces
      where etat in ('validee','a_valider') and revu_le is not null),
    'points_a_traiter', (select count(*) from public.v_anomalies)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.etat_immobilisations()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'inscrites', (select count(*) from public.immobilisations where date_sortie is null),
    'sorties',   (select count(*) from public.immobilisations where date_sortie is not null),
    'valeur_brute', (
      select coalesce(sum(base_amortissable), 0) from public.immobilisations
      where date_sortie is null),
    'amortissements_cumules', (
      select coalesce(sum(x.cumul), 0)
      from   public.immobilisations i
      cross join lateral (
        select cumul from public.plan_amortissement(i.id)
        where  fin <= current_date order by fin desc limit 1) x
      where  i.date_sortie is null),
    'a_inscrire', (
      select count(*) from public.pieces p
      where  p.etat = 'validee' and public.est_immobilisation(p.compte)
        and  not exists (select 1 from public.immobilisations i
                         where i.piece_id = p.id))
  );
$function$;

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

CREATE OR REPLACE FUNCTION public.etats_financiers(p_exercice uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.exercice_clos(p_date date)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select 'du ' || to_char(date_debut, 'DD/MM/YYYY') || ' au ' || to_char(date_fin, 'DD/MM/YYYY')
  from   public.exercices
  where  statut = 'clos' and p_date between date_debut and date_fin
  limit  1;
$function$;

CREATE OR REPLACE FUNCTION public.facturer_echeance(p_echeance uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e       record;
  c       record;
  v_id    uuid;
begin
  if auth.uid() is not null and not public.a_permission('ventes','create') then
    raise exception 'Droits insuffisants';
  end if;

  select * into e from public.contrat_echeances where id = p_echeance;
  if not found then raise exception 'Échéance introuvable'; end if;
  if e.statut <> 'attendue' then
    raise exception 'Cette échéance est déjà %', e.statut;
  end if;

  select * into c from public.contrats where id = e.contrat_id;

  insert into public.pieces (
    nature, sens, origine, date_piece,
    tiers_id, tiers_libelle, objet,
    montant_ht, taux_tva, montant_tva, montant_ttc,
    tva_comptable, type_operation, regime_tva,
    etat, attendu_en_banque, notes, cree_par
  ) values (
    'vente', 'credit', 'contrat', e.date_prevue,
    c.tiers_id, (select nom from public.tiers where id = c.tiers_id),
    coalesce(c.objet, c.libelle) || ' — ' || e.periode,
    0, c.taux_tva, 0, 0,
    0, 'service', 'france',
    'brouillon', true,
    'Contrat ' || coalesce(c.reference, c.libelle) || ' · période ' || e.periode,
    auth.uid()
  )
  returning id into v_id;

  perform public.ajouter_ligne(
    v_id, c.designation, c.quantite, c.prix_unitaire_ht,
    c.taux_tva, c.unite, c.prestation_id, null);

  update public.contrat_echeances
  set    statut = 'facturee', piece_id = v_id
  where  id = p_echeance;

  perform public.journaliser(
    'creation', 'pieces', v_id::text,
    jsonb_build_object(
      'resume', 'Facture en brouillon — contrat ' || coalesce(c.reference, c.libelle)
                || ' · ' || e.periode,
      'origine', 'contrat'));

  return jsonb_build_object('piece_id', v_id, 'periode', e.periode,
                            'montant', e.montant_prevu);
end;
$function$;

CREATE OR REPLACE FUNCTION public.fusionner_tiers(p_garder uuid, p_absorber uuid, p_nom text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  g        record;
  a        record;
  v_nom    text;
  v_pieces integer;
begin
  if auth.uid() is not null and not public.a_permission('clients','update') then
    raise exception 'Permission insuffisante';
  end if;
  if p_garder = p_absorber then
    raise exception 'Choisissez deux fiches différentes.';
  end if;

  select * into g from public.tiers where id = p_garder;
  if not found then raise exception 'Fiche à conserver introuvable'; end if;
  select * into a from public.tiers where id = p_absorber;
  if not found then raise exception 'Fiche à fusionner introuvable'; end if;

  v_nom := coalesce(nullif(trim(coalesce(p_nom, '')), ''), g.nom);

  update public.pieces set tiers_id = p_garder where tiers_id = p_absorber;
  get diagnostics v_pieces = row_count;

  -- Le libellé recopié sur les pièces forme le compte auxiliaire du FEC :
  -- il suit le nom retenu, pour qu'un fournisseur n'ait qu'un compte.
  update public.pieces set tiers_libelle = v_nom
  where  tiers_id = p_garder and tiers_libelle is distinct from v_nom;

  update public.contrats           set tiers_id = p_garder where tiers_id = p_absorber;
  update public.regles_appariement set tiers_id = p_garder where tiers_id = p_absorber;
  update public.alias_bancaires    set tiers_id = p_garder where tiers_id = p_absorber;

  -- La fiche absorbée disparaît AVANT que la fiche conservée prenne le
  -- nom retenu : les noms sont uniques, et le nom retenu peut être le sien.
  delete from public.tiers where id = p_absorber;

  update public.tiers set
    nom             = v_nom,
    est_client      = g.est_client or a.est_client,
    est_fournisseur = g.est_fournisseur or a.est_fournisseur,
    contact     = coalesce(g.contact, a.contact),
    email       = coalesce(g.email, a.email),
    telephone   = coalesce(g.telephone, a.telephone),
    adresse     = coalesce(g.adresse, a.adresse),
    code_postal = coalesce(g.code_postal, a.code_postal),
    ville       = coalesce(g.ville, a.ville),
    siret       = coalesce(g.siret, a.siret),
    tva_intracom = coalesce(g.tva_intracom, a.tva_intracom),
    numero_tva  = coalesce(g.numero_tva, a.numero_tva, g.tva_intracom, a.tva_intracom),
    pays_code   = case when coalesce(g.pays_code, 'FR') = 'FR' and coalesce(a.pays_code, 'FR') <> 'FR'
                       then a.pays_code else g.pays_code end,
    notes       = nullif(concat_ws(E'\n', g.notes, a.notes), ''),
    modifie_le  = now()
  where id = p_garder;

  perform public.journaliser(
    'fusion', 'tiers', p_garder::text,
    jsonb_build_object('resume', a.nom || ' fusionné dans ' || v_nom,
                       'pieces_reprises', v_pieces, 'fiche_absorbee', p_absorber));

  return jsonb_build_object('id', p_garder, 'nom', v_nom, 'pieces_reprises', v_pieces);
end;
$function$;

CREATE OR REPLACE FUNCTION public.garantir_emission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.statut = 'emise' and coalesce(old.statut, '') <> 'emise' then
    if new.numero_piece is null then
      new.numero_piece := public.numero_piece_suivant(
        case when new.nature = 'avoir' then 'AVO' else 'VTE' end,
        coalesce(new.date_emission, current_date)
      );
    end if;

    if new.mentions_gelees is null then
      new.mentions_gelees := public.mentions_entreprise();
    end if;

    new.emise_le := coalesce(new.emise_le, now());
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.generer_echeances(p_abonnement uuid DEFAULT NULL::uuid, p_horizon_mois smallint DEFAULT 12)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a         record;
  v_date    date;
  v_limite  date := current_date + (p_horizon_mois || ' months')::interval;
  v_pas     interval;
  v_creees  integer := 0;
begin
  for a in
    select * from public.abonnements
    where statut = 'actif'
      and montant_ttc > 0
      and (p_abonnement is null or id = p_abonnement)
  loop
    v_pas := case a.periodicite
               when 'mensuel'     then interval '1 month'
               when 'trimestriel' then interval '3 months'
               else                    interval '1 year'
             end;

    v_date := a.date_debut;

    -- Avance jusqu'à la première échéance non encore dépassée de plus
    -- de trois mois : inutile de recréer un historique ancien.
    while v_date < current_date - interval '3 months' loop
      v_date := v_date + v_pas;
    end loop;

    while v_date <= v_limite loop
      -- Une résiliation borne la génération
      exit when a.date_fin is not null and v_date > a.date_fin;

      insert into public.abonnement_echeances
        (abonnement_id, periode, date_prevue, montant_prevu)
      values
        (a.id, to_char(v_date, 'YYYY-MM'), v_date, a.montant_ttc)
      on conflict (abonnement_id, periode) do nothing;

      if found then v_creees := v_creees + 1; end if;
      v_date := v_date + v_pas;
    end loop;
  end loop;

  return v_creees;
end;
$function$;

CREATE OR REPLACE FUNCTION public.generer_echeances_contrats(p_horizon_jours integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c        record;
  v_date   date;
  v_fin    date;
  v_periode text;
  v_creees integer := 0;
begin
  for c in
    select * from public.contrats
    where actif and (date_fin is null or date_fin >= current_date)
  loop
    v_fin := least(current_date + p_horizon_jours,
                   coalesce(c.date_fin, current_date + p_horizon_jours));

    -- Point de départ : la dernière échéance connue, ou le début du
    -- contrat. On ne remonte jamais avant : une période passée non
    -- engendrée l'est restée pour une raison.
    select coalesce(max(date_prevue), c.date_debut - 1)
    into   v_date
    from   public.contrat_echeances where contrat_id = c.id;

    loop
      -- Occurrence suivante
      v_date := case c.periodicite
        when 'hebdomadaire' then v_date + 7
        when 'mensuel'      then (v_date + interval '1 month')::date
        when 'trimestriel'  then (v_date + interval '3 months')::date
        else                     (v_date + interval '1 year')::date
      end;

      -- Premier passage : on cale sur le jour voulu.
      if not exists (select 1 from public.contrat_echeances where contrat_id = c.id) then
        if c.periodicite = 'hebdomadaire' then
          -- isodow : 1 = lundi … 7 = dimanche
          v_date := c.date_debut
                  + ((c.jour_facturation - extract(isodow from c.date_debut)::int + 7) % 7);
        else
          v_date := date_trunc('month', c.date_debut)::date
                  + least(c.jour_facturation,
                          extract(day from (date_trunc('month', c.date_debut)
                                            + interval '1 month - 1 day'))::int) - 1;
          if v_date < c.date_debut then
            v_date := (date_trunc('month', c.date_debut) + interval '1 month')::date
                    + c.jour_facturation - 1;
          end if;
        end if;
      end if;

      exit when v_date > v_fin;

      v_periode := case c.periodicite
        when 'hebdomadaire' then to_char(v_date, 'IYYY') || '-S' || to_char(v_date, 'IW')
        when 'mensuel'      then to_char(v_date, 'YYYY-MM')
        when 'trimestriel'  then to_char(v_date, 'YYYY') || '-T'
                                 || to_char(extract(quarter from v_date), 'FM9')
        else                     to_char(v_date, 'YYYY')
      end;

      insert into public.contrat_echeances (contrat_id, periode, date_prevue, montant_prevu)
      values (c.id, v_periode, v_date,
              round(c.quantite * c.prix_unitaire_ht * (1 + c.taux_tva / 100), 2))
      on conflict (contrat_id, periode) do nothing;

      if found then v_creees := v_creees + 1; end if;
    end loop;
  end loop;

  return jsonb_build_object('creees', v_creees, 'horizon_jours', p_horizon_jours);
end;
$function$;

CREATE OR REPLACE FUNCTION public.generer_lignes_logements(p_facture uuid, p_logement_ids uuid[], p_majoration_dimanche boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_groupe record;
  v_nb     integer := 0;
begin
  if p_logement_ids is null or array_length(p_logement_ids, 1) is null then
    raise exception 'Aucun logement sélectionné';
  end if;

  for v_groupe in
    select
      residence,
      round(
        (prix_base_ht + nb_dortoirs * 15
         + case when surface_superieure then 25 else 0 end)
        * case when p_majoration_dimanche then 1.30 else 1 end,
      2) as prix_final,
      array_agg(nom order by nom) as noms,
      count(*) as qte,
      max(taux_tva) as taux_tva
    from public.client_logements
    where id = any(p_logement_ids)
    group by residence,
      round(
        (prix_base_ht + nb_dortoirs * 15
         + case when surface_superieure then 25 else 0 end)
        * case when p_majoration_dimanche then 1.30 else 1 end,
      2)
    order by residence
  loop
    perform public.ajouter_ligne(
      p_facture,
      'Ménage à blanc — ' || v_groupe.residence
        || case when p_majoration_dimanche then ' (majoré dimanche/férié)' else '' end,
      v_groupe.qte,
      v_groupe.prix_final,
      v_groupe.taux_tva,
      'forfait',
      null,
      array_to_string(v_groupe.noms, ', ')
    );
    v_nb := v_nb + 1;
  end loop;

  return jsonb_build_object('lignes_creees', v_nb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.indemnite_km(p_vehicule uuid, p_annee smallint)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_cv     smallint;
  v_moteur text;
  v_km     numeric;
  v_coef   numeric;
  v_forf   numeric;
  v_total  numeric;
begin
  select cv_fiscaux, motorisation into v_cv, v_moteur
  from public.vehicules where id = p_vehicule;

  if v_cv is null then return 0; end if;

  select coalesce(sum(case when aller_retour then kilometres * 2 else kilometres end), 0)
  into v_km
  from public.deplacements
  where vehicule_id = p_vehicule
    and statut = 'validee'
    and extract(year from date_trajet) = p_annee;

  if v_km = 0 then return 0; end if;

  select coefficient, forfait into v_coef, v_forf
  from public.bareme_km
  where annee = p_annee
    and v_cv between cv_min and cv_max
    and v_km >= km_min
    and (km_max is null or v_km <= km_max)
  limit 1;

  if v_coef is null then return 0; end if;

  v_total := (v_km * v_coef) + v_forf;

  -- Majoration de 20 % pour les véhicules 100 % électriques
  if v_moteur = 'electrique' then
    v_total := v_total * 1.20;
  end if;

  return round(v_total, 2);
end;
$function$;

CREATE OR REPLACE FUNCTION public.inscrire_immobilisation(p_piece uuid, p_date_mise_service date DEFAULT NULL::date, p_duree smallint DEFAULT NULL::smallint, p_valeur_residuelle numeric DEFAULT 0, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p      record;
  c      record;
  v_base numeric;
  v_duree smallint;
  v_id   uuid;
begin
  if auth.uid() is not null and not public.a_permission('depenses','validate') then
    raise exception 'Seul le propriétaire inscrit une immobilisation';
  end if;

  select * into p from public.pieces where id = p_piece;
  if not found then raise exception 'Écriture introuvable'; end if;
  if p.etat <> 'validee' then
    raise exception 'Seule une écriture validée s''inscrit au registre';
  end if;
  if not public.est_immobilisation(p.compte) then
    raise exception
      'Le compte % n''est pas un compte d''immobilisation. Un bien durable '
      'relève de la classe 2 ; corrigez la catégorie avant d''inscrire.',
      coalesce(p.compte, '(vide)');
  end if;
  if exists (select 1 from public.immobilisations where piece_id = p_piece) then
    raise exception 'Cette écriture est déjà inscrite au registre';
  end if;

  select * into c from public.categories where id = p.categorie_id;

  -- Le coût d'acquisition : hors taxes, plus la TVA qu'on n'a pas pu
  -- déduire.
  v_base := public.charge_comptable(
    'debit', p.montant_ht, p.montant_tva, p.tva_comptable);

  v_duree := coalesce(p_duree, c.duree_amortissement, 5);

  insert into public.immobilisations (
    piece_id, libelle, compte,
    date_acquisition, date_mise_en_service,
    base_amortissable, valeur_residuelle,
    duree_annees, mode, notes, cree_par
  ) values (
    p_piece,
    coalesce(nullif(trim(p.objet), ''), p.tiers_libelle),
    p.compte,
    p.date_piece,
    coalesce(p_date_mise_service, p.date_piece),
    v_base, coalesce(p_valeur_residuelle, 0),
    v_duree, 'lineaire', p_notes, auth.uid()
  )
  returning id into v_id;

  perform public.journaliser(
    'creation', 'immobilisations', v_id::text,
    jsonb_build_object(
      'resume', coalesce(p.numero_piece, '') || ' · '
                || coalesce(nullif(trim(p.objet), ''), p.tiers_libelle)
                || ' — ' || to_char(v_base, 'FM999999D00') || ' € sur '
                || v_duree || ' ans',
      'champs', jsonb_build_object(
        'base_amortissable', v_base,
        'tva_non_recuperable', p.montant_tva - abs(p.tva_comptable),
        'duree_annees', v_duree)));

  return jsonb_build_object(
    'id', v_id,
    'base_amortissable', v_base,
    'duree_annees', v_duree,
    'annuite', round((v_base - coalesce(p_valeur_residuelle, 0)) / v_duree, 2));
end;
$function$;

CREATE OR REPLACE FUNCTION public.journaliser(p_action text, p_table text DEFAULT NULL::text, p_id text DEFAULT NULL::text, p_details jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.audit (utilisateur, email, action, table_cible, id_cible, details)
  values (
    auth.uid(),
    (select email from public.profils where id = auth.uid()),
    p_action, p_table, p_id, p_details
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.km_a_constater()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_annee   integer := extract(year from current_date)::integer;
  v_nb      integer;
  v_km      numeric;
  v_premier date;
  v_dernier date;
  v_cumul   numeric;
  v_cv      smallint;
  v_bareme  boolean;
begin
  select count(*),
         coalesce(sum(kilometres * case when aller_retour then 2 else 1 end), 0),
         min(date_trajet), max(date_trajet)
  into   v_nb, v_km, v_premier, v_dernier
  from   public.deplacements d
  where  d.statut = 'validee'
    and  not exists (select 1 from public.pieces p
                     where p.nature = 'km' and p.etat <> 'annulee'
                       and p.periode_debut <= d.date_trajet
                       and p.periode_fin   >= d.date_trajet);

  -- Le cumul annuel commande la tranche : sans lui, on ne sait pas
  -- quel coefficient s'appliquera.
  select coalesce(sum(kilometres * case when aller_retour then 2 else 1 end), 0)
  into   v_cumul
  from   public.deplacements
  where  statut = 'validee' and extract(year from date_trajet) = v_annee;

  select cv_fiscaux into v_cv from public.vehicules where actif order by cree_le limit 1;

  select exists (select 1 from public.bareme_km where annee = v_annee)
  into   v_bareme;

  return jsonb_build_object(
    'trajets', v_nb,
    'kilometres', v_km,
    'premier', v_premier,
    'dernier', v_dernier,
    'cumul_annuel', v_cumul,
    'cv_fiscaux', v_cv,
    'bareme_renseigne', v_bareme,
    'annee', v_annee,
    -- En attente de validation : ils ne peuvent pas encore être
    -- indemnisés, mais il faut le dire.
    'en_attente', (select count(*) from public.deplacements
                   where statut = 'en_attente')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.km_effectifs(d deplacements)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when d.aller_retour then d.kilometres * 2 else d.kilometres end;
$function$;

CREATE OR REPLACE FUNCTION public.lieux_frequents()
 RETURNS TABLE(lieu text, occurrences bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select l, count(*)
  from (
    select trim(depart) as l from public.deplacements where trim(depart) <> ''
    union all
    select trim(arrivee) from public.deplacements where trim(arrivee) <> ''
    union all
    -- Les villes des clients : on s'y rend, c'est le cas le plus
    -- fréquent d'un déplacement professionnel.
    select trim(ville) from public.clients
    where ville is not null and trim(ville) <> ''
  ) x
  group by l
  order by count(*) desc, l
  limit 40;
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

CREATE OR REPLACE FUNCTION public.marquer_impayees()
 RETURNS integer
 LANGUAGE sql
AS $function$ select 0; $function$;

CREATE OR REPLACE FUNCTION public.marquer_justificatifs_manquants()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n integer;
begin
  update public.abonnement_echeances
  set    statut = 'justificatif_manquant'
  where  statut = 'attendue'
    and  date_prevue < current_date - interval '7 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.marquer_revu(p_table text, p_id uuid, p_revu boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.a_permission('depenses','revue') then
    raise exception 'Permission insuffisante pour marquer une écriture comme revue';
  end if;

  if p_table not in ('depenses','frais_creation','deplacements') then
    raise exception 'Table non prise en charge : %', p_table;
  end if;

  execute format(
    'update public.%I set revu_le = %L, revu_par = %L where id = %L',
    p_table,
    case when p_revu then now()::text else null end,
    case when p_revu then auth.uid()::text else null end,
    p_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.marquer_revu(p_piece uuid, p_revu boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p record;
begin
  select * into p from public.pieces where id = p_piece;
  if not found then raise exception 'Pièce introuvable'; end if;

  if auth.uid() is not null and not public.a_permission('depenses','revue') then
    raise exception 'Permission insuffisante';
  end if;

  update public.pieces
  set    revu_le  = case when p_revu then now() end,
         revu_par = case when p_revu then auth.uid() end,
         modifie_le = now()
  where  id = p_piece;

  perform public.journaliser(
    'revue', 'pieces', p_piece::text,
    jsonb_build_object('resume',
      coalesce(p.numero_piece, '(brouillon)') || ' · ' ||
      case when p_revu then 'marquée revue' else 'revue retirée' end));

  return jsonb_build_object('id', p_piece, 'revu', p_revu);
end;
$function$;

CREATE OR REPLACE FUNCTION public.memoriser_fournisseur(p_fournisseur text, p_categorie uuid, p_siret text DEFAULT NULL::text, p_tva text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.fournisseurs_connus
    (fournisseur, categorie_id, siret, tva, occurrences, derniere_vue)
  values (lower(trim(p_fournisseur)), p_categorie, p_siret, p_tva, 1, now())
  on conflict (fournisseur) do update
    set categorie_id = excluded.categorie_id,
        siret        = coalesce(excluded.siret, public.fournisseurs_connus.siret),
        tva          = coalesce(excluded.tva, public.fournisseurs_connus.tva),
        occurrences  = public.fournisseurs_connus.occurrences + 1,
        derniere_vue = now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.memoriser_libelle(p_libelle text, p_fournisseur text, p_categorie uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_motif text := public.normaliser_libelle(p_libelle);
begin
  if coalesce(v_motif, '') = '' then return; end if;

  insert into public.libelles_bancaires (motif, fournisseur, categorie_id)
  values (v_motif, p_fournisseur, p_categorie)
  on conflict (motif) do update
    set fournisseur  = excluded.fournisseur,
        categorie_id = coalesce(excluded.categorie_id, public.libelles_bancaires.categorie_id),
        occurrences  = public.libelles_bancaires.occurrences + 1,
        derniere_vue = now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.mentions_entreprise()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'raison_sociale',   e.raison_sociale,
    'forme_juridique',  e.forme_juridique,
    'capital',          e.capital,
    'siren',            e.siren,
    'siret',            e.siret,
    'rcs',              e.rcs,
    'tva_intracom',     e.tva_intracom,
    'code_ape',         e.code_ape,
    'adresse',          e.adresse,
    'code_postal',      e.code_postal,
    'ville',            e.ville,
    'email',            e.email,
    'telephone',        e.telephone,
    'site_web',         e.site_web,
    'iban',             e.iban,
    'bic',              e.bic,
    'banque_nom',       e.banque_nom,
    'logo_chemin',      e.logo_chemin,
    'penalites',        case e.penalites_mode
                          when 'taux_legal_triple'
                            then 'Trois fois le taux d''intérêt légal en vigueur'
                          else to_char(e.penalites_taux, 'FM999D00') || ' % par an'
                        end,
    'indemnite_recouvrement', e.indemnite_recouvrement,
    'escompte',         case when e.escompte_accorde
                          then 'Escompte selon conditions générales'
                          else 'Aucun escompte pour paiement anticipé'
                        end,
    'mediateur_nom',    e.mediateur_nom,
    'mediateur_adresse',e.mediateur_adresse,
    'mediateur_site',   e.mediateur_site,
    'rc_pro_assureur',  e.rc_pro_assureur,
    'rc_pro_police',    e.rc_pro_police,
    'rc_pro_couverture',e.rc_pro_couverture,
    'conditions_generales', e.conditions_generales,
    'gele_le',          now()
  )
  from public.entreprise e
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.modifier_achat(p_piece uuid, p_date date DEFAULT NULL::date, p_tiers text DEFAULT NULL::text, p_categorie uuid DEFAULT NULL::uuid, p_montant_ttc numeric DEFAULT NULL::numeric, p_taux_tva numeric DEFAULT NULL::numeric, p_objet text DEFAULT NULL::text, p_numero_externe text DEFAULT NULL::text, p_moyen_paiement text DEFAULT NULL::text, p_paye_par text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_deductibilite smallint DEFAULT NULL::smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p       record;
  c       record;
  v_taux  numeric;
  v_ht    numeric; v_tva numeric; v_ttc numeric; v_dedu numeric;
  v_tiers uuid;
  v_deduc smallint;
  v_avant jsonb;
begin
  select * into p from public.pieces where id = p_piece;
  if not found then raise exception 'Pièce introuvable'; end if;

  if auth.uid() is not null and not public.a_permission('depenses','update') then
    raise exception 'Permission insuffisante';
  end if;

  if p.etat not in ('brouillon','a_valider','rejetee') then
    raise exception
      'Une écriture validée ne se corrige pas. Annulez-la et ressaisissez-la : '
      'la numérotation doit rester continue.';
  end if;

  v_avant := jsonb_build_object(
    'date_piece', p.date_piece, 'tiers', p.tiers_libelle,
    'montant_ttc', p.montant_ttc, 'categorie_id', p.categorie_id);

  select * into c from public.categories
  where  id = coalesce(p_categorie, p.categorie_id);
  if not found then raise exception 'Catégorie introuvable'; end if;
  if c.bloque then raise exception 'Cette catégorie n''autorise pas la saisie'; end if;

  v_taux  := coalesce(p_taux_tva, p.taux_tva);
  v_ttc   := round(coalesce(p_montant_ttc, p.montant_ttc), 2);
  v_deduc := coalesce(p_deductibilite, p.taux_deductibilite);
  v_tiers := case when p_tiers is not null
                  then public.trouver_ou_creer_tiers(p_tiers, true, false)
                  else p.tiers_id end;

  -- Le régime ne se ressaisit pas : il découle des mêmes faits qu'à la
  -- création, et rien de ce qu'on corrige ici ne le change.
  if p.regime_tva = 'autoliquidation' then
    v_ht := v_ttc; v_tva := 0; v_dedu := 0;
  elsif p.regime_tva = 'exonere' then
    v_ht := v_ttc; v_tva := 0; v_dedu := 0;
  else
    v_ht   := round(v_ttc / (1 + v_taux / 100), 2);
    v_tva  := round(v_ttc - v_ht, 2);
    v_dedu := round(v_tva * (v_deduc / 100.0), 2);
  end if;

  update public.pieces
  set    date_piece   = coalesce(p_date, date_piece),
         tiers_id     = v_tiers,
         tiers_libelle = coalesce(trim(p_tiers), tiers_libelle),
         categorie_id = c.id,
         compte       = c.compte,
         type_operation = c.type_operation,
         objet        = coalesce(nullif(trim(coalesce(p_objet,'')),''), objet),
         montant_ht   = v_ht,
         taux_tva     = v_taux,
         montant_tva  = v_tva,
         montant_ttc  = v_ttc,
         tva_comptable = v_dedu,
         taux_deductibilite = v_deduc,
         tva_autoliquidee = case when regime_tva = 'autoliquidation'
                                 then round(v_ht * v_taux / 100, 2) else 0 end,
         numero_externe = coalesce(nullif(trim(coalesce(p_numero_externe,'')),''),
                                   numero_externe),
         moyen_paiement = coalesce(p_moyen_paiement, moyen_paiement),
         paye_par     = coalesce(p_paye_par, paye_par),
         notes        = coalesce(p_notes, notes),
         attendu_en_banque = (coalesce(coalesce(p_paye_par, paye_par),'societe') = 'societe'
                              and coalesce(coalesce(p_moyen_paiement, moyen_paiement),'carte')
                                  not in ('especes','avance_associe')),
         modifie_le   = now()
  where  id = p_piece;

  perform public.journaliser(
    'modification', 'pieces', p_piece::text,
    jsonb_build_object(
      'resume', 'Correction · ' || coalesce(trim(p_tiers), p.tiers_libelle)
                || ' — ' || to_char(v_ttc, 'FM999999D00') || ' € TTC',
      'avant', v_avant,
      'apres', jsonb_build_object(
        'date_piece', coalesce(p_date, p.date_piece),
        'tiers', coalesce(trim(p_tiers), p.tiers_libelle),
        'montant_ttc', v_ttc, 'categorie_id', c.id)));

  return jsonb_build_object(
    'id', p_piece, 'montant_ht', v_ht, 'montant_tva', v_tva,
    'montant_ttc', v_ttc, 'tva_deductible', v_dedu);
end;
$function$;

CREATE OR REPLACE FUNCTION public.module_piece(p_nature text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- « devis » rejoint les ventes : c'est un document commercial adressé
  -- au client, pas un achat.
  select case when p_nature in ('vente','avoir','devis') then 'ventes'
              else 'depenses' end;
$function$;

CREATE OR REPLACE FUNCTION public.motifs_frequents()
 RETURNS TABLE(motif text, occurrences bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m, count(*)
  from (
    select trim(motif) as m from public.deplacements
    where trim(coalesce(motif,'')) <> ''
  ) x
  group by m
  order by count(*) desc, m
  limit 25;
$function$;

CREATE OR REPLACE FUNCTION public.nom_associe(p_identifiant text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select prenom || ' ' || nom from public.associes
     where identifiant = lower(trim(p_identifiant))),
    -- Repli sur les profils, puis sur l'identifiant lui-même : une
    -- écriture ancienne ne doit jamais perdre son libellé.
    (select nom_complet from public.profils
     where lower(nom_complet) like lower(trim(p_identifiant)) || '%'
       and actif limit 1),
    initcap(coalesce(nullif(trim(p_identifiant), ''), 'Associé'))
  );
$function$;

CREATE OR REPLACE FUNCTION public.normaliser_libelle(p_libelle text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select trim(regexp_replace(
    regexp_replace(
      lower(coalesce(p_libelle, '')),
      '(^| )(cb|carte|paiement|prlv|prelevement|vir|virement|achat)( |$)', ' ', 'g'
    ),
    '[^a-zà-ÿ ]+', ' ', 'g'
  ));
$function$;

CREATE OR REPLACE FUNCTION public.normaliser_tiers(p_texte text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select trim(regexp_replace(
    regexp_replace(
      translate(upper(coalesce(p_texte, '')),
                'ÀÂÄÁÃÇÈÊËÉÎÏÍÌÔÖÓÒÕÙÛÜÚÑ',
                'AAAAACEEEEIIIIOOOOOUUUUN'),
      '[0-9]+|CARTE|CB|PRLV|PRELEVEMENT|VIR|VIREMENT|SEPA|PAIEMENT|ACHAT', ' ', 'g'),
    '[^A-Z ]+|\s+', ' ', 'g'));
$function$;

CREATE OR REPLACE FUNCTION public.numero_piece_suivant(p_prefixe text, p_date date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_annee  smallint := extract(year from p_date)::smallint;
  v_numero integer;
begin
  insert into public.compteurs_piece (prefixe, annee, dernier)
  values (p_prefixe, v_annee, 1)
  on conflict (prefixe, annee)
    do update set dernier = public.compteurs_piece.dernier + 1
  returning dernier into v_numero;

  return p_prefixe || '-' || v_annee || '-' || lpad(v_numero::text, 4, '0');
end;
$function$;

CREATE OR REPLACE FUNCTION public.numeroter_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.numero_piece is null then
    new.numero_piece := public.numero_piece_suivant('CLI', current_date);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.numeroter_devis_piece(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_annee  integer;
  v_rang   integer;
  v_numero text;
begin
  select extract(year from date_piece)::integer into v_annee
  from   public.pieces where id = p_id and nature = 'devis';
  if not found then
    raise exception 'Devis introuvable : %', p_id;
  end if;

  -- Le rang se déduit de ce qui existe, verrou en place : deux devis
  -- créés dans la même seconde ne doivent pas partager un numéro.
  perform pg_advisory_xact_lock(hashtext('numeroter_devis' || v_annee));

  select coalesce(max(substring(numero_piece from '\d+$')::integer), 0) + 1
  into   v_rang
  from   public.pieces
  where  nature = 'devis'
    and  numero_piece like 'DEV-' || v_annee || '-%';

  v_numero := 'DEV-' || v_annee || '-' || lpad(v_rang::text, 4, '0');

  update public.pieces set numero_piece = v_numero where id = p_id;
  return v_numero;
end;
$function$;

CREATE OR REPLACE FUNCTION public.numeroter_facture()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.numero_piece is null then
    new.numero_piece := public.numero_piece_suivant(
      case when new.nature = 'avoir' then 'AVO' else 'VTE' end,
      coalesce(new.date_emission, current_date)
    );
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.numeroter_piece(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p record; v_piece text;
begin
  select * into p from public.pieces where id = p_id;
  if not found then raise exception 'Pièce introuvable'; end if;
  if p.numero_piece is not null then return p.numero_piece; end if;

  v_piece := public.numero_piece_suivant(
    public.prefixe_piece(p.nature, p.origine),
    p.date_piece
  );

  update public.pieces set numero_piece = v_piece where id = p_id;
  return v_piece;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ordre_restauration()
 RETURNS SETOF text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_place   text[] := '{}';
  v_restant text[];
  v_ajout   text[];
  v_tour    integer := 0;
begin
  select array_agg(t order by t) into v_restant
  from   public.tables_publiques() t;

  while array_length(v_restant, 1) > 0 and v_tour < 50 loop
    v_tour := v_tour + 1;

    -- Les tables dont TOUS les parents sont déjà placés.
    select coalesce(array_agg(r order by r), '{}') into v_ajout
    from   unnest(v_restant) r
    where  not exists (
      select 1
      from   pg_constraint c
      join   pg_class      enfant on enfant.oid = c.conrelid
      join   pg_class      parent on parent.oid = c.confrelid
      join   pg_namespace  n      on n.oid = enfant.relnamespace
      where  c.contype = 'f'
        and  n.nspname = 'public'
        and  enfant.relname = r
        and  parent.relname <> r          -- auto-référence : sans effet
        and  parent.relname <> all(v_place)
    );

    exit when array_length(v_ajout, 1) is null;

    v_place := v_place || v_ajout;
    select coalesce(array_agg(x), '{}') into v_restant
    from   unnest(v_restant) x where x <> all(v_ajout);
  end loop;

  -- Cycle éventuel : on rend quand même les tables restantes.
  if array_length(v_restant, 1) > 0 then
    raise warning 'Cycle de clés étrangères : % ajoutée(s) sans ordre garanti.',
      array_to_string(v_restant, ', ');
    v_place := v_place || v_restant;
  end if;

  return query select unnest(v_place);
end;
$function$;

CREATE OR REPLACE FUNCTION public.payeurs_possibles()
 RETURNS TABLE(valeur text, libelle text, avance boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select 'societe'::text, 'La société'::text, false
  union all
  select a.identifiant,
         a.prenom || ' ' || a.nom || ' (à rembourser)',
         true
  from   public.associes a
  where  a.actif and a.date_sortie is null
  order  by 3, 2;
$function$;

CREATE OR REPLACE FUNCTION public.periode_nature_libre(p_nature text, p_debut date, p_fin date)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chevauche record;
begin
  select numero_piece, periode_debut, periode_fin
  into   v_chevauche
  from   public.pieces
  where  nature = p_nature
    and  etat <> 'annulee'
    and  periode_debut is not null and periode_fin is not null
    and  daterange(periode_debut, periode_fin, '[]')
      && daterange(p_debut, p_fin, '[]')
  order  by periode_debut
  limit  1;

  if found then
    raise exception
      'Cette période chevauche l''écriture % (du % au %). '
      'La part commune serait constatée deux fois.',
      coalesce(v_chevauche.numero_piece, '(brouillon)'),
      to_char(v_chevauche.periode_debut, 'DD/MM/YYYY'),
      to_char(v_chevauche.periode_fin,   'DD/MM/YYYY');
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.periode_tva_declaree(p_date date)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(reference, formulaire) || ' du ' || to_char(periode_debut, 'DD/MM/YYYY')
         || ' au ' || to_char(periode_fin, 'DD/MM/YYYY')
  from   public.declarations_tva
  where  etat <> 'annulee' and p_date between periode_debut and periode_fin
  order  by periode_debut
  limit  1;
$function$;

CREATE OR REPLACE FUNCTION public.periode_tva_libre(p_debut date, p_fin date)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chevauche record;
  v_avant     record;
begin
  select periode_debut, periode_fin, reference, formulaire
  into   v_chevauche
  from   public.declarations_tva
  where  etat <> 'annulee'
    and  daterange(periode_debut, periode_fin, '[]')
      && daterange(p_debut, p_fin, '[]')
  order  by periode_debut
  limit  1;

  if found then
    raise exception
      'Cette période chevauche une déclaration existante : % du % au %. '
      'Les faits générateurs communs seraient déclarés deux fois.',
      coalesce(v_chevauche.reference, v_chevauche.formulaire),
      to_char(v_chevauche.periode_debut, 'DD/MM/YYYY'),
      to_char(v_chevauche.periode_fin,   'DD/MM/YYYY');
  end if;

  select periode_fin into v_avant
  from   public.declarations_tva
  where  etat <> 'annulee' and periode_fin < p_debut
  order  by periode_fin desc
  limit  1;

  if found and v_avant.periode_fin + 1 < p_debut then
    raise warning
      'Les journées du % au % ne sont couvertes par aucune déclaration.',
      to_char(v_avant.periode_fin + 1, 'DD/MM/YYYY'),
      to_char(p_debut - 1,             'DD/MM/YYYY');
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.plan_amortissement(p_id uuid)
 RETURNS TABLE(annee integer, debut date, fin date, jours integer, dotation numeric, cumul numeric, valeur_nette numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  i          record;
  v_annuite  numeric;
  v_debut    date;
  v_fin      date;
  v_cumul    numeric := 0;
  v_reste    numeric;
  v_jours    integer;
  v_dot      numeric;
  v_an       integer;
begin
  select * into i from public.immobilisations where id = p_id;
  if not found then raise exception 'Immobilisation introuvable'; end if;

  v_reste := i.base_amortissable - i.valeur_residuelle;
  v_annuite := v_reste / i.duree_annees;

  for v_an in 0 .. i.duree_annees loop
    v_debut := greatest(
      (date_trunc('year', i.date_mise_en_service) + (v_an || ' years')::interval)::date,
      i.date_mise_en_service);
    v_fin := least(
      (date_trunc('year', i.date_mise_en_service)
        + ((v_an + 1) || ' years')::interval - interval '1 day')::date,
      -- La sortie arrête l'amortissement le jour même.
      coalesce(i.date_sortie,
               (i.date_mise_en_service + (i.duree_annees || ' years')::interval
                - interval '1 day')::date));

    exit when v_debut > v_fin;

    -- Prorata temporis : acheter le 15 décembre ne donne pas droit à une
    -- annuité pleine.
    v_jours := (v_fin - v_debut) + 1;
    v_dot := round(v_annuite * v_jours / 365.0, 2);

    -- La dernière annuité absorbe l'arrondi : le cumul doit tomber
    -- exactement sur la base, au centime.
    if v_cumul + v_dot > v_reste then v_dot := round(v_reste - v_cumul, 2); end if;
    exit when v_dot <= 0;

    v_cumul := v_cumul + v_dot;

    annee := extract(year from v_debut)::integer;
    debut := v_debut;
    fin := v_fin;
    jours := v_jours;
    dotation := v_dot;
    cumul := v_cumul;
    valeur_nette := round(i.base_amortissable - v_cumul, 2);
    return next;

    exit when v_cumul >= v_reste - 0.005;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prefixe_piece(p_nature text, p_origine text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
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

CREATE OR REPLACE FUNCTION public.produit_vente_ht(p_sens text, p_origine text, p_ht numeric, p_tva numeric, p_ttc numeric, p_acomptes numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_sens = 'credit' then
      p_ht - case when p_origine = 'solde' and p_acomptes > 0.005 and p_ttc > 0
                  then p_acomptes - round(p_acomptes * p_tva / p_ttc, 2)
                  else 0 end
    else -p_ht
  end;
$function$;

CREATE OR REPLACE FUNCTION public.proposition_pour_piece(p_piece uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c record;
begin
  select * into c from public.candidats_pour_piece(p_piece)
  order  by score desc limit 1;

  if not found then return null; end if;

  return jsonb_build_object(
    'transaction_id', c.transaction_id,
    'numero_piece',   c.numero_piece,
    'date_operation', c.date_operation,
    'montant',        c.montant,
    'libelle',        c.libelle,
    'score',          c.score,
    'decision',       c.decision,
    'motifs',         c.motifs);
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

CREATE OR REPLACE FUNCTION public.rattacher_devis(p_facture uuid, p_devis uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  f record;
  d record;
  v_ecart numeric;
begin
  if auth.uid() is not null and not public.a_permission('ventes','update') then
    raise exception 'Droits insuffisants';
  end if;

  select * into f from public.pieces
  where id = p_facture and nature in ('vente','avoir');
  if not found then raise exception 'Facture introuvable'; end if;

  select * into d from public.pieces where id = p_devis and nature = 'devis';
  if not found then raise exception 'Devis introuvable'; end if;

  if exists (select 1 from public.pieces
             where facture_issue_id = p_facture and id <> p_devis) then
    raise exception
      'Cette facture est déjà rattachée à un autre devis. Détachez-le d''abord.';
  end if;

  if d.devis_statut = 'accepte' and d.facture_issue_id is not null
     and d.facture_issue_id <> p_facture then
    raise exception
      'Ce devis a déjà produit la facture %.',
      coalesce((select numero_piece from public.pieces where id = d.facture_issue_id),
               '(en brouillon)');
  end if;

  if d.tiers_id is distinct from f.tiers_id then
    raise exception
      'Le devis est établi pour % et la facture pour % : ce rapprochement '
      'serait faux.', d.tiers_libelle, f.tiers_libelle;
  end if;

  v_ecart := coalesce(f.montant_ttc, 0) - coalesce(d.montant_ttc, 0);
  if abs(v_ecart) > 0.005 then
    raise warning
      'Écart entre le devis (% €) et la facture (% €) : % €.',
      d.montant_ttc, f.montant_ttc, v_ecart;
  end if;

  update public.pieces
  set    devis_statut = 'accepte',
         facture_issue_id = p_facture,
         modifie_le = now()
  where  id = p_devis;

  perform public.journaliser(
    'modification', 'pieces', p_devis::text,
    jsonb_build_object(
      'resume', coalesce(d.numero_piece, 'devis') || ' rattaché à la facture '
                || coalesce(f.numero_piece, '(brouillon)'),
      'champs', jsonb_build_object(
        'montant_devis', d.montant_ttc,
        'montant_facture', f.montant_ttc,
        'ecart', v_ecart)));

  return jsonb_build_object(
    'devis_id', p_devis, 'facture_id', p_facture,
    'montant_devis', d.montant_ttc, 'montant_facture', f.montant_ttc,
    'ecart', v_ecart);
end;
$function$;

CREATE OR REPLACE FUNCTION public.rattacher_justificatif(p_piece uuid, p_chemin text, p_nom text, p_type text, p_taille integer, p_taille_origine integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p record; v_id uuid;
begin
  select * into p from public.pieces where id = p_piece;
  if not found then raise exception 'Pièce introuvable'; end if;

  if auth.uid() is not null
     and not public.a_permission(public.module_piece(p.nature), 'update') then
    raise exception 'Permission insuffisante';
  end if;

  if p.etat = 'annulee' then
    raise exception 'Une écriture annulée n''accepte plus de justificatif';
  end if;

  insert into public.justificatifs (piece_id, chemin, nom_original,
                                    type_mime, taille_octets, taille_origine,
                                    cree_par)
  values (p_piece, p_chemin, p_nom, p_type, p_taille, p_taille_origine, auth.uid())
  returning id into v_id;

  perform public.journaliser(
    'justificatif', 'pieces', p_piece::text,
    jsonb_build_object('resume',
      coalesce(p.numero_piece, '(brouillon)') || ' · justificatif ajouté — ' || p_nom));

  return jsonb_build_object('id', v_id, 'chemin', p_chemin);
end;
$function$;

CREATE OR REPLACE FUNCTION public.rattacher_justificatif_qonto(p_transaction uuid, p_piece uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t record;
begin
  select * into t from public.transactions_qonto where id = p_transaction;
  if not found then raise exception 'Opération bancaire introuvable'; end if;
  if t.chemin_justificatif is null then
    return jsonb_build_object('rattache', false, 'motif', 'aucun fichier récupéré');
  end if;

  if exists (select 1 from public.justificatifs
             where piece_id = p_piece and chemin = t.chemin_justificatif) then
    return jsonb_build_object('rattache', false, 'motif', 'déjà rattaché');
  end if;

  insert into public.justificatifs (piece_id, chemin, nom_original,
                                    type_mime, taille_octets, cree_par)
  values (p_piece, t.chemin_justificatif,
          coalesce(t.nom_justificatif, 'justificatif-qonto'),
          coalesce(t.type_justificatif, 'application/pdf'),
          0, auth.uid());

  update public.transactions_qonto
  set    justificatif_traite = true
  where  id = p_transaction;

  perform public.journaliser(
    'justificatif', 'pieces', p_piece::text,
    jsonb_build_object('resume',
      'Justificatif repris de Qonto — ' || coalesce(t.nom_justificatif, 'sans nom')));

  return jsonb_build_object('rattache', true, 'chemin', t.chemin_justificatif);
end;
$function$;

CREATE OR REPLACE FUNCTION public.recalculer_piece()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_piece uuid;
begin
  v_piece := coalesce(new.piece_id, old.piece_id);

  update public.pieces p
  set    montant_ht    = coalesce(t.ht, 0),
         montant_tva   = coalesce(t.tva, 0),
         montant_ttc   = coalesce(t.ttc, 0),
         tva_comptable = coalesce(t.tva, 0),
         taux_tva      = coalesce(t.taux, p.taux_tva),
         modifie_le    = now()
  from  (select round(sum(montant_ht), 2)  as ht,
                round(sum(montant_tva), 2) as tva,
                round(sum(montant_ttc), 2) as ttc,
                (select taux_tva from public.pieces_lignes
                 where piece_id = v_piece
                 group by taux_tva order by sum(montant_ht) desc limit 1) as taux
         from   public.pieces_lignes where piece_id = v_piece) t
  where p.id = v_piece;

  return coalesce(new, old);
end;
$function$;

CREATE OR REPLACE FUNCTION public.recalculer_reglements()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_piece uuid;
begin
  v_piece := coalesce(new.piece_id, old.piece_id);

  update public.pieces p
  set    montant_regle = coalesce(r.total, 0),
         -- `paye_le` est la date du versement qui solde la pièce. Tant
         -- qu'il reste un reliquat, elle demeure nulle : une facture
         -- partiellement encaissée n'est pas payée.
         paye_le = case
                     when coalesce(r.total, 0) >= p.montant_ttc - p.acomptes_deduits - 0.005
                     then r.derniere
                     else null
                   end,
         modifie_le = now()
  from  (select coalesce(sum(montant), 0) as total,
                max(date_reglement)       as derniere
         from   public.reglements
         where  piece_id = v_piece) r
  where p.id = v_piece;

  return coalesce(new, old);
end;
$function$;

CREATE OR REPLACE FUNCTION public.refuser_periode_declaree(p_periode text)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
begin
  raise exception
    'Période de TVA déjà déclarée (%) : cette opération changerait une déclaration figée. '
    'Si elle n''est pas encore déposée, annulez-la dans TVA → Déclarations puis refaites-la ; '
    'sinon, enregistrez la correction à une date de la période en cours.', p_periode;
end;
$function$;

CREATE OR REPLACE FUNCTION public.regle_pour_transaction(p_transaction uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t record; r record; a record; v_norm text;
begin
  select * into t from public.transactions_qonto where id = p_transaction;
  if not found then return null; end if;

  select * into r from public.regles_appariement
  where  actif
    and  (sens is null or sens = t.sens)
    and  upper(coalesce(t.libelle,'') || ' ' || coalesce(t.contrepartie,''))
         like '%' || upper(motif) || '%'
  order  by ordre, length(motif) desc
  limit  1;

  if found then
    return jsonb_build_object(
      'source', 'regle', 'regle_id', r.id, 'libelle', r.libelle,
      'tiers_id', r.tiers_id, 'categorie_id', r.categorie_id,
      'taux_tva', r.taux_tva, 'moyen_paiement', r.moyen_paiement,
      'jamais_automatique', r.jamais_automatique);
  end if;

  -- À défaut de règle, l'alias appris suffit souvent.
  v_norm := public.normaliser_tiers(coalesce(t.contrepartie, t.libelle));
  select * into a from public.alias_bancaires where libelle_normalise = v_norm;

  if found then
    return jsonb_build_object(
      'source', 'alias', 'tiers_id', a.tiers_id,
      'categorie_id', a.categorie_id, 'occurrences', a.occurrences);
  end if;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reglement_declare(p_piece uuid, p_date date)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.periode_tva_declaree(public.date_ecriture(p.nature, p_date))
  from   public.pieces p
  where  p.id = p_piece and p.etat = 'validee'
    and  p.regime_tva = 'france' and p.type_operation = 'service'
    and  (p.nature in ('vente','avoir') or abs(p.tva_comptable) > 0.005);
$function$;

CREATE OR REPLACE FUNCTION public.rejeter_piece(p_id uuid, p_motif text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p record;
begin
  select * into p from public.pieces where id = p_id;
  if not found then raise exception 'Pièce introuvable'; end if;

  if auth.uid() is not null
     and not public.a_permission(public.module_piece(p.nature), 'validate') then
    raise exception 'Permission insuffisante';
  end if;

  if p.etat <> 'a_valider' then
    raise exception 'Seule une saisie en attente peut être rejetée';
  end if;

  if trim(coalesce(p_motif,'')) = '' then
    raise exception 'Un motif est obligatoire : sans lui, l''auteur ne sait pas quoi corriger.';
  end if;

  update public.pieces
  set    etat = 'rejetee', motif_rejet = trim(p_motif), modifie_le = now()
  where  id = p_id;

  perform public.journaliser(
    'rejet', 'pieces', p_id::text,
    jsonb_build_object('resume', p.tiers_libelle || ' — saisie rejetée', 'motif', p_motif)
  );

  return jsonb_build_object('id', p_id, 'etat', 'rejetee');
end;
$function$;

CREATE OR REPLACE FUNCTION public.rejeter_rapprochement(p_depense uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_piece uuid; v_transaction uuid;
begin
  select id, transaction_id into v_piece, v_transaction
  from   public.pieces where id = p_depense;

  if v_piece is null then
    select id, transaction_id into v_piece, v_transaction
    from   public.pieces where source_table = 'depenses' and source_id = p_depense;
  end if;
  if v_piece is null then raise exception 'Écriture introuvable'; end if;

  if v_transaction is not null then
    return public.detacher_appariement(v_piece, v_transaction);
  end if;

  return jsonb_build_object('id', v_piece, 'rien_a_detacher', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.rembourser_associe(p_transaction uuid, p_associe text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t       record;
  v_solde numeric;
  v_tiers uuid;
  v_id    uuid;
  v_piece text;
begin
  if auth.uid() is not null and not public.a_permission('banque','update') then
    raise exception 'Permission insuffisante';
  end if;

  select * into t from public.transactions_qonto where id = p_transaction;
  if not found then raise exception 'Opération bancaire introuvable'; end if;
  if t.sens <> 'debit' then
    raise exception
      'Un remboursement à un associé est un DÉBIT : la société verse. '
      'Pour un crédit, il s''agit d''un apport en compte courant.';
  end if;
  if t.statut_traitement = 'rattachee' then
    raise exception 'Cette opération est déjà rattachée à une écriture';
  end if;

  select coalesce(sum(montant), 0) into v_solde
  from   public.v_compte_courant
  where  associe = lower(trim(p_associe));

  if v_solde <= 0.005 then
    raise exception
      'La société ne doit rien à % : rembourser au-delà du solde créerait '
      'une avance de la société à l''associé, qui obéit à d''autres règles.',
      public.nom_associe(p_associe);
  end if;

  if abs(t.montant) > v_solde + 0.005 then
    raise exception
      'Le versement de % € dépasse le solde dû de % €. Au-delà, ce n''est '
      'plus un remboursement.',
      to_char(abs(t.montant), 'FM999990D00'), to_char(v_solde, 'FM999990D00');
  end if;

  v_tiers := public.trouver_ou_creer_tiers(
    public.nom_associe(p_associe), false, false);

  insert into public.pieces (
    nature, sens, origine, date_piece,
    tiers_id, tiers_libelle, objet, compte,
    montant_ht, taux_tva, montant_tva, montant_ttc,
    tva_comptable, type_operation, regime_tva,
    etat, moyen_paiement, paye_par, attendu_en_banque,
    transaction_id, notes, cree_par, valide_par, valide_le
  ) values (
    'banque', 'debit', 'banque', t.date_operation,
    v_tiers, public.nom_associe(p_associe),
    'Remboursement de compte courant', '4551',
    abs(t.montant), 0, 0, abs(t.montant),
    0, 'service', 'hors_champ',
    'validee', 'virement', lower(trim(p_associe)), true,
    p_transaction,
    coalesce(p_notes,
      'Extinction partielle ou totale du compte courant. '
      'Aucune incidence sur le résultat : seule la trésorerie bouge.'),
    auth.uid(), auth.uid(), now()
  )
  returning id into v_id;

  v_piece := public.numeroter_piece(v_id);

  update public.transactions_qonto
  set    statut_traitement = 'rattachee', rattachement_auto = false,
         rattache_le = now(), rattache_par = auth.uid()
  where  id = p_transaction;

  insert into public.reglements (piece_id, date_reglement, montant,
                                 moyen, transaction_id, cree_par)
  values (v_id, t.date_operation, abs(t.montant), 'virement',
          p_transaction, auth.uid());

  perform public.journaliser(
    'creation', 'pieces', v_id::text,
    jsonb_build_object(
      'resume', v_piece || ' · remboursement à ' || public.nom_associe(p_associe)
                || ' — ' || to_char(abs(t.montant), 'FM999990D00') || ' €',
      'champs', jsonb_build_object(
        'solde_avant', v_solde,
        'solde_apres', v_solde - abs(t.montant))));

  return jsonb_build_object(
    'id', v_id, 'numero_piece', v_piece,
    'montant', abs(t.montant),
    'solde_avant', v_solde,
    'solde_apres', round(v_solde - abs(t.montant), 2));
end;
$function$;

CREATE OR REPLACE FUNCTION public.reprendre_regle_justificatif(p_piece uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p record;
begin
  if auth.uid() is not null and not public.a_permission('depenses','update') then
    raise exception 'Permission insuffisante';
  end if;

  select * into p from public.pieces where id = p_piece;
  if not found then raise exception 'Écriture introuvable'; end if;

  update public.pieces
  set    justificatif_exige = null, motif_exemption = null
  where  id = p_piece;

  perform public.journaliser(
    'modification', 'pieces', p_piece::text,
    jsonb_build_object(
      'resume', coalesce(p.numero_piece, '')
                || ' · retour à la règle de la catégorie'));

  return jsonb_build_object('id', p_piece, 'exige', null);
end;
$function$;

CREATE OR REPLACE FUNCTION public.reprendre_reglements()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_creation integer := 0; v_achats integer := 0; v_ventes integer := 0;
begin
  if auth.uid() is not null and not public.a_permission('entreprise','update') then
    raise exception 'Permission insuffisante';
  end if;

  -- Frais de création : avancés par un associé le jour de l'engagement.
  insert into public.reglements (piece_id, date_reglement, montant, moyen, cree_par)
  select p.id, p.date_piece, p.montant_ttc, 'avance_associe', p.cree_par
  from   public.pieces p
  where  p.nature = 'creation'
    and  not exists (select 1 from public.reglements r where r.piece_id = p.id);
  get diagnostics v_creation = row_count;

  -- Achats déjà payés.
  insert into public.reglements (piece_id, date_reglement, montant, moyen,
                                 transaction_id, cree_par)
  select p.id, p.paye_le, p.montant_ttc,
         coalesce(p.moyen_paiement,'autre'), p.transaction_id, p.cree_par
  from   public.pieces p
  where  p.nature = 'achat' and p.paye_le is not null
    and  not exists (select 1 from public.reglements r where r.piece_id = p.id);
  get diagnostics v_achats = row_count;

  -- Ventes déjà encaissées.
  insert into public.reglements (piece_id, date_reglement, montant, moyen,
                                 transaction_id, cree_par)
  select p.id, p.paye_le, p.montant_regle,
         coalesce(p.moyen_paiement,'virement'), p.transaction_id, p.cree_par
  from   public.pieces p
  where  p.nature in ('vente','avoir') and p.paye_le is not null and p.montant_regle > 0
    and  not exists (select 1 from public.reglements r where r.piece_id = p.id);
  get diagnostics v_ventes = row_count;

  return jsonb_build_object('frais_creation', v_creation,
                            'achats', v_achats, 'ventes', v_ventes);
end;
$function$;

CREATE OR REPLACE FUNCTION public.rerouter_justificatif()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- L'identifiant transmis désigne-t-il une pièce ? Alors c'est là qu'il
  -- va, et non dans l'ancienne colonne.
  if new.piece_id is null and new.depense_id is not null then
    if exists (select 1 from public.pieces where id = new.depense_id) then
      new.piece_id := new.depense_id;
      new.depense_id := null;
    else
      -- Sinon c'est bien une dépense de l'ancienne table : on retrouve
      -- sa pièce miroir.
      select id into new.piece_id from public.pieces
      where  source_table = 'depenses' and source_id = new.depense_id;
    end if;
  end if;

  if new.piece_id is null and new.frais_creation_id is not null then
    select id into new.piece_id from public.pieces
    where  source_table = 'frais_creation' and source_id = new.frais_creation_id;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.resilier_abonnement(p_id uuid, p_date_effet date, p_motif text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n integer;
begin
  if not public.a_permission('abonnements','update') then
    raise exception 'Permission insuffisante';
  end if;

  update public.abonnements
  set    statut = 'resilie',
         date_fin = p_date_effet,
         motif_resiliation = p_motif,
         modifie_le = now()
  where  id = p_id;

  delete from public.abonnement_echeances
  where  abonnement_id = p_id
    and  statut = 'attendue'
    and  date_prevue > p_date_effet;
  get diagnostics v_n = row_count;

  return v_n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.resultat_comptable(p_debut date, p_fin date)
 RETURNS TABLE(produits numeric, charges numeric, impot numeric, amendes numeric, tvs numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(sum(credit - debit) filter (where left(compte_num, 1) = '7'), 0),
         coalesce(sum(debit - credit) filter (where left(compte_num, 1) = '6'
                                              and compte_num not like '695%'), 0),
         coalesce(sum(debit - credit) filter (where compte_num like '695%'), 0),
         coalesce(sum(debit - credit) filter (where compte_num like '6712%'), 0),
         coalesce(sum(debit - credit) filter (where compte_num like '63512%'), 0)
  from   public.lignes_fec(p_debut, p_fin);
$function$;

CREATE OR REPLACE FUNCTION public.resultat_fiscal(p_exercice uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.retirer_justificatif(p_justificatif uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare j record; p record;
begin
  select * into j from public.justificatifs where id = p_justificatif;
  if not found then raise exception 'Justificatif introuvable'; end if;

  select * into p from public.pieces where id = j.piece_id;

  if auth.uid() is not null
     and not public.a_permission(coalesce(public.module_piece(p.nature),'depenses'), 'update') then
    raise exception 'Permission insuffisante';
  end if;

  -- Une écriture validée sans justificatif est une anomalie que le
  -- contrôle de complétude signalera. On prévient plutôt que d'interdire :
  -- il arrive qu'un fichier soit à remplacer.
  delete from public.justificatifs where id = p_justificatif;

  perform public.journaliser(
    'justificatif', 'pieces', j.piece_id::text,
    jsonb_build_object('resume',
      coalesce(p.numero_piece, '(brouillon)') || ' · justificatif retiré — '
      || j.nom_original,
      'ecriture_validee', (p.etat = 'validee')));

  return jsonb_build_object('supprime', true, 'piece_id', j.piece_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.retirer_justificatif(p_id uuid, p_motif text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  j       record;
  p       record;
  v_reste integer;
begin
  if auth.uid() is not null and not public.a_permission('depenses','update') then
    raise exception 'Permission insuffisante';
  end if;
  if trim(coalesce(p_motif, '')) = '' then
    raise exception
      'Le motif est obligatoire : un justificatif retiré sans raison '
      'écrite est une charge que plus rien ne défend.';
  end if;

  select * into j from public.justificatifs where id = p_id;
  if not found then raise exception 'Justificatif introuvable'; end if;

  select * into p from public.pieces where id = j.piece_id;

  -- Une période déclarée ne se retouche pas : la TVA déduite reposait
  -- sur cette pièce.
  if p.id is not null and exists (
    select 1 from public.declarations_tva d
    where d.etat = 'deposee'
      and public.date_ecriture(p.nature, p.date_piece)
          between d.periode_debut and d.periode_fin)
  then
    raise exception
      'Cette écriture relève d''une déclaration de TVA déjà déposée. '
      'Retirer son justificatif rendrait la déclaration indéfendable.';
  end if;

  delete from public.justificatifs where id = p_id;

  select count(*) into v_reste
  from   public.justificatifs where piece_id = j.piece_id;

  perform public.journaliser(
    'suppression', 'justificatifs', p_id::text,
    jsonb_build_object(
      'resume', coalesce(p.numero_piece, '') || ' · justificatif retiré — '
                || j.nom_original,
      'motif', trim(p_motif),
      'champs', jsonb_build_object(
        'chemin', j.chemin,
        'restants', v_reste)));

  return jsonb_build_object(
    'retire', true,
    'chemin', j.chemin,
    'restants', v_reste,
    -- Le fichier lui-même est supprimé par l'application : la base ne
    -- parle pas au stockage.
    'piece_id', j.piece_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.retirer_ligne(p_ligne uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare l record; p record;
begin
  select * into l from public.pieces_lignes where id = p_ligne;
  if not found then raise exception 'Ligne introuvable'; end if;

  select * into p from public.pieces where id = l.piece_id;

  if auth.uid() is not null
     and not public.a_permission(public.module_piece(p.nature), 'update') then
    raise exception 'Permission insuffisante';
  end if;
  if p.etat <> 'brouillon' then
    raise exception 'Un document émis ne se modifie plus';
  end if;

  delete from public.pieces_lignes where id = p_ligne;
  return jsonb_build_object('supprime', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.role_courant()
 RETURNS role_utilisateur
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role from public.profils where id = auth.uid() and actif = true;
$function$;

CREATE OR REPLACE FUNCTION public.rouvrir_exercice(p_exercice uuid, p_motif text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.sauter_echeance(p_echeance uuid, p_motif text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e record;
begin
  if auth.uid() is not null and not public.a_permission('ventes','update') then
    raise exception 'Droits insuffisants';
  end if;
  if trim(coalesce(p_motif,'')) = '' then
    raise exception 'Un motif est nécessaire : une période sautée sans '
                    'explication ressemble à un oubli.';
  end if;

  select * into e from public.contrat_echeances where id = p_echeance;
  if not found then raise exception 'Échéance introuvable'; end if;
  if e.statut = 'facturee' then
    raise exception 'Cette échéance a déjà produit une facture';
  end if;

  update public.contrat_echeances
  set statut = 'sautee', motif = trim(p_motif) where id = p_echeance;

  return jsonb_build_object('id', p_echeance, 'statut', 'sautee');
end;
$function$;

CREATE OR REPLACE FUNCTION public.schema_public()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'genere_le', now(),
    'version_postgres', current_setting('server_version'),

    'fonctions', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'nom',        p.proname,
               'signature',  p.oid::regprocedure::text,
               'definition', pg_get_functiondef(p.oid))
             order by p.proname, p.oid::regprocedure::text), '[]'::jsonb)
      from   pg_proc p
      join   pg_namespace n on n.oid = p.pronamespace
      where  n.nspname = 'public' and p.prokind in ('f','p')),

    'vues', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'nom',        c.relname,
               'definition', pg_get_viewdef(c.oid, true))
             order by c.relname), '[]'::jsonb)
      from   pg_class c
      join   pg_namespace n on n.oid = c.relnamespace
      where  n.nspname = 'public' and c.relkind in ('v','m')),

    'tables', (
      select coalesce(jsonb_object_agg(t.table_name, t.colonnes), '{}'::jsonb)
      from (
        select c.table_name,
               jsonb_agg(jsonb_build_object(
                 'colonne',  c.column_name,
                 'type',     c.data_type,
                 'nullable', c.is_nullable = 'YES',
                 'defaut',   c.column_default)
               order by c.ordinal_position) as colonnes
        from   information_schema.columns c
        where  c.table_schema = 'public'
        group  by c.table_name) t),

    'contraintes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'table',      rel.relname,
               'nom',        c.conname,
               'definition', pg_get_constraintdef(c.oid))
             order by rel.relname, c.conname), '[]'::jsonb)
      from   pg_constraint c
      join   pg_class     rel on rel.oid = c.conrelid
      join   pg_namespace n   on n.oid = rel.relnamespace
      where  n.nspname = 'public'),

    'index', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'table',      i.tablename,
               'nom',        i.indexname,
               'definition', i.indexdef)
             order by i.tablename, i.indexname), '[]'::jsonb)
      from   pg_indexes i
      where  i.schemaname = 'public'),

    'politiques', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'table',      pol.tablename,
               'nom',        pol.policyname,
               'commande',   pol.cmd,
               'roles',      pol.roles,
               'condition',  pol.qual,
               'verification', pol.with_check)
             order by pol.tablename, pol.policyname), '[]'::jsonb)
      from   pg_policies pol
      where  pol.schemaname = 'public')
  );
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

CREATE OR REPLACE FUNCTION public.signe_tva(p_nature text, p_sens text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    -- Un achat au crédit est un avoir fournisseur : il DIMINUE la TVA
    -- déductible.
    when p_nature in ('achat','creation','km') and p_sens = 'credit' then -1
    -- Un avoir de vente diminue la TVA collectée.
    when p_nature = 'avoir' then -1
    else 1
  end;
$function$;

CREATE OR REPLACE FUNCTION public.similarite_tiers(p_libelle text, p_nom text)
 RETURNS real
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lib  text := public.normaliser_tiers(p_libelle);
  v_nom  text := public.normaliser_tiers(p_nom);
  v_max  real := 0;
begin
  if v_lib = '' or v_nom = '' then return 0; end if;

  -- Contenance : « KARCHER CHAMBERY » contient « KARCHER ». Aucune
  -- interprétation nécessaire.
  --
  -- La longueur minimale évite qu'un tiers nommé « AB » ne se retrouve
  -- dans la moitié des libellés de la banque.
  if length(replace(v_nom, ' ', '')) >= 4
     and replace(v_lib, ' ', '') like '%' || replace(v_nom, ' ', '') || '%' then
    return 1.0;
  end if;

  -- À défaut, le mot du libellé qui ressemble le plus au nom recherché.
  select coalesce(max(similarity(mot, v_nom)), 0) into v_max
  from   regexp_split_to_table(v_lib, ' ') as mot
  where  length(mot) >= 3;

  -- Et la chaîne entière, pour un tiers dont le nom compte plusieurs
  -- mots — « JL PERF » n'est le mot d'aucun libellé.
  return greatest(v_max, similarity(v_lib, v_nom));
end;
$function$;

CREATE OR REPLACE FUNCTION public.solde_compte_courant()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(x order by (x->>'solde')::numeric desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'associe',     associe,
      'nom',         public.nom_associe(associe),
      'avance',      sum(case when sens_courant = 'du' then montant else 0 end),
      'rembourse',   -sum(case when sens_courant = 'rembourse' then montant else 0 end),
      'solde',       sum(montant),
      'lignes',      count(*)
    ) as x
    from   public.v_compte_courant
    group  by associe
  ) s;
$function$;

CREATE OR REPLACE FUNCTION public.solde_controle()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'transactions_total',   (select count(*) from public.transactions_qonto),
    'a_traiter',            (select count(*) from public.transactions_qonto
                             where statut_traitement = 'a_traiter'),
    'rattachees',           (select count(*) from public.transactions_qonto
                             where statut_traitement = 'rattachee'),
    'ecartees',             (select count(*) from public.transactions_qonto
                             where statut_traitement = 'ecartee'),
    'debits_sans_ecriture', (select count(*) from public.transactions_qonto
                             where sens = 'debit'
                               and statut_traitement = 'a_traiter'
                               and statut_qonto = 'completed'),
    'montant_non_traite',   (select coalesce(sum(abs(montant)), 0)
                             from public.transactions_qonto
                             where statut_traitement = 'a_traiter'
                               and sens = 'debit'
                               and statut_qonto = 'completed'),
    -- Une écriture qui attend son opération bancaire.
    'depenses_sans_paiement', (select count(*) from public.v_pieces_completes
                               where banque_manquante),
    -- Une écriture pour laquelle aucune opération n'est attendue :
    -- payée par un associé, indemnité kilométrique, amortissement.
    'depenses_sans_objet',  (select count(*) from public.pieces
                             where etat = 'validee' and not attendu_en_banque),
    'derniere_synchro',     (select max(synchronise_le) from public.transactions_qonto)
  );
$function$;

CREATE OR REPLACE FUNCTION public.solde_reconstitue()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'solde', coalesce(sum(
      case when sens = 'credit' then montant else -montant end
    ), 0),
    'nb_operations', count(*)
  )
  from public.transactions_qonto
  where statut_qonto = 'completed';
$function$;

CREATE OR REPLACE FUNCTION public.soldes_a_nouveau(p_debut date)
 RETURNS TABLE(compte_num text, compte_lib text, comp_aux_num text, comp_aux_lib text, solde numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.statistiques_donnees()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'depenses', jsonb_build_object(
      'total',      (select count(*) from public.pieces
                     where nature in ('achat','creation') and etat <> 'annulee'),
      'en_attente', (select count(*) from public.pieces
                     where nature in ('achat','creation') and etat = 'a_valider'),
      'validees',   (select count(*) from public.pieces
                     where nature in ('achat','creation') and etat = 'validee'),
      'annulees',   (select count(*) from public.pieces
                     where nature in ('achat','creation') and etat = 'annulee'),
      'extraites',  (select count(*) from public.pieces
                     where nature in ('achat','creation') and extrait_par_ia),
      'montant_ht', (select coalesce(sum(montant_ht),0) from public.pieces
                     where nature in ('achat','creation') and etat = 'validee'),
      'tva',        (select coalesce(sum(tva_comptable),0) from public.pieces
                     where nature in ('achat','creation') and etat = 'validee')
    ),
    'frais_creation', jsonb_build_object(
      'total',      (select count(*) from public.pieces where nature = 'creation'),
      'a_ratifier', (select count(*) from public.pieces
                     where nature = 'creation' and etat = 'a_valider'),
      'repris',     (select count(*) from public.pieces
                     where nature = 'creation' and etat = 'validee'),
      'montant_ttc',(select coalesce(sum(montant_ttc),0) from public.pieces
                     where nature = 'creation' and etat <> 'annulee')
    ),
    'deplacements', jsonb_build_object(
      'total',      (select count(*) from public.deplacements where statut <> 'annulee'),
      'en_attente', (select count(*) from public.deplacements where statut = 'en_attente'),
      'km_annee',   (select coalesce(sum(case when aller_retour then kilometres*2 else kilometres end),0)
                     from public.deplacements
                     where statut = 'validee'
                       and extract(year from date_trajet) = extract(year from current_date))
    ),
    'abonnements', jsonb_build_object(
      'actifs',       (select actifs from public.v_couts_abonnements),
      'gratuits',     (select gratuits from public.v_couts_abonnements),
      'cout_mensuel', (select cout_mensuel_ttc from public.v_couts_abonnements),
      'cout_annuel',  (select cout_annuel_ttc from public.v_couts_abonnements),
      'justificatifs_manquants',
        (select count(*) from public.abonnement_echeances where statut = 'justificatif_manquant')
    ),
    'contrats', public.etat_contrats(),
    'banque', public.solde_controle(),
    'ia', public.usage_ia_du_mois(),
    'ia_annuel', public.usage_ia_annuel(),
    'justificatifs', jsonb_build_object(
      'nombre',        (select count(*) from public.justificatifs),
      'octets',        (select coalesce(sum(taille_octets),0) from public.justificatifs),
      'octets_origine',(select coalesce(sum(coalesce(taille_origine, taille_octets)),0) from public.justificatifs)
    ),
    'referentiel', jsonb_build_object(
      'categories',   (select count(*) from public.categories where actif),
      'vehicules',    (select count(*) from public.vehicules where actif),
      'utilisateurs', (select count(*) from public.profils where actif)
    ),
    'audit', jsonb_build_object(
      'entrees', (select count(*) from public.audit)
    ),
    'suivi', jsonb_build_object(
      'commentaires_ouverts', (select count(*) from public.commentaires where statut = 'ouvert'),
      'taches_actives',       (select count(*) from public.taches where statut in ('a_faire','en_cours'))
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.suivi_tva()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e record;
  v_mois  jsonb;
begin
  select date_debut, date_fin, regime_tva, statut into e
  from   public.exercices
  where  current_date between date_debut and date_fin
  limit  1;

  if not found then
    select date_debut, date_fin, regime_tva, statut into e
    from   public.exercices order by date_debut desc limit 1;
  end if;

  if not found then
    raise exception 'Aucun exercice déclaré. Réglages → Entreprise.';
  end if;

  -- Le solde mois par mois, depuis l'ouverture de l'exercice.
  select coalesce(jsonb_agg(x order by x->>'mois'), '[]'::jsonb)
  into   v_mois
  from (
    select jsonb_build_object(
      'mois',       to_char(date_trunc('month', date_exigibilite), 'YYYY-MM'),
      'collectee',  sum(case when sens = 'credit' then tva else 0 end),
      'deductible', sum(case when sens = 'debit'  then tva else 0 end),
      'solde',      sum(case when sens = 'credit' then tva else -tva end)
    ) as x
    from   public.v_tva_exigible
    where  date_exigibilite >= e.date_debut
    group  by date_trunc('month', date_exigibilite)
  ) s;

  return jsonb_build_object(
    'exercice_debut', e.date_debut,
    'exercice_fin',   e.date_fin,
    -- Le régime est porté par l'exercice, pas déduit d'une date : le
    -- premier est au réel simplifié — une CA12E annuelle — et la bascule
    -- au réel normal, avec CA3 mensuelle, se déclare.
    'regime', e.regime_tva,
    'exercice_clos', (e.statut = 'clos'),
    'exercice', public.declaration_tva(e.date_debut, e.date_fin),
    'par_mois', v_mois
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.supprimer_brouillon(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p record;
begin
  select * into p from public.pieces where id = p_id;
  if not found then raise exception 'Pièce introuvable'; end if;

  if auth.uid() is not null
     and not public.a_permission(public.module_piece(p.nature), 'delete') then
    raise exception 'Permission insuffisante';
  end if;

  if p.etat <> 'brouillon' or p.numero_piece is not null then
    raise exception
      'Seul un brouillon jamais numéroté peut être supprimé. Utilisez l''annulation.';
  end if;

  delete from public.pieces where id = p_id;

  perform public.journaliser(
    'suppression', 'pieces', p_id::text,
    jsonb_build_object('resume', 'Brouillon supprimé · ' || p.tiers_libelle)
  );

  return jsonb_build_object('id', p_id, 'supprime', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.synchroniser_tiers_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.tiers (
    reference, nom, type, est_client, contact, email, telephone,
    adresse, code_postal, ville, pays, siret, tva_intracom,
    delai_paiement, notes, actif, source_table, source_id, modifie_le
  ) values (
    new.numero_piece, new.nom, new.type, true, new.contact, new.email, new.telephone,
    new.adresse, new.code_postal, new.ville, new.pays, new.siret, new.tva_intracom,
    new.delai_paiement, new.notes, new.actif, 'clients', new.id, now()
  )
  -- CORRECTIF MIGRATION 107 : on retrouve la fiche par l'identité du
  -- client d'origine, plus jamais par son nom — un renommage doit
  -- mettre à jour, jamais dupliquer.
  on conflict (source_table, source_id) where source_id is not null do update set
    reference = excluded.reference,
    nom = excluded.nom,
    est_client = true,
    type = excluded.type,
    contact = excluded.contact, email = excluded.email,
    telephone = excluded.telephone, adresse = excluded.adresse,
    code_postal = excluded.code_postal, ville = excluded.ville,
    pays = excluded.pays, siret = excluded.siret,
    tva_intracom = excluded.tva_intracom,
    delai_paiement = excluded.delai_paiement,
    notes = excluded.notes, actif = excluded.actif,
    modifie_le = now();

  return new;
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

CREATE OR REPLACE FUNCTION public.tables_publiques()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.relname::text
  from   pg_class c
  join   pg_namespace n on n.oid = c.relnamespace
  where  n.nspname = 'public'
    and  c.relkind = 'r'
    and  c.relname not like 'pg_%'
  order  by c.relname;
$function$;

CREATE OR REPLACE FUNCTION public.taille_base()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select pg_database_size(current_database());
$function$;

CREATE OR REPLACE FUNCTION public.tester_regle(p_motif text, p_sens text DEFAULT NULL::text)
 RETURNS TABLE(numero_piece text, date_operation date, libelle text, montant numeric, sens text, deja_traitee boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select t.numero_piece, t.date_operation,
         coalesce(nullif(trim(t.contrepartie),''), t.libelle),
         abs(t.montant), t.sens,
         t.statut_traitement <> 'a_traiter'
  from   public.transactions_qonto t
  where  trim(coalesce(p_motif,'')) <> ''
    and  (p_sens is null or t.sens = p_sens)
    and  upper(coalesce(t.libelle,'') || ' ' || coalesce(t.contrepartie,''))
         like '%' || upper(trim(p_motif)) || '%'
  order  by t.date_operation desc
  limit  25;
$function$;

CREATE OR REPLACE FUNCTION public.trouver_ou_creer_tiers(p_nom text, p_fournisseur boolean DEFAULT false, p_client boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_nom text;
begin
  v_nom := trim(coalesce(p_nom, ''));
  if v_nom = '' then raise exception 'Le nom du tiers est obligatoire'; end if;

  select id into v_id from public.tiers where lower(nom) = lower(v_nom);

  if found then
    update public.tiers
    set    est_fournisseur = est_fournisseur or p_fournisseur,
           est_client      = est_client or p_client,
           modifie_le      = now()
    where  id = v_id;
    return v_id;
  end if;

  insert into public.tiers (nom, type, est_fournisseur, est_client, cree_par)
  values (v_nom, 'professionnel', p_fournisseur, p_client, auth.uid())
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.usage_ia_annuel()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'extractions', count(*),
    'cout',        coalesce(sum(cout_estime), 0),
    'cout_moyen',  case when count(*) > 0
                     then round(coalesce(sum(cout_estime),0) / count(*), 6)
                     else 0 end,
    'confiance_moyenne', round(coalesce(avg(confiance), 0), 2)
  )
  from public.usage_ia
  where horodatage >= date_trunc('year', current_date);
$function$;

CREATE OR REPLACE FUNCTION public.usage_ia_du_mois()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'plafond',      100,
    'extractions',  count(*),
    'reussies',     count(*) filter (where succes),
    'echouees',     count(*) filter (where not succes),
    'cout',         coalesce(sum(cout_estime), 0),
    'tokens_entree',coalesce(sum(tokens_entree), 0),
    'tokens_sortie',coalesce(sum(tokens_sortie), 0),
    'reste',        greatest(0, 100 - count(*)),
    'pourcentage',  round((count(*)::numeric / 100) * 100, 1)
  )
  from public.usage_ia
  where horodatage >= date_trunc('month', current_date);
$function$;

CREATE OR REPLACE FUNCTION public.valider_piece(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p record; v_piece text;
begin
  select * into p from public.pieces where id = p_id;
  if not found then raise exception 'Pièce introuvable'; end if;

  if auth.uid() is not null
     and not public.a_permission(public.module_piece(p.nature), 'validate') then
    raise exception 'Permission insuffisante pour valider cette pièce';
  end if;

  if p.etat not in ('brouillon','a_valider','rejetee') then
    raise exception 'Une pièce % ne peut pas être validée', p.etat;
  end if;

  if p.montant_ttc <= 0 then
    raise exception 'Montant nul : rien à comptabiliser.';
  end if;

  v_piece := public.numeroter_piece(p_id);

  update public.pieces
  set    etat = 'validee',
         valide_par = auth.uid(), valide_le = now(),
         motif_rejet = null,
         modifie_le = now()
  where  id = p_id;

  perform public.journaliser(
    'validation', 'pieces', p_id::text,
    jsonb_build_object(
      'resume', v_piece || ' · ' || p.tiers_libelle || ' — '
                || to_char(p.montant_ttc, 'FM999999D00') || ' € TTC',
      'nature', p.nature
    )
  );

  return jsonb_build_object('id', p_id, 'numero_piece', v_piece, 'etat', 'validee');
end;
$function$;

CREATE OR REPLACE FUNCTION public.verifier_payeur()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.paye_par is null or trim(new.paye_par) = '' then
    return new;
  end if;

  new.paye_par := lower(trim(new.paye_par));

  if new.paye_par = 'societe' then return new; end if;

  if not exists (select 1 from public.associes
                 where identifiant = new.paye_par) then
    raise exception
      '« % » n''est pas un associé connu. Les payeurs possibles sont : %.',
      new.paye_par,
      (select string_agg(valeur, ', ' order by valeur)
       from public.payeurs_possibles());
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.verrou_exercice_pieces()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.verrou_exercice_reglements()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.verrou_tva_pieces()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.verrou_tva_reglements()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

-- ---------- Vues ----------
create or replace view public.v_audit_comptable with (security_invoker=on) as
SELECT id,
    email,
    action,
    table_cible,
    id_cible,
    details,
    horodatage
   FROM audit
  WHERE (action <> ALL (ARRAY['connexion'::text, 'deconnexion'::text])) AND (table_cible IS NULL OR (table_cible <> ALL (ARRAY['profils'::text, 'permissions'::text, 'sauvegardes'::text])));

create or replace view public.v_deplacements_actifs with (security_invoker=on) as
SELECT id,
    date_trajet,
    vehicule_id,
    depart,
    arrivee,
    motif,
    kilometres,
    aller_retour,
    statut,
    cree_par,
    cree_le,
    valide_par,
    valide_le,
    motif_rejet,
    numero_piece,
    revu_le,
    revu_par,
    annule_le,
    annule_par,
    motif_annulation
   FROM deplacements
  WHERE statut <> 'annulee'::text;

create or replace view public.v_couts_abonnements with (security_invoker=on) as
SELECT count(*) FILTER (WHERE statut = 'actif'::text) AS actifs,
    count(*) FILTER (WHERE statut = 'gratuit'::text) AS gratuits,
    count(*) FILTER (WHERE statut = 'resilie'::text) AS resilies,
    COALESCE(sum(
        CASE periodicite
            WHEN 'mensuel'::text THEN montant_ttc
            WHEN 'trimestriel'::text THEN montant_ttc / 3::numeric
            ELSE montant_ttc / 12::numeric
        END) FILTER (WHERE statut = 'actif'::text), 0::numeric) AS cout_mensuel_ttc,
    COALESCE(sum(
        CASE periodicite
            WHEN 'mensuel'::text THEN montant_ttc * 12::numeric
            WHEN 'trimestriel'::text THEN montant_ttc * 4::numeric
            ELSE montant_ttc
        END) FILTER (WHERE statut = 'actif'::text), 0::numeric) AS cout_annuel_ttc,
    COALESCE(sum(
        CASE periodicite
            WHEN 'mensuel'::text THEN montant_tva * 12::numeric
            WHEN 'trimestriel'::text THEN montant_tva * 4::numeric
            ELSE montant_tva
        END) FILTER (WHERE statut = 'actif'::text), 0::numeric) AS tva_annuelle
   FROM abonnements;

create or replace view public.v_justificatifs_qonto with (security_invoker=on) as
SELECT id,
    numero_piece,
    date_operation,
    libelle,
    contrepartie,
    montant,
    nom_justificatif,
    justificatif_recupere,
    justificatif_traite,
    erreur_traitement,
    statut_traitement
   FROM transactions_qonto t
  WHERE a_justificatif AND justificatif_recupere AND NOT justificatif_traite AND statut_qonto = 'completed'::text;

create or replace view public.v_tva_exigible with (security_invoker=on) as
SELECT p.id AS piece_id,
    p.numero_piece,
    p.nature,
        CASE
            WHEN p.nature = ANY (ARRAY['vente'::text, 'avoir'::text]) THEN 'credit'::text
            ELSE 'debit'::text
        END AS sens,
    p.tiers_libelle,
        CASE
            WHEN p.nature = 'creation'::text THEN GREATEST(r.date_reglement, ( SELECT min(exercices.date_debut) AS min
               FROM exercices))
            ELSE r.date_reglement
        END AS date_exigibilite,
    (r.montant * signe_tva(p.nature, p.sens)::numeric)::numeric(12,2) AS base_ttc,
    round(abs(p.tva_comptable) * r.montant / NULLIF(p.montant_ttc, 0::numeric), 2) * signe_tva(p.nature, p.sens)::numeric AS tva,
    'reglement'::text AS fait_generateur,
    p.regime_tva
   FROM reglements r
     JOIN pieces p ON p.id = r.piece_id
  WHERE p.etat = 'validee'::text AND p.type_operation = 'service'::text AND p.regime_tva = 'france'::text
UNION ALL
 SELECT p.id AS piece_id,
    p.numero_piece,
    p.nature,
        CASE
            WHEN p.nature = ANY (ARRAY['vente'::text, 'avoir'::text]) THEN 'credit'::text
            ELSE 'debit'::text
        END AS sens,
    p.tiers_libelle,
        CASE
            WHEN p.nature = 'creation'::text THEN GREATEST(p.date_piece, ( SELECT min(exercices.date_debut) AS min
               FROM exercices))
            ELSE p.date_piece
        END AS date_exigibilite,
    (p.montant_ttc * signe_tva(p.nature, p.sens)::numeric)::numeric(12,2) AS base_ttc,
    abs(p.tva_comptable) * signe_tva(p.nature, p.sens)::numeric AS tva,
    'date_piece'::text AS fait_generateur,
    p.regime_tva
   FROM pieces p
  WHERE p.etat = 'validee'::text AND p.type_operation = 'bien'::text AND p.regime_tva = 'france'::text
UNION ALL
 SELECT p.id AS piece_id,
    p.numero_piece,
    p.nature,
    'credit'::text AS sens,
    p.tiers_libelle,
        CASE
            WHEN p.nature = 'creation'::text THEN GREATEST(p.date_piece, ( SELECT min(exercices.date_debut) AS min
               FROM exercices))
            ELSE p.date_piece
        END AS date_exigibilite,
    p.montant_ht AS base_ttc,
    p.tva_autoliquidee AS tva,
    'autoliquidation_collectee'::text AS fait_generateur,
    p.regime_tva
   FROM pieces p
  WHERE p.etat = 'validee'::text AND p.regime_tva = 'autoliquidation'::text AND p.tva_autoliquidee > 0::numeric
UNION ALL
 SELECT p.id AS piece_id,
    p.numero_piece,
    p.nature,
    'debit'::text AS sens,
    p.tiers_libelle,
        CASE
            WHEN p.nature = 'creation'::text THEN GREATEST(p.date_piece, ( SELECT min(exercices.date_debut) AS min
               FROM exercices))
            ELSE p.date_piece
        END AS date_exigibilite,
    p.montant_ht AS base_ttc,
    p.tva_autoliquidee AS tva,
    'autoliquidation_deduite'::text AS fait_generateur,
    p.regime_tva
   FROM pieces p
  WHERE p.etat = 'validee'::text AND p.regime_tva = 'autoliquidation'::text AND p.tva_autoliquidee > 0::numeric;

create or replace view public.v_compte_courant with (security_invoker=on) as
SELECT COALESCE(NULLIF(TRIM(BOTH FROM p.paye_par), ''::text), 'associe'::text) AS associe,
    p.id,
    p.numero_piece,
    date_ecriture(p.nature, p.date_piece) AS date_ecriture,
    p.date_piece,
    p.tiers_libelle,
    p.objet,
    p.nature,
    'du'::text AS sens_courant,
    p.montant_ttc AS montant,
        CASE p.nature
            WHEN 'km'::text THEN 'Indemnités kilométriques'::text
            WHEN 'creation'::text THEN 'Frais de création avancé'::text
            ELSE 'Dépense avancée'::text
        END AS motif
   FROM pieces p
  WHERE p.etat = 'validee'::text AND p.moyen_paiement = 'avance_associe'::text AND p.sens = 'debit'::text
UNION ALL
 SELECT COALESCE(NULLIF(TRIM(BOTH FROM p.paye_par), ''::text), 'associe'::text) AS associe,
    p.id,
    p.numero_piece,
    date_ecriture(p.nature, p.date_piece) AS date_ecriture,
    p.date_piece,
    p.tiers_libelle,
    p.objet,
    p.nature,
    'rembourse'::text AS sens_courant,
    - p.montant_ttc AS montant,
    'Remboursement à l''associé'::text AS motif
   FROM pieces p
  WHERE p.etat = 'validee'::text AND p.nature = 'banque'::text AND p.compte = '4551'::text AND p.sens = 'debit'::text
UNION ALL
 SELECT COALESCE(NULLIF(TRIM(BOTH FROM p.paye_par), ''::text), 'associe'::text) AS associe,
    p.id,
    p.numero_piece,
    date_ecriture(p.nature, p.date_piece) AS date_ecriture,
    p.date_piece,
    p.tiers_libelle,
    p.objet,
    p.nature,
    'du'::text AS sens_courant,
    p.montant_ttc AS montant,
    'Apport en compte courant'::text AS motif
   FROM pieces p
  WHERE p.etat = 'validee'::text AND p.nature = 'banque'::text AND p.compte = '4551'::text AND p.sens = 'credit'::text;

create or replace view public.v_echeances with (security_invoker=on) as
SELECT 'obligation'::text AS source,
    o.id,
    o.date_limite AS echeance,
    o.libelle,
    COALESCE(o.reference,
        CASE
            WHEN o.periodicite = 'unique'::text THEN 'Une seule fois'::text
            ELSE initcap(o.periodicite)
        END, ''::text) AS detail,
    NULL::numeric AS montant,
    o.categorie AS nature,
    o.accomplie_le IS NOT NULL AS accomplie,
    o.accomplie_le,
    NULL::text AS lien
   FROM obligations o
UNION ALL
 SELECT 'abonnement'::text AS source,
    e.id,
    e.date_prevue AS echeance,
    (a.nom || ' — '::text) || a.fournisseur AS libelle,
    'Prélèvement '::text || e.periode AS detail,
    e.montant_prevu AS montant,
    'abonnement'::text AS nature,
    e.statut = ANY (ARRAY['payee'::text, 'annulee'::text]) AS accomplie,
    e.date_constatee AS accomplie_le,
    '/abonnements'::text AS lien
   FROM abonnement_echeances e
     JOIN abonnements a ON a.id = e.abonnement_id
  WHERE e.statut <> 'annulee'::text
UNION ALL
 SELECT 'facture'::text AS source,
    p.id,
    p.date_echeance AS echeance,
    (('Règlement '::text || COALESCE(p.numero_piece, ''::text)) || ' — '::text) || p.tiers_libelle AS libelle,
        CASE
            WHEN p.montant_regle > 0.005 THEN 'Partiellement réglée'::text
            ELSE 'En attente'::text
        END AS detail,
    p.net_a_payer - p.montant_regle AS montant,
    'encaissement'::text AS nature,
    false AS accomplie,
    NULL::date AS accomplie_le,
    '/ventes/'::text || p.id AS lien
   FROM pieces p
  WHERE p.nature = 'vente'::text AND p.etat = 'validee'::text AND p.montant_regle < (p.net_a_payer - 0.005) AND p.date_echeance IS NOT NULL
UNION ALL
 SELECT 'fournisseur'::text AS source,
    p.id,
    COALESCE(p.date_echeance, p.date_piece) AS echeance,
    (('Paiement '::text || COALESCE(p.numero_piece, ''::text)) || ' — '::text) || p.tiers_libelle AS libelle,
    COALESCE(p.objet, 'Facture fournisseur'::text) AS detail,
    p.net_a_payer - p.montant_regle AS montant,
    'paiement'::text AS nature,
    false AS accomplie,
    NULL::date AS accomplie_le,
    '/depenses/'::text || p.id AS lien
   FROM pieces p
  WHERE (p.nature = ANY (ARRAY['achat'::text, 'creation'::text])) AND p.etat = 'validee'::text AND p.sens = 'debit'::text AND (p.net_a_payer - p.montant_regle) > 0.005 AND p.moyen_paiement <> 'avance_associe'::text;

create or replace view public.v_completude with (security_invoker=on) as
SELECT 'piece_sans_banque'::text AS anomalie,
    p.id,
    p.numero_piece,
    p.date_piece,
    p.tiers_libelle,
    p.montant_ttc,
        CASE
            WHEN p.nature = 'vente'::text THEN ('Facture échue le '::text || to_char(p.date_echeance::timestamp with time zone, 'DD/MM/YYYY'::text)) || ' et non encaissée'::text
            ELSE 'Écriture validée sans opération bancaire correspondante'::text
        END AS detail
   FROM pieces p
  WHERE p.etat = 'validee'::text AND p.attendu_en_banque AND p.transaction_id IS NULL AND NOT (EXISTS ( SELECT 1
           FROM reglements r
          WHERE r.piece_id = p.id AND r.transaction_id IS NOT NULL)) AND (p.nature <> 'vente'::text OR p.date_echeance IS NOT NULL AND p.date_echeance < CURRENT_DATE)
UNION ALL
 SELECT 'banque_sans_piece'::text AS anomalie,
    t.id,
    t.numero_piece,
    t.date_operation AS date_piece,
    COALESCE(NULLIF(TRIM(BOTH FROM t.contrepartie), ''::text), t.libelle) AS tiers_libelle,
    abs(t.montant) AS montant_ttc,
    'Opération bancaire sans écriture comptable'::text AS detail
   FROM transactions_qonto t
  WHERE t.statut_traitement = 'a_traiter'::text AND t.statut_qonto = 'completed'::text AND abs(t.montant) > 0.005
UNION ALL
 SELECT 'vente_encaissee_sans_reglement'::text AS anomalie,
    p.id,
    p.numero_piece,
    p.date_piece,
    p.tiers_libelle,
    p.montant_ttc,
    'Encaissement déclaré sans règlement enregistré'::text AS detail
   FROM pieces p
  WHERE p.etat = 'validee'::text AND p.nature = 'vente'::text AND p.montant_regle > 0.005 AND NOT (EXISTS ( SELECT 1
           FROM reglements r
          WHERE r.piece_id = p.id));

create or replace view public.v_pieces_completes with (security_invoker=on) as
SELECT p.id,
    p.numero_piece,
    p.nature,
    p.sens,
    p.origine,
    p.date_piece,
    p.tiers_id,
    p.tiers_libelle,
    p.objet,
    p.categorie_id,
    p.compte,
    p.montant_ht,
    p.taux_tva,
    p.montant_tva,
    p.montant_ttc,
    p.tva_comptable,
    p.taux_deductibilite,
    p.type_operation,
    p.etat,
    p.paye_le,
    p.montant_regle,
    p.moyen_paiement,
    p.paye_par,
    p.date_echeance,
    p.attendu_en_banque,
    p.transaction_id,
    p.numero_externe,
    p.piece_liee_id,
    p.source_table,
    p.source_id,
    p.notes,
    p.cree_par,
    p.cree_le,
    p.valide_par,
    p.valide_le,
    p.motif_rejet,
    p.annule_le,
    p.annule_par,
    p.motif_annulation,
    p.modifie_le,
    p.date_prestation,
    p.periode_debut,
    p.periode_fin,
    p.delai_paiement,
    p.acomptes_deduits,
    p.mentions_gelees,
    p.emise_le,
    p.emise_par,
    p.relances_envoyees,
    p.derniere_relance,
    p.extrait_par_ia,
    p.confiance_extraction,
    p.net_a_payer,
    p.regime_tva,
    p.tva_autoliquidee,
    p.revu_le,
    p.revu_par,
    p.justificatif_exige,
    p.motif_exemption,
    c.libelle AS categorie_libelle,
    COALESCE(p.justificatif_exige, c.justificatif_requis, true) AS justificatif_requis,
    ( SELECT count(*) AS count
           FROM justificatifs j
          WHERE j.piece_id = p.id) AS nb_justificatifs,
    p.etat = 'validee'::text AND (p.nature = ANY (ARRAY['achat'::text, 'creation'::text])) AND COALESCE(p.justificatif_exige, c.justificatif_requis, true) AND NOT (EXISTS ( SELECT 1
           FROM justificatifs j
          WHERE j.piece_id = p.id)) AS facture_manquante,
    p.attendu_en_banque AND p.transaction_id IS NULL AND p.etat = 'validee'::text AND NOT (EXISTS ( SELECT 1
           FROM reglements r
          WHERE r.piece_id = p.id AND r.transaction_id IS NOT NULL)) AS banque_manquante
   FROM pieces p
     LEFT JOIN categories c ON c.id = p.categorie_id;

create or replace view public.v_anomalies with (security_invoker=on) as
SELECT p.id,
    p.numero_piece,
    p.date_piece,
    p.tiers_libelle AS tiers,
    'sans_justificatif'::text AS type,
    'Aucune facture rattachée — la charge est rejetée et la TVA contestée'::text AS message,
    'depenses'::text AS source
   FROM v_pieces_completes p
  WHERE p.facture_manquante
UNION ALL
 SELECT p.id,
    p.numero_piece,
    p.date_piece,
    p.tiers_libelle AS tiers,
    'sans_banque'::text AS type,
    'Aucune opération bancaire rattachée — comptabilité incomplète'::text AS message,
    'depenses'::text AS source
   FROM v_pieces_completes p
  WHERE p.banque_manquante
UNION ALL
 SELECT p.id,
    p.numero_piece,
    p.date_piece,
    p.tiers_libelle AS tiers,
    'non_ratifie'::text AS type,
    'Frais engagé avant immatriculation, non ratifié en assemblée'::text AS message,
    'frais_creation'::text AS source
   FROM pieces p
  WHERE p.nature = 'creation'::text AND p.etat = 'a_valider'::text
UNION ALL
 SELECT p.id,
    p.numero_piece,
    p.date_echeance AS date_piece,
    p.tiers_libelle AS tiers,
    'impayee'::text AS type,
    'Facture échue et non réglée'::text AS message,
    'ventes'::text AS source
   FROM pieces p
  WHERE p.etat = 'validee'::text AND p.nature = 'vente'::text AND p.montant_regle < (p.net_a_payer - 0.005) AND p.date_echeance < CURRENT_DATE;

create or replace view public.v_devis with (security_invoker=on) as
SELECT p.id,
    p.numero_piece,
    p.date_piece,
    p.valable_jusquau,
    p.tiers_id,
    p.tiers_libelle,
    p.objet,
    p.montant_ht,
    p.montant_ttc,
    p.facture_issue_id,
    f.numero_piece AS facture_numero,
        CASE
            WHEN p.devis_statut = ANY (ARRAY['accepte'::text, 'refuse'::text]) THEN p.devis_statut
            WHEN p.valable_jusquau < CURRENT_DATE THEN 'expire'::text
            ELSE COALESCE(p.devis_statut, 'brouillon'::text)
        END AS statut,
    p.valable_jusquau - CURRENT_DATE AS jours_restants,
    ( SELECT count(*) AS count
           FROM pieces_lignes l
          WHERE l.piece_id = p.id) AS nb_lignes
   FROM pieces p
     LEFT JOIN pieces f ON f.id = p.facture_issue_id
  WHERE p.nature = 'devis'::text;

create or replace view public.v_contrats_a_facturer with (security_invoker=on) as
SELECT e.id AS echeance_id,
    e.periode,
    e.date_prevue,
    e.montant_prevu,
    c.id AS contrat_id,
    c.reference,
    c.libelle,
    c.designation,
    c.periodicite,
    c.tiers_id,
    t.nom AS client,
    e.date_prevue <= CURRENT_DATE AS echue
   FROM contrat_echeances e
     JOIN contrats c ON c.id = e.contrat_id
     JOIN tiers t ON t.id = c.tiers_id
  WHERE e.statut = 'attendue'::text AND c.actif AND e.date_prevue <= (CURRENT_DATE + 7)
  ORDER BY e.date_prevue;

-- ---------- Déclencheurs (dont auth.users) ----------
CREATE TRIGGER trg_piece_abonnements BEFORE INSERT ON public.abonnements FOR EACH ROW EXECUTE FUNCTION attribuer_numero_abonnement();
CREATE TRIGGER trg_piece_clients BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION numeroter_client();
CREATE TRIGGER trg_tiers_client AFTER INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION synchroniser_tiers_client();
CREATE TRIGGER trg_piece_deplacements BEFORE INSERT ON public.deplacements FOR EACH ROW EXECUTE FUNCTION attribuer_numero_piece();
CREATE TRIGGER trg_rerouter_justificatif BEFORE INSERT ON public.justificatifs FOR EACH ROW EXECUTE FUNCTION rerouter_justificatif();
CREATE TRIGGER trg_verifier_payeur BEFORE INSERT OR UPDATE OF paye_par ON public.pieces FOR EACH ROW EXECUTE FUNCTION verifier_payeur();
CREATE TRIGGER trg_verrou_exercice BEFORE INSERT OR DELETE OR UPDATE ON public.pieces FOR EACH ROW EXECUTE FUNCTION verrou_exercice_pieces();
CREATE TRIGGER trg_verrou_tva BEFORE INSERT OR DELETE OR UPDATE ON public.pieces FOR EACH ROW EXECUTE FUNCTION verrou_tva_pieces();
CREATE TRIGGER trg_recalculer_piece AFTER INSERT OR DELETE OR UPDATE ON public.pieces_lignes FOR EACH ROW EXECUTE FUNCTION recalculer_piece();
CREATE TRIGGER trg_reglements AFTER INSERT OR DELETE OR UPDATE ON public.reglements FOR EACH ROW EXECUTE FUNCTION recalculer_reglements();
CREATE TRIGGER trg_verrou_exercice BEFORE INSERT OR DELETE OR UPDATE ON public.reglements FOR EACH ROW EXECUTE FUNCTION verrou_exercice_reglements();
CREATE TRIGGER trg_verrou_tva BEFORE INSERT OR DELETE OR UPDATE ON public.reglements FOR EACH ROW EXECUTE FUNCTION verrou_tva_reglements();
CREATE TRIGGER trg_ecarter_empreintes BEFORE INSERT OR UPDATE OF montant, statut_qonto ON public.transactions_qonto FOR EACH ROW EXECUTE FUNCTION ecarter_empreintes();
CREATE TRIGGER trg_piece_transactions BEFORE INSERT ON public.transactions_qonto FOR EACH ROW EXECUTE FUNCTION attribuer_numero_transaction();
CREATE TRIGGER trg_creer_profil AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION creer_profil();

-- ---------- Sécurité par ligne ----------
alter table public.abonnement_echeances enable row level security;
alter table public.abonnements enable row level security;
alter table public.alias_bancaires enable row level security;
alter table public.associes enable row level security;
alter table public.audit enable row level security;
alter table public.bareme_km enable row level security;
alter table public.categories enable row level security;
alter table public.clients enable row level security;
alter table public.commentaires enable row level security;
alter table public.compteurs_piece enable row level security;
alter table public.contrat_echeances enable row level security;
alter table public.contrats enable row level security;
alter table public.declarations_tva enable row level security;
alter table public.deplacements enable row level security;
alter table public.documents_permanents enable row level security;
alter table public.entreprise enable row level security;
alter table public.exercices enable row level security;
alter table public.fournisseurs_connus enable row level security;
alter table public.immobilisations enable row level security;
alter table public.justificatifs enable row level security;
alter table public.libelles_bancaires enable row level security;
alter table public.obligations enable row level security;
alter table public.obligations_suivi enable row level security;
alter table public.permissions enable row level security;
alter table public.pieces enable row level security;
alter table public.pieces_lignes enable row level security;
alter table public.prestations enable row level security;
alter table public.profils enable row level security;
alter table public.reglements enable row level security;
alter table public.regles_appariement enable row level security;
alter table public.relances enable row level security;
alter table public.sauvegardes enable row level security;
alter table public.synchronisations enable row level security;
alter table public.taches enable row level security;
alter table public.tiers enable row level security;
alter table public.transactions_qonto enable row level security;
alter table public.usage_ia enable row level security;
alter table public.vehicules enable row level security;
create policy "ech_ecriture" on public.abonnement_echeances as permissive for all to public
  using (a_permission('abonnements'::text, 'update'::text))
  with check (a_permission('abonnements'::text, 'update'::text));
create policy "ech_lecture" on public.abonnement_echeances as permissive for select to public
  using (a_permission('abonnements'::text, 'read'::text));
create policy "abo_ecriture" on public.abonnements as permissive for all to public
  using (a_permission('abonnements'::text, 'update'::text))
  with check (a_permission('abonnements'::text, 'update'::text));
create policy "abo_lecture" on public.abonnements as permissive for select to public
  using (a_permission('abonnements'::text, 'read'::text));
create policy "alias_lecture" on public.alias_bancaires as permissive for select to authenticated
  using (a_permission('banque'::text, 'read'::text));
create policy "associes_ecriture" on public.associes as permissive for all to public
  using (a_permission('entreprise'::text, 'update'::text))
  with check (a_permission('entreprise'::text, 'update'::text));
create policy "associes_lecture" on public.associes as permissive for select to public
  using (a_permission('entreprise'::text, 'read'::text));
create policy "audit_lecture" on public.audit as permissive for select to public
  using ((a_permission('audit'::text, 'read'::text) OR a_permission('audit_comptable'::text, 'read'::text)));
create policy "bareme_ecriture" on public.bareme_km as permissive for all to public
  using (a_permission('depenses'::text, 'update'::text))
  with check (a_permission('depenses'::text, 'update'::text));
create policy "bareme_lecture" on public.bareme_km as permissive for select to public
  using ((auth.uid() IS NOT NULL));
create policy "cat_ecriture" on public.categories as permissive for all to public
  using (a_permission('depenses'::text, 'update'::text))
  with check (a_permission('depenses'::text, 'update'::text));
create policy "cat_lecture" on public.categories as permissive for select to public
  using (a_permission('depenses'::text, 'read'::text));
create policy "clients_ecriture" on public.clients as permissive for all to public
  using (a_permission('clients'::text, 'update'::text))
  with check (a_permission('clients'::text, 'update'::text));
create policy "clients_lecture" on public.clients as permissive for select to public
  using (a_permission('clients'::text, 'read'::text));
create policy "commentaires_creation" on public.commentaires as permissive for insert to public
  with check ((a_permission('commentaires'::text, 'create'::text) AND (cree_par = auth.uid())));
create policy "commentaires_lecture" on public.commentaires as permissive for select to public
  using (a_permission('commentaires'::text, 'read'::text));
create policy "commentaires_modification" on public.commentaires as permissive for update to public
  using (a_permission('commentaires'::text, 'update'::text));
create policy "commentaires_suppression" on public.commentaires as permissive for delete to public
  using (a_permission('commentaires'::text, 'delete'::text));
create policy "compteurs_lecture" on public.compteurs_piece as permissive for select to public
  using (a_permission('depenses'::text, 'read'::text));
create policy "contrat_echeances_ecriture" on public.contrat_echeances as permissive for all to public
  using (a_permission('ventes'::text, 'update'::text))
  with check (a_permission('ventes'::text, 'update'::text));
create policy "contrat_echeances_lecture" on public.contrat_echeances as permissive for select to public
  using (a_permission('ventes'::text, 'read'::text));
create policy "contrats_ecriture" on public.contrats as permissive for all to public
  using (a_permission('ventes'::text, 'update'::text))
  with check (a_permission('ventes'::text, 'update'::text));
create policy "contrats_lecture" on public.contrats as permissive for select to public
  using (a_permission('ventes'::text, 'read'::text));
create policy "declarations_ecriture" on public.declarations_tva as permissive for all to public
  using (a_permission('tva'::text, 'validate'::text))
  with check (a_permission('tva'::text, 'validate'::text));
create policy "declarations_lecture" on public.declarations_tva as permissive for select to public
  using (a_permission('tva'::text, 'read'::text));
create policy "depl_creation" on public.deplacements as permissive for insert to public
  with check ((a_permission('depenses'::text, 'create'::text) AND (cree_par = auth.uid()) AND ((statut = 'en_attente'::text) OR a_permission('depenses'::text, 'validate'::text))));
create policy "depl_lecture" on public.deplacements as permissive for select to public
  using (a_permission('depenses'::text, 'read'::text));
create policy "depl_modification" on public.deplacements as permissive for update to public
  using ((a_permission('depenses'::text, 'update'::text) OR ((cree_par = auth.uid()) AND (statut = ANY (ARRAY['en_attente'::text, 'rejetee'::text])))));
create policy "depl_suppression" on public.deplacements as permissive for delete to public
  using ((a_permission('depenses'::text, 'delete'::text) AND (statut = 'en_attente'::text)));
create policy "documents_ecriture" on public.documents_permanents as permissive for all to public
  using (a_permission('documents'::text, 'create'::text))
  with check (a_permission('documents'::text, 'create'::text));
create policy "documents_lecture" on public.documents_permanents as permissive for select to public
  using (a_permission('documents'::text, 'read'::text));
create policy "entreprise_ecriture" on public.entreprise as permissive for update to public
  using (a_permission('entreprise'::text, 'update'::text));
create policy "entreprise_lecture" on public.entreprise as permissive for select to public
  using (a_permission('entreprise'::text, 'read'::text));
create policy "exercices_ecriture" on public.exercices as permissive for all to public
  using (a_permission('entreprise'::text, 'update'::text));
create policy "exercices_lecture" on public.exercices as permissive for select to public
  using (a_permission('entreprise'::text, 'read'::text));
create policy "fournisseurs_ecriture" on public.fournisseurs_connus as permissive for all to public
  using (a_permission('depenses'::text, 'create'::text))
  with check (a_permission('depenses'::text, 'create'::text));
create policy "fournisseurs_lecture" on public.fournisseurs_connus as permissive for select to public
  using (a_permission('depenses'::text, 'read'::text));
create policy "immo_ecriture" on public.immobilisations as permissive for all to public
  using (a_permission('depenses'::text, 'validate'::text))
  with check (a_permission('depenses'::text, 'validate'::text));
create policy "immo_lecture" on public.immobilisations as permissive for select to public
  using (a_permission('depenses'::text, 'read'::text));
create policy "just_creation" on public.justificatifs as permissive for insert to public
  with check (a_permission('depenses'::text, 'create'::text));
create policy "just_lecture" on public.justificatifs as permissive for select to public
  using (a_permission('depenses'::text, 'read'::text));
create policy "just_suppression" on public.justificatifs as permissive for delete to public
  using (a_permission('depenses'::text, 'update'::text));
create policy "libelles_ecriture" on public.libelles_bancaires as permissive for all to public
  using (a_permission('banque'::text, 'update'::text))
  with check (a_permission('banque'::text, 'update'::text));
create policy "libelles_lecture" on public.libelles_bancaires as permissive for select to public
  using (a_permission('banque'::text, 'read'::text));
create policy "obligations_ecriture" on public.obligations as permissive for all to public
  using (a_permission('echeances'::text, 'update'::text))
  with check (a_permission('echeances'::text, 'update'::text));
create policy "obligations_lecture" on public.obligations as permissive for select to public
  using (a_permission('echeances'::text, 'read'::text));
create policy "obligations_suivi_ecriture" on public.obligations_suivi as permissive for all to authenticated
  using (a_permission('tva'::text, 'validate'::text))
  with check (a_permission('tva'::text, 'validate'::text));
create policy "obligations_suivi_lecture" on public.obligations_suivi as permissive for select to authenticated
  using (a_permission('tva'::text, 'read'::text));
create policy "permissions_lecture" on public.permissions as permissive for select to public
  using ((auth.uid() IS NOT NULL));
create policy "pieces_lecture" on public.pieces as permissive for select to authenticated
  using ((a_permission('depenses'::text, 'read'::text) OR a_permission('ventes'::text, 'read'::text)));
create policy "pieces_lignes_lecture" on public.pieces_lignes as permissive for select to authenticated
  using (a_permission('ventes'::text, 'read'::text));
create policy "prestations_ecriture" on public.prestations as permissive for all to public
  using (a_permission('prestations'::text, 'update'::text))
  with check (a_permission('prestations'::text, 'update'::text));
create policy "prestations_lecture" on public.prestations as permissive for select to public
  using (a_permission('prestations'::text, 'read'::text));
create policy "profils_ecriture" on public.profils as permissive for update to public
  using (a_permission('utilisateurs'::text, 'update'::text));
create policy "profils_lecture" on public.profils as permissive for select to public
  using (((id = auth.uid()) OR a_permission('utilisateurs'::text, 'read'::text)));
create policy "reglements_lecture" on public.reglements as permissive for select to authenticated
  using ((a_permission('depenses'::text, 'read'::text) OR a_permission('ventes'::text, 'read'::text)));
create policy "regles_gestion" on public.regles_appariement as permissive for all to authenticated
  using (a_permission('banque'::text, 'read'::text))
  with check (a_permission('banque'::text, 'update'::text));
create policy "relances_ecriture" on public.relances as permissive for all to public
  using (a_permission('ventes'::text, 'update'::text))
  with check (a_permission('ventes'::text, 'update'::text));
create policy "relances_lecture" on public.relances as permissive for select to public
  using (a_permission('ventes'::text, 'read'::text));
create policy "sauvegardes_ecriture" on public.sauvegardes as permissive for all to public
  using (a_permission('entreprise'::text, 'update'::text))
  with check (a_permission('entreprise'::text, 'update'::text));
create policy "sauvegardes_lecture" on public.sauvegardes as permissive for select to public
  using (a_permission('entreprise'::text, 'update'::text));
create policy "synchro_ecriture" on public.synchronisations as permissive for all to public
  using (a_permission('banque'::text, 'update'::text))
  with check (a_permission('banque'::text, 'update'::text));
create policy "synchro_lecture" on public.synchronisations as permissive for select to public
  using (a_permission('banque'::text, 'read'::text));
create policy "taches_creation" on public.taches as permissive for insert to public
  with check ((a_permission('taches'::text, 'create'::text) AND (cree_par = auth.uid())));
create policy "taches_lecture" on public.taches as permissive for select to public
  using (a_permission('taches'::text, 'read'::text));
create policy "taches_modification" on public.taches as permissive for update to public
  using ((a_permission('taches'::text, 'delete'::text) OR (cree_par = auth.uid()) OR (assignee_a = auth.uid())));
create policy "taches_suppression" on public.taches as permissive for delete to public
  using ((a_permission('taches'::text, 'delete'::text) OR (cree_par = auth.uid())));
create policy "tiers_ecriture" on public.tiers as permissive for all to authenticated
  using (a_permission('clients'::text, 'update'::text))
  with check (a_permission('clients'::text, 'update'::text));
create policy "tiers_lecture" on public.tiers as permissive for select to authenticated
  using ((a_permission('depenses'::text, 'read'::text) OR a_permission('ventes'::text, 'read'::text)));
create policy "qonto_ecriture" on public.transactions_qonto as permissive for all to public
  using (a_permission('banque'::text, 'update'::text))
  with check (a_permission('banque'::text, 'update'::text));
create policy "qonto_lecture" on public.transactions_qonto as permissive for select to public
  using (a_permission('banque'::text, 'read'::text));
create policy "usage_ia_ecriture" on public.usage_ia as permissive for insert to public
  with check (a_permission('ia'::text, 'create'::text));
create policy "usage_ia_lecture" on public.usage_ia as permissive for select to public
  using ((a_permission('ia'::text, 'read'::text) OR (utilisateur = auth.uid())));
create policy "veh_ecriture" on public.vehicules as permissive for all to public
  using (a_permission('depenses'::text, 'update'::text))
  with check (a_permission('depenses'::text, 'update'::text));
create policy "veh_lecture" on public.vehicules as permissive for select to public
  using (a_permission('depenses'::text, 'read'::text));
create policy "stockage_depot" on storage.objects as permissive for insert to public
  with check (((bucket_id = 'justificatifs'::text) AND a_permission('depenses'::text, 'create'::text)));
create policy "stockage_lecture" on storage.objects as permissive for select to public
  using (((bucket_id = 'justificatifs'::text) AND a_permission('depenses'::text, 'read'::text)));
create policy "stockage_suppression" on storage.objects as permissive for delete to public
  using (((bucket_id = 'justificatifs'::text) AND a_permission('depenses'::text, 'delete'::text)));

-- ---------- Droits (anon, authenticated, service_role) ----------
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.abonnement_echeances to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.abonnement_echeances to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.abonnements to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.abonnements to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.alias_bancaires to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.alias_bancaires to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.associes to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.associes to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.audit to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.audit to service_role;
grant SELECT, UPDATE, USAGE on public.audit_id_seq to authenticated;
grant SELECT, UPDATE, USAGE on public.audit_id_seq to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bareme_km to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bareme_km to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.categories to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.categories to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.clients to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.clients to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.commentaires to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.commentaires to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.compteurs_piece to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.compteurs_piece to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.contrat_echeances to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.contrat_echeances to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.contrats to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.contrats to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.declarations_tva to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.declarations_tva to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.deplacements to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.deplacements to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.documents_permanents to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.documents_permanents to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.entreprise to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.entreprise to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.exercices to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.exercices to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.fournisseurs_connus to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.fournisseurs_connus to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.immobilisations to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.immobilisations to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.justificatifs to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.justificatifs to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.libelles_bancaires to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.libelles_bancaires to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.obligations to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.obligations to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.obligations_suivi to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.obligations_suivi to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.permissions to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.permissions to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.pieces to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.pieces to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.pieces_lignes to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.pieces_lignes to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.prestations to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.prestations to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.profils to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.profils to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.reglements to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.reglements to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.regles_appariement to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.regles_appariement to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.relances to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.relances to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.sauvegardes to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.sauvegardes to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.synchronisations to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.synchronisations to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.taches to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.taches to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.tiers to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.tiers to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.transactions_qonto to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.transactions_qonto to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.usage_ia to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.usage_ia to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_anomalies to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_anomalies to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_audit_comptable to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_audit_comptable to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_completude to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_completude to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_compte_courant to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_compte_courant to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_contrats_a_facturer to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_contrats_a_facturer to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_couts_abonnements to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_couts_abonnements to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_deplacements_actifs to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_deplacements_actifs to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_devis to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_devis to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_echeances to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_echeances to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_justificatifs_qonto to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_justificatifs_qonto to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_pieces_completes to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_pieces_completes to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_tva_exigible to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_tva_exigible to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.vehicules to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.vehicules to service_role;
grant execute on function a_permission(text,text) to authenticated;
grant execute on function a_permission(text,text) to service_role;
grant execute on function a_relancer() to authenticated;
grant execute on function a_relancer() to service_role;
grant execute on function accepter_devis(uuid,text) to authenticated;
grant execute on function accepter_devis(uuid,text) to service_role;
grant execute on function accomplir_obligation(uuid,text,date) to authenticated;
grant execute on function accomplir_obligation(uuid,text,date) to service_role;
grant execute on function ajouter_ligne(uuid,text,numeric,numeric,numeric,text,uuid,text) to authenticated;
grant execute on function ajouter_ligne(uuid,text,numeric,numeric,numeric,text,uuid,text) to service_role;
grant execute on function annuler_declaration_tva(uuid,text) to authenticated;
grant execute on function annuler_declaration_tva(uuid,text) to service_role;
grant execute on function annuler_ecriture(text,uuid,text) to authenticated;
grant execute on function annuler_ecriture(text,uuid,text) to service_role;
grant execute on function annuler_piece(uuid,text) to authenticated;
grant execute on function annuler_piece(uuid,text) to service_role;
grant execute on function annuler_trajet(uuid,text) to authenticated;
grant execute on function annuler_trajet(uuid,text) to service_role;
grant execute on function apercu_associe(text) to authenticated;
grant execute on function apercu_associe(text) to service_role;
grant execute on function apercu_banque(uuid) to authenticated;
grant execute on function apercu_banque(uuid) to service_role;
grant execute on function apercu_piece(uuid) to authenticated;
grant execute on function apercu_piece(uuid) to service_role;
grant execute on function apparier(uuid,uuid) to authenticated;
grant execute on function apparier(uuid,uuid) to service_role;
grant execute on function appliquer_regle(uuid) to authenticated;
grant execute on function appliquer_regle(uuid) to service_role;
grant execute on function attribuer_numero_abonnement() to authenticated;
grant execute on function attribuer_numero_abonnement() to service_role;
grant execute on function attribuer_numero_piece() to authenticated;
grant execute on function attribuer_numero_piece() to service_role;
grant execute on function attribuer_numero_transaction() to authenticated;
grant execute on function attribuer_numero_transaction() to service_role;
grant execute on function balayer_appariements() to authenticated;
grant execute on function balayer_appariements() to service_role;
grant execute on function candidats_pour_piece(uuid) to authenticated;
grant execute on function candidats_pour_piece(uuid) to service_role;
grant execute on function candidats_pour_transaction(uuid) to authenticated;
grant execute on function candidats_pour_transaction(uuid) to service_role;
grant execute on function changer_statut_devis(uuid,text,text) to authenticated;
grant execute on function changer_statut_devis(uuid,text,text) to service_role;
grant execute on function charge_comptable(text,numeric,numeric,numeric) to authenticated;
grant execute on function charge_comptable(text,numeric,numeric,numeric) to service_role;
grant execute on function chercher_doublon(text,text,numeric,date) to authenticated;
grant execute on function chercher_doublon(text,text,numeric,date) to service_role;
grant execute on function cloturer_exercice(uuid) to authenticated;
grant execute on function cloturer_exercice(uuid) to service_role;
grant execute on function cloturer_tva(date,date,date,text,text) to authenticated;
grant execute on function cloturer_tva(date,date,date,text,text) to service_role;
grant execute on function completer_tiers(uuid,text,text) to authenticated;
grant execute on function completer_tiers(uuid,text,text) to service_role;
grant execute on function comptabiliser_is(uuid) to authenticated;
grant execute on function comptabiliser_is(uuid) to service_role;
grant execute on function confirmer_appariement(uuid,uuid,boolean) to authenticated;
grant execute on function confirmer_appariement(uuid,uuid,boolean) to service_role;
grant execute on function confirmer_rapprochement(uuid,uuid) to authenticated;
grant execute on function confirmer_rapprochement(uuid,uuid) to service_role;
grant execute on function constater_amortissements(date,date) to authenticated;
grant execute on function constater_amortissements(date,date) to service_role;
grant execute on function constater_indemnites_km(date,date) to authenticated;
grant execute on function constater_indemnites_km(date,date) to service_role;
grant execute on function controle_fec(date,date) to authenticated;
grant execute on function controle_fec(date,date) to service_role;
grant execute on function creer_achat(date,text,uuid,numeric,numeric,text,text,text,uuid,text,text,text,text,boolean,numeric,numeric,text,smallint,text) to authenticated;
grant execute on function creer_achat(date,text,uuid,numeric,numeric,text,text,text,uuid,text,text,text,text,boolean,numeric,numeric,text,smallint,text) to service_role;
grant execute on function creer_avoir_achat(uuid,text,uuid,numeric,numeric,text,text,text) to authenticated;
grant execute on function creer_avoir_achat(uuid,text,uuid,numeric,numeric,text,text,text) to service_role;
grant execute on function creer_avoir_vente(uuid,text) to authenticated;
grant execute on function creer_avoir_vente(uuid,text) to service_role;
grant execute on function creer_depense(date,text,uuid,numeric,numeric,text,text,text,uuid,text,text,text,text,boolean,numeric,numeric,text) to authenticated;
grant execute on function creer_depense(date,text,uuid,numeric,numeric,text,text,text,uuid,text,text,text,text,boolean,numeric,numeric,text) to service_role;
grant execute on function creer_devis(uuid,text,date,integer,text) to authenticated;
grant execute on function creer_devis(uuid,text,date,integer,text) to service_role;
grant execute on function creer_ecriture_inventaire(text,uuid,text,text,numeric,numeric,text) to authenticated;
grant execute on function creer_ecriture_inventaire(text,uuid,text,text,numeric,numeric,text) to service_role;
grant execute on function creer_facture(uuid,text,uuid,uuid,date,text,smallint,text) to authenticated;
grant execute on function creer_facture(uuid,text,uuid,uuid,date,text,smallint,text) to service_role;
grant execute on function creer_operation_banque(uuid,text,text,text,text) to authenticated;
grant execute on function creer_operation_banque(uuid,text,text,text,text) to service_role;
grant execute on function creer_profil() to authenticated;
grant execute on function creer_profil() to service_role;
grant execute on function creer_vente(uuid,text,date,text,smallint,uuid,text) to authenticated;
grant execute on function creer_vente(uuid,text,date,text,smallint,uuid,text) to service_role;
grant execute on function cumul_km_annuel(integer) to authenticated;
grant execute on function cumul_km_annuel(integer) to service_role;
grant execute on function date_ecriture(text,date) to authenticated;
grant execute on function date_ecriture(text,date) to service_role;
grant execute on function decider_justificatif(uuid,boolean,text) to authenticated;
grant execute on function decider_justificatif(uuid,boolean,text) to service_role;
grant execute on function declaration_tva(date,date) to authenticated;
grant execute on function declaration_tva(date,date) to service_role;
grant execute on function definir_attente_banque(uuid,boolean) to authenticated;
grant execute on function definir_attente_banque(uuid,boolean) to service_role;
grant execute on function definir_prestation(uuid,date,date,date) to authenticated;
grant execute on function definir_prestation(uuid,date,date,date) to service_role;
grant execute on function deposer_document(text,text,text,text,text,integer,date,text,date,date,uuid,text) to authenticated;
grant execute on function deposer_document(text,text,text,text,text,integer,date,text,date,date,uuid,text) to service_role;
grant execute on function detacher_appariement(uuid,uuid) to authenticated;
grant execute on function detacher_appariement(uuid,uuid) to service_role;
grant execute on function detacher_devis(uuid) to authenticated;
grant execute on function detacher_devis(uuid) to service_role;
grant execute on function determiner_regime_tva(text,numeric,text) to authenticated;
grant execute on function determiner_regime_tva(text,numeric,text) to service_role;
grant execute on function devis_rattachables(uuid) to authenticated;
grant execute on function devis_rattachables(uuid) to service_role;
grant execute on function dossier_associe(text) to authenticated;
grant execute on function dossier_associe(text) to service_role;
grant execute on function ecarter_empreintes() to authenticated;
grant execute on function ecarter_empreintes() to service_role;
grant execute on function ecarts_declaration(uuid) to authenticated;
grant execute on function ecarts_declaration(uuid) to service_role;
grant execute on function echeance_pour_transaction(uuid) to authenticated;
grant execute on function echeance_pour_transaction(uuid) to service_role;
grant execute on function echeancier(integer) to authenticated;
grant execute on function echeancier(integer) to service_role;
grant execute on function emettre_vente(uuid) to authenticated;
grant execute on function emettre_vente(uuid) to service_role;
grant execute on function encaisser_piece(uuid,date,numeric,text,uuid,text) to authenticated;
grant execute on function encaisser_piece(uuid,date,numeric,text,uuid,text) to service_role;
grant execute on function enregistrer_relance(uuid,text,text,text) to authenticated;
grant execute on function enregistrer_relance(uuid,text,text,text) to service_role;
grant execute on function est_immobilisation(text) to authenticated;
grant execute on function est_immobilisation(text) to service_role;
grant execute on function etat_achats() to authenticated;
grant execute on function etat_achats() to service_role;
grant execute on function etat_cloture(uuid) to authenticated;
grant execute on function etat_cloture(uuid) to service_role;
grant execute on function etat_coffre() to authenticated;
grant execute on function etat_coffre() to service_role;
grant execute on function etat_contrats() to authenticated;
grant execute on function etat_contrats() to service_role;
grant execute on function etat_dossier() to authenticated;
grant execute on function etat_dossier() to service_role;
grant execute on function etat_immobilisations() to authenticated;
grant execute on function etat_immobilisations() to service_role;
grant execute on function etat_ventes() to authenticated;
grant execute on function etat_ventes() to service_role;
grant execute on function etats_financiers(uuid) to authenticated;
grant execute on function etats_financiers(uuid) to service_role;
grant execute on function exercice_clos(date) to authenticated;
grant execute on function exercice_clos(date) to service_role;
grant execute on function facturer_echeance(uuid) to authenticated;
grant execute on function facturer_echeance(uuid) to service_role;
grant execute on function fusionner_tiers(uuid,uuid,text) to authenticated;
grant execute on function fusionner_tiers(uuid,uuid,text) to service_role;
grant execute on function garantir_emission() to authenticated;
grant execute on function garantir_emission() to service_role;
grant execute on function generer_echeances_contrats(integer) to authenticated;
grant execute on function generer_echeances_contrats(integer) to service_role;
grant execute on function generer_echeances(uuid,smallint) to authenticated;
grant execute on function generer_echeances(uuid,smallint) to service_role;
grant execute on function generer_lignes_logements(uuid,uuid[],boolean) to authenticated;
grant execute on function generer_lignes_logements(uuid,uuid[],boolean) to service_role;
grant execute on function indemnite_km(uuid,smallint) to authenticated;
grant execute on function indemnite_km(uuid,smallint) to service_role;
grant execute on function inscrire_immobilisation(uuid,date,smallint,numeric,text) to authenticated;
grant execute on function inscrire_immobilisation(uuid,date,smallint,numeric,text) to service_role;
grant execute on function journaliser(text,text,text,jsonb) to authenticated;
grant execute on function journaliser(text,text,text,jsonb) to service_role;
grant execute on function km_a_constater() to authenticated;
grant execute on function km_a_constater() to service_role;
grant execute on function km_effectifs(deplacements) to authenticated;
grant execute on function km_effectifs(deplacements) to service_role;
grant execute on function lieux_frequents() to authenticated;
grant execute on function lieux_frequents() to service_role;
grant execute on function lignes_fec(date,date) to authenticated;
grant execute on function lignes_fec(date,date) to service_role;
grant execute on function marquer_impayees() to authenticated;
grant execute on function marquer_impayees() to service_role;
grant execute on function marquer_justificatifs_manquants() to authenticated;
grant execute on function marquer_justificatifs_manquants() to service_role;
grant execute on function marquer_revu(text,uuid,boolean) to authenticated;
grant execute on function marquer_revu(text,uuid,boolean) to service_role;
grant execute on function marquer_revu(uuid,boolean) to authenticated;
grant execute on function marquer_revu(uuid,boolean) to service_role;
grant execute on function memoriser_fournisseur(text,uuid,text,text) to authenticated;
grant execute on function memoriser_fournisseur(text,uuid,text,text) to service_role;
grant execute on function memoriser_libelle(text,text,uuid) to authenticated;
grant execute on function memoriser_libelle(text,text,uuid) to service_role;
grant execute on function mentions_entreprise() to authenticated;
grant execute on function mentions_entreprise() to service_role;
grant execute on function modifier_achat(uuid,date,text,uuid,numeric,numeric,text,text,text,text,text,smallint) to authenticated;
grant execute on function modifier_achat(uuid,date,text,uuid,numeric,numeric,text,text,text,text,text,smallint) to service_role;
grant execute on function module_piece(text) to authenticated;
grant execute on function module_piece(text) to service_role;
grant execute on function motifs_frequents() to authenticated;
grant execute on function motifs_frequents() to service_role;
grant execute on function nom_associe(text) to authenticated;
grant execute on function nom_associe(text) to service_role;
grant execute on function normaliser_libelle(text) to authenticated;
grant execute on function normaliser_libelle(text) to service_role;
grant execute on function normaliser_tiers(text) to authenticated;
grant execute on function normaliser_tiers(text) to service_role;
grant execute on function numero_piece_suivant(text,date) to authenticated;
grant execute on function numero_piece_suivant(text,date) to service_role;
grant execute on function numeroter_client() to authenticated;
grant execute on function numeroter_client() to service_role;
grant execute on function numeroter_devis_piece(uuid) to authenticated;
grant execute on function numeroter_devis_piece(uuid) to service_role;
grant execute on function numeroter_facture() to authenticated;
grant execute on function numeroter_facture() to service_role;
grant execute on function numeroter_piece(uuid) to authenticated;
grant execute on function numeroter_piece(uuid) to service_role;
grant execute on function ordre_restauration() to service_role;
grant execute on function payeurs_possibles() to authenticated;
grant execute on function payeurs_possibles() to service_role;
grant execute on function periode_nature_libre(text,date,date) to authenticated;
grant execute on function periode_nature_libre(text,date,date) to service_role;
grant execute on function periode_tva_declaree(date) to authenticated;
grant execute on function periode_tva_declaree(date) to service_role;
grant execute on function periode_tva_libre(date,date) to authenticated;
grant execute on function periode_tva_libre(date,date) to service_role;
grant execute on function plan_amortissement(uuid) to authenticated;
grant execute on function plan_amortissement(uuid) to service_role;
grant execute on function prefixe_piece(text,text) to authenticated;
grant execute on function prefixe_piece(text,text) to service_role;
grant execute on function produit_vente_ht(text,text,numeric,numeric,numeric,numeric) to authenticated;
grant execute on function produit_vente_ht(text,text,numeric,numeric,numeric,numeric) to service_role;
grant execute on function proposition_pour_piece(uuid) to authenticated;
grant execute on function proposition_pour_piece(uuid) to service_role;
grant execute on function rapport_mensuel(date,date) to authenticated;
grant execute on function rapport_mensuel(date,date) to service_role;
grant execute on function rattacher_devis(uuid,uuid) to authenticated;
grant execute on function rattacher_devis(uuid,uuid) to service_role;
grant execute on function rattacher_justificatif_qonto(uuid,uuid) to authenticated;
grant execute on function rattacher_justificatif_qonto(uuid,uuid) to service_role;
grant execute on function rattacher_justificatif(uuid,text,text,text,integer,integer) to authenticated;
grant execute on function rattacher_justificatif(uuid,text,text,text,integer,integer) to service_role;
grant execute on function recalculer_piece() to authenticated;
grant execute on function recalculer_piece() to service_role;
grant execute on function recalculer_reglements() to authenticated;
grant execute on function recalculer_reglements() to service_role;
grant execute on function refuser_periode_declaree(text) to authenticated;
grant execute on function refuser_periode_declaree(text) to service_role;
grant execute on function regle_pour_transaction(uuid) to authenticated;
grant execute on function regle_pour_transaction(uuid) to service_role;
grant execute on function reglement_declare(uuid,date) to authenticated;
grant execute on function reglement_declare(uuid,date) to service_role;
grant execute on function rejeter_piece(uuid,text) to authenticated;
grant execute on function rejeter_piece(uuid,text) to service_role;
grant execute on function rejeter_rapprochement(uuid) to authenticated;
grant execute on function rejeter_rapprochement(uuid) to service_role;
grant execute on function rembourser_associe(uuid,text,text) to authenticated;
grant execute on function rembourser_associe(uuid,text,text) to service_role;
grant execute on function reprendre_regle_justificatif(uuid) to authenticated;
grant execute on function reprendre_regle_justificatif(uuid) to service_role;
grant execute on function reprendre_reglements() to authenticated;
grant execute on function reprendre_reglements() to service_role;
grant execute on function rerouter_justificatif() to authenticated;
grant execute on function rerouter_justificatif() to service_role;
grant execute on function resilier_abonnement(uuid,date,text) to authenticated;
grant execute on function resilier_abonnement(uuid,date,text) to service_role;
grant execute on function resultat_comptable(date,date) to authenticated;
grant execute on function resultat_comptable(date,date) to service_role;
grant execute on function resultat_fiscal(uuid) to authenticated;
grant execute on function resultat_fiscal(uuid) to service_role;
grant execute on function retirer_justificatif(uuid,text) to authenticated;
grant execute on function retirer_justificatif(uuid,text) to service_role;
grant execute on function retirer_justificatif(uuid) to authenticated;
grant execute on function retirer_justificatif(uuid) to service_role;
grant execute on function retirer_ligne(uuid) to authenticated;
grant execute on function retirer_ligne(uuid) to service_role;
grant execute on function role_courant() to authenticated;
grant execute on function role_courant() to service_role;
grant execute on function rouvrir_exercice(uuid,text) to authenticated;
grant execute on function rouvrir_exercice(uuid,text) to service_role;
grant execute on function sauter_echeance(uuid,text) to authenticated;
grant execute on function sauter_echeance(uuid,text) to service_role;
grant execute on function schema_public() to service_role;
grant execute on function seance_hebdomadaire() to authenticated;
grant execute on function seance_hebdomadaire() to service_role;
grant execute on function signe_tva(text,text) to authenticated;
grant execute on function signe_tva(text,text) to service_role;
grant execute on function similarite_tiers(text,text) to authenticated;
grant execute on function similarite_tiers(text,text) to service_role;
grant execute on function solde_compte_courant() to authenticated;
grant execute on function solde_compte_courant() to service_role;
grant execute on function solde_controle() to authenticated;
grant execute on function solde_controle() to service_role;
grant execute on function solde_reconstitue() to authenticated;
grant execute on function solde_reconstitue() to service_role;
grant execute on function soldes_a_nouveau(date) to authenticated;
grant execute on function soldes_a_nouveau(date) to service_role;
grant execute on function statistiques_donnees() to authenticated;
grant execute on function statistiques_donnees() to service_role;
grant execute on function suivi_tva() to authenticated;
grant execute on function suivi_tva() to service_role;
grant execute on function supprimer_brouillon(uuid) to authenticated;
grant execute on function supprimer_brouillon(uuid) to service_role;
grant execute on function synchroniser_tiers_client() to authenticated;
grant execute on function synchroniser_tiers_client() to service_role;
grant execute on function tableau_de_bord() to authenticated;
grant execute on function tableau_de_bord() to service_role;
grant execute on function tables_publiques() to service_role;
grant execute on function taille_base() to authenticated;
grant execute on function taille_base() to service_role;
grant execute on function tester_regle(text,text) to authenticated;
grant execute on function tester_regle(text,text) to service_role;
grant execute on function trouver_ou_creer_tiers(text,boolean,boolean) to authenticated;
grant execute on function trouver_ou_creer_tiers(text,boolean,boolean) to service_role;
grant execute on function usage_ia_annuel() to authenticated;
grant execute on function usage_ia_annuel() to service_role;
grant execute on function usage_ia_du_mois() to authenticated;
grant execute on function usage_ia_du_mois() to service_role;
grant execute on function valider_piece(uuid) to authenticated;
grant execute on function valider_piece(uuid) to service_role;
grant execute on function verifier_payeur() to authenticated;
grant execute on function verifier_payeur() to service_role;
grant execute on function verrou_exercice_pieces() to authenticated;
grant execute on function verrou_exercice_pieces() to service_role;
grant execute on function verrou_exercice_reglements() to authenticated;
grant execute on function verrou_exercice_reglements() to service_role;
grant execute on function verrou_tva_pieces() to authenticated;
grant execute on function verrou_tva_pieces() to service_role;
grant execute on function verrou_tva_reglements() to authenticated;
grant execute on function verrou_tva_reglements() to service_role;

-- ---------- Stockage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('justificatifs', 'justificatifs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) on conflict (id) do nothing;
