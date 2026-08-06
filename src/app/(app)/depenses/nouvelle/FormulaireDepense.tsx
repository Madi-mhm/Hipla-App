'use client';

/**
 * Saisie d'une dépense.
 *
 * Trois garde-fous :
 *  - les montants sont recalculés en direct et l'incohérence bloque l'envoi ;
 *  - la catégorie impose son compte et son taux de déductibilité, figés dans
 *    l'écriture pour qu'une modification ultérieure ne réécrive pas le passé ;
 *  - une catégorie bloquée (amendes) empêche l'enregistrement.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { compresser, poids } from '@/lib/compression';
import {
  TAUX_TVA, depuisHT, depuisTTC, tvaRecuperable,
  montantsCoherents, SEUIL_IMMOBILISATION,
} from '@/lib/comptabilite';
import { money } from '@/lib/format';
import type { Categorie } from '@/lib/types';
import { detailsCreation } from '@/lib/audit';
import styles from './formulaire.module.css';

type Props = { categories: Categorie[]; peutValider: boolean };

export default function FormulaireDepense({ categories, peutValider }: Props) {
  const router = useRouter();

  const [dateDepense, setDateDepense] = useState(new Date().toISOString().slice(0, 10));
  const [fournisseur, setFournisseur] = useState('');
  const [libelle, setLibelle] = useState('');
  const [categorieId, setCategorieId] = useState('');
  const [saisieEn, setSaisieEn] = useState<'ht' | 'ttc'>('ttc');
  const [montant, setMontant] = useState('');
  const [tauxTva, setTauxTva] = useState(20);
  const [moyenPaiement, setMoyenPaiement] = useState('carte');
  const [payePar, setPayePar] = useState('societe');
  const [notes, setNotes] = useState('');
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [infoCompression, setInfoCompression] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const categorie = categories.find((c) => c.id === categorieId) ?? null;

  const montants = useMemo(() => {
    const v = parseFloat(montant.replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) return null;
    return saisieEn === 'ht' ? depuisHT(v, tauxTva) : depuisTTC(v, tauxTva);
  }, [montant, tauxTva, saisieEn]);

  const tvaRec = montants && categorie
    ? tvaRecuperable(montants.tva, categorie.taux_deductibilite)
    : 0;

  const alerteImmo =
    categorie?.type === 'charge' &&
    montants !== null &&
    montants.ht > SEUIL_IMMOBILISATION;

  function choisirCategorie(id: string) {
    setCategorieId(id);
    const c = categories.find((x) => x.id === id);
    if (c) setTauxTva(Number(c.taux_tva_defaut));
  }

  async function ajouterFichiers(liste: FileList | null) {
    if (!liste) return;
    const resultats: File[] = [];
    let origine = 0, finale = 0;
    for (const f of Array.from(liste)) {
      const r = await compresser(f);
      resultats.push(r.fichier);
      origine += r.tailleOrigine;
      finale += r.tailleFinale;
    }
    setFichiers((prev) => [...prev, ...resultats]);
    setInfoCompression(
      origine === finale
        ? `${poids(finale)} — non compressé`
        : `${poids(origine)} → ${poids(finale)} (−${Math.round((1 - finale / origine) * 100)} %)`
    );
  }

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);

    if (!categorie) { setErreur('Choisissez une catégorie.'); return; }
    if (categorie.bloque) {
      setErreur(categorie.avertissement ?? 'Cette catégorie n\u2019autorise pas la saisie.');
      return;
    }
    if (!montants) { setErreur('Montant invalide.'); return; }
    if (!montantsCoherents(montants.ht, montants.tva, montants.ttc)) {
      setErreur('Incohérence entre HT, TVA et TTC.');
      return;
    }
    if (fichiers.length === 0) {
      const suite = window.confirm(
        "Aucun justificatif joint. Sans pièce, la charge n'est pas déductible et la TVA n'est pas récupérable.\n\nEnregistrer quand même ?"
      );
      if (!suite) return;
    }

    setEnCours(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErreur('Session expirée.'); setEnCours(false); return; }

    const { data: depense, error } = await supabase
      .from('depenses')
      .insert({
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
        moyen_paiement: moyenPaiement,
        paye_par: payePar,
        notes: notes.trim() || null,
        statut: peutValider ? 'validee' : 'en_attente',
        cree_par: user.id,
        valide_par: peutValider ? user.id : null,
        valide_le: peutValider ? new Date().toISOString() : null,
      })
      .select('id, numero_piece')
      .single();

    if (error || !depense) {
      setErreur(`Enregistrement impossible : ${error?.message ?? 'erreur inconnue'}`);
      setEnCours(false);
      return;
    }

    for (const f of fichiers) {
      const chemin = `${depense.id}/${Date.now()}-${f.name}`;
      const { error: eUp } = await supabase.storage
        .from('justificatifs').upload(chemin, f);
      if (eUp) continue;
      await supabase.from('justificatifs').insert({
        depense_id: depense.id,
        chemin,
        nom_original: f.name,
        type_mime: f.type,
        taille_octets: f.size,
        cree_par: user.id,
      });
    }

    await supabase.rpc('journaliser', {
      p_action: 'creation',
      p_table: 'depenses',
      p_id: depense.id,
      p_details: detailsCreation(
        {
          date_depense: dateDepense,
          fournisseur: fournisseur.trim(),
          libelle: libelle.trim() || null,
          categorie: categorie.libelle,
          compte: categorie.compte,
          montant_ht: montants.ht,
          taux_tva: tauxTva,
          montant_tva: montants.tva,
          montant_ttc: montants.ttc,
          tva_deductible: tvaRec,
          moyen_paiement: moyenPaiement,
          paye_par: payePar,
          numero_piece: depense.numero_piece,
          statut: peutValider ? 'validee' : 'en_attente',
          justificatifs: fichiers.length,
        },
        `${depense.numero_piece ?? ''} · ${fournisseur.trim()} — ${montants.ttc.toFixed(2).replace('.', ',')} € TTC`
      ),
    });

    router.push('/depenses');
    router.refresh();
  }

  const groupes = Array.from(new Set(categories.map((c) => c.groupe)));

  return (
    <form onSubmit={soumettre} className={styles.form}>
      <div className="card">
        <p className="card__title">Facture</p>

        <div className={styles.grille}>
          <label className={styles.champ}>
            <span>Date *</span>
            <input type="date" value={dateDepense} onChange={(e) => setDateDepense(e.target.value)} required />
          </label>

          <label className={styles.champ}>
            <span>Fournisseur *</span>
            <input type="text" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} required placeholder="Leclerc, Total, Orange…" />
          </label>

          <label className={`${styles.champ} ${styles.pleine}`}>
            <span>Description</span>
            <input type="text" value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Produits d'entretien, plein de gazole…" />
          </label>

          <label className={`${styles.champ} ${styles.pleine}`}>
            <span>Catégorie *</span>
            <select value={categorieId} onChange={(e) => choisirCategorie(e.target.value)} required>
              <option value="">Choisir…</option>
              {groupes.map((g) => (
                <optgroup key={g} label={g}>
                  {categories.filter((c) => c.groupe === g).map((c) => (
                    <option key={c.id} value={c.id} disabled={c.bloque}>
                      {c.libelle}{c.bloque ? ' — saisie bloquée' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>

        {categorie?.avertissement && (
          <p className={categorie.bloque ? styles.alerteRouge : styles.alerteOrange}>
            {categorie.avertissement}
          </p>
        )}
      </div>

      <div className="card">
        <p className="card__title">Montant</p>

        <div className={styles.bascule}>
          <button type="button" onClick={() => setSaisieEn('ttc')} className={saisieEn === 'ttc' ? styles.basculeActif : ''}>
            Je saisis le TTC
          </button>
          <button type="button" onClick={() => setSaisieEn('ht')} className={saisieEn === 'ht' ? styles.basculeActif : ''}>
            Je saisis le HT
          </button>
        </div>

        <div className={styles.grille}>
          <label className={styles.champ}>
            <span>Montant {saisieEn.toUpperCase()} *</span>
            <input type="text" inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} required placeholder="120,00" />
          </label>

          <label className={styles.champ}>
            <span>Taux de TVA</span>
            <select value={tauxTva} onChange={(e) => setTauxTva(Number(e.target.value))}>
              {TAUX_TVA.map((t) => (
                <option key={t.valeur} value={t.valeur}>{t.libelle}</option>
              ))}
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

        {alerteImmo && (
          <p className={styles.alerteOrange}>
            Montant supérieur à {SEUIL_IMMOBILISATION} € HT. S'il s'agit d'un bien
            durable, préférez une catégorie d'immobilisation : il sera amorti au
            lieu d'être passé en charge sur l'exercice.
          </p>
        )}

        <div className={styles.grille} style={{ marginTop: '1rem' }}>
          <label className={styles.champ}>
            <span>Moyen de paiement</span>
            <select value={moyenPaiement} onChange={(e) => setMoyenPaiement(e.target.value)}>
              <option value="carte">Carte</option>
              <option value="virement">Virement</option>
              <option value="prelevement">Prélèvement</option>
              <option value="especes">Espèces</option>
              <option value="autre">Autre</option>
            </select>
          </label>

          <label className={styles.champ}>
            <span>Payé par</span>
            <select value={payePar} onChange={(e) => setPayePar(e.target.value)}>
              <option value="societe">La société</option>
              <option value="mahdi">Mahdi (à rembourser)</option>
              <option value="sabir">Sabir (à rembourser)</option>
            </select>
          </label>
        </div>
      </div>

      <div className="card">
        <p className="card__title">Justificatif</p>
        <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginBottom: '.75rem' }}>
          Photo ou PDF. Les images sont compressées automatiquement avant envoi.
        </p>

        <input
          type="file"
          accept="image/*,application/pdf"
          multiple
          capture="environment"
          onChange={(e) => ajouterFichiers(e.target.files)}
          className={styles.fichier}
        />

        {infoCompression && (
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.6rem' }}>
            {infoCompression}
          </p>
        )}

        {fichiers.length > 0 && (
          <ul className={styles.listeFichiers}>
            {fichiers.map((f, i) => (
              <li key={i}>
                <span>{f.name}</span>
                <span className="muted">{poids(f.size)}</span>
                <button type="button" onClick={() => setFichiers((p) => p.filter((_, j) => j !== i))}>
                  retirer
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className={styles.champ} style={{ marginTop: '1rem' }}>
          <span>Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Convive et motif si repas, précisions utiles…" />
        </label>
      </div>

      {erreur && <p className={styles.alerteRouge}>{erreur}</p>}

      <div className={styles.actions}>
        <button type="submit" className="btn btn--gold" disabled={enCours || categorie?.bloque}>
          {enCours ? 'Enregistrement…' : peutValider ? 'Enregistrer' : 'Soumettre à validation'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => router.push('/depenses')}>
          Annuler
        </button>
      </div>
    </form>
  );
}
