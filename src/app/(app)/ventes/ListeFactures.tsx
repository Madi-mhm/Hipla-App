'use client';

/**
 * VENTES
 *
 * Règle qui gouverne l'écran : pour une prestation de services, la TVA
 * devient exigible à l'ENCAISSEMENT, pas à l'émission. Une facture émise
 * en septembre et payée en novembre relève de novembre.
 *
 * C'est pourquoi l'encaissement demande une confirmation explicite : le
 * geste déclenche une obligation déclarative.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Reference from '@/components/Reference';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money, date, daysUntil } from '@/lib/format';
import Alerte from '@/components/Alerte';
import {
  LIBELLE_STATUT_FACTURE, CLASSE_STATUT_FACTURE, LIBELLE_NATURE_FACTURE,
  type Facture, type Client, type Prestation,
} from '@/lib/types';
import styles from './ventes.module.css';

type Etat = {
  clients: number; devis_ouverts: number; factures: number;
  brouillons: number; en_attente: number; impayees: number;
  ca_encaisse: number; tva_collectee: number;
  ca_emis_non_encaisse: number; anomalies: number;
} | null;

type Props = {
  factures: Facture[];
  clients: Client[];
  prestations: Prestation[];
  etat: Etat;
  peutGerer: boolean;
};

export default function ListeFactures({
  factures, clients, prestations, etat, peutGerer,
}: Props) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [vue, setVue] = useState<'ouvertes' | 'toutes'>('ouvertes');

  const [clientId, setClientId] = useState('');
  const [nature, setNature] = useState('facture');
  const [objet, setObjet] = useState('');
  const [dateEmission, setDateEmission] = useState(new Date().toISOString().slice(0, 10));
  const [delai, setDelai] = useState('15');
  const [factureLiee, setFactureLiee] = useState('');

  const ouvertes = factures.filter((f) =>
    ['brouillon', 'emise', 'partielle', 'impayee'].includes(f.statut)
  );
  const visibles = vue === 'ouvertes' ? ouvertes : factures;

  // Une facture de solde se rattache à un acompte déjà émis.
  const acomptes = useMemo(
    () => factures.filter((f) => f.nature === 'acompte' && f.statut !== 'annulee'),
    [factures]
  );

  const clientChoisi = clients.find((c) => c.id === clientId);

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) return;
    setErreur(null);
    setEnCours(true);

    const supabase = createClient();
    const { data: res, error } = await supabase.rpc('creer_facture', {
      p_client: clientId,
      p_nature: nature,
      p_facture_liee: nature === 'solde' && factureLiee ? factureLiee : null,
      p_date: dateEmission,
      p_objet: objet.trim() || null,
      p_delai: parseInt(delai, 10) || 15,
    });

    if (error || !res) {
      setErreur(`Création impossible : ${error?.message}`);
      setEnCours(false);
      return;
    }

    const f = res as { id: string; numero_piece: string };
    setOuvert(false);
    setObjet('');
    setEnCours(false);
    router.push(`/ventes/${f.id}`);
  }

  return (
    <>
      {/* ---------- Chiffres ---------- */}
      <div className="grid-cards" style={{ marginBottom: '1.25rem' }}>
        <div className="card">
          <p className="card__title">Chiffre d'affaires encaissé</p>
          <p className="amount" style={{ fontSize: '1.4rem', fontFamily: 'var(--display)', fontWeight: 600 }}>
            {money(Number(etat?.ca_encaisse ?? 0))}
          </p>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>
            HT · base de la TVA collectée
          </p>
        </div>
        <div className="card">
          <p className="card__title">TVA collectée</p>
          <p className="amount" style={{ fontSize: '1.4rem', fontFamily: 'var(--display)', fontWeight: 600 }}>
            {money(Number(etat?.tva_collectee ?? 0))}
          </p>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>
            Sur encaissements uniquement
          </p>
        </div>
        <div className="card" style={{ borderLeft: Number(etat?.ca_emis_non_encaisse ?? 0) > 0 ? '3px solid var(--warning)' : undefined }}>
          <p className="card__title">En attente de règlement</p>
          <p className="amount" style={{ fontSize: '1.4rem', fontFamily: 'var(--display)', fontWeight: 600 }}>
            {money(Number(etat?.ca_emis_non_encaisse ?? 0))}
          </p>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>
            {etat?.en_attente ?? 0} facture{(etat?.en_attente ?? 0) > 1 ? 's' : ''}
          </p>
        </div>
        <div className="card" style={{ borderLeft: (etat?.impayees ?? 0) > 0 ? '3px solid var(--danger)' : undefined }}>
          <p className="card__title">Impayées</p>
          <p className="amount" style={{
            fontSize: '1.4rem', fontFamily: 'var(--display)', fontWeight: 600,
            color: (etat?.impayees ?? 0) > 0 ? 'var(--danger)' : undefined,
          }}>
            {etat?.impayees ?? 0}
          </p>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>
            Échéance dépassée
          </p>
        </div>
      </div>

      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      {(etat?.anomalies ?? 0) > 0 && (
        <Alerte type="erreur" message={
          `${etat?.anomalies} anomalie(s) détectée(s) sur vos factures — acomptes incohérents, ` +
          'encaissement sans date, ou facture sans ligne.'
        } />
      )}

      {/* ---------- Création ---------- */}
      {peutGerer && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div className={styles.barre}>
            <p className="card__title">Établir une facture</p>
            <button onClick={() => setOuvert(!ouvert)} className="btn btn--gold">
              {ouvert ? 'Annuler' : '+ Nouvelle facture'}
            </button>
          </div>

          {clients.length === 0 ? (
            <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: '.7rem' }}>
              Aucun client enregistré.{' '}
              <Link href="/clients" style={{ color: 'var(--gold-ink)' }}>
                Créez-en un d'abord
              </Link>.
            </p>
          ) : ouvert && (
            <form onSubmit={creer} className={styles.formulaire}>
              <label className={styles.pleine}><span>Client *</span>
                <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                  <option value="">Choisir…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}{c.ville ? ` — ${c.ville}` : ''}
                    </option>
                  ))}
                </select></label>

              <label><span>Nature</span>
                <select value={nature} onChange={(e) => setNature(e.target.value)}>
                  <option value="facture">Facture</option>
                  <option value="acompte">Acompte</option>
                  <option value="solde">Solde après acompte</option>
                </select></label>

              {nature === 'solde' && (
                <label><span>Acompte à déduire</span>
                  <select value={factureLiee} onChange={(e) => setFactureLiee(e.target.value)}>
                    <option value="">Choisir…</option>
                    {acomptes.filter((a) => !clientId || a.client_id === clientId).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.numero_piece} · {money(Number(a.montant_ttc))}
                      </option>
                    ))}
                  </select></label>
              )}

              <label><span>Date d'émission</span>
                <input type="date" value={dateEmission}
                  onChange={(e) => setDateEmission(e.target.value)} /></label>
              <label><span>Délai de paiement (jours)</span>
                <input type="number" value={delai} onChange={(e) => setDelai(e.target.value)}
                  min="0" max="60" /></label>

              <label className={styles.pleine}><span>Objet</span>
                <input type="text" value={objet} onChange={(e) => setObjet(e.target.value)}
                  placeholder="Nettoyage de fin de chantier — 12 rue des Alpes" /></label>

              {clientChoisi && clientChoisi.delai_paiement !== parseInt(delai, 10) && (
                <p className={`${styles.note} ${styles.pleine}`}>
                  Ce client est habituellement réglé à {clientChoisi.delai_paiement} jours.
                </p>
              )}

              {nature === 'acompte' && (
                <p className={`${styles.note} ${styles.pleine}`}>
                  Une facture d'acompte est une facture à part entière : elle
                  porte son propre numéro et sa TVA devient exigible à son
                  encaissement. La facture de solde la déduira automatiquement.
                </p>
              )}

              <div className={styles.pleine}>
                <button type="submit" className="btn btn--gold" disabled={enCours || !clientId}>
                  {enCours ? 'Création…' : 'Créer et ajouter les lignes'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ---------- Liste ---------- */}
      <div className="card">
        <div className={styles.barre}>
          <p className="card__title">
            {vue === 'ouvertes' ? `En cours — ${ouvertes.length}` : `Toutes — ${factures.length}`}
          </p>
          <div className={styles.onglets}>
            <button onClick={() => setVue('ouvertes')}
              className={vue === 'ouvertes' ? styles.ongletActif : styles.onglet}>
              En cours
            </button>
            <button onClick={() => setVue('toutes')}
              className={vue === 'toutes' ? styles.ongletActif : styles.onglet}>
              Toutes
            </button>
          </div>
        </div>

        {visibles.length === 0 ? (
          <div className="etat-vide">
            <p>{vue === 'ouvertes' ? 'Aucune facture en cours.' : 'Aucune facture.'}</p>
            <p className="muted">
              Une facture peut être établie directement, sans devis préalable.
              La TVA ne deviendra exigible qu'à son encaissement.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table style={{ minWidth: 760, fontSize: 'var(--fs-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                  <th style={th}>Pièce</th>
                  <th style={th}>Client</th>
                  <th style={th} className="col-secondaire">Émise</th>
                  <th style={th}>Échéance</th>
                  <th style={{ ...th, textAlign: 'right' }}>Net à payer</th>
                  <th style={{ ...th, textAlign: 'right' }}>Statut</th>
                  <th style={{ ...th, textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => {
                  const j = daysUntil(f.date_echeance);
                  const enRetard = j < 0 && ['emise', 'partielle', 'impayee'].includes(f.statut);
                  return (
                    <tr key={f.id} style={{
                      borderBottom: '1px solid var(--g-200)',
                      opacity: f.statut === 'annulee' ? 0.45 : 1,
                    }}>
                      <td style={td} className="mono">
                        <Reference id={f.id}
                          style={{ fontSize: '.72rem', color: 'var(--navy)', fontWeight: 600 }}>
                          {f.numero_piece ?? '—'}
                        </Reference>
                        {f.nature !== 'facture' && (
                          <span className="muted" style={{ display: 'block', fontSize: '.66rem' }}>
                            {LIBELLE_NATURE_FACTURE[f.nature]}
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, fontWeight: 500 }}>
                        {f.clients?.nom ?? '—'}
                        {f.objet && (
                          <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                            {f.objet}
                          </span>
                        )}
                      </td>
                      <td style={td} className="col-secondaire">{date(f.date_emission)}</td>
                      <td style={td}>
                        {date(f.date_echeance)}
                        {enRetard && (
                          <span style={{ display: 'block', fontSize: '.68rem', color: 'var(--danger)', fontWeight: 600 }}>
                            +{Math.abs(j)} jours
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600 }} className="amount">
                        {money(Number(f.net_a_payer))}
                        {Number(f.montant_encaisse) > 0 && Number(f.montant_encaisse) < Number(f.net_a_payer) && (
                          <span className="muted" style={{ display: 'block', fontSize: '.66rem' }}>
                            {money(Number(f.montant_encaisse))} reçus
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <span className={`badge ${CLASSE_STATUT_FACTURE[f.statut]}`}>
                          {LIBELLE_STATUT_FACTURE[f.statut]}
                        </span>
                        {f.encaisse_le && (
                          <span className="muted" style={{ display: 'block', fontSize: '.66rem', marginTop: '.2rem' }}>
                            le {date(f.encaisse_le)}
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <Reference id={f.id} className="btn btn--ghost"
                          style={{ minHeight: 28, padding: '.15rem .6rem', fontSize: '.7rem' }}>
                          Ouvrir
                        </Reference>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '1rem', maxWidth: '68ch', lineHeight: 1.55 }}>
        Pour une prestation de services, la TVA est exigible à l'encaissement
        et non à l'émission. Une facture émise en septembre et réglée en
        novembre relève de la déclaration de novembre — c'est la date
        d'encaissement qui compte, pas celle de la facture.
      </p>
    </>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)',
  fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.6rem .4rem', verticalAlign: 'top' };
