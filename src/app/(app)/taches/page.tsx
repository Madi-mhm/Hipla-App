import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import ListeTaches from './ListeTaches';
import type { Tache } from '@/lib/types';

export const metadata = { title: 'Tâches — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'taches', 'read')) redirect('/');

  const supabase = await createClient();
  const [{ data: taches }, { data: profils }] = await Promise.all([
    supabase.from('taches')
      .select('*, assigne:profils!taches_assignee_a_fkey(nom_complet), auteur:profils!taches_cree_par_fkey(nom_complet)')
      .order('statut')
      .order('echeance', { ascending: true, nullsFirst: false }),
    supabase.from('profils').select('id, nom_complet, role').eq('actif', true),
  ]);

  return (
    <>
      <Header titre="Tâches" sousTitre="Suivi des travaux et rappels" />
      <div className="content">
        <ListeTaches
          taches={(taches ?? []) as Tache[]}
          profils={profils ?? []}
          utilisateurId={profil.id}
          peutCreer={peut(profil.role, 'taches', 'create')}
        />
      </div>
    </>
  );
}
