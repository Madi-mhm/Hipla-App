'use client';

/**
 * Navigation principale : neuf sections, une par besoin.
 *
 * Les entrées viennent de `lib/navigation`. Une section à laquelle le
 * rôle n'a pas droit n'apparaît pas. Sur mobile, la barre devient un
 * tiroir ouvert par le bouton menu.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { sectionActive, sectionsVisibles } from '@/lib/navigation';
import type { Role } from '@/lib/permissions';
import styles from './Sidebar.module.css';

export default function Sidebar({ role, exercice }: { role: Role; exercice: string | null }) {
  const chemin = usePathname();
  const [ouvert, setOuvert] = useState(false);
  const active = sectionActive(chemin);

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
          <ul>
            {sectionsVisibles(role).map((s) => (
              <li key={s.cle}>
                <Link
                  href={s.href}
                  className={s.cle === active ? `${styles.lien} ${styles.lienActif}` : styles.lien}
                  aria-current={s.cle === active ? 'page' : undefined}
                >
                  {s.libelle}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.pied}>
          <p className={styles.piedTexte}>Hipla Services SAS</p>
          {exercice && <p className={styles.piedDetail}>{exercice}</p>}
        </div>
      </aside>
    </>
  );
}
