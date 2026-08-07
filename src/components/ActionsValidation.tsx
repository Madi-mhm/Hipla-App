'use client';

/**
 * Validation ou rejet d'une saisie, depuis une liste.
 *
 * Les dépenses passent désormais par les fonctions du registre :
 * `valider_piece` attribue le numéro de pièce et journalise, ce que
 * l'écriture directe ne faisait pas. Les déplacements, non encore
 * basculés, conservent l'ancien chemin.
 *
 * La sécurité réelle vient des politiques RLS et des contrôles en
 * base : un contributeur qui appellerait ces fonctions verrait sa
 * requête refusée.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Dialogue from '@/components/Dialogue';
import Alerte from '@/components/Alerte';

export default function ActionsValidation({
  table, id, resume,
}: {
  table: 'depenses' | 'deplacements';
  id: string;
  resume?: string;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [dialogueRejet, setDialogueRejet] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function appliquer(statut: 'validee' | 'rejetee', motif: string | null) {
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    if (table === 'depenses') {
      const { error } = statut === 'validee'
        ? await supabase.rpc('valider_piece', { p_id: id })
        : await supabase.rpc('rejeter_piece', { p_id: id, p_motif: motif ?? '' });

      if (error) {
        setErreur(`Enregistrement impossible : ${error.message}`);
        setEnCours(false);
        return;
      }

      setEnCours(false);
      router.refresh();
      return;
    }

    // Déplacements : encore sur l'ancienne table.
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
      setErreur(`Enregistrement impossible : ${error.message}`);
      setEnCours(false);
      return;
    }

    await supabase.rpc('journaliser', {
      p_action: statut === 'validee' ? 'validation' : 'rejet',
      p_table: table,
      p_id: id,
      p_details: { resume: resume ?? null, ...(motif ? { motif } : {}) },
    });

    setEnCours(false);
    router.refresh();
  }

  return (
    <>
      <span style={{ display: 'inline-flex', gap: '.35rem' }}>
        <button
          onClick={() => appliquer('validee', null)}
          disabled={enCours}
          className="btn btn--ghost"
          style={{ minHeight: 30, padding: '.2rem .55rem', fontSize: '.72rem', color: 'var(--success)', borderColor: 'var(--success)' }}
        >
          Valider
        </button>
        <button
          onClick={() => setDialogueRejet(true)}
          disabled={enCours}
          className="btn btn--ghost"
          style={{ minHeight: 30, padding: '.2rem .55rem', fontSize: '.72rem', color: 'var(--danger)' }}
        >
          Rejeter
        </button>
      </span>

      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}

      <Dialogue
        ouvert={dialogueRejet}
        titre="Rejeter cette saisie"
        description={
          (resume ? `${resume}. ` : '') +
          "Le motif sera visible par la personne qui l'a saisie et lui permettra de corriger."
        }
        champ="Motif du rejet"
        placeholder="Justificatif illisible, catégorie erronée…"
        obligatoire
        libelleValider="Rejeter"
        danger
        onValider={(motif) => { setDialogueRejet(false); appliquer('rejetee', motif); }}
        onAnnuler={() => setDialogueRejet(false)}
      />
    </>
  );
}
