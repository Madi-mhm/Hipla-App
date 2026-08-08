'use client';

/**
 * LES RAPPORTS MENSUELS
 *
 * Un rapport ne se produit que sur un mois ACHEVÉ. Sur un mois en cours,
 * les chiffres changeraient encore après l'envoi — et un document parti
 * chez un tiers ne se rattrape pas.
 */

import { useState } from 'react';
import Alerte from '@/components/Alerte';

export type Mois = { periode: string; libelle: string };

export default function Rapports({ mois }: { mois: Mois[] }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  async function telecharger(m: Mois) {
    setEnCours(m.periode);
    setErreur(null);

    const reponse = await fetch(`/api/rapports/${m.periode}`);

    if (!reponse.ok) {
      const r = await reponse.json().catch(() => ({}));
      setErreur(r.erreur ?? 'Rapport indisponible.');
      setEnCours(null);
      return;
    }

    const blob = await reponse.blob();
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = `rapport-${m.periode}.pdf`;
    lien.click();
    URL.revokeObjectURL(url);
    setEnCours(null);
  }

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}

      <div className="card">
        <p className="card__title">Mois achevés — {mois.length}</p>
        <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '70ch' }}>
          Résultat, charges par poste, facturation, trésorerie, TVA, et ce qui
          reste ouvert. Les chiffres sont ceux du tableau de bord — le rapport
          ne recalcule rien.
        </p>

        {mois.length === 0 ? (
          <div className="etat-vide">
            <p>Aucun mois achevé sur cet exercice.</p>
            <p className="muted">
              Un rapport ne se produit pas sur un mois en cours : ses chiffres
              changeraient encore après l&apos;envoi.
            </p>
          </div>
        ) : (
          <div style={{ marginTop: '.9rem' }}>
            {mois.map((m) => (
              <div key={m.periode} style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', gap: '1rem',
                padding: '.75rem 0', borderBottom: '1px solid var(--g-200)',
              }}>
                <div>
                  <p style={{
                    fontSize: 'var(--fs-sm)', fontWeight: 500,
                    textTransform: 'capitalize',
                  }}>
                    {m.libelle}
                  </p>
                  <p className="muted mono" style={{ fontSize: '.68rem' }}>
                    {m.periode}
                  </p>
                </div>
                <button onClick={() => telecharger(m)} disabled={enCours === m.periode}
                  className="btn btn--ghost"
                  style={{ minHeight: 30, padding: '.2rem .8rem', fontSize: '.74rem' }}>
                  {enCours === m.periode ? 'Génération…' : 'Télécharger'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
