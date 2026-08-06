import Link from 'next/link';
import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { money, date } from '@/lib/format';
import { LIBELLE_STATUT, CLASSE_STATUT, type Depense } from '@/lib/types';
import ActionsValidation from '@/components/ActionsValidation';

export const metadata = { title: 'Dépenses — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'read')) redirect('/');

  const supabase = await createClient();
  const { data } = await supabase
    .from('depenses')
    .select('*, categories(libelle, compte), profils!depenses_cree_par_fkey(nom_complet)')
    .order('date_depense', { ascending: false })
    .limit(200);

  const depenses = (data ?? []) as Depense[];
  const attente = depenses.filter((d) => d.statut === 'en_attente');
  const validees = depenses.filter((d) => d.statut === 'validee');
  const annulees = depenses.filter((d) => d.statut === 'annulee');

  const totalHT = validees.reduce((s, d) => s + Number(d.montant_ht), 0);
  const totalTVA = validees.reduce((s, d) => s + Number(d.tva_deductible), 0);

  const peutValider = peut(profil.role, 'depenses', 'validate');
  const peutCreer = peut(profil.role, 'depenses', 'create');

  return (
    <>
      <Header titre="Dépenses" sousTitre={`${depenses.length} enregistrées`} />

      <div className="content">
        <div className="grid-cards" style={{ marginBottom: '1.25rem' }}>
          <div className="card">
            <p className="card__title">Total HT validé</p>
            <p className="amount" style={{ fontSize: '1.35rem', fontFamily: 'var(--display)', fontWeight: 600 }}>
              {money(totalHT)}
            </p>
          </div>
          <div className="card">
            <p className="card__title">TVA récupérable</p>
            <p className="amount" style={{ fontSize: '1.35rem', fontFamily: 'var(--display)', fontWeight: 600 }}>
              {money(totalTVA)}
            </p>
          </div>
          <div className="card">
            <p className="card__title">Annulées</p>
            <p className="amount" style={{ fontSize: '1.35rem', fontFamily: 'var(--display)', fontWeight: 600, color: 'var(--g-400)' }}>
              {annulees.length}
            </p>
            <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>
              Hors totaux, numéro conservé
            </p>
          </div>
          <div className="card">
            <p className="card__title">En attente de validation</p>
            <p className="amount" style={{ fontSize: '1.35rem', fontFamily: 'var(--display)', fontWeight: 600, color: attente.length ? 'var(--warning)' : undefined }}>
              {attente.length}
            </p>
          </div>
        </div>

        {peutCreer && (
          <div style={{ marginBottom: '1.25rem' }}>
            <Link href="/depenses/nouvelle" className="btn btn--gold">
              + Nouvelle dépense
            </Link>
          </div>
        )}

        {attente.length > 0 && (
          <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--warning)' }}>
            <p className="card__title" style={{ color: 'var(--warning)' }}>
              À valider — {attente.length}
            </p>
            <Tableau depenses={attente} peutValider={peutValider} />
          </div>
        )}

        <div className="card">
          <p className="card__title">Toutes les dépenses</p>
          {depenses.length === 0 ? (
            <div className="etat-vide">
              <p>Aucune dépense enregistrée.</p>
              <p className="muted">
                Saisissez vos factures d'achat au fil de l'eau : chaque pièce
                jointe conditionne la déduction de la charge et la récupération
                de la TVA.
              </p>
              {peutCreer && (
                <Link href="/depenses/nouvelle" className="btn btn--gold">
                  Saisir une première dépense
                </Link>
              )}
            </div>
          ) : (
            <Tableau depenses={depenses} peutValider={false} />
          )}
        </div>
      </div>
    </>
  );
}

function Tableau({ depenses, peutValider }: { depenses: Depense[]; peutValider: boolean }) {
  return (
    <div className="table-scroll">
      <table style={{ minWidth: 640, fontSize: 'var(--fs-sm)' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
            <th style={th}>Pièce</th>
            <th style={th}>Date</th>
            <th style={th}>Fournisseur</th>
            <th style={{ ...th }} className="col-secondaire">Catégorie</th>
            <th style={{ ...th, textAlign: 'right' }}>HT</th>
            <th style={{ ...th, textAlign: 'right' }} className="col-secondaire">TVA réc.</th>
            <th style={{ ...th, textAlign: 'right' }}>TTC</th>
            <th style={{ ...th, textAlign: 'right' }}>Statut</th>
            <th style={{ ...th, textAlign: 'right' }}></th>
            {peutValider && <th style={{ ...th, textAlign: 'right' }}>Action</th>}
          </tr>
        </thead>
        <tbody>
          {depenses.map((d) => (
            <tr key={d.id} style={{
              borderBottom: '1px solid var(--g-200)',
              opacity: d.statut === 'annulee' ? 0.45 : 1,
            }}>
              <td style={td} className="mono">
                <span style={{ fontSize: '.72rem', color: 'var(--g-600)' }}>
                  {d.numero_piece ?? '—'}
                </span>
              </td>
              <td style={td}>{date(d.date_depense)}</td>
              <td style={{ ...td, fontWeight: 500 }}>
                <Link href={`/depenses/${d.id}`} style={{ color: 'var(--navy)', textDecoration: 'none' }}>
                  {d.fournisseur}
                </Link>
                {d.libelle && <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>{d.libelle}</span>}
              </td>
              <td style={td} className="col-secondaire">
                {d.categories?.libelle}
                <span className="mono muted" style={{ display: 'block', fontSize: '0.68rem' }}>{d.compte}</span>
              </td>
              <td style={{ ...td, textAlign: 'right' }} className="amount">{money(Number(d.montant_ht))}</td>
              <td style={{ ...td, textAlign: 'right' }} className="amount col-secondaire">
                {money(Number(d.tva_deductible))}
                {d.taux_deductibilite < 100 && (
                  <span className="muted" style={{ display: 'block', fontSize: '0.68rem' }}>
                    {d.taux_deductibilite} %
                  </span>
                )}
              </td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 600 }} className="amount">{money(Number(d.montant_ttc))}</td>
              <td style={{ ...td, textAlign: 'right' }}>
                <span className={`badge ${CLASSE_STATUT[d.statut]}`}>{LIBELLE_STATUT[d.statut]}</span>
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                <Link href={`/depenses/${d.id}`} className="btn btn--ghost"
                  style={{ minHeight: 28, padding: '.15rem .6rem', fontSize: '.7rem' }}>
                  Ouvrir
                </Link>
              </td>
              {peutValider && (
                <td style={{ ...td, textAlign: 'right' }}>
                  <ActionsValidation table="depenses" id={d.id}
                    resume={`${d.numero_piece ?? ''} · ${d.fournisseur} — ${Number(d.montant_ttc).toFixed(2).replace('.', ',')} € TTC`} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)', fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.65rem .4rem', verticalAlign: 'top' };
