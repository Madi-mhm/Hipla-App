/**
 * ADAPTATEUR DE FACTURE
 *
 * Traduit une pièce du registre vers le modèle attendu par le gabarit.
 *
 * Ce fichier était annoncé comme le seul de la chaîne PDF destiné à
 * changer à la refonte. C'est exactement ce qui se produit : il lit
 * désormais `pieces`, `pieces_lignes` et `tiers` au lieu de `factures`,
 * `lignes_document` et `clients`. Le modèle et le gabarit n'ont pas
 * bougé d'une ligne.
 */

import { createClient } from '@/lib/supabase/server';
import {
  centimes, ventilerParTaux, verifierCoherence,
  type ModeleFacture, type LigneFacture, type MentionsEmetteur,
  type NatureFacture,
} from '@/lib/facture-modele';

type Resultat =
  | { modele: ModeleFacture; erreur?: never }
  | { modele?: never; erreur: string };

/** Les mentions gelées sont du jsonb : on les relit prudemment. */
function texte(source: Record<string, unknown>, cle: string): string | null {
  const v = source[cle];
  if (typeof v === 'string' && v.trim() !== '') return v;
  if (typeof v === 'number') return String(v);
  return null;
}

function nombre(source: Record<string, unknown>, cle: string, defaut: number): number {
  const v = source[cle];
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return defaut;
}

function lireMentions(source: Record<string, unknown>): MentionsEmetteur {
  return {
    raisonSociale: texte(source, 'raison_sociale') ?? '',
    formeJuridique: texte(source, 'forme_juridique') ?? '',
    capital: nombre(source, 'capital', 0),
    siren: texte(source, 'siren') ?? '',
    siret: texte(source, 'siret') ?? '',
    rcs: texte(source, 'rcs'),
    tvaIntracom: texte(source, 'tva_intracom'),
    codeApe: texte(source, 'code_ape'),
    adresse: texte(source, 'adresse') ?? '',
    codePostal: texte(source, 'code_postal') ?? '',
    ville: texte(source, 'ville') ?? '',
    email: texte(source, 'email'),
    telephone: texte(source, 'telephone'),
    siteWeb: texte(source, 'site_web'),
    iban: texte(source, 'iban'),
    bic: texte(source, 'bic'),
    banqueNom: texte(source, 'banque_nom'),
    penalites: texte(source, 'penalites')
      ?? "trois fois le taux d'intérêt légal en vigueur",
    indemniteRecouvrement: nombre(source, 'indemnite_recouvrement', 40),
    escompte: texte(source, 'escompte')
      ?? 'Aucun escompte pour paiement anticipé',
    mediateurNom: texte(source, 'mediateur_nom'),
    mediateurAdresse: texte(source, 'mediateur_adresse'),
    mediateurSite: texte(source, 'mediateur_site'),
    rcProAssureur: texte(source, 'rc_pro_assureur'),
    rcProPolice: texte(source, 'rc_pro_police'),
    rcProCouverture: texte(source, 'rc_pro_couverture'),
    conditionsGenerales: texte(source, 'conditions_generales'),
  };
}

/**
 * Charge une pièce de vente et la traduit en modèle.
 *
 * Les droits sont ceux de l'appelant : la lecture passe par le client
 * Supabase de session, donc par les politiques RLS.
 */
export async function chargerModeleFacture(id: string): Promise<Resultat> {
  const supabase = await createClient();

  const { data: piece, error } = await supabase
    .from('pieces')
    .select('*, tiers(*)')
    .eq('id', id)
    .single();

  if (error || !piece) {
    return { erreur: 'Facture introuvable ou inaccessible.' };
  }

  if (piece.nature !== 'vente' && piece.nature !== 'avoir') {
    return { erreur: "Cette pièce n'est pas un document de vente." };
  }

  const tiers = piece.tiers as Record<string, unknown> | null;
  if (!tiers) return { erreur: 'Client de la facture introuvable.' };

  const { data: lignesBrutes } = await supabase
    .from('pieces_lignes')
    .select('*')
    .eq('piece_id', id)
    .order('ordre');

  const lignes: LigneFacture[] = (lignesBrutes ?? []).map((l) => ({
    libelle: String(l.libelle ?? ''),
    quantite: Number(l.quantite ?? 0),
    unite: l.unite ? String(l.unite) : null,
    prixUnitaireHt: Number(l.prix_unitaire_ht ?? 0),
    tauxTva: Number(l.taux_tva ?? 0),
    montantHt: centimes(Number(l.montant_ht ?? 0)),
    montantTva: centimes(Number(l.montant_tva ?? 0)),
    montantTtc: centimes(Number(l.montant_ttc ?? 0)),
  }));

  if (lignes.length === 0) {
    return { erreur: 'Cette facture ne comporte aucune ligne.' };
  }

  // Les mentions gelées à l'émission font foi. Un brouillon n'en a pas
  // encore : on prend l'état courant, et le document sort marqué
  // « brouillon ».
  const brouillon = piece.etat === 'brouillon';
  let source = (piece.mentions_gelees as Record<string, unknown> | null) ?? null;

  if (!source) {
    const { data: vivantes } = await supabase.rpc('mentions_entreprise');
    source = (vivantes as Record<string, unknown> | null) ?? null;
  }
  if (!source) return { erreur: "Mentions de l'entreprise indisponibles." };

  const emetteur = lireMentions(source);

  if (!emetteur.iban) {
    return {
      erreur:
        "IBAN de l'entreprise absent : la facture ne serait pas payable. " +
        'Réglages → Entreprise.',
    };
  }

  const acomptes = centimes(Number(piece.acomptes_deduits ?? 0));
  const totalTtc = centimes(Number(piece.montant_ttc ?? 0));

  const modele: ModeleFacture = {
    numero: piece.numero_piece ? String(piece.numero_piece) : null,
    // Un avoir garde son intitulé propre ; l'acompte et le solde se
    // lisent sur l'origine, la nature ne distinguant que le sens.
    nature: (piece.nature === 'avoir'
      ? 'avoir'
      : piece.origine === 'acompte' || piece.origine === 'solde'
        ? piece.origine
        : 'facture') as NatureFacture,
    brouillon,

    emetteur,
    destinataire: {
      nom: String(tiers.nom ?? ''),
      contact: tiers.contact ? String(tiers.contact) : null,
      adresse: tiers.adresse ? String(tiers.adresse) : null,
      codePostal: tiers.code_postal ? String(tiers.code_postal) : null,
      ville: tiers.ville ? String(tiers.ville) : null,
      pays: String(tiers.pays ?? 'France'),
      siret: tiers.siret ? String(tiers.siret) : null,
      tvaIntracom: tiers.tva_intracom ? String(tiers.tva_intracom) : null,
      estParticulier: tiers.type === 'particulier',
    },

    dateEmission: String(piece.date_piece),
    dateEcheance: String(piece.date_echeance ?? piece.date_piece),
    delaiPaiement: Number(piece.delai_paiement ?? 15),
    datePrestation: piece.date_prestation ? String(piece.date_prestation) : null,
    periodeDebut: piece.periode_debut ? String(piece.periode_debut) : null,
    periodeFin: piece.periode_fin ? String(piece.periode_fin) : null,

    objet: piece.objet ? String(piece.objet) : null,
    conditions: null,

    lignes,
    totauxParTaux: ventilerParTaux(lignes),
    totalHt: centimes(Number(piece.montant_ht ?? 0)),
    totalTva: centimes(Number(piece.montant_tva ?? 0)),
    totalTtc,
    acomptesDeduits: acomptes,
    netAPayer: centimes(Number(piece.net_a_payer ?? totalTtc - acomptes)),

    encaisseLe: piece.paye_le ? String(piece.paye_le) : null,
    montantEncaisse: centimes(Number(piece.montant_regle ?? 0)),
  };

  // Dernier verrou : mieux vaut aucun document qu'un document dont les
  // chiffres ne tiennent pas.
  const incoherence = verifierCoherence(modele, {
    ht: modele.totalHt,
    tva: modele.totalTva,
    ttc: modele.totalTtc,
  });
  if (incoherence) return { erreur: incoherence };

  return { modele };
}
