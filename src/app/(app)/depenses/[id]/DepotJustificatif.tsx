'use client';

/**
 * DÉPÔT D'UN JUSTIFICATIF
 *
 * Bloc autonome, volontairement séparé de la correction d'une écriture.
 *
 * Joindre une facture ne change aucun chiffre : cela doit rester
 * possible sur une écriture validée, et c'est même le cas le plus
 * courant — la pièce est saisie au vu du relevé, la facture arrive
 * ensuite. Les enfermer tous deux dans un mode « Modifier » rendait
 * l'un impossible dès que l'autre l'était.
 *
 * Seule une écriture annulée refuse un justificatif.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { compresser } from '@/lib/compression';
import Alerte from '@/components/Alerte';

type Props = {
  pieceId: string;
  numeroPiece: string | null;
  annulee: boolean;
  aDesJustificatifs: boolean;
  peutDeposer: boolean;
};

export default function DepotJustificatif({
  pieceId, numeroPiece, annulee, aDesJustificatifs, peutDeposer,
}: Props) {
  const router = useRouter();
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  if (!peutDeposer || annulee) return null;

  async function deposer() {
    if (fichiers.length === 0) return;
    setEnCours(true);
    setErreur(null);
    setSucces(null);

    const supabase = createClient();
    let deposes = 0;

    for (const brut of fichiers) {
      // Un PDF passe intact : c'est un document probant. Une photo est
      // réduite et convertie, l'original n'étant d'aucune utilité.
      let f = brut;
      let tailleOrigine = brut.size;
      try {
        const r = await compresser(brut);
        f = r.fichier;
        tailleOrigine = r.tailleOrigine;
      } catch {
        f = brut;
      }

      const chemin = `${pieceId}/${Date.now()}-${f.name}`;

      const { error: eUp } = await supabase.storage
        .from('justificatifs').upload(chemin, f);
      if (eUp) {
        setErreur(`Envoi impossible — ${eUp.message}`);
        continue;
      }

      // L'échec devait être visible : l'ancienne version passait au
      // fichier suivant en silence, laissant l'objet dans le stockage
      // sans qu'aucune ligne ne le rattache.
      const { error: eJust } = await supabase.rpc('rattacher_justificatif', {
        p_piece: pieceId,
        p_chemin: chemin,
        p_nom: brut.name,
        p_type: f.type,
        p_taille: f.size,
        p_taille_origine: tailleOrigine,
      });

      if (eJust) {
        setErreur(`Fichier envoyé mais non rattaché — ${eJust.message}`);
        continue;
      }
      deposes += 1;
    }

    if (deposes > 0) {
      setSucces(deposes === 1
        ? 'Justificatif rattaché.'
        : `${deposes} justificatifs rattachés.`);
      setFichiers([]);
    }
    setEnCours(false);
    router.refresh();
  }

  return (
    <div className="card" style={{
      marginTop: '1rem',
      borderLeft: aDesJustificatifs ? undefined : '3px solid var(--warning)',
    }}>
      <p className="card__title">Justificatifs</p>

      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      {!aDesJustificatifs && (
        <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '66ch' }}>
          <strong>Aucune facture rattachée.</strong> Sans elle, la TVA de cette
          écriture n&apos;est pas déductible et la charge est contestable. C&apos;est
          le premier point qu&apos;un vérificateur regarde.
        </p>
      )}

      <div style={{
        display: 'flex', gap: '.6rem', alignItems: 'center',
        flexWrap: 'wrap', marginTop: '.8rem',
      }}>
        <input
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={(e) => setFichiers(Array.from(e.target.files ?? []))}
          style={{ fontSize: 'var(--fs-sm)' }}
        />
        <button onClick={deposer} disabled={enCours || fichiers.length === 0}
          className="btn btn--gold">
          {enCours ? 'Envoi…' : 'Déposer'}
        </button>
      </div>

      {fichiers.length > 0 && (
        <ul style={{
          fontSize: 'var(--fs-xs)', color: 'var(--g-500)',
          marginTop: '.6rem', paddingLeft: '1.1rem', lineHeight: 1.6,
        }}>
          {fichiers.map((f, i) => (
            <li key={i}>{f.name} — {Math.round(f.size / 1024)} ko</li>
          ))}
        </ul>
      )}

      <p className="muted" style={{
        fontSize: 'var(--fs-xs)', marginTop: '.8rem', lineHeight: 1.5, maxWidth: '66ch',
      }}>
        Un PDF est conservé tel quel. Une photo est réduite à 2000 pixels et
        convertie, ce qui divise son poids par dix sans la rendre illisible.
        {numeroPiece && ` Rattaché à ${numeroPiece}.`}
      </p>
    </div>
  );
}
