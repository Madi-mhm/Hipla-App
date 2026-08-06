/**
 * Génération des exports CSV et JSON.
 *
 * Le CSV suit les conventions françaises : séparateur point-virgule,
 * décimale virgule, encodage UTF-8 avec BOM. Sans cela, Excel en
 * configuration française affiche tout dans une seule colonne et
 * interprète mal les nombres.
 */

export type Colonne<T> = {
  entete: string;
  valeur: (ligne: T) => string | number | null | undefined;
};

const SEPARATEUR = ';';
const BOM = '\uFEFF';

function echapper(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Les nombres passent en décimale française
  if (typeof v === 'number') s = s.replace('.', ',');
  if (s.includes(SEPARATEUR) || s.includes('"') || s.includes('\n')) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function versCSV<T>(lignes: T[], colonnes: Colonne<T>[]): string {
  const entetes = colonnes.map((c) => echapper(c.entete)).join(SEPARATEUR);
  const corps = lignes.map((l) =>
    colonnes.map((c) => echapper(c.valeur(l))).join(SEPARATEUR)
  );
  return BOM + [entetes, ...corps].join('\r\n');
}

/**
 * Sérialisation JSON.
 *
 * Le paramètre est volontairement `unknown[]` et non générique : l'appelant
 * manipule une union de types de lignes, et un générique obligerait
 * TypeScript à en choisir un seul. La fonction ne fait que sérialiser,
 * elle n'a besoin d'aucune information sur la forme des données.
 */
export function versJSON(lignes: unknown[]): string {
  return JSON.stringify(lignes, null, 2);
}

/** Déclenche le téléchargement dans le navigateur. */
export function telecharger(contenu: string, nom: string, typeMime: string) {
  const blob = new Blob([contenu], { type: `${typeMime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.click();
  URL.revokeObjectURL(url);
}

/** Date au format JJ/MM/AAAA, attendu par Excel FR. */
export function dateFR(v: string | null | undefined): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR');
}

/** Poids lisible : 262144 → « 256 Ko » */
export function poidsLisible(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 ** 2) return `${(octets / 1024).toFixed(0)} Ko`;
  if (octets < 1024 ** 3) return `${(octets / 1024 ** 2).toFixed(1)} Mo`;
  return `${(octets / 1024 ** 3).toFixed(2)} Go`;
}
