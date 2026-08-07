/**
 * EXTRACTION D'UNE FACTURE PAR LE MODÈLE
 *
 * Reçoit une image ou un PDF, renvoie les champs structurés.
 * Ne crée aucune écriture : l'extraction propose, l'utilisateur valide.
 *
 * Le modèle par défaut est Haiku — lire des montants sur une facture est
 * une tâche simple, et le coût par document tombe sous le millième d'euro.
 * Un repli sur Sonnet est déclenché uniquement si la confiance est basse.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Plafond mensuel d'extractions. Au-delà, l'appel est refusé. */
const PLAFOND_MENSUEL = 100;

const MODELE_RAPIDE = 'claude-haiku-4-5-20251001';
const MODELE_PRECIS = 'claude-sonnet-4-6';

/**
 * Tarifs publics par million de tokens, en dollars, convertis en euros
 * à un taux prudent. Sert au suivi de coût, pas à la facturation.
 */
const TARIFS: Record<string, { entree: number; sortie: number }> = {
  [MODELE_RAPIDE]: { entree: 1.0, sortie: 5.0 },
  [MODELE_PRECIS]: { entree: 3.0, sortie: 15.0 },
};
const TAUX_USD_EUR = 0.92;

const CONSIGNE = `Tu analyses une facture ou un ticket de caisse français.

Renvoie UNIQUEMENT un objet JSON, sans texte autour, sans balises de code.

{
  "fournisseur": "nom commercial du vendeur",
  "numero_facture": "référence de la facture chez le fournisseur, null si absente",
  "siret_fournisseur": "14 chiffres, null si absent",
  "tva_fournisseur": "numéro de TVA intracommunautaire, null si absent",
  "date": "AAAA-MM-JJ",
  "montant_ht": 0.00,
  "taux_tva": 20,
  "montant_tva": 0.00,
  "montant_ttc": 0.00,
  "devise": "EUR",
  "mode_paiement": "carte | especes | virement | prelevement | null",
  "lignes": [{ "libelle": "...", "quantite": 1, "prix_unitaire": 0.00 }],
  "description": "résumé court de l'achat, 3 à 8 mots, ex. « éponges, sacs poubelle, papier toilette »",
  "categorie_suggeree": "un des libellés fournis ci-dessous",
  "confiance": 0.95,
  "remarques": "ce qui est illisible ou incertain, null si tout est net"
}

Règles :
- Les montants sont des nombres, jamais des chaînes. Point décimal.
- Si seul le TTC est lisible et que le taux de TVA est visible, déduis le HT.
- Si aucune TVA n'apparaît, mets taux_tva à 0 et montant_tva à 0.
- tva_fournisseur est DÉTERMINANT et il faut le chercher activement : c'est
  lui qui décide du régime de TVA. Relève-le où qu'il figure — en-tête, pied
  de page, mentions légales — et recopie-le tel quel, préfixe pays compris
  (FR, IE, LU, NL…). Un numéro non français sans taxe facturée signifie que
  l'acheteur autoliquide la TVA.
- Cherche aussi les mentions « autoliquidation », « reverse charge »,
  « VAT reverse charged », « Article 196 » ou « self-assessment », et
  signale-les dans remarques. Elles confirment le régime.
- Si la facture est libellée dans une autre devise que l'euro, mets devise
  en conséquence ET signale-le dans remarques : le montant à comptabiliser
  sera celui du débit bancaire en euros, pas celui de la facture.
- La date est celle de la facture, pas celle d'impression.
- confiance reflète ta certitude globale, de 0 à 1. Sois honnête : une
  photo floue ou un ticket froissé doit faire descendre cette valeur.
- Si un champ est illisible, mets null plutôt que d'inventer.
- numero_facture : sur un ticket de caisse il n'y a pas de facture, mais
  relève l'identifiant du ticket ou de la transaction s'il apparaît. Il sert
  à repérer un même achat photographié deux fois.
- description : ce que l'on a acheté, en quelques mots. Pas la liste
  complète, une synthèse utilisable six mois plus tard.
- categorie_suggeree : choisis d'après la NATURE des articles, pas d'après
  la ressemblance du libellé. Des éponges et du papier toilette sont des
  produits d'entretien, pas des consommables de nettoyage professionnel.
- Distingue le SERVICE du BIEN, c'est la faute la plus coûteuse. Un
  abonnement, un hébergement, une licence mensuelle, une prestation
  récurrente sont des services — jamais du matériel, même lorsque le
  fournisseur vend par ailleurs de l'équipement. Un abonnement Vercel ou
  Google n'est pas du matériel informatique.
- Un achat ponctuel de matériel durable au-delà de 500 € HT est une
  immobilisation, pas une charge : signale-le dans remarques.`;

export async function POST(request: NextRequest) {
  const debut = Date.now();

  // ---- Authentification et permission ----
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: 'Non authentifié' }, { status: 401 });

  const { data: profil } = await supabase
    .from('profils').select('role, nom_complet').eq('id', user.id).single();
  if (!profil || !['proprietaire', 'contributeur'].includes(profil.role)) {
    return NextResponse.json({ erreur: 'Permission insuffisante' }, { status: 403 });
  }

  const cle = process.env.ANTHROPIC_API_KEY;
  if (!cle) {
    return NextResponse.json({
      erreur: "Clé ANTHROPIC_API_KEY absente des variables d'environnement.",
    }, { status: 500 });
  }

  // ---- Plafond mensuel ----
  const { data: usage } = await supabase.rpc('usage_ia_du_mois');
  const dejaFait = Number(usage?.extractions ?? 0);
  if (dejaFait >= PLAFOND_MENSUEL) {
    return NextResponse.json({
      erreur: `Plafond mensuel atteint : ${PLAFOND_MENSUEL} extractions. ` +
              'Le compteur se remet à zéro le 1er du mois prochain.',
      plafond_atteint: true,
    }, { status: 429 });
  }

  try {
    const corps = await request.json();
    const { fichier, typeMime, nomFichier, taille } = corps as {
      fichier: string; typeMime: string; nomFichier: string; taille: number;
    };

    if (!fichier || !typeMime) {
      return NextResponse.json({ erreur: 'Fichier manquant.' }, { status: 400 });
    }

    // ---- Catégories disponibles, pour guider la suggestion ----
    const { data: cats } = await supabase
      .from('categories').select('libelle, groupe, compte, avertissement')
      .eq('actif', true).eq('bloque', false);

    // Le seul libellé ne suffit pas à choisir : « Consommables » et
    // « Produits d'entretien » se ressemblent sans recouvrir la même chose.
    // On fournit donc des exemples concrets pour les catégories ambiguës.
    const EXEMPLES: Record<string, string> = {
      "Produits d'entretien": 'détergents, éponges, papier toilette, sacs poubelle, lingettes',
      'Consommables (microfibres, sacs, gants)': 'microfibres, gants jetables, sacs professionnels',
      'Petit outillage': 'balais, seaux, raclettes, matériel non durable',
      'Vêtements de travail': 'blouses, chaussures de sécurité, tenues',
      'Fournitures de bureau': 'papeterie, cartouches, classeurs',
      'Abonnements logiciels': 'licences, SaaS, outils en ligne',
      'Publicité et communication': 'cartes de visite, flyers, impressions, annonces',
      'Repas et restauration': 'restaurant, traiteur, plateaux repas',
      'Péages': 'autoroute, télépéage',
      'Parking': 'stationnement, horodateur',
    };

    const listeCategories = (cats ?? []).map((c) => {
      const ex = EXEMPLES[c.libelle];
      return `- ${c.libelle} (${c.groupe})${ex ? ` — ex. ${ex}` : ''}`;
    }).join('\n');

    const contenu = typeMime === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fichier } }
      : { type: 'image', source: { type: 'base64', media_type: typeMime, data: fichier } };

    const modele = MODELE_RAPIDE;

    const reponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cle,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modele,
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            contenu,
            { type: 'text', text: `${CONSIGNE}\n\nCatégories disponibles :\n${listeCategories}` },
          ],
        }],
      }),
    });

    if (!reponse.ok) {
      const detail = await reponse.text();
      await journaliserUsage(supabase, {
        utilisateur: user.id, modele, nomFichier, taille,
        succes: false, erreur: `HTTP ${reponse.status} : ${detail.slice(0, 200)}`,
        duree: Date.now() - debut,
      });
      // Un 401 ne se résout pas en réessayant : autant le dire.
      const message =
        reponse.status === 401
          ? "Clé API refusée. Vérifiez ANTHROPIC_API_KEY dans .env.local — "
            + "elle doit contenir uniquement la clé, sans le reste de la commande "
            + "d'exemple — et que le compte Anthropic dispose de crédit."
          : reponse.status === 429
            ? "Trop de requêtes envoyées à l'API. Patientez une minute."
            : reponse.status >= 500
              ? "Le service d'extraction est momentanément indisponible. Réessayez."
              : `Le service d'extraction a répondu ${reponse.status}.`;

      return NextResponse.json({ erreur: message, definitif: reponse.status === 401 },
        { status: 502 });
    }

    const data = await reponse.json();
    const texte = (data.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('\n')
      .replace(/```json|```/g, '')
      .trim();

    let extrait;
    try {
      extrait = JSON.parse(texte);
    } catch {
      await journaliserUsage(supabase, {
        utilisateur: user.id, modele, nomFichier, taille,
        succes: false, erreur: 'Réponse non exploitable',
        entree: data.usage?.input_tokens, sortie: data.usage?.output_tokens,
        duree: Date.now() - debut,
      });
      return NextResponse.json({
        erreur: "Le document n'a pas pu être lu. Photographiez-le mieux éclairé, ou saisissez la dépense manuellement.",
      }, { status: 422 });
    }

    // ---- Contrôle arithmétique : HT + TVA doit égaler TTC ----
    const ht = Number(extrait.montant_ht ?? 0);
    const tva = Number(extrait.montant_tva ?? 0);
    const ttc = Number(extrait.montant_ttc ?? 0);
    const coherent = Math.abs(ht + tva - ttc) < 0.02;

    // ---- Coût ----
    const entree = data.usage?.input_tokens ?? 0;
    const sortie = data.usage?.output_tokens ?? 0;
    const tarif = TARIFS[modele] ?? TARIFS[MODELE_RAPIDE];
    const cout = ((entree / 1e6) * tarif.entree + (sortie / 1e6) * tarif.sortie) * TAUX_USD_EUR;

    await journaliserUsage(supabase, {
      utilisateur: user.id, modele, nomFichier, taille,
      succes: true, entree, sortie, cout,
      confiance: Number(extrait.confiance ?? 0),
      duree: Date.now() - debut,
    });

    // ---- Doublon ? ----
    let doublons = null;
    if (extrait.fournisseur && ttc > 0) {
      const { data: d } = await supabase.rpc('chercher_doublon', {
        p_fournisseur: extrait.fournisseur,
        p_numero: extrait.numero_facture ?? null,
        p_montant: ttc,
        p_date: extrait.date ?? new Date().toISOString().slice(0, 10),
      });
      if (d && d.length > 0) doublons = d;
    }

    // ---- Catégorie déjà connue pour ce fournisseur ? ----
    let categorieMemorisee = null;
    if (extrait.fournisseur) {
      const { data: f } = await supabase
        .from('fournisseurs_connus')
        .select('categorie_id, occurrences')
        .eq('fournisseur', String(extrait.fournisseur).toLowerCase().trim())
        .maybeSingle();
      if (f) categorieMemorisee = f;
    }

    return NextResponse.json({
      succes: true,
      extrait,
      coherent,
      doublons,
      categorieMemorisee,
      usage: {
        cout: Number(cout.toFixed(6)),
        tokens: entree + sortie,
        reste: PLAFOND_MENSUEL - dejaFait - 1,
        plafond: PLAFOND_MENSUEL,
      },
      duree_ms: Date.now() - debut,
    });

  } catch (e) {
    return NextResponse.json({
      erreur: e instanceof Error ? e.message : 'Erreur inconnue',
    }, { status: 500 });
  }
}

type Trace = {
  utilisateur: string; modele: string;
  nomFichier?: string; taille?: number;
  succes: boolean; erreur?: string;
  entree?: number; sortie?: number; cout?: number;
  confiance?: number; duree: number;
};

async function journaliserUsage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  t: Trace
) {
  await supabase.from('usage_ia').insert({
    utilisateur: t.utilisateur,
    modele: t.modele,
    nom_fichier: t.nomFichier ?? null,
    taille_octets: t.taille ?? null,
    tokens_entree: t.entree ?? 0,
    tokens_sortie: t.sortie ?? 0,
    cout_estime: t.cout ?? 0,
    succes: t.succes,
    confiance: t.confiance ?? null,
    erreur: t.erreur ?? null,
    duree_ms: t.duree,
  });
}
