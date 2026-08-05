import Link from 'next/link';
import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { money, dateLong, daysUntil } from '@/lib/format';
import {
  construireActions, LIBELLE_URGENCE, CLASSE_URGENCE, ECHEANCES,
} from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');

  const peutValider = peut(profil.role, 'depenses', 'validate');
  const actions = await construireActions(peutValider);

  const supabase = await createClient();
  const { data: dep } = await supabase
    .from('depenses').select('montant_ht, tva_deductible, statut');
  const validees = (dep ?? []).filter((d) => d.statut === 'validee');
  const totalHT = validees.reduce((s, d) => s + Number(d.montant_ht), 0);
  const totalTVA = validees.reduce((s, d) => s + Number(d.tva_deductible), 0);

  const prochaine = ECHEANCES
    .map((e) => ({ ...e, j: daysUntil(e.date) }))
    .filter((e) => e.j >= 0)
    .sort((a, b) => a.j - b.j)[0];

  const prenom = profil.nom_complet.split(' ')[0];

  return (
    <>
      <Header
        titre="Centre d'action"
        sousTitre={`Bonjour ${prenom} — ce qu'il y a à faire aujourd'hui`}
      />

      <div className="content">
        <section style={{ marginBottom: '1.5rem' }}>
          {actions.length === 0 ? (
            <div className="card" style={{ borderLeft: '3px solid var(--success)' }}>
              <p style={{ fontFamily: 'var(--display)', fontWeight: 600, color: 'var(--success)' }}>
                Tout est à jour.
              </p>
              <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: '.3rem' }}>
                Aucune action en attente.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '.6rem' }}>
              {actions.map((a) => (
                <div
                  key={a.id}
                  className="card"
                  style={{
                    borderLeft: `3px solid ${
                      a.urgence === 'bloquant' ? 'var(--danger)'
                      : a.urgence === 'important' ? 'var(--warning)'
                      : a.urgence === 'a_faire' ? 'var(--info)'
                      : 'var(--g-300)'
                    }`,
                    padding: '.9rem 1.1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <span className={`badge ${CLASSE_URGENCE[a.urgence]}`} style={{ flexShrink: 0 }}>
                    {LIBELLE_URGENCE[a.urgence]}
                  </span>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <p style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 'var(--fs-sm)' }}>
                      {a.titre}
                    </p>
                    {a.detail && (
                      <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.15rem' }}>
                        {a.detail}
                      </p>
                    )}
                  </div>
                  <Link href={a.href} className="btn btn--ghost" style={{ minHeight: 34, padding: '.35rem .9rem', fontSize: 'var(--fs-xs)', flexShrink: 0 }}>
                    {a.libelleLien}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="grid-cards" style={{ marginBottom: '1.5rem' }}>
          <div className="card">
            <p className="card__title">Charges validées (HT)</p>
            <p className="amount" style={{ fontSize: '1.4rem', fontFamily: 'var(--display)', fontWeight: 600 }}>
              {money(totalHT)}
            </p>
          </div>
          <div className="card">
            <p className="card__title">TVA récupérable</p>
            <p className="amount" style={{ fontSize: '1.4rem', fontFamily: 'var(--display)', fontWeight: 600 }}>
              {money(totalTVA)}
            </p>
          </div>
          <div className="card">
            <p className="card__title">Prochaine échéance</p>
            <p style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 'var(--fs-sm)' }}>
              {prochaine?.libelle}
            </p>
            <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>
              {prochaine && `${dateLong(prochaine.date)} — dans ${prochaine.j} jours`}
            </p>
          </div>
        </div>

        <div className="card">
          <p className="card__title">Échéances de l'exercice</p>
          <div className="table-scroll">
            <table style={{ minWidth: 460, fontSize: 'var(--fs-sm)' }}>
              <tbody>
                {ECHEANCES.map((e) => {
                  const j = daysUntil(e.date);
                  const classe = j < 0 ? 'badge--danger' : j <= 30 ? 'badge--warning' : 'badge--neutral';
                  return (
                    <tr key={e.libelle} style={{ borderBottom: '1px solid var(--g-200)' }}>
                      <td style={{ padding: '.6rem .3rem' }}>{e.libelle}</td>
                      <td style={{ padding: '.6rem .3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {dateLong(e.date)}
                      </td>
                      <td style={{ padding: '.6rem .3rem', textAlign: 'right', width: 96 }}>
                        <span className={`badge ${classe}`}>{j < 0 ? 'dépassée' : `J-${j}`}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
