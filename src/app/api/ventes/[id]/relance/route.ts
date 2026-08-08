/**
 * TÉLÉCHARGEMENT D'UNE RELANCE
 *
 * Même principe que le PDF de facture : rendu au serveur, lecture par le
 * client de session pour que les politiques RLS s'appliquent, aucun
 * stockage.
 *
 * Le degré — rappel, relance, mise en demeure — n'est pas choisi mais
 * déduit du retard. Envoyer une mise en demeure pour trois jours de
 * retard coûte un client ; envoyer un rappel poli après trois mois coûte
 * une créance.
 */

import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { chargerModeleRelance } from '@/lib/relance-adaptateur';
import { documentRelance } from '@/lib/relance-pdf';
import { nomFichierRelance } from '@/lib/relance-modele';

// Le rendu PDF exige Node : il n'est pas compatible avec l'exécution Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const resultat = await chargerModeleRelance(id);

  if ('erreur' in resultat) {
    // Un message lisible, pas une trace technique.
    return NextResponse.json({ erreur: resultat.erreur }, { status: 422 });
  }

  try {
    const pdf = await renderToBuffer(documentRelance(resultat.modele));

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          `attachment; filename="${nomFichierRelance(resultat.modele)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json({
      erreur: e instanceof Error
        ? `Rendu impossible — ${e.message}`
        : 'Rendu impossible.',
    }, { status: 500 });
  }
}
