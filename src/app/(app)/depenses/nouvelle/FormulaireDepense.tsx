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

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { compresser, poids } from '@/lib/compression';
import {
  TAUX_TVA, depuisHT, depuisTTC, tvaRecuperable,
  montantsCoherents, SEUIL_IMMOBILISATION,
} from '@/lib/comptabilite';
import { money, montantSaisi } from '@/lib/format';
import type { Categorie } from '@/lib/types';
import Dialogue from '@/components/Dialogue';
import Alerte from '@/components/Alerte';
import { aujourdhuiIso } from '@/lib/dates';
import styles from './formulaire.module.css';

/** Valeurs reprises d'une dépense existante (bouton « Dupliquer »). */
export type ValeursInitiales = {
  fournisseur: string; libelle: string; categorieId: string;
  montantTtc: number; tauxTva: number;
  moyenPaiement: string; payePar: string; notes: string;
};

type Props = { categories: Categorie[]; peutValider: boolean; initial?: ValeursInitiales };

export default function FormulaireDepense({ categories, peutValider, initial }: Props) {
  const router = useRouter();

  // La date repart d'aujourd'hui, même pour une copie : c'est une nouvelle dépense.
  const [dateDepense, setDateDepense] = useState(aujourdhuiIso);
  const [fournisseur, setFournisseur] = useState(initial?.fournisseur ?? '');
  const [libelle, setLibelle] = useState(initial?.libelle ?? '');
  const [categorieId, setCategorieId] = useState(initial?.categorieId ?? '');
  const [saisieEn, setSaisieEn] = useState<'ht' | 'ttc'>('ttc');
  const [montant, setMontant] = useState(
    initial ? String(initial.montantTtc).replace('.', ',') : '');
  const [tauxTva, setTauxTva] = useState(initial?.tauxTva ?? 20);
  const [moyenPaiement, setMoyenPaiement] = useState(initial?.moyenPaiement ?? 'carte');
  const [payePar, setPayePar] = useState(initial?.payePar ?? 'societe');
  // Les payeurs viennent de la base : deux associés étaient écrits en
  // dur ici, et un troisième n'aurait jamais pu apparaître.
  const [payeurs, setPayeurs] = useState<
    Array<{ valeur: string; libelle: string; avance: boolean }>>([]);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [infoCompression, setInfoCompression] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [dialogueSansPiece, setDialogueSansPiece] = useState(false);
  const [dialogueAbandon, setDialogueAbandon] = useState(false);

  const categorie = categories.find((c) => c.id === categorieId) ?? null;

  /* « Annuler » jetait la saisie et les photos jointes d'un seul clic, à côté
     d'« Enregistrer ». Sur un téléphone, une photo perdue est un déplacement
     refait. On ne demande confirmation que si quelque chose a été saisi. */
  const modifie =
    fournisseur.trim() !== '' || libelle.trim() !== '' || categorieId !== ''
    || montant.trim() !== '' || notes.trim() !== '' || fichiers.length > 0;

  function quitter() {
    if (modifie) { setDialogueAbandon(true); return; }
    router.push('/depenses');
  }

  const montants = useMemo(() => {
    const v = (montantSaisi(montant) ?? NaN);
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

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc('payeurs_possibles');
      if (data) setPayeurs(data as typeof payeurs);
    })();
  }, []);

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
      setDialogueSansPiece(true);
      return;
    }

    await enregistrer();
  }

  async function enregistrer() {
    if (!categorie || !montants) return;
    setEnCours(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErreur('Session expirée.'); setEnCours(false); return; }

    // Les règles communes — TVA déductible, numéro de pièce, recherche
    // d'une opération bancaire, journalisation — vivent dans la fonction
    // en base. Les cinq écrans de création l'appellent, ce qui garantit
    // qu'un même achat produit la même écriture quel que soit le chemin.
    const { data: res, error } = await supabase.rpc('creer_depense', {
      p_date: dateDepense,
      p_fournisseur: fournisseur.trim(),
      p_categorie: categorie.id,
      p_montant_ttc: montants.ttc,
      p_taux_tva: tauxTva,
      p_libelle: libelle.trim() || null,
      p_statut: peutValider ? 'validee' : 'en_attente',
      p_origine: 'saisie',
      p_moyen_paiement: moyenPaiement,
      p_paye_par: payePar,
      p_notes: notes.trim() || null,
    });

    if (error || !res) {
      setErreur(`Enregistrement impossible : ${error?.message ?? 'erreur inconnue'}`);
      setEnCours(false);
      return;
    }

    const depense = res as { id: string; numero_piece: string };

    for (const f of fichiers) {
      const chemin = `${depense.id}/${Date.now()}-${f.name}`;
      const { error: eUp } = await supabase.storage
        .from('justificatifs').upload(chemin, f);
      if (eUp) continue;
      await supabase.from('justificatifs').insert({        // `piece_id` directement. La colonne `depense_id` n'existe plus
        // que pour un déclencheur de compatibilité, `trg_rerouter_justificatif`,
        // qui la réécrit en `piece_id` — et qui disparaîtra avec la table
        // `depenses`. Écrire la bonne colonne dès maintenant permet de
        // retirer l'ancienne table sans casser le dépôt de justificatifs.

        piece_id: depense.id,
        chemin,
        nom_original: f.name,
        type_mime: f.type,
        taille_octets: f.size,
        cree_par: user.id,
      });
    }

    router.push('/depenses');
    router.refresh();
  }

  const groupes = Array.from(new Set(categories.map((c) => c.groupe)));

  return (
    <>
    <Dialogue
      ouvert={dialogueSansPiece}
      titre="Aucun justificatif joint"
      description={
        "Sans pièce, la charge n'est pas déductible du résultat et la TVA " +
        "n'est pas récupérable. Vous pourrez ajouter le justificatif plus " +
        "tard depuis le détail de la dépense."
      }
      libelleValider="Enregistrer quand même"
      onValider={() => { setDialogueSansPiece(false); enregistrer(); }}
      onAnnuler={() => setDialogueSansPiece(false)}
    />

    <Dialogue
      ouvert={dialogueAbandon}
      titre="Abandonner cette saisie"
      description={
        fichiers.length > 0
          ? `La saisie et ${fichiers.length} justificatif${fichiers.length > 1 ? 's' : ''} `
            + 'joint' + (fichiers.length > 1 ? 's' : '') + ' seront perdus.'
          : 'Ce qui a été saisi sera perdu.'
      }
      libelleValider="Abandonner"
      danger
      onValider={() => { setDialogueAbandon(false); router.push('/depenses'); }}
      onAnnuler={() => setDialogueAbandon(false)}
    />

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
            {/* Quand un associé avance l'argent, le moyen de paiement
                comptable EST « avance_associe » — c'est ce champ, et lui
                seul, que lit le compte courant (v_compte_courant). Le
                laisser sur « Carte » parce que c'est physiquement la
                carte de l'associé faisait disparaître la dette sans
                aucune erreur visible : rien ne bloquait, le montant
                partait simplement dans le vide. On ne laisse donc plus
                les deux champs se contredire. */}
            <select
              value={moyenPaiement}
              onChange={(e) => setMoyenPaiement(e.target.value)}
              disabled={payeurs.find((x) => x.valeur === payePar)?.avance}
            >
              {payeurs.find((x) => x.valeur === payePar)?.avance ? (
                <option value="avance_associe">Avance de l&apos;associé</option>
              ) : (
                <>
                  <option value="carte">Carte</option>
                  <option value="virement">Virement</option>
                  <option value="prelevement">Prélèvement</option>
                  <option value="especes">Espèces</option>
                  <option value="autre">Autre</option>
                </>
              )}
            </select>
            {payeurs.find((x) => x.valeur === payePar)?.avance && (
              <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>
                L&apos;instrument réel (carte perso, espèces...) peut être précisé
                dans les notes ci-dessous — ce qui compte ici, c&apos;est que la
                société doit cette somme à l&apos;associé.
              </p>
            )}
          </label>

          <label className={styles.champ}>
            <span>Payé par</span>
            <select
              value={payePar}
              onChange={(e) => {
                const v = e.target.value;
                setPayePar(v);
                const estAvance = payeurs.find((x) => x.valeur === v)?.avance;
                if (estAvance) {
                  setMoyenPaiement('avance_associe');
                } else if (moyenPaiement === 'avance_associe') {
                  // On revient à « La société » après avoir choisi un
                  // associé : le champ figé n'a plus de sens, on rend
                  // la main sur un choix normal plutôt que de laisser
                  // une valeur qu'on ne peut plus modifier.
                  setMoyenPaiement('carte');
                }
              }}
            >
              {payeurs.length === 0 ? (
                <option value="societe">La société</option>
              ) : payeurs.map((x) => (
                <option key={x.valeur} value={x.valeur}>{x.libelle}</option>
              ))}
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

      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}

      <div className={styles.actions}>
        <button type="submit" className="btn btn--gold" disabled={enCours || categorie?.bloque}>
          {enCours ? 'Enregistrement…' : peutValider ? 'Enregistrer' : 'Soumettre à validation'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={quitter}>
          Annuler
        </button>
      </div>
    </form>
    </>
  );
}
