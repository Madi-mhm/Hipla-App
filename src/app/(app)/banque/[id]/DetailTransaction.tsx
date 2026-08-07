'use client';

/**
 * DÉTAIL D'UNE OPÉRATION BANCAIRE
 *
 * Le montant vient de la banque : il est certain, et rien ne permet de
 * le modifier. Tout le reste — le fournisseur, la catégorie, le régime
 * de TVA — est une interprétation, et se saisit ici.
 *
 * L'écran corrige trois manques du dialogue rapide : le taux de TVA
 * n'était pas modifiable, le régime jamais, et le justificatif déjà
 * téléchargé de Qonto restait invisible.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money, dateLong } from '@/lib/format';
import Alerte from '@/components/Alerte';
import type { Categorie } from '@/lib/types';

/**
 * `candidats_pour_transaction` renvoie des PIÈCES, pas des opérations :
 * on part d'un mouvement bancaire et l'on cherche l'écriture. Le type
 * `Candidat` de `registre.ts` décrit le sens inverse.
 */
export type CandidatPiece = {
  piece_id: string;
  numero_piece: string | null;
  tiers: string;
  date_piece: string;
  reste_du: number;
  score: number;
  decision: string;
  motifs: string[];
};

type Transaction = {
  id: string;
  qonto_id: string;
  numero_piece: string | null;
  date_operation: string;
  date_valeur: string | null;
  libelle: string;
  contrepartie: string | null;
  reference: string | null;
  montant: number;
  sens: 'debit' | 'credit';
  devise: string;
  statut_qonto: string;
  statut_traitement: string;
  categorie_qonto: string | null;
  a_justificatif: boolean;
  chemin_justificatif: string | null;
  nom_justificatif: string | null;
  motif_ecart: string | null;
};

export type Ecriture = {
  id: string;
  numero_piece: string | null;
  tiers_libelle: string;
  montant_ttc: number;
  etat: string;
} | null;

/** Une écriture encore ouverte, offerte au rattachement manuel. */
export type EcritureOuverte = {
  id: string;
  numero_piece: string | null;
  date_piece: string;
  tiers_libelle: string;
  net_a_payer: number;
  montant_regle: number;
  etat: string;
};

type Props = {
  transaction: Transaction;
  categories: Categorie[];
  candidats: CandidatPiece[];
  ouvertes: EcritureOuverte[];
  urlJustificatif: string | null;
  ecriture: Ecriture;
  regle: Record<string, unknown> | null;
  peutGerer: boolean;
};

/** Comptes usuels d'une opération qui n'est ni un achat ni une vente. */
const COMPTES_DIVERS = [
  { compte: '1013', libelle: 'Capital souscrit appelé et versé', sens: 'credit' },
  { compte: '4551', libelle: 'Compte courant d\u2019associé', sens: 'credit' },
  { compte: '7581', libelle: 'Produits divers de gestion courante', sens: 'credit' },
  { compte: '791',  libelle: 'Transfert de charges', sens: 'credit' },
  { compte: '4551', libelle: 'Remboursement à un associé', sens: 'debit' },
  { compte: '627',  libelle: 'Services bancaires', sens: 'debit' },
];

export default function DetailTransaction({
  transaction: t, categories, candidats, ouvertes, urlJustificatif,
  ecriture, regle, peutGerer,
}: Props) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const alias = regle?.tiers_id ? String(regle.source ?? '') : '';

  // Saisie d'une dépense
  const [fournisseur, setFournisseur] = useState(t.contrepartie ?? t.libelle);
  const [categorieId, setCategorieId] = useState(
    typeof regle?.categorie_id === 'string' ? regle.categorie_id : '');
  const [objet, setObjet] = useState(t.libelle);
  const [tauxTva, setTauxTva] = useState<number>(20);
  const [regime, setRegime] = useState<'auto' | 'france' | 'autoliquidation' | 'exonere'>('auto');
  const [tvaIntracom, setTvaIntracom] = useState('');

  // Rattachement manuel
  const [choixEcriture, setChoixEcriture] = useState('');

  // Avoir fournisseur
  const [avoirTiers, setAvoirTiers] = useState(t.contrepartie ?? t.libelle);
  const [avoirCategorie, setAvoirCategorie] = useState('');
  const [avoirTaux, setAvoirTaux] = useState<number>(20);
  const [avoirObjet, setAvoirObjet] = useState('');
  const [avoirNumero, setAvoirNumero] = useState('');

  // Opération diverse
  const [compte, setCompte] = useState('');
  const [libelleDivers, setLibelleDivers] = useState('');

  const montant = Math.abs(Number(t.montant));
  const traitee = t.statut_traitement !== 'a_traiter';
  const consolidee = t.statut_qonto === 'completed';
  const comptesPossibles = COMPTES_DIVERS.filter((c) => c.sens === t.sens);

  async function creerDepense() {
    if (!categorieId) { setErreur('Choisissez une catégorie.'); return; }
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    // Le montant vient de la banque : il n'est pas saisissable.
    const { data, error } = await supabase.rpc('creer_achat', {
      p_date: t.date_operation,
      p_tiers: fournisseur.trim(),
      p_categorie: categorieId,
      p_montant_ttc: montant,
      p_taux_tva: tauxTva,
      p_objet: objet.trim() || null,
      p_etat: 'a_valider',
      p_origine: 'banque',
      p_transaction: t.id,
      p_moyen_paiement: 'carte',
      p_paye_par: 'societe',
      p_notes: 'Créée depuis une opération bancaire : montant confirmé par la banque.',
      p_tva_intracom: tvaIntracom.trim() || null,
      p_regime: regime === 'auto' ? null : regime,
    });

    if (error) { setErreur(`Création impossible — ${error.message}`); setEnCours(false); return; }

    const piece = data as { id?: string; numero_piece?: string; regime_tva?: string } | null;

    // Le justificatif déjà téléchargé de Qonto rejoint la pièce : le
    // fichier est là depuis la synchronisation, il n'y a rien à renvoyer.
    if (piece?.id && t.chemin_justificatif) {
      await supabase.rpc('rattacher_justificatif_qonto', {
        p_transaction: t.id, p_piece: piece.id,
      });
    }

    setSucces(
      `${piece?.numero_piece ?? 'Écriture'} créée en attente de validation`
      + (piece?.regime_tva && piece.regime_tva !== 'france'
         ? ` — régime « ${piece.regime_tva} »` : '')
      + (t.chemin_justificatif ? '. Justificatif repris de Qonto.' : '.')
    );
    setEnCours(false);
    router.refresh();
  }

  async function creerAvoir() {
    if (!avoirCategorie) { setErreur('Choisissez la catégorie de la charge d\u2019origine.'); return; }
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    const { data, error } = await supabase.rpc('creer_avoir_achat', {
      p_transaction: t.id,
      p_tiers: avoirTiers.trim(),
      p_categorie: avoirCategorie,
      p_montant_ttc: montant,
      p_taux_tva: avoirTaux,
      p_objet: avoirObjet.trim() || null,
      p_numero: avoirNumero.trim() || null,
    });

    if (error) { setErreur(`Avoir impossible — ${error.message}`); setEnCours(false); return; }

    const a = data as { numero_piece?: string; charge_annulee?: number; tva_reversee?: number } | null;
    setSucces(
      `${a?.numero_piece ?? 'Avoir'} enregistré — ${money(Number(a?.charge_annulee ?? 0))} `
      + `de charge annulée et ${money(Number(a?.tva_reversee ?? 0))} de TVA reversée.`
    );
    setEnCours(false);
    router.refresh();
  }

  async function creerDivers() {
    if (!compte) { setErreur('Choisissez un compte.'); return; }
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    const { data, error } = await supabase.rpc('creer_operation_banque', {
      p_transaction: t.id,
      p_compte: compte,
      p_libelle: libelleDivers.trim()
        || comptesPossibles.find((c) => c.compte === compte)?.libelle
        || t.libelle,
    });

    if (error) { setErreur(`Création impossible — ${error.message}`); setEnCours(false); return; }
    const piece = data as { numero_piece?: string } | null;
    setSucces(`${piece?.numero_piece ?? 'Écriture'} créée et rapprochée.`);
    setEnCours(false);
    router.refresh();
  }

  async function rapprocher(pieceId: string) {
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    const { error } = await supabase.rpc('confirmer_appariement', {
      p_piece: pieceId, p_transaction: t.id, p_automatique: false,
    });

    if (error) { setErreur(`Rapprochement impossible — ${error.message}`); setEnCours(false); return; }

    if (t.chemin_justificatif) {
      await supabase.rpc('rattacher_justificatif_qonto', {
        p_transaction: t.id, p_piece: pieceId,
      });
    }

    setEnCours(false);
    router.refresh();
  }

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      {/* ---------- L'opération ---------- */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card__title">Opération bancaire</p>

        <p style={{
          fontFamily: 'var(--display)', fontWeight: 600, fontSize: '1.7rem',
          color: t.sens === 'credit' ? 'var(--success)' : 'var(--navy)',
        }} className="amount">
          {t.sens === 'credit' ? '+ ' : '− '}{money(montant)}
        </p>

        <div style={{ marginTop: '.9rem', display: 'grid', gap: '.3rem', maxWidth: '54rem' }}>
          <Ligne cle="Libellé" valeur={t.libelle} />
          {t.contrepartie && <Ligne cle="Contrepartie" valeur={t.contrepartie} />}
          <Ligne cle="Date d’opération" valeur={dateLong(t.date_operation)} />
          {t.date_valeur && <Ligne cle="Date de valeur" valeur={dateLong(t.date_valeur)} />}
          {t.reference && <Ligne cle="Référence" valeur={t.reference} />}
          {t.categorie_qonto && <Ligne cle="Catégorie Qonto" valeur={t.categorie_qonto} />}
          <Ligne cle="Devise" valeur={t.devise} />
          {/* Sans cet identifiant, retrouver l'opération dans Qonto tient
              de la fouille. */}
          <Ligne cle="Identifiant Qonto" valeur={t.qonto_id} mono />
        </div>

        {!consolidee && (
          <p className="muted" style={{
            fontSize: 'var(--fs-sm)', marginTop: '.9rem', lineHeight: 1.55, maxWidth: '66ch',
          }}>
            Opération non consolidée : son montant et son libellé peuvent encore
            changer. Elle n&apos;est ni rapprochée ni affectable tant que la
            banque ne l&apos;a pas arrêtée.
          </p>
        )}
      </div>

      {/* ---------- Justificatif Qonto ---------- */}
      {t.chemin_justificatif && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <p className="card__title">Justificatif déposé dans Qonto</p>
          <p style={{ fontSize: 'var(--fs-sm)', marginBottom: '.7rem' }}>
            {t.nom_justificatif ?? 'Document'}
            {urlJustificatif && (
              <a href={urlJustificatif} target="_blank" rel="noopener"
                className="btn btn--ghost"
                style={{ marginLeft: '.7rem', minHeight: 28, padding: '.15rem .6rem', fontSize: '.7rem' }}>
                Ouvrir
              </a>
            )}
          </p>
          {urlJustificatif && (
            <iframe src={urlJustificatif} title="Justificatif"
              style={{ width: '100%', height: 460, border: '1px solid var(--g-200)' }} />
          )}
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.7rem', lineHeight: 1.5 }}>
            Ce fichier a été récupéré lors de la synchronisation. Il sera
            rattaché automatiquement à l&apos;écriture que vous créerez.
          </p>
        </div>
      )}

      {/* ---------- Déjà rattachée ---------- */}
      {ecriture && (
        <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--success)' }}>
          <p className="card__title">Écriture rattachée</p>
          <p style={{ fontSize: 'var(--fs-sm)' }}>
            <Link href={`/depenses/${ecriture.id}`} style={{ color: 'var(--navy)', fontWeight: 600 }}>
              {ecriture.numero_piece ?? 'Sans numéro'}
            </Link>
            {' — '}{ecriture.tiers_libelle}{' · '}{money(Number(ecriture.montant_ttc))}
          </p>
        </div>
      )}

      {/* ---------- Candidats ---------- */}
      {!traitee && candidats.length > 0 && peutGerer && (
        <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--info)' }}>
          <p className="card__title">Écritures qui pourraient correspondre</p>
          {candidats.map((c) => (
            <div key={c.piece_id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: '1rem', padding: '.7rem 0', borderBottom: '1px solid var(--g-200)',
            }}>
              <div>
                <p className="mono" style={{ fontSize: '.74rem', color: 'var(--navy)', fontWeight: 600 }}>
                  {c.numero_piece}
                </p>
                <p style={{ fontSize: 'var(--fs-sm)' }}>
                  {c.tiers} · {money(Number(c.reste_du))} dû
                </p>
                {Array.isArray(c.motifs) && (
                  <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.2rem' }}>
                    {c.motifs.join(' · ')}
                  </p>
                )}
              </div>
              <button onClick={() => rapprocher(c.piece_id)}
                disabled={enCours} className="btn btn--gold"
                style={{ minHeight: 30, fontSize: '.72rem' }}>
                Rapprocher
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Rattacher à une écriture existante ---------- */}
      {!traitee && consolidee && peutGerer && ouvertes.length > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <p className="card__title">Rattacher à une écriture existante</p>
          <p className="muted" style={{
            fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '68ch', marginBottom: '.9rem',
          }}>
            Si la dépense a déjà été saisie, rattachez-la plutôt que d&apos;en
            créer une seconde. Le moteur ne propose que ce dont il est sûr ; à
            vous de décider quand il se tait.
          </p>

          <div style={{ display: 'flex', gap: '.7rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ flex: '1 1 24rem' }}>
              <span>Écriture</span>
              <select value={choixEcriture} onChange={(e) => setChoixEcriture(e.target.value)}>
                <option value="">Choisir une écriture…</option>
                {ouvertes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.numero_piece ?? 'en attente'} · {dateLong(o.date_piece)} ·{' '}
                    {o.tiers_libelle} ·{' '}
                    {(Number(o.net_a_payer) - Number(o.montant_regle))
                      .toFixed(2).replace('.', ',')} € dus
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => choixEcriture && rapprocher(choixEcriture)}
              disabled={!choixEcriture || enCours} className="btn btn--gold">
              Rattacher
            </button>
          </div>
        </div>
      )}

      {/* ---------- Créer une dépense ---------- */}
      {!traitee && consolidee && t.sens === 'debit' && peutGerer && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <p className="card__title">Créer une dépense</p>
          <p className="muted" style={{
            fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '68ch', marginBottom: '.9rem',
          }}>
            Le montant de {money(montant)} vient de la banque et ne peut pas être
            faux. L&apos;affectation comptable, elle, reste une interprétation :
            l&apos;écriture naîtra en attente de validation.
            {alias === 'alias' && ' Ce fournisseur a déjà été reconnu, la catégorie est pré-remplie.'}
          </p>

          <div style={styleGrille}>
            <label><span>Fournisseur *</span>
              <input type="text" value={fournisseur}
                onChange={(e) => setFournisseur(e.target.value)} /></label>

            <label><span>Catégorie *</span>
              <select value={categorieId} onChange={(e) => setCategorieId(e.target.value)}>
                <option value="">Choisir…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.libelle} — {c.compte}</option>
                ))}
              </select></label>

            <label style={{ gridColumn: '1 / -1' }}><span>Description</span>
              <input type="text" value={objet} onChange={(e) => setObjet(e.target.value)} /></label>

            <label><span>Taux de TVA</span>
              <select value={tauxTva} onChange={(e) => setTauxTva(Number(e.target.value))}>
                <option value={20}>20 %</option>
                <option value={10}>10 %</option>
                <option value={5.5}>5,5 %</option>
                <option value={0}>0 %</option>
              </select></label>

            <label><span>Régime de TVA</span>
              <select value={regime}
                onChange={(e) => setRegime(e.target.value as typeof regime)}>
                <option value="auto">Déterminé d&apos;après la facture</option>
                <option value="france">TVA française</option>
                <option value="autoliquidation">Autoliquidation</option>
                <option value="exonere">Exonéré</option>
              </select></label>

            <label style={{ gridColumn: '1 / -1' }}>
              <span>N° de TVA du fournisseur (facultatif)</span>
              <input type="text" value={tvaIntracom}
                onChange={(e) => setTvaIntracom(e.target.value)}
                placeholder="IE6388047V, FR77108105875…" /></label>
          </div>

          <p className="muted" style={{
            fontSize: 'var(--fs-xs)', marginTop: '.8rem', lineHeight: 1.5, maxWidth: '68ch',
          }}>
            Laissez le régime sur « déterminé d&apos;après la facture » dans la
            plupart des cas : un numéro de TVA étranger sans taxe facturée suffit
            à conclure à l&apos;autoliquidation. Ne l&apos;imposez que si vous
            savez la facture muette sur ce point.
          </p>

          <div style={{ marginTop: '1rem' }}>
            <button onClick={creerDepense} disabled={enCours || !categorieId}
              className="btn btn--gold">
              Créer l&apos;écriture
            </button>
          </div>
        </div>
      )}

      {/* ---------- Avoir fournisseur ---------- */}
      {!traitee && consolidee && t.sens === 'credit' && peutGerer && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <p className="card__title">Un fournisseur vous rembourse</p>
          <p className="muted" style={{
            fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '70ch', marginBottom: '.9rem',
          }}>
            Une remise, un trop-perçu, un service annulé. Ce n&apos;est pas une
            recette : c&apos;est une dépense qui rétrécit. L&apos;écriture
            diminue la charge d&apos;origine et reverse la TVA que vous aviez
            déduite dessus.
          </p>
          <p className="muted" style={{
            fontSize: 'var(--fs-xs)', lineHeight: 1.5, maxWidth: '70ch', marginBottom: '.9rem',
          }}>
            L&apos;enregistrer en recette gonflerait le chiffre d&apos;affaires
            d&apos;un argent jamais gagné, et transformerait une TVA à rendre en
            TVA à payer.
          </p>

          <div style={styleGrille}>
            <label><span>Fournisseur *</span>
              <input type="text" value={avoirTiers}
                onChange={(e) => setAvoirTiers(e.target.value)} /></label>

            <label><span>Catégorie de la charge d&apos;origine *</span>
              <select value={avoirCategorie} onChange={(e) => setAvoirCategorie(e.target.value)}>
                <option value="">Choisir…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.libelle} — {c.compte}</option>
                ))}
              </select></label>

            <label><span>Taux de TVA d&apos;origine</span>
              <select value={avoirTaux} onChange={(e) => setAvoirTaux(Number(e.target.value))}>
                <option value={20}>20 %</option>
                <option value={10}>10 %</option>
                <option value={5.5}>5,5 %</option>
                <option value={0}>0 % — exonéré</option>
              </select></label>

            <label><span>N° de l&apos;avoir</span>
              <input type="text" value={avoirNumero}
                onChange={(e) => setAvoirNumero(e.target.value)}
                placeholder="07-26-invoice-35074308" /></label>

            <label style={{ gridColumn: '1 / -1' }}><span>Motif</span>
              <input type="text" value={avoirObjet}
                onChange={(e) => setAvoirObjet(e.target.value)}
                placeholder="Remise sur abonnement — juillet 2026" /></label>
          </div>

          <p className="muted" style={{
            fontSize: 'var(--fs-xs)', marginTop: '.8rem', lineHeight: 1.5, maxWidth: '70ch',
          }}>
            Le taux doit être celui de la facture d&apos;origine, pas un choix :
            c&apos;est la TVA effectivement déduite qu&apos;il faut rendre. Sur
            {' '}{money(montant)}, un taux de {String(avoirTaux).replace('.', ',')} %
            reverse {money(montant * avoirTaux / (100 + avoirTaux))}.
          </p>

          <div style={{ marginTop: '1rem' }}>
            <button onClick={creerAvoir} disabled={enCours || !avoirCategorie}
              className="btn btn--gold">
              Enregistrer l&apos;avoir
            </button>
          </div>
        </div>
      )}

      {/* ---------- Opération diverse ---------- */}
      {!traitee && consolidee && peutGerer && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <p className="card__title">
            {t.sens === 'credit' ? 'Ou : encaissement qui n\u2019est ni une vente ni un avoir'
                                 : 'Ou : décaissement qui n\u2019est pas une charge'}
          </p>
          <p className="muted" style={{
            fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '68ch', marginBottom: '.9rem',
          }}>
            Un apport en capital, un remboursement, un mouvement de compte
            courant. Ces opérations ne portent pas de TVA et ne passent par
            aucune catégorie de charge — mais elles doivent être comptabilisées,
            sans quoi le bilan est faux du montant en question.
          </p>

          <div style={styleGrille}>
            <label><span>Compte *</span>
              <select value={compte} onChange={(e) => setCompte(e.target.value)}>
                <option value="">Choisir…</option>
                {comptesPossibles.map((c) => (
                  <option key={`${c.compte}-${c.libelle}`} value={c.compte}>
                    {c.compte} — {c.libelle}
                  </option>
                ))}
              </select></label>

            <label><span>Libellé</span>
              <input type="text" value={libelleDivers}
                onChange={(e) => setLibelleDivers(e.target.value)}
                placeholder="Libération du capital social" /></label>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <button onClick={creerDivers} disabled={enCours || !compte}
              className="btn btn--ghost">
              Comptabiliser
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: '1.25rem' }}>
        <Link href="/banque" className="btn btn--ghost">Retour à la banque</Link>
      </div>
    </>
  );
}

function Ligne({ cle, valeur, mono }: { cle: string; valeur: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: '1rem', fontSize: 'var(--fs-sm)' }}>
      <span style={{ width: 170, color: 'var(--g-500)', flexShrink: 0 }}>{cle}</span>
      <span className={mono ? 'mono' : undefined}
        style={mono ? { fontSize: '.74rem', wordBreak: 'break-all' } : undefined}>
        {valeur}
      </span>
    </div>
  );
}

const styleGrille: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))',
  gap: '.9rem',
};
