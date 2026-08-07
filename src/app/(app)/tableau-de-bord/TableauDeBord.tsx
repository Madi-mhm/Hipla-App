'use client';

/**
 * TABLEAU DE BORD
 *
 * Quatre questions, dans l'ordre où un dirigeant se les pose : où en est
 * le résultat, où part l'argent, où en est la trésorerie, et la
 * comptabilité tient-elle debout.
 *
 * PARTIS PRIS DE PRÉSENTATION
 *
 * · Un seul chiffre domine — le résultat. Les autres l'entourent sans
 *   le concurrencer. Une page où tout crie ne dit rien.
 * · Les couleurs viennent de la charte : marine et or. Le rouge et le
 *   vert sont réservés au sens comptable, jamais à la décoration, pour
 *   qu'une tache colorée signifie toujours quelque chose.
 * · Les chiffres sont en chasse fixe et alignés à droite : c'est ce qui
 *   permet de comparer deux montants d'un coup d'œil.
 * · Le survol révèle le détail plutôt que de l'afficher en permanence.
 *   Un graphique surchargé d'étiquettes cesse d'être un graphique.
 */

import { useState } from 'react';
import { money } from '@/lib/format';

type Mois = { mois: string; libelle: string; charges: number; produits: number };
type Categorie = { categorie: string; compte: string; montant: number; lignes: number };
type Controle = { libelle: string; detail: string; ok: boolean; mesure: string };

export type Bord = {
  exercice_debut: string;
  exercice_fin: string;
  regime: string;
  par_mois: Mois[];
  categories: Categorie[];
  tresorerie: Record<string, number>;
  controles: Controle[];
  charges_total: number;
  produits_total: number;
  anomalies: number;
};

/**
 * Dégradé marine vers or, en passant par des teintes intermédiaires
 * lisibles. Huit valeurs suffisent : au-delà, l'œil ne distingue plus.
 */
const TEINTES = [
  '#001d3b', '#0b3055', '#1d4f7c', '#3a72a0',
  '#c08730', '#d4a256', '#8a5f1c', '#5f6a75',
];

export default function TableauDeBord({ bord }: { bord: Bord }) {
  const t = bord.tresorerie;
  const resultat = Number(bord.produits_total) - Number(bord.charges_total);
  const anomalies = bord.controles.filter((c) => !c.ok);

  return (
    <>
      {/* ================= LE CHIFFRE QUI DOMINE ================= */}
      <section style={heros}>
        <div style={herosGauche}>
          <p style={herosEtiquette}>Résultat de l&apos;exercice</p>
          <p style={{
            ...herosChiffre,
            color: resultat >= 0 ? 'var(--success)' : 'var(--gold-soft)',
          }}>
            {resultat < 0 && '−'}{money(Math.abs(resultat))}
          </p>
          <p style={herosNote}>
            {resultat >= 0 ? 'Bénéfice' : 'Perte'} · {money(Number(bord.produits_total))} de
            produits, {money(Number(bord.charges_total))} de charges
          </p>
        </div>

        <div style={herosDroite}>
          <ChiffreHeros titre="Solde bancaire" valeur={Number(t.solde_banque)} />
          <ChiffreHeros titre="Crédit de TVA" valeur={Math.abs(Number(t.tva_a_payer))}
            note={Number(t.tva_a_payer) >= 0 ? 'à reverser' : 'récupérable'} />
          <ChiffreHeros titre="Compte courant" valeur={Number(t.compte_courant)}
            note="dû aux associés" />
        </div>
      </section>

      {/* ================= L'ÉTAT DE LA COMPTABILITÉ ================= */}
      <div className="card" style={{
        marginBottom: '1.5rem', display: 'flex', alignItems: 'center',
        gap: '1rem', flexWrap: 'wrap',
        borderLeft: `3px solid ${anomalies.length === 0 ? 'var(--success)' : 'var(--warning)'}`,
      }}>
        <span style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          display: 'grid', placeItems: 'center',
          background: anomalies.length === 0 ? 'var(--success-bg)' : 'var(--warning-bg)',
          color: anomalies.length === 0 ? 'var(--success)' : 'var(--warning)',
          fontSize: '1rem', fontWeight: 700,
        }}>
          {anomalies.length === 0 ? '✓' : anomalies.length}
        </span>
        <div style={{ flex: 1, minWidth: '20rem' }}>
          <p style={{
            fontFamily: 'var(--display)', fontSize: 'var(--fs-lg)', fontWeight: 600,
            color: 'var(--navy)',
          }}>
            {anomalies.length === 0
              ? 'La comptabilité est cohérente'
              : `${anomalies.length} point${anomalies.length > 1 ? 's' : ''} à reprendre`}
          </p>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.15rem' }}>
            {anomalies.length === 0
              ? 'Six contrôles croisés, aucun écart'
              : anomalies.map((a) => a.libelle).join(' · ')}
          </p>
        </div>
      </div>

      {/* ================= CHARGES ET PRODUITS ================= */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <EnTete titre="Charges et produits"
          note="Échelle commune aux deux séries · survolez un mois" />
        <Histogramme mois={bord.par_mois} />
      </div>

      {/* ================= OÙ PART L'ARGENT ================= */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <EnTete titre="Où part l’argent"
          note={`${bord.categories.length} poste${bord.categories.length > 1 ? 's' : ''} de charges`} />
        {bord.categories.length === 0 ? (
          <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: '.6rem' }}>
            Aucune charge sur cet exercice.
          </p>
        ) : (
          <Ventilation categories={bord.categories} total={Number(bord.charges_total)} />
        )}
      </div>

      {/* ================= ENGAGEMENTS ================= */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <EnTete titre="Engagements" note="Ce qui reste à encaisser et à payer" />
        <div style={grilleEngagements}>
          <Engagement titre="Reste à encaisser" valeur={Number(t.a_encaisser)}
            note={Number(t.echu_non_regle) > 0
              ? `dont ${money(Number(t.echu_non_regle))} échus`
              : 'Factures émises non réglées'}
            alerte={Number(t.echu_non_regle) > 0} />
          <Engagement titre="Reste à payer" valeur={Number(t.a_payer)}
            note="Dettes fournisseurs ouvertes" />
          <Engagement titre="Compte courant d'associé" valeur={Number(t.compte_courant)}
            note="Remboursable sans impôt ni charge" />
        </div>
      </div>

      {/* ================= CONTRÔLES ================= */}
      <div className="card">
        <EnTete titre="Contrôles de cohérence"
          note="Chaque ligne compare deux chemins de calcul indépendants" />
        <div style={{ marginTop: '.4rem' }}>
          {bord.controles.map((c) => (
            <div key={c.libelle} style={{
              display: 'flex', alignItems: 'center', gap: '.9rem',
              padding: '.85rem 0', borderBottom: '1px solid var(--g-200)',
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                display: 'grid', placeItems: 'center', fontSize: '.7rem', fontWeight: 700,
                background: c.ok ? 'var(--success-bg)' : 'var(--warning-bg)',
                color: c.ok ? 'var(--success)' : 'var(--warning)',
              }}>
                {c.ok ? '✓' : '!'}
              </span>
              <div style={{ flex: 1, minWidth: '16rem' }}>
                <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 500, color: 'var(--g-800)' }}>
                  {c.libelle}
                </p>
                <p className="muted" style={{
                  fontSize: 'var(--fs-xs)', marginTop: '.1rem', lineHeight: 1.45,
                }}>
                  {c.detail}
                </p>
              </div>
              <span className="mono" style={{
                fontSize: '.73rem', whiteSpace: 'nowrap',
                color: c.ok ? 'var(--g-400)' : 'var(--warning)',
                fontWeight: c.ok ? 400 : 600,
              }}>
                {c.mesure}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ================================================================ */
/*  Éléments                                                        */
/* ================================================================ */

function EnTete({ titre, note }: { titre: string; note: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      gap: '1rem', flexWrap: 'wrap', paddingBottom: '.7rem',
      borderBottom: '1px solid var(--g-200)', marginBottom: '.9rem',
    }}>
      <h2 style={{
        fontFamily: 'var(--display)', fontSize: 'var(--fs-lg)', fontWeight: 600,
        color: 'var(--navy)', letterSpacing: '-0.01em',
      }}>
        {titre}
      </h2>
      <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{note}</span>
    </div>
  );
}

function ChiffreHeros({ titre, valeur, note }: {
  titre: string; valeur: number; note?: string;
}) {
  return (
    <div style={{ minWidth: '8.5rem' }}>
      <p style={{
        fontSize: '.68rem', letterSpacing: '.08em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,.55)',
      }}>
        {titre}
      </p>
      <p className="amount" style={{
        fontFamily: 'var(--display)', fontSize: '1.15rem', fontWeight: 600,
        color: 'var(--g-0)', marginTop: '.2rem',
      }}>
        {money(valeur)}
      </p>
      {note && (
        <p style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.45)', marginTop: '.1rem' }}>
          {note}
        </p>
      )}
    </div>
  );
}

function Engagement({ titre, valeur, note, alerte }: {
  titre: string; valeur: number; note: string; alerte?: boolean;
}) {
  return (
    <div style={{
      padding: '.9rem 1rem', background: 'var(--g-50)', borderRadius: 6,
      borderLeft: `2px solid ${alerte ? 'var(--warning)' : 'var(--g-300)'}`,
    }}>
      <p style={{
        fontSize: '.68rem', letterSpacing: '.07em', textTransform: 'uppercase',
        color: 'var(--g-500)',
      }}>
        {titre}
      </p>
      <p className="amount" style={{
        fontFamily: 'var(--display)', fontSize: '1.25rem', fontWeight: 600,
        color: alerte ? 'var(--warning)' : 'var(--navy)', marginTop: '.25rem',
      }}>
        {money(valeur)}
      </p>
      <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.15rem' }}>{note}</p>
    </div>
  );
}

/* ================================================================ */
/*  Histogramme                                                     */
/* ================================================================ */

function Histogramme({ mois }: { mois: Mois[] }) {
  const [survole, setSurvole] = useState<number | null>(null);
  if (mois.length === 0) return null;

  const max = Math.max(
    ...mois.map((m) => Math.max(Number(m.charges), Number(m.produits))), 1);

  const H = 190;
  const PAS = 78;
  const MARGE = 66;
  const largeur = MARGE + mois.length * PAS + 12;

  const echelle = [0, 0.25, 0.5, 0.75, 1];
  const actif = survole !== null ? mois[survole] : null;

  return (
    <div style={{ position: 'relative' }}>
      <div className="table-scroll">
        {/*
          Dimensions en pixels : un SVG à viewBox étiré en pourcentage
          agrandit le texte dans la même proportion.
        */}
        <svg width={largeur} height={H + 44} viewBox={`0 0 ${largeur} ${H + 44}`}
          style={{ display: 'block', maxWidth: '100%' }}
          onMouseLeave={() => setSurvole(null)}>

          {echelle.map((f) => (
            <g key={f}>
              <line x1={MARGE - 8} y1={H - f * H} x2={largeur} y2={H - f * H}
                stroke="var(--g-200)" strokeWidth={f === 0 ? 1.5 : 1}
                strokeDasharray={f === 0 ? undefined : '3 4'} />
              <text x={MARGE - 14} y={H - f * H + 3.5} fontSize={10}
                fill="var(--g-400)" textAnchor="end" fontFamily="var(--mono)">
                {Math.round(max * f)}
              </text>
            </g>
          ))}

          {mois.map((m, i) => {
            const x = MARGE + i * PAS;
            const hc = (Number(m.charges) / max) * H;
            const hp = (Number(m.produits) / max) * H;
            const vif = survole === null || survole === i;

            return (
              <g key={m.mois}
                onMouseEnter={() => setSurvole(i)}
                style={{ cursor: 'default' }}>

                {/* Zone de survol : plus large que les barres, pour que
                    le pointeur n'ait pas à viser juste. */}
                <rect x={x - 8} y={0} width={PAS} height={H + 40} fill="transparent" />

                {survole === i && (
                  <rect x={x - 8} y={0} width={PAS} height={H}
                    fill="var(--navy)" opacity={0.035} rx={4} />
                )}

                <rect x={x} y={H - Math.max(hc, 0)} width={24}
                  height={Math.max(hc, 1.5)} rx={3}
                  fill="var(--navy)" opacity={vif ? 1 : 0.28}
                  style={{ transition: 'opacity .15s' }} />
                <rect x={x + 28} y={H - Math.max(hp, 0)} width={24}
                  height={Math.max(hp, 1.5)} rx={3}
                  fill="var(--gold)" opacity={vif ? 1 : 0.28}
                  style={{ transition: 'opacity .15s' }} />

                <text x={x + 26} y={H + 18} fontSize={11}
                  fill={survole === i ? 'var(--navy)' : 'var(--g-500)'}
                  fontWeight={survole === i ? 600 : 400} textAnchor="middle">
                  {m.libelle}
                </text>
                <text x={x + 26} y={H + 33} fontSize={10} fill="var(--g-400)"
                  textAnchor="middle" fontFamily="var(--mono)">
                  {m.mois.slice(0, 4)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Le détail au survol, hors du SVG : le texte reste net et
          sélectionnable, et la mise en forme suit la charte. */}
      <div style={{
        display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap',
        marginTop: '.9rem', paddingTop: '.8rem', borderTop: '1px solid var(--g-200)',
        minHeight: '2.6rem',
      }}>
        <Pastille couleur="var(--navy)" texte="Charges" />
        <Pastille couleur="var(--gold)" texte="Produits" />

        {actif ? (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '1.4rem' }}>
            <Detail etiquette={actif.libelle + ' — charges'}
              valeur={Number(actif.charges)} couleur="var(--navy)" />
            <Detail etiquette="produits" valeur={Number(actif.produits)}
              couleur="var(--gold-ink)" />
            <Detail etiquette="résultat"
              valeur={Number(actif.produits) - Number(actif.charges)}
              couleur={Number(actif.produits) - Number(actif.charges) >= 0
                ? 'var(--success)' : 'var(--danger)'} />
          </span>
        ) : (
          <span className="muted" style={{
            marginLeft: 'auto', fontSize: 'var(--fs-xs)', fontStyle: 'italic',
          }}>
            Survolez un mois pour le détail
          </span>
        )}
      </div>
    </div>
  );
}

/* ================================================================ */
/*  Ventilation                                                     */
/* ================================================================ */

function Ventilation({ categories, total }: { categories: Categorie[]; total: number }) {
  const [survole, setSurvole] = useState<number | null>(null);

  const R = 84;
  const r = 56;
  const cx = 98;
  const cy = 98;
  let angle = -Math.PI / 2;

  const arcs = categories.slice(0, 8).map((c, i) => {
    const part = Number(c.montant) / (total || 1);
    const debut = angle;
    const fin = angle + part * Math.PI * 2;
    angle = fin;

    // Le segment survolé s'écarte légèrement du centre : c'est plus
    // lisible qu'un simple changement de teinte sur un anneau fin.
    const milieu = (debut + fin) / 2;
    const ecart = survole === i ? 5 : 0;
    const dx = ecart * Math.cos(milieu);
    const dy = ecart * Math.sin(milieu);

    const grand = fin - debut > Math.PI ? 1 : 0;
    const p = (rayon: number, a: number) =>
      `${cx + dx + rayon * Math.cos(a)} ${cy + dy + rayon * Math.sin(a)}`;

    return {
      cle: c.categorie + c.compte,
      teinte: TEINTES[i % TEINTES.length],
      d: `M ${p(R, debut)} A ${R} ${R} 0 ${grand} 1 ${p(R, fin)}`
        + ` L ${p(r, fin)} A ${r} ${r} 0 ${grand} 0 ${p(r, debut)} Z`,
    };
  });

  const actif = survole !== null ? categories[survole] : null;

  return (
    <div style={{
      display: 'flex', gap: '2.5rem', alignItems: 'center',
      flexWrap: 'wrap', marginTop: '.5rem',
    }}>
      <svg width={200} height={200} viewBox="0 0 196 196"
        style={{ display: 'block', flexShrink: 0 }}
        onMouseLeave={() => setSurvole(null)}>
        {arcs.map((a, i) => (
          <path key={a.cle} d={a.d} fill={a.teinte}
            stroke="var(--g-0)" strokeWidth={2}
            opacity={survole === null || survole === i ? 1 : 0.35}
            onMouseEnter={() => setSurvole(i)}
            style={{ transition: 'opacity .15s', cursor: 'default' }} />
        ))}

        {actif ? (
          <>
            <text x={cx} y={cy - 6} textAnchor="middle" fontSize={16}
              fontFamily="var(--display)" fontWeight={600} fill="var(--navy)">
              {money(Number(actif.montant))}
            </text>
            <text x={cx} y={cy + 11} textAnchor="middle" fontSize={9.5}
              fill="var(--g-500)">
              {((Number(actif.montant) / (total || 1)) * 100).toFixed(0)} % du total
            </text>
          </>
        ) : (
          <>
            <text x={cx} y={cy - 6} textAnchor="middle" fontSize={17}
              fontFamily="var(--display)" fontWeight={600} fill="var(--navy)">
              {money(total)}
            </text>
            <text x={cx} y={cy + 11} textAnchor="middle" fontSize={9.5}
              fill="var(--g-500)">
              de charges
            </text>
          </>
        )}
      </svg>

      <div style={{ flex: '1 1 22rem', minWidth: '19rem' }}
        onMouseLeave={() => setSurvole(null)}>
        {categories.slice(0, 8).map((c, i) => {
          const part = Number(c.montant) / (total || 1);
          return (
            <div key={c.categorie + c.compte}
              onMouseEnter={() => setSurvole(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: '.75rem',
                padding: '.5rem .6rem', borderRadius: 4,
                background: survole === i ? 'var(--g-50)' : 'transparent',
                transition: 'background .12s',
              }}>
              <span style={{
                width: 4, height: 26, borderRadius: 2, flexShrink: 0,
                background: TEINTES[i % TEINTES.length],
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--g-800)' }}>
                  {c.categorie}
                </p>
                <p className="mono muted" style={{ fontSize: '.66rem' }}>
                  compte {c.compte} · {c.lignes} écriture{c.lignes > 1 ? 's' : ''}
                </p>
              </div>

              {/* Barre de proportion : l'anneau donne la vue d'ensemble,
                  la barre permet de comparer deux postes voisins. */}
              <span style={{
                width: 54, height: 4, borderRadius: 2, flexShrink: 0,
                background: 'var(--g-200)', overflow: 'hidden',
              }}>
                <span style={{
                  display: 'block', height: '100%',
                  width: `${Math.max(part * 100, 2)}%`,
                  background: TEINTES[i % TEINTES.length],
                }} />
              </span>

              <span className="mono muted" style={{
                fontSize: 'var(--fs-xs)', width: '2.6rem', textAlign: 'right',
              }}>
                {(part * 100).toFixed(0)} %
              </span>
              <span className="amount" style={{
                fontSize: 'var(--fs-sm)', fontWeight: 600, width: '5.6rem',
                textAlign: 'right', color: 'var(--navy)',
              }}>
                {money(Number(c.montant))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================ */

function Detail({ etiquette, valeur, couleur }: {
  etiquette: string; valeur: number; couleur: string;
}) {
  return (
    <span style={{ textAlign: 'right' }}>
      <span style={{
        display: 'block', fontSize: '.65rem', color: 'var(--g-500)',
        textTransform: 'lowercase',
      }}>
        {etiquette}
      </span>
      <span className="amount" style={{
        fontSize: 'var(--fs-sm)', fontWeight: 600, color: couleur,
      }}>
        {valeur < 0 && '−'}{money(Math.abs(valeur))}
      </span>
    </span>
  );
}

function Pastille({ couleur, texte }: { couleur: string; texte: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.45rem' }}>
      <span style={{ width: 11, height: 11, borderRadius: 2, background: couleur }} />
      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--g-600)' }}>{texte}</span>
    </span>
  );
}

/* ================================================================ */

const heros: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
  gap: '2rem', flexWrap: 'wrap',
  background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)',
  borderRadius: 8, padding: '1.6rem 1.8rem', marginBottom: '1.5rem',
};
const herosGauche: React.CSSProperties = { minWidth: '15rem' };
const herosDroite: React.CSSProperties = {
  display: 'flex', gap: '2.2rem', flexWrap: 'wrap',
};
const herosEtiquette: React.CSSProperties = {
  fontSize: '.7rem', letterSpacing: '.1em', textTransform: 'uppercase',
  color: 'var(--gold-soft)',
};
const herosChiffre: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: '2.4rem', fontWeight: 600,
  lineHeight: 1.1, marginTop: '.3rem', letterSpacing: '-0.02em',
};
const herosNote: React.CSSProperties = {
  fontSize: 'var(--fs-xs)', color: 'rgba(255,255,255,.6)', marginTop: '.35rem',
};
const grilleEngagements: React.CSSProperties = {
  display: 'grid', gap: '.9rem',
  gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
};
