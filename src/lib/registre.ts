/**
 * TYPES DU REGISTRE
 *
 * Fichier sans aucun import : il est lu des deux côtés de la frontière
 * serveur / client. C'est la règle née du bug où un composant
 * `'use client'` importait une constante depuis `actions.ts`, lequel
 * entraînait `next/headers` dans le paquet du navigateur.
 *
 * `types.ts` n'est pas modifié : il décrit les tables historiques, qui
 * existent encore. Les deux cohabiteront le temps de la bascule.
 */

export type EtatPiece =
  | 'brouillon' | 'a_valider' | 'rejetee' | 'validee' | 'annulee';

export type NaturePiece =
  | 'achat' | 'vente' | 'avoir' | 'km' | 'creation' | 'banque' | 'paie';

export type Tiers = {
  id: string;
  reference: string | null;
  nom: string;
  type: string;
  est_client: boolean;
  est_fournisseur: boolean;
  contact: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  pays: string;
  siret: string | null;
  tva_intracom: string | null;
  delai_paiement: number;
  actif: boolean;
};

export type LignePiece = {
  id: string;
  piece_id: string;
  ordre: number;
  prestation_id: string | null;
  libelle: string;
  description: string | null;
  quantite: number;
  unite: string | null;
  prix_unitaire_ht: number;
  taux_tva: number;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
};

export type Piece = {
  id: string;
  numero_piece: string | null;
  nature: NaturePiece;
  sens: 'debit' | 'credit';
  origine: string;

  date_piece: string;
  tiers_id: string | null;
  tiers_libelle: string;
  objet: string | null;

  montant_ht: number;
  taux_tva: number;
  montant_tva: number;
  montant_ttc: number;
  tva_comptable: number;
  acomptes_deduits: number;
  net_a_payer: number;
  montant_regle: number;

  etat: EtatPiece;
  paye_le: string | null;
  moyen_paiement: string | null;
  date_echeance: string | null;
  delai_paiement: number;

  date_prestation: string | null;
  periode_debut: string | null;
  periode_fin: string | null;

  attendu_en_banque: boolean;
  transaction_id: string | null;
  piece_liee_id: string | null;
  mentions_gelees: Record<string, unknown> | null;

  motif_rejet: string | null;
  motif_annulation: string | null;
  annule_le: string | null;
  notes: string | null;
  cree_le: string;
};

export type Reglement = {
  id: string;
  piece_id: string;
  date_reglement: string;
  montant: number;
  moyen: string | null;
  transaction_id: string | null;
  reference: string | null;
};

/**
 * Statut d'affichage d'une vente.
 *
 * Il n'est PAS stocké : « impayée » est une comparaison entre l'échéance
 * et le montant réglé, « partielle » entre le réglé et le dû. Les
 * calculer ici garantit qu'aucun balayage nocturne n'a à les réparer.
 */
export type StatutVente =
  | 'brouillon' | 'emise' | 'partielle' | 'encaissee' | 'impayee' | 'annulee';

export function statutVente(p: {
  etat: string;
  montant_regle: number | string;
  net_a_payer: number | string;
  date_echeance: string | null;
}): StatutVente {
  if (p.etat === 'brouillon') return 'brouillon';
  if (p.etat === 'annulee') return 'annulee';

  const regle = Number(p.montant_regle);
  const du = Number(p.net_a_payer);

  if (du > 0 && regle >= du - 0.005) return 'encaissee';
  if (regle > 0.005) return 'partielle';

  if (p.date_echeance) {
    const echeance = new Date(p.date_echeance);
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    if (echeance < aujourdhui) return 'impayee';
  }
  return 'emise';
}

/** Nature d'affichage, reconstituée depuis la nature et l'origine. */
export function natureVente(p: { nature: string; origine: string }): string {
  if (p.nature === 'avoir') return 'avoir';
  if (p.origine === 'acompte' || p.origine === 'solde') return p.origine;
  return 'facture';
}

/** Statut de saisie, dans le vocabulaire des anciens écrans. */
export function statutSaisie(etat: string): string {
  switch (etat) {
    case 'validee': return 'validee';
    case 'rejetee': return 'rejetee';
    case 'annulee': return 'annulee';
    default:        return 'en_attente';
  }
}

/**
 * État bancaire d'une pièce.
 *
 * Ce n'est pas un statut stocké mais la lecture de deux faits : une
 * opération est-elle rattachée, et en attend-on une ? Une avance
 * d'associé n'en attend aucune — la compter comme manquante était le
 * faux positif qui masquait les vraies anomalies.
 */
export function etatBancaire(p: {
  transaction_id: string | null;
  attendu_en_banque: boolean;
}): string {
  if (p.transaction_id) return 'confirme';
  if (!p.attendu_en_banque) return 'sans_objet';
  return 'sans_transaction';
}

/** Candidat au rapprochement, tel que le renvoie le moteur. */
export type Candidat = {
  transaction_id: string;
  numero_piece: string | null;
  date_operation: string;
  montant: number;
  libelle: string;
  score: number;
  decision: 'automatique' | 'propose' | 'incertain' | 'ecarte';
  motifs: string[];
};
