'use client';

/**
 * Boutons valider / rejeter, réservés au propriétaire.
 * La sécurité réelle vient des politiques RLS : un contributeur qui
 * appellerait cette action verrait sa requête refusée par la base.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function ActionsValidation({
  table,
  id,
}: {
  table: 'depenses' | 'deplacements';
  id: string;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);

  async function statuer(statut: 'validee' | 'rejetee') {
    if (statut === 'rejetee') {
      const motif = window.prompt('Motif du rejet (visible par le contributeur) :');
      if (motif === null) return;
      await appliquer(statut, motif);
    } else {
      await appliquer(statut, null);
    }
  }

  async function appliquer(statut: string, motif: string | null) {
    setEnCours(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from(table)
      .update({
        statut,
        valide_par: user?.id ?? null,
        valide_le: new Date().toISOString(),
        motif_rejet: motif,
      })
      .eq('id', id);

    if (error) {
      alert(`Impossible d'enregistrer : ${error.message}`);
      setEnCours(false);
      return;
    }

    await supabase.rpc('journaliser', {
      p_action: statut === 'validee' ? 'validation' : 'rejet',
      p_table: table,
      p_id: id,
      p_details: motif ? { motif } : null,
    });

    router.refresh();
    setEnCours(false);
  }

  return (
    <span style={{ display: 'inline-flex', gap: '.35rem' }}>
      <button
        onClick={() => statuer('validee')}
        disabled={enCours}
        className="btn btn--ghost"
        style={{ minHeight: 30, padding: '.2rem .55rem', fontSize: '.72rem', color: 'var(--success)', borderColor: 'var(--success)' }}
      >
        Valider
      </button>
      <button
        onClick={() => statuer('rejetee')}
        disabled={enCours}
        className="btn btn--ghost"
        style={{ minHeight: 30, padding: '.2rem .55rem', fontSize: '.72rem', color: 'var(--danger)', borderColor: 'var(--g-300)' }}
      >
        Rejeter
      </button>
    </span>
  );
}
