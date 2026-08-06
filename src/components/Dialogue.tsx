'use client';

/**
 * Dialogue intégré, en remplacement de window.prompt et window.confirm.
 *
 * Les boîtes natives bloquent l'interface, ne se stylent pas, tronquent les
 * textes longs et s'affichent sur mobile comme une alerte système — ce qui
 * inquiète plus qu'autre chose dans une application de gestion.
 */

import { useEffect, useRef, useState } from 'react';
import styles from './Dialogue.module.css';

type Props = {
  ouvert: boolean;
  titre: string;
  description?: string;
  /** Si fourni, un champ de saisie apparaît avec ce libellé. */
  champ?: string;
  placeholder?: string;
  /** Rend la saisie obligatoire. */
  obligatoire?: boolean;
  libelleValider?: string;
  danger?: boolean;
  onValider: (valeur: string) => void;
  onAnnuler: () => void;
};

export default function Dialogue({
  ouvert, titre, description, champ, placeholder,
  obligatoire, libelleValider = 'Valider', danger, onValider, onAnnuler,
}: Props) {
  const [valeur, setValeur] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const champRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ouvert) {
      setValeur('');
      setErreur(null);
      setTimeout(() => champRef.current?.focus(), 60);
    }
  }, [ouvert]);

  useEffect(() => {
    function surTouche(e: KeyboardEvent) {
      if (e.key === 'Escape' && ouvert) onAnnuler();
    }
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [ouvert, onAnnuler]);

  useEffect(() => {
    document.body.style.overflow = ouvert ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [ouvert]);

  if (!ouvert) return null;

  function valider(e: React.FormEvent) {
    e.preventDefault();
    if (obligatoire && !valeur.trim()) {
      setErreur('Ce champ est obligatoire.');
      return;
    }
    onValider(valeur.trim());
  }

  return (
    <div className={styles.voile} onClick={onAnnuler}>
      <div
        className={styles.boite}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialogue-titre"
      >
        <h2 id="dialogue-titre" className={styles.titre}>{titre}</h2>
        {description && <p className={styles.description}>{description}</p>}

        <form onSubmit={valider}>
          {champ && (
            <label className={styles.champ}>
              <span>{champ}{obligatoire && ' *'}</span>
              <textarea
                ref={champRef}
                value={valeur}
                onChange={(e) => { setValeur(e.target.value); setErreur(null); }}
                placeholder={placeholder}
                rows={3}
              />
            </label>
          )}

          {erreur && <p className={styles.erreur}>{erreur}</p>}

          <div className={styles.actions}>
            <button type="button" onClick={onAnnuler} className="btn btn--ghost">
              Annuler
            </button>
            <button
              type="submit"
              className={danger ? 'btn btn--ghost' : 'btn btn--gold'}
              style={danger ? { color: 'var(--danger)', borderColor: 'var(--danger)' } : undefined}
            >
              {libelleValider}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
