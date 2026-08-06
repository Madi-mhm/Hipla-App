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

export type Tache = {
  id: string;
  titre: string;
  description: string | null;
  echeance: string | null;
  priorite: 'basse' | 'normale' | 'haute';
  statut: 'a_faire' | 'en_cours' | 'faite' | 'annulee';
  table_cible: string | null;
  id_cible: string | null;
  numero_piece: string | null;
  assignee_a: string | null;
  cree_par: string;
  cree_le: string;
  faite_le: string | null;
  recurrence: 'mensuelle' | 'trimestrielle' | 'annuelle' | null;
  assigne?: { nom_complet: string };
  auteur?: { nom_complet: string };
};

export type Anomalie = {
  id: string;
  numero_piece: string | null;
  source: string;
  type: string;
  message: string;
  date_piece: string;
  tiers: string;
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

export const LIBELLE_PRIORITE: Record<string, string> = {
  basse: 'Basse', normale: 'Normale', haute: 'Haute',
};

export const LIBELLE_STATUT_TACHE: Record<string, string> = {
  a_faire: 'À faire', en_cours: 'En cours', faite: 'Faite', annulee: 'Annulée',
};

export const CLASSE_STATUT_TACHE: Record<string, string> = {
  a_faire: 'badge--warning',
  en_cours: 'badge--info',
  faite: 'badge--success',
  annulee: 'badge--neutral',
};

export const LIBELLE_TYPE_ANOMALIE: Record<string, string> = {
  montants: 'Montants incohérents',
  tva: 'TVA non déductible',
  justificatif: 'Justificatif manquant',
  exercice: 'Hors exercice',
  ratification: 'Non ratifié',
};

export type Abonnement = {
  id: string;
  numero_piece: string | null;
  nom: string;
  fournisseur: string;
  categorie_id: string | null;
  montant_ht: number;
  taux_tva: number;
  montant_tva: number;
  montant_ttc: number;
  devise: string;
  autoliquidation: boolean;
  pays_prestataire: 'FR' | 'UE' | 'HORS_UE';
  periodicite: 'mensuel' | 'trimestriel' | 'annuel';
  date_debut: string;
  date_fin: string | null;
  mode_paiement: string | null;
  engagement_jusquau: string | null;
  preavis_jours: number | null;
  url_espace_client: string | null;
  identifiant_contrat: string | null;
  statut: 'actif' | 'gratuit' | 'suspendu' | 'resilie';
  motif_resiliation: string | null;
  notes: string | null;
  categories?: { libelle: string };
};

export type Echeance = {
  id: string;
  abonnement_id: string;
  periode: string;
  date_prevue: string;
  date_constatee: string | null;
  montant_prevu: number;
  montant_reel: number | null;
  statut: 'attendue' | 'payee' | 'justificatif_manquant' | 'ecart' | 'annulee';
  depense_id: string | null;
  transaction_qonto_id: string | null;
  abonnements?: { nom: string; fournisseur: string };
};

export const LIBELLE_PERIODICITE: Record<string, string> = {
  mensuel: 'Mensuel', trimestriel: 'Trimestriel', annuel: 'Annuel',
};

export const LIBELLE_STATUT_ABO: Record<string, string> = {
  actif: 'Actif', gratuit: 'Gratuit', suspendu: 'Suspendu', resilie: 'Résilié',
};

export const CLASSE_STATUT_ABO: Record<string, string> = {
  actif: 'badge--success',
  gratuit: 'badge--info',
  suspendu: 'badge--warning',
  resilie: 'badge--neutral',
};

export const LIBELLE_STATUT_ECHEANCE: Record<string, string> = {
  attendue: 'Attendue',
  payee: 'Payée',
  justificatif_manquant: 'Justificatif manquant',
  ecart: 'Écart de montant',
  annulee: 'Annulée',
};

export const CLASSE_STATUT_ECHEANCE: Record<string, string> = {
  attendue: 'badge--neutral',
  payee: 'badge--success',
  justificatif_manquant: 'badge--danger',
  ecart: 'badge--warning',
  annulee: 'badge--neutral',
};

export const LIBELLE_PAYS: Record<string, string> = {
  FR: 'France', UE: 'Union européenne', HORS_UE: 'Hors Union européenne',
};

/** Ramène un montant à son équivalent mensuel, toutes périodicités confondues. */
export function coutMensuel(montant: number, periodicite: string): number {
  if (periodicite === 'trimestriel') return montant / 3;
  if (periodicite === 'annuel') return montant / 12;
  return montant;
}

export function coutAnnuel(montant: number, periodicite: string): number {
  if (periodicite === 'trimestriel') return montant * 4;
  if (periodicite === 'annuel') return montant;
  return montant * 12;
}

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
  depenses?: { numero_piece: string | null; fournisseur: string };
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

export const LIBELLE_RAPPROCHEMENT: Record<string, string> = {
  sans_transaction: 'Sans opération bancaire',
  propose: 'Rapprochement proposé',
  confirme: 'Rapproché',
  sans_objet: 'Sans objet',
};

export const CLASSE_RAPPROCHEMENT: Record<string, string> = {
  sans_transaction: 'badge--warning',
  propose: 'badge--info',
  confirme: 'badge--success',
  sans_objet: 'badge--neutral',
};
