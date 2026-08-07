'use client';

/**
 * JUSTIFICATIFS DÉPOSÉS DANS QONTO
 *
 * Sabir paie et joint le reçu dans l'application bancaire ; la
 * synchronisation récupère le fichier. Reste à en faire une écriture.
 *
 * L'ordre compte : on cherche d'abord une dépense existante. Une facture
 * photographiée dans l'application puis déposée dans Qonto désigne un
 * seul achat, et doit produire une seule écriture. Ce n'est qu'en
 * l'absence de correspondance qu'une écriture est créée.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money, date } from '@/lib/format';
import { TAUX_TVA } from '@/lib/comptabilite';
import Alerte from '@/components/Alerte';
import type { Categorie } from '@/lib/types';
import styles from './justificatifs.module.css';

type Correspondance = {
  resultat: string;
  depense_id?: string;
  numero_piece?: string;
  fournisseur?: string;
  montant_ttc?: number;
  a_justificatif?: boolean;
} | null;

type Ligne = {
  id: string;
  numero_piece: string | null;
  date_operation: string;
  libelle: string;
  contrepartie: string | null;
  montant: number;
  nom_justificatif: string | null;
  erreur_traitement: string | null;
  url: string | null;
  typeMime: string;
  correspondance: Correspondance;
};

type Etat = {
  phase: 'repos' | 'extraction' | 'extrait' | 'echec' | 'traite';
  fournisseur?: string;
  dateDepense?: string;
  categorieId?: string;
  montantTtc?: string;
  tauxTva?: number;
  numeroFacture?: string;
  description?: string;
  confiance?: number;
  remarques?: string;
  erreur?: string;
  numeroPiece?: string;
};

type Props = {
  lignes: Ligne[];
  categories: Categorie[];
  peutValider: boolean;
};

export default function JustificatifsQonto({ lignes, categories, peutValider }: Props) {
  const router = useRouter();
  const [etats, setEtats] = useState<Record<string, Etat>>({});
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  function maj(id: string, champs: Partial<Etat>) {
    setEtats((p) => ({ ...p, [id]: { ...(p[id] ?? { phase: 'repos' }), ...champs } }));
  }

  /** Rattache le fichier à une écriture déjà existante. */
  async function rattacher(l: Ligne, depenseId: string) {
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    // La migration 034 a renommé ce paramètre : `p_depense` visait une
    // table qui n'est plus la source. L'appel échouait sans rien créer.
    const { error } = await supabase.rpc('rattacher_justificatif_qonto', {
      p_transaction: l.id, p_piece: depenseId,
    });
    if (error) { setErreur(`Rattachement impossible — ${error.message}`); setEnCours(false); return; }

    await supabase.rpc('journaliser', {
      p_action: 'modification', p_table: 'depenses', p_id: depenseId,
      p_details: {
        resume: `Justificatif Qonto rattaché depuis ${l.numero_piece}`,
        fichier: l.nom_justificatif,
      },
    });

    setSucces(`Justificatif rattaché à ${l.correspondance?.numero_piece}.`);
    setEnCours(false);
    router.refresh();
  }

  /** Lit le document et pré-remplit les champs. */
  async function extraire(l: Ligne) {
    if (!l.url) { setErreur('Fichier introuvable.'); return; }
    maj(l.id, { phase: 'extraction', erreur: undefined });

    try {
      const rF = await fetch(l.url);
      const blob = await rF.blob();
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(',')[1]);
        r.onerror = () => rej(new Error('Lecture impossible'));
        r.readAsDataURL(blob);
      });

      const res = await fetch('/api/extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fichier: base64,
          typeMime: l.typeMime,
          nomFichier: l.nom_justificatif ?? 'justificatif',
          taille: blob.size,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.succes) {
        maj(l.id, { phase: 'echec', erreur: data.erreur ?? 'Extraction impossible' });
        return;
      }

      const e = data.extrait;
      const cat = data.categorieMemorisee?.categorie_id
        ?? categories.find((c) => c.libelle.toLowerCase() === (e.categorie_suggeree ?? '').toLowerCase())?.id
        ?? '';

      maj(l.id, {
        phase: 'extrait',
        // Le montant vient de la banque : il prime sur la lecture du document.
        fournisseur: e.fournisseur ?? l.contrepartie ?? l.libelle,
        dateDepense: l.date_operation,
        categorieId: cat,
        montantTtc: String(l.montant).replace('.', ','),
        tauxTva: e.taux_tva ?? 20,
        numeroFacture: e.numero_facture ?? '',
        description: e.description ?? '',
        confiance: e.confiance ?? 0,
        remarques: e.remarques ?? undefined,
      });
    } catch (err) {
      maj(l.id, {
        phase: 'echec',
        erreur: err instanceof Error ? err.message : 'Erreur réseau',
      });
    }
  }

  /** Crée l'écriture, rapprochée d'office puisque l'opération est connue. */
  async function creer(l: Ligne, valider: boolean) {
    const e = etats[l.id];
    if (!e?.categorieId) { maj(l.id, { erreur: 'Choisissez une catégorie.' }); return; }

    const v = parseFloat((e.montantTtc ?? '').replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) { maj(l.id, { erreur: 'Montant invalide.' }); return; }

    setEnCours(true);
    const supabase = createClient();

    const { data: res, error } = await supabase.rpc('creer_depense', {
      p_date: e.dateDepense ?? l.date_operation,
      p_fournisseur: (e.fournisseur ?? l.libelle).trim(),
      p_categorie: e.categorieId,
      p_montant_ttc: v,
      p_taux_tva: e.tauxTva ?? 20,
      p_libelle: e.description?.trim() || null,
      p_statut: valider && peutValider ? 'validee' : 'en_attente',
      p_origine: 'banque',
      p_transaction: l.id,
      p_numero_facture: e.numeroFacture || null,
      p_moyen_paiement: 'carte',
      p_extrait_ia: true,
      p_confiance: e.confiance ?? null,
      p_notes: e.remarques ?? null,
    });

    if (error || !res) {
      maj(l.id, { erreur: `Création impossible : ${error?.message}` });
      setEnCours(false);
      return;
    }

    const dep = res as { id: string; numero_piece: string };

    // Le fichier suit l'écriture. L'erreur était ignorée : le
    // justificatif restait dans la liste des pièces à traiter sans que
    // rien ne le signale, et l'écriture naissait sans facture.
    const { error: eRattache } = await supabase.rpc('rattacher_justificatif_qonto', {
      p_transaction: l.id, p_piece: dep.id,
    });
    if (eRattache) {
      maj(l.id, { erreur: `Écriture créée, mais justificatif non rattaché — ${eRattache.message}` });
      setEnCours(false);
      return;
    }

    maj(l.id, { phase: 'traite', numeroPiece: dep.numero_piece, erreur: undefined });
    setSucces(
      valider && peutValider
        ? `${dep.numero_piece} créée et validée.`
        : `${dep.numero_piece} créée. Elle attend votre vérification.`
    );
    setEnCours(false);
    router.refresh();
  }

  const groupes = Array.from(new Set(categories.map((c) => c.groupe)));

  if (lignes.length === 0) {
    return (
      <div className="card">
        <div className="etat-vide">
          <p>Aucun justificatif en attente.</p>
          <p className="muted">
            Les pièces déposées dans Qonto sont récupérées à chaque
            synchronisation. Celles qui correspondent à une dépense déjà
            enregistrée y sont rattachées automatiquement.
          </p>
          <Link href="/banque" className="btn btn--ghost">Retour à la banque</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      {lignes.map((l) => {
        const e = etats[l.id] ?? { phase: 'repos' as const };
        const corr = l.correspondance;
        const aCorrespondance = corr?.resultat === 'correspondance_forte'
          || corr?.resultat === 'correspondance_probable';

        return (
          <div key={l.id} className="card" style={{ marginBottom: '1.25rem' }}>
            <div className={styles.grille}>
              {/* Le document, toujours visible */}
              <div className={styles.apercu}>
                {l.url ? (
                  l.typeMime === 'application/pdf' ? (
                    <iframe src={l.url} title={l.nom_justificatif ?? 'justificatif'} />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={l.url} alt={l.nom_justificatif ?? 'justificatif'} />
                  )
                ) : (
                  <div className={styles.absent}>Fichier indisponible</div>
                )}
                <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.5rem' }}>
                  {l.nom_justificatif ?? 'justificatif'}
                </p>
              </div>

              <div className={styles.colonne}>
                {/* L'opération bancaire */}
                <div className={styles.operation}>
                  <p className="mono" style={{ fontSize: '.74rem', color: 'var(--g-600)' }}>
                    {l.numero_piece}
                  </p>
                  <p style={{ fontFamily: 'var(--display)', fontWeight: 600, marginTop: '.2rem' }}>
                    {l.contrepartie ?? l.libelle}
                  </p>
                  <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
                    {date(l.date_operation)} · <strong className="amount">{money(Number(l.montant))}</strong>
                  </p>
                </div>

                {/* Une écriture existe déjà */}
                {aCorrespondance && e.phase !== 'traite' && (
                  <div className={styles.correspondance}>
                    <p><strong>Une dépense correspond déjà</strong></p>
                    <p style={{ fontSize: 'var(--fs-sm)', marginTop: '.3rem' }}>
                      <span className="mono">{corr?.numero_piece}</span> — {corr?.fournisseur},{' '}
                      {money(Number(corr?.montant_ttc ?? 0))}
                      {corr?.a_justificatif && ' · possède déjà une pièce'}
                    </p>
                    <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.4rem', lineHeight: 1.5 }}>
                      Rattacher le fichier à cette écriture évite de compter
                      deux fois le même achat.
                    </p>
                    <div className={styles.actions}>
                      <button onClick={() => rattacher(l, corr!.depense_id!)}
                        disabled={enCours} className="btn btn--gold">
                        Rattacher à {corr?.numero_piece}
                      </button>
                      <Link href={`/depenses/${corr?.depense_id}`} className="btn btn--ghost">
                        Voir la dépense
                      </Link>
                    </div>
                  </div>
                )}

                {/* Aucune écriture : extraction puis création */}
                {!aCorrespondance && e.phase === 'repos' && (
                  <div className={styles.centre}>
                    <p className="muted" style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55 }}>
                      Aucune dépense ne correspond à cette opération. Lisez le
                      document pour créer l'écriture.
                    </p>
                    <button onClick={() => extraire(l)} className="btn btn--gold">
                      Extraire le document
                    </button>
                  </div>
                )}

                {e.phase === 'extraction' && (
                  <div className={styles.centre}>
                    <div className={styles.pulsation} />
                    <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>Lecture…</p>
                  </div>
                )}

                {e.phase === 'echec' && (
                  <div className={styles.centre}>
                    <Alerte type="erreur" message={e.erreur ?? 'Extraction impossible'} />
                    <button onClick={() => extraire(l)} className="btn btn--ghost">Réessayer</button>
                  </div>
                )}

                {e.phase === 'traite' && (
                  <div className={styles.centre}>
                    <p style={{ fontFamily: 'var(--display)', fontWeight: 600, color: 'var(--success)' }}>
                      {e.numeroPiece} enregistrée
                    </p>
                  </div>
                )}

                {e.phase === 'extrait' && (
                  <>
                    <div className={styles.entete}>
                      <span className={`badge ${(e.confiance ?? 0) >= 0.85 ? 'badge--success' : 'badge--warning'}`}>
                        Confiance {Math.round((e.confiance ?? 0) * 100)} %
                      </span>
                      <span className="badge badge--info">Montant issu de la banque</span>
                    </div>

                    {e.remarques && <p className={styles.remarque}>{e.remarques}</p>}

                    <div className={styles.formulaire}>
                      <label><span>Fournisseur</span>
                        <input type="text" value={e.fournisseur ?? ''}
                          onChange={(ev) => maj(l.id, { fournisseur: ev.target.value })} /></label>
                      <label><span>N° de facture</span>
                        <input type="text" value={e.numeroFacture ?? ''}
                          onChange={(ev) => maj(l.id, { numeroFacture: ev.target.value })} /></label>
                      <label style={{ gridColumn: '1 / -1' }}><span>Description</span>
                        <input type="text" value={e.description ?? ''}
                          onChange={(ev) => maj(l.id, { description: ev.target.value })} /></label>
                      <label><span>Montant TTC</span>
                        <input type="text" inputMode="decimal" value={e.montantTtc ?? ''}
                          onChange={(ev) => maj(l.id, { montantTtc: ev.target.value })} /></label>
                      <label><span>Taux de TVA</span>
                        <select value={e.tauxTva ?? 20}
                          onChange={(ev) => maj(l.id, { tauxTva: Number(ev.target.value) })}>
                          {TAUX_TVA.map((t) => (
                            <option key={t.valeur} value={t.valeur}>{t.libelle}</option>
                          ))}
                        </select></label>
                      <label style={{ gridColumn: '1 / -1' }}><span>Catégorie</span>
                        <select value={e.categorieId ?? ''}
                          onChange={(ev) => maj(l.id, { categorieId: ev.target.value })}>
                          <option value="">Choisir…</option>
                          {groupes.map((g) => (
                            <optgroup key={g} label={g}>
                              {categories.filter((c) => c.groupe === g).map((c) => (
                                <option key={c.id} value={c.id} disabled={c.bloque}>{c.libelle}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select></label>
                    </div>

                    {e.erreur && <Alerte type="erreur" message={e.erreur} />}

                    <div className={styles.actions}>
                      {peutValider && (
                        <button onClick={() => creer(l, true)} disabled={enCours} className="btn btn--gold">
                          Valider maintenant
                        </button>
                      )}
                      <button onClick={() => creer(l, false)} disabled={enCours} className="btn btn--ghost">
                        {peutValider ? 'Vérifier plus tard' : 'Soumettre à validation'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
