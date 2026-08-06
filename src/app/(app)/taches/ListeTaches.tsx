'use client';

/**
 * Gestion des tâches.
 *
 * Une tâche peut être assignée à quelqu'un d'autre : c'est le mécanisme
 * qui permet au comptable de demander une pièce ou une correction sans
 * passer par un échange de courriels. Une tâche assignée remonte dans
 * le centre d'action du destinataire.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { date, daysUntil } from '@/lib/format';
import {
  LIBELLE_STATUT_TACHE, CLASSE_STATUT_TACHE, LIBELLE_PRIORITE, type Tache,
} from '@/lib/types';
import Alerte from '@/components/Alerte';
import styles from './taches.module.css';

type Profil = { id: string; nom_complet: string; role: string };

export default function ListeTaches({
  taches, profils, utilisateurId, peutCreer,
}: {
  taches: Tache[]; profils: Profil[]; utilisateurId: string; peutCreer: boolean;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [echeance, setEcheance] = useState('');
  const [priorite, setPriorite] = useState('normale');
  const [assignee, setAssignee] = useState('');
  const [recurrence, setRecurrence] = useState('');
  const [filtre, setFiltre] = useState('actives');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const visibles = taches.filter((t) => {
    if (filtre === 'actives') return t.statut === 'a_faire' || t.statut === 'en_cours';
    if (filtre === 'miennes') return t.assignee_a === utilisateurId && t.statut !== 'faite';
    if (filtre === 'faites') return t.statut === 'faite';
    return true;
  });

  const enRetard = taches.filter(
    (t) => t.echeance && t.statut !== 'faite' && t.statut !== 'annulee' && daysUntil(t.echeance) < 0
  ).length;

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    if (!titre.trim()) return;
    setEnCours(true);

    const supabase = createClient();
    const { data, error } = await supabase.from('taches').insert({
      titre: titre.trim(),
      description: description.trim() || null,
      echeance: echeance || null,
      priorite,
      assignee_a: assignee || null,
      recurrence: recurrence || null,
      cree_par: utilisateurId,
    }).select('id').single();

    if (error) {
      setErreur(`Création impossible : ${error.message}`);
      setEnCours(false);
      return;
    }

    {
      await supabase.rpc('journaliser', {
        p_action: 'creation', p_table: 'taches', p_id: data?.id ?? null,
        p_details: { resume: titre.trim(), echeance: echeance || null },
      });
      setTitre(''); setDescription(''); setEcheance('');
      setPriorite('normale'); setAssignee(''); setRecurrence('');
      setOuvert(false);
      router.refresh();
    }
    setEnCours(false);
  }

  async function changerStatut(t: Tache, statut: Tache['statut']) {
    const supabase = createClient();
    const { error } = await supabase.from('taches').update({
      statut,
      faite_le: statut === 'faite' ? new Date().toISOString() : null,
    }).eq('id', t.id);

    if (error) { setErreur(`Modification impossible : ${error.message}`); return; }

    // Une tâche récurrente terminée engendre la suivante : sans cela,
    // les travaux périodiques finissent par être oubliés.
    if (statut === 'faite' && t.recurrence && t.echeance) {
      const suivante = new Date(t.echeance);
      if (t.recurrence === 'mensuelle') suivante.setMonth(suivante.getMonth() + 1);
      if (t.recurrence === 'trimestrielle') suivante.setMonth(suivante.getMonth() + 3);
      if (t.recurrence === 'annuelle') suivante.setFullYear(suivante.getFullYear() + 1);

      await supabase.from('taches').insert({
        titre: t.titre,
        description: t.description,
        echeance: suivante.toISOString().slice(0, 10),
        priorite: t.priorite,
        assignee_a: t.assignee_a,
        recurrence: t.recurrence,
        cree_par: utilisateurId,
      });
    }

    router.refresh();
  }

  return (
    <>
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className={styles.barre}>
          <div className={styles.filtres}>
            {([
              ['actives', 'En cours'],
              ['miennes', 'Qui me sont assignées'],
              ['faites', 'Terminées'],
              ['toutes', 'Toutes'],
            ] as [string, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setFiltre(k)}
                className={filtre === k ? styles.filtreActif : styles.filtre}>
                {l}
              </button>
            ))}
          </div>
          {peutCreer && (
            <button onClick={() => setOuvert(!ouvert)} className="btn btn--gold">
              {ouvert ? 'Annuler' : '+ Nouvelle tâche'}
            </button>
          )}
        </div>

        {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}

        {enRetard > 0 && (
          <p className={styles.alerte}>
            {enRetard} tâche{enRetard > 1 ? 's' : ''} en retard.
          </p>
        )}

        {ouvert && (
          <form onSubmit={creer} className={styles.formulaire}>
            <label className={styles.pleine}><span>Intitulé *</span>
              <input type="text" value={titre} onChange={(e) => setTitre(e.target.value)}
                required placeholder="Rapprocher les relevés de juillet" autoFocus /></label>
            <label className={styles.pleine}><span>Détail</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                rows={2} placeholder="Précisions utiles…" /></label>
            <label><span>Échéance</span>
              <input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} /></label>
            <label><span>Priorité</span>
              <select value={priorite} onChange={(e) => setPriorite(e.target.value)}>
                <option value="basse">Basse</option>
                <option value="normale">Normale</option>
                <option value="haute">Haute</option>
              </select></label>
            <label><span>Assignée à</span>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Personne</option>
                {profils.map((p) => (
                  <option key={p.id} value={p.id}>{p.nom_complet}</option>
                ))}
              </select></label>
            <label><span>Récurrence</span>
              <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
                <option value="">Aucune</option>
                <option value="mensuelle">Mensuelle</option>
                <option value="trimestrielle">Trimestrielle</option>
                <option value="annuelle">Annuelle</option>
              </select></label>
            <div className={styles.pleine}>
              <button type="submit" className="btn btn--gold" disabled={enCours || !titre.trim()}>
                {enCours ? 'Création…' : 'Créer la tâche'}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card">
        {visibles.length === 0 ? (
          <div className="etat-vide">
            <p>Aucune tâche dans cette vue.</p>
            <p className="muted">
              Les tâches servent à suivre les travaux périodiques et à demander
              une pièce ou une correction sans passer par un courriel.
            </p>
          </div>
        ) : (
          <div className={styles.liste}>
            {visibles.map((t) => {
              const j = t.echeance ? daysUntil(t.echeance) : null;
              const retard = j !== null && j < 0 && t.statut !== 'faite';

              return (
                <div key={t.id} className={t.statut === 'faite' ? styles.tacheFaite : styles.tache}>
                  <input
                    type="checkbox"
                    checked={t.statut === 'faite'}
                    onChange={(e) => changerStatut(t, e.target.checked ? 'faite' : 'a_faire')}
                    className={styles.case}
                    aria-label={`Marquer « ${t.titre} » comme faite`}
                  />

                  <div className={styles.corps}>
                    <p className={styles.titre}>{t.titre}</p>
                    {t.description && <p className={styles.description}>{t.description}</p>}
                    <p className={styles.meta}>
                      {t.auteur?.nom_complet}
                      {t.assigne && ` → ${t.assigne.nom_complet}`}
                      {t.recurrence && ` · ${t.recurrence}`}
                    </p>
                  </div>

                  <div className={styles.cote}>
                    {t.priorite === 'haute' && (
                      <span className="badge badge--danger">{LIBELLE_PRIORITE.haute}</span>
                    )}
                    {t.echeance && (
                      <span className={retard ? styles.retard : styles.echeance}>
                        {date(t.echeance)}
                        {j !== null && t.statut !== 'faite' && (
                          <span> {j < 0 ? `(+${Math.abs(j)}j)` : `(J-${j})`}</span>
                        )}
                      </span>
                    )}
                    <span className={`badge ${CLASSE_STATUT_TACHE[t.statut]}`}>
                      {LIBELLE_STATUT_TACHE[t.statut]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
