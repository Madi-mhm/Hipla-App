'use client';

/**
 * CE QU'IL FAUT RELANCER
 *
 * Une facture échue, non soldée, et dont la dernière relance date de
 * plus de huit jours.
 *
 * TROIS DEGRÉS, DÉDUITS DU RETARD
 * · avant l'échéance — un rappel, ton neutre ;
 * · jusqu'à trente jours — une relance, pénalités annoncées ;
 * · au-delà — une mise en demeure, qui fait courir les intérêts.
 *
 * Le système ne les choisit pas au hasard : envoyer une mise en demeure
 * pour trois jours de retard coûte un client, envoyer un rappel poli
 * après trois mois coûte une créance.
 *
 * CE QU'IL NE PEUT PAS SAVOIR
 * Il enregistre ce qui est TÉLÉCHARGÉ, pas ce qui est envoyé. Le bouton
 * produit le PDF et note l'envoi ; à vous de l'expédier.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money, date, dateLong } from '@/lib/format';
import Alerte from '@/components/Alerte';
import Reference from '@/components/Reference';

export type Relance = {
  id: string; numero_piece: string | null; tiers: string;
  date_piece: string; date_echeance: string;
  montant_ttc: number; reste_du: number; jours_retard: number;
  relances_envoyees: number; derniere_relance: string | null;
  degre_suggere: 'rappel' | 'relance' | 'mise_en_demeure';
  delai_respecte: boolean; prochaine_possible: string;
  historique: Array<{
    degre: string; envoyee_le: string; reste_du: number; moyen: string | null;
  }>;
};

const DEGRES: Record<string, { libelle: string; classe: string; aide: string }> = {
  rappel: {
    libelle: 'Rappel d\u2019échéance', classe: 'badge--info',
    aide: 'Ton neutre, aucune pénalité mentionnée. Un client qui a oublié ne doit pas se sentir accusé.',
  },
  relance: {
    libelle: 'Relance', classe: 'badge--warning',
    aide: 'Le retard est chiffré, les pénalités annoncées, et une porte reste ouverte.',
  },
  mise_en_demeure: {
    libelle: 'Mise en demeure', classe: 'badge--danger',
    aide: 'Délai de huit jours, article 1344 du code civil. C\u2019est la pièce qu\u2019un tribunal réclamera.',
  },
};

export default function Relances({ lignes, peutRelancer }: {
  lignes: Relance[]; peutRelancer: boolean;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);

  async function relancer(l: Relance) {
    setEnCours(l.id);
    setErreur(null);
    setSucces(null);
    const supabase = createClient();

    // L'enregistrement d'abord : si la base refuse — délai non écoulé,
    // facture soldée entre-temps — on ne produit pas le document.
    const { error } = await supabase.rpc('enregistrer_relance', {
      p_piece: l.id,
      p_degre: l.degre_suggere,
      p_moyen: 'courriel',
    });

    if (error) { setErreur(error.message); setEnCours(null); return; }

    // Puis le PDF, dans un onglet.
    window.open(`/api/ventes/${l.id}/relance`, '_blank', 'noopener');

    setSucces(
      `${DEGRES[l.degre_suggere].libelle} enregistrée pour ${l.tiers}. `
      + 'Le document s\u2019ouvre dans un onglet — il reste à l\u2019envoyer.'
    );
    setEnCours(null);
    router.refresh();
  }

  if (lignes.length === 0) {
    return (
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card__title">Relances</p>
        <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
          Aucune facture en attente de règlement.
        </p>
      </div>
    );
  }

  const echues = lignes.filter((l) => l.jours_retard > 0);
  const aVenir = lignes.filter((l) => l.jours_retard <= 0);

  return (
    <div className="card" style={{
      marginBottom: '1.25rem',
      borderLeft: echues.length > 0 ? '3px solid var(--warning)' : undefined,
    }}>
      <p className="card__title">
        {echues.length > 0
          ? `${echues.length} facture${echues.length > 1 ? 's' : ''} échue${echues.length > 1 ? 's' : ''}`
          : 'Encaissements attendus'}
      </p>

      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      {[...echues, ...aVenir].map((l) => {
        const d = DEGRES[l.degre_suggere];
        const bloque = !l.delai_respecte;

        return (
          <div key={l.id} style={{
            padding: '.85rem 0', borderBottom: '1px solid var(--g-200)',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: '17rem' }}>
                <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 500 }}>
                  {l.tiers}
                  {/* Le numéro était du texte : seul endroit de la séance
                      où une pièce s'affichait sans pouvoir s'ouvrir. */}
                  <Reference id={l.id} className="mono" style={{
                    marginLeft: '.5rem', fontSize: '.7rem', fontWeight: 400,
                    color: 'var(--navy)',
                  }}>
                    {l.numero_piece ?? 'Ouvrir'}
                  </Reference>
                </p>
                <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.15rem' }}>
                  {l.jours_retard > 0
                    ? `Échue depuis ${l.jours_retard} jour${l.jours_retard > 1 ? 's' : ''}`
                    : `Échéance le ${dateLong(l.date_echeance)}`}
                  {l.relances_envoyees > 0 && (
                    <> · {l.relances_envoyees} relance{l.relances_envoyees > 1 ? 's' : ''} envoyée
                    {l.relances_envoyees > 1 ? 's' : ''}
                    {l.derniere_relance && `, la dernière le ${date(l.derniere_relance)}`}</>
                  )}
                </p>
              </div>

              <div style={{ textAlign: 'right' }}>
                <p className="amount" style={{
                  fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--navy)',
                }}>
                  {money(Number(l.reste_du))}
                </p>
                {Number(l.reste_du) < Number(l.montant_ttc) - 0.005 && (
                  <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                    sur {money(Number(l.montant_ttc))}
                  </p>
                )}
              </div>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: '.6rem',
              marginTop: '.6rem', flexWrap: 'wrap',
            }}>
              <span className={`badge ${d.classe}`} style={{ fontSize: '.66rem' }}>
                {d.libelle}
              </span>

              {peutRelancer && (
                bloque ? (
                  <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                    Prochaine possible le {date(l.prochaine_possible)}
                  </span>
                ) : (
                  <button onClick={() => relancer(l)} disabled={enCours === l.id}
                    className="btn btn--ghost"
                    style={{ minHeight: 28, padding: '.15rem .7rem', fontSize: '.72rem' }}>
                    {enCours === l.id ? 'Préparation…' : 'Envoyer'}
                  </button>
                )
              )}

              {l.historique.length > 0 && (
                <button onClick={() => setOuvert(ouvert === l.id ? null : l.id)}
                  style={{
                    border: 0, background: 'none', padding: 0, cursor: 'pointer',
                    fontSize: '.68rem', color: 'var(--g-500)', textDecoration: 'underline',
                  }}>
                  {ouvert === l.id ? 'Masquer' : 'Historique'}
                </button>
              )}
            </div>

            {/* L'historique : ce qui a été réclamé, et quand. C'est ce
                qui rend un recouvrement défendable. */}
            {ouvert === l.id && (
              <div style={{
                marginTop: '.6rem', padding: '.7rem .9rem', borderRadius: 6,
                background: 'var(--g-50)',
              }}>
                {l.historique.map((h, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between',
                    gap: '1rem', padding: '.2rem 0', fontSize: 'var(--fs-xs)',
                  }}>
                    <span>
                      {DEGRES[h.degre]?.libelle ?? h.degre}
                      {h.moyen && <span className="muted"> · {h.moyen}</span>}
                    </span>
                    <span className="muted mono">
                      {date(h.envoyee_le)} · {money(Number(h.reste_du))}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="muted" style={{
              fontSize: 'var(--fs-xs)', marginTop: '.4rem', lineHeight: 1.5, maxWidth: '68ch',
            }}>
              {d.aide}
            </p>
          </div>
        );
      })}

      <p className="muted" style={{
        fontSize: 'var(--fs-xs)', marginTop: '.9rem', lineHeight: 1.5, maxWidth: '70ch',
      }}>
        Le document est produit et l&apos;envoi noté — mais c&apos;est vous
        qui l&apos;expédiez. Huit jours au minimum entre deux relances :
        relancer tous les jours n&apos;accélère pas le paiement.
      </p>
    </div>
  );
}
