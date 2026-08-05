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
  statut: 'en_attente' | 'validee' | 'rejetee';
  cree_par: string;
  cree_le: string;
  valide_par: string | null;
  valide_le: string | null;
  motif_rejet: string | null;
  notes: string | null;
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
  date_trajet: string;
  vehicule_id: string;
  depart: string;
  arrivee: string;
  motif: string;
  kilometres: number;
  aller_retour: boolean;
  statut: 'en_attente' | 'validee' | 'rejetee';
  cree_par: string;
  cree_le: string;
  vehicules?: Vehicule;
  profils?: { nom_complet: string };
};

export const LIBELLE_STATUT: Record<string, string> = {
  en_attente: 'En attente',
  validee: 'Validée',
  rejetee: 'Rejetée',
};

export const CLASSE_STATUT: Record<string, string> = {
  en_attente: 'badge--warning',
  validee: 'badge--success',
  rejetee: 'badge--danger',
};

export type FraisCreation = {
  id: string;
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
