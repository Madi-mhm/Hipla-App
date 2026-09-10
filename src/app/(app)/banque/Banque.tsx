'use client';

/**
 * RAPPROCHEMENT BANCAIRE
 *
 * L'écran est organisé autour d'une question : que reste-t-il à traiter ?
 * Les opérations déjà rattachées n'appellent aucune action et passent au
 * second plan.
 *
 * Le solde de contrôle est l'indicateur le plus important de la page : si
 * chaque débit correspond à une écriture, la comptabilité est complète.
 * Aucun autre contrôle ne le prouve.
 */

import { useState } from 'react';
import Link from 'next/link';
import Reference from '@/components/Reference';
import RefBanque from '@/components/apercu/RefBanque';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money, date, dateLong, daysUntil } from '@/lib/format';
import Dialogue from '@/components/Dialogue';
import Alerte from '@/components/Alerte';
import {
  LIBELLE_TRAITEMENT, CLASSE_TRAITEMENT, LIBELLE_STATUT_QONTO,
  LIBELLE_SYNCHRONISATION,
  type TransactionQonto, type Synchronisation, type Categorie,
} from '@/lib/types';
import styles from './banque.module.css';

type Controle = {
  transactions_total: number;
  a_traiter: number;
  rattachees: number;
  ecartees: number;
  debits_sans_ecriture: number;
  montant_non_traite: number;
  depenses_sans_paiement: number;
  derniere_synchro: string | null;
} | null;

type Props = {
  transactions: TransactionQonto[];
  synchronisations: Synchronisation[];
  controle: Controle;
  categories: Categorie[];
  utilisateurId: string;
  peutGerer: boolean;
  justificatifsEnAttente: number;
  /** Calculé côté base sur toute la table (migration 101) — jamais sur
      les seules `transactions` chargées ici, qui sont plafonnées à 300
      lignes pour l'affichage. */
  soldeReconstitue: { solde: number; nb_operations: number } | null;
};

export default function Banque({
  transactions, synchronisations, controle, categories, utilisateurId, peutGerer,
  justificatifsEnAttente, soldeReconstitue,
}: Props) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [vue, setVue] = useState<'a_traiter' | 'toutes'>('a_traiter');
  const [aEcarter, setAEcarter] = useState<TransactionQonto | null>(null);
  // « Écarter » demandait un motif ; « Défaire » — qui dénoue un rapprochement
  // comptable et supprime le règlement — partait au premier clic. Le geste
  // destructeur était le seul non protégé.
  const [aDefaire, setADefaire] = useState<TransactionQonto | null>(null);

  const derniere = synchronisations.find((s) => s.statut === 'reussie');
  const soldeBanque = derniere?.solde_qonto != null ? Number(derniere.solde_qonto) : null;
  const joursDepuis = derniere ? -(daysUntil(derniere.demarree_le) ?? 0) : null;
  const synchroAncienne = joursDepuis === null || joursDepuis > 3;

  const aTraiter = transactions.filter(
    (t) => t.statut_traitement === 'a_traiter' && t.statut_qonto === 'completed'
  );
  const enAttente = transactions.filter((t) => t.statut_qonto === 'pending');

  const visibles = vue === 'a_traiter' ? aTraiter : transactions;

  // Ne plus recalculer ici : la liste `transactions` est plafonnée à 300
  // lignes pour l'affichage (voir banque/page.tsx), donc toute somme
  // faite dessus dérive silencieusement au-delà. `soldeReconstitue` vient
  // maintenant de `solde_reconstitue()`, calculée côté base sur toute la
  // table (migration 101).
  const solde = soldeReconstitue?.solde ?? 0;
  const nbOperationsSolde = soldeReconstitue?.nb_operations ?? 0;

  async function synchroniser() {
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    try {
      const res = await fetch('/api/qonto', { method: 'POST' });
      const d = await res.json();
      if (!res.ok || !d.succes) {
        setErreur(d.erreur ?? 'Synchronisation impossible');
      } else {
        const statuts = d.par_statut
          ? Object.entries(d.par_statut as Record<string, number>)
              .map(([k, v]) => `${v} ${k}`).join(', ')
          : '';
        setSucces(
          `${d.lues} opération${d.lues > 1 ? 's' : ''} lue${d.lues > 1 ? 's' : ''}` +
          (statuts ? ` (${statuts})` : '') +
          `, ${d.nouvelles} nouvelle${d.nouvelles > 1 ? 's' : ''}, ` +
          `${d.rapprochees_auto} rapprochée${d.rapprochees_auto > 1 ? 's' : ''} automatiquement. ` +
          (d.justificatifs > 0
            ? `${d.justificatifs} justificatif(s) récupéré(s) depuis Qonto. ` : '') +
          (d.rapprochements_proposes > 0
            ? `${d.rapprochements_proposes} rapprochement(s) proposé(s) à confirmer. ` : '') +
          `Solde bancaire : ${Number(d.solde ?? 0).toFixed(2).replace('.', ',')} €.`
        );
        router.refresh();
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur réseau');
    }
    setEnCours(false);
  }

  async function ecarter(t: TransactionQonto, motif: string) {
    setEnCours(true);
    const supabase = createClient();
    const { error } = await supabase.from('transactions_qonto').update({
      statut_traitement: 'ecartee',
      motif_ecart: motif,
      rattache_par: utilisateurId,
      rattache_le: new Date().toISOString(),
    }).eq('id', t.id);

    if (error) { setErreur(error.message); setEnCours(false); return; }

    await supabase.rpc('journaliser', {
      p_action: 'modification', p_table: 'transactions_qonto', p_id: t.id,
      p_details: {
        resume: `${t.numero_piece} · ${t.libelle} écartée`,
        montant: t.montant, motif,
      },
    });
    setEnCours(false);
    router.refresh();
  }

  // La création d'une dépense depuis une opération se fait sur la fiche de
  // l'opération (/banque/[id]), qui connaît le régime de TVA et les associés.

  async function defaireRattachement(t: TransactionQonto) {
    setEnCours(true);
    const supabase = createClient();

    // `detacher_appariement` défait le lien des DEUX côtés et supprime le
    // règlement associé.
    //
    // L'appel était conditionné à `t.depense_id` — colonne que
    // `confirmer_appariement` ne renseigne plus depuis la bascule vers le
    // registre. Sur tout rapprochement récent, la condition était fausse :
    // « Défaire » remettait l'opération à traiter sans détacher l'écriture
    // ni supprimer le règlement. La facture restait réglée, et l'opération
    // pouvait être rapprochée une seconde fois.
    //
    // On passe par l'écriture résolue via `reglements`, en gardant l'ancienne
    // colonne en repli pour les rapprochements d'avant la bascule.
    const pieceLiee = t.ecriture?.piece_id ?? t.depense_id ?? null;
    if (pieceLiee) {
      const { error: eDetach } = await supabase.rpc('detacher_appariement', {
        p_piece: pieceLiee,
        p_transaction: t.id,
      });
      if (eDetach) {
        setErreur(`Détachement impossible — ${eDetach.message}`);
        setEnCours(false);
        return;
      }
    }

    const { error } = await supabase.from('transactions_qonto').update({
      statut_traitement: 'a_traiter',
      depense_id: null,
      echeance_id: null,
      motif_ecart: null,
      rattachement_auto: false,
      rattache_le: null,
      rattache_par: null,
    }).eq('id', t.id);

    if (error) { setErreur(error.message); setEnCours(false); return; }

    await supabase.rpc('journaliser', {
      p_action: 'modification', p_table: 'transactions_qonto', p_id: t.id,
      p_details: { resume: `${t.numero_piece} · rattachement défait` },
    });
    setEnCours(false);
    router.refresh();
  }

  const groupes = Array.from(new Set(categories.map((c) => c.groupe)));

  return (
    <>
      {/* ---------- Solde de contrôle ---------- */}
      <div className="grid-cards" style={{ marginBottom: '1.25rem' }}>
        <div className="card">
          <p className="card__title">Solde reconstitué</p>
          <p className="amount" style={{ fontSize: '1.4rem', fontFamily: 'var(--display)', fontWeight: 600 }}>
            {money(solde)}
          </p>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>
            Depuis {nbOperationsSolde} opérations
          </p>
          {soldeBanque !== null && Math.abs(soldeBanque - solde) >= 0.01 && (
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)', marginTop: '.4rem', lineHeight: 1.45 }}>
              Solde bancaire réel : {money(soldeBanque)} — écart de{' '}
              {money(Math.abs(soldeBanque - solde))}. Des opérations
              manquent.
            </p>
          )}
          {soldeBanque !== null && Math.abs(soldeBanque - solde) < 0.01 && (
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--success)', marginTop: '.4rem' }}>
              Conforme au solde bancaire.
            </p>
          )}
        </div>

        <div
          className="card"
          style={{ borderLeft: (controle?.debits_sans_ecriture ?? 0) > 0 ? '3px solid var(--warning)' : undefined }}
        >
          <p className="card__title">Débits sans écriture</p>
          <p className="amount" style={{
            fontSize: '1.4rem', fontFamily: 'var(--display)', fontWeight: 600,
            color: (controle?.debits_sans_ecriture ?? 0) > 0 ? 'var(--warning)' : undefined,
          }}>
            {controle?.debits_sans_ecriture ?? 0}
          </p>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>
            {money(Number(controle?.montant_non_traite ?? 0))} non affectés
          </p>
        </div>

        <div className="card">
          <p className="card__title">Rattachées</p>
          <p className="amount" style={{ fontSize: '1.4rem', fontFamily: 'var(--display)', fontWeight: 600 }}>
            {controle?.rattachees ?? 0}
          </p>
        </div>

        <div
          className="card"
          style={{ borderLeft: synchroAncienne ? '3px solid var(--danger)' : undefined }}
        >
          <p className="card__title">Dernière synchronisation</p>
          <p style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 'var(--fs-sm)' }}>
            {derniere ? dateLong(derniere.demarree_le) : 'jamais'}
          </p>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>
            {joursDepuis === null
              ? 'aucune synchronisation réussie'
              : joursDepuis === 0 ? "aujourd'hui" : `il y a ${joursDepuis} jour${joursDepuis > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* ---------- Complétude ---------- */}
      <div
        className="card"
        style={{
          marginBottom: '1.25rem',
          borderLeft: `3px solid ${(controle?.debits_sans_ecriture ?? 0) === 0 ? 'var(--success)' : 'var(--warning)'}`,
        }}
      >
        <p className="card__title">Contrôle de complétude</p>
        {(controle?.debits_sans_ecriture ?? 0) === 0 ? (
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--success)', lineHeight: 1.55, maxWidth: '68ch' }}>
            Chaque prélèvement correspond à une écriture. C'est le seul contrôle
            qui prouve qu'aucune charge n'a été oubliée — et le premier qu'un
            contrôleur effectue.
          </p>
        ) : (
          <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '68ch' }}>
            {controle?.debits_sans_ecriture} prélèvement
            {(controle?.debits_sans_ecriture ?? 0) > 1 ? 's' : ''} sans écriture
            comptable, pour {money(Number(controle?.montant_non_traite ?? 0))}.
            Tant qu'ils ne sont pas affectés, ces charges ne sont ni déduites
            ni récupérées en TVA.
          </p>
        )}

        {(controle?.depenses_sans_paiement ?? 0) > 0 && (
          <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: '.6rem' }}>
            À l'inverse, {controle?.depenses_sans_paiement} dépense
            {(controle?.depenses_sans_paiement ?? 0) > 1 ? 's' : ''} validée
            {(controle?.depenses_sans_paiement ?? 0) > 1 ? 's' : ''} sans
            prélèvement correspondant — paiement en espèces, ou opération non
            encore remontée.
          </p>
        )}

        {peutGerer && (
          <div style={{ display: 'flex', gap: '.6rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button onClick={synchroniser} disabled={enCours} className="btn btn--gold">
              {enCours ? 'Synchronisation…' : 'Synchroniser maintenant'}
            </button>
            <span className="muted" style={{ fontSize: 'var(--fs-xs)', alignSelf: 'center' }}>
              Automatique chaque nuit à 4 h
            </span>
          </div>
        )}
      </div>

      {justificatifsEnAttente > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--info)' }}>
          <p className="card__title">
            {justificatifsEnAttente} justificatif{justificatifsEnAttente > 1 ? 's' : ''} déposé
            {justificatifsEnAttente > 1 ? 's' : ''} dans Qonto
          </p>
          <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '66ch' }}>
            Ces pièces attendent d'être rattachées à une écriture. Celles qui
            correspondent à une dépense déjà enregistrée y ont été rattachées
            automatiquement ; les autres demandent une lecture.
          </p>
          <Link href="/banque/justificatifs" className="btn btn--gold" style={{ marginTop: '.9rem' }}>
            Traiter les justificatifs
          </Link>
        </div>
      )}

      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      {enAttente.length > 0 && (
        <Alerte type="info" message={
          `${enAttente.length} opération${enAttente.length > 1 ? 's' : ''} non consolidée${enAttente.length > 1 ? 's' : ''} : ` +
          'montant et libellé peuvent encore changer, elles ne sont pas rapprochées.'
        } />
      )}

      {/* ---------- Opérations ---------- */}
      <div className="card">
        <div className={styles.barre}>
          <p className="card__title">
            {vue === 'a_traiter' ? `À traiter — ${aTraiter.length}` : `Toutes — ${transactions.length}`}
          </p>
          <div className={styles.onglets}>
            <button onClick={() => setVue('a_traiter')}
              className={vue === 'a_traiter' ? styles.ongletActif : styles.onglet}>
              À traiter
            </button>
            <button onClick={() => setVue('toutes')}
              className={vue === 'toutes' ? styles.ongletActif : styles.onglet}>
              Toutes
            </button>
          </div>
        </div>

        {visibles.length === 0 ? (
          <div className="etat-vide">
            <p>{vue === 'a_traiter' ? 'Rien à traiter.' : 'Aucune opération.'}</p>
            <p className="muted">
              {vue === 'a_traiter'
                ? 'Chaque prélèvement est rattaché à une écriture.'
                : "Lancez une synchronisation pour récupérer vos opérations Qonto."}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table style={{ minWidth: 760, fontSize: 'var(--fs-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                  <th style={th}>Pièce</th>
                  <th style={th}>Date</th>
                  <th style={th}>Libellé</th>
                  <th style={{ ...th, textAlign: 'right' }}>Montant</th>
                  <th style={{ ...th, textAlign: 'right' }} className="col-secondaire">Écriture</th>
                  <th style={{ ...th, textAlign: 'right' }}>Statut</th>
                  {peutGerer && <th style={{ ...th, textAlign: 'right' }}></th>}
                </tr>
              </thead>
              <tbody>
                {visibles.map((t) => (
                  <tr key={t.id} style={{
                    borderBottom: '1px solid var(--g-200)',
                    opacity: t.statut_traitement === 'ecartee' ? 0.5 : 1,
                  }}>
                    <td style={td} className="mono">
                      {/* Sans ce lien, le détail d'une opération — son
                          identifiant Qonto, son justificatif, ses candidats
                          au rapprochement — restait inaccessible. */}
                      <RefBanque id={t.id}
                        style={{ fontSize: '.72rem', color: 'var(--navy)', fontWeight: 600 }}>
                        {t.numero_piece ?? 'Ouvrir'}
                      </RefBanque>
                    </td>
                    <td style={td}>{date(t.date_operation)}</td>
                    <td style={{ ...td, fontWeight: 500 }}>
                      {t.contrepartie ?? t.libelle}
                      <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                        {t.libelle}
                        {t.a_justificatif && ' · pièce jointe dans Qonto'}
                        {/* Un statut inconnu de la carte affichait « undefined ». */}
                        {t.statut_qonto !== 'completed'
                          && ` · ${LIBELLE_STATUT_QONTO[t.statut_qonto] ?? t.statut_qonto}`}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }} className="amount">
                      <span style={{ color: t.sens === 'credit' ? 'var(--success)' : undefined }}>
                        {t.sens === 'credit' ? '+' : '−'} {money(Number(t.montant))}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }} className="col-secondaire">
                      {t.ecriture ? (
                        <>
                          <Reference id={t.ecriture.piece_id} className="mono"
                            style={{ fontSize: '.72rem', color: 'var(--navy)' }}>
                            {t.ecriture.numero_piece ?? 'Ouvrir'}
                          </Reference>
                          {t.ecriture.nombre > 1 && (
                            <span className="muted" style={{ display: 'block', fontSize: '.66rem' }}>
                              +{t.ecriture.nombre - 1} autre{t.ecriture.nombre > 2 ? 's' : ''}
                            </span>
                          )}
                        </>
                      ) : '—'}
                      {t.rattachement_auto && (
                        <span className="muted" style={{ display: 'block', fontSize: '.66rem' }}>
                          automatique
                        </span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <span className={`badge ${CLASSE_TRAITEMENT[t.statut_traitement]}`}>
                        {LIBELLE_TRAITEMENT[t.statut_traitement]}
                      </span>
                      {t.motif_ecart && (
                        <span className="muted" style={{ display: 'block', fontSize: '.66rem', marginTop: '.2rem' }}>
                          {t.motif_ecart}
                        </span>
                      )}
                    </td>
                    {peutGerer && (
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {t.statut_traitement === 'a_traiter' && t.statut_qonto === 'completed' && (
                          <span style={{ display: 'inline-flex', gap: '.3rem' }}>
                            {/*
                              Le dialogue rapide ne proposait ni taux ni régime
                              de TVA : sur une facture étrangère, il produisait
                              silencieusement une écriture exonérée là où
                              l'autoliquidation s'imposait. Un chemin qui
                              fabrique des écritures fausses ne doit pas être le
                              plus accessible — on conduit à l'écran complet.
                            */}
                            <RefBanque id={t.id} className="btn btn--ghost btn--sm">
                              Affecter
                            </RefBanque>
                            <button onClick={() => setAEcarter(t)}
                              className="btn btn--ghost btn--sm" style={{ color: 'var(--g-500)' }}>
                              Écarter
                            </button>
                          </span>
                        )}
                        {(t.statut_traitement === 'rattachee' || t.statut_traitement === 'ecartee') && (
                          <button onClick={() => setADefaire(t)} disabled={enCours}
                            className="btn btn--ghost btn--sm btn--danger">
                            Défaire
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- Historique ---------- */}
      {synchronisations.length > 0 && (
        <div className="card" style={{ marginTop: '1.25rem' }}>
          <p className="card__title">Synchronisations</p>
          <div className="table-scroll">
            <table style={{ minWidth: 520, fontSize: 'var(--fs-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                  <th style={th}>Date</th>
                  <th style={th}>Origine</th>
                  <th style={{ ...th, textAlign: 'right' }}>Lues</th>
                  <th style={{ ...th, textAlign: 'right' }}>Nouvelles</th>
                  <th style={{ ...th, textAlign: 'right' }} className="col-secondaire">Auto</th>
                  <th style={{ ...th, textAlign: 'right' }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {synchronisations.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--g-200)' }}>
                    <td style={td}>{new Date(s.demarree_le).toLocaleString('fr-FR')}</td>
                    <td style={td} className="muted">{s.declencheur}</td>
                    <td style={{ ...td, textAlign: 'right' }} className="amount">{s.transactions_lues ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }} className="amount">{s.transactions_nouvelles ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }} className="amount col-secondaire">{s.rapprochees_auto ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <span className={`badge ${
                        s.statut === 'reussie' ? 'badge--success'
                        : s.statut === 'echouee' ? 'badge--danger' : 'badge--warning'
                      }`}>
                        {LIBELLE_SYNCHRONISATION[s.statut] ?? s.statut}
                      </span>
                      {/* Le message était coupé à 60 caractères : quand une
                          synchronisation échoue, 60 caractères disent rarement
                          pourquoi. On le donne en entier, en petit. */}
                      {s.erreur && (
                        <span className="muted" style={{
                          display: 'block', fontSize: 'var(--fs-xs)', marginTop: '.25rem',
                          maxWidth: '32ch', whiteSpace: 'normal', textAlign: 'left',
                          marginLeft: 'auto', lineHeight: 1.4,
                        }}>
                          {s.erreur}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------- Dialogues ---------- */}
      <Dialogue
        ouvert={aEcarter !== null}
        titre="Écarter cette opération"
        description={
          `${aEcarter?.libelle ?? ''} — ${money(Number(aEcarter?.montant ?? 0))}. ` +
          "À réserver aux mouvements qui ne sont pas des charges : apport en " +
          "capital, virement entre comptes, remboursement."
        }
        champ="Motif"
        placeholder="Apport en compte courant, virement interne…"
        obligatoire
        libelleValider="Écarter"
        onValider={(motif) => {
          const t = aEcarter;
          setAEcarter(null);
          if (t) ecarter(t, motif);
        }}
        onAnnuler={() => setAEcarter(null)}
      />

      <Dialogue
        ouvert={aDefaire !== null}
        titre="Défaire ce rapprochement"
        description={
          `${aDefaire?.libelle ?? ''} — ${money(Number(aDefaire?.montant ?? 0))}. ` +
          "Le lien avec l'écriture est dénoué et le règlement supprimé : " +
          "la facture redevient due, et la TVA sur encaissement repart à " +
          "l'exigibilité. L'opération revient dans « à traiter »."
        }
        libelleValider="Défaire"
        danger
        onValider={() => {
          const t = aDefaire;
          setADefaire(null);
          if (t) defaireRattachement(t);
        }}
        onAnnuler={() => setADefaire(null)}
      />
    </>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)',
  fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.6rem .4rem', verticalAlign: 'top' };