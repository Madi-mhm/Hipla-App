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
