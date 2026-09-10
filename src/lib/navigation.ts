/**
 * NAVIGATION — la seule définition des sections et de leurs onglets.
 *
 * Le menu latéral et les onglets d'en-tête lisent tous deux cette liste :
 * ils ne peuvent plus se contredire. Aucun import serveur ici, le fichier
 * est lu des deux côtés.
 */
import { peut, type Action, type Module, type Role } from './permissions';

export type CleSection =
  | 'accueil' | 'banque' | 'depenses' | 'deplacements' | 'ventes'
  | 'tiers' | 'tva' | 'comptabilite' | 'reglages';

type Droit = { module: Module; action?: Action };

export type Onglet = {
  href: string;
  libelle: string;
  /** Droit propre à l'onglet ; à défaut, celui de la section. */
  droit?: Droit;
  /** Plusieurs droits possibles : un seul suffit. */
  ou?: Droit[];
};

export type Section = {
  cle: CleSection;
  libelle: string;
  href: string;
  droit?: Droit;
  onglets: Onglet[];
};

export const SECTIONS: Section[] = [
  { cle: 'accueil', libelle: 'Accueil', href: '/', onglets: [] },
  {
    cle: 'banque', libelle: 'Banque', href: '/banque', droit: { module: 'banque' },
    onglets: [
      { href: '/banque', libelle: 'Opérations' },
      { href: '/banque/justificatifs', libelle: 'Justificatifs Qonto',
        droit: { module: 'banque', action: 'update' } },
    ],
  },
  {
    cle: 'depenses', libelle: 'Dépenses', href: '/depenses', droit: { module: 'depenses' },
    onglets: [
      { href: '/depenses', libelle: 'Toutes' },
      { href: '/depenses/nouvelle', libelle: 'Nouvelle dépense',
        droit: { module: 'depenses', action: 'create' } },
      { href: '/depenses/creation', libelle: 'Frais de création' },
    ],
  },
  {
    cle: 'deplacements', libelle: 'Déplacements', href: '/deplacements',
    droit: { module: 'depenses' },
    onglets: [
      { href: '/deplacements', libelle: 'Trajets' },
      { href: '/deplacements/nouveau', libelle: 'Nouveau trajet',
        droit: { module: 'depenses', action: 'create' } },
    ],
  },
  {
    cle: 'ventes', libelle: 'Ventes', href: '/ventes', droit: { module: 'ventes' },
    onglets: [
      { href: '/ventes', libelle: 'Factures' },
      { href: '/ventes/devis', libelle: 'Devis' },
      { href: '/ventes/relances', libelle: 'Relances' },
    ],
  },
  { cle: 'tiers', libelle: 'Tiers', href: '/tiers', droit: { module: 'clients' }, onglets: [] },
  {
    cle: 'tva', libelle: 'TVA', href: '/tva', droit: { module: 'tva' },
    onglets: [
      { href: '/tva', libelle: 'Suivi' },
      { href: '/tva/cloture', libelle: 'Déclarations' },
    ],
  },
  {
    cle: 'comptabilite', libelle: 'Comptabilité', href: '/comptabilite',
    droit: { module: 'exports' },
    onglets: [
      { href: '/comptabilite', libelle: 'Journal' },
      { href: '/comptabilite/exports', libelle: 'Exports' },
      { href: '/comptabilite/rapports', libelle: 'Rapports mensuels' },
      { href: '/comptabilite/associes', libelle: 'Associés', droit: { module: 'entreprise' } },
      { href: '/comptabilite/immobilisations', libelle: 'Immobilisations',
        droit: { module: 'depenses' } },
      { href: '/comptabilite/echeances', libelle: 'Échéances', droit: { module: 'echeances' } },
    ],
  },
  {
    cle: 'reglages', libelle: 'Réglages', href: '/reglages/entreprise',
    droit: { module: 'entreprise' },
    onglets: [
      { href: '/reglages/entreprise', libelle: 'Entreprise' },
      { href: '/reglages/utilisateurs', libelle: 'Utilisateurs',
        droit: { module: 'utilisateurs' } },
      { href: '/reglages/categories', libelle: 'Catégories', droit: { module: 'depenses' } },
      { href: '/reglages/prestations', libelle: 'Prestations', droit: { module: 'prestations' } },
      { href: '/reglages/vehicules', libelle: 'Véhicules', droit: { module: 'depenses' } },
      { href: '/reglages/documents', libelle: 'Documents', droit: { module: 'documents' } },
      { href: '/reglages/audit', libelle: "Journal d'audit",
        ou: [{ module: 'audit' }, { module: 'audit_comptable' }] },
      { href: '/reglages/sauvegardes', libelle: 'Sauvegardes',
        droit: { module: 'entreprise', action: 'update' } },
    ],
  },
];

function autorise(role: Role, droit?: Droit): boolean {
  return !droit || peut(role, droit.module, droit.action ?? 'read');
}

/** `href` couvre-t-il ce chemin ? « / » ne couvre que l'accueil. */
function couvre(chemin: string, href: string): boolean {
  if (href === '/') return chemin === '/';
  return chemin === href || chemin.startsWith(href + '/');
}

export function sectionsVisibles(role: Role): Section[] {
  return SECTIONS.filter((s) => autorise(role, s.droit));
}

export function ongletsVisibles(cle: CleSection, role: Role): Onglet[] {
  const s = SECTIONS.find((x) => x.cle === cle);
  if (!s) return [];
  return s.onglets.filter((o) =>
    o.ou ? o.ou.some((d) => autorise(role, d)) : autorise(role, o.droit ?? s.droit));
}

/** L'onglet dont l'adresse couvre le chemin au plus près. */
export function ongletActif(onglets: Onglet[], chemin: string): string | null {
  return onglets
    .filter((o) => couvre(chemin, o.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}

/** La section dont une adresse couvre le chemin au plus près. */
export function sectionActive(chemin: string): CleSection | null {
  let meilleure: { cle: CleSection; long: number } | null = null;
  for (const s of SECTIONS) {
    for (const h of [s.href, ...s.onglets.map((o) => o.href)]) {
      if (couvre(chemin, h) && (!meilleure || h.length > meilleure.long)) {
        meilleure = { cle: s.cle, long: h.length };
      }
    }
  }
  return meilleure?.cle ?? null;
}
