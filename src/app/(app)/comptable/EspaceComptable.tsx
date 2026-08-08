'use client';

/**
 * ESPACE COMPTABLE
 *
 * Conçu pour qu'un expert-comptable puisse travailler seul : il y trouve
 * l'état du dossier, ce qui bloque son travail, les échéances, et de quoi
 * signaler ce qui doit être corrigé — sans jamais avoir besoin d'écrire
 * dans les écritures ni de solliciter le dirigeant pour chaque point.
 */

import { useState } from 'react';
import Link from 'next/link';
import Reference from '@/components/Reference';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money, date, dateLong, daysUntil } from '@/lib/format';
import { ECHEANCES } from '@/lib/echeances';
import {
  LIBELLE_TYPE_ANOMALIE, LIBELLE_TYPE_COMMENTAIRE, CLASSE_TYPE_COMMENTAIRE,
  LIBELLE_STATUT_TACHE, CLASSE_STATUT_TACHE, LIBELLE_PRIORITE,
  type Anomalie, type Commentaire, type Tache,
} from '@/lib/types';
import Alerte from '@/components/Alerte';
import styles from './comptable.module.css';

type Exercice = {
  id: string; date_debut: string; date_fin: string;
  statut: string; regime_tva: string;
} | null;

type Props = {
  exercice: Exercice;
  chiffres: {
    chargesHT: number; tvaDeductible: number;
    ecrituresTotal: number; ecrituresRevues: number;
  };
  anomalies: Anomalie[];
  commentaires: Commentaire[];
  taches: Tache[];
  utilisateurId: string;
};

export default function EspaceComptable({
  exercice, chiffres, anomalies, commentaires, taches, utilisateurId,
}: Props) {
  const router = useRouter();
  const [nouveauCommentaire, setNouveauCommentaire] = useState('');
  const [typeCommentaire, setTypeCommentaire] = useState('remarque');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const joursRestants = exercice ? daysUntil(exercice.date_fin) : null;
  const avancement = chiffres.ecrituresTotal > 0
    ? Math.round((chiffres.ecrituresRevues / chiffres.ecrituresTotal) * 100)
    : 0;

  const commentairesOuverts = commentaires.filter((c) => c.statut === 'ouvert');
  const tachesActives = taches.filter((t) => t.statut !== 'faite');
  const mesTaches = tachesActives.filter(
    (t) => t.assignee_a === utilisateurId || t.cree_par === utilisateurId
  );

  // Regroupement : « 4 justificatifs manquants » se traite mieux que
  // quatre lignes séparées.
  const parType = anomalies.reduce<Record<string, Anomalie[]>>((acc, a) => {
    (acc[a.type] ??= []).push(a);
    return acc;
  }, {});

  async function ajouterCommentaire(e: React.FormEvent) {
    e.preventDefault();
    if (!nouveauCommentaire.trim()) return;
    setEnCours(true);

    const supabase = createClient();
    const { error } = await supabase.from('commentaires').insert({
      table_cible: 'general',
      contenu: nouveauCommentaire.trim(),
      type: typeCommentaire,
      cree_par: utilisateurId,
    });

    if (error) {
      setErreur(`Enregistrement impossible : ${error.message}`);
      setEnCours(false);
      return;
    }

    await supabase.rpc('journaliser', {
      p_action: 'creation', p_table: 'commentaires', p_id: null,
      p_details: { type: typeCommentaire, resume: nouveauCommentaire.trim().slice(0, 80) },
    });
    setNouveauCommentaire('');
    setErreur(null);
    setEnCours(false);
    router.refresh();
  }

  return (
    <>
      {/* ---------- Bandeau exercice ---------- */}
      {exercice && (
        <div className={styles.bandeau}>
          <div>
            <p className={styles.bandeauTitre}>Exercice en cours</p>
            <p className={styles.bandeauDates}>
              {dateLong(exercice.date_debut)} → {dateLong(exercice.date_fin)}
            </p>
          </div>
          <div className={styles.bandeauDetails}>
            <div>
              <span>Régime TVA</span>
              <strong>
                {exercice.regime_tva === 'simplifie' ? 'Réel simplifié — CA12E' : 'Réel normal — CA3'}
              </strong>
            </div>
            <div>
              <span>Clôture</span>
              <strong>{joursRestants !== null ? `dans ${joursRestants} jours` : '—'}</strong>
            </div>
            <div>
              <span>Écritures revues</span>
              <strong>{chiffres.ecrituresRevues} / {chiffres.ecrituresTotal}</strong>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Chiffres ---------- */}
      <div className="grid-cards" style={{ marginBottom: '1.25rem' }}>
        <div className="card">
          <p className="card__title">Charges HT</p>
          <p className="amount" style={{ fontSize: '1.4rem', fontFamily: 'var(--display)', fontWeight: 600 }}>
            {money(chiffres.chargesHT)}
          </p>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>
            Écritures validées et frais repris
          </p>
        </div>
        <div className="card">
          <p className="card__title">TVA déductible</p>
          <p className="amount" style={{ fontSize: '1.4rem', fontFamily: 'var(--display)', fontWeight: 600 }}>
            {money(chiffres.tvaDeductible)}
          </p>
        </div>
        <div className="card">
          <p className="card__title">Avancement de la revue</p>
          <p className="amount" style={{ fontSize: '1.4rem', fontFamily: 'var(--display)', fontWeight: 600 }}>
            {avancement} %
          </p>
          <div className={styles.barre}>
            <div className={styles.barreRemplie} style={{ width: `${avancement}%` }} />
          </div>
        </div>
        <div className="card" style={{ borderLeft: anomalies.length ? '3px solid var(--warning)' : undefined }}>
          <p className="card__title">Points à traiter</p>
          <p className="amount" style={{
            fontSize: '1.4rem', fontFamily: 'var(--display)', fontWeight: 600,
            color: anomalies.length ? 'var(--warning)' : undefined,
          }}>
            {anomalies.length}
          </p>
        </div>
      </div>

      {/* ---------- Anomalies ---------- */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card__title">Ce qui bloque la clôture</p>
        {anomalies.length === 0 ? (
          <p className={styles.rassurant}>
            Aucune anomalie détectée. Les montants sont cohérents, les
            justificatifs présents et les écritures rattachées à un exercice.
          </p>
        ) : (
          <div className={styles.anomalies}>
            {Object.entries(parType).map(([type, lignes]) => (
              <details key={type} className={styles.anomalie}>
                <summary>
                  <span className="badge badge--warning">{lignes.length}</span>
                  <span className={styles.anomalieTitre}>
                    {LIBELLE_TYPE_ANOMALIE[type] ?? type}
                  </span>
                  <span className={styles.anomalieMessage}>{lignes[0].message}</span>
                </summary>
                <div className="table-scroll">
                  <table style={{ minWidth: 440, fontSize: 'var(--fs-sm)' }}>
                    <tbody>
                      {lignes.map((a) => (
                        <tr key={`${a.source}-${a.id}`} style={{ borderBottom: '1px solid var(--g-200)' }}>
                          <td style={td} className="mono">{a.numero_piece ?? '—'}</td>
                          <td style={td}>{date(a.date_piece)}</td>
                          <td style={td}>{a.tiers}</td>
                          <td style={{ ...td, textAlign: 'right' }}>
                            {a.source === 'depense' && (
                              <Reference id={a.id} className="btn btn--ghost"
                                style={{ minHeight: 26, padding: '.1rem .55rem', fontSize: '.7rem' }}>
                                Ouvrir
                              </Reference>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      {/* ---------- Échéances ---------- */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card__title">Échéances déclaratives</p>
        <div className="table-scroll">
          <table style={{ minWidth: 440, fontSize: 'var(--fs-sm)' }}>
            <tbody>
              {ECHEANCES.map((e) => {
                const j = daysUntil(e.date);
                return (
                  <tr key={e.libelle} style={{ borderBottom: '1px solid var(--g-200)' }}>
                    <td style={td}>{e.libelle}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {dateLong(e.date)}
                    </td>
                    <td style={{ ...td, textAlign: 'right', width: 90 }}>
                      <span className={`badge ${
                        j < 0 ? 'badge--danger' : j <= 30 ? 'badge--warning' : 'badge--neutral'
                      }`}>
                        {j < 0 ? 'dépassée' : `J-${j}`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- Exports ---------- */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card__title">Extraction</p>
        <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginBottom: '.9rem', maxWidth: '64ch' }}>
          Les exports reprennent les filtres de période et de catégorie.
          Le CSV suit les conventions françaises et s'ouvre directement dans
          Excel.
        </p>
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
          <Link href="/exports" className="btn btn--gold">Exports filtrés</Link>
          <Link href="/recherche" className="btn btn--ghost">Recherche par pièce</Link>
          <Link href="/reglages/audit" className="btn btn--ghost">Journal d'audit</Link>
        </div>
      </div>

      {/* ---------- Tâches ---------- */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className={styles.entete}>
          <p className="card__title">Tâches — {mesTaches.length} en cours</p>
          <Link href="/taches" className="btn btn--ghost"
            style={{ minHeight: 30, padding: '.2rem .7rem', fontSize: 'var(--fs-xs)' }}>
            Gérer
          </Link>
        </div>
        {mesTaches.length === 0 ? (
          <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
            Aucune tâche en cours.
          </p>
        ) : (
          <div className={styles.taches}>
            {mesTaches.slice(0, 6).map((t) => {
              const j = t.echeance ? daysUntil(t.echeance) : null;
              return (
                <div key={t.id} className={styles.tache}>
                  <span className={`badge ${CLASSE_STATUT_TACHE[t.statut]}`}>
                    {LIBELLE_STATUT_TACHE[t.statut]}
                  </span>
                  <span className={styles.tacheTitre}>
                    {t.titre}
                    {t.assigne && (
                      <span className={styles.tacheMeta}>
                        assignée à {t.assigne.nom_complet}
                      </span>
                    )}
                  </span>
                  {t.echeance && (
                    <span className={j !== null && j < 0 ? styles.retard : styles.tacheDate}>
                      {date(t.echeance)}
                    </span>
                  )}
                  {t.priorite === 'haute' && (
                    <span className="badge badge--danger">{LIBELLE_PRIORITE.haute}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------- Commentaires ---------- */}
      <div className="card">
        <p className="card__title">Signalements — {commentairesOuverts.length} ouverts</p>
        <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginBottom: '.9rem', maxWidth: '64ch' }}>
          Un signalement apparaît dans le centre d'action du dirigeant, qui
          effectue la correction. Les écritures ne sont jamais modifiées
          depuis cet espace : la correction reste ainsi tracée au nom de
          celui qui en porte la responsabilité.
        </p>

        {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}

        <form onSubmit={ajouterCommentaire} className={styles.formulaire}>
          <select value={typeCommentaire} onChange={(e) => setTypeCommentaire(e.target.value)}>
            <option value="remarque">Remarque</option>
            <option value="anomalie">Anomalie</option>
            <option value="question">Question</option>
            <option value="demande_piece">Pièce demandée</option>
          </select>
          <input
            type="text"
            value={nouveauCommentaire}
            onChange={(e) => setNouveauCommentaire(e.target.value)}
            placeholder="Décrire le point à traiter…"
          />
          <button type="submit" className="btn btn--gold" disabled={enCours || !nouveauCommentaire.trim()}>
            Signaler
          </button>
        </form>

        {commentaires.length > 0 && (
          <div className={styles.commentaires}>
            {commentaires.slice(0, 10).map((c) => (
              <div key={c.id} className={c.statut === 'resolu' ? styles.commentaireResolu : styles.commentaire}>
                <div className={styles.commentaireEntete}>
                  <span className={`badge ${CLASSE_TYPE_COMMENTAIRE[c.type]}`}>
                    {LIBELLE_TYPE_COMMENTAIRE[c.type]}
                  </span>
                  {c.numero_piece && (
                    <span className="mono" style={{ fontSize: '.72rem', color: 'var(--g-600)' }}>
                      {c.numero_piece}
                    </span>
                  )}
                  <span className={styles.commentaireMeta}>
                    {c.profils?.nom_complet ?? '—'} · {date(c.cree_le)}
                  </span>
                  {c.statut === 'resolu' && (
                    <span className="badge badge--success">Résolu</span>
                  )}
                </div>
                <p className={styles.commentaireTexte}>{c.contenu}</p>
                {c.reponse && (
                  <p className={styles.reponse}>Réponse : {c.reponse}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

const td: React.CSSProperties = { padding: '.55rem .4rem', verticalAlign: 'top' };
