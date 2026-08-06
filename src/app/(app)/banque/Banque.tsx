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

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money, date, dateLong, daysUntil } from '@/lib/format';
import { depuisTTC, tvaRecuperable } from '@/lib/comptabilite';
import Dialogue from '@/components/Dialogue';
import Alerte from '@/components/Alerte';
import {
  LIBELLE_TRAITEMENT, CLASSE_TRAITEMENT, LIBELLE_STATUT_QONTO,
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
};

export default function Banque({
  transactions, synchronisations, controle, categories, utilisateurId, peutGerer,
}: Props) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [vue, setVue] = useState<'a_traiter' | 'toutes'>('a_traiter');
  const [aEcarter, setAEcarter] = useState<TransactionQonto | null>(null);
  const [aCreer, setACreer] = useState<TransactionQonto | null>(null);
  const [categorieCreation, setCategorieCreation] = useState('');

  const derniere = synchronisations.find((s) => s.statut === 'reussie');
  const soldeBanque = derniere?.solde_qonto != null ? Number(derniere.solde_qonto) : null;
  const joursDepuis = derniere ? -daysUntil(derniere.demarree_le) : null;
  const synchroAncienne = joursDepuis === null || joursDepuis > 3;

  const aTraiter = transactions.filter(
    (t) => t.statut_traitement === 'a_traiter' && t.statut_qonto === 'completed'
  );
  const enAttente = transactions.filter((t) => t.statut_qonto === 'pending');

  const visibles = vue === 'a_traiter' ? aTraiter : transactions;

  const soldeReconstitue = useMemo(() => {
    return transactions
      .filter((t) => t.statut_qonto === 'completed')
      .reduce((s, t) => s + (t.sens === 'credit' ? Number(t.montant) : -Number(t.montant)), 0);
  }, [transactions]);

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

  /**
   * Transforme une opération en dépense. Le montant vient de la banque,
   * donc il est certain ; la dépense arrive néanmoins en attente, car
   * l'affectation comptable, elle, reste une interprétation.
   */
  async function creerDepense(t: TransactionQonto, categorieId: string) {
    const cat = categories.find((c) => c.id === categorieId);
    if (!cat) { setErreur('Choisissez une catégorie.'); return; }

    setEnCours(true);
    const supabase = createClient();
    const m = depuisTTC(Number(t.montant), Number(cat.taux_tva_defaut));

    const { data: dep, error } = await supabase.from('depenses').insert({
      date_depense: t.date_operation,
      fournisseur: t.contrepartie ?? t.libelle,
      libelle: t.libelle,
      categorie_id: cat.id,
      montant_ht: m.ht,
      taux_tva: cat.taux_tva_defaut,
      montant_tva: m.tva,
      montant_ttc: m.ttc,
      taux_deductibilite: cat.taux_deductibilite,
      compte: cat.compte,
      tva_deductible: tvaRecuperable(m.tva, cat.taux_deductibilite),
      moyen_paiement: 'carte',
      paye_par: 'societe',
      transaction_qonto_id: t.id,
      paye_le: t.date_operation,
      statut: 'en_attente',
      cree_par: utilisateurId,
      notes: 'Créée depuis une opération bancaire. Justificatif à joindre.',
    }).select('id, numero_piece').single();

    if (error || !dep) {
      setErreur(`Création impossible : ${error?.message}`);
      setEnCours(false);
      return;
    }

    await supabase.from('transactions_qonto').update({
      statut_traitement: 'rattachee',
      depense_id: dep.id,
      rattachement_auto: false,
      rattache_par: utilisateurId,
      rattache_le: new Date().toISOString(),
    }).eq('id', t.id);

    // Mémorise le libellé : au troisième rattachement identique, le
    // rapprochement deviendra automatique.
    await supabase.rpc('memoriser_libelle', {
      p_libelle: t.contrepartie ?? t.libelle,
      p_fournisseur: t.contrepartie ?? t.libelle,
      p_categorie: cat.id,
    });

    await supabase.rpc('journaliser', {
      p_action: 'creation', p_table: 'depenses', p_id: dep.id,
      p_details: {
        resume: `${dep.numero_piece} créée depuis ${t.numero_piece}`,
        montant_ttc: m.ttc, categorie: cat.libelle,
      },
    });

    setSucces(`${dep.numero_piece} créée en attente. Joignez le justificatif.`);
    setEnCours(false);
    router.refresh();
  }

  async function defaireRattachement(t: TransactionQonto) {
    setEnCours(true);
    const supabase = createClient();

    if (t.depense_id) {
      await supabase.from('depenses')
        .update({ transaction_qonto_id: null, paye_le: null })
        .eq('id', t.depense_id);
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
            {money(soldeReconstitue)}
          </p>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>
            Depuis {transactions.length} opérations
          </p>
          {soldeBanque !== null && Math.abs(soldeBanque - soldeReconstitue) >= 0.01 && (
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)', marginTop: '.4rem', lineHeight: 1.45 }}>
              Solde bancaire réel : {money(soldeBanque)} — écart de{' '}
              {money(Math.abs(soldeBanque - soldeReconstitue))}. Des opérations
              manquent.
            </p>
          )}
          {soldeBanque !== null && Math.abs(soldeBanque - soldeReconstitue) < 0.01 && (
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
                      <span style={{ fontSize: '.72rem', color: 'var(--g-600)' }}>
                        {t.numero_piece ?? '—'}
                      </span>
                    </td>
                    <td style={td}>{date(t.date_operation)}</td>
                    <td style={{ ...td, fontWeight: 500 }}>
                      {t.contrepartie ?? t.libelle}
                      <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                        {t.libelle}
                        {t.a_justificatif && ' · pièce jointe dans Qonto'}
                        {t.statut_qonto !== 'completed' && ` · ${LIBELLE_STATUT_QONTO[t.statut_qonto]}`}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }} className="amount">
                      <span style={{ color: t.sens === 'credit' ? 'var(--success)' : undefined }}>
                        {t.sens === 'credit' ? '+' : '−'} {money(Number(t.montant))}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }} className="col-secondaire">
                      {t.depenses ? (
                        <Link href={`/depenses/${t.depense_id}`} className="mono"
                          style={{ fontSize: '.72rem', color: 'var(--navy)' }}>
                          {t.depenses.numero_piece}
                        </Link>
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
                            {t.sens === 'debit' && (
                              <button onClick={() => { setACreer(t); setCategorieCreation(''); }}
                                className="btn btn--ghost"
                                style={{ minHeight: 26, padding: '.1rem .55rem', fontSize: '.7rem' }}>
                                Créer
                              </button>
                            )}
                            <button onClick={() => setAEcarter(t)} className="btn btn--ghost"
                              style={{ minHeight: 26, padding: '.1rem .55rem', fontSize: '.7rem', color: 'var(--g-500)' }}>
                              Écarter
                            </button>
                          </span>
                        )}
                        {(t.statut_traitement === 'rattachee' || t.statut_traitement === 'ecartee') && (
                          <button onClick={() => defaireRattachement(t)} disabled={enCours}
                            className="btn btn--ghost"
                            style={{ minHeight: 26, padding: '.1rem .55rem', fontSize: '.7rem', color: 'var(--danger)' }}>
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
                        {s.statut}
                      </span>
                      {s.erreur && (
                        <span className="muted" style={{ display: 'block', fontSize: '.66rem', marginTop: '.2rem' }}>
                          {s.erreur.slice(0, 60)}
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

      {aCreer && (
        <div className={styles.voile} onClick={() => setACreer(null)}>
          <div className={styles.boite} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.titreDialogue}>Créer une dépense</h2>
            <p className={styles.descriptionDialogue}>
              {aCreer.contrepartie ?? aCreer.libelle} — {money(Number(aCreer.montant))} le{' '}
              {date(aCreer.date_operation)}. Le montant vient de la banque et ne
              peut pas être faux ; l'affectation comptable, elle, reste à
              confirmer. La dépense sera créée en attente.
            </p>

            <label className={styles.champDialogue}>
              <span>Catégorie</span>
              <select value={categorieCreation} onChange={(e) => setCategorieCreation(e.target.value)}>
                <option value="">Choisir…</option>
                {groupes.map((g) => (
                  <optgroup key={g} label={g}>
                    {categories.filter((c) => c.groupe === g).map((c) => (
                      <option key={c.id} value={c.id} disabled={c.bloque}>{c.libelle}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <div className={styles.actionsDialogue}>
              <button onClick={() => setACreer(null)} className="btn btn--ghost">Annuler</button>
              <button
                onClick={() => {
                  const t = aCreer;
                  const c = categorieCreation;
                  setACreer(null);
                  if (t && c) creerDepense(t, c);
                }}
                disabled={!categorieCreation || enCours}
                className="btn btn--gold"
              >
                Créer en attente
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)',
  fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.6rem .4rem', verticalAlign: 'top' };
