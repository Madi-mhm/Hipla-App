'use client';

/**
 * Message de retour après une action.
 *
 * Une écriture qui échoue silencieusement est le pire des cas sur des
 * données comptables : l'utilisateur croit avoir enregistré. Ce composant
 * rend l'échec visible.
 */
import styles from './Alerte.module.css';

export type TypeAlerte = 'succes' | 'erreur' | 'info';

export default function Alerte({
  type, message, onFermer,
}: { type: TypeAlerte; message: string; onFermer?: () => void }) {
  if (!message) return null;
  return (
    <div className={styles[type]} role={type === 'erreur' ? 'alert' : 'status'}>
      <span>{message}</span>
      {onFermer && (
        <button onClick={onFermer} aria-label="Fermer">×</button>
      )}
    </div>
  );
}
