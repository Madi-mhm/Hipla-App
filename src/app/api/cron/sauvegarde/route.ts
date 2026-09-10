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
import { cronAutorise } from '@/lib/cron';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Les tables ne sont plus énumérées ici.
 *
 * Cette liste comptait 23 entrées quand la base en avait 42. Manquaient
 * `pieces`, `pieces_lignes`, `reglements`, `tiers`, `immobilisations`,
 * `declarations_tva` — tout le registre. Elle nommait encore `depenses`
 * et `frais_creation`, vidées par la bascule. Le cron écrivait
 * « réussie » et archivait à peu près rien de ce qui compte.
 *
 * Une liste qui a dérivé une fois dérivera encore. La base énumère
 * désormais ses propres tables (`tables_publiques`, migration 085).
 */

/** Lignes lues par requête. PostgREST plafonne les réponses : sans
 *  pagination, une table dépassant le plafond était tronquée en
 *  silence, et la sauvegarde s'en déclarait satisfaite. */
const LOT = 1000;

/** Dumps hebdomadaires conservés, en semaines. Les dumps du 1er du mois sont gardés. */
const RETENTION_SEMAINES = 12;

/**
 * Lit une table ENTIÈRE, par lots, et vérifie le compte.
 *
 * `select('*')` sans pagination s'arrête au plafond de PostgREST — mille
 * lignes par défaut. `audit` le franchira dans l'année. La sauvegarde
 * aurait continué à se déclarer réussie sur un dump amputé, ce qui est
 * pire qu'un échec : on aurait cru la copie fidèle.
 *
 * Le compte exact est demandé d'abord ; si la lecture ne le retrouve
 * pas, on lève. Une sauvegarde incomplète doit être une erreur, jamais
 * un succès silencieux.
 */
async function lireTable(
  db: ReturnType<typeof admin>,
  table: string,
): Promise<unknown[]> {
  const { count, error: eCount } = await db
    .from(table).select('*', { count: 'exact', head: true });
  if (eCount) throw new Error(`Comptage de « ${table} » : ${eCount.message}`);

  const attendu = count ?? 0;
  const lignes: unknown[] = [];

  for (let debut = 0; debut < attendu; debut += LOT) {
    const { data, error } = await db
      .from(table).select('*').range(debut, debut + LOT - 1);
    if (error) throw new Error(`Lecture de « ${table} » : ${error.message}`);
    if (!data || data.length === 0) break;
    lignes.push(...data);
  }

  if (lignes.length !== attendu) {
    throw new Error(
      `« ${table} » : ${lignes.length} ligne(s) lue(s) pour ${attendu} attendue(s). ` +
      `Sauvegarde interrompue plutôt qu'incomplète.`
    );
  }

  return lignes;
}

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
  if (!cronAutorise(request.headers.get('authorization'))) {
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

    // La liste vient de la base, pas d'une constante. Toute table créée
    // par une migration future entre dans la sauvegarde sans que
    // personne ait à y penser.
    const { data: tables, error: eTables } = await db.rpc('tables_publiques');
    if (eTables) throw new Error(`Énumération des tables : ${eTables.message}`);

    const nomsTables = (tables as unknown as Array<string | { tables_publiques: string }>)
      .map((t) => (typeof t === 'string' ? t : t.tables_publiques));

    if (nomsTables.length === 0) {
      throw new Error('Aucune table retournée : la migration 085 est-elle appliquée ?');
    }

    const dump: Record<string, { lignes: number; donnees: unknown[] }> = {};
    let lignesTotales = 0;

    for (const table of nomsTables) {
      const donnees = await lireTable(db, table);
      dump[table] = { lignes: donnees.length, donnees };
      lignesTotales += donnees.length;
    }

    // Le schéma : 135 fonctions et 15 vues qui ne figuraient dans aucune
    // sauvegarde. Un dump de lignes sans le schéma qui les fait vivre ne
    // se restaure nulle part.
    const { data: schema, error: eSchema } = await db.rpc('schema_public');
    if (eSchema) throw new Error(`Lecture du schéma : ${eSchema.message}`);

    const contenu = JSON.stringify({
      version: 2,
      genere_le: new Date().toISOString(),
      declencheur,
      schema,
      tables: dump,
      totaux: { tables: nomsTables.length, lignes: lignesTotales },
    }, null, 2);

    const cleDump = `base/${horodatage}.json`;
    await deposer(cleDump, contenu, 'application/json');
    const tailleDump = Buffer.byteLength(contenu, 'utf8');

    // ---------- 2. Copie incrémentale des justificatifs ----------
    const dejaPresents = new Set(
      (await lister('fichiers/')).map((o) => o.cle.replace(/^fichiers\//, ''))
    );

    // Paginé comme le reste : au-delà du plafond, des justificatifs
    // n'auraient jamais été copiés, sans que rien ne le signale.
    const justificatifs = await lireTable(db, 'justificatifs') as Array<{
      chemin: string; nom_original: string; type_mime: string;
    }>;

    let copies = 0, ignores = 0, octets = 0;
    const echecs: string[] = [];

    for (const j of justificatifs) {
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
        total: justificatifs.length,
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
        tables_sauvees: nomsTables.length,
        fichiers_copies: copies,
        fichiers_ignores: ignores,
        octets_copies: octets,
        duree_ms: duree,
        detail: { purges, tables: nomsTables.length,
                  echecs: echecs.length ? echecs : null },
      }).eq('id', idJournal);
    }

    return NextResponse.json({
      succes: true,
      dump: cleDump,
      tables: nomsTables.length,
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
