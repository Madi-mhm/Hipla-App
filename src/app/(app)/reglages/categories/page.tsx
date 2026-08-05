import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import type { Categorie } from '@/lib/types';

export const metadata = { title: 'Catégories — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'read')) redirect('/');

  const supabase = await createClient();
  const { data } = await supabase.from('categories').select('*').order('ordre');
  const categories = (data ?? []) as Categorie[];
  const groupes = Array.from(new Set(categories.map((c) => c.groupe)));

  return (
    <>
      <Header titre="Catégories" sousTitre={`${categories.length} catégories · plan comptable`} />
      <div className="content">
        {groupes.map((g) => (
          <div className="card" key={g} style={{ marginBottom: '1rem' }}>
            <p className="card__title">{g}</p>
            <div className="table-scroll">
              <table style={{ minWidth: 560, fontSize: 'var(--fs-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                    <th style={th}>Libellé</th>
                    <th style={th}>Compte</th>
                    <th style={{ ...th, textAlign: 'right' }}>TVA</th>
                    <th style={{ ...th, textAlign: 'right' }}>Déduct.</th>
                    <th style={{ ...th, textAlign: 'right' }}>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.filter((c) => c.groupe === g).map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--g-200)', opacity: c.bloque ? 0.55 : 1 }}>
                      <td style={td}>
                        {c.libelle}
                        {c.bloque && <span className="badge badge--danger" style={{ marginLeft: '.4rem' }}>bloquée</span>}
                        {c.avertissement && (
                          <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)', marginTop: '.15rem' }}>
                            {c.avertissement}
                          </span>
                        )}
                      </td>
                      <td style={td} className="mono">{c.compte}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{c.taux_tva_defaut} %</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <span className={`badge ${c.taux_deductibilite === 100 ? 'badge--success' : c.taux_deductibilite === 80 ? 'badge--warning' : 'badge--neutral'}`}>
                          {c.taux_deductibilite} %
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }} className="muted">
                        {c.type === 'immobilisation' ? `Immo · ${c.duree_amortissement} ans` : 'Charge'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        <p className="muted" style={{ fontSize: 'var(--fs-xs)', maxWidth: '60ch' }}>
          Une catégorie déjà utilisée ne peut pas être supprimée, seulement
          archivée : les écritures passées doivent conserver leur rattachement
          pour que l'export FEC reste cohérent.
        </p>
      </div>
    </>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)', fontWeight: 500, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '.6rem .4rem', verticalAlign: 'top' };
