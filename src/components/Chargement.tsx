/**
 * Squelettes de chargement.
 *
 * Next.js rend les pages sur le serveur : sans repère visuel, un clic
 * semble sans effet pendant une seconde ou deux. Le squelette apparaît
 * immédiatement et rassure sur le fait que quelque chose se passe.
 */
import styles from './Chargement.module.css';

export function SqueletteTableau({ lignes = 6 }: { lignes?: number }) {
  return (
    <div className={styles.squelette} aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement en cours…</span>
      {Array.from({ length: lignes }).map((_, i) => (
        <div key={i} className={styles.ligne}>
          <div className={styles.bloc} style={{ width: '18%' }} />
          <div className={styles.bloc} style={{ width: '32%' }} />
          <div className={styles.bloc} style={{ width: '20%' }} />
          <div className={styles.bloc} style={{ width: '15%' }} />
        </div>
      ))}
    </div>
  );
}

export function SqueletteCartes({ nombre = 3 }: { nombre?: number }) {
  return (
    <div className="grid-cards" aria-busy="true">
      {Array.from({ length: nombre }).map((_, i) => (
        <div key={i} className="card">
          <div className={`${styles.bloc} ${styles.blocTitre}`} />
          <div className={`${styles.bloc} ${styles.blocValeur}`} />
        </div>
      ))}
    </div>
  );
}

/** Page complète : cartes puis tableau. */
export function SquelettePage({ cartes = 3, lignes = 6 }: { cartes?: number; lignes?: number }) {
  return (
    <div className="content">
      <div style={{ marginBottom: '1.25rem' }}>
        <SqueletteCartes nombre={cartes} />
      </div>
      <div className="card">
        <div className={`${styles.bloc} ${styles.blocTitre}`} style={{ marginBottom: '1rem' }} />
        <SqueletteTableau lignes={lignes} />
      </div>
    </div>
  );
}
