'use client';

/**
 * L'ÉCHÉANCIER
 *
 * Trois blocs, dans l'ordre où l'on s'en occupe : ce qui est en retard,
 * ce qui tombe ce mois-ci, ce qui vient après.
 *
 * Le délai en jours prime sur la date : « dans 24 jours » se comprend
 * d'un coup, « le 1er septembre » demande un calcul mental. La date
 * reste, en second.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Reference from '@/components/Reference';
import { createClient } from '@/lib/supabase/client';
import { money, dateLong } from '@/lib/format';
import Alerte from '@/components/Alerte';

export type Echeance = {
  source: string; id: string; echeance: string;
  libelle: string; detail: string;
  montant: number | null; nature: string;
  accomplie: boolean; accomplie_le: string | null;
  lien: string | null;
};

export type Groupes = {
  en_retard: Echeance[]; ce_mois: Echeance[];
  a_venir: Echeance[]; accomplies: Echeance[];
  compteurs: { en_retard: number; ce_mois: number };
};

const COULEURS: Record<string, string> = {
  fiscale:      '#8C4A3F',
  juridique:    '#001d3b',
  sociale:      '#3a72a0',
  bancaire:     '#5f6a75',
  abonnement:   '#c08730',
  encaissement: '#4A7C59',
  paiement:     '#8a5f1c',
};

const LIBELLES: Record<string, string> = {
  fiscale: 'Fiscale', juridique: 'Juridique', sociale: 'Sociale',
  bancaire: 'Bancaire', abonnement: 'Abonnement',
  encaissement: 'À encaisser', paiement: 'À payer',
};

function jours(d: string): number {
  return Math.round(
    (new Date(d + 'T12:00:00').getTime() - Date.now()) / 86400000);
}

export default function Echeancier({ groupes, peutAccomplir }: {
  groupes: Groupes; peutAccomplir: boolean;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  async function accomplir(e: Echeance) {
    setEnCours(e.id);
    setErreur(null);
    const supabase = createClient();

    const { data, error } = await supabase.rpc('accomplir_obligation', {
      p_id: e.id,
    });

    if (error) { setErreur(error.message); setEnCours(null); return; }

    const r = data as { suivante?: string } | null;
    setSucces(
      r?.suivante
        ? `Accompli. La prochaine échéance est fixée au ${dateLong(r.suivante)}.`
        : 'Accompli.'
    );
    setEnCours(null);
    router.refresh();
  }

  const rien = groupes.en_retard?.length === 0
    && groupes.ce_mois?.length === 0
    && groupes.a_venir?.length === 0;

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      {/* ---------- L'état ---------- */}
      <div className="card" style={{
        marginBottom: '1.5rem',
        borderLeft: `3px solid ${
          groupes.compteurs?.en_retard > 0 ? 'var(--danger)'
          : groupes.compteurs?.ce_mois > 0 ? 'var(--warning)' : 'var(--success)'}`,
        display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: '20rem' }}>
          <p style={{
            fontFamily: 'var(--display)', fontSize: 'var(--fs-lg)',
            fontWeight: 600, color: 'var(--navy)',
          }}>
            {groupes.compteurs?.en_retard > 0
              ? `${groupes.compteurs.en_retard} échéance${groupes.compteurs.en_retard > 1 ? 's' : ''} dépassée${groupes.compteurs.en_retard > 1 ? 's' : ''}`
              : groupes.compteurs?.ce_mois > 0
              ? `${groupes.compteurs.ce_mois} échéance${groupes.compteurs.ce_mois > 1 ? 's' : ''} ce mois-ci`
              : 'Rien d’urgent'}
          </p>
          <p className="muted" style={{
            fontSize: 'var(--fs-xs)', marginTop: '.15rem', lineHeight: 1.5, maxWidth: '68ch',
          }}>
            Obligations déclaratives, prélèvements attendus, factures à encaisser
            et dettes à payer. Rien n&apos;est saisi deux fois : tout se déduit
            des écritures.
          </p>
        </div>
      </div>

      {rien && (
        <div className="card">
          <div className="etat-vide">
            <p>Aucune échéance à venir.</p>
          </div>
        </div>
      )}

      <Bloc titre="En retard" echeances={groupes.en_retard ?? []}
        couleur="var(--danger)" accomplir={accomplir}
        peutAccomplir={peutAccomplir} enCours={enCours} />

      <Bloc titre="Ce mois-ci" echeances={groupes.ce_mois ?? []}
        couleur="var(--warning)" accomplir={accomplir}
        peutAccomplir={peutAccomplir} enCours={enCours} />

      <Bloc titre="À venir" echeances={groupes.a_venir ?? []}
        couleur="var(--g-300)" accomplir={accomplir}
        peutAccomplir={peutAccomplir} enCours={enCours} />

      {(groupes.accomplies ?? []).length > 0 && (
        <details className="card" style={{ marginTop: '1.25rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)' }}>
            Accomplies — {groupes.accomplies.length}
          </summary>
          <div style={{ marginTop: '.8rem' }}>
            {groupes.accomplies.map((e) => (
              <div key={e.source + e.id} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '.5rem 0', borderBottom: '1px solid var(--g-200)',
                fontSize: 'var(--fs-sm)', color: 'var(--g-500)',
              }}>
                <span>{e.libelle}</span>
                <span className="mono" style={{ fontSize: '.72rem' }}>
                  {e.accomplie_le ? dateLong(e.accomplie_le) : dateLong(e.echeance)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function Bloc({ titre, echeances, couleur, accomplir, peutAccomplir, enCours }: {
  titre: string; echeances: Echeance[]; couleur: string;
  accomplir: (e: Echeance) => void; peutAccomplir: boolean; enCours: string | null;
}) {
  if (echeances.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: '1.25rem', borderLeft: `3px solid ${couleur}` }}>
      <p className="card__title">{titre} — {echeances.length}</p>

      {echeances.map((e) => {
        const j = jours(e.echeance);
        const teinte = COULEURS[e.nature] ?? 'var(--g-500)';

        return (
          <div key={e.source + e.id} style={{
            display: 'flex', alignItems: 'center', gap: '1rem',
            padding: '.85rem 0', borderBottom: '1px solid var(--g-200)',
            flexWrap: 'wrap',
          }}>
            {/* Le délai prime sur la date : « dans 24 jours » se comprend
                d'un coup, « le 1er septembre » demande un calcul. */}
            <div style={{ width: '5.5rem', flexShrink: 0, textAlign: 'right' }}>
              <p className="amount" style={{
                fontFamily: 'var(--display)', fontSize: '1.05rem', fontWeight: 600,
                color: j < 0 ? 'var(--danger)' : j <= 7 ? 'var(--warning)' : 'var(--navy)',
              }}>
                {j < 0 ? `+${-j}` : j}
              </p>
              <p className="muted" style={{ fontSize: '.62rem' }}>
                {j < 0 ? 'jours de retard' : j === 0 ? 'aujourd’hui' : 'jours'}
              </p>
            </div>

            <span style={{
              width: 3, alignSelf: 'stretch', borderRadius: 2,
              background: teinte, flexShrink: 0,
            }} />

            <div style={{ flex: 1, minWidth: '16rem' }}>
              <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 500, color: 'var(--g-800)' }}>
                {/*
                  Une facture ou une dette ouvre son aperçu ; une
                  obligation déclarative n'est pas une pièce comptable et
                  reste du texte.
                */}
                {e.source === 'facture' || e.source === 'fournisseur' ? (
                  <Reference id={e.id} style={{ color: 'var(--navy)' }}>
                    {e.libelle}
                  </Reference>
                ) : e.lien ? (
                  <Link href={e.lien} style={{ color: 'var(--navy)' }}>{e.libelle}</Link>
                ) : e.libelle}
              </p>
              <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.1rem' }}>
                {dateLong(e.echeance)} · {LIBELLES[e.nature] ?? e.nature}
                {e.detail && ` · ${e.detail}`}
              </p>
            </div>

            {e.montant !== null && (
              <span className="amount" style={{
                fontSize: 'var(--fs-sm)', fontWeight: 600,
                color: e.nature === 'encaissement' ? 'var(--success)' : 'var(--navy)',
                whiteSpace: 'nowrap',
              }}>
                {money(Number(e.montant))}
              </span>
            )}

            {/* Seule une obligation se coche : une facture s'éteint par
                son règlement, pas par une case. */}
            {e.source === 'obligation' && peutAccomplir && (
              <button onClick={() => accomplir(e)} disabled={enCours === e.id}
                className="btn btn--ghost"
                style={{ minHeight: 28, padding: '.15rem .6rem', fontSize: '.7rem' }}>
                {enCours === e.id ? '…' : 'Accompli'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
