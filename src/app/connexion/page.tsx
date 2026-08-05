import { Suspense } from 'react';
import ForumConnexion from './ForumConnexion';
import styles from './connexion.module.css';

export const metadata = { title: 'Connexion — Hipla Gestion' };

/**
 * useSearchParams() bascule le rendu côté client. Sans limite de Suspense,
 * le prérendu statique de Next échoue. Le repli s'affiche le temps que le
 * composant s'hydrate — quelques millisecondes en pratique.
 */
export default function Page() {
  return (
    <div className={styles.page}>
      <div className={styles.carte}>
        <div className={styles.marque}>
          <span className={styles.marqueNom}>HIPLA</span>
          <span className={styles.marqueSuite}>GESTION</span>
        </div>
        <p className={styles.intro}>
          Application de gestion interne. Accès réservé.
        </p>

        <Suspense fallback={<p className={styles.chargement}>Chargement…</p>}>
          <ForumConnexion />
        </Suspense>
      </div>
      <p className={styles.pied}>Hipla Services SAS — 108 105 875</p>
    </div>
  );
}
