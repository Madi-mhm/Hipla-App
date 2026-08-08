/**
 * GABARIT DU RAPPORT MENSUEL
 *
 * Mise en page seule : tous les chiffres arrivent calculés par
 * `rapport_mensuel`, qui applique les mêmes règles que le tableau de
 * bord. Aucun calcul ici — c'est ainsi qu'on évite qu'un rapport parti
 * chez un cabinet contredise l'écran.
 *
 * L'ORDRE DE LECTURE
 * Le résultat d'abord, parce que c'est la question. Puis d'où il vient :
 * les charges par poste, les ventes. Puis la trésorerie, qui est une
 * autre question — on peut être bénéficiaire et à court d'argent.
 * Enfin ce qui manque, qui est ce qu'un comptable lira en premier.
 */

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const NAVY = '#001d3b';
const GOLD = '#8a5f1c';
const ENCRE = '#262c33';
const GRIS = '#5f6a75';
const FILET = '#d3d8dd';
const BONE = '#f5f3ef';
const VERT = '#4A7C59';
const ROUGE = '#b42318';

export type Rapport = {
  periode_debut: string; periode_fin: string;
  exercice_debut: string; exercice_fin: string; regime: string;
  charges: number; produits: number; resultat: number;
  immobilisations: number; encaisse: number;
  postes: Array<{ libelle: string; compte: string; montant: number; lignes: number }>;
  ventes: Array<{
    numero_piece: string | null; date_piece: string; tiers: string;
    montant_ht: number; montant_ttc: number; regle: boolean;
  }>;
  tva: { collectee: number; deductible: number };
  tresorerie: {
    solde_fin: number; entrees: number; sorties: number;
    a_encaisser: number; compte_courant: number;
  };
  points_ouverts: {
    factures_manquantes: number; sans_ecriture: number; a_valider: number;
  };
  cumul: { charges: number; produits: number };
};

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
});
const moisAn = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const jourCourt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });

function eur(v: number): string { return euros.format(Number(v) || 0); }
function jour(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : jourCourt.format(d);
}

const s = StyleSheet.create({
  page: {
    paddingTop: 40, paddingBottom: 52, paddingHorizontal: 46,
    fontSize: 9, fontFamily: 'Helvetica', color: ENCRE, lineHeight: 1.45,
  },

  entete: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-end', paddingBottom: 12, marginBottom: 20,
    borderBottomWidth: 2, borderBottomColor: NAVY,
  },
  titre: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: NAVY, letterSpacing: -0.3 },
  periode: { fontSize: 10, color: GOLD, marginTop: 3, fontFamily: 'Helvetica-Bold' },
  societe: { fontSize: 8, color: GRIS, textAlign: 'right', lineHeight: 1.5 },

  /* Le résultat, en bandeau */
  bandeau: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: NAVY, borderRadius: 4, padding: 16, marginBottom: 20,
  },
  bandeauBloc: { flex: 1 },
  bandeauEtiquette: {
    fontSize: 7, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 3,
  },
  bandeauChiffre: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  bandeauNote: { fontSize: 7, color: 'rgba(255,255,255,0.45)', marginTop: 2 },

  section: { marginBottom: 18 },
  sectionTitre: {
    fontSize: 8, fontFamily: 'Helvetica-Bold', color: NAVY,
    letterSpacing: 1, textTransform: 'uppercase',
    paddingBottom: 5, marginBottom: 8,
    borderBottomWidth: 1, borderBottomColor: FILET,
  },

  ligne: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 3.5, borderBottomWidth: 0.5, borderBottomColor: '#eceef0',
  },
  libelle: { flex: 1 },
  compte: { fontSize: 7, color: GRIS, marginTop: 1 },
  montant: { fontFamily: 'Helvetica-Bold', textAlign: 'right', width: 70 },
  part: { color: GRIS, textAlign: 'right', width: 38, fontSize: 8 },

  total: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingTop: 6, marginTop: 3, borderTopWidth: 1, borderTopColor: NAVY,
  },
  totalLibelle: { fontFamily: 'Helvetica-Bold', color: NAVY },
  totalMontant: { fontFamily: 'Helvetica-Bold', color: NAVY, textAlign: 'right', width: 70 },

  paire: { flexDirection: 'row', gap: 18 },
  colonne: { flex: 1 },

  encadre: {
    backgroundColor: BONE, borderRadius: 3, padding: 11, marginTop: 4,
  },
  alerte: {
    borderLeftWidth: 2, borderLeftColor: GOLD,
    backgroundColor: BONE, borderRadius: 3, padding: 11, marginTop: 4,
  },

  pied: {
    position: 'absolute', bottom: 26, left: 46, right: 46,
    borderTopWidth: 0.5, borderTopColor: FILET, paddingTop: 6,
    flexDirection: 'row', justifyContent: 'space-between',
    fontSize: 6.5, color: GRIS,
  },
});

export function documentRapport(r: Rapport, societe: {
  nom: string; siret: string; mentions: string;
}) {
  const mois = moisAn.format(new Date(r.periode_debut + 'T12:00:00'));
  const beneficiaire = Number(r.resultat) >= 0;
  const cumulResultat = Number(r.cumul.produits) - Number(r.cumul.charges);
  const totalPostes = r.postes.reduce((a, p) => a + Number(p.montant), 0);
  const ouverts = r.points_ouverts.factures_manquantes
    + r.points_ouverts.sans_ecriture + r.points_ouverts.a_valider;

  return (
    <Document title={`Rapport ${mois} — ${societe.nom}`} author={societe.nom}>
      <Page size="A4" style={s.page}>

        <View style={s.entete}>
          <View>
            <Text style={s.titre}>Rapport mensuel</Text>
            <Text style={s.periode}>{mois}</Text>
          </View>
          <View>
            <Text style={[s.societe, { fontFamily: 'Helvetica-Bold', fontSize: 9, color: NAVY }]}>
              {societe.nom}
            </Text>
            <Text style={s.societe}>SIRET {societe.siret}</Text>
            <Text style={s.societe}>
              Exercice du {jour(r.exercice_debut)} au {jour(r.exercice_fin)}
            </Text>
          </View>
        </View>

        {/* ---- Le résultat ---- */}
        <View style={s.bandeau}>
          <View style={s.bandeauBloc}>
            <Text style={s.bandeauEtiquette}>Résultat du mois</Text>
            <Text style={[s.bandeauChiffre, { color: beneficiaire ? '#8fd19e' : '#f0b429' }]}>
              {beneficiaire ? '' : '−'}{eur(Math.abs(Number(r.resultat)))}
            </Text>
            <Text style={s.bandeauNote}>
              {beneficiaire ? 'Bénéfice' : 'Perte'}, hors impôt
            </Text>
          </View>
          <View style={s.bandeauBloc}>
            <Text style={s.bandeauEtiquette}>Produits</Text>
            <Text style={s.bandeauChiffre}>{eur(Number(r.produits))}</Text>
            <Text style={s.bandeauNote}>Hors taxes, facturés</Text>
          </View>
          <View style={s.bandeauBloc}>
            <Text style={s.bandeauEtiquette}>Charges</Text>
            <Text style={s.bandeauChiffre}>{eur(Number(r.charges))}</Text>
            <Text style={s.bandeauNote}>Hors taxes, avoirs déduits</Text>
          </View>
          <View style={s.bandeauBloc}>
            <Text style={s.bandeauEtiquette}>Depuis l&apos;ouverture</Text>
            <Text style={s.bandeauChiffre}>
              {cumulResultat >= 0 ? '' : '−'}{eur(Math.abs(cumulResultat))}
            </Text>
            <Text style={s.bandeauNote}>
              {eur(Number(r.cumul.charges))} de charges cumulées
            </Text>
          </View>
        </View>

        {/* ---- Les charges ---- */}
        <View style={s.section}>
          <Text style={s.sectionTitre}>Où part l&apos;argent</Text>
          {r.postes.length === 0 ? (
            <Text style={{ color: GRIS }}>Aucune charge sur la période.</Text>
          ) : (
            <>
              {r.postes.map((p, i) => (
                <View key={i} style={s.ligne}>
                  <View style={s.libelle}>
                    <Text>{p.libelle}</Text>
                    <Text style={s.compte}>
                      compte {p.compte} · {p.lignes} écriture{p.lignes > 1 ? 's' : ''}
                    </Text>
                  </View>
                  <Text style={s.part}>
                    {totalPostes > 0
                      ? `${Math.round((Number(p.montant) / totalPostes) * 100)} %` : '—'}
                  </Text>
                  <Text style={s.montant}>{eur(Number(p.montant))}</Text>
                </View>
              ))}
              <View style={s.total}>
                <Text style={s.totalLibelle}>Total des charges</Text>
                <Text style={s.totalMontant}>{eur(Number(r.charges))}</Text>
              </View>
            </>
          )}
        </View>

        {/* ---- Les ventes ---- */}
        <View style={s.section}>
          <Text style={s.sectionTitre}>Facturation</Text>
          {r.ventes.length === 0 ? (
            <Text style={{ color: GRIS }}>Aucune facture émise sur la période.</Text>
          ) : (
            <>
              {r.ventes.map((v, i) => (
                <View key={i} style={s.ligne}>
                  <View style={s.libelle}>
                    <Text>{v.tiers}</Text>
                    <Text style={s.compte}>
                      {v.numero_piece} · {jour(v.date_piece)}
                      {v.regle ? ' · réglée' : ' · en attente'}
                    </Text>
                  </View>
                  <Text style={[s.montant, { color: v.regle ? VERT : ENCRE }]}>
                    {eur(Number(v.montant_ttc))}
                  </Text>
                </View>
              ))}
              <View style={s.total}>
                <Text style={s.totalLibelle}>Encaissé sur la période</Text>
                <Text style={s.totalMontant}>{eur(Number(r.encaisse))}</Text>
              </View>
            </>
          )}
        </View>

        {/* ---- Trésorerie et TVA, côte à côte ---- */}
        <View style={[s.section, s.paire]}>
          <View style={s.colonne}>
            <Text style={s.sectionTitre}>Trésorerie</Text>
            <View style={s.encadre}>
              <View style={s.ligne}>
                <Text style={s.libelle}>Solde bancaire au {jour(r.periode_fin)}</Text>
                <Text style={s.montant}>{eur(Number(r.tresorerie.solde_fin))}</Text>
              </View>
              <View style={s.ligne}>
                <Text style={s.libelle}>Entrées du mois</Text>
                <Text style={[s.montant, { color: VERT }]}>
                  {eur(Number(r.tresorerie.entrees))}
                </Text>
              </View>
              <View style={s.ligne}>
                <Text style={s.libelle}>Sorties du mois</Text>
                <Text style={s.montant}>{eur(Number(r.tresorerie.sorties))}</Text>
              </View>
              <View style={s.ligne}>
                <Text style={s.libelle}>Reste à encaisser</Text>
                <Text style={s.montant}>{eur(Number(r.tresorerie.a_encaisser))}</Text>
              </View>
              <View style={[s.ligne, { borderBottomWidth: 0 }]}>
                <Text style={s.libelle}>Compte courant d&apos;associé</Text>
                <Text style={s.montant}>{eur(Number(r.tresorerie.compte_courant))}</Text>
              </View>
            </View>
          </View>

          <View style={s.colonne}>
            <Text style={s.sectionTitre}>TVA de la période</Text>
            <View style={s.encadre}>
              <View style={s.ligne}>
                <Text style={s.libelle}>Collectée</Text>
                <Text style={s.montant}>{eur(Number(r.tva.collectee))}</Text>
              </View>
              <View style={s.ligne}>
                <Text style={s.libelle}>Déductible</Text>
                <Text style={s.montant}>{eur(Number(r.tva.deductible))}</Text>
              </View>
              <View style={[s.ligne, { borderBottomWidth: 0 }]}>
                <Text style={[s.libelle, { fontFamily: 'Helvetica-Bold' }]}>
                  {Number(r.tva.collectee) >= Number(r.tva.deductible)
                    ? 'À reverser' : 'Crédit'}
                </Text>
                <Text style={[s.montant, {
                  color: Number(r.tva.collectee) >= Number(r.tva.deductible) ? ENCRE : VERT,
                }]}>
                  {eur(Math.abs(Number(r.tva.collectee) - Number(r.tva.deductible)))}
                </Text>
              </View>
              <Text style={{ fontSize: 7, color: GRIS, marginTop: 6, lineHeight: 1.5 }}>
                Exigible sur les encaissements et les paiements, non sur les
                factures.
              </Text>
            </View>
          </View>
        </View>

        {/* ---- Ce qui manque ---- */}
        {/*
          Un rapport honnête dit aussi ce qui n'est pas fait. C'est même
          la partie qu'un comptable lira en premier : elle lui dit quoi
          réclamer.
        */}
        <View style={s.section}>
          <Text style={s.sectionTitre}>Points ouverts</Text>
          {ouverts === 0 ? (
            <View style={s.encadre}>
              <Text style={{ color: VERT }}>
                Rien en attente : chaque écriture est justifiée et rapprochée.
              </Text>
            </View>
          ) : (
            <View style={s.alerte}>
              {r.points_ouverts.factures_manquantes > 0 && (
                <Text style={{ marginBottom: 3 }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold', color: ROUGE }}>
                    {r.points_ouverts.factures_manquantes} facture
                    {r.points_ouverts.factures_manquantes > 1 ? 's' : ''} manquante
                    {r.points_ouverts.factures_manquantes > 1 ? 's' : ''}
                  </Text>
                  {' — sans pièce, la charge est rejetée et la TVA contestée.'}
                </Text>
              )}
              {r.points_ouverts.sans_ecriture > 0 && (
                <Text style={{ marginBottom: 3 }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>
                    {r.points_ouverts.sans_ecriture} opération
                    {r.points_ouverts.sans_ecriture > 1 ? 's' : ''} bancaire
                    {r.points_ouverts.sans_ecriture > 1 ? 's' : ''} sans écriture
                  </Text>
                  {' — la comptabilité est incomplète tant qu\u2019elles subsistent.'}
                </Text>
              )}
              {r.points_ouverts.a_valider > 0 && (
                <Text>
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>
                    {r.points_ouverts.a_valider} saisie
                    {r.points_ouverts.a_valider > 1 ? 's' : ''} en attente
                  </Text>
                  {' — elles n\u2019entrent dans aucun chiffre de ce rapport.'}
                </Text>
              )}
            </View>
          )}
        </View>

        <View style={s.pied} fixed>
          <Text>{societe.mentions}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
