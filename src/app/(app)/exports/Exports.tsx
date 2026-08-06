'use client';

/**
 * Exports filtrés.
 *
 * Les totaux affichés se recalculent sur le filtre appliqué, pas sur
 * l'ensemble des données : c'est ce qui rend l'écran utilisable pour
 * vérifier un mois avant de le transmettre au comptable.
 */

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { money, date } from '@/lib/format';
import { versCSV, versJSON, telecharger, dateFR, type Colonne } from '@/lib/export';
import type { Categorie } from '@/lib/types';
import styles from './exports.module.css';

type Jeu = 'depenses' | 'frais' | 'deplacements' | 'abonnements';

type LigneDepense = {
  numero_piece: string | null;
  date_depense: string; fournisseur: string; libelle: string | null;
  compte: string; montant_ht: number; taux_tva: number; montant_tva: number;
  tva_deductible: number; montant_ttc: number; taux_deductibilite: number;
  moyen_paiement: string | null; paye_par: string | null; statut: string;
  notes: string | null; categorie_id: string;
  categories?: { libelle: string; groupe: string };
};

type LigneFrais = {
  numero_piece: string | null;
  date_engagement: string; fournisseur: string; libelle: string | null;
  compte: string; montant_ht: number; taux_tva: number; montant_tva: number;
  tva_deductible: number; montant_ttc: number; associe_payeur: string;
  nature: string; mode_reprise: string; statut_reprise: string;
  notes: string | null; categorie_id: string | null;
  categories?: { libelle: string };
};

type LigneDeplacement = {
  numero_piece: string | null;
  date_trajet: string; depart: string; arrivee: string; motif: string;
  kilometres: number; aller_retour: boolean; statut: string;
  vehicules?: { libelle: string };
};

type LigneAbonnement = {
  numero_piece: string | null; date_debut: string; date_fin: string | null;
  nom: string; fournisseur: string;
  montant_ht: number; taux_tva: number; montant_tva: number; montant_ttc: number;
  periodicite: string; statut: string; autoliquidation: boolean;
  pays_prestataire: string; engagement_jusquau: string | null;
  notes: string | null; categorie_id: string | null;
  categories?: { libelle: string };
};

type Props = {
  depenses: LigneDepense[];
  frais: LigneFrais[];
  deplacements: LigneDeplacement[];
  abonnements: LigneAbonnement[];
  categories: Categorie[];
  exercices: { date_debut: string; date_fin: string }[];
};

export default function Exports({
  depenses, frais, deplacements, abonnements, categories, exercices,
}: Props) {
  const [jeu, setJeu] = useState<Jeu>('depenses');
  const [periode, setPeriode] = useState('exercice');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [categorieId, setCategorieId] = useState('');
  const [fournisseur, setFournisseur] = useState('');
  const [statut, setStatut] = useState('');
  const [payePar, setPayePar] = useState('');

  const bornes = useMemo(() => {
    const now = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    switch (periode) {
      case 'mois':
        return {
          debut: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
          fin: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
        };
      case 'trimestre': {
        const t = Math.floor(now.getMonth() / 3);
        return {
          debut: iso(new Date(now.getFullYear(), t * 3, 1)),
          fin: iso(new Date(now.getFullYear(), t * 3 + 3, 0)),
        };
      }
      case 'exercice': {
        const ex = exercices.find(
          (e) => iso(now) >= e.date_debut && iso(now) <= e.date_fin
        ) ?? exercices[0];
        return { debut: ex?.date_debut ?? '2000-01-01', fin: ex?.date_fin ?? '2099-12-31' };
      }
      case 'personnalise':
        return { debut: du || '2000-01-01', fin: au || '2099-12-31' };
      default:
        return { debut: '2000-01-01', fin: '2099-12-31' };
    }
  }, [periode, du, au, exercices]);

  const lignes = useMemo(() => {
    const dansPeriode = (d: string) => d >= bornes.debut && d <= bornes.fin;
    const corrFournisseur = (f: string) =>
      !fournisseur || f.toLowerCase().includes(fournisseur.toLowerCase());

    if (jeu === 'depenses') {
      return depenses.filter((l) =>
        dansPeriode(l.date_depense) &&
        corrFournisseur(l.fournisseur) &&
        (!categorieId || l.categorie_id === categorieId) &&
        (!statut || l.statut === statut) &&
        (!payePar || l.paye_par === payePar)
      );
    }
    if (jeu === 'frais') {
      return frais.filter((l) =>
        dansPeriode(l.date_engagement) &&
        corrFournisseur(l.fournisseur) &&
        (!categorieId || l.categorie_id === categorieId) &&
        (!statut || l.statut_reprise === statut) &&
        (!payePar || l.associe_payeur === payePar)
      );
    }
    if (jeu === 'abonnements') {
      return abonnements.filter((l) =>
        dansPeriode(l.date_debut) &&
        corrFournisseur(l.fournisseur) &&
        (!categorieId || l.categorie_id === categorieId) &&
        (!statut || l.statut === statut)
      );
    }
    return deplacements.filter((l) =>
      dansPeriode(l.date_trajet) &&
      (!statut || l.statut === statut)
    );
  }, [jeu, depenses, frais, deplacements, abonnements, bornes, categorieId, fournisseur, statut, payePar]);

  const totaux = useMemo(() => {
    if (jeu === 'deplacements') {
      const km = (lignes as LigneDeplacement[]).reduce(
        (s, l) => s + Number(l.kilometres) * (l.aller_retour ? 2 : 1), 0
      );
      return { nombre: lignes.length, km };
    }
    // Un abonnement porte une TVA facturée mais pas encore déduite : elle
    // ne le sera qu'à la constatation de l'échéance, qui crée la dépense.
    // On additionne donc montant_tva pour les abonnements, tva_deductible
    // pour les écritures effectivement comptabilisées.
    const l = lignes as (LigneDepense | LigneFrais | LigneAbonnement)[];
    const tvaDe = (x: LigneDepense | LigneFrais | LigneAbonnement) =>
      'tva_deductible' in x ? Number(x.tva_deductible) : Number(x.montant_tva);

    return {
      nombre: l.length,
      ht: l.reduce((s, x) => s + Number(x.montant_ht), 0),
      tva: l.reduce((s, x) => s + tvaDe(x), 0),
      ttc: l.reduce((s, x) => s + Number(x.montant_ttc), 0),
    };
  }, [lignes, jeu]);

  function colonnes(): Colonne<never>[] {
    if (jeu === 'depenses') {
      return ([
        { entete: 'Pièce', valeur: (l: LigneDepense) => l.numero_piece ?? '' },
        { entete: 'Date', valeur: (l: LigneDepense) => dateFR(l.date_depense) },
        { entete: 'Fournisseur', valeur: (l: LigneDepense) => l.fournisseur },
        { entete: 'Description', valeur: (l: LigneDepense) => l.libelle ?? '' },
        { entete: 'Catégorie', valeur: (l: LigneDepense) => l.categories?.libelle ?? '' },
        { entete: 'Compte', valeur: (l: LigneDepense) => l.compte },
        { entete: 'Montant HT', valeur: (l: LigneDepense) => Number(l.montant_ht) },
        { entete: 'Taux TVA', valeur: (l: LigneDepense) => Number(l.taux_tva) },
        { entete: 'Montant TVA', valeur: (l: LigneDepense) => Number(l.montant_tva) },
        { entete: 'TVA déductible', valeur: (l: LigneDepense) => Number(l.tva_deductible) },
        { entete: 'Taux déductibilité', valeur: (l: LigneDepense) => Number(l.taux_deductibilite) },
        { entete: 'Montant TTC', valeur: (l: LigneDepense) => Number(l.montant_ttc) },
        { entete: 'Paiement', valeur: (l: LigneDepense) => l.moyen_paiement ?? '' },
        { entete: 'Payé par', valeur: (l: LigneDepense) => l.paye_par ?? '' },
        { entete: 'Statut', valeur: (l: LigneDepense) => l.statut },
        { entete: 'Notes', valeur: (l: LigneDepense) => l.notes ?? '' },
      ] as unknown) as Colonne<never>[];
    }
    if (jeu === 'frais') {
      return ([
        { entete: 'Pièce', valeur: (l: LigneFrais) => l.numero_piece ?? '' },
        { entete: 'Date', valeur: (l: LigneFrais) => dateFR(l.date_engagement) },
        { entete: 'Fournisseur', valeur: (l: LigneFrais) => l.fournisseur },
        { entete: 'Description', valeur: (l: LigneFrais) => l.libelle ?? '' },
        { entete: 'Catégorie', valeur: (l: LigneFrais) => l.categories?.libelle ?? '' },
        { entete: 'Compte', valeur: (l: LigneFrais) => l.compte },
        { entete: 'Montant HT', valeur: (l: LigneFrais) => Number(l.montant_ht) },
        { entete: 'Taux TVA', valeur: (l: LigneFrais) => Number(l.taux_tva) },
        { entete: 'Montant TVA', valeur: (l: LigneFrais) => Number(l.montant_tva) },
        { entete: 'TVA déductible', valeur: (l: LigneFrais) => Number(l.tva_deductible) },
        { entete: 'Montant TTC', valeur: (l: LigneFrais) => Number(l.montant_ttc) },
        { entete: 'Avancé par', valeur: (l: LigneFrais) => l.associe_payeur },
        { entete: 'Nature', valeur: (l: LigneFrais) => l.nature },
        { entete: 'Mode de reprise', valeur: (l: LigneFrais) => l.mode_reprise },
        { entete: 'Statut', valeur: (l: LigneFrais) => l.statut_reprise },
        { entete: 'Notes', valeur: (l: LigneFrais) => l.notes ?? '' },
      ] as unknown) as Colonne<never>[];
    }
    if (jeu === 'abonnements') {
      return ([
        { entete: 'Pièce', valeur: (l: LigneAbonnement) => l.numero_piece ?? '' },
        { entete: 'Nom', valeur: (l: LigneAbonnement) => l.nom },
        { entete: 'Fournisseur', valeur: (l: LigneAbonnement) => l.fournisseur },
        { entete: 'Catégorie', valeur: (l: LigneAbonnement) => l.categories?.libelle ?? '' },
        { entete: 'Montant HT', valeur: (l: LigneAbonnement) => Number(l.montant_ht) },
        { entete: 'Taux TVA', valeur: (l: LigneAbonnement) => Number(l.taux_tva) },
        { entete: 'Montant TTC', valeur: (l: LigneAbonnement) => Number(l.montant_ttc) },
        { entete: 'Périodicité', valeur: (l: LigneAbonnement) => l.periodicite },
        { entete: 'Début', valeur: (l: LigneAbonnement) => dateFR(l.date_debut) },
        { entete: 'Fin', valeur: (l: LigneAbonnement) => dateFR(l.date_fin) },
        { entete: 'Engagement jusqu\'au', valeur: (l: LigneAbonnement) => dateFR(l.engagement_jusquau) },
        { entete: 'TVA autoliquidée', valeur: (l: LigneAbonnement) => (l.autoliquidation ? 'oui' : 'non') },
        { entete: 'Pays', valeur: (l: LigneAbonnement) => l.pays_prestataire },
        { entete: 'Statut', valeur: (l: LigneAbonnement) => l.statut },
        { entete: 'Notes', valeur: (l: LigneAbonnement) => l.notes ?? '' },
      ] as unknown) as Colonne<never>[];
    }
    return ([
      { entete: 'Pièce', valeur: (l: LigneDeplacement) => l.numero_piece ?? '' },
      { entete: 'Date', valeur: (l: LigneDeplacement) => dateFR(l.date_trajet) },
      { entete: 'Véhicule', valeur: (l: LigneDeplacement) => l.vehicules?.libelle ?? '' },
      { entete: 'Départ', valeur: (l: LigneDeplacement) => l.depart },
      { entete: 'Arrivée', valeur: (l: LigneDeplacement) => l.arrivee },
      { entete: 'Motif', valeur: (l: LigneDeplacement) => l.motif },
      { entete: 'Kilomètres', valeur: (l: LigneDeplacement) => Number(l.kilometres) },
      { entete: 'Aller-retour', valeur: (l: LigneDeplacement) => (l.aller_retour ? 'oui' : 'non') },
      { entete: 'Km comptés', valeur: (l: LigneDeplacement) => Number(l.kilometres) * (l.aller_retour ? 2 : 1) },
      { entete: 'Statut', valeur: (l: LigneDeplacement) => l.statut },
    ] as unknown) as Colonne<never>[];
  }

  const nomFichier = (ext: string) =>
    `hipla-${jeu}-${bornes.debut}-${bornes.fin}.${ext}`;

  async function exporter(format: 'csv' | 'json') {
    const contenu = format === 'csv'
      ? versCSV(lignes as never[], colonnes())
      : versJSON(lignes);

    telecharger(
      contenu,
      nomFichier(format),
      format === 'csv' ? 'text/csv' : 'application/json'
    );

    // L'export est journalisé : savoir qui a extrait quoi, et quand.
    const supabase = createClient();
    await supabase.rpc('journaliser', {
      p_action: 'export',
      p_table: jeu,
      p_id: null,
      p_details: { format, lignes: lignes.length, du: bornes.debut, au: bornes.fin },
    });
  }

  return (
    <>
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card__title">Jeu de données</p>
        <div className={styles.onglets}>
          {([
            ['depenses', 'Dépenses', depenses.length],
            ['frais', 'Frais de création', frais.length],
            ['deplacements', 'Déplacements', deplacements.length],
            ['abonnements', 'Abonnements', abonnements.length],
          ] as [Jeu, string, number][]).map(([k, l, n]) => (
            <button
              key={k}
              onClick={() => { setJeu(k); setCategorieId(''); setStatut(''); setPayePar(''); }}
              className={jeu === k ? styles.ongletActif : styles.onglet}
            >
              {l} <span className={styles.compte}>{n}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card__title">Filtres</p>
        <div className={styles.filtres}>
          <label>
            <span>Période</span>
            <select value={periode} onChange={(e) => setPeriode(e.target.value)}>
              <option value="exercice">Exercice en cours</option>
              <option value="mois">Mois en cours</option>
              <option value="trimestre">Trimestre en cours</option>
              <option value="personnalise">Dates personnalisées</option>
              <option value="tout">Tout</option>
            </select>
          </label>

          {periode === 'personnalise' && (
            <>
              <label><span>Du</span>
                <input type="date" value={du} onChange={(e) => setDu(e.target.value)} /></label>
              <label><span>Au</span>
                <input type="date" value={au} onChange={(e) => setAu(e.target.value)} /></label>
            </>
          )}

          {jeu !== 'deplacements' && (
            <>
              <label><span>Catégorie</span>
                <select value={categorieId} onChange={(e) => setCategorieId(e.target.value)}>
                  <option value="">Toutes</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.libelle}</option>
                  ))}
                </select></label>

              <label><span>Fournisseur</span>
                <input type="text" value={fournisseur} placeholder="Recherche…"
                  onChange={(e) => setFournisseur(e.target.value)} /></label>
            </>
          )}

          <label><span>Statut</span>
            <select value={statut} onChange={(e) => setStatut(e.target.value)}>
              <option value="">Tous</option>
              {jeu === 'abonnements' ? (
                <>
                  <option value="actif">Actif</option>
                  <option value="gratuit">Gratuit</option>
                  <option value="resilie">Résilié</option>
                </>
              ) : jeu === 'frais' ? (
                <>
                  <option value="a_valider">À ratifier</option>
                  <option value="repris">Repris</option>
                  <option value="rejete">Écarté</option>
                </>
              ) : (
                <>
                  <option value="en_attente">En attente</option>
                  <option value="validee">Validée</option>
                  <option value="rejetee">Rejetée</option>
                </>
              )}
            </select></label>

          {(jeu === 'depenses' || jeu === 'frais') && (
            <label><span>{jeu === 'frais' ? 'Avancé par' : 'Payé par'}</span>
              <select value={payePar} onChange={(e) => setPayePar(e.target.value)}>
                <option value="">Tous</option>
                {jeu === 'depenses' && <option value="societe">La société</option>}
                <option value="mahdi">Mahdi</option>
                <option value="sabir">Sabir</option>
              </select></label>
          )}
        </div>

        <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.8rem' }}>
          Période retenue : du {date(bornes.debut)} au {date(bornes.fin)}
        </p>
      </div>

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card__title">Résultat</p>
        <div className={styles.totaux}>
          <div><span>Lignes</span><strong className="amount">{totaux.nombre}</strong></div>
          {jeu === 'deplacements' ? (
            <div><span>Kilomètres</span>
              <strong className="amount">{Math.round(totaux.km ?? 0).toLocaleString('fr-FR')}</strong></div>
          ) : (
            <>
              <div><span>Total HT</span><strong className="amount">{money(totaux.ht ?? 0)}</strong></div>
              <div>
                <span>{jeu === 'abonnements' ? 'TVA facturée' : 'TVA déductible'}</span>
                <strong className="amount">{money(totaux.tva ?? 0)}</strong>
              </div>
              <div><span>Total TTC</span><strong className="amount">{money(totaux.ttc ?? 0)}</strong></div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: '.6rem', marginTop: '1.1rem', flexWrap: 'wrap' }}>
          <button onClick={() => exporter('csv')} disabled={lignes.length === 0} className="btn btn--gold">
            Exporter en CSV
          </button>
          <button onClick={() => exporter('json')} disabled={lignes.length === 0} className="btn btn--ghost">
            Exporter en JSON
          </button>
        </div>

        <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.8rem', maxWidth: '62ch' }}>
          Le CSV est produit aux conventions françaises — séparateur
          point-virgule, décimale virgule, encodage UTF-8 — pour s'ouvrir
          correctement dans Excel en configuration française.
        </p>
      </div>

      {lignes.length > 0 && (
        <div className="card">
          <p className="card__title">Aperçu — 10 premières lignes</p>
          <div className="table-scroll">
            <table style={{ minWidth: 560, fontSize: 'var(--fs-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                  {colonnes().slice(0, 6).map((c) => (
                    <th key={c.entete} style={{
                      textAlign: 'left', padding: '.5rem .4rem',
                      color: 'var(--g-500)', fontWeight: 500, whiteSpace: 'nowrap',
                    }}>{c.entete}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(lignes as never[]).slice(0, 10).map((l, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--g-200)' }}>
                    {colonnes().slice(0, 6).map((c) => (
                      <td key={c.entete} style={{ padding: '.5rem .4rem' }}>
                        {String(c.valeur(l) ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
