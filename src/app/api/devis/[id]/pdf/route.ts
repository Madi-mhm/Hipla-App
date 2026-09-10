/**
 * PDF D'UN DEVIS
 *
 * Même rendu que la facture : le gabarit et l'adaptateur reconnaissent
 * un devis et adaptent l'intitulé, la date affichée et le bloc bancaire.
 * Cette adresse est conservée pour les liens existants.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export { GET } from '@/app/api/factures/[id]/pdf/route';
