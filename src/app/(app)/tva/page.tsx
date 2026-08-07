import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import SuiviTva, { type Suivi } from './SuiviTva';

export const metadata = { title: 'TVA — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'read')) redirect('/');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('suivi_tva');

  if (error || !data) {
    return (
      <>
        <Header titre="TVA" sousTitre="Suivi et déclaration" />
        <div className="content">
          <div className="card">
            <p className="card__title" style={{ color: 'var(--danger)' }}>
              Lecture impossible
            </p>
            <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55 }}>
              {error?.message ?? 'Le suivi de TVA n\u2019a pas pu être constitué.'}
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header titre="TVA" sousTitre="Exigible sur les encaissements et les paiements" />
      <div className="content">
        <SuiviTva suivi={data as Suivi} />
      </div>
    </>
  );
}
