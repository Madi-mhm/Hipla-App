'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { money, date, dateLong, daysUntil } from '@/lib/format';
import { poidsLisible } from '@/lib/export';
import styles from './supervision.module.css';

type Sauvegarde = {
  id: string;
  demarree_le: string;
  terminee_le: string | null;
  declencheur: string;
  statut: string;
  taille_dump: number | null;
  lignes_totales: number | null;
  fichiers_copies: number | null;
  fichiers_ignores: number | null;
  duree_ms: number | null;
  erreur: string | null;
};

type StatsR2 = {
  nombre: number;
  octets: number;
  quota: number;
  pourcentage: number;
  parPrefixe: Record<string, { nombre: number; octets: number }>;
} | null;

type Props = {
  stats: Record<string, Record<string, number>> | null;
  tailleBase: number;
  quotaBase: number;
  quotaStorage: number;
  quotaR2: number;
  r2: StatsR2;
  erreurR2: string | null;
  sauvegardes: Sauvegarde[];
  audit: { email: string; action: string; table_cible: string | null; horodatage: string }[];
};

export default function Supervision({
  stats, tailleBase, quotaBase, quotaStorage, quotaR2,
  r2, erreurR2, sauvegardes, audit,
}: Props) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rapport, setRapport] = useState<string | null>(null);

  const octetsStorage = Number(stats?.justificatifs?.octets ?? 0);
  const octetsOrigine = Number(stats?.justificatifs?.octets_origine ?? 0);
  const gainCompression = octetsOrigine > 0
    ? Math.round((1 - octetsStorage / octetsOrigine) * 100) : 0;

  const derniere = sauvegardes.find((s) => s.statut === 'reussie');
  const joursDepuis = derniere ? -daysUntil(derniere.demarree_le) : null;

  async function sauvegarder() {
    setEnCours(true);
    setMessage(null);
    try {
      const res = await fetch('/api/cron/sauvegarde', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.succes) {
        setMessage(`Échec : ${data.erreur ?? 'erreur inconnue'}`);
      } else {
        setMessage(
          `Sauvegarde terminée — ${data.lignes} lignes, ` +
          `${data.fichiers.copies} fichier(s) copié(s), ` +
          `${data.fichiers.ignores} déjà présent(s).`
        );
        router.refresh();
      }
    } catch (e) {
      setMessage(`Échec : ${e instanceof Error ? e.message : 'erreur réseau'}`);
    }
    setEnCours(false);
  }

  async function simulerRestauration() {
    setEnCours(true);
    setRapport(null);
    try {
      const res = await fetch('/api/restauration', { method: 'POST' });
      const d = await res.json();
      if (!res.ok || !d.succes) {
        setRapport(`Échec : ${d.erreur ?? 'erreur inconnue'}`);
      } else {
        const lignes = Object.entries(d.tables as Record<string, { attendu: number }>)
          .filter(([, v]) => v.attendu > 0)
          .map(([t, v]) => `${t} : ${v.attendu}`)
          .join(' · ');
        setRapport(
          `Simulation depuis ${d.dump} — ${d.total} lignes restaurables.\n${lignes}` +
          (d.base_occupee ? `\n\nBase actuelle non vide : ${d.base_occupee.join(', ')}` : '')
        );
      }
    } catch (e) {
      setRapport(`Échec : ${e instanceof Error ? e.message : 'erreur réseau'}`);
    }
    setEnCours(false);
  }

  return (
    <>
      {/* ---------- Stockage ---------- */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card__title">Stockage</p>
        <div className={styles.quotas}>
          <Quota
            libelle="Base de données Supabase"
            utilise={tailleBase}
            quota={quotaBase}
            detail="Lignes uniquement — les fichiers sont ailleurs"
          />
          <Quota
            libelle="Storage Supabase"
            utilise={octetsStorage}
            quota={quotaStorage}
            detail={
              gainCompression > 0
                ? `${stats?.justificatifs?.nombre ?? 0} justificatifs · compression −${gainCompression} %`
                : `${stats?.justificatifs?.nombre ?? 0} justificatifs`
            }
          />
          <Quota
            libelle="Archive Cloudflare R2"
            utilise={r2?.octets ?? 0}
            quota={quotaR2}
            detail={r2 ? `${r2.nombre} objets archivés` : (erreurR2 ?? 'indisponible')}
            indisponible={!r2}
          />
        </div>
      </div>

      {/* ---------- Sauvegardes ---------- */}
      <div
        className="card"
        style={{
          marginBottom: '1.25rem',
          borderLeft: `3px solid ${
            joursDepuis === null ? 'var(--danger)'
            : joursDepuis > 10 ? 'var(--danger)'
            : joursDepuis > 5 ? 'var(--warning)'
            : 'var(--success)'
          }`,
        }}
      >
        <p className="card__title">Sauvegardes</p>

        {derniere ? (
          <div className={styles.derniere}>
            <div>
              <p style={{ fontFamily: 'var(--display)', fontWeight: 600 }}>
                {dateLong(derniere.demarree_le)}
              </p>
              <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: '.25rem' }}>
                {joursDepuis === 0 ? "aujourd'hui" : `il y a ${joursDepuis} jour${joursDepuis! > 1 ? 's' : ''}`}
                {' · '}{derniere.lignes_totales} lignes
                {' · '}{poidsLisible(Number(derniere.taille_dump ?? 0))}
                {' · '}{derniere.declencheur}
              </p>
            </div>
            {joursDepuis !== null && joursDepuis > 10 && (
              <span className="badge badge--danger">Sauvegarde ancienne</span>
            )}
          </div>
        ) : (
          <p className={styles.alerte}>
            Aucune sauvegarde réussie. Vos données ne sont protégées par rien :
            le palier gratuit de Supabase n'en fournit aucune.
          </p>
        )}

        <div style={{ display: 'flex', gap: '.6rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <button onClick={sauvegarder} disabled={enCours} className="btn btn--gold">
            {enCours ? 'Sauvegarde en cours…' : 'Sauvegarder maintenant'}
          </button>
          <button onClick={simulerRestauration} disabled={enCours} className="btn btn--ghost">
            Tester la restauration
          </button>
          <span className="muted" style={{ fontSize: 'var(--fs-xs)', alignSelf: 'center' }}>
            Automatique le dimanche et le mercredi à 3 h
          </span>
        </div>

        {rapport && (
          <pre className={styles.rapport}>{rapport}</pre>
        )}

        {message && (
          <p className={message.startsWith('Échec') ? styles.alerte : styles.succes}>
            {message}
          </p>
        )}

        {sauvegardes.length > 0 && (
          <div className="table-scroll" style={{ marginTop: '1rem' }}>
            <table style={{ minWidth: 520, fontSize: 'var(--fs-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                  <th style={th}>Date</th>
                  <th style={th}>Origine</th>
                  <th style={{ ...th, textAlign: 'right' }}>Lignes</th>
                  <th style={{ ...th, textAlign: 'right' }} className="col-secondaire">Fichiers</th>
                  <th style={{ ...th, textAlign: 'right' }} className="col-secondaire">Durée</th>
                  <th style={{ ...th, textAlign: 'right' }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {sauvegardes.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--g-200)' }}>
                    <td style={td}>{date(s.demarree_le)}</td>
                    <td style={td} className="muted">{s.declencheur}</td>
                    <td style={{ ...td, textAlign: 'right' }} className="amount">
                      {s.lignes_totales ?? '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }} className="amount col-secondaire">
                      {s.fichiers_copies !== null ? `+${s.fichiers_copies}` : '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }} className="amount col-secondaire">
                      {s.duree_ms ? `${(s.duree_ms / 1000).toFixed(1)} s` : '—'}
                    </td>
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
        )}
      </div>

      {/* ---------- Volumétrie ---------- */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card__title">Données</p>
        <div className={styles.compteurs}>
          <Compteur
            libelle="Dépenses" href="/depenses"
            valeur={stats?.depenses?.total ?? 0}
            detail={`${stats?.depenses?.en_attente ?? 0} en attente · ${money(Number(stats?.depenses?.montant_ht ?? 0))} HT`}
          />
          <Compteur
            libelle="Frais de création" href="/frais-creation"
            valeur={stats?.frais_creation?.total ?? 0}
            detail={`${stats?.frais_creation?.a_ratifier ?? 0} à ratifier · ${money(Number(stats?.frais_creation?.montant_ttc ?? 0))}`}
          />
          <Compteur
            libelle="Déplacements" href="/deplacements"
            valeur={stats?.deplacements?.total ?? 0}
            detail={`${Math.round(Number(stats?.deplacements?.km_annee ?? 0))} km validés cette année`}
          />
          <Compteur
            libelle="Justificatifs" href="/depenses"
            valeur={stats?.justificatifs?.nombre ?? 0}
            detail={poidsLisible(octetsStorage)}
          />
          <Compteur
            libelle="Catégories" href="/reglages/categories"
            valeur={stats?.referentiel?.categories ?? 0}
            detail="actives"
          />
          <Compteur
            libelle="Utilisateurs" href="/reglages/utilisateurs"
            valeur={stats?.referentiel?.utilisateurs ?? 0}
            detail="comptes actifs"
          />
          <Compteur libelle="Factures émises" valeur={null} detail="ronde 8" />
          <Compteur
            libelle="Abonnements" href="/abonnements"
            valeur={stats?.abonnements?.actifs ?? 0}
            detail={`${money(Number(stats?.abonnements?.cout_annuel ?? 0))} par an`}
          />
        </div>
      </div>

      {/* ---------- Journal d'audit ---------- */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
          <p className="card__title">Journal d'audit — 20 dernières entrées</p>
          <Link href="/reglages/audit" className="btn btn--ghost"
            style={{ minHeight: 30, padding: '.2rem .7rem', fontSize: 'var(--fs-xs)' }}>
            Journal complet
          </Link>
        </div>
        <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginBottom: '.8rem' }}>
          {stats?.audit?.entrees ?? 0} entrées au total. Le journal n'est ni
          modifiable ni supprimable, y compris par le propriétaire.
        </p>
        <div className="table-scroll">
          <table style={{ minWidth: 460, fontSize: 'var(--fs-sm)' }}>
            <tbody>
              {audit.map((a, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--g-200)' }}>
                  <td style={td} className="mono">{a.email}</td>
                  <td style={td}>
                    <span className="badge badge--neutral">{a.action}</span>
                    {a.table_cible && (
                      <span className="muted" style={{ marginLeft: '.4rem', fontSize: 'var(--fs-xs)' }}>
                        {a.table_cible}
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }} className="muted">
                    {new Date(a.horodatage).toLocaleString('fr-FR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Quota({
  libelle, utilise, quota, detail, indisponible,
}: {
  libelle: string; utilise: number; quota: number;
  detail?: string; indisponible?: boolean;
}) {
  const pct = quota > 0 ? (utilise / quota) * 100 : 0;
  const couleur = pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--success)';

  return (
    <div className={styles.quota}>
      <div className={styles.quotaEntete}>
        <span className={styles.quotaLibelle}>{libelle}</span>
        <span className="amount" style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
          {indisponible ? '—' : `${poidsLisible(utilise)} / ${poidsLisible(quota)}`}
        </span>
      </div>
      <div className={styles.barre}>
        <div
          className={styles.barreRemplie}
          style={{ width: `${Math.min(pct, 100)}%`, background: couleur }}
        />
      </div>
      <p className={styles.quotaDetail}>
        {indisponible ? detail : `${pct.toFixed(1)} %${detail ? ` · ${detail}` : ''}`}
      </p>
    </div>
  );
}

function Compteur({
  libelle, valeur, detail, href,
}: { libelle: string; valeur: number | null; detail?: string; href?: string }) {
  const contenu = (
    <>
      <p className={styles.compteurLibelle}>{libelle}</p>
      <p className={`amount ${styles.compteurValeur}`}>
        {valeur === null ? '—' : valeur}
      </p>
      {detail && <p className={styles.compteurDetail}>{detail}</p>}
    </>
  );

  if (!href || valeur === null) {
    return <div className={`${styles.compteur} ${styles.compteurInactif}`}>{contenu}</div>;
  }
  return <Link href={href} className={styles.compteur}>{contenu}</Link>;
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)',
  fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.55rem .4rem', verticalAlign: 'top' };
