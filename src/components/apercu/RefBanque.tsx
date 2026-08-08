'use client';

/**
 * UNE OPÉRATION BANCAIRE CLIQUABLE
 *
 * Ouvre l'aperçu d'un mouvement Qonto : le montant, l'écriture
 * rattachée, ou — si rien ne l'est encore — ce que le moteur
 * d'appariement propose.
 *
 * Ce dernier point est le plus utile : on voit d'un coup d'œil, depuis
 * la liste, si une opération attend une décision ou non.
 */

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { money, dateLong } from '@/lib/format';
import Fenetre from '@/components/Fenetre';
import {
  Squelette, EnTeteApercu, Ligne, PiedApercu, Encadre, etiquette,
} from './briques';

type ApercuBanque = {
  trouvee: boolean;
  id: string; numero_piece: string | null;
  date_operation: string; libelle: string; reference: string | null;
  montant: number; sens: string;
  categorie_qonto: string | null;
  statut_qonto: string; statut_traitement: string;
  a_justificatif: boolean; justificatif_recupere: boolean;
  ecriture: {
    id: string; numero_piece: string | null; tiers: string;
    objet: string | null; montant_ttc: number; etat: string;
  } | null;
  candidats: Array<{
    piece_id: string; numero_piece: string | null;
    tiers: string; reste_du: number; score: number;
  }> | null;
  lien: string;
};

const TRAITEMENTS: Record<string, { libelle: string; classe: string }> = {
  a_traiter:  { libelle: 'À traiter', classe: 'badge--warning' },
  rattachee:  { libelle: 'Rattachée', classe: 'badge--success' },
  ecartee:    { libelle: 'Écartée', classe: 'badge--neutral' },
};

export default function RefBanque({ id, children, style, className, title }: {
  id: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  title?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [a, setA] = useState<ApercuBanque | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function ouvrir(e: React.MouseEvent) {
    if (e.metaKey || e.ctrlKey || e.button === 1) return;
    e.preventDefault();

    setOuvert(true);
    setA(null);
    setErreur(null);

    const supabase = createClient();
    const { data, error } = await supabase.rpc('apercu_banque', { p_id: id });

    if (error) { setErreur(error.message); return; }
    const r = data as ApercuBanque | null;
    if (!r?.trouvee) { setErreur('Opération introuvable.'); return; }
    setA(r);
  }

  return (
    <>
      <Link href={`/banque/${id}`} onClick={ouvrir}
        data-fenetre="oui"
        style={{ cursor: 'pointer', ...style }}
        className={className} title={title ?? 'Voir l’opération'}>
        {children ?? '—'}
      </Link>

      <Fenetre ouvert={ouvert} onFermer={() => setOuvert(false)}
        titre="Aperçu de l’opération">
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

function Contenu({ a, onFermer }: { a: ApercuBanque; onFermer: () => void }) {
  const t = TRAITEMENTS[a.statut_traitement] ?? TRAITEMENTS.a_traiter;
  const entree = a.sens === 'credit';

  return (
    <>
      <EnTeteApercu
        titre={a.libelle}
        badge={t.libelle}
        badgeClasse={t.classe}
        repere={
          <>
            {a.numero_piece ?? 'sans numéro'} · {dateLong(a.date_operation)}
            {a.statut_qonto !== 'completed' && ' · en attente de consolidation'}
          </>
        }
      />

      <Encadre>
        <Ligne
          cle={entree ? 'Encaissement' : 'Décaissement'}
          valeur={money(Number(a.montant))}
          fort
        />
        {a.reference && <Ligne cle="Référence" valeur={a.reference} />}
        {a.categorie_qonto && <Ligne cle="Catégorie Qonto" valeur={a.categorie_qonto} />}
        <Ligne
          cle="Justificatif Qonto"
          valeur={a.a_justificatif
            ? (a.justificatif_recupere ? 'Récupéré' : 'Disponible, non récupéré')
            : 'Aucun'}
          alerte={a.a_justificatif && !a.justificatif_recupere}
        />
      </Encadre>

      {/* ---- L'écriture rattachée ---- */}
      {a.ecriture ? (
        <div style={{ marginTop: '1rem' }}>
          <p style={etiquette}>Écriture rattachée</p>
          <div style={{
            padding: '.75rem .9rem', borderRadius: 6,
            background: 'var(--bone)', borderLeft: '2px solid var(--gold)',
          }}>
            <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 500 }}>
              {a.ecriture.tiers}
            </p>
            <p className="muted mono" style={{ fontSize: '.7rem', marginTop: '.15rem' }}>
              {a.ecriture.numero_piece}
              {a.ecriture.objet && ` · ${a.ecriture.objet}`}
            </p>
            <p className="amount" style={{
              fontSize: 'var(--fs-sm)', fontWeight: 600,
              color: 'var(--navy)', marginTop: '.3rem',
            }}>
              {money(Number(a.ecriture.montant_ttc))}
            </p>
          </div>
        </div>
      ) : a.candidats && a.candidats.length > 0 ? (
        /*
          Rien n'est rattaché, mais le moteur propose : c'est
          l'information la plus utile depuis une liste — elle dit si
          l'opération attend une décision ou un travail de saisie.
        */
        <div style={{ marginTop: '1rem' }}>
          <p style={etiquette}>
            {a.candidats.length} écriture{a.candidats.length > 1 ? 's' : ''} proposée
            {a.candidats.length > 1 ? 's' : ''}
          </p>
          {a.candidats.map((c) => (
            <div key={c.piece_id} style={{
              display: 'flex', justifyContent: 'space-between',
              gap: '1rem', padding: '.4rem 0',
              borderBottom: '1px solid var(--g-200)',
            }}>
              <span style={{ fontSize: 'var(--fs-sm)' }}>
                {c.tiers}
                <span className="muted mono" style={{
                  display: 'block', fontSize: '.68rem',
                }}>
                  {c.numero_piece} · confiance {c.score}
                </span>
              </span>
              <span className="amount" style={{ fontSize: 'var(--fs-sm)' }}>
                {money(Number(c.reste_du))}
              </span>
            </div>
          ))}
        </div>
      ) : a.statut_traitement === 'a_traiter' ? (
        <p className="muted" style={{
          fontSize: 'var(--fs-sm)', marginTop: '1rem', lineHeight: 1.5,
        }}>
          Aucune écriture ne correspond. Il faudra la créer, ou rattacher
          l&apos;opération à la main.
        </p>
      ) : null}

      <PiedApercu lien={a.lien} libelle="Ouvrir l’opération" onFermer={onFermer} />
    </>
  );
}
