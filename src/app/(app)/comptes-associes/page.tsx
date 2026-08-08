import { redirect } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { money, date } from '@/lib/format';

export const metadata = { title: 'Comptes associés — Hipla Gestion' };
export const dynamic = 'force-dynamic';

/**
 * LE COMPTE COURANT D'ASSOCIÉ
 *
 * Ce que la société doit à ceux qui ont avancé de l'argent pour elle.
 * C'est une dette réelle, remboursable sans impôt ni charge sociale —
 * et c'est souvent la première somme qu'un dirigeant récupère.
 *
 * Le solde n'est pas stocké : il se reconstruit à chaque affichage
 * depuis les pièces. Un solde stocké dérive au premier oubli de mise à
 * jour, et personne ne s'en aperçoit avant la clôture.
 */

type Solde = {
  associe: string; nom: string;
  avance: number; rembourse: number; solde: number; lignes: number;
};

type Mouvement = {
  associe: string; id: string; numero_piece: string | null;
  date_ecriture: string; date_piece: string;
  tiers_libelle: string; objet: string | null; nature: string;
  sens_courant: string; montant: number; motif: string;
};

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'read')) redirect('/');

  const supabase = await createClient();

  const [{ data: soldes }, { data: mouvements }] = await Promise.all([
    supabase.rpc('solde_compte_courant'),
    supabase.from('v_compte_courant').select('*').order('date_ecriture'),
  ]);

  const s = (soldes ?? []) as Solde[];
  const m = (mouvements ?? []) as Mouvement[];
  const total = s.reduce((acc, x) => acc + Number(x.solde), 0);

  return (
    <>
      <Header
        titre="Comptes associés"
        sousTitre="Ce que la société doit à ceux qui ont avancé pour elle"
      />
      <div className="content">

        {/* ---------- Le solde, en tête ---------- */}
        <div style={{
          background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)',
          borderRadius: 8, padding: '1.6rem 1.8rem', marginBottom: '1.5rem',
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-end', gap: '2rem', flexWrap: 'wrap',
        }}>
          <div>
            <p style={{
              fontSize: '.7rem', letterSpacing: '.1em', textTransform: 'uppercase',
              color: 'var(--gold-soft)',
            }}>
              Dû aux associés
            </p>
            <p className="amount" style={{
              fontFamily: 'var(--display)', fontSize: '2.2rem', fontWeight: 600,
              color: 'var(--g-0)', marginTop: '.3rem', letterSpacing: '-0.02em',
            }}>
              {money(total)}
            </p>
            <p style={{
              fontSize: 'var(--fs-xs)', color: 'rgba(255,255,255,.6)', marginTop: '.35rem',
              maxWidth: '46ch', lineHeight: 1.5,
            }}>
              Remboursable sans impôt ni charge sociale, dès que la trésorerie
              le permet.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '2.2rem', flexWrap: 'wrap' }}>
            {s.map((x) => (
              <div key={x.associe}>
                <p style={{
                  fontSize: '.68rem', letterSpacing: '.08em', textTransform: 'uppercase',
                  color: 'rgba(255,255,255,.55)',
                }}>
                  {x.nom}
                </p>
                <p className="amount" style={{
                  fontFamily: 'var(--display)', fontSize: '1.15rem', fontWeight: 600,
                  color: 'var(--g-0)', marginTop: '.2rem',
                }}>
                  {money(Number(x.solde))}
                </p>
                <p style={{
                  fontSize: '.68rem', color: 'rgba(255,255,255,.45)', marginTop: '.1rem',
                }}>
                  {money(Number(x.avance))} avancés
                  {Number(x.rembourse) > 0 && `, ${money(Number(x.rembourse))} rendus`}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ---------- Comment se rembourser ---------- */}
        {total > 0.005 && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <p className="card__title">Se faire rembourser</p>
            <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6, maxWidth: '70ch' }}>
              Virez-vous la somme depuis le compte de la société, puis rattachez
              l&apos;opération bancaire à votre compte courant depuis l&apos;écran
              de la banque. L&apos;écriture éteint la dette sans toucher au
              résultat.
            </p>
            <p className="muted" style={{
              fontSize: 'var(--fs-sm)', marginTop: '.6rem', lineHeight: 1.55, maxWidth: '70ch',
            }}>
              <strong>Ne créez surtout pas une dépense</strong> pour ce virement :
              la charge a déjà été comptabilisée quand vous l&apos;avez avancée.
              La compter une seconde fois doublerait vos frais et fausserait le
              résultat.
            </p>
            <div style={{ marginTop: '.9rem' }}>
              <Link href="/banque" className="btn btn--ghost">
                Voir les opérations bancaires
              </Link>
            </div>
          </div>
        )}

        {/* ---------- Le détail ---------- */}
        <div className="card">
          <p className="card__title">Mouvements — {m.length}</p>

          {m.length === 0 ? (
            <div className="etat-vide">
              <p>Aucun mouvement.</p>
              <p className="muted">
                Une dépense payée personnellement ou une indemnité kilométrique
                crédite ce compte.
              </p>
            </div>
          ) : (
            <div className="table-scroll" style={{ marginTop: '.6rem' }}>
              <table style={{ minWidth: 640, fontSize: 'var(--fs-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                    <th style={th}>Date</th>
                    <th style={th}>Pièce</th>
                    <th style={th}>Associé</th>
                    <th style={th}>Motif</th>
                    <th style={th} className="col-secondaire">Tiers</th>
                    <th style={{ ...th, textAlign: 'right' }}>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {m.map((x) => {
                    const rembourse = x.sens_courant === 'rembourse';
                    return (
                      <tr key={x.id} style={{ borderBottom: '1px solid var(--g-200)' }}>
                        <td style={td}>{date(x.date_ecriture)}</td>
                        <td style={td} className="mono">
                          <Link
                            href={x.nature === 'banque'
                              ? `/banque` : `/depenses/${x.id}`}
                            style={{ color: 'var(--navy)', fontSize: '.72rem' }}>
                            {x.numero_piece ?? '—'}
                          </Link>
                        </td>
                        <td style={td} className="muted">{x.associe}</td>
                        <td style={{ ...td, fontWeight: 500 }}>
                          {x.motif}
                          {x.objet && (
                            <span className="muted" style={{
                              display: 'block', fontSize: 'var(--fs-xs)',
                            }}>
                              {x.objet}
                            </span>
                          )}
                        </td>
                        <td style={td} className="col-secondaire muted">
                          {x.tiers_libelle}
                        </td>
                        <td style={{
                          ...td, textAlign: 'right', fontWeight: 600,
                          color: rembourse ? 'var(--success)' : 'var(--navy)',
                        }} className="amount">
                          {rembourse ? '− ' : '+ '}{money(Math.abs(Number(x.montant)))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="muted" style={{
            fontSize: 'var(--fs-xs)', marginTop: '.9rem', lineHeight: 1.5, maxWidth: '70ch',
          }}>
            Ce solde se reconstruit à chaque affichage depuis les écritures. Il
            n&apos;est stocké nulle part : un solde stocké dérive au premier
            oubli de mise à jour, et personne ne s&apos;en aperçoit avant la
            clôture.
          </p>
        </div>
      </div>
    </>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)',
  fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.6rem .4rem', verticalAlign: 'top' };
