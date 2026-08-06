/**
 * SAUVEGARDE VERS CLOUDFLARE R2
 *
 * Déclenchée par le cron Vercel (dimanche et mercredi, 03 h 00) ou
 * manuellement depuis la page Supervision.
 *
 * Deux opérations :
 *   1. Export complet de la base en un fichier JSON horodaté
 *   2. Copie INCRÉMENTALE des justificatifs : seuls les fichiers absents
 *      de R2 sont transférés. Un fichier supprimé côté Supabase reste
 *      dans l'archive — c'est délibéré, l'obligation de conservation est
 *      de dix ans.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { deposer, lister, supprimer, r2Configure } from '@/lib/r2';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Tables sauvegardées, dans l'ordre des dépendances. */
const TABLES = [
  'entreprise', 'exercices', 'profils', 'permissions',
  'categories', 'vehicules', 'bareme_km',
  'depenses', 'justificatifs', 'deplacements', 'frais_creation',
  'abonnements', 'abonnement_echeances', 'commentaires', 'taches',
  'sauvegardes', 'audit',
] as const;

/** Dumps hebdomadaires conservés, en semaines. Les dumps du 1er du mois sont gardés. */
const RETENTION_SEMAINES = 12;

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY absente. La sauvegarde doit lire toutes les " +
      "tables en contournant les politiques RLS."
    );
  }
  return createClient(url, cle, { auth: { persistSession: false } });
}

export async function GET(request: NextRequest) {
  // Le cron Vercel envoie CRON_SECRET ; le déclenchement manuel passe par POST.
  const attendu = process.env.CRON_SECRET;
  const recu = request.headers.get('authorization');
  if (attendu && recu !== `Bearer ${attendu}`) {
    return NextResponse.json({ erreur: 'Non autorisé' }, { status: 401 });
  }
  return executer('cron', null);
}

export async function POST(request: NextRequest) {
  // Déclenchement manuel : l'appelant doit être authentifié et propriétaire.
  const { createClient: createServeur } = await import('@/lib/supabase/server');
  const supabase = await createServeur();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: 'Non authentifié' }, { status: 401 });

  const { data: profil } = await supabase
    .from('profils').select('role').eq('id', user.id).single();
  if (profil?.role !== 'proprietaire') {
    return NextResponse.json({ erreur: 'Réservé au propriétaire' }, { status: 403 });
  }

  return executer('manuel', user.id);
}

async function executer(declencheur: 'cron' | 'manuel', utilisateur: string | null) {
  const debut = Date.now();

  if (!r2Configure()) {
    return NextResponse.json(
      { erreur: "Identifiants R2 absents dans les variables d'environnement." },
      { status: 500 }
    );
  }

  const db = admin();

  // Ouvre la ligne de journal immédiatement : si la sauvegarde échoue,
  // la trace de la tentative subsiste.
  const { data: journal } = await db
    .from('sauvegardes')
    .insert({ declencheur, statut: 'en_cours', lance_par: utilisateur })
    .select('id')
    .single();
  const idJournal = journal?.id as string | undefined;

  try {
    // ---------- 0. Entretien des échéances d'abonnement ----------
    // Profite du passage du cron : l'horizon glissant est maintenu et
    // les justificatifs manquants sont marqués.
    await db.rpc('generer_echeances');
    await db.rpc('marquer_justificatifs_manquants');

    // ---------- 1. Export de la base ----------
    const horodatage = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dump: Record<string, { lignes: number; donnees: unknown[] }> = {};
    let lignesTotales = 0;

    for (const table of TABLES) {
      const { data, error } = await db.from(table).select('*');
      if (error) throw new Error(`Lecture de « ${table} » : ${error.message}`);
      dump[table] = { lignes: data?.length ?? 0, donnees: data ?? [] };
      lignesTotales += data?.length ?? 0;
    }

    const contenu = JSON.stringify({
      version: 1,
      genere_le: new Date().toISOString(),
      declencheur,
      tables: dump,
      totaux: { tables: TABLES.length, lignes: lignesTotales },
    }, null, 2);

    const cleDump = `base/${horodatage}.json`;
    await deposer(cleDump, contenu, 'application/json');
    const tailleDump = Buffer.byteLength(contenu, 'utf8');

    // ---------- 2. Copie incrémentale des justificatifs ----------
    const dejaPresents = new Set(
      (await lister('fichiers/')).map((o) => o.cle.replace(/^fichiers\//, ''))
    );

    const { data: justificatifs } = await db
      .from('justificatifs')
      .select('chemin, nom_original, type_mime');

    let copies = 0, ignores = 0, octets = 0;
    const echecs: string[] = [];

    for (const j of justificatifs ?? []) {
      if (dejaPresents.has(j.chemin)) { ignores += 1; continue; }

      const { data: blob, error } = await db.storage
        .from('justificatifs').download(j.chemin);

      if (error || !blob) {
        echecs.push(`${j.chemin} : ${error?.message ?? 'fichier introuvable'}`);
        continue;
      }

      const buffer = Buffer.from(await blob.arrayBuffer());
      await deposer(`fichiers/${j.chemin}`, buffer, j.type_mime);
      copies += 1;
      octets += buffer.byteLength;
    }

    // ---------- 3. Manifeste ----------
    const manifeste = {
      date: new Date().toISOString(),
      declencheur,
      dump: { cle: cleDump, octets: tailleDump, lignes: lignesTotales },
      tables: Object.fromEntries(
        Object.entries(dump).map(([t, v]) => [t, v.lignes])
      ),
      fichiers: {
        total: justificatifs?.length ?? 0,
        copies, ignores, octets,
        echecs: echecs.length ? echecs : undefined,
      },
    };
    await deposer(
      `manifestes/${horodatage.slice(0, 10)}.json`,
      JSON.stringify(manifeste, null, 2),
      'application/json'
    );

    // ---------- 4. Purge des dumps hebdomadaires anciens ----------
    // Les dumps du 1er du mois sont conservés indéfiniment.
    const limite = Date.now() - RETENTION_SEMAINES * 7 * 86_400_000;
    let purges = 0;
    for (const o of await lister('base/')) {
      if (o.modifie.getTime() >= limite) continue;
      if (o.modifie.getDate() === 1) continue;
      await supprimer(o.cle);
      purges += 1;
    }

    const duree = Date.now() - debut;

    if (idJournal) {
      await db.from('sauvegardes').update({
        terminee_le: new Date().toISOString(),
        statut: 'reussie',
        chemin_dump: cleDump,
        taille_dump: tailleDump,
        lignes_totales: lignesTotales,
        tables_sauvees: TABLES.length,
        fichiers_copies: copies,
        fichiers_ignores: ignores,
        octets_copies: octets,
        duree_ms: duree,
        detail: { purges, echecs: echecs.length ? echecs : null },
      }).eq('id', idJournal);
    }

    return NextResponse.json({
      succes: true,
      dump: cleDump,
      lignes: lignesTotales,
      fichiers: { copies, ignores },
      purges,
      duree_ms: duree,
      avertissements: echecs.length ? echecs : undefined,
    });

  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue';
    if (idJournal) {
      await db.from('sauvegardes').update({
        terminee_le: new Date().toISOString(),
        statut: 'echouee',
        erreur: message,
        duree_ms: Date.now() - debut,
      }).eq('id', idJournal);
    }
    return NextResponse.json({ succes: false, erreur: message }, { status: 500 });
  }
}
