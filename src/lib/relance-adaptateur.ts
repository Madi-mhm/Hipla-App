/**
 * ADAPTATEUR DE RELANCE
 *
 * Lit le registre et rend un modèle prêt à mettre en page. Toute la
 * connaissance de la base est ici ; le gabarit ne connaît que le modèle.
 *
 * Une relance ne se produit que sur une facture ÉMISE et NON SOLDÉE.
 * Refuser les autres cas ici plutôt que de produire un courrier absurde
 * est la seule protection contre l'envoi d'une relance à un client qui
 * a déjà payé.
 */

import { createClient } from '@/lib/supabase/server';
import {
  degrePourRetard, type ModeleRelance, type ReglementRecu,
} from '@/lib/relance-modele';

export type ResultatRelance = { modele: ModeleRelance } | { erreur: string };

/** Deux centimes de tolérance : un solde de 0,004 € est un solde nul. */
function centimes(v: number): number {
  return Math.round(v * 100) / 100;
}

function texte(v: unknown): string | null {
  const t = typeof v === 'string' ? v.trim() : '';
  return t === '' ? null : t;
}

export async function chargerModeleRelance(id: string): Promise<ResultatRelance> {
  const supabase = await createClient();

  const { data: piece, error } = await supabase
    .from('pieces')
    .select('*, tiers(*)')
    .eq('id', id)
    .single();

  if (error || !piece) return { erreur: 'Facture introuvable ou inaccessible.' };
  if (piece.nature !== 'vente') {
    return { erreur: 'Une relance ne se produit que sur une facture de vente.' };
  }
  if (piece.etat === 'brouillon') {
    return { erreur: 'Cette facture n\u2019est pas encore émise : rien à relancer.' };
  }
  if (piece.etat === 'annulee') {
    return { erreur: 'Cette facture est annulée.' };
  }

  const resteDu = centimes(
    Number(piece.net_a_payer ?? 0) - Number(piece.montant_regle ?? 0));

  if (resteDu <= 0.005) {
    return {
      erreur: 'Cette facture est soldée. Relancer un client qui a payé est '
            + 'la meilleure façon de le perdre.',
    };
  }

  const tiers = piece.tiers as Record<string, unknown> | null;

  // Le client complet vit dans `clients` : `tiers` ne porte que le nom
  // et le pays. L'adresse postale est indispensable à un courrier.
  const { data: client } = await supabase
    .from('clients')
    .select('nom, adresse, code_postal, ville, contact_nom')
    .ilike('nom', String(tiers?.nom ?? piece.tiers_libelle))
    .limit(1).maybeSingle();

  const { data: reglementsBruts } = await supabase
    .from('reglements')
    .select('date_reglement, montant, moyen')
    .eq('piece_id', id)
    .order('date_reglement');

  const reglements: ReglementRecu[] = (reglementsBruts ?? []).map((r) => ({
    date: String(r.date_reglement),
    montant: centimes(Number(r.montant ?? 0)),
    moyen: String(r.moyen ?? 'virement').replace(/_/g, ' '),
  }));

  // Les mentions gelées à l'émission font foi : c'est l'adresse de
  // l'époque qui figure sur la facture rappelée.
  let source = (piece.mentions_gelees as Record<string, unknown> | null) ?? null;
  if (!source) {
    const { data: vivantes } = await supabase.rpc('mentions_entreprise');
    source = (vivantes as Record<string, unknown> | null) ?? null;
  }
  if (!source) return { erreur: 'Mentions de l\u2019entreprise indisponibles.' };

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const echeance = texte(piece.date_echeance);

  // Le retard se compte en jours pleins depuis l'échéance. Sans
  // échéance, on considère qu'il n'y a pas de retard : on rappelle.
  const joursRetard = echeance
    ? Math.floor(
        (new Date(aujourdhui + 'T12:00:00').getTime()
         - new Date(echeance + 'T12:00:00').getTime()) / 86400000)
    : 0;

  const modele: ModeleRelance = {
    degre: degrePourRetard(joursRetard),

    entreprise:   String(source.raison_sociale ?? source.nom ?? 'Hipla Services'),
    adresse:      String(source.adresse ?? ''),
    codePostal:   String(source.code_postal ?? ''),
    ville:        String(source.ville ?? ''),
    telephone:    texte(source.telephone),
    courriel:     texte(source.email ?? source.courriel),
    iban:         texte(source.iban),
    bic:          texte(source.bic),
    banque:       texte(source.banque),
    mentionsPied: String(source.mentions_pied ?? source.pied_de_page ?? ''),

    clientNom:        String(client?.nom ?? piece.tiers_libelle),
    clientAdresse:    texte(client?.adresse),
    clientCodePostal: texte(client?.code_postal),
    clientVille:      texte(client?.ville),
    clientContact:    texte(client?.contact_nom),

    numeroPiece:  String(piece.numero_piece ?? '—'),
    dateEmission: String(piece.date_piece),
    dateEcheance: echeance,
    objet:        texte(piece.objet),
    montantTtc:   centimes(Number(piece.montant_ttc ?? 0)),
    montantRegle: centimes(Number(piece.montant_regle ?? 0)),
    resteDu,
    reglements,

    dateRelance: aujourdhui,
    joursRetard: Math.max(joursRetard, 0),
  };

  return { modele };
}
