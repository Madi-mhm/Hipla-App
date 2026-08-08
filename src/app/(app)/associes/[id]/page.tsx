import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import Reference from '@/components/Reference';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { money, date, dateLong } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * FICHE D'UN ASSOCIÉ
 *
 * Tout ce que la société sait de cette personne et de ce qu'elle lui
 * doit. Le mouvement de compte courant y est tracé jusqu'à l'opération
 * bancaire, quand elle existe — c'est ce qui rend un remboursement
 * défendable.
 */

const FONCTIONS: Record<string, string> = {
  president: 'Président',
  directeur_general: 'Directeur général',
  associe: 'Associé',
};

type Mouvement = {
  id: string; numero_piece: string | null;
  date_ecriture: string; date_piece: string;
  tiers: string; objet: string | null; nature: string;
  motif: string; sens: string; montant: number;
  transaction: { numero_piece: string | null; date_operation: string; libelle: string } | null;
};

type Dossier = {
  identifiant: string; nom_complet: string; prenom: string; nom: string;
  fonction: string | null;
  date_naissance: string | null; lieu_naissance: string | null;
  nationalite: string | null;
  adresse: string | null; code_postal: string | null; ville: string | null;
  telephone: string | null; email: string | null;
  date_entree: string | null; actif: boolean;
  parts: number;
  capital_souscrit: number; capital_libere: number; capital_restant: number;
  quote_part: number;
  compte_courant: { avance: number; rembourse: number; solde: number };
  mouvements: Mouvement[];
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'entreprise', 'read')) redirect('/');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('dossier_associe', { p_identifiant: id });

  if (error || !data) notFound();
  const d = data as Dossier;
  const cc = d.compte_courant;

  return (
    <>
      <Header
        titre={d.nom_complet}
        sousTitre={d.fonction ? FONCTIONS[d.fonction] ?? d.fonction : 'Associé'}
      />
      <div className="content">

        {/* ---------- Participation et compte courant ---------- */}
        <section style={{
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
              Compte courant
            </p>
            <p className="amount" style={{
              fontFamily: 'var(--display)', fontSize: '2.2rem', fontWeight: 600,
              color: 'var(--g-0)', marginTop: '.3rem', letterSpacing: '-0.02em',
            }}>
              {money(Number(cc.solde))}
            </p>
            <p style={{
              fontSize: 'var(--fs-xs)', color: 'rgba(255,255,255,.6)',
              marginTop: '.35rem', maxWidth: '44ch', lineHeight: 1.5,
            }}>
              {Number(cc.solde) > 0.005
                ? 'Dette de la société, remboursable sans impôt ni charge sociale.'
                : 'La société ne doit rien à cet associé.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '2.2rem', flexWrap: 'wrap' }}>
            <Bloc titre="Capital souscrit" valeur={money(Number(d.capital_souscrit))}
              note={`${d.parts} parts · ${Number(d.quote_part).toFixed(0)} %`} />
            <Bloc titre="Libéré" valeur={money(Number(d.capital_libere))}
              note={Number(d.capital_restant) > 0.005
                ? `${money(Number(d.capital_restant))} restants` : 'intégralement'} />
            <Bloc titre="Avancé" valeur={money(Number(cc.avance))}
              note={Number(cc.rembourse) > 0.005
                ? `${money(Number(cc.rembourse))} remboursés` : 'rien remboursé'} />
          </div>
        </section>

        {/* ---------- Identité ---------- */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <p className="card__title">Identité</p>
          <div style={{
            display: 'grid', gap: '.4rem .2rem', marginTop: '.6rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(19rem, 1fr))',
          }}>
            <Ligne cle="Nom" valeur={d.nom_complet} />
            <Ligne cle="Fonction"
              valeur={d.fonction ? FONCTIONS[d.fonction] ?? d.fonction : 'Associé'} />
            {d.date_naissance && (
              <Ligne cle="Né le"
                valeur={`${dateLong(d.date_naissance)}${d.lieu_naissance ? ` à ${d.lieu_naissance}` : ''}`} />
            )}
            {d.nationalite && <Ligne cle="Nationalité" valeur={d.nationalite} />}
            {d.adresse && (
              <Ligne cle="Adresse"
                valeur={`${d.adresse}${d.code_postal || d.ville ? `, ${d.code_postal ?? ''} ${d.ville ?? ''}` : ''}`} />
            )}
            {d.telephone && <Ligne cle="Téléphone" valeur={d.telephone} />}
            {d.email && <Ligne cle="Courriel" valeur={d.email} />}
            {d.date_entree && <Ligne cle="Associé depuis" valeur={dateLong(d.date_entree)} />}
          </div>

          {(!d.date_naissance || !d.adresse) && (
            <p className="muted" style={{
              fontSize: 'var(--fs-xs)', marginTop: '.9rem', lineHeight: 1.5, maxWidth: '68ch',
            }}>
              Date et lieu de naissance, adresse : un procès-verbal d&apos;assemblée
              les exige. Complétez-les dans Réglages avant votre première assemblée.
            </p>
          )}
        </div>

        {/* ---------- Mouvements ---------- */}
        <div className="card">
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap',
          }}>
            <p className="card__title" style={{ margin: 0 }}>
              Mouvements de compte courant — {d.mouvements.length}
            </p>
            {Number(cc.solde) > 0.005 && (
              <Link href="/banque" className="btn btn--ghost"
                style={{ minHeight: 30, fontSize: '.72rem' }}>
                Enregistrer un remboursement
              </Link>
            )}
          </div>

          {d.mouvements.length === 0 ? (
            <div className="etat-vide">
              <p>Aucun mouvement.</p>
              <p className="muted">
                Une dépense payée personnellement ou une indemnité kilométrique
                crédite ce compte.
              </p>
            </div>
          ) : (
            <div className="table-scroll" style={{ marginTop: '.8rem' }}>
              <table style={{ minWidth: 680, fontSize: 'var(--fs-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                    <th style={th}>Date</th>
                    <th style={th}>Pièce</th>
                    <th style={th}>Motif</th>
                    <th style={th} className="col-secondaire">Opération bancaire</th>
                    <th style={{ ...th, textAlign: 'right' }}>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {d.mouvements.map((m) => {
                    const rendu = m.sens === 'rembourse';
                    return (
                      <tr key={m.id} style={{ borderBottom: '1px solid var(--g-200)' }}>
                        <td style={td}>{date(m.date_ecriture)}</td>
                        <td style={td} className="mono">
                          <Reference id={m.id}
                            style={{ color: 'var(--navy)', fontSize: '.72rem' }}>
                            {m.numero_piece ?? '—'}
                          </Reference>
                        </td>
                        <td style={{ ...td, fontWeight: 500 }}>
                          {m.motif}
                          {m.objet && (
                            <span className="muted" style={{
                              display: 'block', fontSize: 'var(--fs-xs)',
                            }}>
                              {m.tiers} · {m.objet}
                            </span>
                          )}
                        </td>
                        {/* La trace jusqu'au relevé : c'est elle qui rend
                            un remboursement défendable. */}
                        <td style={td} className="col-secondaire muted">
                          {m.transaction ? (
                            <>
                              <span className="mono" style={{ fontSize: '.7rem' }}>
                                {m.transaction.numero_piece}
                              </span>
                              <span style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                                {date(m.transaction.date_operation)}
                              </span>
                            </>
                          ) : (
                            <span style={{ fontSize: 'var(--fs-xs)' }}>hors banque</span>
                          )}
                        </td>
                        <td style={{
                          ...td, textAlign: 'right', fontWeight: 600,
                          color: rendu ? 'var(--success)' : 'var(--navy)',
                        }} className="amount">
                          {rendu ? '− ' : '+ '}{money(Math.abs(Number(m.montant)))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ marginTop: '1.25rem' }}>
          <Link href="/associes" className="btn btn--ghost">Retour aux associés</Link>
        </div>
      </div>
    </>
  );
}

function Bloc({ titre, valeur, note }: { titre: string; valeur: string; note: string }) {
  return (
    <div style={{ minWidth: '8rem' }}>
      <p style={{
        fontSize: '.68rem', letterSpacing: '.08em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,.55)',
      }}>
        {titre}
      </p>
      <p className="amount" style={{
        fontFamily: 'var(--display)', fontSize: '1.15rem', fontWeight: 600,
        color: 'var(--g-0)', marginTop: '.2rem',
      }}>
        {valeur}
      </p>
      <p style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.45)', marginTop: '.1rem' }}>
        {note}
      </p>
    </div>
  );
}

function Ligne({ cle, valeur }: { cle: string; valeur: string }) {
  return (
    <div style={{ display: 'flex', gap: '1rem', fontSize: 'var(--fs-sm)' }}>
      <span style={{ width: 130, color: 'var(--g-500)', flexShrink: 0 }}>{cle}</span>
      <span>{valeur}</span>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)',
  fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.6rem .4rem', verticalAlign: 'top' };
