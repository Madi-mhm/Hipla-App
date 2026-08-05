import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import FormulaireDeplacement from './FormulaireDeplacement';
import type { Vehicule } from '@/lib/types';

export const metadata = { title: 'Nouveau trajet — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'create')) redirect('/deplacements');

  const supabase = await createClient();
  const { data } = await supabase.from('vehicules').select('*').eq('actif', true).order('libelle');

  return (
    <>
      <Header titre="Nouveau trajet" sousTitre={peut(profil.role, 'depenses', 'validate') ? undefined : 'Sera soumis à validation'} />
      <div className="content">
        <FormulaireDeplacement
          vehicules={(data ?? []) as Vehicule[]}
          peutValider={peut(profil.role, 'depenses', 'validate')}
        />
      </div>
    </>
  );
}
