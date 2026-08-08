'use client';

/**
 * UN ASSOCIÉ CLIQUABLE
 *
 * Ouvre l'aperçu d'une personne : sa participation au capital, ce que la
 * société lui doit, et les derniers mouvements de son compte courant.
 *
 * Assez pour comprendre d'où vient un solde. Pas assez pour remplacer la
 * fiche — un aperçu qui dit tout n'est plus un aperçu.
 */

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { money, date } from '@/lib/format';
import Fenetre from '@/components/Fenetre';
import {
  Squelette, EnTeteApercu, Ligne, PiedApercu, Encadre, etiquette,
} from './briques';

type ApercuAssocie = {
  trouvee: boolean;
  identifiant: string; nom_complet: string;
  fonction: string | null; ville: string | null;
  email: string | null; telephone: string | null;
  date_entree: string | null; actif: boolean;
  parts: number; capital_souscrit: number; capital_libere: number;
  quote_part: number;
  avance: number; rembourse: number; solde: number;
  derniers: Array<{
    id: string; numero_piece: string | null;
    date: string; motif: string; montant: number;
  }>;
  lien: string;
};

const FONCTIONS: Record<string, string> = {
  president: 'Président',
  directeur_general: 'Directeur général',
  associe: 'Associé',
};

export default function RefAssocie({ identifiant, children, style, className, title }: {
  identifiant: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  title?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [a, setA] = useState<ApercuAssocie | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function ouvrir(e: React.MouseEvent) {
    if (e.metaKey || e.ctrlKey || e.button === 1) return;
    e.preventDefault();

    setOuvert(true);
    setA(null);
    setErreur(null);

    const supabase = createClient();
    const { data, error } = await supabase.rpc('apercu_associe', {
      p_identifiant: identifiant,
    });

    if (error) { setErreur(error.message); return; }
    const r = data as ApercuAssocie | null;
    if (!r?.trouvee) { setErreur('Associé introuvable.'); return; }
    setA(r);
  }

  return (
    <>
      <Link href={`/associes/${identifiant}`} onClick={ouvrir}
        data-fenetre="oui"
        style={{ cursor: 'pointer', ...style }}
        className={className} title={title ?? 'Voir l’associé'}>
        {children ?? identifiant}
      </Link>

      <Fenetre ouvert={ouvert} onFermer={() => setOuvert(false)}
        titre="Aperçu de l’associé">
        <div style={{ padding: '1.5rem' }}>
          {erreur ? (
            <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }}>{erreur}</p>
          ) : !a ? (
            <Squelette />
          ) : (
            <Contenu a={a} onFermer={() => setOuvert(false)} />
          )}
        </div>
      </Fenetre>
    </>
  );
}

function Contenu({ a, onFermer }: { a: ApercuAssocie; onFermer: () => void }) {
  const doit = Number(a.solde) > 0.005;

  return (
    <>
      <EnTeteApercu
        titre={a.nom_complet}
        badge={a.fonction ? FONCTIONS[a.fonction] ?? a.fonction : 'Associé'}
        badgeClasse="badge--info"
        repere={
          <>
            {Number(a.quote_part).toFixed(0)} % du capital · {a.parts} parts
            {a.ville && ` · ${a.ville}`}
          </>
        }
      />

      {/* ---- Ce que la société lui doit ---- */}
      <Encadre>
        <Ligne
          cle={doit ? 'Compte courant' : 'Compte courant'}
          valeur={money(Number(a.solde))}
          fort
        />
        <Ligne cle="Avancé pour la société" valeur={money(Number(a.avance))} />
        {Number(a.rembourse) > 0.005 && (
          <Ligne cle="Déjà remboursé" valeur={money(Number(a.rembourse))} />
        )}
        <p className="muted" style={{
          fontSize: 'var(--fs-xs)', marginTop: '.5rem', lineHeight: 1.5,
        }}>
          {doit
            ? 'Dette ordinaire de la société : remboursable dès que la trésorerie le permet, sans impôt ni charge sociale.'
            : 'La société ne doit rien à cet associé.'}
        </p>
      </Encadre>

      {/* ---- Le capital ---- */}
      <div style={{ marginTop: '1rem', display: 'grid', gap: '.3rem' }}>
        <Ligne cle="Capital souscrit" valeur={money(Number(a.capital_souscrit))} />
        <Ligne
          cle="Libéré"
          valeur={Number(a.capital_libere) >= Number(a.capital_souscrit) - 0.005
            ? 'Intégralement'
            : money(Number(a.capital_libere))}
          alerte={Number(a.capital_libere) < Number(a.capital_souscrit) - 0.005}
        />
        {a.email && <Ligne cle="Courriel" valeur={a.email} />}
        {a.telephone && <Ligne cle="Téléphone" valeur={a.telephone} />}
      </div>

      {/* ---- Les derniers mouvements ---- */}
      {a.derniers.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <p style={etiquette}>Derniers mouvements</p>
          {a.derniers.map((m) => {
            const rendu = Number(m.montant) < 0;
            return (
              <div key={m.id} style={{
                display: 'flex', justifyContent: 'space-between',
                gap: '1rem', padding: '.35rem 0',
                borderBottom: '1px solid var(--g-200)',
              }}>
                <span style={{ fontSize: 'var(--fs-sm)' }}>
                  {m.motif}
                  <span className="muted mono" style={{
                    display: 'block', fontSize: '.68rem',
                  }}>
                    {m.numero_piece ?? '—'} · {date(m.date)}
                  </span>
                </span>
                <span className="amount" style={{
                  fontSize: 'var(--fs-sm)', fontWeight: 500,
                  color: rendu ? 'var(--success)' : 'var(--navy)',
                  whiteSpace: 'nowrap',
                }}>
                  {rendu ? '− ' : '+ '}{money(Math.abs(Number(m.montant)))}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <PiedApercu lien={a.lien} libelle="Ouvrir la fiche" onFermer={onFermer} />
    </>
  );
}
