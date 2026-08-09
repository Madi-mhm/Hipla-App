'use client';

/**
 * LES FACTURES DE CONTRAT QUI ATTENDENT
 *
 * Un contrat déclaré une fois engendre ses échéances. Chacune propose
 * une facture — en brouillon, jamais émise.
 *
 * Le brouillon n'est pas de la prudence, c'est le métier : une machine
 * ne sait pas qu'un samedi était férié, qu'un hôtel était fermé, ou
 * qu'une semaine a sauté. Émettre seul daterait la facture d'un jour
 * choisi sans vous et rendrait la TVA exigible sur une prestation
 * peut-être pas faite.
 *
 * Le bloc vit dans la séance parce que c'est là qu'on traite ce qui
 * attend une décision, et que celle-ci en est une.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money, date } from '@/lib/format';
import Alerte from '@/components/Alerte';
import Dialogue from '@/components/Dialogue';

export type EcheanceContrat = {
  echeance_id: string; periode: string; date_prevue: string;
  montant_prevu: number; libelle: string; client: string;
};

export default function ContratsAFacturer({
  lignes, peutGerer,
}: { lignes: EcheanceContrat[]; peutGerer: boolean }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aSauter, setASauter] = useState<EcheanceContrat | null>(null);

  if (lignes.length === 0) return null;

  async function facturer(id: string) {
    setEnCours(id); setErreur(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('facturer_echeance', { p_echeance: id });
    if (error) { setErreur(`Facturation impossible — ${error.message}`); setEnCours(null); return; }
    const r = data as { piece_id?: string } | null;
    setEnCours(null);
    if (r?.piece_id) router.push(`/ventes/${r.piece_id}`);
  }

  async function sauter(id: string, motif: string) {
    setEnCours(id); setErreur(null);
    const supabase = createClient();
    const { error } = await supabase.rpc('sauter_echeance', {
      p_echeance: id, p_motif: motif,
    });
    if (error) { setErreur(error.message); setEnCours(null); return; }
    setEnCours(null);
    router.refresh();
  }

  const total = lignes.reduce((s, l) => s + Number(l.montant_prevu), 0);

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}

      <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--gold)' }}>
        <p className="card__title">
          À facturer — {lignes.length} · {money(total)}
        </p>
        <p className="muted" style={{
          fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '68ch', marginBottom: '.9rem',
        }}>
          Ces échéances de contrat sont arrivées. La facture est créée{' '}
          <strong>en brouillon</strong> : vous la relisez, vous l&apos;émettez.
          Une semaine non travaillée se saute plutôt que de rester en attente.
        </p>

        {lignes.map((l) => (
          <div key={l.echeance_id} style={ligne}>
            <div style={{ flex: 1, minWidth: '17rem' }}>
              <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 500 }}>
                {l.client}
                <span style={{ marginLeft: '.5rem' }} className="amount">
                  {money(Number(l.montant_prevu))}
                </span>
              </p>
              <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.15rem' }}>
                {l.libelle} · période {l.periode} · prévue le {date(l.date_prevue)}
              </p>
            </div>

            {peutGerer && (
              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                <button onClick={() => setASauter(l)} disabled={enCours === l.echeance_id}
                  className="btn btn--ghost btn--sm">
                  Sauter
                </button>
                <button onClick={() => facturer(l.echeance_id)}
                  disabled={enCours === l.echeance_id}
                  className="btn btn--gold btn--sm" style={{ whiteSpace: 'nowrap' }}>
                  {enCours === l.echeance_id ? 'Création…' : 'Établir la facture'}
                </button>
              </div>
            )}
          </div>
        ))}

        <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.9rem' }}>
          <Link href="/contrats" style={{ color: 'var(--gold-ink)' }}>
            Voir les contrats
          </Link>
        </p>
      </div>

      <Dialogue
        ouvert={aSauter !== null}
        titre="Sauter cette échéance"
        description={
          `${aSauter?.client ?? ''} — ${aSauter?.periode ?? ''}. `
          + "Aucune facture ne sera établie pour cette période. Le motif reste "
          + "attaché : une période sautée sans explication ressemble à un oubli."
        }
        champ="Motif"
        placeholder="Hôtel fermé, samedi férié, prestation reportée…"
        obligatoire
        libelleValider="Sauter"
        onValider={(m) => {
          const l = aSauter;
          setASauter(null);
          if (l) sauter(l.echeance_id, m);
        }}
        onAnnuler={() => setASauter(null)}
      />
    </>
  );
}

const ligne: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  gap: '1rem', flexWrap: 'wrap',
  padding: '.75rem 0', borderBottom: '1px solid var(--g-200)',
};
