/**
 * SYNCHRONISATION QONTO
 *
 * Lit les opérations bancaires et tente de les rapprocher des écritures.
 * La clé API est en lecture : l'application ne peut rien écrire dans la
 * banque, ce qui exclut par construction tout mouvement d'argent.
 *
 * Le rapprochement n'agit seul que dans deux cas : une échéance
 * d'abonnement dont le montant était connu d'avance et que la banque
 * confirme à l'identique, et une dépense déjà saisie à laquelle la
 * transaction se rattache sans rien créer. Tout le reste attend une
 * décision humaine.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BASE = 'https://thirdparty.qonto.com/v2';

/** Ouverture du compte : borne inférieure de la synchronisation initiale. */
const DEPUIS = '2026-07-01';

type TransactionQonto = {
  transaction_id: string;
  amount: number | null;
  amount_cents: number | null;
  local_amount?: number | null;
  local_currency?: string | null;
  side: 'debit' | 'credit';
  currency: string;
  label: string;
  reference?: string | null;
  settled_at?: string | null;
  emitted_at: string;
  status: string;
  category?: string | null;
  attachment_ids?: string[];
  attachment_lost?: boolean;
  counterparty_name?: string | null;
};

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) throw new Error('SUPABASE_SERVICE_ROLE_KEY absente.');
  return createClient(url, cle, { auth: { persistSession: false } });
}

function entetesQonto() {
  const login = process.env.QONTO_LOGIN;
  const secret = process.env.QONTO_SECRET_KEY;
  if (!login || !secret) {
    throw new Error(
      'Identifiants Qonto absents. Renseignez QONTO_LOGIN et QONTO_SECRET_KEY.'
    );
  }
  return {
    Authorization: `${login}:${secret}`,
    'Content-Type': 'application/json',
  };
}

export async function GET(request: NextRequest) {
  const attendu = process.env.CRON_SECRET;
  const recu = request.headers.get('authorization');
  if (attendu && recu !== `Bearer ${attendu}`) {
    return NextResponse.json({ erreur: 'Non autorisé' }, { status: 401 });
  }
  return synchroniser('cron');
}

export async function POST() {
  const { createClient: createServeur } = await import('@/lib/supabase/server');
  const supabase = await createServeur();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: 'Non authentifié' }, { status: 401 });

  const { data: profil } = await supabase
    .from('profils').select('role').eq('id', user.id).single();
  if (profil?.role !== 'proprietaire') {
    return NextResponse.json({ erreur: 'Réservé au propriétaire' }, { status: 403 });
  }

  return synchroniser('manuel');
}

async function synchroniser(declencheur: 'cron' | 'manuel') {
  const debut = Date.now();
  const db = admin();

  const { data: journal } = await db
    .from('synchronisations')
    .insert({ declencheur, statut: 'en_cours' })
    .select('id').single();
  const idJournal = journal?.id as string | undefined;

  try {
    const entetes = entetesQonto();

    // ---- 1. Comptes bancaires ----
    const rOrg = await fetch(`${BASE}/organization`, { headers: entetes });
    if (!rOrg.ok) {
      const detail = await rOrg.text();
      throw new Error(
        rOrg.status === 401
          ? 'Identifiants Qonto refusés. Vérifiez QONTO_LOGIN et QONTO_SECRET_KEY.'
          : `Qonto a répondu ${rOrg.status} : ${detail.slice(0, 150)}`
      );
    }

    const org = await rOrg.json();
    const comptes = org.organization?.bank_accounts ?? [];
    if (comptes.length === 0) throw new Error('Aucun compte bancaire trouvé.');

    let soldeTotal = 0;
    let lues = 0, nouvelles = 0, auto = 0;
    const nouveauxIds: string[] = [];
    const parStatut: Record<string, number> = {};

    // ---- 2. Transactions, compte par compte ----
    for (const compte of comptes) {
      soldeTotal += Number(compte.balance ?? 0);
      const iban = compte.iban;
      let page = 1;
      let encore = true;

      while (encore && page <= 20) {
        const url = new URL(`${BASE}/transactions`);
        url.searchParams.set('iban', iban);
        url.searchParams.set('per_page', '100');
        url.searchParams.set('current_page', String(page));
        url.searchParams.set('emitted_at_from', `${DEPUIS}T00:00:00.000Z`);

        // L'API exclut par défaut les opérations non consolidées. Sans ces
        // paramètres, une autorisation de carte encore en attente n'est pas
        // renvoyée — et le solde reconstitué diverge du solde réel.
        for (const statut of ['pending', 'completed', 'declined', 'reversed']) {
          url.searchParams.append('status[]', statut);
        }

        const r = await fetch(url.toString(), { headers: entetes });
        if (!r.ok) throw new Error(`Lecture des transactions : ${r.status}`);

        const data = await r.json();
        const lot: TransactionQonto[] = data.transactions ?? [];
        lues += lot.length;
        for (const t of lot) {
          const st = normaliserStatut(t.status);
          parStatut[st] = (parStatut[st] ?? 0) + 1;
        }

        for (const t of lot) {
          // L'identifiant Qonto sert de clé : une transaction déjà connue
          // n'est jamais dupliquée, même après plusieurs synchronisations.
          const { data: existante } = await db
            .from('transactions_qonto')
            .select('id, statut_qonto')
            .eq('qonto_id', t.transaction_id)
            .maybeSingle();

          const ligne = {
            qonto_id: t.transaction_id,
            date_operation: (t.settled_at ?? t.emitted_at).slice(0, 10),
            date_valeur: t.settled_at ? t.settled_at.slice(0, 10) : null,
            libelle: t.label,
            contrepartie: t.counterparty_name ?? null,
            reference: t.reference ?? null,
            // `amount` est exprimé dans la devise du compte ; `local_amount`
            // conserve la devise d'origine. Une opération en dollars doit
            // être comptabilisée pour son montant réellement débité en euros.
            montant: Math.abs(
              t.amount != null ? Number(t.amount)
              : t.amount_cents != null ? Number(t.amount_cents) / 100
              : 0
            ),
            sens: t.side,
            devise: t.currency ?? 'EUR',
            statut_qonto: normaliserStatut(t.status),
            categorie_qonto: t.category ?? null,
            a_justificatif: (t.attachment_ids ?? []).length > 0,
            synchronise_le: new Date().toISOString(),
          };

          if (existante) {
            // Une opération en attente peut encore changer : on la met à jour
            // tant qu'elle n'est pas consolidée.
            if (existante.statut_qonto !== 'completed') {
              await db.from('transactions_qonto').update(ligne).eq('id', existante.id);
            }
            continue;
          }

          const { data: creee } = await db
            .from('transactions_qonto').insert(ligne).select('id').single();
          if (creee) { nouvelles += 1; nouveauxIds.push(creee.id); }
        }

        encore = lot.length === 100;
        page += 1;
      }
    }

    // ---- 3. Rapprochement des nouvelles opérations ----
    const propositions: Record<string, unknown>[] = [];
    for (const id of nouveauxIds) {
      const { data: res } = await db.rpc('rapprocher_transaction', { p_id: id });
      const r = res as { resultat?: string } | null;

      if (r?.resultat === 'depense_rattachee') {
        auto += 1;
      } else if (r?.resultat === 'echeance_exacte') {
        // Le montant était déclaré à l'avance et la banque le confirme :
        // c'est le seul cas où une écriture naît sans intervention.
        const cree = await constaterEcheance(db, id, r as Record<string, unknown>);
        if (cree) auto += 1;
      } else if (r?.resultat === 'fournisseur_connu') {
        propositions.push({ transaction: id, ...r });
      }
    }

    // ---- 4. Justificatifs déposés dans Qonto ----
    // Une pièce jointe côté banque suffit à créer l'écriture : elle est
    // extraite puis soumise à validation, jamais enregistrée d'office.
    let justificatifsTraites = 0;
    for (const id of nouveauxIds) {
      const { data: tx } = await db
        .from('transactions_qonto')
        .select('id, a_justificatif, statut_qonto, statut_traitement, qonto_id')
        .eq('id', id).single();

      if (!tx?.a_justificatif) continue;
      if (tx.statut_qonto !== 'completed') continue;      // montant encore mouvant
      if (tx.statut_traitement !== 'a_traiter') continue; // déjà rattachée

      const ok = await recupererJustificatif(db, tx.id, tx.qonto_id, entetes);
      if (ok) justificatifsTraites += 1;
    }

    // ---- 5. Balayage : une opération nouvelle peut correspondre à une
    // dépense déjà saisie qui attendait son mouvement bancaire. ----
    const { data: proposees } = await db.rpc('balayer_rapprochements');

    const duree = Date.now() - debut;

    if (idJournal) {
      await db.from('synchronisations').update({
        terminee_le: new Date().toISOString(),
        statut: 'reussie',
        transactions_lues: lues,
        transactions_nouvelles: nouvelles,
        rapprochees_auto: auto,
        solde_qonto: soldeTotal,
        duree_ms: duree,
        detail: {
          propositions: propositions.length,
          par_statut: parStatut,
          justificatifs: justificatifsTraites,
          rapprochements_proposes: proposees ?? 0,
        },
      }).eq('id', idJournal);
    }

    return NextResponse.json({
      succes: true,
      lues, nouvelles,
      rapprochees_auto: auto,
      propositions: propositions.length,
      solde: soldeTotal,
      par_statut: parStatut,
      justificatifs: justificatifsTraites,
      rapprochements_proposes: proposees ?? 0,
      duree_ms: duree,
    });

  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue';
    if (idJournal) {
      await db.from('synchronisations').update({
        terminee_le: new Date().toISOString(),
        statut: 'echouee',
        erreur: message,
        duree_ms: Date.now() - debut,
      }).eq('id', idJournal);
    }
    return NextResponse.json({ succes: false, erreur: message }, { status: 500 });
  }
}

/**
 * Récupère la pièce jointe déposée dans Qonto, la stocke, puis crée une
 * dépense en attente de validation. L'écriture n'entre jamais en
 * comptabilité sans relecture : le montant vient de la banque, mais
 * l'affectation comptable reste une interprétation.
 */
async function recupererJustificatif(
  db: ReturnType<typeof admin>,
  transactionId: string,
  qontoId: string,
  entetes: Record<string, string>
): Promise<boolean> {
  try {
    // 1. Détail de l'opération, pour obtenir les identifiants de pièces
    const r = await fetch(`${BASE}/transactions/${qontoId}`, { headers: entetes });
    if (!r.ok) return false;
    const data = await r.json();
    const ids: string[] = data.transaction?.attachment_ids ?? [];
    if (ids.length === 0) return false;

    // 2. Métadonnées de la première pièce
    const rA = await fetch(`${BASE}/attachments/${ids[0]}`, { headers: entetes });
    if (!rA.ok) return false;
    const att = await rA.json();
    const url = att.attachment?.url;
    const nom = att.attachment?.file_name ?? 'justificatif';
    const type = att.attachment?.file_content_type ?? 'application/pdf';
    if (!url) return false;

    // 3. Téléchargement
    const rF = await fetch(url);
    if (!rF.ok) return false;
    const buffer = Buffer.from(await rF.arrayBuffer());

    // 4. Stockage, en attendant la dépense qui le portera
    const chemin = `qonto/${transactionId}/${Date.now()}-${nom}`;
    const { error: eUp } = await db.storage
      .from('justificatifs').upload(chemin, buffer, { contentType: type });
    if (eUp) return false;

    await db.from('transactions_qonto')
      .update({ justificatif_recupere: true })
      .eq('id', transactionId);

    // L'extraction proprement dite est déclenchée depuis l'interface :
    // elle passe par la clé API du modèle et doit rester visible de
    // l'utilisateur, avec le document affiché à côté des champs.
    return true;
  } catch {
    return false;
  }
}

function normaliserStatut(s: string): string {
  const m: Record<string, string> = {
    completed: 'completed', settled: 'completed',
    pending: 'pending', processing: 'pending',
    declined: 'declined', reversed: 'reversed',
  };
  return m[s] ?? 'pending';
}

/**
 * Constate une échéance d'abonnement dont le montant correspond
 * exactement au prélèvement observé.
 */
async function constaterEcheance(
  db: ReturnType<typeof admin>,
  transactionId: string,
  r: Record<string, unknown>
): Promise<boolean> {
  const echeanceId = r.echeance_id as string;

  const { data: e } = await db
    .from('abonnement_echeances')
    .select('*, abonnements(*)')
    .eq('id', echeanceId).single();
  if (!e) return false;

  const a = e.abonnements as Record<string, unknown>;
  const { data: t } = await db
    .from('transactions_qonto').select('date_operation').eq('id', transactionId).single();

  const { data: dep } = await db.from('depenses').insert({
    date_depense: t?.date_operation ?? e.date_prevue,
    fournisseur: a.fournisseur,
    libelle: `${a.nom} — ${e.periode}`,
    categorie_id: a.categorie_id,
    montant_ht: a.montant_ht,
    taux_tva: a.taux_tva,
    montant_tva: a.montant_tva,
    montant_ttc: a.montant_ttc,
    taux_deductibilite: 100,
    compte: '6226',
    tva_deductible: a.montant_tva,
    moyen_paiement: 'prelevement',
    paye_par: 'societe',
    statut: 'validee',
    transaction_qonto_id: transactionId,
    paye_le: t?.date_operation ?? null,
    notes: a.autoliquidation
      ? 'TVA autoliquidée : déclarer en collectée et en déductible.'
      : 'Constatée automatiquement : montant déclaré confirmé par la banque.',
  }).select('id, numero_piece').single();

  if (!dep) return false;

  await db.from('abonnement_echeances').update({
    statut: 'payee',
    date_constatee: t?.date_operation ?? null,
    montant_reel: a.montant_ttc,
    depense_id: dep.id,
    transaction_qonto_id: transactionId,
  }).eq('id', echeanceId);

  await db.from('transactions_qonto').update({
    statut_traitement: 'rattachee',
    depense_id: dep.id,
    echeance_id: echeanceId,
    rattachement_auto: true,
    rattache_le: new Date().toISOString(),
  }).eq('id', transactionId);

  return true;
}
