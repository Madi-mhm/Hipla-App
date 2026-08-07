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
import { peut, type Action, type Module, type Role } from '@/lib/permissions';
import styles from './Sidebar.module.css';

type Entree = {
  libelle: string;
  href: string;
  disponible: boolean;   // false = ronde non encore construite
  ronde?: number;
  module?: Module;       // absent = visible par tout utilisateur connecté
  action?: Action;       // permission requise, « read » par défaut
};

type Groupe = { titre: string; entrees: Entree[] };

const NAVIGATION: Groupe[] = [
  {
    titre: 'Pilotage',
    entrees: [
      { libelle: 'Séance hebdomadaire', href: '/seance', disponible: true },
      { libelle: 'Journal comptable', href: '/exports/journal', disponible: true, module: 'exports' },
      { libelle: 'Espace comptable', href: '/comptable', disponible: true, module: 'exports', action: 'export' },
      { libelle: 'Tâches', href: '/taches', disponible: true, module: 'taches' },
      { libelle: 'Recherche', href: '/recherche', disponible: true, module: 'depenses' },
      { libelle: 'Tableau de bord', href: '/tableau-de-bord', disponible: true },
    ],
  },
  {
    titre: 'Comptabilité',
    entrees: [
      { libelle: 'Dépenses', href: '/depenses', disponible: true, module: 'depenses' },
      { libelle: 'Déplacements', href: '/deplacements', disponible: true, module: 'depenses' },
      { libelle: 'Frais de création', href: '/frais-creation', disponible: true, module: 'depenses' },
      { libelle: 'Abonnements', href: '/abonnements', disponible: true, module: 'abonnements' },
      { libelle: 'Banque', href: '/banque', disponible: true, module: 'banque' },
      { libelle: 'Ventes', href: '/ventes', disponible: true, module: 'ventes' },
      { libelle: 'Clients', href: '/clients', disponible: true, module: 'clients' },
      { libelle: 'TVA', href: '/tva', disponible: true, module: 'depenses' },
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
      { libelle: 'Exports', href: '/exports', disponible: true, module: 'exports' },
    ],
  },
  {
    titre: 'Réglages',
    entrees: [
      { libelle: 'Entreprise', href: '/reglages/entreprise', disponible: true, module: 'entreprise' },
      { libelle: 'Catégories', href: '/reglages/categories', disponible: true, module: 'depenses' },
      { libelle: "Règles d'appariement", href: '/reglages/regles', disponible: true, module: 'banque' },
      { libelle: 'Prestations', href: '/reglages/prestations', disponible: true, module: 'prestations' },
      { libelle: 'Véhicules', href: '/reglages/vehicules', disponible: true, module: 'depenses' },
      { libelle: 'Utilisateurs', href: '/reglages/utilisateurs', disponible: true, module: 'utilisateurs' },
      { libelle: "Journal d'audit", href: '/reglages/audit', disponible: true, module: 'audit_comptable' },
      { libelle: 'Supervision', href: '/reglages/supervision', disponible: true, module: 'entreprise', action: 'update' },
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

  // Trois états possibles, plutôt que masquer ce qui est interdit :
  //   ouvert      → accessible
  //   verrouille  → existe, mais le rôle n'y a pas droit
  //   a_venir     → pas encore construit
  // Afficher le verrou évite qu'un utilisateur croie l'application
  // incomplète ou différente selon la personne connectée.
  const groupes = NAVIGATION.map((g) => ({
    ...g,
    entrees: g.entrees.map((e) => {
      const autorise = !e.module || peut(role, e.module, e.action ?? 'read');
      const etat: 'ouvert' | 'verrouille' | 'a_venir' =
        !autorise ? 'verrouille' : e.disponible ? 'ouvert' : 'a_venir';
      return { ...e, etat };
    }),
  }));

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
                {groupe.entrees.map((e) => {
                  if (e.etat === 'ouvert') {
                    return (
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
                    );
                  }
                  if (e.etat === 'verrouille') {
                    return (
                      <li key={e.href}>
                        <span
                          className={`${styles.lien} ${styles.lienVerrouille}`}
                          title="Votre rôle ne donne pas accès à cette section"
                        >
                          {e.libelle}
                          <svg className={styles.cadenas} viewBox="0 0 24 24" aria-hidden="true">
                            <rect x="5" y="11" width="14" height="10" rx="2" />
                            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                          </svg>
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={e.href}>
                      <span
                        className={`${styles.lien} ${styles.lienInactif}`}
                        title={`Disponible à la ronde ${e.ronde}`}
                      >
                        {e.libelle}
                        <span className={styles.ronde}>R{e.ronde}</span>
                      </span>
                    </li>
                  );
                })}
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
