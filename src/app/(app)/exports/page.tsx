import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import Exports from './Exports';
import type { Categorie } from '@/lib/types';

export const metadata = { title: 'Exports — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'exports', 'read')) redirect('/');

  const supabase = await createClient();
  const [{ data: dep }, { data: frais }, { data: depl }, { data: cats }, { data: exs }] =
    await Promise.all([
      supabase.from('depenses').select('*, categories(libelle, groupe)').order('date_depense'),
      supabase.from('frais_creation').select('*, categories(libelle, groupe)').order('date_engagement'),
      supabase.from('deplacements').select('*, vehicules(libelle)').order('date_trajet'),
      supabase.from('categories').select('*').order('ordre'),
      supabase.from('exercices').select('*').order('date_debut'),
    ]);

  const { data: abos } = await supabase
    .from('abonnements')
    .select('*, categories(libelle)')
    .order('date_debut');

  return (
    <>
      <Header titre="Exports" sousTitre="Extraction filtrée des écritures" />
      <div className="content">
        <Exports
          depenses={dep ?? []}
          frais={frais ?? []}
          deplacements={depl ?? []}
          abonnements={abos ?? []}
          categories={(cats ?? []) as Categorie[]}
          exercices={exs ?? []}
        />
      </div>
    </>
  );
}
