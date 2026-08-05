'use client';

/**
 * Navigation principale.
 *
 * - Les entrées sont filtrées selon les permissions du rôle : un contributeur
 *   ne voit pas « Utilisateurs », puisqu'il ne peut pas y accéder.
 * - Les entrées `disponible: false` correspondent aux rondes non construites.
 * - Sur mobile, la barre devient un tiroir ouvert par le bouton menu.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { peut, type Module, type Role } from '@/lib/permissions';
import styles from './Sidebar.module.css';

type Entree = {
  libelle: string;
  href: string;
  disponible: boolean;
  ronde?: number;
  module?: Module;
};

type Groupe = { titre: string; entrees: Entree[] };

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
      { libelle: 'Dépenses', href: '/depenses', disponible: false, ronde: 2, module: 'depenses' },
      { libelle: 'Frais de création', href: '/frais-creation', disponible: false, ronde: 3, module: 'depenses' },
      { libelle: 'Abonnements', href: '/abonnements', disponible: false, ronde: 5, module: 'abonnements' },
      { libelle: 'Banque', href: '/banque', disponible: false, ronde: 6, module: 'banque' },
      { libelle: 'Ventes', href: '/ventes', disponible: false, ronde: 8, module: 'ventes' },
      { libelle: 'TVA', href: '/tva', disponible: false, ronde: 9, module: 'tva' },
      { libelle: 'Échéances', href: '/echeances', disponible: false, ronde: 10, module: 'echeances' },
      { libelle: 'Immobilisations', href: '/immobilisations', disponible: false, ronde: 13, module: 'depenses' },
      { libelle: 'Comptes associés', href: '/associes', disponible: false, ronde: 13, module: 'depenses' },
    ],
  },
  {
    titre: 'Documents',
    entrees: [
      { libelle: 'Coffre', href: '/documents', disponible: false, ronde: 2, module: 'documents' },
      { libelle: 'Rapports mensuels', href: '/rapports', disponible: false, ronde: 12, module: 'documents' },
      { libelle: 'Exports', href: '/exports', disponible: false, ronde: 13, module: 'exports' },
    ],
  },
  {
    titre: 'Réglages',
    entrees: [
      { libelle: 'Entreprise', href: '/reglages/entreprise', disponible: true, module: 'entreprise' },
      { libelle: 'Utilisateurs', href: '/reglages/utilisateurs', disponible: true, module: 'utilisateurs' },
      { libelle: 'Sauvegardes', href: '/reglages/sauvegardes', disponible: false, ronde: 4, module: 'entreprise' },
    ],
  },
];

export default function Sidebar({ role }: { role: Role }) {
  const chemin = usePathname();
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => setOuvert(false), [chemin]);

  useEffect(() => {
    document.body.style.overflow = ouvert ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [ouvert]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOuvert(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const groupes = NAVIGATION
    .map((g) => ({
      ...g,
      entrees: g.entrees.filter((e) => !e.module || peut(role, e.module, 'read')),
    }))
    .filter((g) => g.entrees.length > 0);

  return (
    <>
      <button
        className={styles.burger}
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        aria-controls="navigation-principale"
        aria-label={ouvert ? 'Fermer le menu' : 'Ouvrir le menu'}
      >
        <span /><span /><span />
      </button>

      {ouvert && (
        <div className={styles.voile} onClick={() => setOuvert(false)} aria-hidden="true" />
      )}

      <aside
        id="navigation-principale"
        className={`${styles.sidebar} ${ouvert ? styles.sidebarOuvert : ''}`}
      >
        <Link href="/" className={styles.marque}>
          <span className={styles.marqueNom}>HIPLA</span>
          <span className={styles.marqueSuite}>GESTION</span>
        </Link>

        <nav className={styles.nav} aria-label="Navigation principale">
          {groupes.map((groupe) => (
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
    </>
  );
}
