import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import JournalAudit from './JournalAudit';

export const metadata = { title: "Journal d'audit — Hipla Gestion" };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'audit', 'read')) redirect('/');

  const supabase = await createClient();
  const { data } = await supabase
    .from('audit')
    .select('*')
    .order('horodatage', { ascending: false })
    .limit(500);

  return (
    <>
      <Header
        titre="Journal d'audit"
        sousTitre="Trace de toutes les écritures — non modifiable, non supprimable"
      />
      <div className="content">
        <JournalAudit entrees={data ?? []} />
      </div>
    </>
  );
}
