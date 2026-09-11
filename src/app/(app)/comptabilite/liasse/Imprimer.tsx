'use client';

export default function Imprimer() {
  return (
    <button onClick={() => window.print()} className="btn btn--ghost sans-impression">
      Imprimer
    </button>
  );
}
