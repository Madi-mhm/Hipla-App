/**
 * RESTAURATION DEPUIS UNE SAUVEGARDE R2
 *
 * Deux garde-fous, volontairement contraignants :
 *
 *   1. SIMULATION PAR DÉFAUT. Sans `?reel=1`, la route se contente de
 *      lister ce qu'elle écrirait. Une restauration déclenchée par erreur
 *      serait pire que la panne qu'elle prétend réparer.
 *
 *   2. REFUS SUR BASE NON VIDE. Si des écritures existent déjà, la route
 *      s'arrête, sauf `?ecraser=1` fourni explicitement.
 *
 * L'ordre d'insertion respecte les clés étrangères : une dépense ne peut
 * pas être écrite avant sa catégorie.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { lire, lister, r2Configure } from '@/lib/r2';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Ordre imposé par les dépendances entre tables. */
const ORDRE = [
  'entreprise',
  'exercices',
  'categories',
  'vehicules',
  'bareme_km',
  'fournisseurs_connus',
  // Restauré avant les écritures : les numéros de pièce doivent
  // reprendre là où ils s'étaient arrêtés, sans réattribution.
  'compteurs_piece',
  'depenses',
  'frais_creation',
  'deplacements',
  'justificatifs',
  'abonnements',
  'abonnement_echeances',
  'commentaires',
  'taches',
] as const;

/**
 * Tables volontairement exclues :
 *   profils, permissions → liées aux comptes auth, recréées par le trigger
 *   audit               → le journal du nouveau projet doit rester le sien
 *   sauvegardes         → historique propre à chaque installation
 */
const EXCLUES = new Set([
  'profils', 'permissions',   // liés aux comptes du projet cible
  'audit',                    // le journal d'une installation lui appartient
  'sauvegardes',              // historique propre à chaque installation
  'usage_ia',                 // consommation propre à chaque installation
]);

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) throw new Error('SUPABASE_SERVICE_ROLE_KEY absente.');
  return createClient(url, cle, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest) {
  // Réservé au propriétaire, y compris en simulation : le contenu d'une
  // sauvegarde ne doit pas être exposé.
  const { createClient: createServeur } = await import('@/lib/supabase/server');
  const supabase = await createServeur();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: 'Non authentifié' }, { status: 401 });

  const { data: profil } = await supabase
    .from('profils').select('role').eq('id', user.id).single();
  if (profil?.role !== 'proprietaire') {
    return NextResponse.json({ erreur: 'Réservé au propriétaire' }, { status: 403 });
  }

  if (!r2Configure()) {
    return NextResponse.json({ erreur: 'Identifiants R2 absents.' }, { status: 500 });
  }

  const params = request.nextUrl.searchParams;
  const simulation = params.get('reel') !== '1';
  const ecraser = params.get('ecraser') === '1';
  let cleDump = params.get('dump');

  const db = admin();

  try {
    // ---- Choix du dump : le plus récent si aucun n'est précisé ----
    if (!cleDump) {
      const dumps = (await lister('base/'))
        .sort((a, b) => b.modifie.getTime() - a.modifie.getTime());
      if (dumps.length === 0) {
        return NextResponse.json({ erreur: 'Aucune sauvegarde trouvée dans R2.' }, { status: 404 });
      }
      cleDump = dumps[0].cle;
    }

    const brut = await lire(cleDump);
    const sauvegarde = JSON.parse(brut) as {
      version: number;
      genere_le: string;
      tables: Record<string, { lignes: number; donnees: Record<string, unknown>[] }>;
    };

    if (sauvegarde.version !== 1) {
      return NextResponse.json(
        { erreur: `Version de sauvegarde non prise en charge : ${sauvegarde.version}` },
        { status: 400 }
      );
    }

    // ---- Contrôle : la base est-elle vide ? ----
    const occupees: string[] = [];
    for (const table of ORDRE) {
      if (EXCLUES.has(table)) continue;
      const { count } = await db.from(table).select('*', { count: 'exact', head: true });
      if ((count ?? 0) > 0) occupees.push(`${table} (${count})`);
    }

    if (occupees.length > 0 && !ecraser && !simulation) {
      return NextResponse.json({
        erreur: 'La base contient déjà des données.',
        detail: occupees,
        conseil: "Restaurez dans un projet vierge, ou ajoutez ?ecraser=1 en connaissance de cause.",
      }, { status: 409 });
    }

    // ---- Parcours ----
    const rapport: Record<string, { attendu: number; ecrit: number; erreur?: string }> = {};
    let total = 0;

    for (const table of ORDRE) {
      if (EXCLUES.has(table)) continue;
      const bloc = sauvegarde.tables[table];
      if (!bloc || bloc.donnees.length === 0) {
        rapport[table] = { attendu: 0, ecrit: 0 };
        continue;
      }

      if (simulation) {
        rapport[table] = { attendu: bloc.donnees.length, ecrit: 0 };
        total += bloc.donnees.length;
        continue;
      }

      // Les clés étrangères vers profils sont neutralisées : les comptes
      // du projet cible sont différents de ceux de l'origine.
      const lignes = bloc.donnees.map((l) => ({
        ...l,
        cree_par: null,
        valide_par: null,
        modifie_par: null,
        lance_par: null,
      }));

      // Écriture par lots : un insert de plusieurs milliers de lignes
      // dépasse les limites de la passerelle.
      let ecrit = 0;
      let erreur: string | undefined;
      for (let i = 0; i < lignes.length; i += 200) {
        const lot = lignes.slice(i, i + 200);
        const { error } = await db.from(table).upsert(lot, { onConflict: 'id' });
        if (error) { erreur = error.message; break; }
        ecrit += lot.length;
      }

      rapport[table] = { attendu: bloc.donnees.length, ecrit, erreur };
      total += ecrit;
    }

    return NextResponse.json({
      succes: true,
      mode: simulation ? 'simulation' : 'reel',
      dump: cleDump,
      genere_le: sauvegarde.genere_le,
      base_occupee: occupees.length > 0 ? occupees : null,
      tables: rapport,
      total,
      note: simulation
        ? "Simulation : aucune écriture. Ajoutez ?reel=1 pour appliquer."
        : "Restauration appliquée. Les justificatifs doivent être recopiés depuis R2 vers le bucket Supabase.",
    });

  } catch (e) {
    return NextResponse.json(
      { succes: false, erreur: e instanceof Error ? e.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}

/** Liste les sauvegardes disponibles. */
export async function GET() {
  const { createClient: createServeur } = await import('@/lib/supabase/server');
  const supabase = await createServeur();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: 'Non authentifié' }, { status: 401 });

  const { data: profil } = await supabase
    .from('profils').select('role').eq('id', user.id).single();
  if (profil?.role !== 'proprietaire') {
    return NextResponse.json({ erreur: 'Réservé au propriétaire' }, { status: 403 });
  }

  if (!r2Configure()) {
    return NextResponse.json({ erreur: 'Identifiants R2 absents.' }, { status: 500 });
  }

  const dumps = (await lister('base/'))
    .sort((a, b) => b.modifie.getTime() - a.modifie.getTime())
    .map((o) => ({ cle: o.cle, octets: o.taille, date: o.modifie }));

  return NextResponse.json({ sauvegardes: dumps });
}
