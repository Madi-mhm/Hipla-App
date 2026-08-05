import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut, LIBELLE_ROLE, DESCRIPTION_ROLE, type Role } from '@/lib/permissions';
import { dateLong } from '@/lib/format';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Utilisateurs — Hipla Gestion' };

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'utilisateurs', 'read')) redirect('/');

  const supabase = await createClient();
  const { data: profils } = await supabase
    .from('profils').select('*').order('cree_le');

  const roles: Role[] = ['proprietaire', 'contributeur', 'comptable'];

  return (
    <>
      <Header titre="Utilisateurs" sousTitre="Comptes et niveaux d'accès" />

      <div className="content">
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <p className="card__title">Comptes</p>
          <div className="table-scroll"><table style={{ minWidth: 480, fontSize: 'var(--fs-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                <th style={{ textAlign: 'left', padding: '.5rem 0', color: 'var(--g-500)', fontWeight: 500 }}>Nom</th>
                <th style={{ textAlign: 'left', padding: '.5rem 0', color: 'var(--g-500)', fontWeight: 500 }}>E-mail</th>
                <th style={{ textAlign: 'left', padding: '.5rem 0', color: 'var(--g-500)', fontWeight: 500 }}>Rôle</th>
                <th style={{ textAlign: 'right', padding: '.5rem 0', color: 'var(--g-500)', fontWeight: 500 }}>Créé le</th>
              </tr>
            </thead>
            <tbody>
              {(profils ?? []).map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--g-200)' }}>
                  <td style={{ padding: '.65rem 0', fontWeight: 500 }}>{p.nom_complet}</td>
                  <td style={{ padding: '.65rem 0' }} className="mono">{p.email}</td>
                  <td style={{ padding: '.65rem 0' }}>
                    <span className={`badge ${p.role === 'proprietaire' ? 'badge--info' : 'badge--neutral'}`}>
                      {LIBELLE_ROLE[p.role as Role]}
                    </span>
                  </td>
                  <td style={{ padding: '.65rem 0', textAlign: 'right' }} className="muted">
                    {dateLong(p.cree_le)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.9rem' }}>
            Les comptes se créent dans Supabase → Authentication → Users, puis le
            rôle s'ajuste ici. Cette étape volontairement manuelle évite qu'une
            faille de l'interface puisse créer un compte privilégié.
          </p>
        </div>

        <div className="card">
          <p className="card__title">Rôles</p>
          {roles.map((r) => (
            <div key={r} style={{ padding: '.75rem 0', borderBottom: '1px solid var(--g-200)' }}>
              <p style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 'var(--fs-sm)' }}>
                {LIBELLE_ROLE[r]}
              </p>
              <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: '.2rem' }}>
                {DESCRIPTION_ROLE[r]}
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
