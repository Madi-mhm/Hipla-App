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
  | 'banque' | 'tva' | 'echeances' | 'documents' | 'exports' | 'audit';

export type Action =
  | 'read' | 'create' | 'update' | 'delete' | 'validate' | 'export' | 'admin';

const DROITS: Record<Role, Partial<Record<Module, Action[]>>> = {
  proprietaire: {
    entreprise: ['read', 'update'],
    utilisateurs: ['read', 'create', 'update', 'delete'],
    depenses: ['read', 'create', 'update', 'delete', 'validate'],
    ventes: ['read', 'create', 'update', 'delete', 'validate'],
    abonnements: ['read', 'create', 'update', 'delete'],
    banque: ['read', 'update'],
    tva: ['read', 'validate'],
    echeances: ['read', 'update'],
    documents: ['read', 'create', 'delete'],
    exports: ['read', 'export'],
    audit: ['read'],
  },
  contributeur: {
    entreprise: ['read'],
    depenses: ['read', 'create'],   // saisie autorisée, validation non
    ventes: ['read'],
    abonnements: ['read'],
    banque: ['read'],
    tva: ['read'],
    echeances: ['read'],
    documents: ['read', 'create'],
    exports: ['read'],
  },
  comptable: {
    entreprise: ['read'],
    depenses: ['read'],
    ventes: ['read'],
    abonnements: ['read'],
    banque: ['read'],
    tva: ['read'],
    echeances: ['read'],
    documents: ['read'],
    exports: ['read', 'export'],
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
    "Consulte tout et exporte les données comptables. N'écrit aucune écriture.",
  salarie:
    "Accède uniquement à son espace personnel : contrat, bulletins, planning.",
};
