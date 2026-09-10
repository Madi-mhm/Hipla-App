import Link from 'next/link';
import styles from './Header.module.css';
import { profilCourant } from '@/lib/auth';
import { LIBELLE_ROLE } from '@/lib/permissions';
import type { CleSection } from '@/lib/navigation';
import BoutonDeconnexion from './BoutonDeconnexion';
import Onglets from './Onglets';

type Props = {
  titre: string;
  sousTitre?: string;
  /** Affiche les onglets de cette section sous le titre. */
  section?: CleSection;
};

export default async function Header({ titre, sousTitre, section }: Props) {
  const profil = await profilCourant();

  return (
    <header className={styles.header}>
      <div className={styles.ligne}>
        <div className={styles.titres}>
          <h1 className={styles.titre}>{titre}</h1>
          {sousTitre && <p className={styles.sousTitre}>{sousTitre}</p>}
        </div>

        <form action="/recherche" role="search" className={styles.recherche}>
          <input
            type="search"
            name="q"
            placeholder="Rechercher…"
            aria-label="Rechercher une écriture, un tiers, un numéro"
          />
        </form>

        <div className={styles.actions}>
          {profil ? (
            <>
              <Link href="/reglages/compte" className={styles.utilisateur}
                style={{ textDecoration: 'none' }} title="Mon compte">
                <span className={styles.nom}>{profil.nom_complet}</span>
                <span className={styles.role}>{LIBELLE_ROLE[profil.role]}</span>
              </Link>
              <BoutonDeconnexion />
            </>
          ) : (
            <span className={styles.placeholder}>Non connecté</span>
          )}
        </div>
      </div>

      {section && profil && <Onglets section={section} role={profil.role} />}
    </header>
  );
}
