'use client';

/**
 * Annuler un trajet validé par erreur.
 *
 * Un trajet validé justifie une indemnité : on ne l'efface pas, on
 * l'annule avec un motif, qui reste au journal. La base refuse si une
 * indemnité l'a déjà compté (`annuler_trajet`).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Dialogue from '@/components/Dialogue';
import Alerte from '@/components/Alerte';

export default function AnnulerTrajet({ id, resume }: { id: string; resume: string }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function annuler(motif: string) {
    setOuvert(false);
    setEnCours(true);
    setErreur(null);
    const { error } = await createClient().rpc('annuler_trajet', { p_id: id, p_motif: motif });
    setEnCours(false);
    if (error) { setErreur(`Annulation impossible : ${error.message}`); return; }
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOuvert(true)} disabled={enCours}
        className="btn btn--ghost btn--sm" style={{ color: 'var(--danger)' }}>
        {enCours ? 'Annulation…' : 'Annuler'}
      </button>

      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}

      <Dialogue
        ouvert={ouvert}
        titre="Annuler ce trajet"
        description={`${resume}. Le trajet reste au journal, barré, avec le motif ; il ne sera pas indemnisé.`}
        champ="Motif de l’annulation"
        placeholder="Validé par erreur, doublon…"
        obligatoire
        libelleValider="Annuler le trajet"
        danger
        onValider={annuler}
        onAnnuler={() => setOuvert(false)}
      />
    </>
  );
}
