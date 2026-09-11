/**
 * LIASSE FISCALE — RÉGIME SIMPLIFIÉ
 *
 * Les soldes de chaque compte, lus sur le journal (`etats_financiers`),
 * sont rangés dans les cases des tableaux 2033-A (bilan) et 2033-B
 * (compte de résultat), millésime 2025, selon le plan comptable général.
 * Un compte que la table ne sait pas ranger est signalé, jamais deviné.
 *
 * Les montants se déclarent en euros, sans centimes : chaque case est
 * arrondie, les totaux se font sur les cases arrondies — comme sur le
 * formulaire. Un écart d'un euro entre l'actif et le passif peut en
 * naître ; il est affiché.
 *
 * La TVA : les comptes 445 (hors TVA en attente et TVA sur factures non
 * parvenues ou à établir) sont compensés, comme le fait l'écriture de
 * liquidation de la CA12. Le solde débiteur est un crédit de TVA, le
 * solde créditeur une dette.
 */

export type SoldeCompte = { compte: string; libelle: string; debit: number; credit: number };

export type Fiscal = {
  debut: string;
  fin: string;
  jours: number;
  resultat_fiscal: number;
  deficits_anterieurs: number;
  deficit_impute: number;
  deficit_reportable: number;
  base_imposable: number;
  base_taux_reduit: number;
  base_taux_normal: number;
  plafond_taux_reduit: number;
  taux_reduit_applicable: boolean;
  impot: number;
  is_comptabilise: number;
  reintegrations: { amendes: number; tvs: number; impot: number };
};

export type LigneActif = {
  code: string; codeAmort: string; libelle: string;
  brut: number; amort: number; total?: boolean; comptes: string[];
};
export type Ligne = {
  code: string | null; libelle: string; montant: number;
  total?: boolean; dont?: boolean; comptes: string[];
};

const commence = (c: string, ...p: string[]) => p.some((x) => c.startsWith(x));
const euros = (x: number) => Math.round(x);

function produit(n: string): string | null {
  if (commence(n, '707', '7097')) return '210';
  if (commence(n, '701', '702', '703', '7091', '7092', '7093')) return '214';
  if (commence(n, '704', '705', '706', '708', '7094', '7095', '7096', '7098')) return '218';
  if (commence(n, '713')) return '222';
  if (commence(n, '72', '73')) return '224';
  if (commence(n, '74')) return '226';
  if (commence(n, '75', '781', '791')) return '230';
  if (commence(n, '76', '786', '796')) return '280';
  if (commence(n, '77', '787', '797')) return '290';
  return null;
}

function charge(n: string): string | null {
  if (commence(n, '607', '6087', '6097')) return '234';
  if (commence(n, '6037')) return '236';
  if (commence(n, '601', '602', '6081', '6082', '6091', '6092')) return '238';
  if (commence(n, '6031', '6032')) return '240';
  if (commence(n, '60', '61', '62')) return '242';
  if (commence(n, '63')) return '244';
  if (commence(n, '645', '646', '647')) return '252';
  if (commence(n, '64')) return '250';
  if (commence(n, '6815', '6816', '6817')) return '256';
  if (commence(n, '686')) return '294';
  if (commence(n, '687')) return '300';
  if (commence(n, '68')) return '254';
  if (commence(n, '65')) return '262';
  if (commence(n, '66')) return '294';
  if (commence(n, '67')) return '300';
  if (commence(n, '69')) return '306';
  return null;
}

/** Case du bilan d'un compte de bilan, selon le signe de son solde. */
function caseBilan(n: string, s: number): string | null {
  // s > 0 : solde débiteur (actif) ; s < 0 : solde créditeur (passif).
  if (n[0] === '1') {
    if (commence(n, '101', '108')) return '120';
    if (commence(n, '105')) return '124';
    if (commence(n, '1061')) return '126';
    if (commence(n, '1062', '1064')) return '130';
    if (commence(n, '106')) return '132';
    if (commence(n, '11')) return '134';
    if (commence(n, '12')) return '136';
    if (commence(n, '13')) return '137';
    if (commence(n, '14')) return '140';
    if (commence(n, '15')) return '154';
    if (commence(n, '16', '17')) return '156';
    if (commence(n, '18')) return '175';
    return null;
  }
  if (n[0] === '2') {
    if (commence(n, '2807', '2907')) return 'A012';
    if (commence(n, '280', '290')) return 'A016';
    if (commence(n, '207')) return '010';
    if (commence(n, '20')) return '014';
    if (commence(n, '296', '297')) return 'A042';
    if (commence(n, '28', '29')) return 'A030';
    if (commence(n, '21', '22', '23')) return '028';
    if (commence(n, '26', '27')) return '040';
    return null;
  }
  if (n[0] === '3') {
    if (commence(n, '397')) return 'A062';
    if (commence(n, '39')) return 'A052';
    if (commence(n, '37')) return '060';
    return '050';
  }
  if (n[0] === '4') {
    if (commence(n, '486')) return s > 0 ? '092' : '175';
    if (commence(n, '487')) return s < 0 ? '174' : '072';
    if (commence(n, '491')) return 'A070';
    if (commence(n, '496')) return 'A074';
    if (s > 0) {
      if (commence(n, '4091')) return '064';
      if (commence(n, '411', '413', '416', '417', '418')) return '068';
      return '072';
    }
    if (commence(n, '401', '403', '404', '405', '408')) return '166';
    if (commence(n, '411', '413', '416', '417', '418', '4191')) return '164';
    if (commence(n, '455')) return '173';
    if (commence(n, '42', '43', '44')) return '172';
    return '175';
  }
  if (n[0] === '5') {
    if (commence(n, '59')) return 'A082';
    if (commence(n, '50')) return '080';
    if (commence(n, '51', '53', '54')) return s > 0 ? '084' : '156';
    return null;
  }
  return null;
}

/** La TVA compensée à la clôture : tout le 445, sauf ce qui attend. */
const tvaCompensee = (n: string) =>
  n.startsWith('445') && !commence(n, '44574', '44586', '44587');

export function preparerLiasse(comptes: SoldeCompte[], fiscal: Fiscal) {
  const cumul = new Map<string, { montant: number; comptes: Set<string> }>();
  const ajouter = (code: string, montant: number, compte: string) => {
    const c = cumul.get(code) ?? { montant: 0, comptes: new Set<string>() };
    c.montant += montant;
    c.comptes.add(compte);
    cumul.set(code, c);
  };
  const nonRanges: SoldeCompte[] = [];
  let resultat = 0;
  let tva = 0;
  const comptesTva: string[] = [];

  for (const c of comptes) {
    const n = c.compte;
    const s = Math.round((Number(c.debit) - Number(c.credit)) * 100) / 100;
    if (Math.abs(s) < 0.005) continue;

    if (n[0] === '7') {
      const code = produit(n);
      if (!code) { nonRanges.push(c); continue; }
      ajouter(code, -s, n);
      resultat -= s;
      continue;
    }
    if (n[0] === '6') {
      const code = charge(n);
      if (!code) { nonRanges.push(c); continue; }
      ajouter(code, s, n);
      if (commence(n, '63511', '63514')) ajouter('243', s, n);
      resultat -= s;
      continue;
    }
    if (tvaCompensee(n)) { tva += s; comptesTva.push(n); continue; }

    const code = caseBilan(n, s);
    if (!code) { nonRanges.push(c); continue; }
    // Actif et amortissements : montant positif au débit ; amortissements
    // et passif : montant positif au crédit.
    const actif = /^(0[0-9]{2})$/.test(code);
    ajouter(code, actif ? s : -s, n);
    if (code === '172' && n.startsWith('445')) ajouter('169', -s, n);
    if (code === '072' && n.startsWith('455')) ajouter('199', s, n);
  }

  if (Math.abs(tva) >= 0.005) {
    for (const n of comptesTva) {
      if (tva > 0) ajouter('072', 0, n); else { ajouter('172', 0, n); ajouter('169', 0, n); }
    }
    if (tva > 0) ajouter('072', tva, comptesTva[0]);
    else { ajouter('172', -tva, comptesTva[0]); ajouter('169', -tva, comptesTva[0]); }
  }
  ajouter('136', resultat, '6/7');

  const ajust = new Map<string, number>();
  const exact = (code: string) => cumul.get(code)?.montant ?? 0;
  const v = (code: string) => euros(exact(code)) + (ajust.get(code) ?? 0);
  const cpt = (code: string) => [...(cumul.get(code)?.comptes ?? [])].sort();

  // ---- 2033-B : compte de résultat ----
  const produits = ['210', '214', '218', '222', '224', '226', '230'];
  const charges = ['234', '236', '238', '240', '242', '244', '250', '252', '254', '256', '262'];
  const t232 = produits.reduce((x, c) => x + v(c), 0);
  const t264 = charges.reduce((x, c) => x + v(c), 0);
  const t270 = t232 - t264;
  const t310 = t270 + v('280') + v('290') - v('294') - v('300') - v('306');

  // ---- Arrondi : l'actif et le passif doivent tomber juste ----
  // Chaque case est arrondie séparément. L'écart d'un euro ou deux qui en
  // naît est porté sur la case de bilan que son arrondi a le plus
  // éloignée de sa valeur exacte — jamais sur le capital ni sur le
  // résultat, qui doit rester celui du compte de résultat.
  const ACTIF = ['010', '014', '028', '040', '050', '060', '064', '068', '072', '080', '084', '092'];
  const AMORT = ['A012', 'A016', 'A030', 'A042', 'A052', 'A062', 'A066', 'A070', 'A074', 'A082'];
  const PASSIF = ['120', '124', '126', '130', '132', '134', '137', '140', '154',
                  '156', '164', '166', '172', '173', '175', '174'];
  const AJUSTABLES = ['068', '072', '084', '092', '156', '164', '166', '172', '173', '175', '174'];
  const resultatBilan = t310 + euros(exact('136') - resultat);
  const ecartArrondi = () =>
    ACTIF.reduce((x, c) => x + v(c), 0) - AMORT.reduce((x, c) => x + v(c), 0)
    - PASSIF.reduce((x, c) => x + v(c), 0) - resultatBilan;
  for (let n = 0; n < 5 && ecartArrondi() !== 0; n++) {
    const e = ecartArrondi();
    let meilleur: { code: string; pas: number; poids: number } | null = null;
    for (const code of AJUSTABLES) {
      if (!cumul.has(code)) continue;
      // Actif trop court (e < 0) : relever un actif, ou baisser un passif.
      const pas = (e < 0) === ACTIF.includes(code) ? 1 : -1;
      // L'arrondi qui a le plus poussé dans le mauvais sens est corrigé.
      const poids = -pas * (v(code) - exact(code));
      if (!meilleur || poids > meilleur.poids) meilleur = { code, pas, poids };
    }
    if (!meilleur) break;
    ajust.set(meilleur.code, (ajust.get(meilleur.code) ?? 0) + meilleur.pas);
  }

  const L = (code: string, libelle: string, extra: Partial<Ligne> = {}): Ligne =>
    ({ code, libelle, montant: v(code), comptes: cpt(code), ...extra });
  const T = (code: string | null, libelle: string, montant: number, extra: Partial<Ligne> = {}): Ligne =>
    ({ code, libelle, montant, comptes: [], total: true, ...extra });

  const compteResultat: Ligne[] = [
    L('210', 'Ventes de marchandises'),
    L('214', 'Production vendue — biens'),
    L('218', 'Production vendue — services'),
    L('222', 'Production stockée'),
    L('224', 'Production immobilisée'),
    L('226', 'Subventions d’exploitation reçues'),
    L('230', 'Autres produits'),
    T('232', 'Total des produits d’exploitation hors TVA (I)', t232),
    L('234', 'Achats de marchandises'),
    L('236', 'Variation de stocks (marchandises)'),
    L('238', 'Achats de matières premières et autres approvisionnements'),
    L('240', 'Variation de stock (matières premières et approvisionnements)'),
    L('242', 'Autres charges externes'),
    L('244', 'Impôts, taxes et versements assimilés'),
    L('243', 'dont CFE et CVAE', { dont: true }),
    L('250', 'Rémunérations du personnel'),
    L('252', 'Charges sociales'),
    L('254', 'Dotations aux amortissements'),
    L('256', 'Dotations aux provisions'),
    L('262', 'Autres charges'),
    T('264', 'Total des charges d’exploitation (II)', t264),
    T('270', 'Résultat d’exploitation (I − II)', t270),
    L('280', 'Produits financiers (III)'),
    L('290', 'Produits exceptionnels (IV)'),
    L('294', 'Charges financières (V)'),
    L('300', 'Charges exceptionnelles (VI)'),
    L('306', 'Impôt sur les bénéfices (VII)'),
    T('310', 'Bénéfice ou perte — produits (I + III + IV) − charges (II + V + VI + VII)', t310),
  ];

  // ---- 2033-B, cadre B : résultat fiscal ----
  const r324 = euros(fiscal.reintegrations.impot + fiscal.reintegrations.tvs);
  const r330 = euros(fiscal.reintegrations.amendes);
  const avant = t310 + r324 + r330;
  const impute = euros(fiscal.deficit_impute);
  const apres = avant - impute;
  const resultatFiscal: Ligne[] = [
    T(t310 >= 0 ? '312' : '314', t310 >= 0 ? 'Bénéfice comptable' : 'Déficit comptable', Math.abs(t310)),
    { code: '324', libelle: 'Impôts et taxes non déductibles (impôt sur les sociétés, taxe sur les véhicules de tourisme)', montant: r324, comptes: ['695', '63512'] },
    { code: '330', libelle: 'Divers à réintégrer (amendes et pénalités)', montant: r330, comptes: ['6712'] },
    T(avant >= 0 ? '352' : '354', 'Résultat fiscal avant imputation des déficits antérieurs — '
      + (avant >= 0 ? 'bénéfice' : 'déficit'), Math.abs(avant)),
    { code: '360', libelle: 'Déficits antérieurs imputés sur le résultat', montant: impute, comptes: [] },
    T(apres >= 0 ? '370' : '372', 'Résultat fiscal après imputation des déficits — '
      + (apres >= 0 ? 'bénéfice' : 'déficit'), Math.abs(apres)),
  ];

  // ---- 2033-A : bilan ----
  const A = (code: string, codeAmort: string, libelle: string): LigneActif => ({
    code, codeAmort, libelle, brut: v(code), amort: v('A' + codeAmort),
    comptes: [...cpt(code), ...cpt('A' + codeAmort)],
  });
  const immo = [
    A('010', '012', 'Immobilisations incorporelles — fonds commercial'),
    A('014', '016', 'Immobilisations incorporelles — autres'),
    A('028', '030', 'Immobilisations corporelles'),
    A('040', '042', 'Immobilisations financières'),
  ];
  const circulant = [
    A('050', '052', 'Stocks — matières premières, approvisionnements, en cours'),
    A('060', '062', 'Stocks — marchandises'),
    A('064', '066', 'Avances et acomptes versés sur commandes'),
    A('068', '070', 'Créances — clients et comptes rattachés'),
    A('072', '074', 'Créances — autres'),
    A('080', '082', 'Valeurs mobilières de placement'),
    A('084', '086', 'Disponibilités'),
    A('092', '094', 'Charges constatées d’avance'),
  ];
  const somme = (l: LigneActif[], k: 'brut' | 'amort') => l.reduce((x, y) => x + y[k], 0);
  const total = (code: string, codeAmort: string, libelle: string, l: LigneActif[]): LigneActif =>
    ({ code, codeAmort, libelle, brut: somme(l, 'brut'), amort: somme(l, 'amort'), total: true, comptes: [] });
  const t1 = total('044', '048', 'Total I — actif immobilisé', immo);
  const t2 = total('096', '098', 'Total II — actif circulant', circulant);
  const actif: LigneActif[] = [
    ...immo, t1, ...circulant, t2,
    { code: '110', codeAmort: '112', libelle: 'Total général (I + II)',
      brut: t1.brut + t2.brut, amort: t1.amort + t2.amort, total: true, comptes: [] },
  ];

  // Le résultat du bilan est celui du compte de résultat, au même arrondi.
  const r136 = t310 + euros((cumul.get('136')?.montant ?? 0) - resultat);
  const capitaux = ['120', '124', '126', '130', '132', '134', '137', '140'];
  const t142 = capitaux.reduce((x, c) => x + v(c), 0) + r136;
  const dettes = ['156', '164', '166', '172', '173', '175', '174'];
  const t176 = dettes.reduce((x, c) => x + v(c), 0);
  const passif: Ligne[] = [
    L('120', 'Capital social ou individuel'),
    L('124', 'Écarts de réévaluation'),
    L('126', 'Réserve légale'),
    L('130', 'Réserves réglementées'),
    L('132', 'Autres réserves'),
    L('134', 'Report à nouveau'),
    { code: '136', libelle: 'Résultat de l’exercice', montant: r136, comptes: cpt('136') },
    L('137', 'Subventions d’investissement'),
    L('140', 'Provisions réglementées'),
    T('142', 'Total I — capitaux propres', t142),
    T('154', 'Total II — provisions pour risques et charges', v('154'), { comptes: cpt('154') }),
    L('156', 'Emprunts et dettes assimilées'),
    L('164', 'Avances et acomptes reçus sur commandes en cours'),
    L('166', 'Fournisseurs et comptes rattachés'),
    L('172', 'Dettes fiscales et sociales'),
    L('169', 'dont TVA', { dont: true }),
    L('173', 'Comptes courants d’associés'),
    L('175', 'Autres dettes'),
    L('174', 'Produits constatés d’avance'),
    T('176', 'Total III — dettes', t176),
    T('180', 'Total général (I + II + III)', t142 + v('154') + t176),
  ];
  const renvois: Ligne[] = [
    L('199', 'Renvoi (3) — dont comptes courants d’associés débiteurs'),
  ].filter((l) => l.montant !== 0);

  const netActif = actif[actif.length - 1].brut - actif[actif.length - 1].amort;
  const totalPassif = passif[passif.length - 1].montant;

  // ---- 2065, cadre C, et relevé de solde 2572 ----
  const is = {
    beneficeTauxNormal: euros(fiscal.base_taux_normal),
    beneficeTauxReduit: euros(fiscal.base_taux_reduit),
    deficit: apres < 0 ? Math.abs(apres) : 0,
    impot15: euros(fiscal.base_taux_reduit * 0.15),
    impot25: euros(fiscal.base_taux_normal * 0.25),
    impot: euros(fiscal.impot),
    plafond: euros(fiscal.plafond_taux_reduit),
    tauxReduit: fiscal.taux_reduit_applicable,
    deficitReportable: euros(fiscal.deficit_reportable),
    comptabilise: euros(fiscal.is_comptabilise),
  };

  return {
    actif, passif, renvois, compteResultat, resultatFiscal, is,
    nonRanges,
    controles: {
      ecartBilan: netActif - totalPassif,
      resultatExact: Math.round(resultat * 100) / 100,
    },
  };
}

export type Liasse = ReturnType<typeof preparerLiasse>;

/** Durée de l'exercice en mois, telle que la demandent les en-têtes. */
export function dureeEnMois(debut: string, fin: string): number {
  const jours = (Date.parse(fin) - Date.parse(debut)) / 86_400_000 + 1;
  return Math.round(jours / 30.4375);
}
