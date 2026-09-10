import { Suspense } from 'react';
import CodeConnexion from './CodeConnexion';
import styles from '../connexion.module.css';

export const metadata = { title: 'Code de connexion — Hipla Gestion' };

/** Deuxième étape de la connexion, pour un compte en double authentification. */
export default function Page() {
  return (
    <div className={styles.page}>
      <div className={styles.carte}>
        <div className={styles.marque}>
          <span className={styles.marqueNom}>HIPLA</span>
          <span className={styles.marqueSuite}>GESTION</span>
        </div>
        <p className={styles.intro}>
          Saisissez le code à six chiffres affiché par votre application
          d&apos;authentification.
        </p>
        <Suspense fallback={<p className={styles.chargement}>Chargement…</p>}>
          <CodeConnexion />
        </Suspense>
      </div>
      <p className={styles.pied}>Hipla Services SAS — 108 105 875</p>
    </div>
  );
}
