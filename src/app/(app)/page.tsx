import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { dateLong, daysUntil, money } from '@/lib/format';
import { profilCourant } from '@/lib/auth';
import { redirect } from 'next/navigation';

/**
 * Centre d'action — page d'accueil.
 *
 * Ronde 0 : vérifie que la chaîne Next → Supabase → Vercel fonctionne, et
 * affiche les échéances réelles calculées à partir de l'exercice. Ces dates
 * sont pour l'instant en dur ; elles passeront en base à la ronde 10.
 */

const ECHEANCES = [
  { libelle: 'Déclaration initiale CFE (formulaire 1447-C)', date: '2026-12-31' },
  { libelle: 'Clôture du premier exercice', date: '2027-09-30' },
  { libelle: 'Déclaration de TVA CA12E', date: '2027-12-31' },
  { libelle: 'Liasse fiscale (2065)', date: '2027-12-31' },
];

async function testerConnexion() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.getSession();
    return error ? `Erreur : ${error.message}` : 'Connexion établie';
  } catch (e) {
    return `Non configurée (${e instanceof Error ? e.message : 'erreur inconnue'})`;
  }
}

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');

  const etatSupabase = await testerConnexion();
  const ok = etatSupabase === 'Connexion établie';

  const prochaine = ECHEANCES
    .map((e) => ({ ...e, jours: daysUntil(e.date) }))
    .filter((e) => e.jours >= 0)
    .sort((a, b) => a.jours - b.jours)[0];

  return (
    <>
      <Header titre="Centre d'action" sousTitre={`Bonjour ${profil.nom_complet.split(' ')[0]} — ce qu'il y a à faire aujourd'hui`} />

      <div className="content">
        <div className="grid-cards" style={{ marginBottom: '1.5rem' }}>
          <div className="card">
            <p className="card__title">Prochaine échéance</p>
            <p style={{ fontFamily: 'var(--display)', fontWeight: 600 }}>
              {prochaine.libelle}
            </p>
            <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: '.35rem' }}>
              {dateLong(prochaine.date)} — dans {prochaine.jours} jours
            </p>
          </div>

          <div className="card">
            <p className="card__title">Trésorerie</p>
            <p className="amount" style={{ fontSize: '1.4rem', fontFamily: 'var(--display)' }}>
              {money(null)}
            </p>
            <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.35rem' }}>
              Connexion Qonto — ronde 6
            </p>
          </div>

          <div className="card">
            <p className="card__title">Provision TVA</p>
            <p className="amount" style={{ fontSize: '1.4rem', fontFamily: 'var(--display)' }}>
              {money(null)}
            </p>
            <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.35rem' }}>
              Moteur TVA — ronde 9
            </p>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <p className="card__title">État du système</p>
          <p>
            <span className={ok ? 'badge badge--success' : 'badge badge--warning'}>
              {ok ? '✓' : '!'} Supabase
            </span>{' '}
            <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
              {etatSupabase}
            </span>
          </p>
        </div>

        <div className="card">
          <p className="card__title">Échéances de l'exercice</p>
          <div className="table-scroll"><table style={{ minWidth: 480, fontSize: 'var(--fs-sm)' }}>
            <tbody>
              {ECHEANCES.map((e) => {
                const j = daysUntil(e.date);
                const classe =
                  j < 0 ? 'badge--danger' : j <= 30 ? 'badge--warning' : 'badge--neutral';
                return (
                  <tr key={e.libelle} style={{ borderBottom: '1px solid var(--g-200)' }}>
                    <td style={{ padding: '.6rem 0' }}>{e.libelle}</td>
                    <td style={{ padding: '.6rem 0', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {dateLong(e.date)}
                    </td>
                    <td style={{ padding: '.6rem 0', textAlign: 'right', width: 110 }}>
                      <span className={`badge ${classe}`}>
                        {j < 0 ? 'dépassée' : `J-${j}`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      </div>
    </>
  );
}
