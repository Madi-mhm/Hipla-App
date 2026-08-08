import { redirect } from 'next/navigation';
import RefAssocie from '@/components/apercu/RefAssocie';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { money } from '@/lib/format';

export const metadata = { title: 'Associés — Hipla Gestion' };
export const dynamic = 'force-dynamic';

/**
 * LES ASSOCIÉS
 *
 * Deux natures d'argent, qu'il ne faut jamais confondre :
 *
 * · le CAPITAL est immobilisé. Il ne se retire pas sans réduction de
 *   capital, une procédure lourde qui passe par une assemblée
 *   extraordinaire et un délai d'opposition des créanciers ;
 * · le COMPTE COURANT est une dette ordinaire. Il se rembourse quand la
 *   trésorerie le permet, sans impôt ni charge sociale.
 *
 * Les afficher côte à côte, en distinguant clairement les deux, évite la
 * confusion la plus coûteuse du dirigeant de petite société.
 */

const FONCTIONS: Record<string, string> = {
  president: 'Président',
  directeur_general: 'Directeur général',
  associe: 'Associé',
};

type Associe = {
  identifiant: string; nom: string; prenom: string;
  fonction: string | null; parts: number;
  capital_souscrit: number; capital_libere: number;
  ville: string | null; email: string | null; actif: boolean;
};

type Solde = { associe: string; nom: string; solde: number; avance: number };

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'entreprise', 'read')) redirect('/');

  const supabase = await createClient();

  const [{ data: associes }, { data: soldes }] = await Promise.all([
    supabase.from('associes').select('*').order('fonction').order('nom'),
    supabase.rpc('solde_compte_courant'),
  ]);

  const a = (associes ?? []) as Associe[];
  const s = (soldes ?? []) as Solde[];

  const capitalTotal = a.filter((x) => x.actif)
    .reduce((acc, x) => acc + Number(x.capital_souscrit), 0);
  const libereTotal = a.filter((x) => x.actif)
    .reduce((acc, x) => acc + Number(x.capital_libere), 0);
  const courantTotal = s.reduce((acc, x) => acc + Number(x.solde), 0);

  return (
    <>
      <Header titre="Associés" sousTitre="Capital, participation et comptes courants" />
      <div className="content">

        {/* ---------- Les deux natures d'argent ---------- */}
        <div className="grid-cards" style={{ marginBottom: '1.5rem' }}>
          <div className="card">
            <p className="card__title">Capital social</p>
            <p className="amount" style={chiffre}>{money(capitalTotal)}</p>
            <p className="muted" style={petit}>
              {libereTotal >= capitalTotal - 0.005
                ? 'Intégralement libéré'
                : `${money(libereTotal)} libérés`}
              {' · '}{a.filter((x) => x.actif).reduce((n, x) => n + x.parts, 0)} parts
            </p>
          </div>
          <div className="card">
            <p className="card__title">Comptes courants</p>
            <p className="amount" style={{ ...chiffre, color: 'var(--gold-ink)' }}>
              {money(courantTotal)}
            </p>
            <p className="muted" style={petit}>
              Dette de la société, remboursable à tout moment
            </p>
          </div>
          <div className="card">
            <p className="card__title">Associés</p>
            <p className="amount" style={chiffre}>{a.filter((x) => x.actif).length}</p>
            <p className="muted" style={petit}>
              {a.filter((x) => !x.actif).length > 0
                ? `${a.filter((x) => !x.actif).length} sorti(s)` : 'Tous en fonction'}
            </p>
          </div>
        </div>

        {/* ---------- La distinction qui compte ---------- */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <p className="card__title">Deux natures d&apos;argent</p>
          <div style={{
            display: 'grid', gap: '1.2rem', marginTop: '.6rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))',
          }}>
            <div>
              <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--navy)' }}>
                Le capital est immobilisé
              </p>
              <p className="muted" style={{
                fontSize: 'var(--fs-sm)', marginTop: '.3rem', lineHeight: 1.55,
              }}>
                Il ne se retire pas librement. Le récupérer exige une réduction de
                capital : assemblée extraordinaire, délai d&apos;opposition des
                créanciers, formalités au greffe.
              </p>
            </div>
            <div>
              <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--gold-ink)' }}>
                Le compte courant se rembourse
              </p>
              <p className="muted" style={{
                fontSize: 'var(--fs-sm)', marginTop: '.3rem', lineHeight: 1.55,
              }}>
                C&apos;est une dette ordinaire de la société. Elle se rembourse dès
                que la trésorerie le permet, sans impôt ni charge sociale — c&apos;est
                souvent le premier argent qu&apos;un dirigeant récupère.
              </p>
            </div>
          </div>
        </div>

        {/* ---------- Les fiches ---------- */}
        {a.length === 0 ? (
          <div className="card">
            <div className="etat-vide">
              <p>Aucun associé enregistré.</p>
            </div>
          </div>
        ) : (
          <div style={{
            display: 'grid', gap: '1rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(21rem, 1fr))',
          }}>
            {a.map((x) => {
              const solde = s.find((y) => y.associe === x.identifiant);
              const quotePart = capitalTotal > 0
                ? (Number(x.capital_souscrit) / capitalTotal) * 100 : 0;

              return (
                <RefAssocie key={x.identifiant} identifiant={x.identifiant}
                  className="card" style={{
                    display: 'block', textDecoration: 'none',
                    opacity: x.actif ? 1 : 0.5,
                    borderLeft: '3px solid var(--navy)',
                  }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start', gap: '1rem',
                  }}>
                    <div>
                      <p style={{
                        fontFamily: 'var(--display)', fontSize: 'var(--fs-lg)',
                        fontWeight: 600, color: 'var(--navy)',
                      }}>
                        {x.prenom} {x.nom}
                      </p>
                      <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                        {x.fonction ? FONCTIONS[x.fonction] ?? x.fonction : 'Associé'}
                        {x.ville && ` · ${x.ville}`}
                      </p>
                    </div>
                    <span className="badge badge--neutral" style={{ fontSize: '.68rem' }}>
                      {quotePart.toFixed(0)} %
                    </span>
                  </div>

                  <div style={{
                    display: 'flex', gap: '1.6rem', marginTop: '1rem',
                    paddingTop: '.8rem', borderTop: '1px solid var(--g-200)',
                    flexWrap: 'wrap',
                  }}>
                    <div>
                      <p style={etiquette}>Capital</p>
                      <p className="amount" style={valeur}>
                        {money(Number(x.capital_souscrit))}
                      </p>
                      <p className="muted" style={{ fontSize: '.65rem' }}>
                        {x.parts} parts
                        {Number(x.capital_libere) < Number(x.capital_souscrit) - 0.005
                          && ' · non libéré'}
                      </p>
                    </div>
                    <div>
                      <p style={etiquette}>Compte courant</p>
                      <p className="amount" style={{
                        ...valeur,
                        color: Number(solde?.solde ?? 0) > 0.005
                          ? 'var(--gold-ink)' : 'var(--g-500)',
                      }}>
                        {money(Number(solde?.solde ?? 0))}
                      </p>
                      <p className="muted" style={{ fontSize: '.65rem' }}>
                        {Number(solde?.solde ?? 0) > 0.005
                          ? 'dû par la société' : 'rien à rembourser'}
                      </p>
                    </div>
                  </div>
                </RefAssocie>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

const chiffre: React.CSSProperties = {
  fontSize: '1.35rem', fontFamily: 'var(--display)', fontWeight: 600,
};
const petit: React.CSSProperties = { fontSize: 'var(--fs-xs)', marginTop: '.3rem' };
const etiquette: React.CSSProperties = {
  fontSize: '.65rem', letterSpacing: '.07em', textTransform: 'uppercase',
  color: 'var(--g-500)',
};
const valeur: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: '1.05rem', fontWeight: 600,
  color: 'var(--navy)', marginTop: '.15rem',
};
