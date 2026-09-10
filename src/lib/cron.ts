import { timingSafeEqual } from 'node:crypto';

/**
 * Autorisation des appels du cron Vercel.
 *
 * Vercel envoie `Authorization: Bearer <CRON_SECRET>`. Sans CRON_SECRET
 * défini, tout est refusé : l'ancienne vérification laissait passer
 * n'importe quel appel dans ce cas.
 */
export function cronAutorise(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorization) return false;
  const attendu = Buffer.from(`Bearer ${secret}`);
  const recu = Buffer.from(authorization);
  return attendu.length === recu.length && timingSafeEqual(attendu, recu);
}
