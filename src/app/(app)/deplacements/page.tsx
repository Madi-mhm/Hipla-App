import Link from 'next/link';
import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { money, date } from '@/lib/format';
import { indemniteKm, type LigneBareme } from '@/lib/comptabilite';
import { LIBELLE_STATUT, CLASSE_STATUT, type Deplacement, type Vehicule } from '@/lib/types';
import ActionsValidation from '@/components/ActionsValidation';

export const metadata = { title: 'Déplacements — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'read')) redirect('/');

  const supabase = await createClient();
  const annee = new Date().getFullYear();

  const [{ data: dep }, { data: veh }, { data: bar }] = await Promise.all([
    supabase.from('deplacements')
      .select('*, vehicules(libelle, immatriculation, cv_fiscaux, motorisation), profils!deplacements_cree_par_fkey(nom_complet)')
      .order('date_trajet', { ascending: false }).limit(200),
    supabase.from('vehicules').select('*').eq('actif', true),
    supabase.from('bareme_km').select('*').eq('annee', annee),
  ]);

  const deplacements = (dep ?? []) as Deplacement[];
  const vehicules = (veh ?? []) as Vehicule[];
  const bareme = (bar ?? []) as LigneBareme[];
  const attente = deplacements.filter((d) => d.statut === 'en_attente');

  // Cumul annuel par véhicule : le coefficient du barème dépend du total
  // parcouru sur l'année, pas de chaque trajet pris isolément.
  const parVehicule = vehicules.map((v) => {
    const km = deplacements
      .filter((d) => d.vehicule_id === v.id && d.statut === 'validee'
        && new Date(d.date_trajet).getFullYear() === annee)
      .reduce((s, d) => s + Number(d.kilometres) * (d.aller_retour ? 2 : 1), 0);
    return {
      vehicule: v,
      km,
      indemnite: indemniteKm(km, v.cv_fiscaux, bareme, v.motorisation === 'electrique'),
    };
  });

  const totalIndemnite = parVehicule.reduce((s, x) => s + x.indemnite, 0);
  const peutValider = peut(profil.role, 'depenses', 'validate');
  const peutCreer = peut(profil.role, 'depenses', 'create');

  return (
    <>
      <Header titre="Déplacements" sousTitre={`Indemnités kilométriques ${annee}`} />

      <div className="content">
        {vehicules.length === 0 ? (
          <div className="card">
            <p>Aucun véhicule enregistré.</p>
            <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: '.5rem' }}>
              Ajoutez d'abord un véhicule dans Réglages → Véhicules.
            </p>
          </div>
        ) : (
          <>
            <div className="grid-cards" style={{ marginBottom: '1.25rem' }}>
              {parVehicule.map((x) => (
                <div key={x.vehicule.id} className="card">
                  <p className="card__title">{x.vehicule.libelle}</p>
                  <p className="amount" style={{ fontSize: '1.35rem', fontFamily: 'var(--display)', fontWeight: 600 }}>
                    {money(x.indemnite)}
                  </p>
                  <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.35rem' }}>
                    {x.km.toLocaleString('fr-FR')} km · {x.vehicule.cv_fiscaux} CV
                    {x.vehicule.motorisation === 'electrique' && ' · +20 % électrique'}
                  </p>
                </div>
              ))}
              <div className="card" style={{ borderLeft: '3px solid var(--gold)' }}>
                <p className="card__title">Total à rembourser</p>
                <p className="amount" style={{ fontSize: '1.35rem', fontFamily: 'var(--display)', fontWeight: 600 }}>
                  {money(totalIndemnite)}
                </p>
                <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.35rem' }}>
                  Exonéré d'impôt et de cotisations
                </p>
              </div>
            </div>

            {peutCreer && (
              <div style={{ marginBottom: '1.25rem' }}>
                <Link href="/deplacements/nouveau" className="btn btn--gold">+ Nouveau trajet</Link>
              </div>
            )}

            {attente.length > 0 && (
              <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--warning)' }}>
                <p className="card__title" style={{ color: 'var(--warning)' }}>À valider — {attente.length}</p>
                <Tableau lignes={attente} peutValider={peutValider} />
              </div>
            )}

            <div className="card">
              <p className="card__title">Journal des trajets</p>
              {deplacements.length === 0 ? (
                <p className="muted" style={{ fontSize: 'var(--fs-sm)', padding: '1rem 0' }}>
                  Aucun trajet enregistré. Le journal est ce qui justifie l'indemnité :
                  sans lui, le remboursement n'est pas défendable en contrôle.
                </p>
              ) : (
                <Tableau lignes={deplacements} peutValider={false} />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Tableau({ lignes, peutValider }: { lignes: Deplacement[]; peutValider: boolean }) {
  return (
    <div className="table-scroll">
      <table style={{ minWidth: 620, fontSize: 'var(--fs-sm)' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
            <th style={th}>Pièce</th>
            <th style={th}>Date</th>
            <th style={th}>Trajet</th>
            <th style={th} className="col-secondaire">Motif</th>
            <th style={{ ...th, textAlign: 'right' }}>Km</th>
            <th style={{ ...th, textAlign: 'right' }}>Statut</th>
            {peutValider && <th style={{ ...th, textAlign: 'right' }}>Action</th>}
          </tr>
        </thead>
        <tbody>
          {lignes.map((d) => (
            <tr key={d.id} style={{
            borderBottom: '1px solid var(--g-200)',
            opacity: d.statut === 'annulee' ? 0.45 : 1,
          }}>
              <td style={td} className="mono">
                <span style={{ fontSize: '.72rem', color: 'var(--g-600)' }}>
                  {d.numero_piece ?? '—'}
                </span>
              </td>
              <td style={td}>{date(d.date_trajet)}</td>
              <td style={{ ...td, fontWeight: 500 }}>
                {d.depart} → {d.arrivee}
                {d.aller_retour && <span className="badge badge--neutral" style={{ marginLeft: '.4rem' }}>A/R</span>}
              </td>
              <td style={td} className="col-secondaire">{d.motif}</td>
              <td style={{ ...td, textAlign: 'right' }} className="amount">
                {(Number(d.kilometres) * (d.aller_retour ? 2 : 1)).toLocaleString('fr-FR')}
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                <span className={`badge ${CLASSE_STATUT[d.statut]}`}>{LIBELLE_STATUT[d.statut]}</span>
              </td>
              {peutValider && (
                <td style={{ ...td, textAlign: 'right' }}>
                  <ActionsValidation table="deplacements" id={d.id}
                    resume={`${d.numero_piece ?? ''} · ${d.depart} → ${d.arrivee} · ${Number(d.kilometres) * (d.aller_retour ? 2 : 1)} km`} />
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
