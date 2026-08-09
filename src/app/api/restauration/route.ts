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

/**
 * L'ordre n'est plus écrit ici.
 *
 * Cette liste comptait 18 tables et nommait `depenses`, `frais_creation`
 * et `libelles_bancaires` — vidées ou renommées. Elle ignorait `pieces`,
 * `reglements`, `tiers`, `declarations_tva` : une restauration aurait
 * rendu un registre vide, sans erreur ni avertissement.
 *
 * `ordre_restauration()` (migration 085) trie les tables réelles par
 * dépendances de clés étrangères : une pièce n'est écrite qu'après sa
 * catégorie et son tiers.
 */

/** Lignes écrites par lot. */
const LOT = 200;

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
  'synchronisations',         // historique propre à chaque installation
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

    if (sauvegarde.version !== 1 && sauvegarde.version !== 2) {
      return NextResponse.json(
        { erreur: `Version de sauvegarde non prise en charge : ${sauvegarde.version}` },
        { status: 400 }
      );
    }

    // Une sauvegarde version 1 ne contient que 23 tables sur 42, et pas
    // le registre. On la restaure si on le demande, mais on le dit.
    const avertissements: string[] = [];
    if (sauvegarde.version === 1) {
      avertissements.push(
        'Sauvegarde au format 1 : elle précède le correctif et ne contient ni '
        + 'le registre (pieces, reglements, tiers) ni le schéma. La restauration '
        + 'sera partielle.'
      );
    }

    // L'ordre vient de la base cible, pas du fichier : c'est elle qui
    // porte les clés étrangères à respecter.
    const { data: ordreBrut, error: eOrdre } = await db.rpc('ordre_restauration');
    if (eOrdre) {
      return NextResponse.json(
        { erreur: `Ordre de restauration indisponible — migration 085 appliquée ? ${eOrdre.message}` },
        { status: 500 }
      );
    }
    const ORDRE = (ordreBrut as unknown as Array<string | { ordre_restauration: string }>)
      .map((t) => (typeof t === 'string' ? t : t.ordre_restauration));

    // Tables présentes dans le fichier mais absentes de la base cible :
    // signalées, jamais écrites en silence.
    const inconnues = Object.keys(sauvegarde.tables)
      .filter((t) => !ORDRE.includes(t) && !EXCLUES.has(t));
    if (inconnues.length > 0) {
      avertissements.push(
        `Tables présentes dans la sauvegarde mais absentes de cette base : `
        + `${inconnues.join(', ')}. Elles ne seront pas restaurées.`
      );
    }

    // Tables de la base absentes du fichier : la sauvegarde est-elle
    // bien complète ?
    const manquantes = ORDRE
      .filter((t) => !EXCLUES.has(t) && !(t in sauvegarde.tables));
    if (manquantes.length > 0) {
      avertissements.push(
        `Tables de cette base absentes de la sauvegarde : ${manquantes.join(', ')}.`
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
      for (let i = 0; i < lignes.length; i += LOT) {
        const lot = lignes.slice(i, i + LOT);
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
      avertissements: avertissements.length ? avertissements : undefined,
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
