'use client';

/**
 * Rapprochement bancaire d'une dépense.
 *
 * Le montant d'une opération vient de la banque : il est certain. Le lien
 * entre cette opération et une écriture, lui, reste une interprétation —
 * deux achats du même montant chez le même fournisseur à deux jours
 * d'intervalle existent. La confirmation est donc humaine.
 *
 * Une fois confirmé, le lien ne se refait pas. L'écriture, en revanche,
 * demeure corrigeable : une erreur de catégorie doit pouvoir être réparée.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money, date } from '@/lib/format';
import Alerte from '@/components/Alerte';
import {
  LIBELLE_RAPPROCHEMENT, CLASSE_RAPPROCHEMENT, type TransactionQonto,
} from '@/lib/types';
import styles from './Rapprochement.module.css';

type Props = {
  depenseId: string;
  statut: string;
  rechercheAuto: boolean;
  transactionProposee: TransactionQonto | null;
  transactionConfirmee: TransactionQonto | null;
  transactionsLibres: TransactionQonto[];
  peutGerer: boolean;
};

export default function Rapprochement({
  depenseId, statut, rechercheAuto,
  transactionProposee, transactionConfirmee, transactionsLibres, peutGerer,
}: Props) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choix, setChoix] = useState('');

  async function confirmer(transactionId: string) {
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    const { error } = await supabase.rpc('confirmer_rapprochement', {
      p_depense: depenseId, p_transaction: transactionId,
    });
    if (error) { setErreur(error.message); setEnCours(false); return; }

    await supabase.rpc('journaliser', {
      p_action: 'modification', p_table: 'depenses', p_id: depenseId,
      p_details: { resume: 'Rapprochement bancaire confirmé', transaction: transactionId },
    });
    setEnCours(false);
    router.refresh();
  }

  async function rejeter() {
    setEnCours(true);
    const supabase = createClient();
    const { error } = await supabase.rpc('rejeter_rapprochement', { p_depense: depenseId });
    if (error) { setErreur(error.message); setEnCours(false); return; }
    setEnCours(false);
    router.refresh();
  }

  async function marquerSansObjet() {
    setEnCours(true);
    const supabase = createClient();
    const { error } = await supabase.from('depenses').update({
      statut_rapprochement: 'sans_objet',
      transaction_proposee_id: null,
      recherche_auto: false,
    }).eq('id', depenseId);
    if (error) { setErreur(error.message); setEnCours(false); return; }
    setEnCours(false);
    router.refresh();
  }

  async function basculerRecherche() {
    setEnCours(true);
    const supabase = createClient();
    await supabase.from('depenses')
      .update({ recherche_auto: !rechercheAuto })
      .eq('id', depenseId);
    setEnCours(false);
    router.refresh();
  }

  return (
    <div className="card">
      <div className={styles.entete}>
        <p className="card__title">Rapprochement bancaire</p>
        <span className={`badge ${CLASSE_RAPPROCHEMENT[statut]}`}>
          {LIBELLE_RAPPROCHEMENT[statut]}
        </span>
      </div>

      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}

      {/* ---- Confirmé ---- */}
      {statut === 'confirme' && transactionConfirmee && (
        <div className={styles.confirme}>
          <p>
            <strong className="mono">{transactionConfirmee.numero_piece}</strong> —{' '}
            {money(Number(transactionConfirmee.montant))} le{' '}
            {date(transactionConfirmee.date_operation)}
          </p>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.25rem' }}>
            {transactionConfirmee.libelle}
          </p>
        </div>
      )}

      {/* ---- Proposé ---- */}
      {statut === 'propose' && transactionProposee && (
        <>
          <p className={styles.proposition}>
            Une opération correspond au montant et à la date de cette dépense.
            Vérifiez qu'il s'agit bien du même achat avant de confirmer : le
            lien ne se refait pas.
          </p>
          <div className={styles.carteTransaction}>
            <div>
              <p className="mono" style={{ fontSize: '.74rem', color: 'var(--navy)', fontWeight: 600 }}>
                {transactionProposee.numero_piece}
              </p>
              <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 500, marginTop: '.2rem' }}>
                {transactionProposee.contrepartie ?? transactionProposee.libelle}
              </p>
              <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                {date(transactionProposee.date_operation)} · {transactionProposee.libelle}
              </p>
            </div>
            <p className="amount" style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: '1.1rem' }}>
              {money(Number(transactionProposee.montant))}
            </p>
          </div>

          {peutGerer && (
            <div className={styles.actions}>
              <button onClick={() => confirmer(transactionProposee.id)}
                disabled={enCours} className="btn btn--gold">
                Confirmer le rapprochement
              </button>
              <button onClick={rejeter} disabled={enCours} className="btn btn--ghost">
                Ce n'est pas la bonne
              </button>
            </div>
          )}
        </>
      )}

      {/* ---- En attente ---- */}
      {statut === 'sans_transaction' && (
        <>
          <p className="muted" style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '64ch' }}>
            {rechercheAuto
              ? "Aucune opération bancaire ne correspond pour l'instant. La recherche se poursuit à chaque synchronisation ; dès qu'une opération arrive, elle sera proposée."
              : 'La recherche automatique est désactivée pour cette dépense.'}
          </p>

          {peutGerer && (
            <>
              {transactionsLibres.length > 0 && (
                <div className={styles.selection}>
                  <label>
                    <span>Rapprocher manuellement</span>
                    <select value={choix} onChange={(e) => setChoix(e.target.value)}>
                      <option value="">Choisir une opération…</option>
                      {transactionsLibres.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.numero_piece} · {date(t.date_operation)} ·{' '}
                          {Number(t.montant).toFixed(2).replace('.', ',')} € ·{' '}
                          {(t.contrepartie ?? t.libelle).slice(0, 30)}
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

              <div className={styles.actions}>
                <button onClick={basculerRecherche} disabled={enCours} className="btn btn--ghost">
                  {rechercheAuto ? 'Arrêter la recherche' : 'Reprendre la recherche'}
                </button>
                <button onClick={marquerSansObjet} disabled={enCours} className="btn btn--ghost">
                  Aucune opération attendue
                </button>
              </div>

              <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.7rem', lineHeight: 1.5 }}>
                « Aucune opération attendue » convient à un paiement en espèces
                ou avancé par un associé : la dépense sort alors du contrôle de
                complétude.
              </p>
            </>
          )}
        </>
      )}

      {/* ---- Sans objet ---- */}
      {statut === 'sans_objet' && (
        <>
          <p className="muted" style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55 }}>
            Aucune opération bancaire n'est attendue pour cette dépense —
            paiement en espèces ou avancé par un associé.
          </p>
          {peutGerer && (
            <button onClick={rejeter} disabled={enCours} className="btn btn--ghost"
              style={{ marginTop: '.8rem' }}>
              Reprendre la recherche
            </button>
          )}
        </>
      )}
    </div>
  );
}
