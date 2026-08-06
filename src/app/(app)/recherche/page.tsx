import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import Recherche from './Recherche';

export const metadata = { title: 'Recherche — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'read')) redirect('/');

  const supabase = await createClient();

  // Une seule collection homogène : la recherche ne doit pas obliger
  // à savoir dans quelle section se trouve une écriture.
  const [{ data: dep }, { data: frais }, { data: depl }] = await Promise.all([
    supabase.from('depenses')
      .select('id, numero_piece, date_depense, fournisseur, libelle, montant_ttc, statut, notes, categories(libelle)')
      .order('date_depense', { ascending: false }),
    supabase.from('frais_creation')
      .select('id, numero_piece, date_engagement, fournisseur, libelle, montant_ttc, statut_reprise, notes, categories(libelle)')
      .order('date_engagement', { ascending: false }),
    supabase.from('deplacements')
      .select('id, numero_piece, date_trajet, depart, arrivee, motif, kilometres, aller_retour, statut')
      .order('date_trajet', { ascending: false }),
  ]);

  type Cat = { libelle: string } | { libelle: string }[] | null;
  const nomCat = (c: Cat) => (Array.isArray(c) ? c[0]?.libelle : c?.libelle) ?? null;

  const pieces = [
    ...(dep ?? []).map((d) => ({
      id: d.id,
      numero: d.numero_piece,
      nature: 'depense' as const,
      date: d.date_depense,
      tiers: d.fournisseur,
      libelle: d.libelle,
      categorie: nomCat(d.categories as Cat),
      montant: Number(d.montant_ttc),
      statut: d.statut,
      notes: d.notes,
      lien: `/depenses/${d.id}`,
    })),
    ...(frais ?? []).map((f) => ({
      id: f.id,
      numero: f.numero_piece,
      nature: 'frais' as const,
      date: f.date_engagement,
      tiers: f.fournisseur,
      libelle: f.libelle,
      categorie: nomCat(f.categories as Cat),
      montant: Number(f.montant_ttc),
      statut: f.statut_reprise,
      notes: f.notes,
      lien: '/frais-creation',
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
        <Recherche pieces={pieces} />
      </div>
    </>
  );
}
