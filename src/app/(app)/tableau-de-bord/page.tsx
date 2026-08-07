import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { dateLong } from '@/lib/format';
import TableauDeBord, { type Bord } from './TableauDeBord';

export const metadata = { title: 'Tableau de bord — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'read')) redirect('/');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('tableau_de_bord');

  if (error || !data) {
    return (
      <>
        <Header titre="Tableau de bord" sousTitre="Où en est l&apos;entreprise" />
        <div className="content">
          <div className="card">
            <p className="card__title" style={{ color: 'var(--danger)' }}>
              Lecture impossible
            </p>
            <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55 }}>
              {error?.message ?? 'Le tableau de bord n\u2019a pas pu être constitué.'}
            </p>
          </div>
        </div>
      </>
    );
  }

  const bord = data as Bord;

  return (
    <>
      <Header
        titre="Tableau de bord"
        sousTitre={`Exercice du ${dateLong(bord.exercice_debut)} au ${dateLong(bord.exercice_fin)}`}
      />
      <div className="content">
        <TableauDeBord bord={bord} />
      </div>
    </>
  );
}
