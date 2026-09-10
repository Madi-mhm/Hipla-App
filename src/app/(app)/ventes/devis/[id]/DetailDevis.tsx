'use client';

/**
 * LE DÉTAIL D'UN DEVIS
 *
 * Les lignes passent par `ajouter_ligne`, la même fonction que les
 * factures : un devis est une facture qui n'engage pas encore, et le
 * calcul d'une ligne n'a aucune raison d'en différer. Le déclencheur
 * `recalculer_piece` refait les totaux à chaque ajout.
 *
 * Accepter produit une facture EN BROUILLON, pas une facture émise.
 * C'est le métier qui le veut : on chiffre, on exécute, puis on facture.
 * Émettre au moment de l'accord daterait la facture du jour de la
 * signature et rendrait la TVA exigible sur une prestation pas encore
 * faite.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money, date, dateLong, montantSaisi } from '@/lib/format';
import Alerte from '@/components/Alerte';
import Dialogue from '@/components/Dialogue';
import Reference from '@/components/Reference';

export type Devis = {
  id: string; numero_piece: string | null; date_piece: string;
  valable_jusquau: string | null; tiers_libelle: string; objet: string | null;
  montant_ht: number; montant_ttc: number;
  facture_issue_id: string | null; facture_numero: string | null;
  statut: string; jours_restants: number | null; nb_lignes: number;
};

export type Ligne = {
  id: string; ordre: number; libelle: string; description: string | null;
  quantite: number; unite: string | null; prix_unitaire_ht: number;
  taux_tva: number; montant_ht: number; montant_tva: number; montant_ttc: number;
};

export type PrestationDevis = {
  id: string; libelle: string; groupe: string | null;
  prix_ht: number; unite: string | null; taux_tva: number;
};

const LIBELLE: Record<string, string> = {
  brouillon: 'Brouillon', envoye: 'Envoyé', accepte: 'Accepté',
  refuse: 'Refusé', expire: 'Expiré',
};
const CLASSE: Record<string, string> = {
  brouillon: 'badge--neutral', envoye: 'badge--info', accepte: 'badge--success',
  refuse: 'badge--neutral', expire: 'badge--warning',
};

export default function DetailDevis({
  devis: d, lignes, prestations, peutGerer,
}: {
  devis: Devis; lignes: Ligne[]; prestations: PrestationDevis[]; peutGerer: boolean;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [dialogueRefus, setDialogueRefus] = useState(false);

  const [prestationId, setPrestationId] = useState('');
  const [libelle, setLibelle] = useState('');
  const [quantite, setQuantite] = useState('1');
  const [prix, setPrix] = useState('');
  const [taux, setTaux] = useState('20');

  const modifiable = d.statut === 'brouillon' || d.statut === 'envoye';
  const accepte = d.statut === 'accepte';

  function choisirPrestation(id: string) {
    setPrestationId(id);
    const p = prestations.find((x) => x.id === id);
    if (!p) return;
    setLibelle(p.libelle);
    // Un forfait est à 0 dans le catalogue : c'est justement ce qui doit
    // être chiffré ici. On ne préremplit pas un prix qui n'existe pas.
    setPrix(Number(p.prix_ht) > 0 ? String(p.prix_ht).replace('.', ',') : '');
    setTaux(String(p.taux_tva));
  }

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    const q = montantSaisi(quantite);
    const pu = montantSaisi(prix);
    const tx = montantSaisi(taux);
    if (!libelle.trim() || q === null || pu === null || tx === null) {
      setErreur('Désignation, quantité, prix unitaire et taux sont requis.');
      return;
    }

    setEnCours(true); setErreur(null);
    const supabase = createClient();
    const { error } = await supabase.rpc('ajouter_ligne', {
      p_piece: d.id, p_libelle: libelle.trim(),
      p_quantite: q, p_prix_ht: pu, p_taux_tva: tx,
      p_prestation: prestationId || null,
      p_unite: prestations.find((x) => x.id === prestationId)?.unite ?? null,
    });
    if (error) { setErreur(`Ajout impossible — ${error.message}`); setEnCours(false); return; }

    setPrestationId(''); setLibelle(''); setQuantite('1'); setPrix('');
    setEnCours(false);
    router.refresh();
  }

  async function supprimerLigne(id: string) {
    setEnCours(true); setErreur(null);
    const supabase = createClient();
    const { error } = await supabase.from('pieces_lignes').delete().eq('id', id);
    if (error) { setErreur(error.message); setEnCours(false); return; }
    setEnCours(false);
    router.refresh();
  }

  async function changerStatut(statut: string, motif?: string) {
    setEnCours(true); setErreur(null);
    const supabase = createClient();
    const { error } = await supabase.rpc('changer_statut_devis', {
      p_id: d.id, p_statut: statut, p_motif: motif ?? null,
    });
    if (error) { setErreur(error.message); setEnCours(false); return; }
    setEnCours(false);
    router.refresh();
  }

  async function accepter() {
    setEnCours(true); setErreur(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('accepter_devis', { p_id: d.id });
    if (error) { setErreur(`Acceptation impossible — ${error.message}`); setEnCours(false); return; }
    const r = data as { facture_id?: string } | null;
    setEnCours(false);
    if (r?.facture_id) router.push(`/ventes/${r.facture_id}`);
  }

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      {/* ---------- L'état ---------- */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap',
        }}>
          <div>
            <span className={`badge ${CLASSE[d.statut] ?? 'badge--neutral'}`}>
              {LIBELLE[d.statut] ?? d.statut}
            </span>
            <p style={{ fontSize: 'var(--fs-sm)', marginTop: '.5rem', lineHeight: 1.55 }}>
              {d.objet ?? 'Sans objet précisé'}
            </p>
            {d.valable_jusquau && (
              <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.2rem' }}>
                Valable jusqu&apos;au {dateLong(d.valable_jusquau)}
                {d.statut === 'expire' && ' — le prix n\u2019engage plus'}
              </p>
            )}
          </div>

          <div style={{ textAlign: 'right' }}>
            <p className="amount" style={{ fontSize: '1.5rem', fontWeight: 600 }}>
              {money(Number(d.montant_ttc))}
            </p>
            <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
              {money(Number(d.montant_ht))} HT
            </p>
          </div>
        </div>

        {accepte && d.facture_issue_id && (
          <p style={{ fontSize: 'var(--fs-sm)', marginTop: '.9rem', lineHeight: 1.55 }}>
            Accepté — a produit la facture{' '}
            <Reference id={d.facture_issue_id} className="mono"
              style={{ color: 'var(--navy)', fontWeight: 600 }}>
              {d.facture_numero ?? 'en brouillon'}
            </Reference>
            . Elle attend d&apos;être émise : faites-le lorsque la prestation
            est faite, pas avant.
          </p>
        )}
      </div>

      {/* ---------- Les lignes ---------- */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card__title">Détail chiffré — {lignes.length}</p>

        {lignes.length === 0 ? (
          <div className="etat-vide">
            <p>Aucune ligne.</p>
            <p className="muted">
              Un devis sans ligne ne peut pas devenir une facture.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table style={{ minWidth: 680, fontSize: 'var(--fs-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                  <th style={th}>Désignation</th>
                  <th style={{ ...th, textAlign: 'right' }}>Qté</th>
                  <th style={{ ...th, textAlign: 'right' }}>P.U. HT</th>
                  <th style={{ ...th, textAlign: 'right' }} className="col-secondaire">TVA</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total HT</th>
                  {peutGerer && modifiable && <th style={th}></th>}
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
                      {l.quantite}{l.unite ? ` ${l.unite}` : ''}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }} className="amount">
                      {money(Number(l.prix_unitaire_ht))}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }} className="amount col-secondaire">
                      {l.taux_tva} %
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }} className="amount">
                      {money(Number(l.montant_ht))}
                    </td>
                    {peutGerer && modifiable && (
                      <td style={{ ...td, textAlign: 'right' }}>
                        <button onClick={() => supprimerLigne(l.id)} disabled={enCours}
                          className="btn btn--ghost btn--sm btn--danger">
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

        {peutGerer && modifiable && (
          <form onSubmit={ajouter} style={{ marginTop: '1.1rem', borderTop: '1px solid var(--g-200)', paddingTop: '1rem' }}>
            <div style={{
              display: 'grid', gap: '.7rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 10rem), 1fr))',
            }}>
              <label style={{ gridColumn: '1 / -1' }}><span>Prestation du catalogue</span>
                <select value={prestationId} onChange={(e) => choisirPrestation(e.target.value)}>
                  <option value="">Ligne libre…</option>
                  {prestations.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.libelle}{Number(p.prix_ht) > 0 ? ` — ${p.prix_ht} €` : ' — au forfait'}
                    </option>
                  ))}
                </select></label>

              <label style={{ gridColumn: '1 / -1' }}><span>Désignation *</span>
                <input type="text" value={libelle} onChange={(e) => setLibelle(e.target.value)}
                  placeholder="Nettoyage fin de chantier — 120 m²" /></label>

              <label><span>Quantité *</span>
                <input type="text" inputMode="decimal" value={quantite}
                  onChange={(e) => setQuantite(e.target.value)} /></label>

              <label><span>Prix unitaire HT *</span>
                <input type="text" inputMode="decimal" value={prix} placeholder="0,00"
                  onChange={(e) => setPrix(e.target.value)} /></label>

              <label><span>TVA (%)</span>
                <input type="text" inputMode="decimal" value={taux}
                  onChange={(e) => setTaux(e.target.value)} /></label>
            </div>

            <div style={{ marginTop: '.9rem' }}>
              <button type="submit" className="btn btn--ghost" disabled={enCours}>
                {enCours ? 'Ajout…' : 'Ajouter la ligne'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ---------- Les décisions ---------- */}
      {peutGerer && (
        <div className="card">
          <p className="card__title">Suite à donner</p>

          {accepte ? (
            <p className="muted" style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55 }}>
              Ce devis est accepté. Pour revenir en arrière, annulez la facture
              qu&apos;il a produite — le devis suivra.
            </p>
          ) : (
            <>
              <p className="muted" style={{
                fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '68ch', marginBottom: '.9rem',
              }}>
                Accepter crée une facture <strong>en brouillon</strong>, reprenant
                les lignes ci-dessus. Émettez-la lorsque la prestation est faite :
                la TVA deviendra exigible à l&apos;encaissement, pas à la
                signature.
              </p>

              <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
                {d.statut === 'brouillon' && (
                  <button onClick={() => changerStatut('envoye')} disabled={enCours}
                    className="btn btn--ghost">
                    Marquer comme envoyé
                  </button>
                )}
                <button onClick={accepter} disabled={enCours || lignes.length === 0}
                  className="btn btn--gold">
                  {enCours ? 'Acceptation…' : 'Accepté — établir la facture'}
                </button>
                <button onClick={() => setDialogueRefus(true)} disabled={enCours}
                  className="btn btn--ghost btn--danger">
                  Refusé
                </button>
              </div>

              {lignes.length === 0 && (
                <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.7rem' }}>
                  Ajoutez au moins une ligne avant d&apos;accepter.
                </p>
              )}
            </>
          )}

          <div style={{ marginTop: '1rem', display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            <Link href="/ventes/devis" className="btn btn--ghost btn--sm">Retour aux devis</Link>
            {lignes.length > 0 && (
              <a href={`/api/devis/${d.id}/pdf`} className="btn btn--ghost btn--sm">
                Télécharger le PDF
              </a>
            )}
          </div>
        </div>
      )}

      <Dialogue
        ouvert={dialogueRefus}
        titre="Devis refusé"
        description="Le motif reste en note : il sert à comprendre, plus tard, pourquoi une affaire n'a pas été prise."
        champ="Motif"
        placeholder="Prix jugé trop élevé, délai trop long…"
        libelleValider="Marquer refusé"
        onValider={(m) => { setDialogueRefus(false); changerStatut('refuse', m); }}
        onAnnuler={() => setDialogueRefus(false)}
      />
    </>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)',
  fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.55rem .4rem', verticalAlign: 'top' };
