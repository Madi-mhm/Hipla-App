/**
 * JOURNAL D'AUDIT — construction et lecture des détails.
 *
 * Une ligne d'audit ne vaut que par ce qu'elle permet de reconstituer.
 * « modification sur depenses » ne dit rien ; « fournisseur Temu, montant
 * porté de 103,57 € à 98,40 € » permet de comprendre et, si besoin, de
 * revenir en arrière.
 *
 * Les modifications enregistrent donc l'avant et l'après champ par champ,
 * les suppressions conservent l'enregistrement complet.
 */

export type Details = Record<string, unknown> | null;

/** Champs jamais journalisés : sans intérêt ou porteurs de données sensibles. */
const IGNORES = new Set([
  'id', 'cree_le', 'modifie_le', 'cree_par', 'valide_par', 'valide_le',
]);

/** Libellés lisibles pour l'affichage. */
export const LIBELLE_CHAMP: Record<string, string> = {
  numero_piece: 'Numéro de pièce',
  numero_facture_fournisseur: 'N° de facture du fournisseur',
  siret_fournisseur: 'SIRET du fournisseur',
  tva_fournisseur: 'N° TVA du fournisseur',
  extrait_par_ia: 'Extrait automatiquement',
  confiance: 'Indice de confiance',
  confiance_extraction: 'Indice de confiance',
  periodicite: 'Périodicité',
  autoliquidation: 'TVA autoliquidée',
  pays_prestataire: 'Pays du prestataire',
  engagement_jusquau: 'Engagement jusqu\'au',
  preavis_jours: 'Préavis (jours)',
  montant_prevu: 'Montant prévu',
  montant_reel: 'Montant constaté',
  date_effet: 'Date d\'effet',
  motif_annulation: 'Motif d\'annulation',
  motif_resiliation: 'Motif de résiliation',
  echeances_supprimees: 'Échéances retirées',
  justificatifs: 'Justificatifs joints',
  abonnement: 'Abonnement',
  piece: 'Pièce concernée',
  reponse: 'Réponse apportée',
  format: 'Format',
  sens: 'Sens',
  contrepartie: 'Contrepartie',
  statut_traitement: 'Traitement',
  rattachement_auto: 'Rattachement automatique',
  paye_le: 'Payé le',
  transaction_qonto_id: 'Opération bancaire',
  statut_rapprochement: 'Rapprochement',
  transaction_proposee_id: 'Opération proposée',
  recherche_auto: 'Recherche automatique',
  motif_ecart: 'Motif de mise à l\'écart',
  lignes: 'Lignes',
  du: 'Du',
  au: 'Au',
  date_depense: 'Date',
  date_engagement: 'Date',
  date_trajet: 'Date',
  fournisseur: 'Fournisseur',
  libelle: 'Description',
  categorie_id: 'Catégorie',
  montant_ht: 'Montant HT',
  montant_tva: 'Montant TVA',
  montant_ttc: 'Montant TTC',
  taux_tva: 'Taux de TVA',
  tva_deductible: 'TVA déductible',
  taux_deductibilite: 'Taux de déductibilité',
  compte: 'Compte',
  moyen_paiement: 'Moyen de paiement',
  paye_par: 'Payé par',
  statut: 'Statut',
  statut_reprise: 'Statut de reprise',
  associe_payeur: 'Avancé par',
  mode_reprise: 'Mode de reprise',
  notes: 'Notes',
  motif: 'Motif',
  depart: 'Départ',
  arrivee: 'Arrivée',
  kilometres: 'Kilomètres',
  aller_retour: 'Aller-retour',
  vehicule_id: 'Véhicule',
};

export const LIBELLE_ACTION: Record<string, string> = {
  connexion: 'Connexion',
  deconnexion: 'Déconnexion',
  creation: 'Création',
  modification: 'Modification',
  suppression: 'Suppression',
  validation: 'Validation',
  rejet: 'Rejet',
  ratification: 'Ratification',
  export: 'Export',
  sauvegarde: 'Sauvegarde',
  extraction: 'Extraction',
  resiliation: 'Résiliation',
  annulation: 'Annulation',
};

export const LIBELLE_TABLE: Record<string, string> = {
  depenses: 'Dépense',
  frais_creation: 'Frais de création',
  deplacements: 'Déplacement',
  abonnements: 'Abonnement',
  abonnement_echeances: 'Échéance d\'abonnement',
  commentaires: 'Signalement',
  taches: 'Tâche',
  justificatifs: 'Justificatif',
  categories: 'Catégorie',
  vehicules: 'Véhicule',
  entreprise: 'Entreprise',
  profils: 'Utilisateur',
  sauvegardes: 'Sauvegarde',
  usage_ia: 'Extraction IA',
  transactions_qonto: 'Opération bancaire',
  libelles_bancaires: 'Libellé bancaire',
  synchronisations: 'Synchronisation',
};

export const CLASSE_ACTION: Record<string, string> = {
  creation: 'badge--success',
  validation: 'badge--success',
  ratification: 'badge--success',
  modification: 'badge--warning',
  rejet: 'badge--warning',
  suppression: 'badge--danger',
  export: 'badge--info',
  connexion: 'badge--neutral',
  deconnexion: 'badge--neutral',
  sauvegarde: 'badge--info',
  extraction: 'badge--info',
  resiliation: 'badge--warning',
  annulation: 'badge--danger',
};

/**
 * Détails d'une création : les champs significatifs de l'enregistrement.
 */
export function detailsCreation(
  enregistrement: Record<string, unknown>,
  resume?: string
): Details {
  const champs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(enregistrement)) {
    if (IGNORES.has(k) || v === null || v === undefined || v === '') continue;
    champs[k] = v;
  }
  return { type: 'creation', resume, champs };
}

/**
 * Détails d'une modification : uniquement les champs qui ont réellement
 * changé, avec leur valeur avant et après.
 */
export function detailsModification(
  avant: Record<string, unknown>,
  apres: Record<string, unknown>,
  resume?: string
): Details {
  const changements: Record<string, { avant: unknown; apres: unknown }> = {};

  for (const [k, nouvelle] of Object.entries(apres)) {
    if (IGNORES.has(k)) continue;
    const ancienne = avant[k];
    // Comparaison souple : les numériques arrivent parfois en chaîne
    if (String(ancienne ?? '') === String(nouvelle ?? '')) continue;
    changements[k] = { avant: ancienne ?? null, apres: nouvelle ?? null };
  }

  if (Object.keys(changements).length === 0) return null;
  return { type: 'modification', resume, changements };
}

/**
 * Détails d'une suppression : l'enregistrement entier est conservé.
 * C'est la seule trace qui subsistera de la ligne effacée.
 */
export function detailsSuppression(
  enregistrement: Record<string, unknown>,
  resume?: string
): Details {
  return { type: 'suppression', resume, enregistrement };
}

/** Met en forme une valeur pour l'affichage dans le journal. */
export function formaterValeur(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',');
  }
  const s = String(v);
  // Date ISO → format français
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [a, m, j] = s.split('-');
    return `${j}/${m}/${a}`;
  }
  // Identifiant technique : inutile à l'écran
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(s)) return s.slice(0, 8) + '…';
  return s.length > 80 ? s.slice(0, 80) + '…' : s;
}

export function libelleChamp(k: string): string {
  return LIBELLE_CHAMP[k] ?? k.replace(/_/g, ' ');
}
