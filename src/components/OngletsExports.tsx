'use client';

/**
 * Onglets de la section « Sortir les écritures ».
 *
 * Deux écrans répondaient au même besoin depuis deux entrées de menu
 * distinctes : « Exports » — extraction filtrée en CSV, et le fichier
 * des écritures — et « Journal comptable » — les mêmes écritures, mises
 * en forme pour être lues.
 *
 * Rien ne justifiait de les séparer dans la navigation : on ne se
 * demande pas « vais-je dans Exports ou dans Journal ? », on se demande
 * « j'ai besoin des écritures — pour les lire, ou pour les transmettre ? ».
 * C'est le même endroit, avec deux vues.
 *
 * On les relie plutôt que de les fondre : le journal est une longue page
 * serveur, groupée par journal et par écriture. La réécrire pour la
 * loger dans un onglet ferait courir un risque sans rien gagner de plus
 * que ces deux liens.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ONGLETS = [
  { href: '/exports',         libelle: 'Extraction' },
  { href: '/exports/journal', libelle: 'Journal comptable' },
];

export default function OngletsExports() {
  const chemin = usePathname();

  return (
    <nav aria-label="Vues des écritures" style={{
      display: 'flex', gap: '.4rem', marginBottom: '1.25rem',
      borderBottom: '1px solid var(--g-200)', paddingBottom: '.6rem',
      flexWrap: 'wrap',
    }}>
      {ONGLETS.map((o) => {
        const actif = chemin === o.href;
        return (
          <Link
            key={o.href}
            href={o.href}
            aria-current={actif ? 'page' : undefined}
            className={`btn ${actif ? 'btn--gold' : 'btn--ghost'} btn--sm`}
            style={{ textDecoration: 'none' }}
          >
            {o.libelle}
          </Link>
        );
      })}
    </nav>
  );
}
