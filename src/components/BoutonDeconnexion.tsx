'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function BoutonDeconnexion() {
  const router = useRouter();

  async function deconnecter() {
    const supabase = createClient();
    await supabase.rpc('journaliser', {
      p_action: 'deconnexion',
      p_table: null, p_id: null, p_details: null,
    });
    await supabase.auth.signOut();
    router.push('/connexion');
    router.refresh();
  }

  return (
    <button onClick={deconnecter} className="btn btn--ghost" style={{ minHeight: 32, padding: '.3rem .7rem', fontSize: 'var(--fs-xs)' }}>
      Déconnexion
    </button>
  );
}
