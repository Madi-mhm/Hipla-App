import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { date, daysUntil } from '@/lib/format';
import type { Vehicule } from '@/lib/types';

export const metadata = { title: 'Véhicules — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'read')) redirect('/');

  const supabase = await createClient();
  const [{ data: veh }, { data: bar }] = await Promise.all([
    supabase.from('vehicules').select('*').order('libelle'),
    supabase.from('bareme_km').select('*').eq('annee', new Date().getFullYear()).order('cv_min').order('km_min'),
  ]);
  const vehicules = (veh ?? []) as Vehicule[];

  return (
    <>
      <Header titre="Véhicules" sousTitre="Véhicules personnels utilisés à titre professionnel" />
      <div className="content">
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <p className="card__title">Véhicules enregistrés</p>
          <div className="table-scroll">
            <table style={{ minWidth: 620, fontSize: 'var(--fs-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                  <th style={th}>Véhicule</th>
                  <th style={th}>Immatriculation</th>
                  <th style={th}>Propriétaire</th>
                  <th style={{ ...th, textAlign: 'right' }}>CV</th>
                  <th style={{ ...th, textAlign: 'right' }}>Genre</th>
                  <th style={{ ...th, textAlign: 'right' }}>Contrôle technique</th>
                </tr>
              </thead>
              <tbody>
                {vehicules.map((v) => {
                  const j = v.date_ct ? daysUntil(v.date_ct) : null;
                  return (
                    <tr key={v.id} style={{ borderBottom: '1px solid var(--g-200)' }}>
                      <td style={{ ...td, fontWeight: 500 }}>
                        {v.libelle}
                        <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                          {v.motorisation}{v.usage_societe ? ' · à l\u2019actif' : ' · personnel'}
                        </span>
                      </td>
                      <td style={td} className="mono">{v.immatriculation}</td>
                      <td style={td}>{v.proprietaire_nom}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{v.cv_fiscaux}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <span className="badge badge--neutral">{v.genre}</span>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {v.date_ct ? (
                          <>
                            {date(v.date_ct)}
                            {j !== null && (
                              <span className={`badge ${j < 0 ? 'badge--danger' : j < 60 ? 'badge--warning' : 'badge--neutral'}`} style={{ marginLeft: '.4rem' }}>
                                {j < 0 ? 'dépassé' : `J-${j}`}
                              </span>
                            )}
                          </>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <p className="card__title">Barème kilométrique {new Date().getFullYear()}</p>
          <div className="table-scroll">
            <table style={{ minWidth: 480, fontSize: 'var(--fs-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                  <th style={th}>Puissance</th>
                  <th style={th}>Tranche annuelle</th>
                  <th style={{ ...th, textAlign: 'right' }}>Formule</th>
                </tr>
              </thead>
              <tbody>
                {(bar ?? []).map((b) => (
                  <tr key={b.id} style={{ borderBottom: '1px solid var(--g-200)' }}>
                    <td style={td}>{b.cv_min === b.cv_max ? `${b.cv_min} CV` : `${b.cv_min} à ${b.cv_max} CV`}</td>
                    <td style={td}>
                      {b.km_max ? `${b.km_min.toLocaleString('fr-FR')} à ${b.km_max.toLocaleString('fr-FR')} km` : `plus de ${(b.km_min - 1).toLocaleString('fr-FR')} km`}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }} className="mono">
                      km × {String(b.coefficient).replace('.', ',')}{Number(b.forfait) > 0 && ` + ${b.forfait}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.85rem', maxWidth: '62ch' }}>
            Barème officiel, à vérifier chaque année sur impots.gouv.fr. Les
            véhicules 100 % électriques bénéficient d'une majoration de 20 %.
            L'indemnité couvre le carburant, l'entretien, l'assurance, l'usure
            et la dépréciation : aucune de ces dépenses ne doit être saisie en
            plus pour un véhicule personnel.
          </p>
        </div>
      </div>
    </>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)', fontWeight: 500, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '.6rem .4rem', verticalAlign: 'top' };
