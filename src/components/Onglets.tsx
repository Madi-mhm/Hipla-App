'use client';

/**
 * Onglets d'une section, sous le titre de la page.
 * La liste vient de `lib/navigation` : le menu et les onglets partagent
 * la même définition.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ongletActif, ongletsVisibles, type CleSection } from '@/lib/navigation';
import type { Role } from '@/lib/permissions';
import styles from './Onglets.module.css';

export default function Onglets({ section, role }: { section: CleSection; role: Role }) {
  const chemin = usePathname();
  const onglets = ongletsVisibles(section, role);
  if (onglets.length < 2) return null;
  const actif = ongletActif(onglets, chemin);

  return (
    <nav aria-label="Vues de la section" className={styles.onglets}>
      {onglets.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          aria-current={o.href === actif ? 'page' : undefined}
          className={o.href === actif ? `${styles.onglet} ${styles.actif}` : styles.onglet}
        >
          {o.libelle}
        </Link>
      ))}
    </nav>
  );
}
