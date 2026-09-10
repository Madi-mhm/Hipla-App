/**
 * La date du jour à Paris, au format AAAA-MM-JJ.
 *
 * `new Date().toISOString().slice(0, 10)` donne la date UTC : entre
 * minuit et 2 h à Paris, c'était encore la veille.
 */
export function aujourdhuiIso(): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}
