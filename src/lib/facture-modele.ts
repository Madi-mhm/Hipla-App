/**
 * MODÈLE DE FACTURE
 *
 * Contrat entre les données et le gabarit. Le générateur de PDF ne lit
 * jamais les tables : il lit ce modèle.
 *
 * C'est ce qui lui permettra de survivre à la refonte du registre. Le
 * jour où les factures vivront dans `pieces`, seul l'adaptateur changera ;
 * ce fichier et le gabarit resteront intacts.
 *
 * Aucun import ici : ce module doit rester utilisable des deux côtés de
 * la frontière serveur / client.
 */

export type NatureFacture = 'facture' | 'acompte' | 'solde' | 'avoir';

export type LigneFacture = {
  libelle: string;
  quantite: number;
  unite: string | null;
  prixUnitaireHt: number;
  tauxTva: number;
  montantHt: number;
  montantTva: number;
  montantTtc: number;
};

/** Ce que l'émetteur doit faire figurer sur toute facture. */
export type MentionsEmetteur = {
  raisonSociale: string;
  formeJuridique: string;
  capital: number;
  siren: string;
  siret: string;
  rcs: string | null;
  tvaIntracom: string | null;
  codeApe: string | null;
  adresse: string;
  codePostal: string;
  ville: string;
  email: string | null;
  telephone: string | null;
  siteWeb: string | null;
  iban: string | null;
  bic: string | null;
  banqueNom: string | null;
  penalites: string;
  indemniteRecouvrement: number;
  escompte: string;
  mediateurNom: string | null;
  mediateurAdresse: string | null;
  mediateurSite: string | null;
  rcProAssureur: string | null;
  rcProPolice: string | null;
  rcProCouverture: string | null;
  conditionsGenerales: string | null;
};

export type Destinataire = {
  nom: string;
  contact: string | null;
  adresse: string | null;
  codePostal: string | null;
  ville: string | null;
  pays: string;
  siret: string | null;
  tvaIntracom: string | null;
  estParticulier: boolean;
};

export type TotalParTaux = {
  taux: number;
  baseHt: number;
  montantTva: number;
};

export type ModeleFacture = {
  numero: string | null;          // null tant que la facture est un brouillon
  nature: NatureFacture;
  brouillon: boolean;

  emetteur: MentionsEmetteur;
  destinataire: Destinataire;

  dateEmission: string;
  dateEcheance: string;
  delaiPaiement: number;
  datePrestation: string | null;
  periodeDebut: string | null;
  periodeFin: string | null;

  objet: string | null;
  conditions: string | null;

  lignes: LigneFacture[];
  totauxParTaux: TotalParTaux[];
  totalHt: number;
  totalTva: number;
  totalTtc: number;
  acomptesDeduits: number;
  netAPayer: number;

  encaisseLe: string | null;
  montantEncaisse: number;
};

/* ------------------------------------------------------------------ */
/* Calculs                                                             */
/* ------------------------------------------------------------------ */

/** Arrondi comptable au centime. */
export function centimes(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Ventilation de la TVA par taux.
 *
 * Mention obligatoire : une facture qui mêle 20 % et 10 % doit montrer
 * la base et la taxe de chaque taux séparément, pas seulement le total.
 */
export function ventilerParTaux(lignes: LigneFacture[]): TotalParTaux[] {
  const parTaux = new Map<number, TotalParTaux>();

  for (const l of lignes) {
    const existant = parTaux.get(l.tauxTva);
    if (existant) {
      existant.baseHt = centimes(existant.baseHt + l.montantHt);
      existant.montantTva = centimes(existant.montantTva + l.montantTva);
    } else {
      parTaux.set(l.tauxTva, {
        taux: l.tauxTva,
        baseHt: centimes(l.montantHt),
        montantTva: centimes(l.montantTva),
      });
    }
  }

  return Array.from(parTaux.values()).sort((a, b) => b.taux - a.taux);
}

/**
 * Contrôle de cohérence avant génération.
 *
 * Les totaux stockés sont recalculés par déclencheur à chaque
 * modification de ligne. S'ils s'écartent de la somme des lignes, l'un
 * des deux est faux — et il vaut mieux ne pas produire de document du
 * tout que d'en produire un dont les chiffres ne tiennent pas.
 *
 * Renvoie null si tout concorde, un message sinon.
 */
export function verifierCoherence(
  m: ModeleFacture,
  stocke: { ht: number; tva: number; ttc: number }
): string | null {
  const sommeHt = centimes(m.lignes.reduce((s, l) => s + l.montantHt, 0));
  const sommeTva = centimes(m.lignes.reduce((s, l) => s + l.montantTva, 0));
  const sommeTtc = centimes(m.lignes.reduce((s, l) => s + l.montantTtc, 0));

  const ecarts: string[] = [];
  if (Math.abs(sommeHt - stocke.ht) > 0.01) {
    ecarts.push(`HT : lignes ${sommeHt} € contre ${stocke.ht} € enregistrés`);
  }
  if (Math.abs(sommeTva - stocke.tva) > 0.01) {
    ecarts.push(`TVA : lignes ${sommeTva} € contre ${stocke.tva} € enregistrés`);
  }
  if (Math.abs(sommeTtc - stocke.ttc) > 0.01) {
    ecarts.push(`TTC : lignes ${sommeTtc} € contre ${stocke.ttc} € enregistrés`);
  }

  if (ecarts.length === 0) return null;
  return `Les totaux enregistrés ne correspondent pas aux lignes — ${ecarts.join(' ; ')}.`;
}

/* ------------------------------------------------------------------ */
/* Mentions légales                                                    */
/* ------------------------------------------------------------------ */

/**
 * Le bloc de mentions imprimé en pied de facture.
 *
 * Toute la connaissance réglementaire du document vit ici, en un seul
 * endroit. Le gabarit se contente de mettre en page ce que cette
 * fonction renvoie.
 */
export function mentionsLegales(m: ModeleFacture): string[] {
  const e = m.emetteur;
  const lignes: string[] = [];

  // Pénalités de retard et indemnité : exigées entre professionnels,
  // sans conséquence de les porter aussi sur une facture de particulier.
  lignes.push(
    `En cas de retard de paiement, des pénalités sont exigibles au taux de ` +
    `${e.penalites.toLowerCase()}, sans qu'un rappel soit nécessaire.`
  );
  lignes.push(
    `Indemnité forfaitaire pour frais de recouvrement : ` +
    `${e.indemniteRecouvrement.toFixed(2).replace('.', ',')} €.`
  );
  lignes.push(`${e.escompte}.`);

  // Prestations de services : la taxe devient exigible à l'encaissement.
  // L'indiquer renseigne le client sur la date à laquelle il pourra
  // lui-même déduire cette TVA.
  if (m.totalTva > 0) {
    lignes.push(
      `TVA exigible d'après les encaissements (art. 269-2-c du CGI).`
    );
  }

  // Médiation de la consommation : obligatoire envers un particulier.
  if (m.destinataire.estParticulier && e.mediateurNom) {
    const coord = [e.mediateurNom, e.mediateurAdresse, e.mediateurSite]
      .filter(Boolean).join(' — ');
    lignes.push(
      `En cas de litige non résolu, vous pouvez saisir gratuitement le ` +
      `médiateur de la consommation : ${coord}.`
    );
  }

  // Assurance : facultative pour cette activité, mais souvent réclamée.
  if (e.rcProAssureur) {
    const police = e.rcProPolice ? ` — police ${e.rcProPolice}` : '';
    const zone = e.rcProCouverture ? ` — ${e.rcProCouverture}` : '';
    lignes.push(
      `Responsabilité civile professionnelle : ${e.rcProAssureur}${police}${zone}.`
    );
  }

  if (e.conditionsGenerales) lignes.push(e.conditionsGenerales);

  return lignes;
}

/** Intitulé du document, selon sa nature. */
export function intituleDocument(nature: NatureFacture): string {
  switch (nature) {
    case 'avoir':   return 'AVOIR';
    case 'acompte': return "FACTURE D'ACOMPTE";
    case 'solde':   return 'FACTURE DE SOLDE';
    default:        return 'FACTURE';
  }
}

/** Nom du fichier téléchargé. */
export function nomFichier(m: ModeleFacture): string {
  const base = m.numero ?? `brouillon-${m.destinataire.nom}`;
  return `${base.replace(/[^\w.-]+/g, '-')}.pdf`;
}
