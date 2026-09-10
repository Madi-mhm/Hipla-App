'use client';

/**
 * REGISTRE DES IMMOBILISATIONS
 *
 * Deux gestes, et le premier compte plus que le second :
 *
 * · INSCRIRE un bien acquis — sans quoi il reste passé en charge d'un
 *   coup, ce qui fausse le résultat de l'année et appauvrit le bilan ;
 * · CONSTATER la dotation d'une période — la fraction qui entre au
 *   résultat cette année-là.
 *
 * La date de mise en service commande tout : un matériel acheté en
 * décembre et installé en février s'amortit à partir de février, avec un
 * prorata sur les jours d'usage.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Reference from '@/components/Reference';
import { createClient } from '@/lib/supabase/client';
import { money, date } from '@/lib/format';
import Alerte from '@/components/Alerte';

export type Bien = {
  id: string; piece_id: string;
  libelle: string; compte: string;
  date_acquisition: string; date_mise_en_service: string;
  base_amortissable: number; valeur_residuelle: number;
  duree_annees: number; mode: string;
  date_sortie: string | null; motif_sortie: string | null;
  notes: string | null;
  pieces: { numero_piece: string | null; tiers_libelle: string } | null;
};

export type AInscrire = {
  id: string; numero_piece: string | null; date_piece: string;
  tiers_libelle: string; objet: string | null; compte: string;
  montant_ht: number; montant_tva: number; tva_comptable: number;
  categories: { libelle: string; duree_amortissement: number | null } | null;
};

type Ligne = {
  annee: number; debut: string; fin: string; jours: number;
  dotation: number; cumul: number; valeur_nette: number;
};

export default function Immobilisations({
  biens, plans, aInscrire, peutGerer,
}: {
  biens: Bien[];
  plans: Record<string, unknown[]>;
  aInscrire: AInscrire[];
  peutGerer: boolean;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);

  // Saisie d'inscription
  const [aTraiter, setATraiter] = useState<AInscrire | null>(null);
  const [miseEnService, setMiseEnService] = useState('');
  const [duree, setDuree] = useState('');

  // Constatation
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');

  function ouvrirInscription(p: AInscrire) {
    setATraiter(p);
    setMiseEnService(p.date_piece);
    setDuree(String(p.categories?.duree_amortissement ?? 5));
    setErreur(null);
  }

  async function inscrire() {
    if (!aTraiter) return;
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    const { data, error } = await supabase.rpc('inscrire_immobilisation', {
      p_piece: aTraiter.id,
      p_date_mise_service: miseEnService,
      p_duree: Number(duree),
    });

    if (error) { setErreur(error.message); setEnCours(false); return; }

    const r = data as { base_amortissable?: number; annuite?: number } | null;
    setSucces(
      `Inscrit — base de ${money(Number(r?.base_amortissable ?? 0))}, `
      + `soit ${money(Number(r?.annuite ?? 0))} par an.`
    );
    setATraiter(null);
    setEnCours(false);
    router.refresh();
  }

  async function constater() {
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    const { data, error } = await supabase.rpc('constater_amortissements', {
      p_debut: debut, p_fin: fin,
    });

    if (error) { setErreur(error.message); setEnCours(false); return; }

    const r = data as {
      constate?: boolean; motif?: string;
      numero_piece?: string; dotation?: number; immobilisations?: number;
    } | null;

    if (!r?.constate) { setErreur(r?.motif ?? 'Rien à constater.'); setEnCours(false); return; }

    setSucces(
      `${r.numero_piece} — ${money(Number(r.dotation ?? 0))} de dotation sur `
      + `${r.immobilisations} bien${(r.immobilisations ?? 0) > 1 ? 's' : ''}.`
    );
    setEnCours(false);
    router.refresh();
  }

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      {/* ---------- À inscrire ---------- */}
      {aInscrire.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid var(--warning)' }}>
          <p className="card__title" style={{ color: 'var(--warning)' }}>
            À inscrire au registre — {aInscrire.length}
          </p>
          <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '70ch' }}>
            Ces achats relèvent de la classe 2 mais ne figurent pas au registre.
            En l&apos;état, ils sont passés en charge d&apos;un coup : le résultat
            de l&apos;année en est faussé, et le bilan appauvri d&apos;autant.
          </p>

          {aInscrire.map((p) => {
            const base = Number(p.montant_ht)
              + Math.max(Number(p.montant_tva) - Math.abs(Number(p.tva_comptable)), 0);
            return (
              <div key={p.id} style={ligne}>
                <div style={{ flex: 1, minWidth: '18rem' }}>
                  <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 500 }}>
                    <Reference id={p.id} style={{ color: 'var(--navy)' }}>
                      {p.numero_piece}
                    </Reference>
                    {' · '}{p.tiers_libelle} · {money(base)}
                  </p>
                  <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.15rem' }}>
                    {date(p.date_piece)}
                    {p.objet && ` · ${p.objet}`}
                    {p.categories && ` · ${p.categories.libelle}`}
                    {base > Number(p.montant_ht) + 0.005
                      && ` · TVA non récupérable incluse`}
                  </p>
                </div>
                {peutGerer && (
                  <button onClick={() => ouvrirInscription(p)} className="btn btn--gold"
                    style={petitBouton}>
                    Inscrire
                  </button>
                )}
              </div>
            );
          })}

          {/* La saisie : deux champs, et le second commande tout. */}
          {aTraiter && (
            <div style={{
              marginTop: '1rem', padding: '1rem', borderRadius: 6,
              background: 'var(--bone)', borderLeft: '2px solid var(--gold)',
            }}>
              <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: '.7rem' }}>
                {aTraiter.numero_piece} · {aTraiter.tiers_libelle}
              </p>
              <div style={{
                display: 'grid', gap: '.9rem',
                gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
              }}>
                <label>
                  <span>Mise en service</span>
                  <input type="date" value={miseEnService}
                    onChange={(e) => setMiseEnService(e.target.value)} />
                </label>
                <label>
                  <span>Durée d&apos;amortissement</span>
                  <select value={duree} onChange={(e) => setDuree(e.target.value)}>
                    {[3, 5, 7, 10, 15, 20].map((a) => (
                      <option key={a} value={a}>{a} ans</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="muted" style={{
                fontSize: 'var(--fs-xs)', marginTop: '.6rem', lineHeight: 1.5, maxWidth: '66ch',
              }}>
                L&apos;amortissement court à partir de la mise en service, pas de
                l&apos;achat — un matériel installé deux mois plus tard s&apos;amortit
                deux mois plus tard, au prorata des jours.
              </p>
              <div style={{ display: 'flex', gap: '.6rem', marginTop: '.9rem' }}>
                <button onClick={inscrire} disabled={enCours} className="btn btn--gold">
                  Inscrire au registre
                </button>
                <button onClick={() => setATraiter(null)} className="btn btn--ghost">
                  Abandonner
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------- Le registre ---------- */}
      {biens.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <p className="card__title">Biens inscrits — {biens.length}</p>

          {biens.map((b) => {
            const plan = (plans[b.id] ?? []) as Ligne[];
            const passe = plan.filter((l) => new Date(l.fin) <= new Date());
            const cumul = passe.length > 0 ? Number(passe[passe.length - 1].cumul) : 0;
            const nette = Number(b.base_amortissable) - cumul;
            const part = Number(b.base_amortissable) > 0
              ? cumul / Number(b.base_amortissable) : 0;

            return (
              <div key={b.id} style={{
                padding: '1rem 0', borderBottom: '1px solid var(--g-200)',
                opacity: b.date_sortie ? 0.5 : 1,
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap',
                }}>
                  <div style={{ flex: 1, minWidth: '18rem' }}>
                    <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--navy)' }}>
                      {b.libelle}
                      <span className="mono muted" style={{
                        marginLeft: '.5rem', fontSize: '.7rem', fontWeight: 400,
                      }}>
                        compte {b.compte}
                      </span>
                    </p>
                    <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.15rem' }}>
                      {b.pieces?.numero_piece && (
                        <Reference id={b.piece_id} style={{ color: 'var(--navy)' }}>
                          {b.pieces.numero_piece}
                        </Reference>
                      )}
                      {' · '}en service le {date(b.date_mise_en_service)}
                      {' · '}{b.duree_annees} ans
                      {b.date_sortie && ` · sorti le ${date(b.date_sortie)}`}
                    </p>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <p className="amount" style={{
                      fontFamily: 'var(--display)', fontSize: '1.1rem', fontWeight: 600,
                      color: 'var(--navy)',
                    }}>
                      {money(nette)}
                    </p>
                    <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                      valeur nette · {money(Number(b.base_amortissable))} à l&apos;achat
                    </p>
                  </div>
                </div>

                {/* La barre d'avancement : plus lisible qu'un pourcentage. */}
                <div style={{
                  height: 5, borderRadius: 3, background: 'var(--g-200)',
                  overflow: 'hidden', marginTop: '.7rem',
                }}>
                  <div style={{
                    height: '100%', width: `${Math.min(part * 100, 100)}%`,
                    background: 'var(--navy)',
                  }} />
                </div>
                <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>
                  {money(cumul)} amortis · {(part * 100).toFixed(0)} %
                </p>

                <button
                  onClick={() => setOuvert(ouvert === b.id ? null : b.id)}
                  className="btn btn--ghost"
                  style={{ ...petitBouton, marginTop: '.6rem' }}>
                  {ouvert === b.id ? 'Masquer le plan' : 'Plan d\u2019amortissement'}
                </button>

                {ouvert === b.id && (
                  <div className="table-scroll" style={{ marginTop: '.8rem' }}>
                    <table style={{ minWidth: 480, fontSize: 'var(--fs-sm)' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                          <th style={th}>Exercice</th>
                          <th style={th} className="col-secondaire">Jours</th>
                          <th style={{ ...th, textAlign: 'right' }}>Dotation</th>
                          <th style={{ ...th, textAlign: 'right' }}>Cumul</th>
                          <th style={{ ...th, textAlign: 'right' }}>Valeur nette</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.map((l, i) => {
                          const passee = new Date(l.fin) <= new Date();
                          return (
                            <tr key={i} style={{
                              borderBottom: '1px solid var(--g-200)',
                              color: passee ? undefined : 'var(--g-500)',
                            }}>
                              <td style={td}>
                                {date(l.debut)} → {date(l.fin)}
                              </td>
                              <td style={td} className="col-secondaire muted">{l.jours}</td>
                              <td style={{ ...td, textAlign: 'right' }} className="amount">
                                {money(Number(l.dotation))}
                              </td>
                              <td style={{ ...td, textAlign: 'right' }} className="amount muted">
                                {money(Number(l.cumul))}
                              </td>
                              <td style={{
                                ...td, textAlign: 'right', fontWeight: 600,
                              }} className="amount">
                                {money(Number(l.valeur_nette))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="muted" style={{
                      fontSize: 'var(--fs-xs)', marginTop: '.6rem', lineHeight: 1.5,
                    }}>
                      La première et la dernière annuité sont réduites au prorata
                      des jours d&apos;usage. La dernière absorbe l&apos;arrondi
                      pour que le cumul tombe exactement sur la base.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- Constater la dotation ---------- */}
      {biens.length > 0 && peutGerer && (
        <div className="card">
          <p className="card__title">Constater la dotation d&apos;une période</p>
          <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '70ch' }}>
            L&apos;écriture porte la charge au compte 6811 et la contrepartie au
            compte 28. Aucune trésorerie ne bouge : c&apos;est une charge calculée,
            pas un décaissement.
          </p>

          <div style={{
            display: 'grid', gap: '.9rem', marginTop: '1rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
          }}>
            <label><span>Du</span>
              <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} /></label>
            <label><span>Au</span>
              <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></label>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <button onClick={constater} disabled={enCours || !debut || !fin}
              className="btn btn--gold">
              {enCours ? 'Calcul…' : 'Constater'}
            </button>
          </div>

          <p className="muted" style={{
            fontSize: 'var(--fs-xs)', marginTop: '.8rem', lineHeight: 1.5, maxWidth: '70ch',
          }}>
            En pratique, une fois par exercice à la clôture. Une période déjà
            constatée ne se refait pas — annulez l&apos;écriture d&apos;abord.
          </p>
        </div>
      )}
    </>
  );
}

const ligne: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  gap: '1rem', flexWrap: 'wrap',
  padding: '.75rem 0', borderBottom: '1px solid var(--g-200)',
};
const petitBouton: React.CSSProperties = {
  minHeight: 30, padding: '.2rem .7rem', fontSize: '.72rem', whiteSpace: 'nowrap',
};
const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)',
  fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.5rem .4rem', verticalAlign: 'top' };
