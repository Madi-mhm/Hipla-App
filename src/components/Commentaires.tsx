'use client';

/**
 * Fil de commentaires rattaché à une écriture.
 *
 * Le comptable signale, le propriétaire résout. Cette séparation est
 * volontaire : celui qui relève une anomalie n'est pas celui qui la
 * clôt, et la correction reste tracée au nom de son auteur.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { date } from '@/lib/format';
import {
  LIBELLE_TYPE_COMMENTAIRE, CLASSE_TYPE_COMMENTAIRE, type Commentaire,
} from '@/lib/types';
import Dialogue from '@/components/Dialogue';
import Alerte from '@/components/Alerte';
import styles from './Commentaires.module.css';

type Props = {
  commentaires: Commentaire[];
  tableCible: 'depenses' | 'frais_creation' | 'deplacements';
  idCible: string;
  numeroPiece: string | null;
  utilisateurId: string;
  peutCommenter: boolean;
  peutResoudre: boolean;
};

export default function Commentaires({
  commentaires, tableCible, idCible, numeroPiece,
  utilisateurId, peutCommenter, peutResoudre,
}: Props) {
  const router = useRouter();
  const [contenu, setContenu] = useState('');
  const [type, setType] = useState('remarque');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aResoudre, setAResoudre] = useState<Commentaire | null>(null);

  const ouverts = commentaires.filter((c) => c.statut === 'ouvert');

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    if (!contenu.trim()) return;
    setEnCours(true);

    const supabase = createClient();
    const { error } = await supabase.from('commentaires').insert({
      table_cible: tableCible,
      id_cible: idCible,
      numero_piece: numeroPiece,
      contenu: contenu.trim(),
      type,
      cree_par: utilisateurId,
    });

    if (error) {
      setErreur(`Enregistrement impossible : ${error.message}`);
      setEnCours(false);
      return;
    }

    await supabase.rpc('journaliser', {
      p_action: 'creation', p_table: 'commentaires', p_id: idCible,
      p_details: { type, piece: numeroPiece, resume: contenu.trim().slice(0, 80) },
    });
    setContenu('');
    setErreur(null);
    setEnCours(false);
    router.refresh();
  }

  async function resoudre(c: Commentaire, reponse: string) {
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();
    const { error } = await supabase.from('commentaires').update({
      statut: 'resolu',
      resolu_par: utilisateurId,
      resolu_le: new Date().toISOString(),
      reponse: reponse.trim() || null,
    }).eq('id', c.id);

    if (error) {
      setErreur(`Résolution impossible : ${error.message}`);
      setEnCours(false);
      return;
    }

    await supabase.rpc('journaliser', {
      p_action: 'modification', p_table: 'commentaires', p_id: c.id,
      p_details: { resume: 'Signalement résolu', reponse: reponse || null },
    });
    setEnCours(false);
    router.refresh();
  }

  if (!peutCommenter && commentaires.length === 0) return null;

  return (
    <div className="card">
      <p className="card__title">
        Signalements{ouverts.length > 0 && ` — ${ouverts.length} ouvert${ouverts.length > 1 ? 's' : ''}`}
      </p>

      {commentaires.length === 0 ? (
        <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginBottom: '.9rem' }}>
          Aucun signalement sur cette écriture.
        </p>
      ) : (
        <div className={styles.fil}>
          {commentaires.map((c) => (
            <div key={c.id} className={c.statut === 'resolu' ? styles.resolu : styles.ouvert}>
              <div className={styles.entete}>
                <span className={`badge ${CLASSE_TYPE_COMMENTAIRE[c.type]}`}>
                  {LIBELLE_TYPE_COMMENTAIRE[c.type]}
                </span>
                <span className={styles.meta}>
                  {c.profils?.nom_complet ?? '—'} · {date(c.cree_le)}
                </span>
                {c.statut === 'resolu' ? (
                  <span className="badge badge--success">Résolu</span>
                ) : peutResoudre && (
                  <button onClick={() => setAResoudre(c)} disabled={enCours}
                    className="btn btn--ghost"
                    style={{ minHeight: 26, padding: '.1rem .6rem', fontSize: '.7rem' }}>
                    Résoudre
                  </button>
                )}
              </div>
              <p className={styles.texte}>{c.contenu}</p>
              {c.reponse && <p className={styles.reponse}>Réponse : {c.reponse}</p>}
            </div>
          ))}
        </div>
      )}

      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}

      <Dialogue
        ouvert={aResoudre !== null}
        titre="Résoudre ce signalement"
        description={aResoudre?.contenu}
        champ="Correction apportée"
        placeholder="Justificatif ajouté, catégorie corrigée…"
        libelleValider="Marquer résolu"
        onValider={(reponse) => {
          const c = aResoudre;
          setAResoudre(null);
          if (c) resoudre(c, reponse);
        }}
        onAnnuler={() => setAResoudre(null)}
      />

      {peutCommenter && (
        <form onSubmit={ajouter} className={styles.formulaire}>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="remarque">Remarque</option>
            <option value="anomalie">Anomalie</option>
            <option value="question">Question</option>
            <option value="demande_piece">Pièce demandée</option>
          </select>
          <input
            type="text"
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            placeholder="Signaler un point sur cette écriture…"
          />
          <button type="submit" className="btn btn--ghost" disabled={enCours || !contenu.trim()}>
            Ajouter
          </button>
        </form>
      )}
    </div>
  );
}
