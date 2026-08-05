'use client';

/**
 * Détail d'une dépense : consultation, modification, justificatifs, validation.
 *
 * Le propriétaire peut tout modifier, y compris une écriture déjà validée.
 * Toute modification est journalisée : c'est la trace qui rend la correction
 * acceptable en comptabilité, pas l'interdiction de corriger.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { compresser, poids } from '@/lib/compression';
import {
  TAUX_TVA, depuisHT, depuisTTC, tvaRecuperable, montantsCoherents,
} from '@/lib/comptabilite';
import { money, date, dateLong } from '@/lib/format';
import { LIBELLE_STATUT, CLASSE_STATUT, type Categorie, type Depense } from '@/lib/types';
import styles from '../nouvelle/formulaire.module.css';

type Fichier = {
  id: string;
  chemin: string;
  nom_original: string;
  type_mime: string;
  taille_octets: number;
  url: string | null;
};

type Props = {
  depense: Depense;
  categories: Categorie[];
  fichiers: Fichier[];
  peutModifier: boolean;
  peutValider: boolean;
  peutSupprimer: boolean;
};

export default function DetailDepense({
  depense, categories, fichiers, peutModifier, peutValider, peutSupprimer,
}: Props) {
  const router = useRouter();
  const [edition, setEdition] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const [dateDepense, setDateDepense] = useState(depense.date_depense);
  const [fournisseur, setFournisseur] = useState(depense.fournisseur);
  const [libelle, setLibelle] = useState(depense.libelle ?? '');
  const [categorieId, setCategorieId] = useState(depense.categorie_id);
  const [saisieEn, setSaisieEn] = useState<'ht' | 'ttc'>('ttc');
  const [montant, setMontant] = useState(String(depense.montant_ttc).replace('.', ','));
  const [tauxTva, setTauxTva] = useState(Number(depense.taux_tva));
  const [notes, setNotes] = useState(depense.notes ?? '');
  const [nouveauxFichiers, setNouveauxFichiers] = useState<File[]>([]);

  const categorie = categories.find((c) => c.id === categorieId) ?? null;

  const montants = useMemo(() => {
    const v = parseFloat(montant.replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) return null;
    return saisieEn === 'ht' ? depuisHT(v, tauxTva) : depuisTTC(v, tauxTva);
  }, [montant, tauxTva, saisieEn]);

  const tvaRec = montants && categorie
    ? tvaRecuperable(montants.tva, categorie.taux_deductibilite) : 0;

  async function enregistrer() {
    setErreur(null);
    if (!categorie) { setErreur('Choisissez une catégorie.'); return; }
    if (categorie.bloque) { setErreur(categorie.avertissement ?? 'Catégorie bloquée.'); return; }
    if (!montants) { setErreur('Montant invalide.'); return; }
    if (!montantsCoherents(montants.ht, montants.tva, montants.ttc)) {
      setErreur('Incohérence entre HT, TVA et TTC.'); return;
    }

    setEnCours(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('depenses').update({
      date_depense: dateDepense,
      fournisseur: fournisseur.trim(),
      libelle: libelle.trim() || null,
      categorie_id: categorie.id,
      montant_ht: montants.ht,
      taux_tva: tauxTva,
      montant_tva: montants.tva,
      montant_ttc: montants.ttc,
      taux_deductibilite: categorie.taux_deductibilite,
      compte: categorie.compte,
      tva_deductible: tvaRec,
      notes: notes.trim() || null,
    }).eq('id', depense.id);

    if (error) { setErreur(`Modification impossible : ${error.message}`); setEnCours(false); return; }

    for (const f of nouveauxFichiers) {
      const chemin = `${depense.id}/${Date.now()}-${f.name}`;
      const { error: eUp } = await supabase.storage.from('justificatifs').upload(chemin, f);
      if (eUp) continue;
      await supabase.from('justificatifs').insert({
        depense_id: depense.id, chemin, nom_original: f.name,
        type_mime: f.type, taille_octets: f.size, cree_par: user?.id ?? null,
      });
    }

    await supabase.rpc('journaliser', {
      p_action: 'modification', p_table: 'depenses', p_id: depense.id,
      p_details: { fournisseur, montant_ttc: montants.ttc },
    });

    setEdition(false);
    setNouveauxFichiers([]);
    setEnCours(false);
    router.refresh();
  }

  async function statuer(statut: 'validee' | 'rejetee') {
    let motif: string | null = null;
    if (statut === 'rejetee') {
      motif = window.prompt('Motif du rejet :');
      if (motif === null) return;
    }
    setEnCours(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('depenses').update({
      statut, valide_par: user?.id ?? null,
      valide_le: new Date().toISOString(), motif_rejet: motif,
    }).eq('id', depense.id);
    if (error) { setErreur(error.message); setEnCours(false); return; }
    await supabase.rpc('journaliser', {
      p_action: statut === 'validee' ? 'validation' : 'rejet',
      p_table: 'depenses', p_id: depense.id, p_details: motif ? { motif } : null,
    });
    setEnCours(false);
    router.refresh();
  }

  async function supprimer() {
    if (!window.confirm('Supprimer définitivement cette dépense et ses justificatifs ?')) return;
    setEnCours(true);
    const supabase = createClient();
    await supabase.rpc('journaliser', {
      p_action: 'suppression', p_table: 'depenses', p_id: depense.id,
      p_details: { fournisseur: depense.fournisseur, montant_ttc: depense.montant_ttc },
    });
    const { error } = await supabase.from('depenses').delete().eq('id', depense.id);
    if (error) { setErreur(error.message); setEnCours(false); return; }
    router.push('/depenses');
    router.refresh();
  }

  async function ajouterFichiers(liste: FileList | null) {
    if (!liste) return;
    const out: File[] = [];
    for (const f of Array.from(liste)) {
      const r = await compresser(f);
      out.push(r.fichier);
    }
    setNouveauxFichiers((p) => [...p, ...out]);
  }

  const groupes = Array.from(new Set(categories.map((c) => c.groupe)));

  return (
    <div className={styles.form}>
      {/* ---- Bandeau statut ---- */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <span className={`badge ${CLASSE_STATUT[depense.statut]}`}>
          {LIBELLE_STATUT[depense.statut]}
        </span>
        <span className="muted" style={{ fontSize: 'var(--fs-sm)', flex: 1, minWidth: 180 }}>
          Saisie par {depense.profils?.nom_complet ?? '—'} le {date(depense.cree_le)}
          {depense.valide_le && ` · traitée le ${date(depense.valide_le)}`}
        </span>

        {peutValider && depense.statut === 'en_attente' && (
          <span style={{ display: 'flex', gap: '.4rem' }}>
            <button onClick={() => statuer('validee')} disabled={enCours}
              className="btn btn--ghost"
              style={{ minHeight: 34, padding: '.3rem .8rem', fontSize: 'var(--fs-xs)', color: 'var(--success)', borderColor: 'var(--success)' }}>
              Valider
            </button>
            <button onClick={() => statuer('rejetee')} disabled={enCours}
              className="btn btn--ghost"
              style={{ minHeight: 34, padding: '.3rem .8rem', fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>
              Rejeter
            </button>
          </span>
        )}
      </div>

      {depense.motif_rejet && (
        <p className={styles.alerteRouge}>Motif du rejet : {depense.motif_rejet}</p>
      )}

      {/* ---- Contenu ---- */}
      {edition ? (
        <>
          <div className="card">
            <p className="card__title">Modifier</p>
            <div className={styles.grille}>
              <label className={styles.champ}>
                <span>Date</span>
                <input type="date" value={dateDepense} onChange={(e) => setDateDepense(e.target.value)} />
              </label>
              <label className={styles.champ}>
                <span>Fournisseur</span>
                <input type="text" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} />
              </label>
              <label className={`${styles.champ} ${styles.pleine}`}>
                <span>Description</span>
                <input type="text" value={libelle} onChange={(e) => setLibelle(e.target.value)} />
              </label>
              <label className={`${styles.champ} ${styles.pleine}`}>
                <span>Catégorie</span>
                <select value={categorieId} onChange={(e) => {
                  setCategorieId(e.target.value);
                  const c = categories.find((x) => x.id === e.target.value);
                  if (c) setTauxTva(Number(c.taux_tva_defaut));
                }}>
                  {groupes.map((g) => (
                    <optgroup key={g} label={g}>
                      {categories.filter((c) => c.groupe === g).map((c) => (
                        <option key={c.id} value={c.id} disabled={c.bloque}>{c.libelle}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.bascule} style={{ marginTop: '1rem' }}>
              <button type="button" onClick={() => setSaisieEn('ttc')} className={saisieEn === 'ttc' ? styles.basculeActif : ''}>TTC</button>
              <button type="button" onClick={() => setSaisieEn('ht')} className={saisieEn === 'ht' ? styles.basculeActif : ''}>HT</button>
            </div>

            <div className={styles.grille}>
              <label className={styles.champ}>
                <span>Montant {saisieEn.toUpperCase()}</span>
                <input type="text" inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} />
              </label>
              <label className={styles.champ}>
                <span>Taux de TVA</span>
                <select value={tauxTva} onChange={(e) => setTauxTva(Number(e.target.value))}>
                  {TAUX_TVA.map((t) => <option key={t.valeur} value={t.valeur}>{t.libelle}</option>)}
                </select>
              </label>
            </div>

            {montants && (
              <div className={styles.recap}>
                <div><span>HT</span><strong className="amount">{money(montants.ht)}</strong></div>
                <div><span>TVA</span><strong className="amount">{money(montants.tva)}</strong></div>
                <div><span>TTC</span><strong className="amount">{money(montants.ttc)}</strong></div>
                {categorie && (
                  <div className={styles.recapDeduct}>
                    <span>TVA récupérable ({categorie.taux_deductibilite} %)</span>
                    <strong className="amount">{money(tvaRec)}</strong>
                  </div>
                )}
              </div>
            )}

            <label className={styles.champ} style={{ marginTop: '1rem' }}>
              <span>Notes</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </label>

            <label className={styles.champ} style={{ marginTop: '1rem' }}>
              <span>Ajouter un justificatif</span>
              <input type="file" accept="image/*,application/pdf" multiple
                onChange={(e) => ajouterFichiers(e.target.files)} className={styles.fichier} />
            </label>
            {nouveauxFichiers.length > 0 && (
              <ul className={styles.listeFichiers}>
                {nouveauxFichiers.map((f, i) => (
                  <li key={i}><span>{f.name}</span><span className="muted">{poids(f.size)}</span></li>
                ))}
              </ul>
            )}
          </div>

          {erreur && <p className={styles.alerteRouge}>{erreur}</p>}

          <div className={styles.actions}>
            <button onClick={enregistrer} disabled={enCours} className="btn btn--gold">
              {enCours ? 'Enregistrement…' : 'Enregistrer les modifications'}
            </button>
            <button onClick={() => { setEdition(false); setErreur(null); }} className="btn btn--ghost">
              Annuler
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="card">
            <p className="card__title">Écriture</p>
            <div className="table-scroll">
              <table style={{ minWidth: 380, fontSize: 'var(--fs-sm)' }}>
                <tbody>
                  <Ligne k="Date" v={dateLong(depense.date_depense)} />
                  <Ligne k="Fournisseur" v={depense.fournisseur} />
                  {depense.libelle && <Ligne k="Description" v={depense.libelle} />}
                  <Ligne k="Catégorie" v={`${depense.categories?.libelle ?? '—'} (${depense.compte})`} />
                  <Ligne k="Montant HT" v={money(Number(depense.montant_ht))} />
                  <Ligne k={`TVA ${depense.taux_tva} %`} v={money(Number(depense.montant_tva))} />
                  <Ligne k="Montant TTC" v={money(Number(depense.montant_ttc))} gras />
                  <Ligne
                    k={`TVA récupérable (${depense.taux_deductibilite} %)`}
                    v={money(Number(depense.tva_deductible))}
                  />
                  {depense.moyen_paiement && <Ligne k="Paiement" v={depense.moyen_paiement} />}
                  {depense.paye_par && <Ligne k="Payé par" v={depense.paye_par} />}
                  {depense.notes && <Ligne k="Notes" v={depense.notes} />}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <p className="card__title">Justificatifs</p>
            {fichiers.length === 0 ? (
              <p className={styles.alerteOrange}>
                Aucun justificatif. Sans pièce, la charge n'est pas déductible et
                la TVA n'est pas récupérable.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: '.9rem' }}>
                {fichiers.map((f) => (
                  <div key={f.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem', marginBottom: '.45rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 500, flex: 1, minWidth: 140 }}>
                        {f.nom_original}
                      </span>
                      <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{poids(f.taille_octets)}</span>
                      {f.url && (
                        <a href={f.url} target="_blank" rel="noopener" className="btn btn--ghost"
                          style={{ minHeight: 30, padding: '.2rem .7rem', fontSize: 'var(--fs-xs)' }}>
                          Ouvrir
                        </a>
                      )}
                    </div>
                    {f.url && f.type_mime.startsWith('image/') && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={f.url} alt={f.nom_original}
                        style={{ maxWidth: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--g-200)' }} />
                    )}
                    {f.url && f.type_mime === 'application/pdf' && (
                      <iframe src={f.url} title={f.nom_original}
                        style={{ width: '100%', height: 480, border: '1px solid var(--g-200)', borderRadius: 'var(--radius)' }} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {erreur && <p className={styles.alerteRouge}>{erreur}</p>}

          <div className={styles.actions}>
            {peutModifier && (
              <button onClick={() => setEdition(true)} className="btn btn--gold">Modifier</button>
            )}
            <button onClick={() => router.push('/depenses')} className="btn btn--ghost">
              Retour à la liste
            </button>
            {peutSupprimer && (
              <button onClick={supprimer} disabled={enCours} className="btn btn--ghost"
                style={{ color: 'var(--danger)', marginLeft: 'auto' }}>
                Supprimer
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Ligne({ k, v, gras }: { k: string; v: string; gras?: boolean }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--g-200)' }}>
      <td style={{ padding: '.55rem .3rem', color: 'var(--g-500)', width: '45%' }}>{k}</td>
      <td style={{ padding: '.55rem .3rem', fontWeight: gras ? 600 : 500 }} className="amount">{v}</td>
    </tr>
  );
}
