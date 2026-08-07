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
  /** Identifiant lisible. Les adresses de l'API ne l'acceptent PAS. */
  transaction_id: string;
  /** UUID, celui qu'attendent les adresses `/v2/transactions/{id}`. */
  id?: string;
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
            // La liste des transactions fournit déjà ces identifiants :
            // les mémoriser évite un appel au détail par opération, et
            // c'est cet appel qui échouait en 404.
            qonto_uuid: t.id ?? null,
            attachment_ids: t.attachment_ids ?? null,
            synchronise_le: new Date().toISOString(),
          };

          if (existante) {
            if (existante.statut_qonto !== 'completed') {
              // Une opération en attente peut encore changer de montant ou
              // de libellé : on la met à jour tant qu'elle n'est pas
              // consolidée.
              await db.from('transactions_qonto').update(ligne).eq('id', existante.id);
            } else {
              // Une opération consolidée est figée quant à son montant, mais
              // les identifiants techniques, eux, peuvent manquer : ils
              // n'étaient pas relevés avant. Sans cette mise à jour, une
              // opération déjà connue ne les recevrait JAMAIS, quel que soit
              // le nombre de synchronisations.
              await db.from('transactions_qonto').update({
                qonto_uuid: ligne.qonto_uuid,
                attachment_ids: ligne.attachment_ids,
                a_justificatif: ligne.a_justificatif,
                synchronise_le: ligne.synchronise_le,
              }).eq('id', existante.id);
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

    // ---- 3. Échéances d'abonnement ----
    // Le seul cas où une écriture naît sans humain : un montant déclaré
    // d'avance que la banque confirme au centime. Le reste est laissé au
    // moteur d'appariement, plus bas.
    for (const id of nouveauxIds) {
      const { data: res } = await db.rpc('echeance_pour_transaction', { p_transaction: id });
      const e = res as Record<string, unknown> | null;
      if (!e?.echeance_id) continue;

      const cree = await constaterEcheance(db, id, e);
      if (cree) auto += 1;
    }

    // ---- 4. Justificatifs déposés dans Qonto ----
    // Une pièce jointe côté banque suffit à créer l'écriture : elle est
    // extraite puis soumise à validation, jamais enregistrée d'office.
    // La récupération portait sur les seules opérations NOUVELLES. Une
    // opération déjà connue dont le justificatif n'avait pas été
    // rapatrié — parce que la synchronisation d'alors ne le faisait pas
    // encore — ne l'était donc jamais, quel que soit le nombre de
    // synchronisations suivantes.
    let justificatifsTraites = 0;
    const echecsJustificatifs: string[] = [];

    const { data: aRecuperer } = await db
      .from('transactions_qonto')
      .select('id, qonto_uuid, numero_piece, attachment_ids')
      .eq('a_justificatif', true)
      .eq('statut_qonto', 'completed')
      .is('chemin_justificatif', null)
      .limit(50);

    for (const tx of aRecuperer ?? []) {
      const r = await recupererJustificatif(
        db, tx.id, tx.attachment_ids ?? [], tx.qonto_uuid, entetes);
      if (r.ok) justificatifsTraites += 1;
      else echecsJustificatifs.push(`${tx.numero_piece ?? tx.id} : ${r.motif}`);
    }

    // ---- 5. Balayage : une opération nouvelle peut correspondre à une
    // écriture déjà saisie qui attendait son mouvement bancaire. ----
    //
    // Le moteur unique remplace les six fonctions concurrentes. Il ne
    // rattache seul qu'un montant exact ET connu d'avance ET sans
    // ambiguïté ; tout le reste devient une proposition.
    const { data: bilan } = await db.rpc('balayer_appariements');
    const balayage = (bilan ?? {}) as Record<string, number>;
    auto += Number(balayage.rattachees_automatiquement ?? 0);
    const proposees = Number(balayage.propositions_en_attente ?? 0);

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
          propositions: proposees,
          par_statut: parStatut,
          justificatifs: justificatifsTraites,
          justificatifs_echecs: echecsJustificatifs,
          rapprochements_proposes: proposees,
          ambigues: balayage.ambigues ?? 0,
          inexpliquees: balayage.restantes ?? 0,
        },
      }).eq('id', idJournal);
    }

    return NextResponse.json({
      succes: true,
      lues, nouvelles,
      rapprochees_auto: auto,
      propositions: proposees,
      solde: soldeTotal,
      par_statut: parStatut,
      justificatifs: justificatifsTraites,
      justificatifs_echecs: echecsJustificatifs,
      rapprochements_proposes: proposees,
      ambigues: balayage.ambigues ?? 0,
      inexpliquees: balayage.restantes ?? 0,
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
type ResultatJustificatif = { ok: boolean; motif: string };

async function recupererJustificatif(
  db: ReturnType<typeof admin>,
  transactionId: string,
  identifiants: string[],
  qontoUuid: string | null,
  entetes: Record<string, string>
): Promise<ResultatJustificatif> {
  try {
    // 1. Les identifiants viennent de la synchronisation. À défaut —
    // opérations enregistrées avant que la liste ne les mémorise — on
    // interroge le détail, avec l'UUID cette fois.
    let ids: string[] = identifiants ?? [];

    if (ids.length === 0) {
      if (!qontoUuid) {
        return { ok: false, motif: 'identifiants de pièce jointe inconnus — resynchronisez' };
      }
      const r = await fetch(`${BASE}/transactions/${qontoUuid}`, { headers: entetes });
      if (!r.ok) return { ok: false, motif: `détail refusé par Qonto (${r.status})` };
      const data = await r.json();
      ids = data.transaction?.attachment_ids ?? [];
    }

    if (ids.length === 0) {
      return { ok: false, motif: 'aucune pièce jointe sur cette opération' };
    }

    // 2. Métadonnées de la première pièce
    const rA = await fetch(`${BASE}/attachments/${ids[0]}`, { headers: entetes });
    if (!rA.ok) return { ok: false, motif: `pièce jointe inaccessible (${rA.status})` };
    const att = await rA.json();
    const url = att.attachment?.url;
    const nom = att.attachment?.file_name ?? 'justificatif';
    const type = att.attachment?.file_content_type ?? 'application/pdf';
    if (!url) {
      // Qonto ne rend l'adresse de téléchargement que pendant quelques
      // minutes : la demander à nouveau la régénère.
      return { ok: false, motif: 'adresse de téléchargement absente' };
    }

    // 3. Téléchargement
    const rF = await fetch(url);
    if (!rF.ok) return { ok: false, motif: `téléchargement échoué (${rF.status})` };
    const buffer = Buffer.from(await rF.arrayBuffer());

    // 4. Stockage, en attendant la dépense qui le portera
    const chemin = `qonto/${transactionId}/${Date.now()}-${nom}`;
    const { error: eUp } = await db.storage
      .from('justificatifs').upload(chemin, buffer, { contentType: type });
    if (eUp) return { ok: false, motif: `stockage refusé — ${eUp.message}` };

    await db.from('transactions_qonto').update({
      justificatif_recupere: true,
      chemin_justificatif: chemin,
      nom_justificatif: nom,
      type_justificatif: type,
    }).eq('id', transactionId);

    // Avant toute création d'écriture, on vérifie qu'une dépense ne
    // correspond pas déjà : une facture photographiée dans l'application
    // puis déposée dans Qonto ne doit pas produire deux écritures.
    const { data: cands } = await db.rpc('candidats_pour_transaction', {
      p_transaction: transactionId,
    });
    const candidats = (cands ?? []) as Array<{ piece_id: string; decision: string }>;
    const certains = candidats.filter((c) => c.decision === 'automatique');

    // Une seule correspondance certaine, sinon un humain arbitre : deux
    // écritures au même montant le même jour, cela existe.
    if (certains.length === 1) {
      const pieceId = certains[0].piece_id;

      // Les trois écritures dispersées de l'ancienne version pouvaient
      // réussir à moitié. `confirmer_appariement` crée le règlement,
      // rattache l'opération et apprend le libellé du fournisseur en une
      // seule transaction.
      const { error: eJust } = await db.rpc('rattacher_justificatif', {
        p_piece: pieceId, p_chemin: chemin, p_nom: nom,
        p_type: type, p_taille: buffer.byteLength,
      });
      if (eJust) return { ok: false, motif: `rattachement refusé — ${eJust.message}` };

      const { error: eApp } = await db.rpc('confirmer_appariement', {
        p_piece: pieceId, p_transaction: transactionId, p_automatique: true,
      });
      if (eApp) return { ok: false, motif: `appariement refusé — ${eApp.message}` };

      await db.from('transactions_qonto')
        .update({ justificatif_traite: true })
        .eq('id', transactionId);

      return { ok: true, motif: 'rattaché à une écriture certaine' };
    }

    // Aucune écriture correspondante : l'extraction est déclenchée depuis
    // l'interface, où le document reste affiché à côté des champs remplis.
    // Une extraction lancée en tâche de fond produirait une écriture que
    // personne n'aurait vue.
    return { ok: true, motif: 'fichier récupéré, en attente d\u2019écriture' };
  } catch (e) {
    return { ok: false, motif: e instanceof Error ? e.message : 'erreur inconnue' };
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

  // Chemin unique : la fonction calcule les montants d'après la
  // catégorie, attribue le numéro de pièce, crée le règlement et
  // journalise. Le régime de TVA est imposé, car aucune facture n'est
  // ici disponible pour le déduire — c'est le contrat qui le sait.
  const { data: res, error: eAchat } = await db.rpc('creer_achat', {
    p_date: t?.date_operation ?? e.date_prevue,
    p_tiers: a.fournisseur,
    p_categorie: a.categorie_id,
    p_montant_ttc: a.montant_ttc,
    p_taux_tva: a.taux_tva,
    p_objet: `${a.nom} — ${e.periode}`,
    p_etat: 'validee',
    p_origine: 'abonnement',
    p_transaction: transactionId,
    p_moyen_paiement: 'prelevement',
    p_paye_par: 'societe',
    p_notes: a.autoliquidation
      ? 'TVA autoliquidée : collectée et déduite sur la même déclaration.'
      : 'Constatée automatiquement : montant déclaré confirmé par la banque.',
    p_regime: a.autoliquidation ? 'autoliquidation' : null,
  });

  if (eAchat) return false;
  const dep = res as { id?: string; numero_piece?: string } | null;
  if (!dep?.id) return false;

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
