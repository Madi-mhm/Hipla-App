/**
 * GABARIT DE RELANCE
 *
 * Mise en page seule, comme pour la facture : aucun calcul, aucune règle
 * métier. Tout arrive prêt dans le modèle.
 *
 * Une relance est un COURRIER, pas un tableau. La mise en page suit donc
 * les usages de la correspondance d'affaires — lieu et date en haut à
 * droite, objet souligné, formule de politesse, signature — plutôt que
 * la grille d'un document comptable.
 *
 * Le rappel de la facture reste sobre : quatre chiffres dans un encadré,
 * qui disent le montant facturé, ce qui a été reçu et ce qui reste dû.
 * Un client qui lit ce courrier doit comprendre en trois secondes ce
 * qu'on lui demande.
 */

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  corpsRelance, mentionsRelance, intituleRelance, type ModeleRelance,
} from '@/lib/relance-modele';

/* ---- Charte, reprise de la facture ---- */
const NAVY = '#001d3b';
const GOLD = '#8a5f1c';
const ENCRE = '#262c33';
const GRIS = '#5f6a75';
const FILET = '#d3d8dd';
const BONE = '#f5f3ef';
const ALERTE = '#b42318';

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

const s = StyleSheet.create({
  page: {
    paddingTop: 44, paddingBottom: 62, paddingHorizontal: 52,
    fontSize: 9.5, fontFamily: 'Helvetica', color: ENCRE, lineHeight: 1.5,
  },

  entete: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 34 },
  emetteurNom: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 5 },
  emetteurLigne: { fontSize: 8, color: GRIS },

  titreBloc: { alignItems: 'flex-end' },
  titre: { fontSize: 15, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  lieuDate: { fontSize: 9, color: GRIS, marginTop: 8 },

  destinataire: { marginLeft: 'auto', width: 240, marginBottom: 30 },
  destinataireNom: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: NAVY },
  destinataireLigne: { fontSize: 9, color: ENCRE },

  objet: { marginBottom: 20 },
  objetLibelle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: NAVY },

  paragraphe: { marginBottom: 11, textAlign: 'justify' },

  /* Le rappel chiffré : quatre lignes, encadrées. */
  encadre: {
    borderWidth: 1, borderColor: FILET, borderRadius: 3,
    padding: 14, marginTop: 6, marginBottom: 18, backgroundColor: BONE,
  },
  ligneChiffre: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 3,
  },
  ligneLibelle: { fontSize: 9, color: GRIS },
  ligneValeur: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: ENCRE },
  separateur: { borderTopWidth: 1, borderTopColor: FILET, marginVertical: 6 },
  ligneSolde: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 },
  soldeLibelle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: NAVY },
  soldeValeur: { fontSize: 13, fontFamily: 'Helvetica-Bold' },

  reglementTitre: {
    fontSize: 8, color: GRIS, letterSpacing: 0.7, marginTop: 12, marginBottom: 5,
  },
  reglementLigne: { fontSize: 8.5, color: GRIS, paddingVertical: 1 },

  virement: {
    borderLeftWidth: 2, borderLeftColor: GOLD, paddingLeft: 10,
    marginTop: 16, marginBottom: 16,
  },
  iban: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: NAVY, letterSpacing: 0.4 },

  politesse: { marginTop: 16, marginBottom: 30 },
  signature: { fontSize: 9.5, color: ENCRE },
  signataire: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: NAVY, marginTop: 22 },

  mentions: {
    position: 'absolute', bottom: 40, left: 52, right: 52,
    borderTopWidth: 1, borderTopColor: FILET, paddingTop: 8,
  },
  mention: { fontSize: 7, color: GRIS, lineHeight: 1.5 },
  pied: {
    position: 'absolute', bottom: 22, left: 52, right: 52,
    fontSize: 6.5, color: GRIS, textAlign: 'center',
  },
});

/**
 * Fonction, non composant : `renderToBuffer` reçoit un élément, et
 * déclarer un composant React ici provoquait une erreur de type au
 * moment du rendu côté serveur.
 */
export function documentRelance(m: ModeleRelance) {
  const corps = corpsRelance(m);
  const mentions = mentionsRelance(m);
  const couleurTitre = m.degre === 'mise_en_demeure' ? ALERTE
                     : m.degre === 'relance' ? GOLD : NAVY;

  return (
    <Document
      title={`${intituleRelance(m.degre)} — ${m.numeroPiece}`}
      author={m.entreprise}>
      <Page size="A4" style={s.page}>

        {/* ---- En-tête ---- */}
        <View style={s.entete}>
          <View>
            <Text style={s.emetteurNom}>{m.entreprise}</Text>
            <Text style={s.emetteurLigne}>{m.adresse}</Text>
            <Text style={s.emetteurLigne}>{m.codePostal} {m.ville}</Text>
            {m.telephone && <Text style={s.emetteurLigne}>{m.telephone}</Text>}
            {m.courriel && <Text style={s.emetteurLigne}>{m.courriel}</Text>}
          </View>
          <View style={s.titreBloc}>
            <Text style={[s.titre, { color: couleurTitre }]}>
              {intituleRelance(m.degre)}
            </Text>
            <Text style={s.lieuDate}>
              {m.ville}, le {dateFr(m.dateRelance)}
            </Text>
          </View>
        </View>

        {/* ---- Destinataire, en haut à droite comme un courrier ---- */}
        <View style={s.destinataire}>
          <Text style={s.destinataireNom}>{m.clientNom}</Text>
          {m.clientContact && (
            <Text style={s.destinataireLigne}>À l&apos;attention de {m.clientContact}</Text>
          )}
          {m.clientAdresse && <Text style={s.destinataireLigne}>{m.clientAdresse}</Text>}
          {(m.clientCodePostal || m.clientVille) && (
            <Text style={s.destinataireLigne}>
              {m.clientCodePostal} {m.clientVille}
            </Text>
          )}
        </View>

        {/* ---- Objet ---- */}
        <View style={s.objet}>
          <Text style={s.objetLibelle}>
            Objet : facture {m.numeroPiece}
            {m.objet ? ` — ${m.objet}` : ''}
          </Text>
        </View>

        <Text style={s.paragraphe}>Madame, Monsieur,</Text>

        {corps.map((p, i) => (
          <Text key={i} style={s.paragraphe}>{p}</Text>
        ))}

        {/* ---- Le rappel chiffré ---- */}
        <View style={s.encadre}>
          <View style={s.ligneChiffre}>
            <Text style={s.ligneLibelle}>
              Facture {m.numeroPiece} du {dateFr(m.dateEmission)}
            </Text>
            <Text style={s.ligneValeur}>{eur(m.montantTtc)}</Text>
          </View>
          {m.dateEcheance && (
            <View style={s.ligneChiffre}>
              <Text style={s.ligneLibelle}>Échéance</Text>
              <Text style={s.ligneValeur}>{dateFr(m.dateEcheance)}</Text>
            </View>
          )}
          <View style={s.ligneChiffre}>
            <Text style={s.ligneLibelle}>Déjà réglé</Text>
            <Text style={s.ligneValeur}>{eur(m.montantRegle)}</Text>
          </View>

          <View style={s.separateur} />

          <View style={s.ligneSolde}>
            <Text style={s.soldeLibelle}>Reste dû</Text>
            <Text style={[s.soldeValeur, { color: couleurTitre }]}>
              {eur(m.resteDu)}
            </Text>
          </View>

          {/* Le détail des versements : c'est ce qui évite la
              contestation « j'ai pourtant payé ». */}
          {m.reglements.length > 0 && (
            <>
              <Text style={s.reglementTitre}>RÈGLEMENTS ENREGISTRÉS</Text>
              {m.reglements.map((r, i) => (
                <View key={i} style={s.ligneChiffre}>
                  <Text style={s.reglementLigne}>
                    {dateFr(r.date)} · {r.moyen}
                  </Text>
                  <Text style={s.reglementLigne}>{eur(r.montant)}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        {/* ---- Comment payer ---- */}
        {m.iban && (
          <View style={s.virement}>
            <Text style={{ fontSize: 8, color: GRIS, marginBottom: 3 }}>
              RÈGLEMENT PAR VIREMENT
            </Text>
            <Text style={s.iban}>{m.iban}</Text>
            {(m.bic || m.banque) && (
              <Text style={{ fontSize: 8, color: GRIS, marginTop: 2 }}>
                {m.bic}{m.bic && m.banque ? ' · ' : ''}{m.banque}
              </Text>
            )}
            <Text style={{ fontSize: 8, color: GRIS, marginTop: 3 }}>
              Merci d&apos;indiquer {m.numeroPiece} en référence du virement.
            </Text>
          </View>
        )}

        <View style={s.politesse}>
          <Text style={s.signature}>
            {m.degre === 'mise_en_demeure'
              ? 'Veuillez agréer, Madame, Monsieur, l\u2019expression de nos salutations distinguées.'
              : 'Nous vous prions d\u2019agréer, Madame, Monsieur, l\u2019expression de nos salutations distinguées.'}
          </Text>
          <Text style={s.signataire}>{m.entreprise}</Text>
        </View>

        {mentions.length > 0 && (
          <View style={s.mentions} fixed>
            {mentions.map((t, i) => (
              <Text key={i} style={s.mention}>{t}</Text>
            ))}
          </View>
        )}

        <Text style={s.pied} fixed>{m.mentionsPied}</Text>
      </Page>
    </Document>
  );
}
