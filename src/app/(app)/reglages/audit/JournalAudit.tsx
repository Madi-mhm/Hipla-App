'use client';

/**
 * Consultation du journal d'audit.
 *
 * Chaque ligne est dépliable : on y lit les champs créés, les valeurs
 * avant et après une modification, ou l'enregistrement complet d'une
 * suppression. Sans ce détail, une ligne « modification sur depenses »
 * ne permet ni de comprendre ni de corriger.
 */

import { useMemo, useState } from 'react';
import {
  LIBELLE_ACTION, LIBELLE_TABLE, CLASSE_ACTION,
  formaterValeur, libelleChamp,
} from '@/lib/audit';
import styles from './audit.module.css';

type Entree = {
  id: number;
  utilisateur: string | null;
  email: string | null;
  action: string;
  table_cible: string | null;
  id_cible: string | null;
  details: Record<string, unknown> | null;
  horodatage: string;
};

export default function JournalAudit({ entrees }: { entrees: Entree[] }) {
  const [ouverte, setOuverte] = useState<number | null>(null);
  const [filtreAction, setFiltreAction] = useState('');
  const [filtreUtilisateur, setFiltreUtilisateur] = useState('');
  const [filtreTable, setFiltreTable] = useState('');

  const utilisateurs = useMemo(
    () => Array.from(new Set(entrees.map((e) => e.email).filter(Boolean))) as string[],
    [entrees]
  );
  const actions = useMemo(
    () => Array.from(new Set(entrees.map((e) => e.action))),
    [entrees]
  );
  const tables = useMemo(
    () => Array.from(new Set(entrees.map((e) => e.table_cible).filter(Boolean))) as string[],
    [entrees]
  );

  const filtrees = entrees.filter((e) =>
    (!filtreAction || e.action === filtreAction) &&
    (!filtreUtilisateur || e.email === filtreUtilisateur) &&
    (!filtreTable || e.table_cible === filtreTable)
  );

  return (
    <>
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card__title">Filtres</p>
        <div className={styles.filtres}>
          <label><span>Utilisateur</span>
            <select value={filtreUtilisateur} onChange={(e) => setFiltreUtilisateur(e.target.value)}>
              <option value="">Tous</option>
              {utilisateurs.map((u) => <option key={u} value={u}>{u}</option>)}
            </select></label>
          <label><span>Action</span>
            <select value={filtreAction} onChange={(e) => setFiltreAction(e.target.value)}>
              <option value="">Toutes</option>
              {actions.map((a) => (
                <option key={a} value={a}>{LIBELLE_ACTION[a] ?? a}</option>
              ))}
            </select></label>
          <label><span>Section</span>
            <select value={filtreTable} onChange={(e) => setFiltreTable(e.target.value)}>
              <option value="">Toutes</option>
              {tables.map((t) => (
                <option key={t} value={t}>{LIBELLE_TABLE[t] ?? t}</option>
              ))}
            </select></label>
        </div>
        <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.7rem' }}>
          {filtrees.length} entrée{filtrees.length > 1 ? 's' : ''} sur {entrees.length}
          {entrees.length >= 500 && ' — les 500 plus récentes'}
        </p>
      </div>

      <div className="card">
        <div className={styles.liste}>
          {filtrees.map((e) => {
            const detaillable = e.details && Object.keys(e.details).length > 0;
            const estOuverte = ouverte === e.id;

            return (
              <div key={e.id} className={styles.entree}>
                <button
                  className={styles.entete}
                  onClick={() => setOuverte(estOuverte ? null : e.id)}
                  disabled={!detaillable}
                  aria-expanded={estOuverte}
                >
                  <span className={`badge ${CLASSE_ACTION[e.action] ?? 'badge--neutral'}`}>
                    {LIBELLE_ACTION[e.action] ?? e.action}
                  </span>

                  <span className={styles.cible}>
                    {e.table_cible ? (LIBELLE_TABLE[e.table_cible] ?? e.table_cible) : '—'}
                    {typeof e.details?.resume === 'string' && (
                      <span className={styles.resume}>{e.details.resume}</span>
                    )}
                  </span>

                  <span className={styles.utilisateur}>{e.email ?? '—'}</span>
                  <span className={styles.date}>
                    {new Date(e.horodatage).toLocaleString('fr-FR')}
                  </span>
                  {detaillable && (
                    <span className={styles.chevron} aria-hidden="true">
                      {estOuverte ? '−' : '+'}
                    </span>
                  )}
                </button>

                {estOuverte && e.details && <Detail details={e.details} />}
              </div>
            );
          })}

          {filtrees.length === 0 && (
            <p className="muted" style={{ padding: '1.5rem 0', fontSize: 'var(--fs-sm)' }}>
              Aucune entrée ne correspond aux filtres.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function Detail({ details }: { details: Record<string, unknown> }) {
  const type = details.type as string | undefined;

  // ---- Modification : avant / après ----
  if (type === 'modification' && details.changements) {
    const ch = details.changements as Record<string, { avant: unknown; apres: unknown }>;
    return (
      <div className={styles.detail}>
        <p className={styles.detailTitre}>Champs modifiés</p>
        <div className="table-scroll">
          <table className={styles.tableau}>
            <thead>
              <tr>
                <th>Champ</th><th>Avant</th><th>Après</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(ch).map(([k, v]) => (
                <tr key={k}>
                  <td>{libelleChamp(k)}</td>
                  <td className={styles.avant}>{formaterValeur(v.avant)}</td>
                  <td className={styles.apres}>{formaterValeur(v.apres)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ---- Création ----
  if (type === 'creation' && details.champs) {
    return (
      <div className={styles.detail}>
        <p className={styles.detailTitre}>Enregistrement créé</p>
        <ChampsTableau champs={details.champs as Record<string, unknown>} />
      </div>
    );
  }

  // ---- Suppression ----
  if (type === 'suppression' && details.enregistrement) {
    return (
      <div className={styles.detail}>
        <p className={styles.detailTitre} style={{ color: 'var(--danger)' }}>
          Enregistrement supprimé — seule trace subsistante
        </p>
        <ChampsTableau champs={details.enregistrement as Record<string, unknown>} />
      </div>
    );
  }

  // ---- Cas libre : affichage générique ----
  const autres = Object.entries(details).filter(([k]) => k !== 'resume' && k !== 'type');
  if (autres.length === 0) return null;

  return (
    <div className={styles.detail}>
      <p className={styles.detailTitre}>Détail</p>
      <ChampsTableau champs={Object.fromEntries(autres)} />
    </div>
  );
}

function ChampsTableau({ champs }: { champs: Record<string, unknown> }) {
  return (
    <div className="table-scroll">
      <table className={styles.tableau}>
        <tbody>
          {Object.entries(champs).map(([k, v]) => (
            <tr key={k}>
              <td style={{ width: '38%' }}>{libelleChamp(k)}</td>
              <td>
                {Array.isArray(v)
                  ? `${v.length} élément${v.length > 1 ? 's' : ''}`
                  : typeof v === 'object' && v !== null
                    ? JSON.stringify(v)
                    : formaterValeur(v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
