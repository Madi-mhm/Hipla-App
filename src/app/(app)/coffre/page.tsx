import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import Coffre, { type Document, type Etat } from './Coffre';

export const metadata = { title: 'Coffre — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'documents', 'read')) redirect('/');

  const supabase = await createClient();

  const [{ data: documents }, { data: etat }] = await Promise.all([
    supabase.from('documents_permanents').select('*')
      .order('type_document').order('date_document', { ascending: false }),
    supabase.rpc('etat_coffre'),
  ]);

  return (
    <>
      <Header
        titre="Coffre"
        sousTitre="Les documents qui fondent la société"
      />
      <div className="content">
        <Coffre
          documents={(documents ?? []) as Document[]}
          etat={(etat ?? { manquants: [], expirent: [] }) as Etat}
          peutDeposer={peut(profil.role, 'documents', 'create')}
        />
      </div>
    </>
  );
}
