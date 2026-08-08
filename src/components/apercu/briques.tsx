'use client';

/**
 * LES BRIQUES D'UN APERÇU
 *
 * Trois aperçus existent — pièce, opération bancaire, associé — et ils
 * partagent leur squelette, leurs lignes et leur pied.
 *
 * Les recopier dans chacun garantirait qu'ils divergent : l'un gagnerait
 * un espacement, l'autre une couleur, et six mois plus tard trois
 * fenêtres se ressembleraient sans être identiques. C'est le défaut qui
 * a coûté le plus cher à ce projet, sous une autre forme.
 */

import Link from 'next/link';

/** Le squelette a la forme du contenu à venir : la fenêtre ne saute pas. */
export function Squelette() {
  return (
    <div style={{ display: 'grid', gap: '.7rem' }}>
      <div style={{ ...barre, width: '45%', height: 22 }} />
      <div style={{ ...barre, width: '65%' }} />
      <div style={{ ...barre, width: '100%', height: 72, marginTop: '.5rem' }} />
      <div style={{ ...barre, width: '80%' }} />
      <div style={{ ...barre, width: '55%' }} />
    </div>
  );
}

/** L'en-tête : le titre, puis le badge et les repères sur une ligne. */
export function EnTeteApercu({ titre, badge, badgeClasse, repere }: {
  titre: string;
  badge?: string;
  badgeClasse?: string;
  repere: React.ReactNode;
}) {
  return (
    /*
      Le badge passe SOUS le titre, pas à sa droite : la croix de
      fermeture occupe ce coin, et le badge s'y faisait tronquer.
    */
    <div style={{
      paddingRight: '2.5rem', paddingBottom: '.9rem',
      borderBottom: '1px solid var(--g-200)',
    }}>
      <p style={{
        fontFamily: 'var(--display)', fontSize: '1.2rem',
        fontWeight: 600, color: 'var(--navy)',
      }}>
        {titre}
      </p>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '.6rem',
        flexWrap: 'wrap', marginTop: '.35rem',
      }}>
        {badge && <span className={`badge ${badgeClasse ?? 'badge--neutral'}`}>{badge}</span>}
        <span className="muted mono" style={{ fontSize: '.72rem' }}>{repere}</span>
      </div>
    </div>
  );
}

export function Ligne({ cle, valeur, fort, signe, alerte }: {
  cle: string; valeur: React.ReactNode;
  fort?: boolean; signe?: boolean; alerte?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      gap: '1rem', padding: fort ? '.4rem 0 0' : '.15rem 0',
      borderTop: fort ? '1px solid var(--g-300)' : undefined,
      marginTop: fort ? '.35rem' : undefined,
    }}>
      <span style={{
        fontSize: 'var(--fs-sm)',
        color: fort ? 'var(--navy)' : 'var(--g-500)',
        fontWeight: fort ? 600 : 400,
      }}>
        {cle}
      </span>
      <span className="amount" style={{
        fontSize: fort ? 'var(--fs-lg)' : 'var(--fs-sm)',
        fontWeight: fort ? 600 : 500,
        color: alerte ? 'var(--warning)' : fort ? 'var(--navy)' : 'var(--g-800)',
        textAlign: 'right',
      }}>
        {signe && '− '}{valeur}
      </span>
    </div>
  );
}

/** Le pied : ouvrir en grand, ou fermer. */
export function PiedApercu({ lien, libelle, onFermer }: {
  lien: string; libelle?: string; onFermer: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: '.6rem', marginTop: '1.2rem', flexWrap: 'wrap' }}>
      <Link href={lien} className="btn btn--gold" onClick={onFermer}>
        {libelle ?? 'Ouvrir la page complète'}
      </Link>
      <button onClick={onFermer} className="btn btn--ghost">Fermer</button>
    </div>
  );
}

export function Avertissement({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      marginTop: '.8rem', padding: '.7rem .9rem', borderRadius: 6,
      background: 'var(--warning-bg)', color: 'var(--warning)',
      fontSize: 'var(--fs-xs)', lineHeight: 1.5,
    }}>
      {children}
    </p>
  );
}

export function Encadre({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: '1rem', padding: '.9rem 1rem',
      background: 'var(--g-50)', borderRadius: 6,
    }}>
      {children}
    </div>
  );
}

export const etiquette: React.CSSProperties = {
  fontSize: '.65rem', letterSpacing: '.07em', textTransform: 'uppercase',
  color: 'var(--g-500)', marginBottom: '.2rem',
};

// Pas d'animation : aucune n'est déclarée dans la feuille de styles, et
// en inventer une ici la rendrait orpheline du reste.
const barre: React.CSSProperties = {
  height: 14, borderRadius: 4, background: 'var(--g-200)', opacity: 0.7,
};
