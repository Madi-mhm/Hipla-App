'use client';

/**
 * TVA — SUIVI ET DÉCLARATION
 *
 * La règle qui gouverne tout : sur les prestations de services, la TVA
 * est exigible à l'ENCAISSEMENT, pas à l'émission (art. 269-2-c du CGI).
 * Symétriquement, celle d'un achat de services n'est déductible qu'au
 * paiement.
 *
 * L'écran ne calcule rien : il lit `v_tva_exigible`, où chaque fait
 * générateur est déjà daté. Et chaque montant reste cliquable jusqu'à
 * la pièce d'origine — une déclaration qu'on ne peut pas justifier ligne
 * à ligne n'est pas défendable.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { money, date } from '@/lib/format';

type Bloc = { base: number; tva: number };

export type Ligne = {
  piece_id: string;
  numero_piece: string | null;
  date_exigibilite: string;
  tiers: string;
  sens: 'debit' | 'credit';
  regime: string;
  fait_generateur: string;
  base: number;
  tva: number;
  lien: string;
};

export type Declaration = {
  debut: string;
  fin: string;
  collectee: { taux_20: Bloc; taux_10: Bloc; taux_55: Bloc; autoliquidation: Bloc; total: number };
  deductible: { achats: number; autoliquidation: number; total: number };
  solde: number;
  lignes: Ligne[];
  nb_lignes: number;
};

export type Suivi = {
  exercice_debut: string;
  exercice_fin: string;
  regime: string;
  exercice_clos: boolean;
  exercice: Declaration;
  par_mois: Array<{ mois: string; collectee: number; deductible: number; solde: number }>;
};

const LIBELLE_FAIT: Record<string, string> = {
  reglement: 'règlement',
  date_piece: 'livraison',
  autoliquidation_collectee: 'autoliquidation — collectée',
  autoliquidation_deduite: 'autoliquidation — déduite',
};

export default function SuiviTva({ suivi }: { suivi: Suivi }) {
  const [periode, setPeriode] = useState<'exercice' | string>('exercice');
  const d = suivi.exercice;

  const lignes = useMemo(() => {
    if (periode === 'exercice') return d.lignes;
    return d.lignes.filter((l) => l.date_exigibilite.slice(0, 7) === periode);
  }, [periode, d.lignes]);

  const simplifie = suivi.regime === 'simplifie';

  return (
    <>
      {/* ---------- Le régime ---------- */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card__title">Régime et échéance</p>
        <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6, maxWidth: '70ch' }}>
          {simplifie ? (
            <>
              <strong>Réel simplifié</strong> — une seule déclaration annuelle,
              la <strong>CA12E</strong>, à déposer dans les trois mois de la
              clôture. Exercice du {date(suivi.exercice_debut)} au{' '}
              {date(suivi.exercice_fin)}.
            </>
          ) : (
            <>
              <strong>Réel normal</strong> — une déclaration <strong>CA3</strong>{' '}
              chaque mois. Exercice du {date(suivi.exercice_debut)} au{' '}
              {date(suivi.exercice_fin)}.
            </>
          )}
        </p>
        <p className="muted" style={{
          fontSize: 'var(--fs-sm)', marginTop: '.6rem', lineHeight: 1.55, maxWidth: '70ch',
        }}>
          La TVA d&apos;une prestation de services est exigible à
          l&apos;encaissement, pas à l&apos;émission de la facture. Celle
          d&apos;un achat de services n&apos;est déductible qu&apos;au paiement.
          Les montants ci-dessous suivent cette règle : ils bougent quand
          l&apos;argent bouge.
        </p>
      </div>

      {/* ---------- Le solde ---------- */}
      <div className="card" style={{
        marginBottom: '1.25rem',
        borderLeft: `3px solid ${d.solde > 0 ? 'var(--warning)' : 'var(--success)'}`,
      }}>
        <p className="card__title">
          {d.solde > 0 ? 'TVA à payer' : d.solde < 0 ? 'Crédit de TVA' : 'Solde de TVA'}
        </p>
        <p className="amount" style={{
          fontSize: '2rem', fontFamily: 'var(--display)', fontWeight: 600,
          color: d.solde > 0 ? 'var(--navy)' : 'var(--success)',
        }}>
          {money(Math.abs(Number(d.solde)))}
        </p>
        <p className="muted" style={{
          fontSize: 'var(--fs-sm)', marginTop: '.4rem', lineHeight: 1.55, maxWidth: '68ch',
        }}>
          {d.solde > 0
            ? 'Ce que la société devra au Trésor pour cet exercice, en l\u2019état.'
            : d.solde < 0
              ? 'Ce que le Trésor devra à la société, remboursable ou reportable.'
              : 'Aucun mouvement de TVA sur cet exercice.'}
          {' '}Cumulé sur {d.nb_lignes} fait{d.nb_lignes > 1 ? 's' : ''} générateur
          {d.nb_lignes > 1 ? 's' : ''}.
        </p>
      </div>

      {/* ---------- La déclaration ---------- */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap',
        }}>
          <p className="card__title" style={{ margin: 0 }}>
            Ce que porterait la déclaration
          </p>
          {/*
            « Porterait » : tant que la période n'est pas figée, ces
            montants suivent les écritures et changent à chaque saisie.
          */}
          <Link href="/tva/cloture" className="btn btn--ghost"
            style={{ minHeight: 28, padding: '.15rem .7rem', fontSize: '.72rem' }}>
            Figer une période
          </Link>
        </div>

        <div className="table-scroll">
          <table style={{ minWidth: 480, fontSize: 'var(--fs-sm)', marginTop: '.6rem' }}>
            <tbody>
              <tr style={enTete}>
                <td style={{ ...td, fontWeight: 600 }} colSpan={3}>TVA collectée</td>
              </tr>
              <Rang libelle="Ventes taxées à 20 %" bloc={d.collectee.taux_20} />
              <Rang libelle="Ventes taxées à 10 %" bloc={d.collectee.taux_10} />
              <Rang libelle="Ventes taxées à 5,5 %" bloc={d.collectee.taux_55} />
              <Rang libelle="Achats autoliquidés" bloc={d.collectee.autoliquidation}
                note="prestations intra-UE et hors UE" />
              <tr style={{ borderTop: '1px solid var(--g-300)' }}>
                <td style={{ ...td, fontWeight: 600 }}>Total collecté</td>
                <td style={td} />
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }} className="amount">
                  {money(Number(d.collectee.total))}
                </td>
              </tr>

              <tr style={enTete}>
                <td style={{ ...td, fontWeight: 600, paddingTop: '1.2rem' }} colSpan={3}>
                  TVA déductible
                </td>
              </tr>
              <tr>
                <td style={td}>Achats et charges</td>
                <td style={td} />
                <td style={{ ...td, textAlign: 'right' }} className="amount">
                  {money(Number(d.deductible.achats))}
                </td>
              </tr>
              <tr>
                <td style={td}>
                  Achats autoliquidés
                  <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                    même montant que la ligne collectée, solde nul
                  </span>
                </td>
                <td style={td} />
                <td style={{ ...td, textAlign: 'right' }} className="amount">
                  {money(Number(d.deductible.autoliquidation))}
                </td>
              </tr>
              <tr style={{ borderTop: '1px solid var(--g-300)' }}>
                <td style={{ ...td, fontWeight: 600 }}>Total déductible</td>
                <td style={td} />
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }} className="amount">
                  {money(Number(d.deductible.total))}
                </td>
              </tr>

              <tr style={{ borderTop: '2px solid var(--navy)' }}>
                <td style={{ ...td, fontWeight: 700, paddingTop: '.8rem' }}>
                  {d.solde >= 0 ? 'À payer' : 'Crédit'}
                </td>
                <td style={td} />
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, paddingTop: '.8rem' }}
                  className="amount">
                  {money(Math.abs(Number(d.solde)))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="muted" style={{
          fontSize: 'var(--fs-xs)', marginTop: '1rem', lineHeight: 1.5, maxWidth: '70ch',
        }}>
          Les achats autoliquidés figurent des deux côtés pour le même montant :
          le solde est nul, mais leur omission est une infraction. C&apos;est
          l&apos;oubli le plus fréquent des petites structures.
        </p>
      </div>

      {/* ---------- Le détail ---------- */}
      <div className="card">
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
        }}>
          <p className="card__title" style={{ margin: 0 }}>
            Détail — {lignes.length} fait{lignes.length > 1 ? 's' : ''} générateur
            {lignes.length > 1 ? 's' : ''}
          </p>
          {suivi.par_mois.length > 1 && (
            <select value={periode} onChange={(e) => setPeriode(e.target.value)}
              style={{ maxWidth: '14rem' }}>
              <option value="exercice">Tout l&apos;exercice</option>
              {suivi.par_mois.map((m) => (
                <option key={m.mois} value={m.mois}>{m.mois}</option>
              ))}
            </select>
          )}
        </div>

        {lignes.length === 0 ? (
          <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: '.8rem' }}>
            Aucun fait générateur sur cette période.
          </p>
        ) : (
          <div className="table-scroll" style={{ marginTop: '.8rem' }}>
            <table style={{ minWidth: 620, fontSize: 'var(--fs-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                  <th style={th}>Exigible le</th>
                  <th style={th}>Pièce</th>
                  <th style={th}>Tiers</th>
                  <th style={th}>Fait générateur</th>
                  <th style={{ ...th, textAlign: 'right' }}>Base</th>
                  <th style={{ ...th, textAlign: 'right' }}>TVA</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={`${l.piece_id}-${l.fait_generateur}-${i}`}
                    style={{ borderBottom: '1px solid var(--g-200)' }}>
                    <td style={td}>{date(l.date_exigibilite)}</td>
                    <td style={td} className="mono">
                      <Link href={l.lien} style={{ color: 'var(--navy)', fontSize: '.72rem' }}>
                        {l.numero_piece ?? 'ouvrir'}
                      </Link>
                    </td>
                    <td style={td}>{l.tiers}</td>
                    <td style={td} className="muted">
                      {LIBELLE_FAIT[l.fait_generateur] ?? l.fait_generateur}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }} className="amount">
                      {money(Number(l.base))}
                    </td>
                    <td style={{
                      ...td, textAlign: 'right', fontWeight: 600,
                      color: l.sens === 'credit' ? 'var(--navy)' : 'var(--success)',
                    }} className="amount">
                      {l.sens === 'credit' ? '+ ' : '− '}{money(Number(l.tva))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="muted" style={{
          fontSize: 'var(--fs-xs)', marginTop: '.9rem', lineHeight: 1.5, maxWidth: '70ch',
        }}>
          Chaque ligne mène à sa pièce. Une déclaration qu&apos;on ne peut pas
          justifier ligne à ligne n&apos;est pas défendable devant un
          vérificateur.
        </p>
      </div>
    </>
  );
}

function Rang({ libelle, bloc, note }: { libelle: string; bloc: Bloc; note?: string }) {
  return (
    <tr>
      <td style={td}>
        {libelle}
        {note && (
          <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
            {note}
          </span>
        )}
      </td>
      <td style={{ ...td, textAlign: 'right' }} className="amount muted">
        {money(Number(bloc.base))}
      </td>
      <td style={{ ...td, textAlign: 'right' }} className="amount">
        {money(Number(bloc.tva))}
      </td>
    </tr>
  );
}

const enTete: React.CSSProperties = { borderBottom: '1px solid var(--g-200)' };
const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)',
  fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.55rem .4rem', verticalAlign: 'top' };
