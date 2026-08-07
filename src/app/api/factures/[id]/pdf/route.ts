/**
 * TÉLÉCHARGEMENT DU PDF D'UNE FACTURE
 *
 * Le rendu se fait au serveur. La lecture passe par le client Supabase
 * de session : les politiques RLS s'appliquent, et une facture qu'on
 * n'a pas le droit de voir ne se télécharge pas.
 *
 * Le document n'est jamais stocké. Il est reconstruit à chaque demande
 * à partir des mentions gelées à l'émission — ce qui garantit qu'une
 * réimpression dans deux ans redonne exactement l'original.
 */

import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { chargerModeleFacture } from '@/lib/facture-adaptateur';
import { documentFacture } from '@/lib/facture-pdf';
import { nomFichier } from '@/lib/facture-modele';

// Le rendu PDF exige Node : il n'est pas compatible avec l'exécution Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { modele, erreur } = await chargerModeleFacture(id);

  if (erreur || !modele) {
    // Un message lisible, pas une trace technique : l'utilisateur doit
    // savoir quoi corriger.
    return NextResponse.json(
      { erreur: erreur ?? 'Génération impossible.' },
      { status: 422 }
    );
  }

  try {
    const pdf = await renderToBuffer(documentFacture(modele));

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          `attachment; filename="${nomFichier(modele)}"`,
        // Un brouillon change à chaque ligne ajoutée ; une facture émise
        // est figée mais reste peu volumineuse. Aucune mise en cache.
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue';
    return NextResponse.json(
      { erreur: `Le document n'a pas pu être produit : ${message}` },
      { status: 500 }
    );
  }
}
