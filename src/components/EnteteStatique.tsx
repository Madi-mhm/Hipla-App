import styles from './Header.module.css';

/**
 * En-tête sans appel à la base, destiné aux écrans de chargement.
 *
 * Le Header habituel interroge Supabase pour connaître l'utilisateur :
 * l'employer dans un squelette annulerait l'intérêt du squelette, qui
 * doit s'afficher instantanément.
 */
export default function EnteteStatique({ titre }: { titre: string }) {
  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.titre}>{titre}</h1>
      </div>
    </header>
  );
}
