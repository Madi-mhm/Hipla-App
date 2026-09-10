/**
 * Dates au format AAAA-MM-JJ, toujours au jour de Paris.
 *
 * `new Date().toISOString().slice(0, 10)` donne la date UTC : entre
 * minuit et 2 h à Paris, c'était encore la veille.
 */

/** La date du jour à Paris. */
export function aujourdhuiIso(): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

/** Le jour d'un objet Date construit en heure locale (1er du mois, fin de mois…). */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Le jour de Paris d'un horodatage ISO, par exemple `settled_at` chez Qonto. */
export function dateParis(horodatage: string): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(horodatage));
}
