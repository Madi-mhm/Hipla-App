/**
 * MODÈLE D'UNE RELANCE
 *
 * Une relance n'est PAS une facture. Elle ne porte aucun numéro de
 * pièce, n'engendre aucune TVA, n'entre dans aucun journal. Elle
 * rappelle un document déjà émis et constate ce qui reste dû.
 *
 * La distinction n'est pas formelle. Émettre une seconde facture pour
 * un solde impayé créerait un second chiffre d'affaires et une seconde
 * TVA collectée : sur une facture de 486 € dont 200 € sont réglés, on
 * aurait facturé 772 € pour une prestation qui en valait 486.
 *
 * TROIS DEGRÉS
 * Le ton monte, les mentions changent, et la loi n'autorise les
 * pénalités qu'après l'échéance.
 */

export type DegreRelance = 'rappel' | 'relance' | 'mise_en_demeure';

export type ReglementRecu = {
  date: string;
  montant: number;
  moyen: string;
};

export type ModeleRelance = {
  degre: DegreRelance;

  // L'émetteur
  entreprise: string;
  adresse: string;
  codePostal: string;
  ville: string;
  telephone: string | null;
  courriel: string | null;
  iban: string | null;
  bic: string | null;
  banque: string | null;
  mentionsPied: string;

  // Le destinataire
  clientNom: string;
  clientAdresse: string | null;
  clientCodePostal: string | null;
  clientVille: string | null;
  clientContact: string | null;

  // La facture rappelée
  numeroPiece: string;
  dateEmission: string;
  dateEcheance: string | null;
  objet: string | null;
  montantTtc: number;
  montantRegle: number;
  resteDu: number;
  reglements: ReglementRecu[];

  // Le contexte
  dateRelance: string;
  joursRetard: number;
};

/** Le degré se déduit du retard : on ne choisit pas, on constate. */
export function degrePourRetard(joursRetard: number): DegreRelance {
  if (joursRetard <= 0) return 'rappel';
  if (joursRetard <= 30) return 'relance';
  return 'mise_en_demeure';
}

export function intituleRelance(degre: DegreRelance): string {
  switch (degre) {
    case 'rappel':          return 'RAPPEL D\u2019ÉCHÉANCE';
    case 'relance':         return 'RELANCE';
    case 'mise_en_demeure': return 'MISE EN DEMEURE DE PAYER';
  }
}

/**
 * Le corps du courrier.
 *
 * Écrit en français d'affaires, sans agressivité au premier degré :
 * un client qui a simplement oublié ne doit pas se sentir accusé, et
 * un retard de trois jours n'est pas un litige.
 */
export function corpsRelance(m: ModeleRelance): string[] {
  const somme = (v: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
  const jour = (v: string) =>
    new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(v + 'T12:00:00'));

  const partiel = m.montantRegle > 0.005;

  if (m.degre === 'rappel') {
    return [
      `Nous vous informons que la facture ${m.numeroPiece} du ${jour(m.dateEmission)}, `
      + `d'un montant de ${somme(m.montantTtc)}, `
      + (m.dateEcheance ? `vient à échéance le ${jour(m.dateEcheance)}.` : `est exigible.`),

      partiel
        ? `Nous avons bien enregistré votre règlement de ${somme(m.montantRegle)}. `
          + `Le solde restant dû s'élève à ${somme(m.resteDu)}.`
        : `Cette facture demeure impayée à ce jour.`,

      `Si votre règlement a été effectué entre-temps, nous vous prions de ne pas `
      + `tenir compte de ce rappel.`,
    ];
  }

  if (m.degre === 'relance') {
    return [
      `Sauf erreur de notre part, la facture ${m.numeroPiece} du ${jour(m.dateEmission)}`
      + (m.dateEcheance ? `, échue le ${jour(m.dateEcheance)},` : '')
      + ` demeure impayée à ce jour, soit ${m.joursRetard} jour${m.joursRetard > 1 ? 's' : ''} de retard.`,

      partiel
        ? `Un règlement de ${somme(m.montantRegle)} a bien été enregistré. `
          + `Le solde exigible s'établit à ${somme(m.resteDu)}.`
        : `Le montant exigible s'établit à ${somme(m.resteDu)}.`,

      `Nous vous remercions de bien vouloir procéder au règlement sous huitaine. `
      + `À défaut, des pénalités de retard seront appliquées conformément aux `
      + `conditions figurant sur la facture.`,

      `Si un différend justifiait ce retard, nous vous invitons à nous en faire `
      + `part sans délai afin d'en trouver l'issue.`,
    ];
  }

  return [
    `Malgré nos précédentes démarches, la facture ${m.numeroPiece} du `
    + `${jour(m.dateEmission)}`
    + (m.dateEcheance ? `, échue le ${jour(m.dateEcheance)},` : '')
    + ` demeure impayée, soit ${m.joursRetard} jours de retard.`,

    partiel
      ? `Compte tenu du règlement partiel de ${somme(m.montantRegle)}, la somme de `
        + `${somme(m.resteDu)} reste due.`
      : `La somme de ${somme(m.resteDu)} reste due.`,

    `Par la présente, nous vous mettons en demeure de régler cette somme dans un `
    + `délai de huit jours à compter de la réception de ce courrier.`,

    `À défaut de règlement dans ce délai, nous nous réservons le droit d'engager `
    + `toute procédure de recouvrement, judiciaire ou amiable, sans autre `
    + `avertissement. Les pénalités de retard et l'indemnité forfaitaire de 40 € `
    + `pour frais de recouvrement resteront à votre charge.`,

    `La présente vaut mise en demeure au sens de l'article 1344 du code civil.`,
  ];
}

/** Ce qui figure au pied, selon le degré. */
export function mentionsRelance(m: ModeleRelance): string[] {
  const base: string[] = [];

  if (m.degre !== 'rappel') {
    base.push(
      'Pénalités de retard : trois fois le taux d\u2019intérêt légal en vigueur, '
      + 'exigibles sans rappel (art. L441-10 du code de commerce).',
      'Indemnité forfaitaire pour frais de recouvrement : 40,00 € '
      + '(art. D441-5 du code de commerce).'
    );
  }

  if (m.degre === 'mise_en_demeure') {
    base.push(
      'Courrier valant mise en demeure au sens de l\u2019article 1344 du code civil.'
    );
  }

  return base;
}

export function nomFichierRelance(m: ModeleRelance): string {
  const prefixe = m.degre === 'mise_en_demeure' ? 'mise-en-demeure'
                : m.degre === 'relance' ? 'relance' : 'rappel';
  const client = m.clientNom
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${prefixe}-${m.numeroPiece}-${client}.pdf`;
}
