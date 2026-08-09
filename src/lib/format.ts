/**
 * Formatage — centralisé pour que tous les montants et dates de l'application
 * s'affichent de la même façon. Conventions françaises.
 */

const eur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

/** 1234.5 → « 1 234,50 € ». Les négatifs sont entre parenthèses. */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const s = eur.format(Math.abs(value));
  return value < 0 ? `(${s})` : s;
}

/** 0.2 → « 20 % » */
export function percent(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value);
}

/** '2026-07-31' → « 31/07/2026 » */
export function date(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR').format(d);
}

/** '2026-07-31' → « 31 juillet 2026 » */
export function dateLong(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/** Nombre de jours entre aujourd'hui et une échéance. Négatif = dépassée. */
export function daysUntil(value: string | Date): number {
  const d = typeof value === 'string' ? new Date(value) : value;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Lit un montant saisi à la française.
 *
 * L'application faisait partout `parseFloat(saisie.replace(',', '.'))`.
 * Deux défauts s'y cumulaient :
 *
 *   — `String.replace` avec une chaîne ne remplace que la PREMIÈRE
 *     occurrence ;
 *   — `parseFloat` s'arrête au premier caractère invalide au lieu de
 *     refuser.
 *
 * D'où, en silence :
 *
 *   « 1 234,56 »  → parseFloat("1 234.56")  → 1
 *   « 1.234,56 »  → parseFloat("1.234.56")  → 1.234
 *   « 12€ »       → 12          (toléré, mais par accident)
 *   « abc »       → NaN
 *
 * Un montant de mille euros entrait donc à un euro, franchissait toutes
 * les vérifications — fini, positif, HT + TVA = TTC sur le mauvais
 * nombre — et personne n'était averti.
 *
 * Ici, on nettoie ce qui est décoratif (espaces, y compris insécables,
 * et symbole €), on interprète le séparateur de milliers, puis on REFUSE
 * ce qui reste ambigu. `null` veut dire « je n'ai pas compris » — jamais
 * « zéro », et jamais un nombre inventé.
 */
export function montantSaisi(saisie: string): number | null {
  if (typeof saisie !== 'string') return null;

  // Espace ordinaire, insécable, insécable étroit, et le symbole.
  let s = saisie.replace(/[\s\u00A0\u202F\u2009]/g, '').replace(/€/g, '').trim();
  if (s === '') return null;

  const virgules = (s.match(/,/g) ?? []).length;
  const points   = (s.match(/\./g) ?? []).length;

  if (virgules > 1) return null;                 // « 1,234,56 » : indécidable

  if (virgules === 1 && points > 0) {
    // Les deux séparateurs : le dernier est le décimal.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');   // 1.234,56
    } else {
      s = s.replace(/,/g, '');                      // 1,234.56
    }
  } else if (virgules === 1) {
    s = s.replace(',', '.');                        // 1234,56
  } else if (points > 1) {
    s = s.replace(/\./g, '');                       // 1.234.567
  }
  // Un seul point : on le garde tel quel — « 1234.56 » est décimal.

  // Après nettoyage, seuls un signe, des chiffres et un point sont admis.
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;

  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/**
 * Variante pour les montants qui ne peuvent pas être négatifs — le cas
 * de toutes les saisies de l'application, un avoir se signalant par sa
 * nature et non par un signe moins.
 */
export function montantPositif(saisie: string): number | null {
  const v = montantSaisi(saisie);
  return v !== null && v >= 0 ? v : null;
}
