'use client';

/**
 * Navigation principale.
 *
 * Les entrées `disponible: false` correspondent aux rondes non encore
 * construites. Elles restent visibles, grisées : cela donne en permanence
 * la carte complète de l'application et l'avancement du chantier.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';

type Entree = {
  libelle: string;
  href: string;
  disponible: boolean;
  ronde?: number;
};

type Groupe = {
  titre: string;
  entrees: Entree[];
};

const NAVIGATION: Groupe[] = [
  {
    titre: 'Pilotage',
    entrees: [
      { libelle: "Centre d'action", href: '/', disponible: true },
      { libelle: 'Tableau de bord', href: '/tableau-de-bord', disponible: false, ronde: 11 },
    ],
  },
  {
    titre: 'Comptabilité',
    entrees: [
      { libelle: 'Dépenses', href: '/depenses', disponible: false, ronde: 2 },
      { libelle: 'Frais de création', href: '/frais-creation', disponible: false, ronde: 3 },
      { libelle: 'Abonnements', href: '/abonnements', disponible: false, ronde: 5 },
      { libelle: 'Banque', href: '/banque', disponible: false, ronde: 6 },
      { libelle: 'Ventes', href: '/ventes', disponible: false, ronde: 8 },
      { libelle: 'TVA', href: '/tva', disponible: false, ronde: 9 },
      { libelle: 'Échéances', href: '/echeances', disponible: false, ronde: 10 },
      { libelle: 'Immobilisations', href: '/immobilisations', disponible: false, ronde: 13 },
      { libelle: 'Comptes associés', href: '/associes', disponible: false, ronde: 13 },
    ],
  },
  {
    titre: 'Documents',
    entrees: [
      { libelle: 'Coffre', href: '/documents', disponible: false, ronde: 2 },
      { libelle: 'Rapports mensuels', href: '/rapports', disponible: false, ronde: 12 },
      { libelle: 'Exports', href: '/exports', disponible: false, ronde: 13 },
    ],
  },
  {
    titre: 'Réglages',
    entrees: [
      { libelle: 'Entreprise', href: '/reglages/entreprise', disponible: false, ronde: 1 },
      { libelle: 'Utilisateurs', href: '/reglages/utilisateurs', disponible: false, ronde: 1 },
      { libelle: 'Sauvegardes', href: '/reglages/sauvegardes', disponible: false, ronde: 4 },
    ],
  },
];

export default function Sidebar() {
  const chemin = usePathname();

  return (
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.marque}>
        <span className={styles.marqueNom}>HIPLA</span>
        <span className={styles.marqueSuite}>GESTION</span>
      </Link>

      <nav className={styles.nav} aria-label="Navigation principale">
        {NAVIGATION.map((groupe) => (
          <div key={groupe.titre} className={styles.groupe}>
            <p className={styles.groupeTitre}>{groupe.titre}</p>
            <ul>
              {groupe.entrees.map((e) =>
                e.disponible ? (
                  <li key={e.href}>
                    <Link
                      href={e.href}
                      className={
                        chemin === e.href ? `${styles.lien} ${styles.lienActif}` : styles.lien
                      }
                      aria-current={chemin === e.href ? 'page' : undefined}
                    >
                      {e.libelle}
                    </Link>
                  </li>
                ) : (
                  <li key={e.href}>
                    <span
                      className={`${styles.lien} ${styles.lienInactif}`}
                      title={`Disponible à la ronde ${e.ronde}`}
                    >
                      {e.libelle}
                      <span className={styles.ronde}>R{e.ronde}</span>
                    </span>
                  </li>
                )
              )}
            </ul>
          </div>
        ))}
      </nav>

      <div className={styles.pied}>
        <p className={styles.piedTexte}>Hipla Services SAS</p>
        <p className={styles.piedDetail}>Exercice 2026–2027</p>
      </div>
    </aside>
  );
}
