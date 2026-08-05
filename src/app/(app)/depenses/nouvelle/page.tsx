import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import FormulaireDepense from './FormulaireDepense';
import type { Categorie } from '@/lib/types';

export const metadata = { title: 'Nouvelle dépense — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'create')) redirect('/depenses');

  const supabase = await createClient();
  const { data } = await supabase
    .from('categories')
    .select('*')
    .eq('actif', true)
    .order('ordre');

  const peutValider = peut(profil.role, 'depenses', 'validate');

  return (
    <>
      <Header
        titre="Nouvelle dépense"
        sousTitre={peutValider ? undefined : 'Sera soumise à validation'}
      />
      <div className="content">
        <FormulaireDepense
          categories={(data ?? []) as Categorie[]}
          peutValider={peutValider}
        />
      </div>
    </>
  );
}
