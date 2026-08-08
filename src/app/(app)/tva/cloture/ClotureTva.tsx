'use client';

/**
 * CLÔTURE ET HISTORIQUE DES DÉCLARATIONS
 *
 * Une déclaration déposée est un acte définitif. Les chiffres qui la
 * fondent doivent l'être aussi : sans clôture, une écriture ajoutée le
 * lendemain modifierait rétroactivement ce que vous avez transmis, et
 * l'écran afficherait un montant différent de celui du formulaire.
 *
 * La clôture n'interdit pas de saisir après coup — refuser une pièce
 * arrivée en retard pousse à l'antidater, ce qui est pire. Elle rend
 * l'écart VISIBLE, pour qu'il relève d'une rectificative ou de la
 * période suivante.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money, date, dateLong } from '@/lib/format';
import Alerte from '@/components/Alerte';
import Dialogue from '@/components/Dialogue';

export type Declaration = {
  id: string;
  periode_debut: string; periode_fin: string;
  regime: string; formulaire: string;
  collectee: number; deductible: number; solde: number;
  depose_le: string | null; reference: string | null;
  etat: string; cloture_le: string;
  motif_annulation: string | null;
  detail: unknown[];
};

type Ecart = {
  declare: { collectee: number; deductible: number; solde: number; faits_generateurs: number };
  actuel: { collectee: number; deductible: number; solde: number; faits_generateurs: number };
  ecart_solde: number;
  ecart: boolean;
  lignes_nouvelles: Array<{ numero_piece: string | null; tiers: string; tva: number }>;
};

export default function ClotureTva({
  declarations, exerciceDebut, peutCloturer,
}: {
  declarations: Declaration[]; exerciceDebut: string; peutCloturer: boolean;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [aAnnuler, setAAnnuler] = useState<Declaration | null>(null);
  const [ecarts, setEcarts] = useState<Record<string, Ecart>>({});

  // Par défaut, le mois écoulé : on ne clôture jamais une période en
  // cours, des écritures peuvent encore y entrer.
  const finMoisDernier = new Date();
  finMoisDernier.setDate(0);
  const debutMoisDernier = new Date(
    finMoisDernier.getFullYear(), finMoisDernier.getMonth(), 1);

  const [debut, setDebut] = useState(
    debutMoisDernier > new Date(exerciceDebut)
      ? debutMoisDernier.toISOString().slice(0, 10)
      : exerciceDebut);
  const [fin, setFin] = useState(finMoisDernier.toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [deposeLe, setDeposeLe] = useState('');

  async function cloturer() {
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    const supabase = createClient();

    const { data, error } = await supabase.rpc('cloturer_tva', {
      p_debut: debut, p_fin: fin,
      p_depose_le: deposeLe || null,
      p_reference: reference.trim() || null,
    });

    if (error) { setErreur(error.message); setEnCours(false); return; }

    const r = data as { formulaire?: string; solde?: number; faits_generateurs?: number } | null;
    setSucces(
      `${r?.formulaire ?? 'Déclaration'} figée — solde de `
      + `${money(Math.abs(Number(r?.solde ?? 0)))} sur `
      + `${r?.faits_generateurs} fait${(r?.faits_generateurs ?? 0) > 1 ? 's' : ''} générateur`
      + `${(r?.faits_generateurs ?? 0) > 1 ? 's' : ''}.`
    );
    setEnCours(false);
    router.refresh();
  }

  async function verifierEcart(d: Declaration) {
    const supabase = createClient();
    const { data } = await supabase.rpc('ecarts_declaration', { p_id: d.id });
    if (data) setEcarts({ ...ecarts, [d.id]: data as Ecart });
  }

  async function annuler(motif: string) {
    setEnCours(true);
    const supabase = createClient();
    const { error } = await supabase.rpc('annuler_declaration_tva', {
      p_id: aAnnuler?.id, p_motif: motif,
    });
    if (error) { setErreur(error.message); setEnCours(false); return; }
    setSucces('Déclaration annulée. La trace est conservée.');
    setEnCours(false);
    router.refresh();
  }

  const actives = declarations.filter((d) => d.etat !== 'annulee');

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      {/* ---------- Clôturer ---------- */}
      {peutCloturer && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <p className="card__title">Clôturer une période</p>
          <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '70ch' }}>
            Figer les montants déclarés et le détail qui les compose. Sans cela,
            une écriture ajoutée demain modifierait rétroactivement ce que vous
            avez transmis.
          </p>

          <div style={{
            display: 'grid', gap: '.9rem', marginTop: '1.1rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
          }}>
            <label><span>Du</span>
              <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} /></label>
            <label><span>Au</span>
              <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></label>
            <label><span>Déposée le</span>
              <input type="date" value={deposeLe}
                onChange={(e) => setDeposeLe(e.target.value)} /></label>
            <label><span>Référence du dépôt</span>
              <input type="text" value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Accusé impots.gouv.fr" /></label>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <button onClick={cloturer} disabled={enCours} className="btn btn--gold">
              {enCours ? 'Clôture…' : 'Figer la période'}
            </button>
          </div>

          <p className="muted" style={{
            fontSize: 'var(--fs-xs)', marginTop: '.8rem', lineHeight: 1.5, maxWidth: '70ch',
          }}>
            Laissez « déposée le » vide pour préparer sans transmettre. Une
            période en cours ne se clôture pas : des écritures peuvent encore y
            entrer légitimement.
          </p>
        </div>
      )}

      {/* ---------- Historique ---------- */}
      <div className="card">
        <p className="card__title">
          Déclarations {actives.length > 0 && `— ${actives.length}`}
        </p>

        {declarations.length === 0 ? (
          <div className="etat-vide">
            <p>Aucune déclaration figée.</p>
            <p className="muted">
              Tant qu&apos;une période n&apos;est pas clôturée, ses montants
              suivent les écritures et changent à chaque saisie.
            </p>
          </div>
        ) : (
          <div style={{ marginTop: '.6rem' }}>
            {declarations.map((d) => {
              const e = ecarts[d.id];
              const annulee = d.etat === 'annulee';

              return (
                <div key={d.id} style={{
                  padding: '1rem 0', borderBottom: '1px solid var(--g-200)',
                  opacity: annulee ? 0.5 : 1,
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap',
                  }}>
                    <div>
                      <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--navy)' }}>
                        {d.formulaire} · {dateLong(d.periode_debut)} → {dateLong(d.periode_fin)}
                      </p>
                      <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.15rem' }}>
                        {d.depose_le
                          ? `Déposée le ${date(d.depose_le)}`
                          : 'Préparée, non déposée'}
                        {d.reference && ` · ${d.reference}`}
                        {' · '}{d.detail.length} fait{d.detail.length > 1 ? 's' : ''} générateur
                        {d.detail.length > 1 ? 's' : ''}
                      </p>
                      {annulee && d.motif_annulation && (
                        <p style={{
                          fontSize: 'var(--fs-xs)', marginTop: '.2rem', color: 'var(--danger)',
                        }}>
                          Annulée — {d.motif_annulation}
                        </p>
                      )}
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <p className="amount" style={{
                        fontFamily: 'var(--display)', fontSize: '1.15rem', fontWeight: 600,
                        color: Number(d.solde) >= 0 ? 'var(--navy)' : 'var(--success)',
                      }}>
                        {money(Math.abs(Number(d.solde)))}
                      </p>
                      <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                        {Number(d.solde) >= 0 ? 'à payer' : 'crédit'}
                      </p>
                    </div>
                  </div>

                  <div style={{
                    display: 'flex', gap: '1.6rem', marginTop: '.6rem', flexWrap: 'wrap',
                  }}>
                    <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                      Collectée <strong className="amount">{money(Number(d.collectee))}</strong>
                    </span>
                    <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                      Déductible <strong className="amount">{money(Number(d.deductible))}</strong>
                    </span>
                  </div>

                  {!annulee && (
                    <div style={{ display: 'flex', gap: '.5rem', marginTop: '.8rem', flexWrap: 'wrap' }}>
                      <button onClick={() => verifierEcart(d)} className="btn btn--ghost"
                        style={{ minHeight: 28, padding: '.15rem .6rem', fontSize: '.7rem' }}>
                        Comparer à aujourd&apos;hui
                      </button>
                      {peutCloturer && (
                        <button onClick={() => setAAnnuler(d)} className="btn btn--ghost"
                          style={{
                            minHeight: 28, padding: '.15rem .6rem',
                            fontSize: '.7rem', color: 'var(--danger)',
                          }}>
                          Annuler
                        </button>
                      )}
                    </div>
                  )}

                  {/* L'écart : ce qui est entré depuis la clôture. */}
                  {e && (
                    <div style={{
                      marginTop: '.8rem', padding: '.8rem 1rem', borderRadius: 6,
                      background: e.ecart ? 'var(--warning-bg)' : 'var(--success-bg)',
                    }}>
                      {e.ecart ? (
                        <>
                          <p style={{
                            fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--warning)',
                          }}>
                            {money(Math.abs(Number(e.ecart_solde)))} d&apos;écart depuis la clôture
                          </p>
                          <p className="muted" style={{
                            fontSize: 'var(--fs-xs)', marginTop: '.25rem', lineHeight: 1.5,
                            maxWidth: '68ch',
                          }}>
                            {e.lignes_nouvelles.length} écriture
                            {e.lignes_nouvelles.length > 1 ? 's sont entrées' : ' est entrée'}
                            {' '}depuis. Elle{e.lignes_nouvelles.length > 1 ? 's' : ''} relève
                            {e.lignes_nouvelles.length > 1 ? 'nt' : ''} d&apos;une déclaration
                            rectificative ou de la période suivante — la déclaration
                            déposée, elle, ne change pas.
                          </p>
                          {e.lignes_nouvelles.slice(0, 6).map((l, i) => (
                            <p key={i} className="muted" style={{
                              fontSize: 'var(--fs-xs)', marginTop: '.2rem',
                            }}>
                              {l.numero_piece ?? '—'} · {l.tiers} · {money(Number(l.tva))}
                            </p>
                          ))}
                        </>
                      ) : (
                        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--success)' }}>
                          Aucun écart : la base dit toujours la même chose que la
                          déclaration.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialogue
        ouvert={aAnnuler !== null}
        titre="Annuler cette déclaration"
        description={
          `${aAnnuler?.formulaire ?? ''} du ${aAnnuler ? dateLong(aAnnuler.periode_debut) : ''}. `
          + 'La trace est conservée : une déclaration rectifiée doit rester '
          + 'visible, l\u2019administration peut la réclamer.'
        }
        champ="Motif de l&apos;annulation"
        placeholder="Facture retrouvée après dépôt, rectificative déposée…"
        obligatoire
        libelleValider="Annuler la déclaration"
        danger
        onValider={(motif) => { setAAnnuler(null); annuler(motif); }}
        onAnnuler={() => setAAnnuler(null)}
      />
    </>
  );
}
