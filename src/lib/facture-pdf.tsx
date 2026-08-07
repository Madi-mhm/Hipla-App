/**
 * GABARIT DE FACTURE
 *
 * Mise en page seule. Aucune règle métier, aucun calcul : tout arrive
 * prêt dans le modèle. C'est ce qui rend ce fichier indifférent à la
 * refonte du registre.
 *
 * Polices : les fontes intégrées de PDF (Helvetica) sont utilisées
 * délibérément. Enregistrer Montserrat ou Karla obligerait à les
 * télécharger à chaque rendu — une latence et un mode de panne de plus
 * sur un document qui doit toujours sortir.
 */

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  mentionsLegales, intituleDocument, type ModeleFacture,
} from '@/lib/facture-modele';

/* ---- Charte, reprise de l'application ---- */
const NAVY = '#001d3b';
const GOLD = '#8a5f1c';
const ENCRE = '#262c33';
const GRIS = '#5f6a75';
const FILET = '#d3d8dd';
const BONE = '#f5f3ef';

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
});
const jour = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric', month: 'long', year: 'numeric',
});

function eur(v: number): string {
  return euros.format(v);
}
function dateFr(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : jour.format(d);
}
function quantite(v: number, unite: string | null): string {
  const n = Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',');
  return unite ? `${n} ${unite}` : n;
}

const s = StyleSheet.create({
  page: {
    paddingTop: 44, paddingBottom: 62, paddingHorizontal: 46,
    fontSize: 9, fontFamily: 'Helvetica', color: ENCRE, lineHeight: 1.45,
  },

  /* En-tête */
  entete: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  emetteurNom: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 5 },
  emetteurLigne: { fontSize: 8, color: GRIS },
  titreBloc: { alignItems: 'flex-end' },
  titre: { fontSize: 19, fontFamily: 'Helvetica-Bold', color: GOLD, letterSpacing: 1.2 },
  numero: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY, marginTop: 3 },
  brouillon: {
    marginTop: 6, fontSize: 8, fontFamily: 'Helvetica-Bold',
    color: '#b42318', letterSpacing: 1,
  },

  /* Destinataire et dates */
  colonnes: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 26 },
  bloc: { width: '48%' },
  blocTitre: {
    fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRIS,
    letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase',
  },
  destNom: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  ligneInfo: { flexDirection: 'row', marginBottom: 2 },
  infoCle: { width: 92, color: GRIS },
  infoValeur: { flex: 1 },

  /* Objet */
  objet: {
    backgroundColor: BONE, paddingVertical: 7, paddingHorizontal: 10,
    marginBottom: 16, borderLeftWidth: 2, borderLeftColor: GOLD,
  },

  /* Tableau des lignes */
  thead: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: NAVY,
    paddingBottom: 5, marginBottom: 2,
  },
  th: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: NAVY, letterSpacing: 0.7 },
  tr: {
    flexDirection: 'row', paddingVertical: 6,
    borderBottomWidth: 0.5, borderBottomColor: FILET,
  },
  cDesignation: { flex: 1, paddingRight: 8 },
  cQuantite: { width: 58, textAlign: 'right' },
  cPrix: { width: 66, textAlign: 'right' },
  cTaux: { width: 40, textAlign: 'right' },
  cMontant: { width: 72, textAlign: 'right' },

  /* Totaux */
  zoneTotaux: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  totaux: { width: 250 },
  ligneTotal: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 3,
  },
  ligneTotalFort: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 7, marginTop: 5,
    borderTopWidth: 1, borderTopColor: NAVY,
  },
  libelleTotal: { color: GRIS },
  netLibelle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY },
  netValeur: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY },
  ventilation: {
    marginTop: 8, paddingTop: 6,
    borderTopWidth: 0.5, borderTopColor: FILET,
  },

  /* Règlement */
  reglement: {
    marginTop: 26, padding: 11, backgroundColor: BONE,
  },
  iban: { fontFamily: 'Helvetica-Bold', fontSize: 10, letterSpacing: 0.5 },
  acquittee: {
    marginTop: 12, padding: 9,
    borderWidth: 1, borderColor: '#1b7f4d', color: '#1b7f4d',
    fontFamily: 'Helvetica-Bold', textAlign: 'center',
  },

  /* Pied */
  mentions: {
    position: 'absolute', bottom: 30, left: 46, right: 46,
    paddingTop: 8, borderTopWidth: 0.5, borderTopColor: FILET,
  },
  mention: { fontSize: 6.5, color: GRIS, lineHeight: 1.5 },
  pied: { fontSize: 6.5, color: GRIS, marginTop: 4, textAlign: 'center' },
  pagination: {
    position: 'absolute', bottom: 18, right: 46,
    fontSize: 6.5, color: GRIS,
  },
});

/**
 * Construit le document.
 *
 * Fonction simple et non composant React : `renderToBuffer` attend un
 * élément `<Document>`, pas un composant typé sur ses propres props.
 * Retourner l'élément directement fait concorder les types sans cast.
 */
export function documentFacture(m: ModeleFacture) {
  const e = m.emetteur;
  const d = m.destinataire;
  const soldee = m.montantEncaisse >= m.netAPayer && m.netAPayer > 0;

  const periode =
    m.periodeDebut && m.periodeFin
      ? `du ${dateFr(m.periodeDebut)} au ${dateFr(m.periodeFin)}`
      : m.datePrestation
        ? dateFr(m.datePrestation)
        : '—';

  return (
    <Document
      title={`${intituleDocument(m.nature)} ${m.numero ?? 'brouillon'}`}
      author={e.raisonSociale}
      subject={m.objet ?? undefined}
      creator="Hipla Gestion"
    >
      <Page size="A4" style={s.page}>

        {/* ---------- En-tête ---------- */}
        <View style={s.entete}>
          <View>
            <Text style={s.emetteurNom}>{e.raisonSociale}</Text>
            <Text style={s.emetteurLigne}>{e.adresse}</Text>
            <Text style={s.emetteurLigne}>{e.codePostal} {e.ville}</Text>
            {e.telephone && <Text style={s.emetteurLigne}>{e.telephone}</Text>}
            {e.email && <Text style={s.emetteurLigne}>{e.email}</Text>}
            {e.siteWeb && <Text style={s.emetteurLigne}>{e.siteWeb}</Text>}
          </View>

          <View style={s.titreBloc}>
            <Text style={s.titre}>{intituleDocument(m.nature)}</Text>
            {m.numero && <Text style={s.numero}>{m.numero}</Text>}
            {m.brouillon && <Text style={s.brouillon}>BROUILLON — NON ÉMISE</Text>}
          </View>
        </View>

        {/* ---------- Destinataire et dates ---------- */}
        <View style={s.colonnes}>
          <View style={s.bloc}>
            <Text style={s.blocTitre}>Facturé à</Text>
            <Text style={s.destNom}>{d.nom}</Text>
            {d.contact && <Text>{d.contact}</Text>}
            {d.adresse && <Text>{d.adresse}</Text>}
            <Text>{[d.codePostal, d.ville].filter(Boolean).join(' ')}</Text>
            {d.pays !== 'France' && <Text>{d.pays}</Text>}
            {d.siret && <Text style={{ marginTop: 3, color: GRIS }}>SIRET {d.siret}</Text>}
            {d.tvaIntracom && <Text style={{ color: GRIS }}>TVA {d.tvaIntracom}</Text>}
          </View>

          <View style={s.bloc}>
            <Text style={s.blocTitre}>Informations</Text>
            <View style={s.ligneInfo}>
              <Text style={s.infoCle}>Date d&apos;émission</Text>
              <Text style={s.infoValeur}>{dateFr(m.dateEmission)}</Text>
            </View>
            <View style={s.ligneInfo}>
              <Text style={s.infoCle}>Prestation</Text>
              <Text style={s.infoValeur}>{periode}</Text>
            </View>
            <View style={s.ligneInfo}>
              <Text style={s.infoCle}>Échéance</Text>
              <Text style={s.infoValeur}>{dateFr(m.dateEcheance)}</Text>
            </View>
            <View style={s.ligneInfo}>
              <Text style={s.infoCle}>Délai</Text>
              <Text style={s.infoValeur}>{m.delaiPaiement} jours</Text>
            </View>
          </View>
        </View>

        {/* ---------- Objet ---------- */}
        {m.objet && (
          <View style={s.objet}>
            <Text>{m.objet}</Text>
          </View>
        )}

        {/* ---------- Lignes ---------- */}
        <View style={s.thead}>
          <Text style={[s.th, s.cDesignation]}>DÉSIGNATION</Text>
          <Text style={[s.th, s.cQuantite]}>QUANTITÉ</Text>
          <Text style={[s.th, s.cPrix]}>P.U. HT</Text>
          <Text style={[s.th, s.cTaux]}>TVA</Text>
          <Text style={[s.th, s.cMontant]}>TOTAL HT</Text>
        </View>

        {m.lignes.map((l, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <Text style={s.cDesignation}>{l.libelle}</Text>
            <Text style={s.cQuantite}>{quantite(l.quantite, l.unite)}</Text>
            <Text style={s.cPrix}>{eur(l.prixUnitaireHt)}</Text>
            <Text style={s.cTaux}>
              {String(l.tauxTva).replace('.', ',')} %
            </Text>
            <Text style={s.cMontant}>{eur(l.montantHt)}</Text>
          </View>
        ))}

        {/* ---------- Totaux ---------- */}
        <View style={s.zoneTotaux} wrap={false}>
          <View style={s.totaux}>
            <View style={s.ligneTotal}>
              <Text style={s.libelleTotal}>Total HT</Text>
              <Text>{eur(m.totalHt)}</Text>
            </View>

            {/* Ventilation par taux : mention obligatoire dès qu'un
                document mêle plusieurs taux, inoffensive sinon. */}
            <View style={s.ventilation}>
              {m.totauxParTaux.map((t) => (
                <View key={t.taux} style={s.ligneTotal}>
                  <Text style={s.libelleTotal}>
                    TVA {String(t.taux).replace('.', ',')} % sur {eur(t.baseHt)}
                  </Text>
                  <Text>{eur(t.montantTva)}</Text>
                </View>
              ))}
            </View>

            <View style={s.ligneTotal}>
              <Text style={s.libelleTotal}>Total TTC</Text>
              <Text>{eur(m.totalTtc)}</Text>
            </View>

            {m.acomptesDeduits > 0 && (
              <View style={s.ligneTotal}>
                <Text style={s.libelleTotal}>Acomptes déjà réglés</Text>
                <Text>− {eur(m.acomptesDeduits)}</Text>
              </View>
            )}

            <View style={s.ligneTotalFort}>
              <Text style={s.netLibelle}>NET À PAYER</Text>
              <Text style={s.netValeur}>{eur(m.netAPayer)}</Text>
            </View>
          </View>
        </View>

        {/* ---------- Règlement ---------- */}
        <View style={s.reglement} wrap={false}>
          <Text style={s.blocTitre}>Règlement par virement</Text>
          <Text style={s.iban}>{e.iban}</Text>
          <Text style={{ color: GRIS, marginTop: 2 }}>
            {[e.bic && `BIC ${e.bic}`, e.banqueNom].filter(Boolean).join(' · ')}
          </Text>
          <Text style={{ color: GRIS, marginTop: 4 }}>
            Merci d&apos;indiquer {m.numero ?? 'le numéro de facture'} en référence
            du virement.
          </Text>
        </View>

        {soldee && (
          <View style={s.acquittee}>
            <Text>
              FACTURE ACQUITTÉE — réglée le {dateFr(m.encaisseLe)}
            </Text>
          </View>
        )}

        {m.conditions && (
          <View style={{ marginTop: 14 }}>
            <Text style={s.blocTitre}>Conditions particulières</Text>
            <Text>{m.conditions}</Text>
          </View>
        )}

        {/* ---------- Mentions légales ---------- */}
        <View style={s.mentions} fixed>
          {mentionsLegales(m).map((t, i) => (
            <Text key={i} style={s.mention}>{t}</Text>
          ))}
          <Text style={s.pied}>
            {[
              e.raisonSociale,
              `${e.formeJuridique} au capital de ${eur(e.capital)}`,
              e.rcs,
              `SIRET ${e.siret}`,
              e.codeApe && `APE ${e.codeApe}`,
              e.tvaIntracom && `TVA ${e.tvaIntracom}`,
            ].filter(Boolean).join(' · ')}
          </Text>
        </View>

        <Text
          style={s.pagination}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
