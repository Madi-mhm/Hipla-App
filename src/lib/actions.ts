/**
 * MOTEUR DU CENTRE D'ACTION
 *
 * Les règles dépendent du rôle : un contributeur n'a pas à voir les
 * échéances déclaratives, l'état des sauvegardes ou les frais à ratifier —
 * ce ne sont pas ses responsabilités, et les afficher dilue les rares
 * actions qui le concernent vraiment.
 *
 * Une action disparaît quand la condition qui l'a créée disparaît, jamais
 * par un clic « vu ».
 */

import { createClient } from '@/lib/supabase/server';
import { daysUntil } from '@/lib/format';
import type { Role } from '@/lib/permissions';

export type Urgence = 'bloquant' | 'important' | 'a_faire' | 'info';

export type Action = {
  id: string;
  urgence: Urgence;
  titre: string;
  detail?: string;
  href: string;
  libelleLien: string;
  compte?: number;
};

const ORDRE: Record<Urgence, number> = {
  bloquant: 0, important: 1, a_faire: 2, info: 3,
};

export const LIBELLE_URGENCE: Record<Urgence, string> = {
  bloquant: 'Bloquant',
  important: 'Important',
  a_faire: 'À faire',
  info: 'Information',
};

export const CLASSE_URGENCE: Record<Urgence, string> = {
  bloquant: 'badge--danger',
  important: 'badge--warning',
  a_faire: 'badge--info',
  info: 'badge--neutral',
};

/** Échéances de l'exercice. Passeront en base à la ronde 10. */
export const ECHEANCES = [
  { libelle: 'Déclaration initiale CFE (formulaire 1447-C)', date: '2026-12-31' },
  { libelle: 'Clôture du premier exercice', date: '2027-09-30' },
  { libelle: 'Déclaration de TVA CA12E', date: '2027-12-31' },
  { libelle: 'Liasse fiscale (2065)', date: '2027-12-31' },
];

export async function construireActions(
  role: Role,
  utilisateurId: string
): Promise<Action[]> {
  const supabase = await createClient();
  const actions: Action[] = [];

  // Le propriétaire pilote l'entreprise ; le contributeur saisit ses
  // dépenses. Deux centres d'action distincts, pas une version filtrée
  // du même écran.
  const pilote = role === 'proprietaire';

  const [depenses, deplacements, justificatifs] = await Promise.all([
    supabase.from('depenses')
      .select('id, statut, fournisseur, montant_ttc, cree_par, motif_rejet'),
    supabase.from('deplacements')
      .select('id, statut, depart, arrivee, cree_par, motif_rejet'),
    supabase.from('justificatifs').select('depense_id'),
  ]);

  const lignesDep = depenses.data ?? [];
  const lignesDepl = deplacements.data ?? [];
  const avecJustif = new Set((justificatifs.data ?? []).map((j) => j.depense_id));

  // ================================================================
  // RÈGLES COMMUNES À TOUS LES RÔLES
  // ================================================================

  // Saisies rejetées : celui qui les a créées doit les corriger.
  const mesRejets = lignesDep.filter(
    (d) => d.statut === 'rejetee' && d.cree_par === utilisateurId
  );
  if (mesRejets.length > 0) {
    actions.push({
      id: 'mes-depenses-rejetees',
      urgence: 'important',
      titre: `${mesRejets.length} dépense${mesRejets.length > 1 ? 's' : ''} rejetée${mesRejets.length > 1 ? 's' : ''}`,
      detail: mesRejets[0].motif_rejet
        ? `Motif : ${mesRejets[0].motif_rejet}`
        : 'À corriger puis soumettre à nouveau.',
      href: '/depenses',
      libelleLien: 'Corriger',
      compte: mesRejets.length,
    });
  }

  const mesRejetsDepl = lignesDepl.filter(
    (d) => d.statut === 'rejetee' && d.cree_par === utilisateurId
  );
  if (mesRejetsDepl.length > 0) {
    actions.push({
      id: 'mes-trajets-rejetes',
      urgence: 'important',
      titre: `${mesRejetsDepl.length} trajet${mesRejetsDepl.length > 1 ? 's' : ''} rejeté${mesRejetsDepl.length > 1 ? 's' : ''}`,
      detail: 'À corriger puis soumettre à nouveau.',
      href: '/deplacements',
      libelleLien: 'Corriger',
      compte: mesRejetsDepl.length,
    });
  }

  // Mes saisies sans justificatif : à compléter avant validation.
  const mesSansJustif = lignesDep.filter(
    (d) => d.cree_par === utilisateurId && !avecJustif.has(d.id)
  );
  if (mesSansJustif.length > 0) {
    actions.push({
      id: 'mes-sans-justificatif',
      urgence: 'a_faire',
      titre: `${mesSansJustif.length} de vos dépenses sans justificatif`,
      detail: "Sans pièce jointe, la charge n'est pas déductible.",
      href: '/depenses',
      libelleLien: 'Compléter',
      compte: mesSansJustif.length,
    });
  }

  // ================================================================
  // RÈGLES RÉSERVÉES AU CONTRIBUTEUR
  // ================================================================
  if (!pilote) {
    const mesEnAttente = lignesDep.filter(
      (d) => d.statut === 'en_attente' && d.cree_par === utilisateurId
    ).length + lignesDepl.filter(
      (d) => d.statut === 'en_attente' && d.cree_par === utilisateurId
    ).length;

    if (mesEnAttente > 0) {
      actions.push({
        id: 'mes-saisies-en-attente',
        urgence: 'info',
        titre: `${mesEnAttente} saisie${mesEnAttente > 1 ? 's' : ''} en attente de validation`,
        detail: 'Rien à faire de votre côté.',
        href: '/depenses',
        libelleLien: 'Voir',
        compte: mesEnAttente,
      });
    }

    return actions.sort((a, b) => ORDRE[a.urgence] - ORDRE[b.urgence]);
  }

  // ================================================================
  // RÈGLES RÉSERVÉES AU PROPRIÉTAIRE
  // ================================================================

  const [vehicules, frais, sauvegardes] = await Promise.all([
    supabase.from('vehicules').select('id, libelle, date_ct').eq('actif', true),
    supabase.from('frais_creation').select('id, statut_reprise, montant_ttc'),
    supabase.from('sauvegardes').select('demarree_le, statut')
      .eq('statut', 'reussie').order('demarree_le', { ascending: false }).limit(1),
  ]);

  // ---- BLOQUANT : sauvegarde absente ou trop ancienne ----
  const derniere = (sauvegardes.data ?? [])[0];
  if (!derniere) {
    actions.push({
      id: 'aucune-sauvegarde',
      urgence: 'bloquant',
      titre: 'Aucune sauvegarde enregistrée',
      detail: "Supabase n'en fournit aucune sur le palier gratuit.",
      href: '/reglages/supervision',
      libelleLien: 'Sauvegarder',
    });
  } else {
    const jours = -daysUntil(derniere.demarree_le);
    if (jours > 10) {
      actions.push({
        id: 'sauvegarde-ancienne',
        urgence: 'bloquant',
        titre: `Dernière sauvegarde il y a ${jours} jours`,
        detail: 'La sauvegarde automatique semble avoir échoué.',
        href: '/reglages/supervision',
        libelleLien: 'Vérifier',
      });
    }
  }

  // ---- BLOQUANT : dépense validée sans justificatif ----
  const sansJustif = lignesDep.filter(
    (d) => d.statut === 'validee' && !avecJustif.has(d.id)
  );
  if (sansJustif.length > 0) {
    actions.push({
      id: 'sans-justificatif',
      urgence: 'bloquant',
      titre: `${sansJustif.length} dépense${sansJustif.length > 1 ? 's' : ''} validée${sansJustif.length > 1 ? 's' : ''} sans justificatif`,
      detail: "Sans pièce, la charge n'est pas déductible et la TVA n'est pas récupérable.",
      href: '/depenses',
      libelleLien: 'Compléter',
      compte: sansJustif.length,
    });
  }

  // ---- BLOQUANT : échéance à moins de 7 jours ----
  for (const e of ECHEANCES) {
    const j = daysUntil(e.date);
    if (j >= 0 && j <= 7) {
      actions.push({
        id: `echeance-${e.date}`,
        urgence: 'bloquant',
        titre: e.libelle,
        detail: `Échéance dans ${j} jour${j > 1 ? 's' : ''}.`,
        href: '/echeances',
        libelleLien: 'Voir',
      });
    }
  }

  // ---- IMPORTANT : saisies à valider ----
  const depAttente = lignesDep.filter((d) => d.statut === 'en_attente');
  if (depAttente.length > 0) {
    actions.push({
      id: 'depenses-attente',
      urgence: 'important',
      titre: `${depAttente.length} dépense${depAttente.length > 1 ? 's' : ''} à valider`,
      detail: depAttente.slice(0, 3).map((d) => d.fournisseur).join(', ')
        + (depAttente.length > 3 ? '…' : ''),
      href: '/depenses',
      libelleLien: 'Valider',
      compte: depAttente.length,
    });
  }

  const deplAttente = lignesDepl.filter((d) => d.statut === 'en_attente');
  if (deplAttente.length > 0) {
    actions.push({
      id: 'deplacements-attente',
      urgence: 'important',
      titre: `${deplAttente.length} trajet${deplAttente.length > 1 ? 's' : ''} à valider`,
      detail: deplAttente.slice(0, 3).map((d) => `${d.depart} → ${d.arrivee}`).join(', ')
        + (deplAttente.length > 3 ? '…' : ''),
      href: '/deplacements',
      libelleLien: 'Valider',
      compte: deplAttente.length,
    });
  }

  // ---- IMPORTANT : frais de création non ratifiés ----
  const aRatifier = (frais.data ?? []).filter((f) => f.statut_reprise === 'a_valider');
  if (aRatifier.length > 0) {
    const total = aRatifier.reduce((s, f) => s + Number(f.montant_ttc), 0);
    actions.push({
      id: 'frais-a-ratifier',
      urgence: 'important',
      titre: `${aRatifier.length} frais de création à ratifier`,
      detail: `${total.toFixed(2).replace('.', ',')} € engagés avant l'immatriculation. Sans ratification en AG, ces dépenses restent personnelles.`,
      href: '/frais-creation',
      libelleLien: 'Traiter',
      compte: aRatifier.length,
    });
  }

  // ---- IMPORTANT : échéance à moins de 30 jours ----
  for (const e of ECHEANCES) {
    const j = daysUntil(e.date);
    if (j > 7 && j <= 30) {
      actions.push({
        id: `echeance-${e.date}`,
        urgence: 'important',
        titre: e.libelle,
        detail: `Échéance dans ${j} jours.`,
        href: '/echeances',
        libelleLien: 'Voir',
      });
    }
  }

  // ---- Contrôle technique des véhicules ----
  for (const v of vehicules.data ?? []) {
    if (!v.date_ct) continue;
    const j = daysUntil(v.date_ct);
    if (j < 0) {
      actions.push({
        id: `ct-${v.id}`,
        urgence: 'bloquant',
        titre: `Contrôle technique dépassé — ${v.libelle}`,
        detail: `Échu depuis ${Math.abs(j)} jours.`,
        href: '/reglages/vehicules',
        libelleLien: 'Voir',
      });
    } else if (j <= 60) {
      actions.push({
        id: `ct-${v.id}`,
        urgence: j <= 15 ? 'important' : 'a_faire',
        titre: `Contrôle technique — ${v.libelle}`,
        detail: `À passer dans ${j} jours.`,
        href: '/reglages/vehicules',
        libelleLien: 'Voir',
      });
    }
  }

  // ---- INFO : échéance suivante ----
  const prochaine = ECHEANCES
    .map((e) => ({ ...e, j: daysUntil(e.date) }))
    .filter((e) => e.j > 30)
    .sort((a, b) => a.j - b.j)[0];
  if (prochaine) {
    actions.push({
      id: 'prochaine-echeance',
      urgence: 'info',
      titre: prochaine.libelle,
      detail: `Dans ${prochaine.j} jours.`,
      href: '/echeances',
      libelleLien: 'Voir',
    });
  }

  return actions.sort((a, b) => ORDRE[a.urgence] - ORDRE[b.urgence]);
}
