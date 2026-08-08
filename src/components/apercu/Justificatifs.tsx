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
  exige, regle, motifExemption, decisionManuelle, nature,
}: {
  pieceId: string;
  liste: Justificatif[];
  manquante: boolean;
  modifiable: boolean;
  peutGerer: boolean;
  onChange: () => void;
  /** La décision posée sur la pièce, ou null si la catégorie tranche. */
  exige?: boolean | null;
  /** Ce que dit la catégorie, à défaut de décision. */
  regle?: boolean;
  motifExemption?: string | null;
  decisionManuelle?: boolean;
  nature?: string;
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

      {/*
        D'où vient la décision ? Une règle générale, ou un choix assumé.
        Le dire est la moitié du travail : « justifié par le relevé »
        sans raison est une affirmation, pas une justification.
      */}
      {peutGerer && modifiable && nature !== 'vente' && nature !== 'avoir' && (
        <Decision
          pieceId={pieceId}
          exige={exige ?? null}
          regle={regle ?? true}
          motif={motifExemption ?? null}
          manuelle={decisionManuelle ?? false}
          aDesJustificatifs={liste.length > 0}
          onChange={onChange}
        />
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

/* ================================================================ */

/**
 * D'OÙ VIENT L'EXIGENCE DE JUSTIFICATIF
 *
 * Trois états, et il faut pouvoir les distinguer :
 *
 * · la CATÉGORIE tranche — état par défaut, réversible sans motif ;
 * · on EXIGE explicitement — toujours défendable, aucun motif requis ;
 * · on DISPENSE explicitement — demande un motif, parce qu'une charge
 *   sans facture doit pouvoir s'expliquer trois ans plus tard.
 *
 * L'asymétrie est voulue : réclamer une pièce ne se justifie pas, s'en
 * passer si.
 */
function Decision({
  pieceId, exige, regle, motif, manuelle, aDesJustificatifs, onChange,
}: {
  pieceId: string;
  exige: boolean | null;
  regle: boolean;
  motif: string | null;
  manuelle: boolean;
  aDesJustificatifs: boolean;
  onChange: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouveauMotif, setNouveauMotif] = useState('');

  const effectif = exige ?? regle;

  async function decider(valeur: boolean) {
    if (!valeur && !nouveauMotif.trim()) {
      setErreur('Dispenser une écriture de facture demande un motif.');
      return;
    }
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    const { error } = await supabase.rpc('decider_justificatif', {
      p_piece: pieceId,
      p_exige: valeur,
      p_motif: valeur ? null : nouveauMotif.trim(),
    });

    if (error) { setErreur(error.message); setEnCours(false); return; }
    setOuvert(false);
    setNouveauMotif('');
    setEnCours(false);
    onChange();
  }

  async function reprendreRegle() {
    setEnCours(true);
    const supabase = createClient();
    const { error } = await supabase.rpc('reprendre_regle_justificatif', {
      p_piece: pieceId,
    });
    if (error) { setErreur(error.message); setEnCours(false); return; }
    setOuvert(false);
    setEnCours(false);
    onChange();
  }

  return (
    <div style={{
      marginTop: '.7rem', paddingTop: '.6rem',
      borderTop: '1px solid var(--g-200)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', gap: '.8rem', flexWrap: 'wrap',
      }}>
        <p className="muted" style={{ fontSize: 'var(--fs-xs)', lineHeight: 1.5 }}>
          {effectif
            ? 'Une facture est exigée'
            : 'Cette écriture est dispensée de facture'}
          {manuelle
            ? ' — décision prise sur cette pièce'
            : ' — règle de la catégorie'}
          {!effectif && motif && (
            <span style={{ display: 'block', fontStyle: 'italic' }}>
              « {motif} »
            </span>
          )}
        </p>
        <button onClick={() => setOuvert(!ouvert)} style={boutonDiscret}>
          {ouvert ? 'Fermer' : 'Modifier'}
        </button>
      </div>

      {ouvert && (
        <div style={{
          marginTop: '.6rem', padding: '.75rem .9rem', borderRadius: 6,
          background: 'var(--g-50)',
        }}>
          {erreur && (
            <p style={{
              fontSize: 'var(--fs-xs)', color: 'var(--danger)', marginBottom: '.5rem',
            }}>
              {erreur}
            </p>
          )}

          {effectif ? (
            <>
              <p style={{ fontSize: 'var(--fs-sm)', marginBottom: '.5rem' }}>
                Dispenser cette écriture de facture ?
              </p>
              <p className="muted" style={{
                fontSize: 'var(--fs-xs)', lineHeight: 1.5, marginBottom: '.6rem',
              }}>
                {aDesJustificatifs
                  ? 'Des pièces sont déjà jointes : la dispense ne les supprime pas.'
                  : 'La charge cessera d’être signalée comme incomplète. Le motif restera au journal.'}
              </p>
              <input type="text" value={nouveauMotif}
                onChange={(e) => setNouveauMotif(e.target.value)}
                placeholder="Commission bancaire, ticket illisible, achat de faible montant…"
                style={{ width: '100%' }} />
              <div style={{ display: 'flex', gap: '.5rem', marginTop: '.6rem' }}>
                <button onClick={() => decider(false)}
                  disabled={enCours || !nouveauMotif.trim()}
                  className="btn btn--ghost" style={petitBouton}>
                  Dispenser
                </button>
                {manuelle && (
                  <button onClick={reprendreRegle} disabled={enCours}
                    className="btn btn--ghost" style={petitBouton}>
                    Revenir à la règle
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 'var(--fs-sm)', marginBottom: '.5rem' }}>
                Exiger une facture pour cette écriture ?
              </p>
              <p className="muted" style={{
                fontSize: 'var(--fs-xs)', lineHeight: 1.5, marginBottom: '.6rem',
              }}>
                Elle sera signalée tant qu’aucune pièce ne sera jointe. Réclamer
                une facture ne demande pas de motif : c’est toujours défendable.
              </p>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button onClick={() => decider(true)} disabled={enCours}
                  className="btn btn--ghost" style={petitBouton}>
                  Exiger
                </button>
                {manuelle && (
                  <button onClick={reprendreRegle} disabled={enCours}
                    className="btn btn--ghost" style={petitBouton}>
                    Revenir à la règle
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const boutonDiscret: React.CSSProperties = {
  border: 0, background: 'none', padding: '.1rem .3rem', cursor: 'pointer',
  fontSize: '.68rem', color: 'var(--g-500)', textDecoration: 'underline',
  flexShrink: 0,
};
const petitBouton: React.CSSProperties = {
  minHeight: 28, padding: '.15rem .7rem', fontSize: '.72rem',
};

const lienFichier: React.CSSProperties = {
  border: 0, background: 'none', padding: 0, cursor: 'pointer',
  textAlign: 'left', fontSize: 'var(--fs-sm)', fontWeight: 500,
  color: 'var(--navy)', flex: 1, minWidth: 0,
};
const boutonRetirer: React.CSSProperties = {
  border: 0, background: 'none', padding: '.1rem .3rem', cursor: 'pointer',
  fontSize: '.68rem', color: 'var(--g-500)', flexShrink: 0,
};
