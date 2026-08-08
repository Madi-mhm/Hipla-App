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
import { ECHEANCES } from '@/lib/echeances';

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

// Les échéances vivent dans `echeances.ts` : ce module importe le client
// Supabase serveur et ne doit pas être atteignable depuis un composant client.
export { ECHEANCES } from '@/lib/echeances';

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

  const [depenses, deplacements, justificatifs, taches] = await Promise.all([
    // Le registre remplace `depenses` : sans cela, une saisie récente
    // n'apparaissait dans aucune alerte, et personne ne savait qu'elle
    // attendait une validation.
    supabase.from('pieces')
      .select('id, etat, tiers_libelle, montant_ttc, cree_par, motif_rejet')
      .in('nature', ['achat', 'creation', 'km']),
    supabase.from('deplacements')
      .select('id, statut, depart, arrivee, cree_par, motif_rejet'),
    supabase.from('justificatifs').select('depense_id'),
    supabase.from('taches')
      .select('id, titre, echeance, statut, assignee_a, priorite')
      .in('statut', ['a_faire', 'en_cours']),
  ]);

  // Le registre nomme l'état `etat` et le tiers `tiers_libelle`. On
  // normalise ici plutôt que de retoucher les vingt endroits qui lisent
  // `statut` et `fournisseur` — moins de surface de casse.
  const lignesDep = (depenses.data ?? []).map((p) => ({
    ...p,
    statut: p.etat,
    fournisseur: p.tiers_libelle,
  }));
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

  // Tâches qui me sont assignées : c'est par ce canal que le comptable
  // demande une pièce ou une correction sans passer par un courriel.
  const mesTaches = (taches.data ?? []).filter((t) => t.assignee_a === utilisateurId);
  const enRetard = mesTaches.filter((t) => t.echeance && daysUntil(t.echeance) < 0);

  if (enRetard.length > 0) {
    actions.push({
      id: 'taches-en-retard',
      urgence: 'important',
      titre: `${enRetard.length} tâche${enRetard.length > 1 ? 's' : ''} en retard`,
      detail: enRetard.slice(0, 2).map((t) => t.titre).join(' · '),
      href: '/taches',
      libelleLien: 'Traiter',
      compte: enRetard.length,
    });
  } else if (mesTaches.length > 0) {
    actions.push({
      id: 'taches-assignees',
      urgence: 'a_faire',
      titre: `${mesTaches.length} tâche${mesTaches.length > 1 ? 's' : ''} à traiter`,
      detail: mesTaches.slice(0, 2).map((t) => t.titre).join(' · '),
      href: '/taches',
      libelleLien: 'Voir',
      compte: mesTaches.length,
    });
  }

  // Mes saisies sans justificatif.
  // Réservé au contributeur : le propriétaire dispose déjà de la règle
  // globale plus bas, et afficher les deux produirait un doublon sur
  // les mêmes écritures.
  if (!pilote) {
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

  const [vehicules, frais, sauvegardes, commentaires, echeancesAbo, abosEngages,
         transactionsATraiter, synchroQonto, rapprochementsProposes,
         justificatifsQonto] = await Promise.all([
    supabase.from('vehicules').select('id, libelle, date_ct').eq('actif', true),
    supabase.from('pieces')
      .select('id, etat, montant_ttc').eq('nature', 'creation'),
    supabase.from('sauvegardes').select('demarree_le, statut')
      .eq('statut', 'reussie').order('demarree_le', { ascending: false }).limit(1),
    supabase.from('commentaires').select('id, type, contenu, numero_piece')
      .eq('statut', 'ouvert'),
    supabase.from('abonnement_echeances')
      .select('id, periode, statut, abonnements(nom)')
      .eq('statut', 'justificatif_manquant'),
    supabase.from('abonnements')
      .select('id, nom, engagement_jusquau, preavis_jours')
      .eq('statut', 'actif').not('engagement_jusquau', 'is', null),
    supabase.from('transactions_qonto')
      .select('id, libelle, montant, date_operation')
      .eq('statut_traitement', 'a_traiter')
      .eq('statut_qonto', 'completed')
      .eq('sens', 'debit'),
    supabase.from('synchronisations')
      .select('demarree_le')
      .eq('statut', 'reussie')
      .order('demarree_le', { ascending: false }).limit(1),
    supabase.from('pieces')
      .select('id, numero_piece, tiers_libelle, montant_ttc')
      .eq('statut_rapprochement', 'propose')
      .in('nature', ['achat', 'creation', 'km']),
    supabase.from('v_justificatifs_qonto').select('id, contrepartie, montant'),
  ]);

  // ---- IMPORTANT : justificatifs déposés dans Qonto ----
  const justifsQonto = justificatifsQonto.data ?? [];
  if (justifsQonto.length > 0) {
    actions.push({
      id: 'justificatifs-qonto',
      urgence: 'important',
      titre: `${justifsQonto.length} justificatif${justifsQonto.length > 1 ? 's' : ''} déposé${justifsQonto.length > 1 ? 's' : ''} dans Qonto`,
      detail: "Ces pièces attendent d'être transformées en écritures.",
      href: '/banque/justificatifs',
      libelleLien: 'Traiter',
      compte: justifsQonto.length,
    });
  }

  // ---- IMPORTANT : rapprochements proposés ----
  // Le montant vient de la banque, mais le lien entre l'opération et
  // l'écriture reste une interprétation : il appelle une confirmation.
  const aConfirmer = (rapprochementsProposes.data ?? []).map((p) => ({ ...p, fournisseur: p.tiers_libelle }));
  if (aConfirmer.length > 0) {
    actions.push({
      id: 'rapprochements-proposes',
      urgence: 'important',
      titre: `${aConfirmer.length} rapprochement${aConfirmer.length > 1 ? 's' : ''} à confirmer`,
      detail: aConfirmer.slice(0, 3).map((d) => d.fournisseur).join(', ')
        + (aConfirmer.length > 3 ? '…' : ''),
      href: '/depenses',
      libelleLien: 'Confirmer',
      compte: aConfirmer.length,
    });
  }

  // ---- BLOQUANT : prélèvements sans écriture comptable ----
  // C'est le contrôle qu'un vérificateur effectue en premier : une charge
  // sortie du compte sans écriture n'est ni déductible ni récupérable.
  const sansEcriture = transactionsATraiter.data ?? [];
  if (sansEcriture.length > 0) {
    const total = sansEcriture.reduce((s, t) => s + Number(t.montant), 0);
    actions.push({
      id: 'banque-a-traiter',
      urgence: 'important',
      titre: `${sansEcriture.length} prélèvement${sansEcriture.length > 1 ? 's' : ''} sans écriture`,
      detail: `${total.toFixed(2).replace('.', ',')} € sortis du compte sans dépense enregistrée.`,
      href: '/banque',
      libelleLien: 'Traiter',
      compte: sansEcriture.length,
    });
  }

  // ---- Synchronisation interrompue ----
  const derniereSynchro = (synchroQonto.data ?? [])[0];
  if (!derniereSynchro) {
    actions.push({
      id: 'qonto-jamais',
      urgence: 'a_faire',
      titre: 'Compte bancaire jamais synchronisé',
      detail: 'Les opérations Qonto ne sont pas encore rapprochées.',
      href: '/banque',
      libelleLien: 'Synchroniser',
    });
  } else if (-daysUntil(derniereSynchro.demarree_le) > 3) {
    actions.push({
      id: 'qonto-interrompue',
      urgence: 'important',
      titre: `Synchronisation bancaire interrompue depuis ${-daysUntil(derniereSynchro.demarree_le)} jours`,
      detail: "La clé Qonto a peut-être expiré ou été révoquée.",
      href: '/banque',
      libelleLien: 'Vérifier',
    });
  }

  // ---- IMPORTANT : justificatifs d'abonnement manquants ----
  // Regroupés en une seule action : huit abonnements ne doivent pas
  // produire huit alertes.
  const echManquantes = echeancesAbo.data ?? [];
  if (echManquantes.length > 0) {
    actions.push({
      id: 'abonnements-justificatifs',
      urgence: 'important',
      titre: `${echManquantes.length} justificatif${echManquantes.length > 1 ? 's' : ''} d'abonnement manquant${echManquantes.length > 1 ? 's' : ''}`,
      detail: "Sans facture, la TVA n'est pas récupérable sur ces prélèvements.",
      href: '/abonnements',
      libelleLien: 'Traiter',
      compte: echManquantes.length,
    });
  }

  // ---- Reconduction tacite ----
  for (const a of abosEngages.data ?? []) {
    if (!a.engagement_jusquau) continue;
    const j = daysUntil(a.engagement_jusquau);
    const marge = j - (a.preavis_jours ?? 30);
    if (j < 0 || j > 60) continue;

    actions.push({
      id: `reconduction-${a.id}`,
      urgence: marge <= 7 ? 'bloquant' : 'important',
      titre: `Reconduction tacite — ${a.nom}`,
      detail: marge > 0
        ? `Il reste ${marge} jours pour résilier avant reconduction automatique.`
        : 'Le délai de préavis est dépassé : la reconduction est acquise.',
      href: '/abonnements',
      libelleLien: 'Voir',
    });
  }

  // ---- IMPORTANT : signalements du comptable non résolus ----
  const signalements = commentaires.data ?? [];
  if (signalements.length > 0) {
    const pieces = signalements.filter((c) => c.type === 'demande_piece').length;
    actions.push({
      id: 'signalements-ouverts',
      urgence: 'important',
      titre: `${signalements.length} signalement${signalements.length > 1 ? 's' : ''} à traiter`,
      detail: pieces > 0
        ? `dont ${pieces} demande${pieces > 1 ? 's' : ''} de justificatif`
        : signalements[0].contenu.slice(0, 70),
      href: '/comptable',
      libelleLien: 'Traiter',
      compte: signalements.length,
    });
  }

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
  const aRatifier = (frais.data ?? []).filter((f) => f.etat === 'a_valider');
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
