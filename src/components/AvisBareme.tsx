import Link from 'next/link';

/**
 * Sans barème de l'année, chaque kilomètre vaut zéro : les indemnités
 * s'affichent à 0 € et ne peuvent pas être constatées. Le barème paraît
 * au printemps ; entre-temps, on recopie celui de l'an dernier.
 */
export default function AvisBareme({ annee }: { annee: number }) {
  return (
    <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--warning)' }}>
      <p className="card__title" style={{ color: 'var(--warning)' }}>
        Barème kilométrique {annee} absent
      </p>
      <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.5, maxWidth: '70ch' }}>
        Sans lui, les indemnités de {annee} valent 0 € et ne peuvent pas être
        constatées. Recopiez le barème de l&apos;année précédente, puis ajustez-le
        quand l&apos;administration publie le nouveau.
      </p>
      <Link href="/reglages/vehicules" className="btn btn--ghost btn--sm" style={{ marginTop: '.6rem' }}>
        Réglages → Véhicules
      </Link>
    </div>
  );
}
