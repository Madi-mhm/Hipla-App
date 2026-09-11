/**
 * CALENDRIER DES OBLIGATIONS
 *
 * Pour une SAS à l'impôt sur les sociétés, les échéances se déduisent des
 * dates d'exercice. Règles retenues :
 *  · déclaration de résultat (2065 + 2033) et CA12E : dans les trois mois
 *    de la clôture ;
 *  · relevé de solde d'IS (2572) : le 15 du quatrième mois ;
 *  · approbation des comptes : dans les six mois de la clôture ;
 *  · dépôt au greffe : un mois après l'approbation (deux en ligne) ;
 *  · CFE : déclaration initiale avant le 31 décembre de l'année de
 *    création, paiement le 15 décembre à partir de l'année suivante.
 *
 * Quand la clôture tombe le dernier jour d'un mois, les délais courent de
 * fin de mois à fin de mois (clôture au 30 septembre → 31 décembre). Le
 * calendrier fiscal publié chaque année peut décaler une date d'un jour
 * ou deux (week-end, jour férié) : la date affichée est la limite de
 * principe, pas une garantie.
 */

export type ExerciceCalendrier = {
  date_debut: string;
  date_fin: string;
  regime_tva: string | null;
};

export type Obligation = {
  /** Clé stable : c'est elle qui garde la trace de « fait le ». */
  cle: string;
  date: string;
  titre: string;
  detail: string;
  ou: string;
  condition?: string;
  /** Lien vers l'écran de l'application qui prépare l'obligation. */
  lien?: string;
};

const deux = (n: number) => String(n).padStart(2, '0');
const iso = (a: number, m: number, j: number) => `${a}-${deux(m)}-${deux(j)}`;
/** Dernier jour du mois `m` (1 à 12). */
const dernierJour = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();

/**
 * Ajoute des mois à une date ISO. Une fin de mois reste une fin de mois ;
 * `jour` force le jour (le 15 pour le solde d'IS).
 */
export function plusMois(date: string, mois: number, jour?: number): string {
  const [a, m, j] = date.split('-').map(Number);
  const rang = a * 12 + (m - 1) + mois;
  const na = Math.floor(rang / 12);
  const nm = (rang % 12) + 1;
  const fin = dernierJour(na, nm);
  if (jour) return iso(na, nm, Math.min(jour, fin));
  return iso(na, nm, j === dernierJour(a, m) ? fin : Math.min(j, fin));
}

/** Les obligations liées à la clôture d'un exercice. */
function obligationsDeCloture(ex: ExerciceCalendrier): Obligation[] {
  const fin = ex.date_fin;
  const liste: Obligation[] = [
    {
      cle: `liasse_${fin}`,
      date: plusMois(fin, 3),
      titre: 'Déclaration de résultat — 2065 et tableaux 2033',
      detail: 'Le bilan (2033-A), le compte de résultat (2033-B) et le résultat fiscal, '
        + 'case par case, sont prêts dans Comptabilité → Liasse.',
      ou: 'impots.gouv.fr — espace professionnel, ou un service de télétransmission',
      lien: '/comptabilite/liasse',
    },
    {
      cle: `is_${fin}`,
      date: plusMois(fin, 4, 15),
      titre: 'Relevé de solde d’impôt sur les sociétés — 2572',
      detail: 'Solde de l’IS de l’exercice, diminué des acomptes versés. À déposer '
        + 'même sans impôt à payer.',
      ou: 'impots.gouv.fr — espace professionnel (paiement en ligne)',
      lien: '/comptabilite/liasse',
    },
    {
      cle: `approbation_${fin}`,
      date: plusMois(fin, 6),
      titre: 'Approbation des comptes par les associés',
      detail: 'Décision des associés qui approuve les comptes et affecte le résultat : '
        + '5 % du bénéfice en réserve légale, jusqu’à ce qu’elle atteigne 10 % du capital.',
      ou: 'Entre associés — procès-verbal signé, à déposer dans Réglages → Documents',
    },
    {
      cle: `greffe_${fin}`,
      date: plusMois(fin, 7),
      titre: 'Dépôt des comptes au greffe',
      detail: 'Bilan, compte de résultat et décision d’affectation, un mois après '
        + 'l’approbation (deux mois en ligne). Une micro-entreprise peut demander que '
        + 'ses comptes restent confidentiels.',
      ou: 'formalites.entreprises.gouv.fr (guichet unique) ou Infogreffe',
    },
  ];

  if ((ex.regime_tva ?? 'simplifie') === 'simplifie') {
    liste.splice(1, 0, {
      cle: `ca12e_${fin}`,
      date: plusMois(fin, 3),
      titre: 'Déclaration annuelle de TVA — CA12E (3517-S)',
      detail: 'Le solde se paie avec la déclaration ; un crédit peut être reporté ou '
        + 'remboursé. Les montants, ligne par ligne, sont dans Comptabilité → Liasse.',
      ou: 'impots.gouv.fr — espace professionnel',
      lien: '/comptabilite/liasse',
    });
  }
  return liste;
}

/**
 * Le calendrier complet, trié par date : la clôture de chaque exercice,
 * la CFE de chaque année civile depuis la création.
 */
export function calendrier(exercices: ExerciceCalendrier[]): Obligation[] {
  if (exercices.length === 0) return [];
  const tries = [...exercices].sort((a, b) => a.date_debut.localeCompare(b.date_debut));
  const creation = Number(tries[0].date_debut.slice(0, 4));
  const derniere = Number(tries[tries.length - 1].date_fin.slice(0, 4));

  const liste: Obligation[] = [{
    cle: `cfe_initiale_${creation}`,
    date: iso(creation, 12, 31),
    titre: 'Déclaration initiale de CFE — 1447-C',
    detail: 'Pour l’établissement créé en ' + creation + '. Elle ouvre l’exonération de '
      + 'l’année de création et la réduction de moitié de la base l’année suivante.',
    ou: 'impots.gouv.fr — espace professionnel, rubrique Déclarer',
    condition: 'Vérifiez d’abord dans votre espace professionnel qu’elle n’est pas déjà '
      + 'enregistrée.',
  }];

  // L'année de création est exonérée : première cotisation l'année suivante.
  for (let a = creation + 1; a <= derniere; a++) {
    liste.push({
      cle: `cfe_${a}`,
      date: iso(a, 12, 15),
      titre: `Cotisation foncière des entreprises ${a}`,
      detail: (a === creation + 1 ? 'Première année due, sur une base réduite de moitié. ' : '')
        + 'L’avis est disponible en novembre dans l’espace professionnel.',
      ou: 'impots.gouv.fr — espace professionnel (paiement en ligne)',
      condition: 'Pas de cotisation minimum si le chiffre d’affaires de l’année de '
        + 'référence ne dépasse pas 5 000 €.',
    });
  }

  for (const ex of tries) liste.push(...obligationsDeCloture(ex));
  return liste.sort((a, b) => a.date.localeCompare(b.date) || a.cle.localeCompare(b.cle));
}

/**
 * Ce qui revient chaque année sans date fixe pour ce dossier : dit en
 * clair plutôt que calculé, faute de connaître les montants de l'année
 * précédente.
 */
export function rappels(exercices: ExerciceCalendrier[]): string[] {
  const liste = [
    'Acomptes d’IS (15 mars, 15 juin, 15 septembre, 15 décembre) : seulement à partir '
      + 'du deuxième exercice, et si l’IS de l’exercice précédent dépasse 3 000 €.',
  ];
  if (exercices.some((e) => (e.regime_tva ?? 'simplifie') === 'simplifie')) {
    liste.push('Acomptes de TVA au régime simplifié (juillet et décembre) : à partir du '
      + 'deuxième exercice, si la TVA due l’exercice précédent atteint 1 000 €. '
      + 'L’espace professionnel indique les montants et les dates.');
  }
  if (exercices.some((e) => e.regime_tva === 'reel_normal')) {
    liste.push('Un exercice est réglé sur le réel normal : la TVA se déclare alors chaque '
      + 'mois (CA3). Si vous n’avez pas choisi ce régime, repassez-le en « simplifié » '
      + 'dans Réglages → Entreprise.');
  }
  return liste;
}
