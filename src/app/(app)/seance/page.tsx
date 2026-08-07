import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import SeanceHebdo, { type Seance } from './SeanceHebdo';

export const metadata = { title: 'Séance hebdomadaire — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'read')) redirect('/');

  const supabase = await createClient();

  // Une seule lecture. Le centre d'action en lançait quatorze, et
  // redémontrait des règles que les vues établissaient déjà.
  const { data, error } = await supabase.rpc('seance_hebdomadaire');

  if (error || !data) {
    return (
      <>
        <Header titre="Séance hebdomadaire" sousTitre="Tout ce qui attend une décision" />
        <div className="content">
          <div className="card">
            <p className="card__title" style={{ color: 'var(--danger)' }}>
              Lecture impossible
            </p>
            <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55 }}>
              {error?.message ?? 'La séance n\u2019a pas pu être constituée.'}
            </p>
          </div>
        </div>
      </>
    );
  }

  const seance = data as Seance;

  return (
    <>
      <Header
        titre="Séance hebdomadaire"
        sousTitre="Tout ce qui attend une décision, en un seul endroit"
      />
      <div className="content">
        <SeanceHebdo seance={seance} />
      </div>
    </>
  );
}
