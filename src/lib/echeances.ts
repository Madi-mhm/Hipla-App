/**
 * Échéances déclaratives de l'exercice.
 *
 * Isolées de `actions.ts` : ce dernier importe le client Supabase serveur,
 * et tout composant client qui s'y réfère entraînerait `next/headers` dans
 * le paquet du navigateur. Ce fichier ne contient que des données.
 *
 * Passeront en base à la ronde 10.
 */

export type Echeance = {
  libelle: string;
  date: string;
  nature?: 'tva' | 'is' | 'cfe' | 'juridique';
};

export const ECHEANCES: Echeance[] = [
  { libelle: 'Déclaration initiale CFE (formulaire 1447-C)', date: '2026-12-31', nature: 'cfe' },
  { libelle: 'Clôture du premier exercice', date: '2027-09-30', nature: 'juridique' },
  { libelle: 'Déclaration de TVA CA12E', date: '2027-12-31', nature: 'tva' },
  { libelle: 'Liasse fiscale (2065)', date: '2027-12-31', nature: 'is' },
];
