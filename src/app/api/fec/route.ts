/**
 * EXPORT DU FICHIER DES ÉCRITURES COMPTABLES
 *
 * Format imposé par l'arrêté du 29 juillet 2013 : dix-huit champs dans
 * un ordre fixe, séparés par des tabulations, dates en AAAAMMJJ,
 * décimales à la virgule.
 *
 * Le nom du fichier obéit lui aussi à une règle :
 * SIRENFECAAAAMMJJ, où la date est celle de la clôture. Un nom
 * fantaisiste suffit à faire rejeter la remise.
 *
 * L'export refuse de produire un fichier déséquilibré. Un FEC dont le
 * débit ne solde pas le crédit est rejeté par l'administration, et il
 * vaut mieux l'apprendre ici que là-bas.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Ligne = {
  journal_code: string; journal_lib: string;
  ecriture_num: string; ecriture_date: string;
  compte_num: string; compte_lib: string;
  comp_aux_num: string | null; comp_aux_lib: string | null;
  piece_ref: string; piece_date: string;
  ecriture_lib: string;
  debit: number; credit: number;
  valid_date: string; ordre: number;
};

/** AAAAMMJJ, sans séparateur : le format exigé. */
function jour(v: string | null): string {
  if (!v) return '';
  return v.slice(0, 10).replace(/-/g, '');
}

/** Décimale à la virgule, deux chiffres, jamais de séparateur de milliers. */
function montant(v: number | null): string {
  return Number(v ?? 0).toFixed(2).replace('.', ',');
}

/**
 * La tabulation sépare les champs : elle ne peut donc pas y figurer.
 * Les retours à la ligne non plus.
 */
function champ(v: string | null): string {
  if (!v) return '';
  return v.replace(/[\t\r\n]+/g, ' ').trim();
}

export async function GET(requete: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: 'Non authentifié' }, { status: 401 });

  const { data: profil } = await supabase
    .from('profils').select('role').eq('id', user.id).single();
  if (!profil || !['proprietaire', 'comptable'].includes(profil.role)) {
    return NextResponse.json({ erreur: 'Réservé au propriétaire et au comptable' },
      { status: 403 });
  }

  // Période : l'exercice en cours par défaut.
  const params = requete.nextUrl.searchParams;
  let debut = params.get('debut');
  let fin = params.get('fin');

  if (!debut || !fin) {
    // L'exercice EN COURS, pas le plus récent : les exercices à venir
    // sont déjà déclarés en base, et viser le dernier revenait à
    // interroger une période où rien n'existe encore.
    const aujourdhui = new Date().toISOString().slice(0, 10);

    const { data: courant } = await supabase
      .from('exercices').select('date_debut, date_fin')
      .lte('date_debut', aujourdhui)
      .gte('date_fin', aujourdhui)
      .limit(1).maybeSingle();

    // À défaut — la date du jour tombe hors de tout exercice déclaré —
    // le dernier exercice commencé.
    const { data: dernier } = courant ? { data: null } : await supabase
      .from('exercices').select('date_debut, date_fin')
      .lte('date_debut', aujourdhui)
      .order('date_debut', { ascending: false })
      .limit(1).maybeSingle();

    const exercice = courant ?? dernier;
    if (!exercice) {
      return NextResponse.json(
        { erreur: 'Aucun exercice déclaré. Réglages → Entreprise.' }, { status: 422 });
    }
    debut = exercice.date_debut;
    fin = exercice.date_fin;
  }

  // ---- L'équilibre avant tout ----
  const { data: controle } = await supabase.rpc('controle_fec', {
    p_debut: debut, p_fin: fin,
  });
  const c = controle as { equilibre?: boolean; ecart?: number; lignes?: number } | null;

  if (!c || c.lignes === 0) {
    return NextResponse.json(
      { erreur: 'Aucune écriture sur cette période.' }, { status: 422 });
  }
  if (!c.equilibre) {
    return NextResponse.json({
      erreur: `Le fichier est déséquilibré de ${c.ecart} €. `
            + 'Un FEC dont le débit ne solde pas le crédit est rejeté par '
            + 'l\u2019administration : corrigez avant de remettre.',
    }, { status: 422 });
  }

  const { data, error } = await supabase.rpc('lignes_fec', {
    p_debut: debut, p_fin: fin,
  });
  if (error) {
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  const lignes = (data ?? []) as Ligne[];

  // Ordre de lecture : journal, date, écriture, puis rang dans l'écriture.
  lignes.sort((a, b) =>
    a.journal_code.localeCompare(b.journal_code)
    || a.ecriture_date.localeCompare(b.ecriture_date)
    || a.ecriture_num.localeCompare(b.ecriture_num)
    || a.ordre - b.ordre
  );

  // ---- Les dix-huit champs, dans l'ordre imposé ----
  const entete = [
    'JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate',
    'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib',
    'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit',
    'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise',
  ].join('\t');

  const corps = lignes.map((l) => [
    champ(l.journal_code),
    champ(l.journal_lib),
    champ(l.ecriture_num),
    jour(l.ecriture_date),
    champ(l.compte_num),
    champ(l.compte_lib),
    champ(l.comp_aux_num),
    champ(l.comp_aux_lib),
    champ(l.piece_ref),
    jour(l.piece_date),
    champ(l.ecriture_lib),
    montant(l.debit),
    montant(l.credit),
    '',                      // EcritureLet — lettrage non pratiqué
    '',                      // DateLet
    jour(l.valid_date),
    '',                      // Montantdevise — tout est en euros
    '',                      // Idevise
  ].join('\t'));

  const contenu = [entete, ...corps].join('\r\n') + '\r\n';

  const { data: entreprise } = await supabase
    .from('entreprise').select('siren').single();
  const siren = (entreprise?.siren ?? '000000000').replace(/\s/g, '');
  const nom = `${siren}FEC${jour(fin)}.txt`;

  return new NextResponse(contenu, {
    status: 200,
    headers: {
      // UTF-8 est admis, et évite les mutilations d'accents que
      // l'ISO-8859-15 provoque sur les libellés de tiers.
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nom}"`,
      'Cache-Control': 'no-store',
    },
  });
}
