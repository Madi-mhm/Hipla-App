'use client';

/**
 * Barre de progression en haut de page pendant une navigation.
 *
 * Next.js conserve l'écran précédent le temps que le serveur réponde.
 * Sans indication, l'utilisateur clique une seconde fois en croyant à
 * une panne. Cette barre apparaît dès le clic et disparaît à l'arrivée.
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import styles from './BarreProgression.module.css';

export default function BarreProgression() {
  const chemin = usePathname();
  const [avancement, setAvancement] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const premierRendu = useRef(true);

  // Un clic sur un lien interne démarre la barre.
  useEffect(() => {
    function surClic(e: MouseEvent) {
      const lien = (e.target as HTMLElement)?.closest?.('a');
      if (!lien) return;
      const href = lien.getAttribute('href');
      if (!href || !href.startsWith('/') || lien.target === '_blank') return;
      if (href === window.location.pathname) return;
      // Ouvrir une fenêtre n'est pas naviguer : la barre tournerait dans
      // le vide, puisqu'aucune page ne charge. La fenêtre a son propre
      // squelette pour dire qu'elle travaille.
      if (lien.dataset.fenetre === 'oui') return;
      demarrer();
    }
    document.addEventListener('click', surClic);
    return () => document.removeEventListener('click', surClic);
  }, []);

  // L'arrivée sur un nouveau chemin la termine.
  useEffect(() => {
    if (premierRendu.current) { premierRendu.current = false; return; }
    terminer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chemin]);

  function demarrer() {
    if (timer.current) clearInterval(timer.current);
    setVisible(true);
    setAvancement(12);
    // Progression asymptotique : on approche 90 % sans jamais l'atteindre,
    // le saut à 100 % marque l'arrivée réelle.
    timer.current = setInterval(() => {
      setAvancement((v) => (v >= 90 ? v : v + (90 - v) * 0.14));
    }, 180);
  }

  function terminer() {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    setAvancement(100);
    setTimeout(() => { setVisible(false); setAvancement(0); }, 280);
  }

  if (!visible) return null;

  return (
    <div className={styles.piste} role="progressbar" aria-label="Chargement de la page">
      <div className={styles.barre} style={{ width: `${avancement}%` }} />
    </div>
  );
}
