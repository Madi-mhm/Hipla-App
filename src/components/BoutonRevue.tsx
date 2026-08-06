'use client';

/**
 * Marquage « revu ».
 *
 * Permet au comptable de suivre son avancement sur une période sans
 * modifier le contenu des écritures. Le marquage passe par une fonction
 * en base : les politiques RLS ne pouvant restreindre les colonnes, c'est
 * le seul moyen d'autoriser cette écriture sans ouvrir le reste.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { date } from '@/lib/format';
import Alerte from '@/components/Alerte';

export default function BoutonRevue({
  table, id, revuLe, nomRelecteur,
}: {
  table: 'depenses' | 'frais_creation' | 'deplacements';
  id: string;
  revuLe: string | null;
  nomRelecteur?: string | null;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function basculer() {
    setEnCours(true);
    const supabase = createClient();
    const { error } = await supabase.rpc('marquer_revu', {
      p_table: table, p_id: id, p_revu: !revuLe,
    });
    if (error) { setErreur(error.message); setEnCours(false); return; }

    await supabase.rpc('journaliser', {
      p_action: 'modification', p_table: table, p_id: id,
      p_details: { resume: revuLe ? 'Marquage de revue retiré' : 'Écriture marquée revue' },
    });
    setEnCours(false);
    router.refresh();
  }

  return (
    <>
    {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
      <button onClick={basculer} disabled={enCours} className="btn btn--ghost"
        style={{
          minHeight: 32, padding: '.25rem .75rem', fontSize: 'var(--fs-xs)',
          color: revuLe ? 'var(--success)' : undefined,
          borderColor: revuLe ? 'var(--success)' : undefined,
        }}>
        {revuLe ? '✓ Revue' : 'Marquer revue'}
      </button>
      {revuLe && (
        <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
          {nomRelecteur ? `${nomRelecteur} · ` : ''}{date(revuLe)}
        </span>
      )}
    </span>
    </>
  );
}
