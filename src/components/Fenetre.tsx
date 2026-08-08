'use client';

/**
 * LA FENÊTRE
 *
 * Un même composant, deux comportements :
 *
 * · sur grand écran, une fenêtre CENTRÉE sur fond assombri ;
 * · sur téléphone, une FEUILLE qui monte du bas, refermée en la tirant
 *   vers le bas — le geste que tout le monde connaît, et qui ne demande
 *   pas de viser une croix de douze pixels au pouce.
 *
 * CE QU'ELLE NE FAIT PAS
 * Elle ne touche pas au layout de l'application, ne modifie aucune
 * route, et ne connaît rien de son contenu. Ma première tentative posait
 * un emplacement parallèle dans `layout.tsx` — le fichier dont dépendent
 * les cinquante routes. Un défaut là-dedans emporte tout, ce qui est
 * arrivé.
 *
 * Celle-ci vit là où on la pose. Si elle casse, seule la page qui
 * l'utilise cesse de fonctionner.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

export default function Fenetre({
  ouvert, onFermer, titre, large, children,
}: {
  ouvert: boolean;
  onFermer: () => void;
  titre?: string;
  large?: boolean;
  children: React.ReactNode;
}) {
  const panneau = useRef<HTMLDivElement>(null);
  const [sortie, setSortie] = useState(false);

  const [decalage, setDecalage] = useState(0);
  const depart = useRef<number | null>(null);

  const fermer = useCallback(() => {
    // On laisse l'animation se jouer : une fenêtre qui disparaît
    // instantanément donne l'impression d'un défaut.
    setSortie(true);
    setTimeout(() => { setSortie(false); setDecalage(0); onFermer(); }, 170);
  }, [onFermer]);

  useEffect(() => {
    if (!ouvert) return;

    const auClavier = (e: KeyboardEvent) => { if (e.key === 'Escape') fermer(); };
    document.addEventListener('keydown', auClavier);

    // Le fond ne défile plus : sans cela, la page derrière glisse sous
    // les doigts pendant qu'on lit la fenêtre.
    const defilement = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Le focus entre dans la fenêtre, sinon la tabulation continue de
    // parcourir la page du fond, invisible.
    panneau.current?.focus();

    return () => {
      document.removeEventListener('keydown', auClavier);
      document.body.style.overflow = defilement;
    };
  }, [ouvert, fermer]);

  if (!ouvert) return null;

  function debutGlissement(e: React.TouchEvent) {
    // On ne glisse que si le contenu est déjà en haut : sinon le geste
    // sert à faire défiler.
    if ((panneau.current?.scrollTop ?? 0) > 0) return;
    depart.current = e.touches[0].clientY;
  }

  function pendantGlissement(e: React.TouchEvent) {
    if (depart.current === null) return;
    const d = e.touches[0].clientY - depart.current;
    if (d > 0) setDecalage(d);
  }

  function finGlissement() {
    // Au-delà de cent pixels, l'intention est claire.
    if (decalage > 100) fermer();
    else setDecalage(0);
    depart.current = null;
  }

  return (
    <div
      className="fenetre-fond"
      data-ferme={sortie || undefined}
      onClick={(e) => { if (e.target === e.currentTarget) fermer(); }}
    >
      <div
        ref={panneau}
        className="fenetre-panneau"
        data-large={large || undefined}
        data-ferme={sortie || undefined}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        tabIndex={-1}
        style={decalage > 0
          ? { transform: `translateY(${decalage}px)`, transition: 'none' }
          : undefined}
        onTouchStart={debutGlissement}
        onTouchMove={pendantGlissement}
        onTouchEnd={finGlissement}
      >
        {/* La barre de préhension : invisible sur grand écran, elle dit
            au pouce que la feuille se tire. */}
        <div className="fenetre-poignee" aria-hidden="true" />

        <button type="button" onClick={fermer}
          className="fenetre-fermer" aria-label="Fermer">
          ×
        </button>

        <div className="fenetre-contenu">{children}</div>
      </div>
    </div>
  );
}
