'use client';

/**
 * LES JUSTIFICATIFS, DANS UNE FENÊTRE
 *
 * Cinq écrans annonçaient « facture manquante » sans rien proposer. Il
 * fallait ouvrir la page complète, déposer, revenir. Une fenêtre qui
 * signale un problème sans offrir la solution fait perdre du temps.
 *
 * TROIS GESTES
 * · voir — l'image ou le PDF s'affiche dans la MÊME fenêtre, replié par
 *   défaut : une facture prend beaucoup de place à côté des montants ;
 * · déposer — là où le manque est signalé ;
 * · retirer — avec un motif, parce qu'une pièce effacée par erreur est
 *   une charge que plus rien ne défend.
 */

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { compresser, poids } from '@/lib/compression';
import { etiquette } from './briques';

export type Justificatif = {
  id: string; chemin: string; nom: string;
  type_mime: string; taille: number; depose_le: string;
};

export default function Justificatifs({
  pieceId, liste, manquante, modifiable, peutGerer, onChange,
}: {
  pieceId: string;
  liste: Justificatif[];
  manquante: boolean;
  modifiable: boolean;
  peutGerer: boolean;
  onChange: () => void;
}) {
  const champ = useRef<HTMLInputElement>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [aRetirer, setARetirer] = useState<Justificatif | null>(null);
  const [motif, setMotif] = useState('');

  /** L'URL signée est produite à la demande : les fichiers ne sont pas publics. */
  async function afficher(j: Justificatif) {
    if (ouvert === j.id) { setOuvert(null); return; }
    setOuvert(j.id);
    if (urls[j.id]) return;

    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from('justificatifs').createSignedUrl(j.chemin, 3600);
    if (error || !data?.signedUrl) {
      setErreur('Fichier introuvable dans le stockage.');
      return;
    }
    setUrls({ ...urls, [j.id]: data.signedUrl });
  }

  async function deposer(fichiers: FileList) {
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();
    let n = 0;

    for (const brut of Array.from(fichiers)) {
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
      if (eUp) { setErreur(`Envoi impossible — ${eUp.message}`); continue; }

      // L'échec du rattachement doit être visible : sans cela, le fichier
      // reste dans le stockage sans qu'aucune ligne ne le relie.
      const { error: eJ } = await supabase.rpc('rattacher_justificatif', {
        p_piece: pieceId,
        p_chemin: chemin,
        p_nom: brut.name,
        p_type: f.type,
        p_taille: f.size,
        p_taille_origine: tailleOrigine,
      });
      if (eJ) { setErreur(`Fichier envoyé mais non rattaché — ${eJ.message}`); continue; }
      n += 1;
    }

    if (champ.current) champ.current.value = '';
    setEnCours(false);
    if (n > 0) onChange();
  }

  async function retirer() {
    if (!aRetirer) return;
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    const { error } = await supabase.rpc('retirer_justificatif', {
      p_id: aRetirer.id, p_motif: motif.trim(),
    });

    if (error) { setErreur(error.message); setEnCours(false); return; }

    // Le fichier ensuite : si la base a refusé, il ne faut pas l'effacer.
    await supabase.storage.from('justificatifs').remove([aRetirer.chemin]);

    setARetirer(null);
    setMotif('');
    setEnCours(false);
    onChange();
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <p style={etiquette}>
        Justificatifs{liste.length > 0 && ` — ${liste.length}`}
      </p>

      {erreur && (
        <p style={{
          fontSize: 'var(--fs-xs)', color: 'var(--danger)', marginBottom: '.5rem',
        }}>
          {erreur}
        </p>
      )}

      {liste.length === 0 ? (
        <p style={{
          fontSize: 'var(--fs-sm)',
          color: manquante ? 'var(--warning)' : 'var(--g-500)',
        }}>
          {manquante
            ? 'Aucune facture — la charge est rejetée et la TVA contestée.'
            : 'Aucun justificatif. Cette écriture est justifiée par le relevé.'}
        </p>
      ) : (
        liste.map((j) => (
          <div key={j.id} style={{
            borderBottom: '1px solid var(--g-200)', paddingBottom: '.4rem',
            marginBottom: '.4rem',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', gap: '.6rem',
            }}>
              <button onClick={() => afficher(j)} style={lienFichier}>
                {j.nom}
                <span className="muted mono" style={{
                  display: 'block', fontSize: '.65rem', fontWeight: 400,
                }}>
                  {poids(j.taille)} · {ouvert === j.id ? 'masquer' : 'afficher'}
                </span>
              </button>
              {peutGerer && modifiable && (
                <button onClick={() => { setARetirer(j); setMotif(''); }}
                  style={boutonRetirer} title="Retirer ce justificatif">
                  Retirer
                </button>
              )}
            </div>

            {/* L'aperçu, replié par défaut : une facture prend beaucoup
                de place à côté des montants. */}
            {ouvert === j.id && urls[j.id] && (
              <div style={{
                marginTop: '.5rem', borderRadius: 6, overflow: 'hidden',
                border: '1px solid var(--g-200)', background: 'var(--g-50)',
              }}>
                {j.type_mime.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[j.id]} alt={j.nom}
                    style={{ display: 'block', width: '100%', height: 'auto' }} />
                ) : (
                  <iframe src={urls[j.id]} title={j.nom}
                    style={{ display: 'block', width: '100%', height: '26rem', border: 0 }} />
                )}
              </div>
            )}
          </div>
        ))
      )}

      {/* ---- Déposer ---- */}
      {peutGerer && modifiable && !aRetirer && (
        <div style={{ marginTop: '.6rem' }}>
          <input ref={champ} type="file" multiple
            accept="application/pdf,image/*"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files && deposer(e.target.files)} />
          <button onClick={() => champ.current?.click()} disabled={enCours}
            className={manquante ? 'btn btn--gold' : 'btn btn--ghost'}
            style={{ minHeight: 30, padding: '.2rem .8rem', fontSize: '.74rem' }}>
            {enCours ? 'Envoi…' : manquante ? 'Déposer la facture' : 'Ajouter un justificatif'}
          </button>
        </div>
      )}

      {/* ---- Confirmer le retrait ---- */}
      {aRetirer && (
        <div style={{
          marginTop: '.7rem', padding: '.8rem .9rem', borderRadius: 6,
          background: 'var(--danger-bg)', borderLeft: '2px solid var(--danger)',
        }}>
          <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--danger)' }}>
            Retirer « {aRetirer.nom} » ?
          </p>
          <p className="muted" style={{
            fontSize: 'var(--fs-xs)', marginTop: '.25rem', lineHeight: 1.5,
          }}>
            Le fichier sera supprimé. Sans justificatif, la charge est rejetée
            et la TVA contestée — le motif restera au journal d&apos;audit.
          </p>
          <input type="text" value={motif} autoFocus
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Doublon, mauvaise pièce, illisible…"
            style={{ marginTop: '.5rem', width: '100%' }} />
          <div style={{ display: 'flex', gap: '.5rem', marginTop: '.6rem' }}>
            <button onClick={retirer} disabled={enCours || !motif.trim()}
              className="btn btn--ghost"
              style={{
                minHeight: 28, padding: '.15rem .7rem', fontSize: '.72rem',
                color: 'var(--danger)', borderColor: 'var(--danger)',
              }}>
              {enCours ? 'Retrait…' : 'Retirer'}
            </button>
            <button onClick={() => setARetirer(null)} className="btn btn--ghost"
              style={{ minHeight: 28, padding: '.15rem .7rem', fontSize: '.72rem' }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {!modifiable && liste.length > 0 && (
        <p className="muted" style={{
          fontSize: 'var(--fs-xs)', marginTop: '.5rem', lineHeight: 1.5,
        }}>
          Cette écriture relève d&apos;une déclaration déjà déposée : ses
          justificatifs ne se retirent plus.
        </p>
      )}
    </div>
  );
}

const lienFichier: React.CSSProperties = {
  border: 0, background: 'none', padding: 0, cursor: 'pointer',
  textAlign: 'left', fontSize: 'var(--fs-sm)', fontWeight: 500,
  color: 'var(--navy)', flex: 1, minWidth: 0,
};
const boutonRetirer: React.CSSProperties = {
  border: 0, background: 'none', padding: '.1rem .3rem', cursor: 'pointer',
  fontSize: '.68rem', color: 'var(--g-500)', flexShrink: 0,
};
