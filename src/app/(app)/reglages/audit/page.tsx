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

  const complet = peut(profil.role, 'audit', 'read');
  const restreint = peut(profil.role, 'audit_comptable', 'read');
  if (!complet && !restreint) redirect('/');

  // Le comptable accède à la piste d'audit des écritures — exigible en
  // contrôle — mais pas aux connexions ni à la gestion des comptes.
  const supabase = await createClient();
  const { data } = await supabase
    .from(complet ? 'audit' : 'v_audit_comptable')
    .select('*')
    .order('horodatage', { ascending: false })
    .limit(500);

  return (
    <>
      <Header
        titre="Journal d'audit"
        sousTitre={
          complet
            ? 'Trace de toutes les écritures — non modifiable, non supprimable'
            : 'Écritures comptables — connexions et gestion des comptes exclues'
        }
      />
      <div className="content">
        <JournalAudit entrees={data ?? []} restreint={!complet} />
      </div>
    </>
  );
}
