'use client';

/**
 * CALENDRIER DES OBLIGATIONS
 *
 * Chaque échéance se marque « faite », avec la date et la référence du
 * dépôt : c'est la trace qu'on retrouvera l'année suivante, et ce qui
 * distingue une obligation remplie d'une obligation oubliée.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { date } from '@/lib/format';
import Alerte from '@/components/Alerte';
import type { Obligation } from '@/lib/obligations';
import f from '@/styles/formulaire.module.css';

export type Suivi = { cle: string; fait_le: string; reference: string | null };

const JOUR = 86_400_000;

export default function Calendrier({ obligations, rappels, suivi, aujourdhui, peutModifier }: {
  obligations: Obligation[]; rappels: string[]; suivi: Suivi[];
  aujourdhui: string; peutModifier: boolean;
}) {
  const router = useRouter();
  const [toutes, setToutes] = useState(false);
  const [edite, setEdite] = useState<string | null>(null);
  const [faitLe, setFaitLe] = useState(aujourdhui);
  const [reference, setReference] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const fait = new Map(suivi.map((s) => [s.cle, s]));
  // À l'écran : ce qui reste à faire. Ce qui est fait se consulte sur demande.
  const visibles = obligations.filter((o) => toutes || !fait.has(o.cle));
  const faites = obligations.length - obligations.filter((o) => !fait.has(o.cle)).length;

  function ouvrir(cle: string) {
    setEdite(cle); setFaitLe(aujourdhui); setReference(''); setErreur(null);
  }

  async function marquer(e: React.FormEvent, cle: string) {
    e.preventDefault();
    setEnCours(true); setErreur(null);
    const { error } = await createClient().from('obligations_suivi').upsert(
      { cle, fait_le: faitLe, reference: reference.trim() || null, modifie_le: new Date().toISOString() },
      { onConflict: 'cle' });
    setEnCours(false);
    if (error) { setErreur(`Enregistrement impossible : ${error.message}`); return; }
    setEdite(null);
    router.refresh();
  }

  async function defaire(cle: string) {
    setEnCours(true); setErreur(null);
    const { error } = await createClient().from('obligations_suivi').delete().eq('cle', cle);
    setEnCours(false);
    if (error) { setErreur(error.message); return; }
    router.refresh();
  }

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}

      <div className="table-scroll" style={{ marginTop: '.8rem' }}>
        <table style={{ minWidth: 680, fontSize: 'var(--fs-sm)' }}>
          <tbody>
            {visibles.map((o) => {
              const s = fait.get(o.cle);
              const jours = Math.round((Date.parse(o.date) - Date.parse(aujourdhui)) / JOUR);
              const etat = s
                ? { classe: 'badge--success', texte: `Fait le ${date(s.fait_le)}` }
                : jours < 0 ? { classe: 'badge--danger', texte: 'En retard' }
                : jours <= 30 ? { classe: 'badge--warning', texte: `Dans ${jours} j` }
                : { classe: 'badge--neutral', texte: 'À venir' };
              return (
                <tr key={o.cle} className={f.ligne} style={{ opacity: s ? 0.6 : 1 }}>
                  <td className={f.td} style={{ whiteSpace: 'nowrap', width: '7.5rem' }}>
                    <strong>{date(o.date)}</strong>
                    <span className={`badge ${etat.classe}`} style={{ display: 'inline-block', marginTop: '.3rem' }}>
                      {etat.texte}
                    </span>
                  </td>
                  <td className={f.td}>
                    <span style={{ fontWeight: 600 }}>{o.titre}</span>
                    <span style={{ display: 'block', lineHeight: 1.5, marginTop: '.15rem' }}>{o.detail}</span>
                    <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)', marginTop: '.2rem' }}>
                      {o.ou}{o.condition ? ` · ${o.condition}` : ''}
                      {s?.reference ? ` · Référence : ${s.reference}` : ''}
                    </span>
                    {edite === o.cle && (
                      <form onSubmit={(e) => marquer(e, o.cle)} className={f.formulaire} style={{ marginTop: '.6rem' }}>
                        <label><span>Fait le</span>
                          <input type="date" value={faitLe} onChange={(e) => setFaitLe(e.target.value)} required /></label>
                        <label><span>Référence du dépôt</span>
                          <input value={reference} onChange={(e) => setReference(e.target.value)}
                            placeholder="Accusé de réception, n° de télédéclaration…" /></label>
                        <div className={`${f.actions} ${f.pleine}`}>
                          <button type="submit" className="btn btn--gold btn--sm" disabled={enCours}>Enregistrer</button>
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEdite(null)}>Annuler</button>
                        </div>
                      </form>
                    )}
                  </td>
                  <td className={f.td} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {o.lien && !s && <Link href={o.lien} className="btn btn--ghost btn--sm">Préparer</Link>}{' '}
                    {peutModifier && !s && edite !== o.cle && (
                      <button onClick={() => ouvrir(o.cle)} className="btn btn--ghost btn--sm">Marquer fait</button>
                    )}
                    {peutModifier && s && (
                      <button onClick={() => defaire(o.cle)} disabled={enCours} className="btn btn--ghost btn--sm">
                        Défaire
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {faites > 0 && (
        <button onClick={() => setToutes(!toutes)} className="btn btn--ghost btn--sm" style={{ marginTop: '.7rem' }}>
          {toutes ? 'Masquer ce qui est fait' : `Afficher aussi ce qui est fait (${faites})`}
        </button>
      )}

      <ul className="muted" style={{ fontSize: 'var(--fs-xs)', lineHeight: 1.55, marginTop: '.9rem', paddingLeft: '1.1rem' }}>
        {rappels.map((r) => <li key={r}>{r}</li>)}
        <li>
          Les dates sont les limites de principe : le calendrier fiscal publié chaque année peut
          les décaler d&apos;un jour ou deux. Votre espace professionnel fait foi.
        </li>
      </ul>
    </>
  );
}
