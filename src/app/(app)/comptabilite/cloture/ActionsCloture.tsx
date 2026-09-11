'use client';

/**
 * Clôturer fige l'exercice : ses écritures et ses règlements ne changent
 * plus. On le fait une fois les écritures de fin d'exercice passées et
 * les déclarations prêtes. Rouvrir reste possible, avec un motif, tant
 * que rien n'est déposé.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { date } from '@/lib/format';
import Alerte from '@/components/Alerte';
import Dialogue from '@/components/Dialogue';

export default function ActionsCloture({
  exerciceId, statut, termine, fin, clotureLe, aReprendre, peutModifier,
}: {
  exerciceId: string; statut: string; termine: boolean; fin: string;
  clotureLe: string | null; aReprendre: number; peutModifier: boolean;
}) {
  const router = useRouter();
  const [dialogue, setDialogue] = useState<'cloturer' | 'rouvrir' | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const lendemain = new Date(Date.parse(fin) + 86_400_000).toISOString().slice(0, 10);

  async function cloturer() {
    setDialogue(null); setEnCours(true); setErreur(null);
    const { error } = await createClient().rpc('cloturer_exercice', { p_exercice: exerciceId });
    setEnCours(false);
    if (error) { setErreur(error.message); return; }
    router.refresh();
  }

  async function rouvrir(motif: string) {
    setDialogue(null); setEnCours(true); setErreur(null);
    const { error } = await createClient().rpc('rouvrir_exercice', { p_exercice: exerciceId, p_motif: motif });
    setEnCours(false);
    if (error) { setErreur(error.message); return; }
    router.refresh();
  }

  if (statut === 'clos') {
    return (
      <>
        {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
        <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, marginTop: '.3rem' }}>
          Exercice clos{clotureLe ? ` le ${date(clotureLe)}` : ''}. Ses écritures ne changent plus :
          une correction se passe dans l&apos;exercice en cours.
        </p>
        {peutModifier && (
          <button onClick={() => setDialogue('rouvrir')} disabled={enCours} className="btn btn--ghost" style={{ marginTop: '.7rem' }}>
            Rouvrir l&apos;exercice
          </button>
        )}
        <Dialogue
          ouvert={dialogue === 'rouvrir'}
          titre="Rouvrir l’exercice"
          description="À ne faire que si les déclarations ne sont pas encore déposées. Le motif reste au journal d’audit."
          champ="Motif"
          placeholder="Facture de septembre oubliée…"
          obligatoire
          libelleValider="Rouvrir"
          onValider={rouvrir}
          onAnnuler={() => setDialogue(null)}
        />
      </>
    );
  }

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '72ch', marginTop: '.3rem' }}>
        La clôture fige l&apos;exercice : aucune écriture ni aucun règlement daté de cet exercice ne
        pourra plus être ajouté, modifié ou supprimé. Faites-la une fois les écritures de fin
        d&apos;exercice passées et les déclarations prêtes. Les soldes passent alors en à-nouveaux
        dans l&apos;exercice suivant — ils y sont déjà, calculés sur le journal.
      </p>
      {aReprendre > 0 && (
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--warning)', marginTop: '.5rem' }}>
          {aReprendre} point{aReprendre > 1 ? 's' : ''} de la préparation reste{aReprendre > 1 ? 'nt' : ''} à reprendre.
        </p>
      )}
      {peutModifier && (
        <button onClick={() => setDialogue('cloturer')} disabled={!termine || enCours}
          className="btn btn--gold" style={{ marginTop: '.8rem' }}>
          {termine ? 'Clôturer l’exercice' : `Clôture possible à partir du ${date(lendemain)}`}
        </button>
      )}
      <Dialogue
        ouvert={dialogue === 'cloturer'}
        titre="Clôturer l’exercice"
        description={(aReprendre > 0
          ? `${aReprendre} point(s) de la préparation ne sont pas au vert. `
          : '')
          + 'Après la clôture, plus rien ne change dans cet exercice sans le rouvrir.'}
        libelleValider="Clôturer"
        onValider={() => cloturer()}
        onAnnuler={() => setDialogue(null)}
      />
    </>
  );
}
