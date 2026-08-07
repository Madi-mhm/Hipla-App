import { redirect } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { money, dateLong } from '@/lib/format';

export const metadata = { title: 'Journal comptable — Hipla Gestion' };
export const dynamic = 'force-dynamic';

/**
 * LE JOURNAL COMPTABLE
 *
 * Les mêmes écritures que le FEC, mais lisibles.
 *
 * Le FEC ne peut pas être embelli : son format est imposé par arrêté,
 * et toute fantaisie le fait rejeter. Il est destiné au logiciel de
 * l'administration, pas à un lecteur. Cette page comble le manque —
 * groupée par journal puis par écriture, totalisée, imprimable.
 *
 * C'est aussi le document qu'un cabinet demandera si vous lui confiez
 * une partie de la tenue.
 */

type Ligne = {
  journal_code: string;
  journal_lib: string;
  ecriture_num: string;
  ecriture_date: string;
  compte_num: string;
  compte_lib: string;
  comp_aux_lib: string | null;
  piece_ref: string;
  piece_date: string;
  ecriture_lib: string;
  debit: number;
  credit: number;
  ordre: number;
};

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'exports', 'read')) redirect('/');

  const supabase = await createClient();

  // L'exercice en cours — pas le plus récent : les exercices à venir
  // sont déjà déclarés, et viser le dernier interrogerait une période
  // où rien n'existe.
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const { data: exercice } = await supabase
    .from('exercices').select('date_debut, date_fin, regime_tva')
    .lte('date_debut', aujourdhui).gte('date_fin', aujourdhui)
    .limit(1).maybeSingle();

  if (!exercice) {
    return (
      <>
        <Header titre="Journal comptable" sousTitre="Les écritures, lisibles" />
        <div className="content">
          <div className="card">
            <p style={{ fontSize: 'var(--fs-sm)' }}>
              Aucun exercice ne couvre la date du jour. Réglages → Entreprise.
            </p>
          </div>
        </div>
      </>
    );
  }

  const [{ data }, { data: controle }] = await Promise.all([
    supabase.rpc('lignes_fec', {
      p_debut: exercice.date_debut, p_fin: exercice.date_fin,
    }),
    supabase.rpc('controle_fec', {
      p_debut: exercice.date_debut, p_fin: exercice.date_fin,
    }),
  ]);

  const lignes = ((data ?? []) as Ligne[]).sort((a, b) =>
    a.journal_code.localeCompare(b.journal_code)
    || a.ecriture_date.localeCompare(b.ecriture_date)
    || a.ecriture_num.localeCompare(b.ecriture_num)
    || a.ordre - b.ordre
  );

  const c = controle as {
    debit?: number; credit?: number; ecart?: number; equilibre?: boolean;
    par_journal?: Array<{ journal: string; lignes: number; debit: number; credit: number }>;
  } | null;

  // Groupement : journal, puis écriture. Une écriture ne se lit pas
  // ligne à ligne mais d'un bloc — c'est ce qui permet de vérifier
  // qu'elle s'équilibre.
  const journaux = new Map<string, { lib: string; ecritures: Map<string, Ligne[]> }>();
  for (const l of lignes) {
    if (!journaux.has(l.journal_code)) {
      journaux.set(l.journal_code, { lib: l.journal_lib, ecritures: new Map() });
    }
    const j = journaux.get(l.journal_code)!;
    if (!j.ecritures.has(l.ecriture_num)) j.ecritures.set(l.ecriture_num, []);
    j.ecritures.get(l.ecriture_num)!.push(l);
  }

  return (
    <>
      <Header
        titre="Journal comptable"
        sousTitre={`Du ${dateLong(exercice.date_debut)} au ${dateLong(exercice.date_fin)}`}
      />
      <div className="content">

        {/* ---------- L'équilibre ---------- */}
        <div className="card" style={{
          marginBottom: '1.25rem',
          borderLeft: `3px solid ${c?.equilibre ? 'var(--success)' : 'var(--danger)'}`,
        }}>
          <p className="card__title">Balance générale</p>
          <div className="grid-cards" style={{ marginTop: '.6rem' }}>
            <div className="card">
              <p className="card__title">Total débit</p>
              <p className="amount" style={chiffre}>{money(Number(c?.debit ?? 0))}</p>
            </div>
            <div className="card">
              <p className="card__title">Total crédit</p>
              <p className="amount" style={chiffre}>{money(Number(c?.credit ?? 0))}</p>
            </div>
            <div className="card">
              <p className="card__title">Écart</p>
              <p className="amount" style={{
                ...chiffre, color: c?.equilibre ? 'var(--success)' : 'var(--danger)',
              }}>
                {money(Number(c?.ecart ?? 0))}
              </p>
              <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>
                {c?.equilibre ? 'Comptabilité équilibrée' : 'Déséquilibre à corriger'}
              </p>
            </div>
            <div className="card">
              <p className="card__title">Écritures</p>
              <p className="amount" style={chiffre}>
                {Array.from(journaux.values())
                  .reduce((s, j) => s + j.ecritures.size, 0)}
              </p>
              <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>
                {lignes.length} lignes
              </p>
            </div>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            <a href="/api/fec" className="btn btn--gold">Télécharger le FEC</a>
            <Link href="/exports" className="btn btn--ghost">Autres exports</Link>
          </div>
          <p className="muted" style={{
            fontSize: 'var(--fs-xs)', marginTop: '.8rem', lineHeight: 1.5, maxWidth: '70ch',
          }}>
            Le FEC contient exactement ces écritures, dans le format imposé par
            l&apos;arrêté du 29 juillet 2013 — tabulations, aucune mise en forme.
            Il est destiné au logiciel de l&apos;administration ; cette page est
            sa lecture humaine.
          </p>
        </div>

        {/* ---------- Les journaux ---------- */}
        {journaux.size === 0 ? (
          <div className="card">
            <div className="etat-vide">
              <p>Aucune écriture sur cet exercice.</p>
              <p className="muted">
                Les écritures apparaissent ici dès qu&apos;une pièce est validée.
              </p>
            </div>
          </div>
        ) : (
          Array.from(journaux.entries()).map(([code, j]) => {
            const totaux = (c?.par_journal ?? []).find((x) => x.journal === code);
            return (
              <div key={code} className="card" style={{ marginBottom: '1.25rem' }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap',
                }}>
                  <p className="card__title" style={{ margin: 0 }}>
                    {j.lib} <span className="mono muted">— {code}</span>
                  </p>
                  <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
                    {j.ecritures.size} écriture{j.ecritures.size > 1 ? 's' : ''} ·{' '}
                    {money(Number(totaux?.debit ?? 0))}
                  </p>
                </div>

                <div className="table-scroll" style={{ marginTop: '.8rem' }}>
                  <table style={{ minWidth: 700, fontSize: 'var(--fs-sm)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                        <th style={th}>Compte</th>
                        <th style={th}>Libellé</th>
                        <th style={th} className="col-secondaire">Tiers</th>
                        <th style={{ ...th, textAlign: 'right' }}>Débit</th>
                        <th style={{ ...th, textAlign: 'right' }}>Crédit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(j.ecritures.entries()).map(([num, lg]) => {
                        const d = lg.reduce((s, l) => s + Number(l.debit), 0);
                        const cr = lg.reduce((s, l) => s + Number(l.credit), 0);
                        const equilibree = Math.abs(d - cr) < 0.005;

                        return (
                          <>
                            {/* L'en-tête d'écriture : ce qui la rend lisible
                                d'un bloc plutôt que ligne à ligne. */}
                            <tr key={`${num}-t`} style={{ background: 'var(--bone)' }}>
                              <td style={{ ...td, fontWeight: 600 }} className="mono" colSpan={2}>
                                {num}
                                <span className="muted" style={{
                                  marginLeft: '.6rem', fontWeight: 400,
                                }}>
                                  {dateLong(lg[0].ecriture_date)}
                                  {lg[0].piece_date !== lg[0].ecriture_date && (
                                    <> · pièce du {dateLong(lg[0].piece_date)}</>
                                  )}
                                </span>
                              </td>
                              <td style={td} className="col-secondaire" />
                              <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}
                                className="amount">
                                {money(d)}
                              </td>
                              <td style={{
                                ...td, textAlign: 'right', fontWeight: 600,
                                color: equilibree ? undefined : 'var(--danger)',
                              }} className="amount">
                                {money(cr)}
                              </td>
                            </tr>

                            {lg.map((l, i) => (
                              <tr key={`${num}-${i}`}
                                style={{ borderBottom: '1px solid var(--g-200)' }}>
                                <td style={td} className="mono">{l.compte_num}</td>
                                <td style={td}>
                                  {l.compte_lib}
                                  <span className="muted" style={{
                                    display: 'block', fontSize: 'var(--fs-xs)',
                                  }}>
                                    {l.ecriture_lib}
                                  </span>
                                </td>
                                <td style={td} className="col-secondaire muted">
                                  {l.comp_aux_lib ?? ''}
                                </td>
                                <td style={{ ...td, textAlign: 'right' }} className="amount">
                                  {Number(l.debit) > 0 ? money(Number(l.debit)) : ''}
                                </td>
                                <td style={{ ...td, textAlign: 'right' }} className="amount">
                                  {Number(l.credit) > 0 ? money(Number(l.credit)) : ''}
                                </td>
                              </tr>
                            ))}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

const chiffre: React.CSSProperties = {
  fontSize: '1.25rem', fontFamily: 'var(--display)', fontWeight: 600,
};
const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)',
  fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.5rem .4rem', verticalAlign: 'top' };
