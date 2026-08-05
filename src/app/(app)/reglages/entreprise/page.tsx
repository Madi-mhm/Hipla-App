import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { money, dateLong } from '@/lib/format';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Entreprise — Hipla Gestion' };

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'entreprise', 'read')) redirect('/');

  const supabase = await createClient();
  const { data: ent } = await supabase.from('entreprise').select('*').single();
  const { data: exercices } = await supabase
    .from('exercices').select('*').order('date_debut');

  const modifiable = peut(profil.role, 'entreprise', 'update');

  const lignes: [string, string | null][] = [
    ['Raison sociale', ent?.raison_sociale ?? null],
    ['Forme juridique', ent?.forme_juridique ?? null],
    ['Capital social', ent ? money(Number(ent.capital)) : null],
    ['SIREN', ent?.siren ?? null],
    ['SIRET (siège)', ent?.siret ?? null],
    ['RCS', ent?.rcs ?? null],
    ['TVA intracommunautaire', ent?.tva_intracom ?? null],
    ['Code APE', ent?.code_ape ?? null],
    ['Siège social', ent ? `${ent.adresse}, ${ent.code_postal} ${ent.ville}` : null],
    ['Président', ent?.president ?? null],
    ['Directeur général', ent?.directeur_general ?? null],
  ];

  return (
    <>
      <Header titre="Entreprise" sousTitre="Identité légale et exercices" />

      <div className="content">
        {!modifiable && (
          <p className="badge badge--info" style={{ marginBottom: '1rem' }}>
            Lecture seule — votre rôle ne permet pas la modification
          </p>
        )}

        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <p className="card__title">Identité légale</p>
          <div className="table-scroll"><table style={{ minWidth: 480, fontSize: 'var(--fs-sm)' }}>
            <tbody>
              {lignes.map(([k, v]) => (
                <tr key={k} style={{ borderBottom: '1px solid var(--g-200)' }}>
                  <td style={{ padding: '.6rem 0', color: 'var(--g-500)', width: '40%' }}>{k}</td>
                  <td style={{ padding: '.6rem 0', fontWeight: 500 }}>{v ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.9rem' }}>
            Source : extrait Kbis du 29 juillet 2026. Toute modification doit
            correspondre à un Kbis à jour.
          </p>
        </div>

        <div className="card">
          <p className="card__title">Exercices</p>
          <div className="table-scroll"><table style={{ minWidth: 480, fontSize: 'var(--fs-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                <th style={{ textAlign: 'left', padding: '.5rem 0', color: 'var(--g-500)', fontWeight: 500 }}>Période</th>
                <th style={{ textAlign: 'left', padding: '.5rem 0', color: 'var(--g-500)', fontWeight: 500 }}>Régime TVA</th>
                <th style={{ textAlign: 'right', padding: '.5rem 0', color: 'var(--g-500)', fontWeight: 500 }}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {(exercices ?? []).map((ex) => (
                <tr key={ex.id} style={{ borderBottom: '1px solid var(--g-200)' }}>
                  <td style={{ padding: '.6rem 0' }}>
                    {dateLong(ex.date_debut)} → {dateLong(ex.date_fin)}
                  </td>
                  <td style={{ padding: '.6rem 0' }}>
                    {ex.regime_tva === 'simplifie' ? 'Réel simplifié (CA12E)' : 'Réel normal (CA3)'}
                  </td>
                  <td style={{ padding: '.6rem 0', textAlign: 'right' }}>
                    <span className={`badge ${ex.statut === 'ouvert' ? 'badge--success' : 'badge--neutral'}`}>
                      {ex.statut}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.9rem' }}>
            Le régime simplifié est supprimé au 1<sup>er</sup> janvier 2027
            (art. 38 LF 2025). Il s'applique jusqu'à la clôture de l'exercice en
            cours à cette date, puis bascule au réel normal.
          </p>
        </div>
      </div>
    </>
  );
}
