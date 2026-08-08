/**
 * TÉLÉCHARGEMENT D'UN RAPPORT MENSUEL
 *
 * La période arrive sous la forme « 2026-08 ». Les chiffres viennent de
 * `rapport_mensuel`, qui applique les mêmes règles que le tableau de
 * bord — le PDF ne recalcule rien.
 */

import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@/lib/supabase/server';
import { documentRapport, type Rapport } from '@/lib/rapport-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _requete: NextRequest,
  { params }: { params: Promise<{ periode: string }> }
) {
  const { periode } = await params;

  if (!/^\d{4}-\d{2}$/.test(periode)) {
    return NextResponse.json({
      erreur: 'Période invalide. Format attendu : 2026-08.',
    }, { status: 400 });
  }

  const [an, mois] = periode.split('-').map(Number);
  const debut = `${periode}-01`;
  // Le zéro du mois suivant donne le dernier jour du mois courant.
  const fin = new Date(an, mois, 0).toISOString().slice(0, 10);

  const supabase = await createClient();

  const [{ data: rapport, error }, { data: entreprise }] = await Promise.all([
    supabase.rpc('rapport_mensuel', { p_debut: debut, p_fin: fin }),
    supabase.rpc('mentions_entreprise'),
  ]);

  if (error || !rapport) {
    return NextResponse.json({
      erreur: error?.message ?? 'Rapport indisponible.',
    }, { status: 422 });
  }

  const e = (entreprise ?? {}) as Record<string, string>;

  try {
    const pdf = await renderToBuffer(
      documentRapport(rapport as Rapport, {
        nom: e.raison_sociale ?? e.nom ?? 'Hipla Services',
        siret: e.siret ?? '',
        mentions: e.mentions_pied ?? e.pied_de_page ?? '',
      })
    );

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="rapport-${periode}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e2) {
    return NextResponse.json({
      erreur: e2 instanceof Error ? `Rendu impossible — ${e2.message}` : 'Rendu impossible.',
    }, { status: 500 });
  }
}
