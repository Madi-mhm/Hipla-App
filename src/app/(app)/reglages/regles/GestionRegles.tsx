'use client';

/**
 * RÈGLES D'APPARIEMENT ET ALIAS APPRIS
 *
 * Le levier le plus rentable du système, davantage que l'algorithme.
 * Une dizaine de règles couvre l'essentiel des opérations récurrentes :
 * frais bancaires, URSSAF, impôts, assurance, carburant, télécoms.
 *
 * Deux mécanismes distincts, et tous deux visibles — c'est la condition
 * pour qu'on leur fasse confiance. Une règle au résultat surprenant doit
 * pouvoir se corriger en dix secondes.
 *
 *   · les RÈGLES sont déclarées : vous écrivez un motif, il pré-remplit.
 *   · les ALIAS sont appris : chaque rapprochement confirmé enregistre
 *     le couple libellé-fournisseur, et dès la deuxième occurrence il
 *     vaut vingt points au moteur.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money, date } from '@/lib/format';
import Dialogue from '@/components/Dialogue';
import Alerte from '@/components/Alerte';
import type { Categorie } from '@/lib/types';

export type Regle = {
  id: string;
  libelle: string;
  motif: string;
  sens: 'debit' | 'credit' | null;
  tiers_id: string | null;
  categorie_id: string | null;
  taux_tva: number | null;
  moyen_paiement: string | null;
  jamais_automatique: boolean;
  actif: boolean;
  ordre: number;
  occurrences: number;
};

export type Alias = {
  id: string;
  libelle_normalise: string;
  tiers_id: string | null;
  categorie_id: string | null;
  occurrences: number;
  derniere_le: string;
  tiers?: { nom: string } | null;
};

type Essai = {
  numero_piece: string | null;
  date_operation: string;
  libelle: string;
  montant: number;
  sens: string;
  deja_traitee: boolean;
};

type Props = {
  regles: Regle[];
  alias: Alias[];
  categories: Categorie[];
  peutGerer: boolean;
};

export default function GestionRegles({ regles, alias, categories, peutGerer }: Props) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [suppression, setSuppression] = useState<Regle | null>(null);

  // Saisie
  const [edite, setEdite] = useState<Regle | null>(null);
  const [libelle, setLibelle] = useState('');
  const [motif, setMotif] = useState('');
  const [sens, setSens] = useState<'' | 'debit' | 'credit'>('debit');
  const [categorieId, setCategorieId] = useState('');
  const [tauxTva, setTauxTva] = useState<string>('');
  const [jamaisAuto, setJamaisAuto] = useState(false);

  // Épreuve du motif
  const [essai, setEssai] = useState<Essai[] | null>(null);
  const [essaiEnCours, setEssaiEnCours] = useState(false);

  function reinitialiser() {
    setEdite(null); setLibelle(''); setMotif(''); setSens('debit');
    setCategorieId(''); setTauxTva(''); setJamaisAuto(false); setEssai(null);
  }

  function charger(r: Regle) {
    setEdite(r);
    setLibelle(r.libelle);
    setMotif(r.motif);
    setSens((r.sens ?? '') as '' | 'debit' | 'credit');
    setCategorieId(r.categorie_id ?? '');
    setTauxTva(r.taux_tva === null ? '' : String(r.taux_tva));
    setJamaisAuto(r.jamais_automatique);
    setEssai(null);
  }

  /** Montre ce que le motif attraperait, sans rien écrire. */
  async function eprouver() {
    if (!motif.trim()) { setErreur('Écrivez d\u2019abord un motif.'); return; }
    setEssaiEnCours(true);
    setErreur(null);
    const supabase = createClient();

    const { data, error } = await supabase.rpc('tester_regle', {
      p_motif: motif.trim(),
      p_sens: sens || null,
    });

    if (error) { setErreur(error.message); setEssaiEnCours(false); return; }
    setEssai((data ?? []) as Essai[]);
    setEssaiEnCours(false);
  }

  async function enregistrer() {
    if (!libelle.trim() || !motif.trim()) {
      setErreur('Le nom et le motif sont obligatoires.');
      return;
    }
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    const donnees = {
      libelle: libelle.trim(),
      motif: motif.trim(),
      sens: sens || null,
      categorie_id: categorieId || null,
      taux_tva: tauxTva === '' ? null : Number(tauxTva.replace(',', '.')),
      jamais_automatique: jamaisAuto,
      actif: true,
    };

    const { error } = edite
      ? await supabase.from('regles_appariement').update(donnees).eq('id', edite.id)
      : await supabase.from('regles_appariement').insert(donnees);

    if (error) { setErreur(`Enregistrement impossible : ${error.message}`); setEnCours(false); return; }

    setSucces(edite ? 'Règle modifiée.' : 'Règle créée.');
    reinitialiser();
    setEnCours(false);
    router.refresh();
  }

  async function basculerActif(r: Regle) {
    setEnCours(true);
    const supabase = createClient();
    const { error } = await supabase.from('regles_appariement')
      .update({ actif: !r.actif }).eq('id', r.id);
    if (error) setErreur(error.message);
    setEnCours(false);
    router.refresh();
  }

  async function supprimer(r: Regle) {
    setEnCours(true);
    const supabase = createClient();
    const { error } = await supabase.from('regles_appariement').delete().eq('id', r.id);
    if (error) { setErreur(error.message); setEnCours(false); return; }
    setSucces('Règle supprimée.');
    setEnCours(false);
    router.refresh();
  }

  async function oublierAlias(a: Alias) {
    setEnCours(true);
    const supabase = createClient();
    const { error } = await supabase.from('alias_bancaires').delete().eq('id', a.id);
    if (error) { setErreur(error.message); setEnCours(false); return; }
    setSucces('Alias oublié. Il se réapprendra au prochain rapprochement confirmé.');
    setEnCours(false);
    router.refresh();
  }

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      {/* ---------- Saisie ---------- */}
      {peutGerer && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <p className="card__title">{edite ? 'Modifier la règle' : 'Nouvelle règle'}</p>
          <p className="muted" style={{
            fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '70ch', marginBottom: '1rem',
          }}>
            Une règle reconnaît un motif dans le libellé bancaire et pré-remplit
            l&apos;écriture. Elle ne crée jamais rien toute seule : elle vous
            évite de choisir la catégorie à chaque fois.
          </p>

          <div style={grille}>
            <label><span>Nom de la règle *</span>
              <input type="text" value={libelle} onChange={(e) => setLibelle(e.target.value)}
                placeholder="Frais bancaires Qonto" /></label>

            <label><span>Motif cherché dans le libellé *</span>
              <input type="text" value={motif} onChange={(e) => { setMotif(e.target.value); setEssai(null); }}
                placeholder="QONTO" /></label>

            <label><span>Sens</span>
              <select value={sens} onChange={(e) => { setSens(e.target.value as typeof sens); setEssai(null); }}>
                <option value="debit">Débit — une sortie</option>
                <option value="credit">Crédit — une entrée</option>
                <option value="">Les deux</option>
              </select></label>

            <label><span>Catégorie proposée</span>
              <select value={categorieId} onChange={(e) => setCategorieId(e.target.value)}>
                <option value="">Aucune</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.libelle} — {c.compte}</option>
                ))}
              </select></label>

            <label><span>Taux de TVA imposé</span>
              <select value={tauxTva} onChange={(e) => setTauxTva(e.target.value)}>
                <option value="">Celui de la catégorie</option>
                <option value="20">20 %</option>
                <option value="10">10 %</option>
                <option value="5.5">5,5 %</option>
                <option value="0">0 % — exonéré</option>
              </select></label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', paddingTop: '1.4rem' }}>
              <input type="checkbox" checked={jamaisAuto} style={{ width: 'auto' }}
                onChange={(e) => setJamaisAuto(e.target.checked)} />
              <span style={{ margin: 0 }}>Ne jamais rattacher sans moi</span>
            </label>
          </div>

          <p className="muted" style={{
            fontSize: 'var(--fs-xs)', marginTop: '.6rem', lineHeight: 1.5, maxWidth: '70ch',
          }}>
            « Ne jamais rattacher sans moi » convient là où le montant varie
            d&apos;un mois sur l&apos;autre et mérite un regard : la règle
            pré-remplit, mais l&apos;écriture attend toujours votre décision.
          </p>

          <div style={{ display: 'flex', gap: '.6rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button onClick={eprouver} disabled={essaiEnCours || !motif.trim()}
              className="btn btn--ghost">
              {essaiEnCours ? 'Recherche…' : 'Éprouver le motif'}
            </button>
            <button onClick={enregistrer} disabled={enCours || !libelle.trim() || !motif.trim()}
              className="btn btn--gold">
              {edite ? 'Enregistrer' : 'Créer la règle'}
            </button>
            {edite && (
              <button onClick={reinitialiser} className="btn btn--ghost">Abandonner</button>
            )}
          </div>

          {/* ---- Ce que le motif attraperait ---- */}
          {essai && (
            <div style={{ marginTop: '1.2rem', paddingTop: '1rem', borderTop: '1px solid var(--g-200)' }}>
              <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: '.5rem' }}>
                {essai.length === 0
                  ? 'Ce motif n\u2019attrape aucune opération connue.'
                  : `Ce motif attrape ${essai.length} opération${essai.length > 1 ? 's' : ''}.`}
              </p>
              {essai.length === 0 ? (
                <p className="muted" style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.5, maxWidth: '68ch' }}>
                  Ce n&apos;est pas nécessairement une erreur : la règle peut viser
                  une opération à venir. Mais vérifiez l&apos;orthographe du motif
                  tel qu&apos;il apparaît sur le relevé.
                </p>
              ) : (
                <div className="table-scroll">
                  <table style={{ minWidth: 480, fontSize: 'var(--fs-sm)' }}>
                    <tbody>
                      {essai.map((e, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--g-200)' }}>
                          <td style={td}>{date(e.date_operation)}</td>
                          <td style={td}>{e.libelle}</td>
                          <td style={{ ...td, textAlign: 'right' }} className="amount">
                            {money(Number(e.montant))}
                          </td>
                          <td style={{ ...td, textAlign: 'right' }} className="muted">
                            {e.deja_traitee ? 'déjà traitée' : 'à traiter'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------- Règles ---------- */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card__title">Règles déclarées — {regles.length}</p>

        {regles.length === 0 ? (
          <div className="etat-vide">
            <p>Aucune règle.</p>
            <p className="muted">
              Une dizaine de règles couvre l&apos;essentiel des opérations
              récurrentes d&apos;une entreprise de nettoyage : frais bancaires,
              URSSAF, impôts, assurance, carburant, télécoms, abonnements.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table style={{ minWidth: 640, fontSize: 'var(--fs-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                  <th style={th}>Règle</th>
                  <th style={th}>Motif</th>
                  <th style={th}>Sens</th>
                  <th style={th}>Catégorie</th>
                  <th style={{ ...th, textAlign: 'right' }}>Appliquée</th>
                  <th style={{ ...th, textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {regles.map((r) => {
                  const cat = categories.find((c) => c.id === r.categorie_id);
                  return (
                    <tr key={r.id} style={{
                      borderBottom: '1px solid var(--g-200)', opacity: r.actif ? 1 : 0.45,
                    }}>
                      <td style={{ ...td, fontWeight: 500 }}>
                        {r.libelle}
                        {r.jamais_automatique && (
                          <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                            jamais automatique
                          </span>
                        )}
                      </td>
                      <td style={td} className="mono">{r.motif}</td>
                      <td style={td} className="muted">
                        {r.sens === 'debit' ? 'débit' : r.sens === 'credit' ? 'crédit' : 'les deux'}
                      </td>
                      <td style={td}>
                        {cat ? `${cat.libelle}` : '—'}
                        {r.taux_tva !== null && (
                          <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                            TVA {String(r.taux_tva).replace('.', ',')} %
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }} className="amount">
                        {r.occurrences}
                        {r.occurrences === 0 && (
                          <span className="muted" style={{ display: 'block', fontSize: '.68rem' }}>
                            jamais
                          </span>
                        )}
                      </td>
                      {peutGerer && (
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button onClick={() => charger(r)} className="btn btn--ghost"
                            style={bouton}>Modifier</button>
                          <button onClick={() => basculerActif(r)} className="btn btn--ghost"
                            style={{ ...bouton, marginLeft: '.3rem' }}>
                            {r.actif ? 'Suspendre' : 'Réactiver'}
                          </button>
                          <button onClick={() => setSuppression(r)} className="btn btn--ghost"
                            style={{ ...bouton, marginLeft: '.3rem', color: 'var(--danger)' }}>
                            Supprimer
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- Alias appris ---------- */}
      <div className="card">
        <p className="card__title">Fournisseurs appris — {alias.length}</p>
        <p className="muted" style={{
          fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '70ch', marginBottom: '.9rem',
        }}>
          Chaque rapprochement que vous confirmez enregistre le couple
          libellé-fournisseur. Dès la deuxième occurrence, le moteur reconnaît
          le fournisseur et lui accorde vingt points. Rien ne se déclare ici :
          cela s&apos;apprend tout seul.
        </p>

        {alias.length === 0 ? (
          <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
            Aucun fournisseur appris pour l&apos;instant.
          </p>
        ) : (
          <div className="table-scroll">
            <table style={{ minWidth: 520, fontSize: 'var(--fs-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                  <th style={th}>Libellé bancaire</th>
                  <th style={th}>Fournisseur</th>
                  <th style={{ ...th, textAlign: 'right' }}>Vu</th>
                  <th style={{ ...th, textAlign: 'right' }}>Dernière fois</th>
                  <th style={{ ...th, textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {alias.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--g-200)' }}>
                    <td style={td} className="mono">{a.libelle_normalise}</td>
                    <td style={{ ...td, fontWeight: 500 }}>{a.tiers?.nom ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }} className="amount">
                      {a.occurrences}
                      {a.occurrences < 2 && (
                        <span className="muted" style={{ display: 'block', fontSize: '.68rem' }}>
                          pas encore actif
                        </span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{date(a.derniere_le)}</td>
                    {peutGerer && (
                      <td style={{ ...td, textAlign: 'right' }}>
                        <button onClick={() => oublierAlias(a)} className="btn btn--ghost"
                          style={{ ...bouton, color: 'var(--danger)' }}>
                          Oublier
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialogue
        ouvert={suppression !== null}
        titre="Supprimer cette règle"
        description={
          `${suppression?.libelle ?? ''} — appliquée ${suppression?.occurrences ?? 0} fois. ` +
          "Les écritures déjà créées ne changent pas ; seules les prochaines " +
          "cesseront d'être pré-remplies."
        }
        libelleValider="Supprimer" danger
        onValider={() => { const r = suppression; setSuppression(null); if (r) supprimer(r); }}
        onAnnuler={() => setSuppression(null)}
      />
    </>
  );
}

const grille: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))',
  gap: '.9rem',
};
const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)',
  fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.6rem .4rem', verticalAlign: 'top' };
const bouton: React.CSSProperties = {
  minHeight: 28, padding: '.15rem .55rem', fontSize: '.7rem',
};
