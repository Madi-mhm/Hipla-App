import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import TableauFrais from './TableauFrais';
import type { Categorie, FraisCreation } from '@/lib/types';

export const metadata = { title: 'Frais de création — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'read')) redirect('/');

  const supabase = await createClient();
  const [{ data: frais }, { data: cats }] = await Promise.all([
    supabase.from('frais_creation')
      .select('*, categories(libelle)')
      .order('date_engagement'),
    supabase.from('categories').select('*').eq('actif', true).order('ordre'),
  ]);

  return (
    <>
      <Header
        titre="Frais de création"
        sousTitre="Dépenses engagées avant l'immatriculation du 29 juillet 2026"
      />
      <div className="content">
        <TableauFrais
          frais={(frais ?? []) as FraisCreation[]}
          categories={(cats ?? []) as Categorie[]}
          peutModifier={peut(profil.role, 'depenses', 'update')}
        />
      </div>
    </>
  );
}
