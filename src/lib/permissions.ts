/**
 * Permissions — miroir applicatif du modèle défini en base.
 *
 * ⚠️ Ces fonctions servent à masquer l'interface, PAS à sécuriser les données.
 * La sécurité réelle est assurée par les politiques RLS de PostgreSQL : même
 * si quelqu'un contournait l'interface, la base refuserait la requête.
 * L'interface ne fait que ne pas proposer ce qui sera de toute façon refusé.
 */

export type Role = 'proprietaire' | 'contributeur' | 'comptable' | 'salarie';

export type Module =
  | 'entreprise' | 'utilisateurs' | 'depenses' | 'ventes' | 'abonnements'
  | 'banque' | 'tva' | 'echeances' | 'documents' | 'exports' | 'audit'
  | 'commentaires' | 'taches' | 'audit_comptable'
  | 'clients' | 'prestations';

export type Action =
  | 'read' | 'create' | 'update' | 'delete'
  | 'validate' | 'export' | 'admin' | 'revue';

const DROITS: Record<Role, Partial<Record<Module, Action[]>>> = {
  proprietaire: {
    entreprise: ['read', 'update'],
    utilisateurs: ['read', 'create', 'update', 'delete'],
    depenses: ['read', 'create', 'update', 'delete', 'validate', 'revue'],
    ventes: ['read', 'create', 'update', 'delete', 'validate'],
    clients: ['read', 'create', 'update', 'delete'],
    prestations: ['read', 'create', 'update', 'delete'],
    abonnements: ['read', 'create', 'update', 'delete'],
    banque: ['read', 'update'],
    tva: ['read', 'validate'],
    echeances: ['read', 'update'],
    documents: ['read', 'create', 'delete'],
    exports: ['read', 'export'],
    audit: ['read'],
    audit_comptable: ['read'],
    commentaires: ['read', 'create', 'update', 'delete'],
    taches: ['read', 'create', 'update', 'delete'],
  },
  contributeur: {
    entreprise: ['read'],
    depenses: ['read', 'create'],   // saisie autorisée, validation non
    ventes: ['read'],
    clients: ['read'],
    prestations: ['read'],
    abonnements: ['read'],
    banque: ['read'],
    tva: ['read'],
    echeances: ['read'],
    documents: ['read', 'create'],
    exports: ['read'],
    commentaires: ['read'],
    taches: ['read'],
  },
  // Le comptable consulte, extrait et annote. Il ne modifie aucune
  // écriture : il signale, le propriétaire corrige. La correction reste
  // ainsi tracée au nom de celui qui en porte la responsabilité.
  comptable: {
    entreprise: ['read'],
    depenses: ['read', 'revue'],
    ventes: ['read'],
    clients: ['read'],
    prestations: ['read'],
    abonnements: ['read'],
    banque: ['read'],
    tva: ['read'],
    echeances: ['read'],
    documents: ['read'],
    exports: ['read', 'export'],
    // Journal restreint : les écritures comptables oui, les connexions
    // et la gestion des comptes non. Minimisation appliquée au prestataire.
    audit_comptable: ['read'],
    commentaires: ['read', 'create'],
    taches: ['read', 'create', 'update'],
  },
  salarie: {},
};

export function peut(role: Role | null | undefined, module: Module, action: Action): boolean {
  if (!role) return false;
  return DROITS[role]?.[module]?.includes(action) ?? false;
}

export const LIBELLE_ROLE: Record<Role, string> = {
  proprietaire: 'Propriétaire',
  contributeur: 'Contributeur',
  comptable: 'Comptable',
  salarie: 'Salarié',
};

export const DESCRIPTION_ROLE: Record<Role, string> = {
  proprietaire:
    "Accès complet. Valide les saisies, gère les accès et modifie les paramètres de l'entreprise.",
  contributeur:
    "Consulte tout. Peut saisir des dépenses et déposer des justificatifs : ces saisies passent en attente de validation par le propriétaire.",
  comptable:
    "Consulte l'ensemble des données, extrait les exports comptables, signale les anomalies et marque les écritures revues. Ne modifie ni ne valide aucune écriture.",
  salarie:
    "Accède uniquement à son espace personnel : contrat, bulletins, planning.",
};
