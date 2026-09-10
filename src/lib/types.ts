/** Types partagés du domaine comptable. */

export type Categorie = {
  id: string;
  libelle: string;
  compte: string;
  groupe: string;
  taux_tva_defaut: number;
  taux_deductibilite: number;
  type: 'charge' | 'immobilisation';
  duree_amortissement: number | null;
  avertissement: string | null;
  bloque: boolean;
  actif: boolean;
  ordre: number;
  /** Bien : TVA exigible à la facture. Service : au paiement. */
  type_operation: 'bien' | 'service';
  justificatif_requis: boolean;
};

export type Depense = {
  id: string;
  numero_piece: string | null;
  date_depense: string;
  fournisseur: string;
  libelle: string | null;
  categorie_id: string;
  montant_ht: number;
  taux_tva: number;
  montant_tva: number;
  montant_ttc: number;
  taux_deductibilite: number;
  compte: string;
  tva_deductible: number;
  moyen_paiement: string | null;
  paye_par: string | null;
  statut: 'en_attente' | 'validee' | 'rejetee' | 'annulee';
  cree_par: string;
  cree_le: string;
  valide_par: string | null;
  valide_le: string | null;
  motif_rejet: string | null;
  notes: string | null;
  revu_le?: string | null;
  revu_par?: string | null;
  annule_le?: string | null;
  motif_annulation?: string | null;
  numero_facture_fournisseur?: string | null;
  siret_fournisseur?: string | null;
  extrait_par_ia?: boolean;
  confiance_extraction?: number | null;
  statut_rapprochement?: 'sans_transaction' | 'propose' | 'confirme' | 'sans_objet';
  transaction_proposee_id?: string | null;
  transaction_qonto_id?: string | null;
  paye_le?: string | null;
  recherche_auto?: boolean;
  categories?: Categorie;
  profils?: { nom_complet: string };
};

export type Vehicule = {
  id: string;
  libelle: string;
  immatriculation: string;
  proprietaire_nom: string;
  cv_fiscaux: number;
  motorisation: 'thermique' | 'electrique' | 'hybride';
  genre: 'VP' | 'VU';
  usage_societe: boolean;
  date_ct: string | null;
  actif: boolean;
};

export type Deplacement = {
  id: string;
  numero_piece: string | null;
  date_trajet: string;
  vehicule_id: string;
  depart: string;
  arrivee: string;
  motif: string;
  kilometres: number;
  aller_retour: boolean;
  statut: 'en_attente' | 'validee' | 'rejetee' | 'annulee';
  annule_le?: string | null;
  motif_annulation?: string | null;
  cree_par: string;
  cree_le: string;
  vehicules?: Vehicule;
  profils?: { nom_complet: string };
};

export const LIBELLE_STATUT: Record<string, string> = {
  en_attente: 'En attente',
  validee: 'Validée',
  rejetee: 'Rejetée',
  annulee: 'Annulée',
};

export const CLASSE_STATUT: Record<string, string> = {
  en_attente: 'badge--warning',
  validee: 'badge--success',
  rejetee: 'badge--danger',
  annulee: 'badge--neutral',
};

export type FraisCreation = {
  id: string;
  numero_piece: string | null;
  date_engagement: string;
  fournisseur: string;
  libelle: string | null;
  categorie_id: string | null;
  montant_ht: number;
  taux_tva: number;
  montant_tva: number;
  montant_ttc: number;
  tva_deductible: number;
  tva_a_confirmer: boolean;
  associe_payeur: 'mahdi' | 'sabir';
  nature: 'creation' | 'preparation';
  mode_reprise: 'annexe_statuts' | 'mandat' | 'ag_ratification';
  statut_reprise: 'a_valider' | 'repris' | 'rejete';
  type_comptable: 'charge' | 'immobilisation';
  compte: string;
  notes: string | null;
  categories?: { libelle: string };
};

export const LIBELLE_NATURE: Record<string, string> = {
  creation: 'Frais de création',
  preparation: 'Frais de préparation',
};

export const LIBELLE_REPRISE: Record<string, string> = {
  annexe_statuts: 'Annexe 1 des statuts',
  mandat: 'Mandat du président',
  ag_ratification: 'Ratification en AG',
};

export const LIBELLE_STATUT_REPRISE: Record<string, string> = {
  a_valider: 'À ratifier',
  repris: 'Repris',
  rejete: 'Écarté',
};

export const CLASSE_STATUT_REPRISE: Record<string, string> = {
  a_valider: 'badge--warning',
  repris: 'badge--success',
  rejete: 'badge--neutral',
};

export const LIBELLE_ASSOCIE: Record<string, string> = {
  mahdi: 'Mahdi Mohamadi',
  sabir: 'Sabir Mohamed Ahmed',
};

export type Commentaire = {
  id: string;
  table_cible: 'depenses' | 'frais_creation' | 'deplacements' | 'general';
  id_cible: string | null;
  numero_piece: string | null;
  contenu: string;
  type: 'remarque' | 'anomalie' | 'question' | 'demande_piece';
  statut: 'ouvert' | 'resolu';
  resolu_par: string | null;
  resolu_le: string | null;
  reponse: string | null;
  cree_par: string;
  cree_le: string;
  profils?: { nom_complet: string };
};

export const LIBELLE_TYPE_COMMENTAIRE: Record<string, string> = {
  remarque: 'Remarque',
  anomalie: 'Anomalie',
  question: 'Question',
  demande_piece: 'Pièce demandée',
};

export const CLASSE_TYPE_COMMENTAIRE: Record<string, string> = {
  remarque: 'badge--neutral',
  anomalie: 'badge--danger',
  question: 'badge--info',
  demande_piece: 'badge--warning',
};

export type TransactionQonto = {
  id: string;
  qonto_id: string;
  numero_piece: string | null;
  date_operation: string;
  date_valeur: string | null;
  libelle: string;
  contrepartie: string | null;
  reference: string | null;
  montant: number;
  sens: 'debit' | 'credit';
  devise: string;
  statut_qonto: 'pending' | 'completed' | 'declined' | 'reversed';
  categorie_qonto: string | null;
  a_justificatif: boolean;
  justificatif_recupere: boolean;
  statut_traitement: 'a_traiter' | 'rattachee' | 'ecartee';
  motif_ecart: string | null;
  depense_id: string | null;
  echeance_id: string | null;
  rattachement_auto: boolean;
  rattache_le: string | null;
  synchronise_le: string;
  /** Écriture rattachée, résolue via `reglements` par la page.
      `depenses` — l'ancienne jointure — ne renvoyait plus rien depuis la
      bascule vers le registre. `nombre` vaut plus de 1 lorsque l'opération
      solde plusieurs règlements. */
  ecriture?: {
    piece_id: string;
    numero_piece: string | null;
    tiers: string | null;
    nombre: number;
  } | null;
};

export type Synchronisation = {
  id: string;
  demarree_le: string;
  terminee_le: string | null;
  declencheur: string;
  statut: string;
  transactions_lues: number | null;
  transactions_nouvelles: number | null;
  rapprochees_auto: number | null;
  solde_qonto: number | null;
  duree_ms: number | null;
  erreur: string | null;
};

export const LIBELLE_TRAITEMENT: Record<string, string> = {
  a_traiter: 'À traiter',
  rattachee: 'Rattachée',
  ecartee: 'Écartée',
};

export const CLASSE_TRAITEMENT: Record<string, string> = {
  a_traiter: 'badge--warning',
  rattachee: 'badge--success',
  ecartee: 'badge--neutral',
};

export const LIBELLE_STATUT_QONTO: Record<string, string> = {
  completed: 'Consolidée',
  pending: 'En attente',
  declined: 'Refusée',
  reversed: 'Annulée',
};

/** Statuts de synchronisation. Ils s'affichaient bruts — « reussie »,
    « echouee » — seuls dans l'application à ne pas passer par un libellé. */
export const LIBELLE_SYNCHRONISATION: Record<string, string> = {
  reussie: 'Réussie',
  echouee: 'Échouée',
  en_cours: 'En cours',
};

export type Prestation = {
  id: string;
  libelle: string;
  description: string | null;
  groupe: string;
  prix_ht: number;
  unite: string;
  taux_tva: number;
  compte: string;
  actif: boolean;
  ordre: number;
};

export type Facture = {
  id: string;
  numero_piece: string | null;
  client_id: string;
  devis_id: string | null;
  nature: 'facture' | 'acompte' | 'solde' | 'avoir';
  facture_liee_id: string | null;
  date_emission: string;
  date_echeance: string | null;
  delai_paiement: number;
  objet: string | null;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
  acomptes_deduits: number;
  net_a_payer: number;
  statut: 'brouillon' | 'emise' | 'encaissee' | 'partielle' | 'impayee' | 'annulee';
  encaisse_le: string | null;
  montant_encaisse: number;
  mode_encaissement: string | null;
  transaction_qonto_id: string | null;
  statut_rapprochement: string;
  relances_envoyees: number;
  derniere_relance: string | null;
  motif_annulation: string | null;
  annule_le: string | null;
  annule_par: string | null;
  transaction_proposee_id: string | null;
  conditions: string | null;
  notes: string | null;
  cree_par: string | null;
  cree_le: string;
  modifie_le: string;
  clients?: { nom: string; type: string; email: string | null };
};

export const LIBELLE_TYPE_CLIENT: Record<string, string> = {
  particulier: 'Particulier',
  professionnel: 'Professionnel',
  syndic: 'Syndic',
  conciergerie: 'Conciergerie',
  collectivite: 'Collectivité',
  administration: 'Administration',
};

export const LIBELLE_UNITE: Record<string, string> = {
  forfait: 'forfait', heure: 'heure', m2: 'm²', piece: 'pièce',
  ouvrant: 'ouvrant', rotation: 'rotation', vehicule: 'véhicule',
};

export const LIBELLE_STATUT_FACTURE: Record<string, string> = {
  brouillon: 'Brouillon', emise: 'Émise', encaissee: 'Encaissée',
  partielle: 'Partiellement encaissée', impayee: 'Impayée', annulee: 'Annulée',
};

export const CLASSE_STATUT_FACTURE: Record<string, string> = {
  brouillon: 'badge--neutral', emise: 'badge--info',
  encaissee: 'badge--success', partielle: 'badge--warning',
  impayee: 'badge--danger', annulee: 'badge--neutral',
};

export const LIBELLE_NATURE_FACTURE: Record<string, string> = {
  facture: 'Facture', acompte: 'Acompte', solde: 'Solde', avoir: 'Avoir',
};