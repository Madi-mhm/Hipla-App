'use client';

/**
 * Recherche unifiée.
 *
 * Le point d'entrée naturel est le numéro de pièce, mais on cherche
 * aussi par fournisseur, montant ou mot d'une note. La recherche porte
 * donc sur l'ensemble des champs textuels, sans qu'il faille savoir
 * dans quelle section se trouve l'écriture.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { money, date } from '@/lib/format';
import styles from './recherche.module.css';

type Piece = {
  id: string;
  numero: string | null;
  nature: 'depense' | 'frais' | 'deplacement';
  date: string;
  tiers: string;
  libelle: string | null;
  categorie: string | null;
  montant: number | null;
  statut: string;
  notes: string | null;
  lien: string;
};

const LIBELLE_NATURE: Record<string, string> = {
  depense: 'Dépense',
  frais: 'Frais de création',
  deplacement: 'Déplacement',
};

const CLASSE_STATUT: Record<string, string> = {
  validee: 'badge--success', repris: 'badge--success',
  en_attente: 'badge--warning', a_valider: 'badge--warning',
  rejetee: 'badge--danger', rejete: 'badge--neutral',
};

export default function Recherche({ pieces }: { pieces: Piece[] }) {
  const [terme, setTerme] = useState('');
  const [nature, setNature] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [montantMin, setMontantMin] = useState('');
  const [montantMax, setMontantMax] = useState('');

  const resultats = useMemo(() => {
    const t = terme.trim().toLowerCase();
    const min = parseFloat(montantMin.replace(',', '.'));
    const max = parseFloat(montantMax.replace(',', '.'));

    return pieces.filter((p) => {
      if (nature && p.nature !== nature) return false;
      if (du && p.date < du) return false;
      if (au && p.date > au) return false;
      if (Number.isFinite(min) && (p.montant ?? 0) < min) return false;
      if (Number.isFinite(max) && (p.montant ?? 0) > max) return false;
      if (!t) return true;

      return [
        p.numero, p.tiers, p.libelle, p.categorie, p.notes,
        p.montant !== null ? p.montant.toFixed(2) : null,
        p.montant !== null ? p.montant.toFixed(2).replace('.', ',') : null,
      ].some((v) => v && v.toLowerCase().includes(t));
    });
  }, [pieces, terme, nature, du, au, montantMin, montantMax]);

  const total = resultats.reduce((s, p) => s + (p.montant ?? 0), 0);
  const filtreActif = Boolean(terme || nature || du || au || montantMin || montantMax);

  function surligner(texte: string) {
    const t = terme.trim();
    if (!t) return texte;
    const i = texte.toLowerCase().indexOf(t.toLowerCase());
    if (i === -1) return texte;
    return (
      <>
        {texte.slice(0, i)}
        <mark className={styles.surligne}>{texte.slice(i, i + t.length)}</mark>
        {texte.slice(i + t.length)}
      </>
    );
  }

  return (
    <>
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <label className={styles.champRecherche}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.5-4.5" /></svg>
          <input
            type="search"
            value={terme}
            onChange={(e) => setTerme(e.target.value)}
            placeholder="Numéro de pièce, fournisseur, montant, note…"
            autoFocus
          />
          {terme && (
            <button type="button" onClick={() => setTerme('')} aria-label="Effacer">×</button>
          )}
        </label>

        <div className={styles.filtres}>
          <label><span>Nature</span>
            <select value={nature} onChange={(e) => setNature(e.target.value)}>
              <option value="">Toutes</option>
              <option value="depense">Dépenses</option>
              <option value="frais">Frais de création</option>
              <option value="deplacement">Déplacements</option>
            </select></label>
          <label><span>Du</span>
            <input type="date" value={du} onChange={(e) => setDu(e.target.value)} /></label>
          <label><span>Au</span>
            <input type="date" value={au} onChange={(e) => setAu(e.target.value)} /></label>
          <label><span>Montant min</span>
            <input type="text" inputMode="decimal" value={montantMin}
              onChange={(e) => setMontantMin(e.target.value)} placeholder="0" /></label>
          <label><span>Montant max</span>
            <input type="text" inputMode="decimal" value={montantMax}
              onChange={(e) => setMontantMax(e.target.value)} placeholder="∞" /></label>
        </div>

        {filtreActif && (
          <div className={styles.resume}>
            <span>
              <strong>{resultats.length}</strong> résultat{resultats.length > 1 ? 's' : ''} sur {pieces.length}
              {total > 0 && <> · <strong className="amount">{money(total)}</strong></>}
            </span>
            <button
              type="button"
              onClick={() => {
                setTerme(''); setNature(''); setDu(''); setAu('');
                setMontantMin(''); setMontantMax('');
              }}
              className="btn btn--ghost"
              style={{ minHeight: 30, padding: '.2rem .7rem', fontSize: 'var(--fs-xs)' }}
            >
              Réinitialiser
            </button>
          </div>
        )}
      </div>

      <div className="card">
        {resultats.length === 0 ? (
          <p className="muted" style={{ padding: '1.5rem 0', fontSize: 'var(--fs-sm)' }}>
            {filtreActif
              ? 'Aucune écriture ne correspond.'
              : 'Saisissez une référence, un fournisseur ou un montant.'}
          </p>
        ) : (
          <div className="table-scroll">
            <table style={{ minWidth: 660, fontSize: 'var(--fs-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                  <th style={th}>Pièce</th>
                  <th style={th}>Date</th>
                  <th style={th}>Tiers</th>
                  <th style={th} className="col-secondaire">Nature</th>
                  <th style={{ ...th, textAlign: 'right' }}>Montant</th>
                  <th style={{ ...th, textAlign: 'right' }}>Statut</th>
                  <th style={{ ...th, textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {resultats.slice(0, 200).map((p) => (
                  <tr key={`${p.nature}-${p.id}`} style={{ borderBottom: '1px solid var(--g-200)' }}>
                    <td style={td} className="mono">
                      <span style={{ fontSize: '.74rem', color: 'var(--navy)', fontWeight: 600 }}>
                        {p.numero ? surligner(p.numero) : '—'}
                      </span>
                    </td>
                    <td style={td}>{date(p.date)}</td>
                    <td style={{ ...td, fontWeight: 500 }}>
                      {surligner(p.tiers)}
                      {p.libelle && (
                        <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                          {surligner(p.libelle)}
                        </span>
                      )}
                    </td>
                    <td style={td} className="col-secondaire muted">
                      {LIBELLE_NATURE[p.nature]}
                      {p.categorie && (
                        <span style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>{p.categorie}</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }} className="amount">
                      {p.montant !== null ? money(p.montant) : (p.notes ?? '—')}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <span className={`badge ${CLASSE_STATUT[p.statut] ?? 'badge--neutral'}`}>
                        {p.statut.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <Link href={p.lien} className="btn btn--ghost"
                        style={{ minHeight: 28, padding: '.15rem .6rem', fontSize: '.7rem' }}>
                        Ouvrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {resultats.length > 200 && (
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.8rem' }}>
            200 premiers résultats affichés sur {resultats.length}. Affinez les filtres.
          </p>
        )}
      </div>
    </>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)',
  fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.6rem .4rem', verticalAlign: 'top' };
