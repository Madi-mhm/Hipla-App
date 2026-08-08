'use client';

/**
 * LA SÉANCE HEBDOMADAIRE
 *
 * L'objet du projet. Cinq blocs, dans un ordre qui n'est pas décoratif :
 * on ne peut pas juger des chiffres tant que les mouvements ne sont pas
 * tous expliqués.
 *
 * Le premier bloc est le seul contrôle de complétude qui existe. Tant
 * qu'il n'est pas vide, la comptabilité de la semaine n'est pas close —
 * et c'est aussi le premier point qu'un vérificateur regarde.
 *
 * Tout se traite ici : confirmer un rapprochement, valider une saisie.
 * Ce qui demande une décision plus longue renvoie à l'écran dédié.
 */

import { useState } from 'react';
import Link from 'next/link';
import RefBanque from '@/components/apercu/RefBanque';
import Reference from '@/components/Reference';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money, date } from '@/lib/format';
import Alerte from '@/components/Alerte';

export type Seance = {
  non_explique: Array<{
    id: string; numero_piece: string | null; date_operation: string;
    libelle: string; montant: number; sens: string;
    a_justificatif: boolean;
    regle: { libelle?: string; source?: string } | null;
  }>;
  a_confirmer: Array<{
    transaction_id: string; operation: string | null; date_operation: string;
    libelle_banque: string; montant: number;
    piece_id: string; piece: string | null; tiers: string; reste_du: number;
    score: number; motifs: string[];
  }>;
  a_valider: Array<{
    id: string; nature: string; date_piece: string; tiers: string;
    objet: string | null; montant_ttc: number; categorie: string | null;
    a_justificatif: boolean; extrait_par_ia: boolean;
  }>;
  anomalies: Array<{
    type: string; id: string; lien: string; numero_piece: string | null;
    date_piece: string; tiers: string; montant_ttc: number; detail: string;
  }>;
  creation: { lignes: number; montant: number; tva: number } | null;
  chiffres: Record<string, number>;
  compteurs: Record<string, number>;
  close: boolean;
};

export default function SeanceHebdo({ seance }: { seance: Seance }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const c = seance.compteurs;
  const ch = seance.chiffres;

  async function confirmer(pieceId: string, transactionId: string) {
    setEnCours(transactionId);
    setErreur(null);
    const supabase = createClient();
    const { error } = await supabase.rpc('confirmer_appariement', {
      p_piece: pieceId, p_transaction: transactionId, p_automatique: false,
    });
    if (error) { setErreur(`Rapprochement impossible — ${error.message}`); setEnCours(null); return; }
    setEnCours(null);
    router.refresh();
  }

  async function valider(pieceId: string) {
    setEnCours(pieceId);
    setErreur(null);
    const supabase = createClient();
    const { error } = await supabase.rpc('valider_piece', { p_id: pieceId });
    if (error) { setErreur(`Validation impossible — ${error.message}`); setEnCours(null); return; }
    setEnCours(null);
    router.refresh();
  }

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}

      {/* ---------- L'état de la semaine ---------- */}
      <div className="card" style={{
        marginBottom: '1.5rem',
        borderLeft: `3px solid ${seance.close ? 'var(--success)' : 'var(--warning)'}`,
      }}>
        {seance.close ? (
          <>
            <p style={{
              fontFamily: 'var(--display)', fontSize: '1.3rem', fontWeight: 600,
              color: 'var(--success)',
            }}>
              Chaque mouvement bancaire est expliqué.
            </p>
            <p className="muted" style={{
              fontSize: 'var(--fs-sm)', marginTop: '.5rem', lineHeight: 1.55, maxWidth: '68ch',
            }}>
              C&apos;est le seul contrôle de complétude qui existe, et le premier
              point qu&apos;un vérificateur regarde. Il reste
              {c.a_valider > 0 ? ` ${c.a_valider} saisie${c.a_valider > 1 ? 's' : ''} à valider` : ' peu à faire'}
              {c.anomalies > 0 ? ` et ${c.anomalies} anomalie${c.anomalies > 1 ? 's' : ''} à corriger` : ''}.
            </p>
          </>
        ) : (
          <>
            <p style={{
              fontFamily: 'var(--display)', fontSize: '1.3rem', fontWeight: 600,
              color: 'var(--navy)',
            }}>
              {c.non_explique + c.a_confirmer} mouvement
              {c.non_explique + c.a_confirmer > 1 ? 's' : ''} à expliquer
            </p>
            <p className="muted" style={{
              fontSize: 'var(--fs-sm)', marginTop: '.5rem', lineHeight: 1.55, maxWidth: '68ch',
            }}>
              Tant qu&apos;un mouvement bancaire n&apos;est rattaché à aucune
              écriture, la charge n&apos;est ni déduite ni récupérée en TVA, et
              la comptabilité de la semaine n&apos;est pas close.
            </p>
          </>
        )}
      </div>

      {/* ---------- 2. À confirmer ---------- */}
      {seance.a_confirmer.length > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--info)' }}>
          <p className="card__title">À confirmer — {c.a_confirmer}</p>
          <p className="muted" style={{
            fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '68ch', marginBottom: '.9rem',
          }}>
            Le moteur a trouvé une correspondance. Vérifiez qu&apos;il s&apos;agit
            bien du même achat — deux dépenses du même montant chez le même
            fournisseur à deux jours d&apos;intervalle, cela existe.
          </p>

          {seance.a_confirmer.map((p) => (
            <div key={p.transaction_id} style={ligne}>
              <div style={{ flex: 1, minWidth: '18rem' }}>
                <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 500 }}>
                  {p.libelle_banque} · {money(Number(p.montant))}
                  <span className="muted" style={{ fontWeight: 400 }}>
                    {' '}le {date(p.date_operation)}
                  </span>
                </p>
                <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.15rem' }}>
                  ↔ {p.piece ?? 'écriture en attente'} · {p.tiers} ·{' '}
                  {money(Number(p.reste_du))} dus
                </p>
                {Array.isArray(p.motifs) && p.motifs.length > 0 && (
                  <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.2rem' }}>
                    {p.motifs.join(' · ')}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '.4rem' }}>
                <RefBanque id={p.transaction_id} className="btn btn--ghost"
                  style={petitBouton}>Examiner</RefBanque>
                <button onClick={() => confirmer(p.piece_id, p.transaction_id)}
                  disabled={enCours !== null} className="btn btn--gold" style={petitBouton}>
                  Confirmer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- 1. Non expliqué ---------- */}
      {seance.non_explique.length > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--warning)' }}>
          <p className="card__title">Sans écriture — {c.non_explique}</p>
          <p className="muted" style={{
            fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '68ch', marginBottom: '.9rem',
          }}>
            Aucune écriture ne correspond à ces mouvements. Le montant vient de
            la banque et ne peut pas être faux : il ne reste qu&apos;à dire de
            quoi il s&apos;agit.
          </p>

          {seance.non_explique.map((t) => (
            <div key={t.id} style={ligne}>
              <div style={{ flex: 1, minWidth: '18rem' }}>
                <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 500 }}>
                  {t.libelle}
                  <span style={{
                    marginLeft: '.5rem',
                    color: t.sens === 'credit' ? 'var(--success)' : 'var(--navy)',
                  }} className="amount">
                    {t.sens === 'credit' ? '+ ' : '− '}{money(Number(t.montant))}
                  </span>
                </p>
                <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.15rem' }}>
                  {t.numero_piece} · {date(t.date_operation)}
                  {t.a_justificatif && ' · justificatif joint dans Qonto'}
                  {t.regle?.libelle && ` · règle « ${t.regle.libelle} »`}
                </p>
              </div>
              <RefBanque id={t.id} className="btn btn--gold" style={petitBouton}>
                Affecter
              </RefBanque>
            </div>
          ))}
        </div>
      )}

      {/* ---------- 3. À valider ---------- */}
      {seance.a_valider.length > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <p className="card__title">À valider — {c.a_valider}</p>
          <p className="muted" style={{
            fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '68ch', marginBottom: '.9rem',
          }}>
            Ces saisies n&apos;entrent en comptabilité qu&apos;après votre
            validation. C&apos;est là qu&apos;elles reçoivent leur numéro de
            pièce, définitif.
          </p>

          {seance.a_valider.map((p) => (
            <div key={p.id} style={ligne}>
              <div style={{ flex: 1, minWidth: '18rem' }}>
                <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 500 }}>
                  {p.tiers} · {money(Number(p.montant_ttc))}
                </p>
                <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.15rem' }}>
                  {date(p.date_piece)}
                  {p.categorie && ` · ${p.categorie}`}
                  {p.objet && ` · ${p.objet}`}
                  {p.extrait_par_ia && ' · extraite par IA'}
                </p>
                {!p.a_justificatif && (
                  <p style={{ fontSize: 'var(--fs-xs)', marginTop: '.2rem', color: 'var(--danger)' }}>
                    Aucune facture rattachée — la TVA ne sera pas déductible
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '.4rem' }}>
                <Reference id={p.id} className="btn btn--ghost"
                  style={petitBouton}>Examiner</Reference>
                <button onClick={() => valider(p.id)} disabled={enCours !== null}
                  className="btn btn--gold" style={petitBouton}>
                  Valider
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- 4. Anomalies ---------- */}
      {seance.anomalies.length > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--danger)' }}>
          <p className="card__title" style={{ color: 'var(--danger)' }}>
            Anomalies — {c.anomalies}
          </p>
          {seance.anomalies.map((a) => (
            <div key={`${a.type}-${a.id}`} style={ligne}>
              <div style={{ flex: 1, minWidth: '18rem' }}>
                <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 500 }}>
                  <Reference id={a.id} style={{ color: 'var(--navy)' }}>
                    {a.numero_piece ?? 'Sans numéro'}
                  </Reference>
                  {' · '}{a.tiers} ·{' '}
                  {money(Number(a.montant_ttc))}
                </p>
                <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.15rem' }}>
                  {a.detail}
                </p>
              </div>
              <Link href={a.lien} className="btn btn--ghost" style={petitBouton}>
                Corriger
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Ce qui attend l'assemblée ---------- */}
      {seance.creation && Number(seance.creation.lignes) > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <p className="card__title">En attente de l&apos;assemblée</p>
          <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '68ch' }}>
            <strong>{seance.creation.lignes} frais de création</strong> attendent
            d&apos;être ratifiés — {money(Number(seance.creation.montant))} de
            créance sur la société et{' '}
            {money(Number(seance.creation.tva))} de TVA récupérable.
          </p>
          <p className="muted" style={{
            fontSize: 'var(--fs-sm)', marginTop: '.5rem', lineHeight: 1.55, maxWidth: '68ch',
          }}>
            Ce n&apos;est pas une tâche de la semaine mais un acte juridique :
            sans procès-verbal d&apos;assemblée, ces charges engagées avant
            l&apos;immatriculation ne sont ni déductibles, ni récupérables, ni
            remboursables.
          </p>
          <div style={{ marginTop: '.9rem' }}>
            <Link href="/frais-creation" className="btn btn--ghost">
              Voir les frais de création
            </Link>
          </div>
        </div>
      )}

      {/* ---------- 5. Les chiffres ---------- */}
      <div className="card">
        <p className="card__title">Les chiffres</p>

        <div className="grid-cards" style={{ marginTop: '.8rem' }}>
          <Chiffre titre="Encaissé ce mois" valeur={ch.encaisse_mois}
            note="Ce qui compte pour la TVA sur les services" />
          <Chiffre titre="Charges du mois" valeur={ch.charges_mois} note="Hors taxes" />
          <Chiffre titre="Reste à encaisser" valeur={ch.a_encaisser}
            note="Factures émises non réglées" />
          <Chiffre titre="Solde bancaire" valeur={ch.solde_banque}
            note="Reconstitué depuis les opérations" />
        </div>

        <div className="grid-cards" style={{ marginTop: '1rem' }}>
          <Chiffre titre="TVA collectée" valeur={ch.tva_collectee}
            note="Exigible, sur encaissements" />
          <Chiffre titre="TVA déductible" valeur={ch.tva_deductible}
            note="Exigible, sur paiements" />
          <Chiffre titre="Solde de TVA" valeur={ch.tva_collectee - ch.tva_deductible}
            note={ch.tva_collectee - ch.tva_deductible >= 0 ? 'À payer' : 'À récupérer'} />
          <Chiffre titre="Compte courant d'associé" valeur={ch.compte_courant}
            note="Ce que la société doit aux associés" />
        </div>

        <p className="muted" style={{
          fontSize: 'var(--fs-xs)', marginTop: '1rem', lineHeight: 1.5, maxWidth: '68ch',
        }}>
          Les montants de TVA sont cumulés depuis l&apos;ouverture de
          l&apos;exercice, sur les faits générateurs — un encaissement pour une
          vente de services, un paiement pour un achat de services. La
          déclaration les reprendra par période.
        </p>
      </div>
    </>
  );
}

function Chiffre({ titre, valeur, note }: { titre: string; valeur: number; note: string }) {
  return (
    <div className="card">
      <p className="card__title">{titre}</p>
      <p className="amount" style={{
        fontSize: '1.3rem', fontFamily: 'var(--display)', fontWeight: 600,
      }}>
        {money(Number(valeur ?? 0))}
      </p>
      <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>{note}</p>
    </div>
  );
}

const ligne: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  gap: '1rem', flexWrap: 'wrap',
  padding: '.75rem 0', borderBottom: '1px solid var(--g-200)',
};
const petitBouton: React.CSSProperties = {
  minHeight: 30, padding: '.2rem .7rem', fontSize: '.72rem', whiteSpace: 'nowrap',
};
