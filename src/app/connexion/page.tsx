import ForumConnexion from './ForumConnexion';
import styles from './connexion.module.css';

export const metadata = { title: 'Connexion — Hipla Gestion' };

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
        <ForumConnexion />
      </div>
      <p className={styles.pied}>Hipla Services SAS — 108 105 875</p>
    </div>
  );
}
