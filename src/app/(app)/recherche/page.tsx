import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import Recherche from './Recherche';

export const metadata = { title: 'Recherche — Hipla Gestion' };
export const dynamic = 'force-dynamic';

/**
 * Résultats de la barre de recherche de l'en-tête : toutes les écritures
 * et tous les trajets, en une seule liste filtrable.
 */
export default async function Page({ searchParams }: {
  searchParams: Promise<{ q?: string }>;
}) {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'read')) redirect('/');

  const { q } = await searchParams;
  const supabase = await createClient();

  const [{ data: ecritures }, { data: depl }] = await Promise.all([
    supabase.from('pieces')
      .select('id, numero_piece, nature, date_piece, tiers_libelle, objet, montant_ttc, etat, notes, categories(libelle)')
      .order('date_piece', { ascending: false }),
    supabase.from('deplacements')
      .select('id, numero_piece, date_trajet, depart, arrivee, motif, kilometres, aller_retour, statut')
      .order('date_trajet', { ascending: false }),
  ]);

  type Cat = { libelle: string } | { libelle: string }[] | null;
  const nomCat = (c: Cat) => (Array.isArray(c) ? c[0]?.libelle : c?.libelle) ?? null;

  // La nature du registre porte des noms techniques ; l'écran attend
  // ceux qu'il affiche déjà.
  const natureAffichee = (n: string) =>
    n === 'vente' || n === 'avoir' || n === 'devis' ? 'vente' as const
    : n === 'creation' ? 'frais' as const
    : n === 'km' ? 'deplacement' as const
    : 'depense' as const;

  const lienDe = (n: string, id: string) =>
    n === 'devis' ? `/ventes/devis/${id}`
    : n === 'vente' || n === 'avoir' ? `/ventes/${id}`
    : n === 'banque' ? '/banque'
    : `/depenses/${id}`;

  const pieces = [
    ...(ecritures ?? []).map((d) => ({
      id: d.id,
      numero: d.numero_piece,
      nature: natureAffichee(d.nature),
      date: d.date_piece,
      tiers: d.tiers_libelle,
      libelle: d.objet ?? '',
      categorie: nomCat(d.categories as Cat),
      montant: Number(d.montant_ttc),
      statut: d.etat,
      notes: d.notes,
      lien: lienDe(d.nature, d.id),
    })),
    ...(depl ?? []).map((t) => ({
      id: t.id,
      numero: t.numero_piece,
      nature: 'deplacement' as const,
      date: t.date_trajet,
      tiers: `${t.depart} → ${t.arrivee}`,
      libelle: t.motif,
      categorie: null,
      montant: null,
      statut: t.statut,
      notes: `${Number(t.kilometres) * (t.aller_retour ? 2 : 1)} km`,
      lien: '/deplacements',
    })),
  ];

  return (
    <>
      <Header titre="Recherche" sousTitre="Toutes les écritures, toutes sections confondues" />
      <div className="content">
        <Recherche pieces={pieces} termeInitial={q ?? ''} />
      </div>
    </>
  );
}
