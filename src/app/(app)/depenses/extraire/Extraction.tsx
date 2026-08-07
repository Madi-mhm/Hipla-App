'use client';

/**
 * EXTRACTION DE FACTURES
 *
 * Le document reste affiché à côté des champs extraits : c'est ce qui
 * permet de vérifier d'un coup d'œil plutôt que de faire confiance.
 *
 * Deux issues après extraction :
 *   · valider tout de suite, quand on a comparé
 *   · enregistrer en attente, pour vérifier au calme plus tard
 *
 * Le second cas est le plus fréquent en situation réelle : on
 * photographie un ticket en sortant du magasin, on vérifie le soir.
 */

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { compresser, poids } from '@/lib/compression';
import { depuisTTC, tvaRecuperable, montantsCoherents, TAUX_TVA } from '@/lib/comptabilite';
import { money, date } from '@/lib/format';
import Alerte from '@/components/Alerte';
import type { Categorie } from '@/lib/types';
import styles from './extraction.module.css';

type Extrait = {
  fournisseur: string | null;
  numero_facture: string | null;
  siret_fournisseur: string | null;
  tva_fournisseur: string | null;
  date: string | null;
  montant_ht: number | null;
  taux_tva: number | null;
  montant_tva: number | null;
  montant_ttc: number | null;
  devise: string | null;
  mode_paiement: string | null;
  lignes: { libelle: string; quantite: number; prix_unitaire: number }[] | null;
  description: string | null;
  categorie_suggeree: string | null;
  confiance: number | null;
  remarques: string | null;
};

type Doublon = {
  id: string; numero_piece: string; date_depense: string;
  montant_ttc: number; motif: string;
};

type Document = {
  id: string;
  fichier: File;
  apercu: string;
  etat: 'en_attente' | 'extraction' | 'extrait' | 'echec' | 'enregistre';
  extrait?: Extrait;
  coherent?: boolean;
  doublons?: Doublon[] | null;
  erreur?: string;
  erreurDefinitive?: boolean;
  numeroPiece?: string;
  // Champs corrigés par l'utilisateur
  fournisseur?: string;
  dateDepense?: string;
  categorieId?: string;
  montantTtc?: string;
  tauxTva?: number;
  numeroFacture?: string;
  description?: string;
};

type Usage = {
  plafond: number; extractions: number; reste: number;
  cout: number; pourcentage: number;
} | null;

type Props = {
  categories: Categorie[];
  usage: Usage;
  utilisateurId: string;
  peutValider: boolean;
};

export default function Extraction({
  categories, usage, utilisateurId, peutValider,
}: Props) {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [coutSession, setCoutSession] = useState(0);
  const champPhoto = useRef<HTMLInputElement>(null);
  const champFichier = useRef<HTMLInputElement>(null);

  const reste = usage?.reste ?? 100;
  const plafondProche = (usage?.pourcentage ?? 0) >= 80;

  async function ajouter(liste: FileList | null) {
    if (!liste || liste.length === 0) return;
    setErreur(null);

    if (liste.length > reste) {
      setErreur(
        `Il reste ${reste} extraction${reste > 1 ? 's' : ''} ce mois-ci, ` +
        `vous en proposez ${liste.length}.`
      );
      return;
    }

    const nouveaux: Document[] = [];
    for (const f of Array.from(liste)) {
      const r = await compresser(f);
      nouveaux.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fichier: r.fichier,
        apercu: URL.createObjectURL(r.fichier),
        etat: 'en_attente',
      });
    }
    setDocuments((p) => [...p, ...nouveaux]);
  }

  async function extraire(doc: Document) {
    majDoc(doc.id, { etat: 'extraction' });

    try {
      const base64 = await enBase64(doc.fichier);
      const res = await fetch('/api/extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fichier: base64,
          typeMime: doc.fichier.type,
          nomFichier: doc.fichier.name,
          taille: doc.fichier.size,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.succes) {
        majDoc(doc.id, {
          etat: 'echec',
          erreur: data.erreur ?? 'Extraction impossible',
          erreurDefinitive: Boolean(data.definitif),
        });
        if (data.plafond_atteint) setErreur(data.erreur);
        return;
      }

      const e = data.extrait as Extrait;
      const cat = trouverCategorie(e.categorie_suggeree, data.categorieMemorisee);

      setCoutSession((c) => c + (data.usage?.cout ?? 0));
      majDoc(doc.id, {
        etat: 'extrait',
        erreur: undefined,
        extrait: e,
        coherent: data.coherent,
        doublons: data.doublons,
        fournisseur: e.fournisseur ?? '',
        dateDepense: e.date ?? new Date().toISOString().slice(0, 10),
        categorieId: cat,
        montantTtc: e.montant_ttc != null ? String(e.montant_ttc).replace('.', ',') : '',
        tauxTva: e.taux_tva ?? 20,
        numeroFacture: e.numero_facture ?? '',
        description: e.description ?? '',
      });
    } catch (err) {
      majDoc(doc.id, {
        etat: 'echec',
        erreur: err instanceof Error ? err.message : 'Erreur réseau',
      });
    }
  }

  function trouverCategorie(suggeree: string | null, memorisee: { categorie_id: string } | null) {
    // La mémoire d'un fournisseur déjà rencontré prime sur la suggestion :
    // elle reflète vos corrections passées.
    if (memorisee?.categorie_id) return memorisee.categorie_id;
    if (!suggeree) return '';
    const c = categories.find(
      (x) => x.libelle.toLowerCase() === suggeree.toLowerCase()
    );
    return c?.id ?? '';
  }

  async function enregistrer(doc: Document, valider: boolean) {
    const v = parseFloat((doc.montantTtc ?? '').replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) {
      majDoc(doc.id, { erreur: 'Montant invalide.' });
      return;
    }
    const cat = categories.find((c) => c.id === doc.categorieId);
    if (!cat) { majDoc(doc.id, { erreur: 'Choisissez une catégorie.' }); return; }
    if (cat.bloque) { majDoc(doc.id, { erreur: cat.avertissement ?? 'Catégorie bloquée.' }); return; }

    const m = depuisTTC(v, doc.tauxTva ?? 20);
    if (!montantsCoherents(m.ht, m.tva, m.ttc)) {
      majDoc(doc.id, { erreur: 'Incohérence entre HT, TVA et TTC.' });
      return;
    }

    const supabase = createClient();
    const tvaRec = tvaRecuperable(m.tva, cat.taux_deductibilite);
    const statut = valider && peutValider ? 'validee' : 'en_attente';

    const { data: res, error } = await supabase.rpc('creer_depense', {
      p_date: doc.dateDepense,
      p_fournisseur: (doc.fournisseur ?? '').trim(),
      p_categorie: cat.id,
      p_montant_ttc: m.ttc,
      p_taux_tva: doc.tauxTva ?? 20,
      p_libelle: doc.description?.trim() || doc.extrait?.description
                 || doc.extrait?.lignes?.[0]?.libelle || null,
      p_statut: statut,
      p_origine: 'extraction_ia',
      p_numero_facture: doc.numeroFacture || null,
      p_moyen_paiement: doc.extrait?.mode_paiement ?? 'carte',
      p_notes: doc.extrait?.remarques ?? null,
      p_extrait_ia: true,
      p_confiance: doc.extrait?.confiance ?? null,
      // Les deux faits qui déterminent le régime de TVA. L'IA les lisait
      // déjà sur la facture, mais ils s'arrêtaient ici : une facture
      // étrangère sans taxe était classée « exonérée » au lieu
      // d'« autoliquidation », perdant les deux lignes de déclaration.
      p_tva_facturee: doc.extrait?.montant_tva ?? null,
      p_tva_intracom: doc.extrait?.tva_fournisseur ?? null,
    });

    if (error || !res) {
      majDoc(doc.id, { erreur: `Enregistrement impossible : ${error?.message}` });
      return;
    }

    const dep = res as { id: string; numero_piece: string; rapprochement_propose?: string };

    // Le SIRET et le numéro de TVA du fournisseur ne sont pas des
    // paramètres de la fonction : ils complètent l'écriture après coup.
    if (doc.extrait?.siret_fournisseur || doc.extrait?.tva_fournisseur) {
      await supabase.from('depenses').update({
        siret_fournisseur: doc.extrait?.siret_fournisseur ?? null,
        tva_fournisseur: doc.extrait?.tva_fournisseur ?? null,
      }).eq('id', dep.id);
    }

    // Le justificatif est déjà en main : on le joint sans repasser par l'utilisateur.
    const chemin = `${dep.id}/${Date.now()}-${doc.fichier.name}`;
    const { error: eUp } = await supabase.storage
      .from('justificatifs').upload(chemin, doc.fichier);
    if (!eUp) {
      await supabase.from('justificatifs').insert({
        depense_id: dep.id,
        chemin,
        nom_original: doc.fichier.name,
        type_mime: doc.fichier.type,
        taille_octets: doc.fichier.size,
        cree_par: utilisateurId,
      });
    }

    majDoc(doc.id, { etat: 'enregistre', numeroPiece: dep.numero_piece ?? undefined, erreur: undefined });
    setSucces(
      (statut === 'validee'
        ? `${dep.numero_piece} enregistrée et validée.`
        : `${dep.numero_piece} enregistrée. Elle attend votre vérification.`)
      + (dep.rapprochement_propose?.startsWith('correspondance')
        ? ' Une opération bancaire correspondante a été trouvée : à confirmer.'
        : '')
    );
    router.refresh();
  }

  function majDoc(id: string, champs: Partial<Document>) {
    setDocuments((p) => p.map((d) => (d.id === id ? { ...d, ...champs } : d)));
  }

  function retirer(id: string) {
    setDocuments((p) => {
      const d = p.find((x) => x.id === id);
      if (d) URL.revokeObjectURL(d.apercu);
      return p.filter((x) => x.id !== id);
    });
  }

  const aExtraire = documents.filter((d) => d.etat === 'en_attente');
  const groupes = Array.from(new Set(categories.map((c) => c.groupe)));

  return (
    <>
      {/* ---------- Dépôt ---------- */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card__title">Déposer un document</p>

        <div className={styles.boutons}>
          <button onClick={() => champPhoto.current?.click()} className={`btn btn--gold ${styles.boutonPhoto}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Prendre une photo
          </button>

          <button onClick={() => champFichier.current?.click()} className="btn btn--ghost">
            Choisir un fichier
          </button>
        </div>

        <input ref={champPhoto} type="file" accept="image/*" capture="environment"
          multiple onChange={(e) => ajouter(e.target.files)} className="sr-only" />
        <input ref={champFichier} type="file" accept="image/*,application/pdf"
          multiple onChange={(e) => ajouter(e.target.files)} className="sr-only" />

        <div
          className={styles.zone}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); ajouter(e.dataTransfer.files); }}
        >
          Ou glissez vos factures ici — plusieurs à la fois
        </div>

        <div className={styles.compteur}>
          <span className="muted">
            {reste} extraction{reste > 1 ? 's' : ''} restante{reste > 1 ? 's' : ''} ce mois-ci
            {coutSession > 0 && ` · ${coutSession.toFixed(4).replace('.', ',')} € cette session`}
          </span>
          <div className={styles.barre}>
            <div className={styles.barreRemplie}
              style={{
                width: `${Math.min(usage?.pourcentage ?? 0, 100)}%`,
                background: plafondProche ? 'var(--warning)' : 'var(--success)',
              }} />
          </div>
        </div>

        {plafondProche && (
          <Alerte type="info"
            message={`Vous avez consommé ${usage?.pourcentage} % du plafond mensuel de ${usage?.plafond} extractions.`} />
        )}

        {aExtraire.length > 0 && (
          <button
            onClick={() => aExtraire.forEach(extraire)}
            className="btn btn--gold"
            style={{ marginTop: '1rem' }}
          >
            Extraire {aExtraire.length} document{aExtraire.length > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      {/* ---------- Documents ---------- */}
      {documents.map((doc) => (
        <div key={doc.id} className="card" style={{ marginBottom: '1.25rem' }}>
          <div className={styles.grille}>
            {/* Le document, toujours visible à côté des champs */}
            <div className={styles.apercu}>
              {doc.fichier.type === 'application/pdf' ? (
                <iframe src={doc.apercu} title={doc.fichier.name} />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={doc.apercu} alt={doc.fichier.name} />
              )}
              <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.5rem' }}>
                {doc.fichier.name} · {poids(doc.fichier.size)}
              </p>
            </div>

            <div className={styles.champs}>
              {doc.etat === 'en_attente' && (
                <div className={styles.centre}>
                  <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
                    Document prêt.
                  </p>
                  <button onClick={() => extraire(doc)} className="btn btn--gold">
                    Extraire
                  </button>
                  <button onClick={() => retirer(doc.id)} className="btn btn--ghost">
                    Retirer
                  </button>
                </div>
              )}

              {doc.etat === 'extraction' && (
                <div className={styles.centre}>
                  <div className={styles.pulsation} />
                  <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
                    Lecture du document…
                  </p>
                </div>
              )}

              {doc.etat === 'echec' && (
                <div className={styles.centre}>
                  <Alerte type="erreur" message={doc.erreur ?? 'Extraction impossible'} />
                  {!doc.erreurDefinitive && (
                    <button onClick={() => extraire(doc)} className="btn btn--ghost">
                      Réessayer
                    </button>
                  )}
                  <button onClick={() => retirer(doc.id)} className="btn btn--ghost">
                    Retirer
                  </button>
                </div>
              )}

              {doc.etat === 'enregistre' && (
                <div className={styles.centre}>
                  <p style={{ fontFamily: 'var(--display)', fontWeight: 600, color: 'var(--success)' }}>
                    {doc.numeroPiece} enregistrée
                  </p>
                  <button onClick={() => retirer(doc.id)} className="btn btn--ghost">
                    Fermer
                  </button>
                </div>
              )}

              {doc.etat === 'extrait' && (
                <>
                  <div className={styles.entete}>
                    <span className={`badge ${
                      (doc.extrait?.confiance ?? 0) >= 0.85 ? 'badge--success' : 'badge--warning'
                    }`}>
                      Confiance {Math.round((doc.extrait?.confiance ?? 0) * 100)} %
                    </span>
                    {!doc.coherent && (
                      <span className="badge badge--danger">HT + TVA ≠ TTC</span>
                    )}
                  </div>

                  {doc.extrait?.remarques && (
                    <p className={styles.remarque}>{doc.extrait.remarques}</p>
                  )}

                  {doc.doublons && doc.doublons.length > 0 && (
                    <div className={styles.doublon}>
                      <strong>Doublon possible</strong>
                      {doc.doublons.map((d) => (
                        <p key={d.id}>
                          {d.numero_piece} du {date(d.date_depense)} — {money(Number(d.montant_ttc))}
                          <span className="muted"> · {d.motif}</span>
                        </p>
                      ))}
                    </div>
                  )}

                  <div className={styles.formulaire}>
                    <label><span>Fournisseur</span>
                      <input type="text" value={doc.fournisseur ?? ''}
                        onChange={(e) => majDoc(doc.id, { fournisseur: e.target.value })} /></label>
                    <label><span>N° de facture</span>
                      <input type="text" value={doc.numeroFacture ?? ''}
                        onChange={(e) => majDoc(doc.id, { numeroFacture: e.target.value })}
                        placeholder="référence du fournisseur" /></label>
                    <label style={{ gridColumn: '1 / -1' }}><span>Description</span>
                      <input type="text" value={doc.description ?? ''}
                        onChange={(e) => majDoc(doc.id, { description: e.target.value })}
                        placeholder="éponges, sacs poubelle, papier toilette" /></label>
                    <label><span>Date</span>
                      <input type="date" value={doc.dateDepense ?? ''}
                        onChange={(e) => majDoc(doc.id, { dateDepense: e.target.value })} /></label>
                    <label><span>Montant TTC</span>
                      <input type="text" inputMode="decimal" value={doc.montantTtc ?? ''}
                        onChange={(e) => majDoc(doc.id, { montantTtc: e.target.value })} /></label>
                    <label><span>Taux de TVA</span>
                      <select value={doc.tauxTva ?? 20}
                        onChange={(e) => majDoc(doc.id, { tauxTva: Number(e.target.value) })}>
                        {TAUX_TVA.map((t) => (
                          <option key={t.valeur} value={t.valeur}>{t.libelle}</option>
                        ))}
                      </select></label>
                    <label><span>Catégorie</span>
                      <select value={doc.categorieId ?? ''}
                        onChange={(e) => majDoc(doc.id, { categorieId: e.target.value })}>
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

                  {doc.extrait?.siret_fournisseur && (
                    <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.6rem' }}>
                      SIRET relevé : <span className="mono">{doc.extrait.siret_fournisseur}</span>
                    </p>
                  )}

                  {doc.erreur && <Alerte type="erreur" message={doc.erreur} />}

                  <div className={styles.actions}>
                    {peutValider && (
                      <button onClick={() => enregistrer(doc, true)} className="btn btn--gold">
                        Valider maintenant
                      </button>
                    )}
                    <button onClick={() => enregistrer(doc, false)} className="btn btn--ghost">
                      {peutValider ? 'Vérifier plus tard' : 'Soumettre à validation'}
                    </button>
                    <button onClick={() => retirer(doc.id)} className="btn btn--ghost"
                      style={{ marginLeft: 'auto', color: 'var(--danger)' }}>
                      Abandonner
                    </button>
                  </div>

                  {peutValider && (
                    <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.7rem', lineHeight: 1.5 }}>
                      « Vérifier plus tard » enregistre la dépense en attente : elle
                      apparaîtra dans votre centre d'action pour un contrôle au calme.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ))}

      {documents.length === 0 && (
        <div className="card">
          <div className="etat-vide">
            <p>Aucun document en cours.</p>
            <p className="muted">
              Photographiez un ticket ou déposez une facture : la date, le
              fournisseur et les montants sont relevés automatiquement. Vous
              vérifiez, vous validez.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function enBase64(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(new Error('Lecture du fichier impossible'));
    r.readAsDataURL(f);
  });
}
