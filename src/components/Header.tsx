/**
 * Bandeau supérieur. Affiche le contexte (titre de page) et, à terme,
 * l'utilisateur connecté et les alertes non traitées.
 */
import styles from './Header.module.css';

type Props = {
  titre: string;
  sousTitre?: string;
};

export default function Header({ titre, sousTitre }: Props) {
  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.titre}>{titre}</h1>
        {sousTitre && <p className={styles.sousTitre}>{sousTitre}</p>}
      </div>

      <div className={styles.actions}>
        {/* Ronde 1 : utilisateur connecté et déconnexion */}
        <span className={styles.placeholder}>Non connecté</span>
      </div>
    </header>
  );
}
