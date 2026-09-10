'use client';

/**
 * LA FICHE ENTREPRISE, MODIFIABLE
 *
 * Ces champs alimentent les mentions de chaque facture. Une facture déjà
 * émise garde celles de son émission (elles sont figées) : corriger la
 * fiche ne réécrit pas le passé.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Alerte from '@/components/Alerte';
import f from '@/styles/formulaire.module.css';

type Valeur = string | number | boolean | null;
export type Entreprise = { id: string } & Record<string, Valeur>;
export type Exercice = {
  id: string; date_debut: string; date_fin: string; statut: string; regime_tva: string;
};

type Champ = {
  cle: string; libelle: string;
  type?: 'text' | 'number' | 'email' | 'url' | 'textarea';
  requis?: boolean; pleine?: boolean;
};

const GROUPES: { titre: string; champs: Champ[] }[] = [
  { titre: 'Identité légale', champs: [
    { cle: 'raison_sociale', libelle: 'Raison sociale', requis: true },
    { cle: 'forme_juridique', libelle: 'Forme juridique', requis: true },
    { cle: 'capital', libelle: 'Capital social (€)', type: 'number', requis: true },
    { cle: 'siren', libelle: 'SIREN', requis: true },
    { cle: 'siret', libelle: 'SIRET du siège', requis: true },
    { cle: 'rcs', libelle: 'RCS' },
    { cle: 'tva_intracom', libelle: 'N° de TVA intracommunautaire' },
    { cle: 'code_ape', libelle: 'Code APE' },
  ] },
  { titre: 'Siège et dirigeants', champs: [
    { cle: 'adresse', libelle: 'Adresse du siège', requis: true, pleine: true },
    { cle: 'code_postal', libelle: 'Code postal', requis: true },
    { cle: 'ville', libelle: 'Ville', requis: true },
    { cle: 'president', libelle: 'Président', requis: true },
    { cle: 'directeur_general', libelle: 'Directeur général' },
  ] },
  { titre: 'Contact', champs: [
    { cle: 'email', libelle: 'Courriel', type: 'email' },
    { cle: 'telephone', libelle: 'Téléphone' },
    { cle: 'site_web', libelle: 'Site web', type: 'url' },
  ] },
  { titre: 'Banque — imprimée sur les factures', champs: [
    { cle: 'banque_nom', libelle: 'Banque' },
    { cle: 'iban', libelle: 'IBAN' },
    { cle: 'bic', libelle: 'BIC' },
    { cle: 'banque_adresse', libelle: 'Adresse de la banque', pleine: true },
  ] },
  { titre: 'Médiateur de la consommation', champs: [
    { cle: 'mediateur_nom', libelle: 'Nom' },
    { cle: 'mediateur_site', libelle: 'Site', type: 'url' },
    { cle: 'mediateur_adresse', libelle: 'Adresse', pleine: true },
  ] },
  { titre: 'Assurance responsabilité civile professionnelle', champs: [
    { cle: 'rc_pro_assureur', libelle: 'Assureur' },
    { cle: 'rc_pro_police', libelle: 'N° de police' },
    { cle: 'rc_pro_couverture', libelle: 'Couverture géographique' },
  ] },
];

const TOUS = GROUPES.flatMap((g) => g.champs);

export default function FicheEntreprise({ entreprise, exercices, modifiable }: {
  entreprise: Entreprise; exercices: Exercice[]; modifiable: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, Valeur>>(entreprise);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const maj = (k: string, val: Valeur) => setV((x) => ({ ...x, [k]: val }));

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true); setErreur(null); setSucces(null);

    const donnees: Record<string, Valeur> = {};
    for (const c of TOUS) {
      const brut = v[c.cle];
      if (c.type === 'number') {
        donnees[c.cle] = brut === '' || brut === null ? null : Number(brut);
      } else {
        donnees[c.cle] = typeof brut === 'string' ? (brut.trim() || null) : brut;
      }
    }
    donnees.penalites_mode = v.penalites_mode === 'taux_fixe' ? 'taux_fixe' : 'taux_legal_triple';
    donnees.penalites_taux = donnees.penalites_mode === 'taux_fixe'
      ? Number(v.penalites_taux ?? 0) : null;
    donnees.indemnite_recouvrement = v.indemnite_recouvrement === '' || v.indemnite_recouvrement === null
      ? 40 : Number(v.indemnite_recouvrement);
    donnees.escompte_accorde = !!v.escompte_accorde;
    donnees.conditions_generales = typeof v.conditions_generales === 'string'
      ? (v.conditions_generales.trim() || null) : null;

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    donnees.modifie_le = new Date().toISOString();
    donnees.modifie_par = user?.id ?? null;

    const { error } = await supabase.from('entreprise').update(donnees).eq('id', entreprise.id);
    if (error) { setErreur(`Enregistrement impossible : ${error.message}`); setEnCours(false); return; }

    await supabase.rpc('journaliser', {
      p_action: 'modification', p_table: 'entreprise', p_id: entreprise.id,
      p_details: { resume: 'Fiche entreprise mise à jour' },
    });
    setSucces('Fiche enregistrée. Les factures déjà émises gardent les mentions de leur émission.');
    setEnCours(false);
    router.refresh();
  }

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      <form onSubmit={enregistrer}>
        <fieldset disabled={!modifiable} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          {GROUPES.map((g) => (
            <div key={g.titre} className="card" style={{ marginBottom: '1.25rem' }}>
              <p className="card__title">{g.titre}</p>
              <div className={f.formulaire} style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
                {g.champs.map((c) => (
                  <label key={c.cle} className={c.pleine ? f.pleine : undefined}>
                    <span>{c.libelle}{c.requis ? ' *' : ''}</span>
                    {c.type === 'textarea' ? (
                      <textarea value={String(v[c.cle] ?? '')} onChange={(e) => maj(c.cle, e.target.value)} />
                    ) : (
                      <input type={c.type ?? 'text'} required={c.requis}
                        step={c.type === 'number' ? '0.01' : undefined}
                        value={String(v[c.cle] ?? '')} onChange={(e) => maj(c.cle, e.target.value)} />
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <p className="card__title">Conditions de règlement — mentions obligatoires</p>
            <div className={f.formulaire} style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
              <label><span>Pénalités de retard</span>
                <select value={String(v.penalites_mode ?? 'taux_legal_triple')}
                  onChange={(e) => maj('penalites_mode', e.target.value)}>
                  <option value="taux_legal_triple">Trois fois le taux d&apos;intérêt légal</option>
                  <option value="taux_fixe">Taux fixe</option>
                </select></label>
              {v.penalites_mode === 'taux_fixe' && (
                <label><span>Taux annuel (%) *</span>
                  <input type="number" step="0.01" min="0" required
                    value={String(v.penalites_taux ?? '')}
                    onChange={(e) => maj('penalites_taux', e.target.value)} /></label>
              )}
              <label><span>Indemnité forfaitaire de recouvrement (€)</span>
                <input type="number" step="0.01" min="40"
                  value={String(v.indemnite_recouvrement ?? 40)}
                  onChange={(e) => maj('indemnite_recouvrement', e.target.value)} /></label>
              <label className={f.case}>
                <input type="checkbox" checked={!!v.escompte_accorde}
                  onChange={(e) => maj('escompte_accorde', e.target.checked)} />
                Escompte accordé pour paiement anticipé
              </label>
              <label className={f.pleine}><span>Conditions générales (imprimées sur les factures)</span>
                <textarea value={String(v.conditions_generales ?? '')}
                  onChange={(e) => maj('conditions_generales', e.target.value)} /></label>
            </div>
          </div>

          {modifiable && (
            <div className={f.actions} style={{ marginBottom: '1.5rem' }}>
              <button type="submit" className="btn btn--gold" disabled={enCours}>
                {enCours ? 'Enregistrement…' : 'Enregistrer la fiche'}
              </button>
              <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                Toute modification de l&apos;identité doit correspondre à un Kbis à jour.
              </span>
            </div>
          )}
        </fieldset>
      </form>

      <div className="card">
        <p className="card__title">Exercices</p>
        <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginBottom: '.6rem', lineHeight: 1.5, maxWidth: '70ch' }}>
          Le régime de TVA choisit le formulaire de déclaration (CA12E ou CA3).
          La date de début du premier exercice fixe aussi la date d&apos;écriture
          des frais de création : elle doit être celle de l&apos;immatriculation.
        </p>
        {exercices.map((ex) => (
          <LigneExercice key={ex.id} ex={ex} modifiable={modifiable}
            onErreur={setErreur} onSucces={(m) => { setSucces(m); router.refresh(); }} />
        ))}
      </div>
    </>
  );
}

function LigneExercice({ ex, modifiable, onErreur, onSucces }: {
  ex: Exercice; modifiable: boolean;
  onErreur: (m: string) => void; onSucces: (m: string) => void;
}) {
  const [debut, setDebut] = useState(ex.date_debut);
  const [fin, setFin] = useState(ex.date_fin);
  const [regime, setRegime] = useState(ex.regime_tva);
  const [enCours, setEnCours] = useState(false);
  const modifie = debut !== ex.date_debut || fin !== ex.date_fin || regime !== ex.regime_tva;
  const ouvert = ex.statut === 'ouvert';

  async function enregistrer() {
    if (fin <= debut) { onErreur('La fin de l’exercice doit suivre son début.'); return; }
    const mois = (new Date(fin).getTime() - new Date(debut).getTime()) / (86400000 * 30.44);
    if (mois > 24.5) { onErreur('Un exercice ne peut pas dépasser vingt-quatre mois.'); return; }

    setEnCours(true);
    const supabase = createClient();
    const { error } = await supabase.from('exercices')
      .update({ date_debut: debut, date_fin: fin, regime_tva: regime }).eq('id', ex.id);
    setEnCours(false);
    if (error) { onErreur(`Exercice non modifié : ${error.message}`); return; }
    await supabase.rpc('journaliser', {
      p_action: 'modification', p_table: 'exercices', p_id: ex.id,
      p_details: { resume: `Exercice ${debut} → ${fin}, régime ${regime}` },
    });
    onSucces('Exercice mis à jour.');
  }

  return (
    <div className={f.actions} style={{ padding: '.6rem 0', borderBottom: '1px solid var(--g-200)' }}>
      <input type="date" value={debut} disabled={!modifiable || !ouvert}
        onChange={(e) => setDebut(e.target.value)} className={f.recherche} style={{ flex: '0 1 11rem' }} />
      <span className="muted">→</span>
      <input type="date" value={fin} disabled={!modifiable || !ouvert}
        onChange={(e) => setFin(e.target.value)} className={f.recherche} style={{ flex: '0 1 11rem' }} />
      <select value={regime} disabled={!modifiable || !ouvert}
        onChange={(e) => setRegime(e.target.value)} className={f.recherche} style={{ flex: '0 1 14rem' }}>
        <option value="simplifie">Réel simplifié (CA12E)</option>
        <option value="reel_normal">Réel normal (CA3)</option>
      </select>
      <span className={`badge ${ouvert ? 'badge--success' : 'badge--neutral'}`}>
        {ouvert ? 'Ouvert' : 'Clos'}
      </span>
      {modifiable && ouvert && modifie && (
        <button type="button" onClick={enregistrer} disabled={enCours} className="btn btn--gold btn--sm">
          {enCours ? '…' : 'Enregistrer'}
        </button>
      )}
    </div>
  );
}
