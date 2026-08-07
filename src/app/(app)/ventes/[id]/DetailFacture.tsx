'use client';

/**
 * DÉTAIL D'UNE VENTE
 *
 * Quatre moments : composer les lignes, dater la prestation, émettre,
 * encaisser.
 *
 * L'écran n'écrit plus rien directement : chaque geste passe par une
 * fonction du registre. Le calcul des lignes, la numérotation, le gel
 * des mentions et la libération des opérations bancaires vivent
 * désormais en base, en un seul exemplaire.
 *
 * L'encaissement crée un RÈGLEMENT, pas un statut. Une facture peut
 * être réglée en plusieurs fois, et la TVA devient exigible à chaque
 * versement sur la part encaissée.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money, date, dateLong } from '@/lib/format';
import Dialogue from '@/components/Dialogue';
import Alerte from '@/components/Alerte';
import {
  statutVente, natureVente,
  type Piece, type LignePiece, type Tiers, type Reglement,
} from '@/lib/registre';
import {
  LIBELLE_STATUT_FACTURE, CLASSE_STATUT_FACTURE, LIBELLE_NATURE_FACTURE,
  LIBELLE_UNITE, type Prestation,
} from '@/lib/types';
import styles from './facture.module.css';

type Props = {
  piece: Piece & { tiers: Tiers | null };
  lignes: LignePiece[];
  reglements: Reglement[];
  prestations: Prestation[];
  entreprise: Record<string, unknown> | null;
  creditsLibres: TransactionQontoLike[];
  peutGerer: boolean;
  peutEncaisser: boolean;
};

type TransactionQontoLike = {
  id: string;
  numero_piece: string | null;
  date_operation: string;
  montant: number;
  libelle: string;
  contrepartie: string | null;
};

/** Lecture prudente d'un champ d'entreprise : le jsonb n'est pas typé. */
function champ(source: Record<string, unknown> | null, cle: string): string | null {
  const v = source?.[cle];
  if (typeof v === 'string' && v.trim() !== '') return v;
  if (typeof v === 'number') return String(v);
  return null;
}

export default function DetailFacture({
  piece, lignes, reglements, prestations, entreprise, creditsLibres,
  peutGerer, peutEncaisser,
}: Props) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [dialogueEncaissement, setDialogueEncaissement] = useState(false);
  const [dialogueAnnulation, setDialogueAnnulation] = useState(false);

  // Ajout d'une ligne
  const [prestationId, setPrestationId] = useState('');
  const [libelle, setLibelle] = useState('');
  const [quantite, setQuantite] = useState('1');
  const [prixUnitaire, setPrixUnitaire] = useState('');
  const [tauxLigne, setTauxLigne] = useState(20);

  // Période de prestation
  const [modePrestation, setModePrestation] =
    useState<'date' | 'periode'>(piece.periode_debut ? 'periode' : 'date');
  const [datePrestation, setDatePrestation] = useState(piece.date_prestation ?? '');
  const [periodeDebut, setPeriodeDebut] = useState(piece.periode_debut ?? '');
  const [periodeFin, setPeriodeFin] = useState(piece.periode_fin ?? '');

  // Règlement
  const [dateReglement, setDateReglement] = useState(new Date().toISOString().slice(0, 10));
  const [montantRegle, setMontantRegle] = useState('');
  const [moyenReglement, setMoyenReglement] = useState('virement');
  const [transactionChoisie, setTransactionChoisie] = useState('');

  const statut = statutVente(piece);
  const nature = natureVente(piece);
  const modifiable = piece.etat === 'brouillon';
  const estParticulier = piece.tiers?.type === 'particulier';
  const estPro = !estParticulier;
  const resteAPayer = Number(piece.net_a_payer) - Number(piece.montant_regle);

  const prestationDatee = Boolean(piece.date_prestation || piece.periode_debut);
  const mediateurRenseigne = Boolean(champ(entreprise, 'mediateur_nom'));
  const clientAdresse = Boolean(
    piece.tiers?.adresse && piece.tiers?.code_postal && piece.tiers?.ville
  );

  // Ce qui empêche l'émission, dit avant le clic plutôt que renvoyé en
  // erreur après. La fonction en base bloque de son côté ; ceci n'est
  // qu'une courtoisie.
  const obstacles = useMemo(() => {
    const o: string[] = [];
    if (lignes.length === 0) o.push('Aucune ligne facturée.');
    if (!prestationDatee) o.push('Date de réalisation de la prestation non renseignée.');
    if (!clientAdresse) o.push('Adresse du client incomplète — mention obligatoire.');
    if (estParticulier && !mediateurRenseigne) {
      o.push(
        'Client particulier : les coordonnées du médiateur de la consommation '
        + 'sont obligatoires. Réglages → Entreprise.'
      );
    }
    return o;
  }, [lignes.length, prestationDatee, clientAdresse, estParticulier, mediateurRenseigne]);

  const totaux = useMemo(() => ({
    ht: lignes.reduce((s, l) => s + Number(l.montant_ht), 0),
    tva: lignes.reduce((s, l) => s + Number(l.montant_tva), 0),
    ttc: lignes.reduce((s, l) => s + Number(l.montant_ttc), 0),
  }), [lignes]);

  function choisirPrestation(id: string) {
    setPrestationId(id);
    const p = prestations.find((x) => x.id === id);
    if (p) {
      setLibelle(p.libelle);
      setPrixUnitaire(Number(p.prix_ht) > 0 ? String(p.prix_ht).replace('.', ',') : '');
      setTauxLigne(Number(p.taux_tva));
    }
  }

  async function ajouterLigne(e: React.FormEvent) {
    e.preventDefault();
    const q = parseFloat(quantite.replace(',', '.'));
    const pu = parseFloat(prixUnitaire.replace(',', '.'));
    if (!libelle.trim() || !Number.isFinite(q) || !Number.isFinite(pu)) {
      setErreur('Libellé, quantité et prix unitaire sont requis.');
      return;
    }

    setEnCours(true);
    setErreur(null);
    const p = prestations.find((x) => x.id === prestationId);
    const supabase = createClient();

    // Le calcul du montant se fait en base : c'était un second endroit
    // où vivait la règle d'arrondi.
    const { error } = await supabase.rpc('ajouter_ligne', {
      p_piece: piece.id,
      p_libelle: libelle.trim(),
      p_quantite: q,
      p_prix_ht: pu,
      p_taux_tva: tauxLigne,
      p_unite: p?.unite ?? null,
      p_prestation: prestationId || null,
    });

    if (error) { setErreur(`Ajout impossible : ${error.message}`); setEnCours(false); return; }

    setPrestationId(''); setLibelle(''); setQuantite('1'); setPrixUnitaire('');
    setEnCours(false);
    router.refresh();
  }

  async function retirerLigne(id: string) {
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();
    const { error } = await supabase.rpc('retirer_ligne', { p_ligne: id });
    if (error) { setErreur(error.message); setEnCours(false); return; }
    setEnCours(false);
    router.refresh();
  }

  async function enregistrerPrestation() {
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    const { error } = await supabase.rpc('definir_prestation', {
      p_piece: piece.id,
      p_date:  modePrestation === 'date' ? (datePrestation || null) : null,
      p_debut: modePrestation === 'periode' ? (periodeDebut || null) : null,
      p_fin:   modePrestation === 'periode' ? (periodeFin || null) : null,
    });

    if (error) {
      setErreur(`Enregistrement impossible — ${error.message}`);
      setEnCours(false);
      return;
    }

    setSucces('Date de prestation enregistrée.');
    setEnCours(false);
    router.refresh();
  }

  async function emettre() {
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    // Chemin unique : la fonction attribue le numéro, gèle les mentions
    // et journalise. Elle refuse un document incomplet.
    const { data, error } = await supabase.rpc('emettre_vente', { p_piece: piece.id });

    if (error) {
      setErreur(`Émission impossible — ${error.message}`);
      setEnCours(false);
      return;
    }

    const numero = (data as { numero_piece?: string } | null)?.numero_piece;
    setSucces(
      `Facture ${numero ?? ''} émise. Elle est désormais figée : son numéro `
      + 'et ses mentions ne changeront plus.'
    );
    setEnCours(false);
    router.refresh();
  }

  async function encaisser() {
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    const v = montantRegle.trim()
      ? parseFloat(montantRegle.replace(',', '.'))
      : null;

    const { data, error } = await supabase.rpc('encaisser_piece', {
      p_piece: piece.id,
      p_date: dateReglement,
      p_montant: v,
      p_moyen: moyenReglement,
      p_transaction: transactionChoisie || null,
    });

    if (error) {
      setErreur(`Encaissement impossible — ${error.message}`);
      setEnCours(false);
      return;
    }

    const r = data as { reste_du?: number; solde?: boolean } | null;
    setSucces(
      `Règlement enregistré au ${date(dateReglement)}. `
      + 'La TVA correspondante devient exigible sur cette période.'
      + (r && !r.solde ? ` Reste dû : ${money(Number(r.reste_du ?? 0))}.` : '')
    );
    setDialogueEncaissement(false);
    setEnCours(false);
    router.refresh();
  }

  async function annuler(motif: string) {
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    // La fonction libère aussi les opérations bancaires rattachées :
    // une charge ne doit pas sortir du contrôle de complétude sans être
    // comptabilisée quelque part.
    const { error } = await supabase.rpc('annuler_piece', {
      p_id: piece.id, p_motif: motif,
    });

    if (error) { setErreur(`Annulation impossible — ${error.message}`); setEnCours(false); return; }
    setEnCours(false);
    router.refresh();
  }

  const groupes = Array.from(new Set(prestations.map((p) => p.groupe)));

  const prestationAffichee = piece.periode_debut && piece.periode_fin
    ? `du ${dateLong(piece.periode_debut)} au ${dateLong(piece.periode_fin)}`
    : piece.date_prestation
      ? dateLong(piece.date_prestation)
      : null;

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      {/* ---------- Bandeau ---------- */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className={styles.bandeau}>
          <div>
            <span className={`badge ${CLASSE_STATUT_FACTURE[statut]}`}>
              {LIBELLE_STATUT_FACTURE[statut]}
            </span>
            {nature !== 'facture' && (
              <span className="badge badge--info" style={{ marginLeft: '.4rem' }}>
                {LIBELLE_NATURE_FACTURE[nature]}
              </span>
            )}
            <p style={{ fontSize: 'var(--fs-sm)', marginTop: '.6rem', lineHeight: 1.6 }}>
              {modifiable
                ? <>Brouillon créé le {dateLong(piece.date_piece)} — le numéro sera
                    attribué à l&apos;émission.</>
                : <>Émise le {dateLong(piece.date_piece)} ·
                    Échéance le {dateLong(piece.date_echeance)}</>}
              {piece.paye_le && (
                <> · <strong>Soldée le {dateLong(piece.paye_le)}</strong></>
              )}
            </p>
            {prestationAffichee && (
              <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: '.2rem' }}>
                Prestation réalisée {prestationAffichee}
              </p>
            )}
            {piece.objet && (
              <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: '.2rem' }}>
                {piece.objet}
              </p>
            )}
          </div>

          <div className={styles.actionsBandeau}>
            {peutGerer && modifiable && (
              <button onClick={emettre} disabled={enCours || obstacles.length > 0}
                className="btn btn--gold">
                Émettre la facture
              </button>
            )}
            {lignes.length > 0 && (
              <a href={`/api/factures/${piece.id}/pdf`}
                className="btn btn--ghost" target="_blank" rel="noopener">
                {modifiable ? 'Aperçu PDF' : 'Télécharger le PDF'}
              </a>
            )}
            {peutEncaisser && !modifiable && piece.etat === 'validee' && resteAPayer > 0.005 && (
              <button onClick={() => {
                setMontantRegle(String(resteAPayer.toFixed(2)).replace('.', ','));
                setDialogueEncaissement(true);
              }} className="btn btn--gold">
                Enregistrer un règlement
              </button>
            )}
            {peutGerer && piece.etat !== 'annulee' && (
              <button onClick={() => setDialogueAnnulation(true)} disabled={enCours}
                className="btn btn--ghost" style={{ color: 'var(--danger)' }}>
                Annuler
              </button>
            )}
          </div>
        </div>

        {peutGerer && modifiable && obstacles.length > 0 && (
          <div style={{
            marginTop: '.9rem', paddingTop: '.8rem',
            borderTop: '1px solid var(--g-200)',
          }}>
            <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: '.35rem' }}>
              Reste à compléter avant d&apos;émettre
            </p>
            <ul style={{
              fontSize: 'var(--fs-sm)', color: 'var(--g-500)',
              lineHeight: 1.6, paddingLeft: '1.1rem',
            }}>
              {obstacles.map((o) => <li key={o}>{o}</li>)}
            </ul>
          </div>
        )}

        {piece.motif_annulation && (
          <p className={styles.alerte}>Annulée — {piece.motif_annulation}</p>
        )}
      </div>

      {/* ---------- Date de réalisation ---------- */}
      {peutGerer && modifiable && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <p className="card__title">Date de réalisation</p>
          <p className="muted" style={{
            fontSize: 'var(--fs-sm)', lineHeight: 1.55,
            maxWidth: '66ch', marginBottom: '.9rem',
          }}>
            Mention obligatoire, distincte de la date d&apos;émission. Une date
            pour une intervention ponctuelle, une période pour un contrat
            récurrent.
          </p>

          <div style={{ display: 'flex', gap: '1.2rem', marginBottom: '.9rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: 'var(--fs-sm)' }}>
              <input type="radio" name="modePrestation" checked={modePrestation === 'date'}
                onChange={() => setModePrestation('date')} style={{ width: 'auto' }} />
              Intervention ponctuelle
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: 'var(--fs-sm)' }}>
              <input type="radio" name="modePrestation" checked={modePrestation === 'periode'}
                onChange={() => setModePrestation('periode')} style={{ width: 'auto' }} />
              Période
            </label>
          </div>

          <div className={styles.formulaireLigne}>
            {modePrestation === 'date' ? (
              <label><span>Date de la prestation *</span>
                <input type="date" value={datePrestation}
                  onChange={(e) => setDatePrestation(e.target.value)} /></label>
            ) : (
              <>
                <label><span>Du *</span>
                  <input type="date" value={periodeDebut}
                    onChange={(e) => setPeriodeDebut(e.target.value)} /></label>
                <label><span>Au *</span>
                  <input type="date" value={periodeFin}
                    onChange={(e) => setPeriodeFin(e.target.value)} /></label>
              </>
            )}
            <div className={styles.pleine}>
              <button onClick={enregistrerPrestation} disabled={enCours}
                className="btn btn--ghost">
                Enregistrer la date
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Règlements ---------- */}
      {reglements.length > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <p className="card__title">Règlements reçus</p>
          <p className="muted" style={{
            fontSize: 'var(--fs-xs)', lineHeight: 1.5,
            maxWidth: '66ch', marginBottom: '.7rem',
          }}>
            Chaque versement rend la TVA exigible sur sa part, à sa propre
            date. C&apos;est la règle des prestations de services.
          </p>
          <div className="table-scroll">
            <table style={{ minWidth: 460, fontSize: 'var(--fs-sm)' }}>
              <tbody>
                {reglements.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--g-200)' }}>
                    <td style={td}>{date(r.date_reglement)}</td>
                    <td style={{ ...td, color: 'var(--g-500)' }}>{r.moyen ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }} className="amount">
                      {money(Number(r.montant))}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...td, fontWeight: 600 }} colSpan={2}>Reste dû</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }} className="amount">
                    {money(resteAPayer)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------- Lignes ---------- */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card__title">Prestations facturées</p>

        {lignes.length === 0 ? (
          <div className="etat-vide">
            <p>Aucune ligne.</p>
            <p className="muted">
              Choisissez une prestation au catalogue ou saisissez une ligne
              libre. Les totaux se recalculent automatiquement.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table style={{ minWidth: 620, fontSize: 'var(--fs-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                  <th style={th}>Désignation</th>
                  <th style={{ ...th, textAlign: 'right' }}>Qté</th>
                  <th style={{ ...th, textAlign: 'right' }}>P.U. HT</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total HT</th>
                  <th style={{ ...th, textAlign: 'right' }} className="col-secondaire">TVA</th>
                  {peutGerer && modifiable && <th style={{ ...th, textAlign: 'right' }}></th>}
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--g-200)' }}>
                    <td style={{ ...td, fontWeight: 500 }}>
                      {l.libelle}
                      {l.description && (
                        <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                          {l.description}
                        </span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }} className="amount">
                      {Number(l.quantite)}
                      {l.unite && (
                        <span className="muted" style={{ fontSize: '.68rem' }}>
                          {' '}{LIBELLE_UNITE[l.unite] ?? l.unite}
                        </span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }} className="amount">
                      {money(Number(l.prix_unitaire_ht))}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }} className="amount">
                      {money(Number(l.montant_ht))}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }} className="amount col-secondaire">
                      {l.taux_tva} %
                    </td>
                    {peutGerer && modifiable && (
                      <td style={{ ...td, textAlign: 'right' }}>
                        <button onClick={() => retirerLigne(l.id)} disabled={enCours}
                          className="btn btn--ghost"
                          style={{ minHeight: 26, padding: '.1rem .55rem', fontSize: '.7rem', color: 'var(--danger)' }}>
                          Retirer
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totaux */}
        <div className={styles.totaux}>
          <div><span>Total HT</span><strong className="amount">{money(totaux.ht)}</strong></div>
          <div><span>TVA</span><strong className="amount">{money(totaux.tva)}</strong></div>
          <div><span>Total TTC</span><strong className="amount">{money(totaux.ttc)}</strong></div>
          {Number(piece.acomptes_deduits) > 0 && (
            <div><span>Acomptes déduits</span>
              <strong className="amount">− {money(Number(piece.acomptes_deduits))}</strong></div>
          )}
          <div className={styles.totalFinal}>
            <span>Net à payer</span>
            <strong className="amount">{money(Number(piece.net_a_payer))}</strong>
          </div>
        </div>

        {/* Ajout de ligne */}
        {peutGerer && modifiable && (
          <form onSubmit={ajouterLigne} className={styles.formulaireLigne}>
            <label className={styles.pleine}><span>Prestation</span>
              <select value={prestationId} onChange={(e) => choisirPrestation(e.target.value)}>
                <option value="">Ligne libre…</option>
                {groupes.map((g) => (
                  <optgroup key={g} label={g}>
                    {prestations.filter((p) => p.groupe === g).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.libelle}
                        {Number(p.prix_ht) > 0 && ` — ${Number(p.prix_ht).toFixed(2).replace('.', ',')} €`}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select></label>

            <label className={styles.pleine}><span>Désignation *</span>
              <input type="text" value={libelle} onChange={(e) => setLibelle(e.target.value)}
                required placeholder="Nettoyage de canapé — 3 places" /></label>

            <label><span>Quantité</span>
              <input type="text" inputMode="decimal" value={quantite}
                onChange={(e) => setQuantite(e.target.value)} /></label>
            <label><span>Prix unitaire HT *</span>
              <input type="text" inputMode="decimal" value={prixUnitaire}
                onChange={(e) => setPrixUnitaire(e.target.value)} required placeholder="120,00" /></label>
            <label><span>TVA</span>
              <select value={tauxLigne} onChange={(e) => setTauxLigne(Number(e.target.value))}>
                <option value={20}>20 %</option>
                <option value={10}>10 %</option>
                <option value={5.5}>5,5 %</option>
                <option value={0}>0 %</option>
              </select></label>

            <div className={styles.pleine}>
              <button type="submit" className="btn btn--ghost" disabled={enCours}>
                Ajouter la ligne
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ---------- Mentions légales ---------- */}
      <div className="card">
        <p className="card__title">
          {modifiable ? 'Mentions qui seront portées sur la facture' : 'Mentions figées à l\u2019émission'}
        </p>
        <div className={styles.mentions}>
          <p>
            <strong>{champ(entreprise, 'raison_sociale') ?? '—'}</strong>
            {' — '}{champ(entreprise, 'forme_juridique') ?? ''} au capital de{' '}
            {money(Number(champ(entreprise, 'capital') ?? 0))}
          </p>
          <p>
            {champ(entreprise, 'adresse') ?? '—'},{' '}
            {champ(entreprise, 'code_postal') ?? ''} {champ(entreprise, 'ville') ?? ''}
          </p>
          <p>
            SIRET {champ(entreprise, 'siret') ?? '—'}
            {champ(entreprise, 'rcs') && ` · ${champ(entreprise, 'rcs')}`}
          </p>
          <p>TVA intracommunautaire {champ(entreprise, 'tva_intracom') ?? '—'}</p>

          <p style={{ marginTop: '.7rem' }}>
            Règlement à {piece.delai_paiement} jours, soit le {dateLong(piece.date_echeance)}.
          </p>
          <p>
            Virement sur {champ(entreprise, 'iban') ?? '⚠ IBAN non renseigné'}
            {champ(entreprise, 'bic') && ` · BIC ${champ(entreprise, 'bic')}`}
          </p>
          <p>
            En cas de retard, pénalités au taux de trois fois le taux d&apos;intérêt légal
            {estPro && ", et indemnité forfaitaire de recouvrement de 40 €"}.
          </p>
          {estParticulier && (
            <p>
              Médiateur de la consommation :{' '}
              {champ(entreprise, 'mediateur_nom')
                ?? '⚠ non renseigné — obligatoire envers un particulier'}
            </p>
          )}
          {piece.tiers?.siret && (
            <p>Client : SIRET {piece.tiers.siret}
              {piece.tiers.tva_intracom && ` · TVA ${piece.tiers.tva_intracom}`}</p>
          )}
        </div>
        <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.8rem', lineHeight: 1.5 }}>
          {modifiable
            ? "Ces mentions seront figées au moment de l'émission : une facture réimprimée plus tard restera identique à l'originale."
            : "Ces mentions ont été figées lors de l'émission et ne changeront plus, même si les paramètres de l'entreprise évoluent."}
          {' '}Le format Factur-X sera ajouté avant le 1er septembre 2027.
        </p>
      </div>

      <div style={{ marginTop: '1.25rem' }}>
        <Link href="/ventes" className="btn btn--ghost">Retour aux ventes</Link>
      </div>

      {/* ---------- Dialogues ---------- */}
      {dialogueEncaissement && (
        <div className={styles.voile} onClick={() => setDialogueEncaissement(false)}>
          <div className={styles.boite} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.titreDialogue}>Enregistrer un règlement</h2>
            <p className={styles.descriptionDialogue}>
              La TVA de la part réglée deviendra exigible sur la période de la
              date saisie. Pour une prestation de services, c&apos;est
              l&apos;encaissement qui compte, pas l&apos;émission.
            </p>

            <div className={styles.champsDialogue}>
              <label><span>Date du règlement *</span>
                <input type="date" value={dateReglement}
                  onChange={(e) => setDateReglement(e.target.value)} /></label>
              <label><span>Montant reçu</span>
                <input type="text" inputMode="decimal" value={montantRegle}
                  onChange={(e) => setMontantRegle(e.target.value)} /></label>
              <label><span>Moyen</span>
                <select value={moyenReglement} onChange={(e) => setMoyenReglement(e.target.value)}>
                  <option value="virement">Virement</option>
                  <option value="carte">Carte</option>
                  <option value="cheque">Chèque</option>
                  <option value="especes">Espèces</option>
                </select></label>

              {moyenReglement === 'virement' && creditsLibres.length > 0 && (
                <label className={styles.pleineDialogue}><span>Opération bancaire</span>
                  <select value={transactionChoisie}
                    onChange={(e) => setTransactionChoisie(e.target.value)}>
                    <option value="">Aucune — rapprocher plus tard</option>
                    {creditsLibres.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.numero_piece} · {date(t.date_operation)} ·{' '}
                        {Number(t.montant).toFixed(2).replace('.', ',')} € ·{' '}
                        {(t.contrepartie ?? t.libelle).slice(0, 28)}
                      </option>
                    ))}
                  </select></label>
              )}
            </div>

            <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.8rem', lineHeight: 1.5 }}>
              Reste à payer : {money(resteAPayer)}. Un montant inférieur
              enregistre un règlement partiel et laisse la facture ouverte.
            </p>

            <div className={styles.actionsDialogue}>
              <button onClick={() => setDialogueEncaissement(false)} className="btn btn--ghost">
                Annuler
              </button>
              <button onClick={encaisser} disabled={enCours} className="btn btn--gold">
                Confirmer le règlement
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialogue
        ouvert={dialogueAnnulation}
        titre="Annuler cette facture"
        description={
          "La facture conserve son numéro et reste consultable, mais sort des " +
          "totaux, et les opérations bancaires rattachées sont libérées. La " +
          "numérotation doit rester continue : une facture n'est jamais " +
          "effacée. Si elle a déjà été envoyée au client, émettez plutôt un avoir."
        }
        champ="Motif" obligatoire libelleValider="Annuler la facture" danger
        onValider={(m) => { setDialogueAnnulation(false); annuler(m); }}
        onAnnuler={() => setDialogueAnnulation(false)}
      />
    </>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)',
  fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.6rem .4rem', verticalAlign: 'top' };
