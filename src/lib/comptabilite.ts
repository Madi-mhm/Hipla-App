/**
 * Règles de calcul comptable.
 * Centralisées ici pour qu'il n'existe qu'un seul endroit à vérifier
 * — et à corriger — si une règle fiscale évolue.
 */

export const TAUX_TVA = [
  { valeur: 20, libelle: '20 % — taux normal' },
  { valeur: 10, libelle: '10 % — taux réduit' },
  { valeur: 5.5, libelle: '5,5 % — taux réduit' },
  { valeur: 2.1, libelle: '2,1 % — taux particulier' },
  { valeur: 0, libelle: '0 % — non soumis à TVA' },
];

/** Arrondi comptable au centime. */
export function centimes(v: number): number {
  return Math.round(v * 100) / 100;
}

/** À partir du HT et du taux, déduit la TVA et le TTC. */
export function depuisHT(ht: number, taux: number) {
  const tva = centimes(ht * (taux / 100));
  return { ht: centimes(ht), tva, ttc: centimes(ht + tva) };
}

/** À partir du TTC et du taux, remonte au HT. */
export function depuisTTC(ttc: number, taux: number) {
  const ht = centimes(ttc / (1 + taux / 100));
  return { ht, tva: centimes(ttc - ht), ttc: centimes(ttc) };
}

/**
 * TVA réellement récupérable.
 * Le taux de déductibilité vaut 100, 80 (carburant d'un véhicule de
 * tourisme) ou 0 (véhicule de tourisme, assurances, amendes).
 */
export function tvaRecuperable(montantTva: number, tauxDeductibilite: number): number {
  return centimes(montantTva * (tauxDeductibilite / 100));
}

/** Vérifie la cohérence HT + TVA = TTC, tolérance d'un centime. */
export function montantsCoherents(ht: number, tva: number, ttc: number): boolean {
  return Math.abs(ht + tva - ttc) < 0.02;
}

/**
 * Indemnité kilométrique. Le coefficient dépend du kilométrage ANNUEL
 * cumulé, pas du trajet : c'est la source d'erreur habituelle.
 */
export type LigneBareme = {
  cv_min: number; cv_max: number;
  km_min: number; km_max: number | null;
  coefficient: number; forfait: number;
};

export function indemniteKm(
  kmAnnuels: number,
  cvFiscaux: number,
  bareme: LigneBareme[],
  electrique = false
): number {
  if (kmAnnuels <= 0) return 0;

  const ligne = bareme.find(
    (b) =>
      cvFiscaux >= b.cv_min && cvFiscaux <= b.cv_max &&
      kmAnnuels >= b.km_min && (b.km_max === null || kmAnnuels <= b.km_max)
  );
  if (!ligne) return 0;

  const montant = kmAnnuels * ligne.coefficient + ligne.forfait;
  return centimes(electrique ? montant * 1.2 : montant);
}

/** Seuil au-delà duquel une acquisition durable relève de l'immobilisation. */
export const SEUIL_IMMOBILISATION = 500;
