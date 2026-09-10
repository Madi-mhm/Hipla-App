'use client';

/**
 * CATÉGORIES DE DÉPENSES — le plan comptable, modifiable.
 *
 * Chaque catégorie porte le compte, le taux de TVA proposé, la part de
 * TVA récupérable et la nature bien / service, qui décide quand la TVA
 * devient déductible. Changer une catégorie ne modifie pas les pièces
 * déjà saisies : chacune a copié son compte au moment de la saisie.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Alerte from '@/components/Alerte';
import { TAUX_TVA } from '@/lib/comptabilite';
import type { Categorie } from '@/lib/types';
import f from '@/styles/formulaire.module.css';

type Saisie = {
  libelle: string; groupe: string; compte: string;
  type_operation: 'bien' | 'service'; taux_tva_defaut: string; taux_deductibilite: string;
  type: 'charge' | 'immobilisation'; duree_amortissement: string;
  justificatif_requis: boolean; bloque: boolean; avertissement: string; ordre: string;
};

const VIDE: Saisie = {
  libelle: '', groupe: '', compte: '', type_operation: 'service', taux_tva_defaut: '20',
  taux_deductibilite: '100', type: 'charge', duree_amortissement: '', justificatif_requis: true,
  bloque: false, avertissement: '', ordre: '100',
};

function depuis(c: Categorie): Saisie {
  return {
    libelle: c.libelle, groupe: c.groupe, compte: c.compte,
    type_operation: c.type_operation ?? 'service',
    taux_tva_defaut: String(c.taux_tva_defaut), taux_deductibilite: String(c.taux_deductibilite),
    type: c.type, duree_amortissement: c.duree_amortissement ? String(c.duree_amortissement) : '',
    justificatif_requis: c.justificatif_requis ?? true, bloque: c.bloque,
    avertissement: c.avertissement ?? '', ordre: String(c.ordre),
  };
}

export default function GestionCategories({ categories, usage, peutGerer }: {
  categories: Categorie[]; usage: Record<string, number>; peutGerer: boolean;
}) {
  const router = useRouter();
  const [edite, setEdite] = useState<Categorie | 'nouvelle' | null>(null);
  const [s, setS] = useState<Saisie>(VIDE);
  const [archivees, setArchivees] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const groupes = useMemo(() => Array.from(new Set(categories.map((c) => c.groupe))), [categories]);
  const visibles = categories.filter((c) => archivees || c.actif);

  const champ = (k: keyof Saisie) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setS((v) => ({ ...v, [k]: e.target.value }));

  function ouvrir(c: Categorie | 'nouvelle') {
    setEdite(c); setS(c === 'nouvelle' ? VIDE : depuis(c)); setErreur(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!edite) return;
    if (!/^\d{3,8}$/.test(s.compte.trim())) {
      setErreur('Le compte doit être un numéro du plan comptable (3 à 8 chiffres).');
      return;
    }
    setEnCours(true); setErreur(null);

    const duree = parseInt(s.duree_amortissement, 10);
    const donnees = {
      libelle: s.libelle.trim(), groupe: s.groupe.trim(), compte: s.compte.trim(),
      type_operation: s.type_operation,
      taux_tva_defaut: Number(s.taux_tva_defaut), taux_deductibilite: Number(s.taux_deductibilite),
      type: s.type,
      duree_amortissement: s.type === 'immobilisation' && !Number.isNaN(duree) ? duree : null,
      justificatif_requis: s.justificatif_requis, bloque: s.bloque,
      avertissement: s.avertissement.trim() || null,
      ordre: parseInt(s.ordre, 10) || 100,
    };

    const supabase = createClient();
    const res = edite === 'nouvelle'
      ? await supabase.from('categories').insert(donnees).select('id').single()
      : await supabase.from('categories').update(donnees).eq('id', edite.id).select('id').single();
    setEnCours(false);
    if (res.error) { setErreur(`Enregistrement impossible : ${res.error.message}`); return; }

    await supabase.rpc('journaliser', {
      p_action: edite === 'nouvelle' ? 'creation' : 'modification',
      p_table: 'categories', p_id: res.data?.id ?? null,
      p_details: { resume: `${donnees.libelle} (${donnees.compte})` },
    });
    setSucces(`Catégorie « ${donnees.libelle} » enregistrée.`);
    setEdite(null);
    router.refresh();
  }

  async function basculer(c: Categorie) {
    const supabase = createClient();
    const { error } = await supabase.from('categories').update({ actif: !c.actif }).eq('id', c.id);
    if (error) { setErreur(error.message); return; }
    await supabase.rpc('journaliser', {
      p_action: 'modification', p_table: 'categories', p_id: c.id,
      p_details: { resume: `${c.libelle} ${c.actif ? 'archivée' : 'réactivée'}` },
    });
    router.refresh();
  }

  async function supprimer(c: Categorie) {
    if (!window.confirm(`Supprimer « ${c.libelle} » ? Aucune pièce ne l'utilise.`)) return;
    const supabase = createClient();
    const { error } = await supabase.from('categories').delete().eq('id', c.id);
    if (error) { setErreur(`Suppression impossible (${error.message}). Archivez-la plutôt.`); return; }
    await supabase.rpc('journaliser', {
      p_action: 'suppression', p_table: 'categories', p_id: c.id, p_details: { resume: c.libelle },
    });
    router.refresh();
  }

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className={f.barre}>
          <label className="muted" style={{ fontSize: 'var(--fs-sm)', display: 'flex', gap: '.4rem', alignItems: 'center' }}>
            <input type="checkbox" checked={archivees} onChange={(e) => setArchivees(e.target.checked)} />
            Afficher les catégories archivées
          </label>
          {peutGerer && !edite && (
            <button onClick={() => ouvrir('nouvelle')} className="btn btn--gold">+ Nouvelle catégorie</button>
          )}
        </div>

        {edite && (
          <form onSubmit={enregistrer} className={f.formulaire}>
            <label><span>Libellé *</span>
              <input value={s.libelle} onChange={champ('libelle')} required autoFocus /></label>
            <label><span>Groupe *</span>
              <input value={s.groupe} onChange={champ('groupe')} list="groupes-categories" required /></label>
            <datalist id="groupes-categories">{groupes.map((g) => <option key={g} value={g} />)}</datalist>
            <label><span>Compte *</span>
              <input value={s.compte} onChange={champ('compte')} required inputMode="numeric" placeholder="6063" /></label>

            <label><span>Nature</span>
              <select value={s.type_operation} onChange={champ('type_operation')}>
                <option value="service">Service — TVA déductible au paiement</option>
                <option value="bien">Bien — TVA déductible à la facture</option>
              </select></label>
            <label><span>TVA proposée</span>
              <select value={s.taux_tva_defaut} onChange={champ('taux_tva_defaut')}>
                {TAUX_TVA.map((t) => <option key={t.valeur} value={t.valeur}>{t.libelle}</option>)}
              </select></label>
            <label><span>TVA récupérable</span>
              <select value={s.taux_deductibilite} onChange={champ('taux_deductibilite')}>
                <option value="100">100 %</option>
                <option value="80">80 % (carburant d&apos;un véhicule de tourisme)</option>
                <option value="0">0 % (non récupérable)</option>
              </select></label>

            <label><span>Traitement</span>
              <select value={s.type} onChange={champ('type')}>
                <option value="charge">Charge de l&apos;exercice</option>
                <option value="immobilisation">Immobilisation amortie</option>
              </select></label>
            {s.type === 'immobilisation' && (
              <label><span>Durée d&apos;amortissement (ans)</span>
                <input type="number" min="1" max="50" value={s.duree_amortissement}
                  onChange={champ('duree_amortissement')} /></label>
            )}
            <label><span>Ordre d&apos;affichage</span>
              <input type="number" value={s.ordre} onChange={champ('ordre')} /></label>

            <label className={f.case}>
              <input type="checkbox" checked={s.justificatif_requis}
                onChange={(e) => setS((v) => ({ ...v, justificatif_requis: e.target.checked }))} />
              Facture exigée
            </label>
            <label className={f.case}>
              <input type="checkbox" checked={s.bloque}
                onChange={(e) => setS((v) => ({ ...v, bloque: e.target.checked }))} />
              Saisie interdite (ex. amendes)
            </label>

            <label className={f.pleine}><span>Avertissement affiché à la saisie</span>
              <textarea value={s.avertissement} onChange={champ('avertissement')} /></label>

            <div className={`${f.actions} ${f.pleine}`}>
              <button type="submit" className="btn btn--gold" disabled={enCours}>
                {enCours ? 'Enregistrement…' : edite === 'nouvelle' ? 'Créer' : 'Enregistrer'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setEdite(null)}>Annuler</button>
              {edite !== 'nouvelle' && (
                <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                  Les pièces déjà saisies gardent leur compte ; seules les prochaines changent.
                </span>
              )}
            </div>
          </form>
        )}
      </div>

      {groupes.map((g) => {
        const lignes = visibles.filter((c) => c.groupe === g);
        if (lignes.length === 0) return null;
        return (
          <div className="card" key={g} style={{ marginBottom: '1rem' }}>
            <p className="card__title">{g}</p>
            <div className="table-scroll">
              <table style={{ minWidth: 640, fontSize: 'var(--fs-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                    <th className={f.th}>Libellé</th>
                    <th className={f.th}>Compte</th>
                    <th className={f.th} style={{ textAlign: 'right' }}>TVA</th>
                    <th className={f.th} style={{ textAlign: 'right' }}>Récup.</th>
                    <th className={f.th} style={{ textAlign: 'right' }}>Pièces</th>
                    {peutGerer && <th className={f.th}></th>}
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((c) => (
                    <tr key={c.id} className={`${f.ligne} ${c.actif ? '' : f.archive}`}>
                      <td className={f.td}>
                        {c.libelle}
                        {c.bloque && <span className="badge badge--danger" style={{ marginLeft: '.4rem' }}>bloquée</span>}
                        <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                          {c.type === 'immobilisation' ? `Immobilisation · ${c.duree_amortissement ?? '?'} ans` : 'Charge'}
                          {' · '}{c.type_operation === 'bien' ? 'bien' : 'service'}
                        </span>
                      </td>
                      <td className={`${f.td} mono`}>{c.compte}</td>
                      <td className={f.td} style={{ textAlign: 'right' }}>{c.taux_tva_defaut} %</td>
                      <td className={f.td} style={{ textAlign: 'right' }}>{c.taux_deductibilite} %</td>
                      <td className={f.td} style={{ textAlign: 'right' }}>{usage[c.id] ?? 0}</td>
                      {peutGerer && (
                        <td className={f.td} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button onClick={() => ouvrir(c)} className="btn btn--ghost btn--sm">Modifier</button>{' '}
                          <button onClick={() => basculer(c)} className="btn btn--ghost btn--sm">
                            {c.actif ? 'Archiver' : 'Réactiver'}
                          </button>{' '}
                          {!usage[c.id] && (
                            <button onClick={() => supprimer(c)} className="btn btn--danger btn--sm">Supprimer</button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}
