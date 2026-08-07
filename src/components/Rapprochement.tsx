'use client';

/**
 * RAPPROCHEMENT BANCAIRE
 *
 * Le montant d'une opération vient de la banque : il est certain. Le
 * lien entre cette opération et une écriture, lui, reste une
 * interprétation — deux achats du même montant chez le même fournisseur
 * à deux jours d'intervalle, cela existe. La confirmation est humaine.
 *
 * Ce qui change avec le nouveau moteur : l'écran affiche POURQUOI il
 * propose ce rattachement. « Montant exact, même date, fournisseur déjà
 * reconnu » se juge d'un coup d'œil ; un score nu ne se juge pas.
 *
 * Le lien se défait désormais. L'ancienne version le tenait pour
 * définitif, ce qui obligeait à annuler l'écriture entière pour
 * corriger une erreur de rattachement.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money, date } from '@/lib/format';
import Alerte from '@/components/Alerte';
import type { Candidat } from '@/lib/registre';
import styles from './Rapprochement.module.css';

type Rattachee = {
  id: string;
  numero_piece: string | null;
  date_operation: string;
  montant: number;
  libelle: string;
} | null;

export type OperationLibre = {
  id: string;
  numero_piece: string | null;
  date_operation: string;
  montant: number;
  libelle: string;
  contrepartie: string | null;
};

type Props = {
  pieceId: string;
  attenduEnBanque: boolean;
  resteDu: number;
  rattachee: Rattachee;
  candidats: Candidat[];
  operationsLibres: OperationLibre[];
  peutGerer: boolean;
};

const LIBELLE_DECISION: Record<string, string> = {
  automatique: 'Correspondance certaine',
  propose: 'Correspondance probable',
  incertain: 'Correspondance possible',
  ecarte: 'Écartée',
};

export default function Rapprochement({
  pieceId, attenduEnBanque, resteDu, rattachee, candidats, operationsLibres, peutGerer,
}: Props) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choix, setChoix] = useState('');

  async function confirmer(transactionId: string) {
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    // La fonction crée le règlement, rattache l'opération et apprend le
    // libellé — le tout dans une seule transaction.
    const { error } = await supabase.rpc('confirmer_appariement', {
      p_piece: pieceId, p_transaction: transactionId, p_automatique: false,
    });

    if (error) { setErreur(`Rapprochement impossible — ${error.message}`); setEnCours(false); return; }
    setEnCours(false);
    router.refresh();
  }

  async function detacher() {
    if (!rattachee) return;
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    const { error } = await supabase.rpc('detacher_appariement', {
      p_piece: pieceId, p_transaction: rattachee.id,
    });

    if (error) { setErreur(`Détachement impossible — ${error.message}`); setEnCours(false); return; }
    setEnCours(false);
    router.refresh();
  }

  async function definirAttente(attendu: boolean) {
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    const { error } = await supabase.rpc('definir_attente_banque', {
      p_piece: pieceId, p_attendu: attendu,
    });

    if (error) { setErreur(error.message); setEnCours(false); return; }
    setEnCours(false);
    router.refresh();
  }

  const etat = rattachee ? 'confirme' : !attenduEnBanque ? 'sans_objet' : 'attente';

  return (
    <div className="card">
      <div className={styles.entete}>
        <p className="card__title">Rapprochement bancaire</p>
        <span className={`badge ${
          etat === 'confirme' ? 'badge--success'
          : etat === 'sans_objet' ? 'badge--neutral' : 'badge--warning'}`}>
          {etat === 'confirme' ? 'Rapproché'
           : etat === 'sans_objet' ? 'Hors banque' : 'En attente'}
        </span>
      </div>

      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}

      {/* ---------- Rattaché ---------- */}
      {rattachee && (
        <>
          <div className={styles.confirme}>
            <p>
              <strong className="mono">{rattachee.numero_piece}</strong> —{' '}
              {money(Number(rattachee.montant))} le {date(rattachee.date_operation)}
            </p>
            <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.25rem' }}>
              {rattachee.libelle}
            </p>
          </div>
          {peutGerer && (
            <div className={styles.actions}>
              <button onClick={detacher} disabled={enCours} className="btn btn--ghost">
                Ce n&apos;est pas la bonne opération
              </button>
            </div>
          )}
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.7rem', lineHeight: 1.5 }}>
            Détacher supprime le règlement correspondant et remet
            l&apos;opération à traiter. L&apos;écriture, elle, reste intacte.
          </p>
        </>
      )}

      {/* ---------- Hors banque ---------- */}
      {etat === 'sans_objet' && (
        <>
          <p className="muted" style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '64ch' }}>
            Aucune opération bancaire n&apos;est attendue pour cette écriture —
            paiement en espèces ou avancé par un associé. Elle est donc exclue
            du contrôle de complétude.
          </p>
          {peutGerer && (
            <button onClick={() => definirAttente(true)} disabled={enCours}
              className="btn btn--ghost" style={{ marginTop: '.8rem' }}>
              Remettre au contrôle bancaire
            </button>
          )}
        </>
      )}

      {/* ---------- En attente ---------- */}
      {etat === 'attente' && (
        <>
          {candidats.length === 0 ? (
            <p className="muted" style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '64ch' }}>
              Le moteur ne trouve aucune correspondance assez sûre pour être
              proposée. La recherche reprend à chaque synchronisation — et si
              vous savez à quelle opération cette écriture correspond, la liste
              ci-dessous permet de la rapprocher à la main.
            </p>
          ) : (
            <>
              <p className={styles.proposition}>
                {candidats.length === 1
                  ? 'Une opération pourrait correspondre. Vérifiez qu\u2019il s\u2019agit bien du même achat avant de confirmer.'
                  : `${candidats.length} opérations pourraient correspondre. La première est la plus probable.`}
              </p>

              {candidats.map((c) => (
                <div key={c.transaction_id} className={styles.carteTransaction}
                  style={{ marginBottom: '.6rem' }}>
                  <div style={{ flex: 1 }}>
                    <p className="mono" style={{ fontSize: '.74rem', color: 'var(--navy)', fontWeight: 600 }}>
                      {c.numero_piece}
                      <span className="muted" style={{ marginLeft: '.5rem', fontWeight: 400 }}>
                        {LIBELLE_DECISION[c.decision] ?? c.decision}
                      </span>
                    </p>
                    <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 500, marginTop: '.2rem' }}>
                      {c.libelle}
                    </p>
                    <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                      {date(c.date_operation)}
                    </p>

                    {/* Les motifs, pas le score : c'est ce qui se juge. */}
                    {Array.isArray(c.motifs) && c.motifs.length > 0 && (
                      <p className="muted" style={{
                        fontSize: 'var(--fs-xs)', marginTop: '.35rem', lineHeight: 1.5,
                      }}>
                        {c.motifs.join(' · ')}
                      </p>
                    )}
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <p className="amount" style={{
                      fontFamily: 'var(--display)', fontWeight: 600, fontSize: '1.1rem',
                    }}>
                      {money(Number(c.montant))}
                    </p>
                    {Math.abs(Number(c.montant) - resteDu) > 0.005 && (
                      <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                        dû : {money(resteDu)}
                      </p>
                    )}
                    {peutGerer && (
                      <button onClick={() => confirmer(c.transaction_id)}
                        disabled={enCours} className="btn btn--gold"
                        style={{ marginTop: '.4rem', minHeight: 30, fontSize: '.72rem' }}>
                        Rapprocher
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {peutGerer && operationsLibres.length > 0 && (
            <div className={styles.selection} style={{ marginTop: '1rem' }}>
              <label>
                <span>Rapprocher à la main</span>
                <select value={choix} onChange={(e) => setChoix(e.target.value)}>
                  <option value="">Choisir une opération…</option>
                  {operationsLibres.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.numero_piece} · {date(o.date_operation)} ·{' '}
                      {Number(o.montant).toFixed(2).replace('.', ',')} € ·{' '}
                      {(o.contrepartie ?? o.libelle).slice(0, 32)}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => choix && confirmer(choix)}
                disabled={!choix || enCours} className="btn btn--gold">
                Rapprocher
              </button>
            </div>
          )}

          {peutGerer && (
            <>
              <div className={styles.actions}>
                <button onClick={() => definirAttente(false)} disabled={enCours}
                  className="btn btn--ghost">
                  Aucune opération attendue
                </button>
              </div>
              <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.7rem', lineHeight: 1.5 }}>
                « Aucune opération attendue » convient à un paiement en espèces
                ou avancé par un associé : l&apos;écriture sort alors du contrôle
                de complétude, sans disparaître des totaux.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
