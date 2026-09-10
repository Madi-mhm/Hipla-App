import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import FicheEntreprise, { type Entreprise, type Exercice } from './FicheEntreprise';

export const metadata = { title: 'Entreprise — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'entreprise', 'read')) redirect('/');

  const supabase = await createClient();
  const [{ data: ent }, { data: exercices }] = await Promise.all([
    supabase.from('entreprise').select('*').single(),
    supabase.from('exercices').select('id, date_debut, date_fin, statut, regime_tva').order('date_debut'),
  ]);

  return (
    <>
      <Header section="reglages" titre="Entreprise"
        sousTitre="Identité légale, mentions des factures et exercices" />
      <div className="content">
        {ent ? (
          <FicheEntreprise
            entreprise={ent as Entreprise}
            exercices={(exercices ?? []) as Exercice[]}
            modifiable={peut(profil.role, 'entreprise', 'update')}
          />
        ) : (
          <div className="card"><p>Fiche entreprise introuvable.</p></div>
        )}
      </div>
    </>
  );
}
