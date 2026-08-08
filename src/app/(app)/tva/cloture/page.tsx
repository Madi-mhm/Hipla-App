import { redirect } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import ClotureTva, { type Declaration } from './ClotureTva';

export const metadata = { title: 'Déclarations de TVA — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'tva', 'read')) redirect('/');

  const supabase = await createClient();
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const [{ data: declarations }, { data: exercice }] = await Promise.all([
    supabase.from('declarations_tva').select('*')
      .order('periode_debut', { ascending: false }),
    supabase.from('exercices').select('date_debut')
      .lte('date_debut', aujourdhui).gte('date_fin', aujourdhui)
      .limit(1).maybeSingle(),
  ]);

  return (
    <>
      <Header
        titre="Déclarations de TVA"
        sousTitre="Ce qui a été déclaré, figé au moment du dépôt"
      />
      <div className="content">
        <ClotureTva
          declarations={(declarations ?? []) as Declaration[]}
          exerciceDebut={exercice?.date_debut ?? aujourdhui}
          // Figer une déclaration est un acte de VALIDATION, pas une
          // modification : c'est le droit que le propriétaire possède, et
          // c'est aussi la bonne façon de nommer ce geste.
          peutCloturer={peut(profil.role, 'tva', 'validate')}
        />
        <div style={{ marginTop: '1.25rem' }}>
          <Link href="/tva" className="btn btn--ghost">Retour au suivi de TVA</Link>
        </div>
      </div>
    </>
  );
}
