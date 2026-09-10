'use client';

/**
 * Deux façons de saisir une dépense, sur un seul écran : déposer la
 * facture et laisser l'IA remplir, ou tout taper à la main. Les deux
 * restent montées : passer de l'une à l'autre ne perd rien.
 */
import { useState } from 'react';

type Mode = 'facture' | 'manuel';

export default function ChoixSaisie({ initial, facture, manuel }: {
  initial: Mode;
  facture: React.ReactNode;
  manuel: React.ReactNode;
}) {
  const [mode, setMode] = useState<Mode>(initial);

  const bouton = (m: Mode, libelle: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => setMode(m)}
      className={`btn btn--sm ${mode === m ? 'btn--primary' : 'btn--ghost'}`}
    >
      {libelle}
    </button>
  );

  return (
    <>
      <div role="tablist" aria-label="Mode de saisie"
        style={{ display: 'flex', gap: '.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {bouton('facture', 'Depuis une facture (lecture automatique)')}
        {bouton('manuel', 'Saisie manuelle')}
      </div>
      <div hidden={mode !== 'facture'}>{facture}</div>
      <div hidden={mode !== 'manuel'}>{manuel}</div>
    </>
  );
}
