import styles from './Header.module.css';
import { profilCourant } from '@/lib/auth';
import { LIBELLE_ROLE } from '@/lib/permissions';
import BoutonDeconnexion from './BoutonDeconnexion';

type Props = {
  titre: string;
  sousTitre?: string;
};

export default async function Header({ titre, sousTitre }: Props) {
  const profil = await profilCourant();

  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.titre}>{titre}</h1>
        {sousTitre && <p className={styles.sousTitre}>{sousTitre}</p>}
      </div>

      <div className={styles.actions}>
        {profil ? (
          <>
            <div className={styles.utilisateur}>
              <span className={styles.nom}>{profil.nom_complet}</span>
              <span className={styles.role}>{LIBELLE_ROLE[profil.role]}</span>
            </div>
            <BoutonDeconnexion />
          </>
        ) : (
          <span className={styles.placeholder}>Non connecté</span>
        )}
      </div>
    </header>
  );
}
