'use client';

/**
 * Frais de création et de préparation.
 *
 * Deux natures juridiques distinctes affichées séparément :
 *  · les frais couverts par l'Annexe 1 des statuts sont repris d'office ;
 *  · les autres nécessitent une ratification en assemblée générale, dont
 *    le tableau récapitulatif est généré ici.
 *
 * Toutes les lignes sont modifiables : les montants proviennent d'un relevé
 * et devront être ajustés à réception des justificatifs.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { depuisTTC, tvaRecuperable } from '@/lib/comptabilite';
import { money, date, dateLong } from '@/lib/format';
import {
  LIBELLE_NATURE, LIBELLE_REPRISE, LIBELLE_STATUT_REPRISE,
  CLASSE_STATUT_REPRISE, LIBELLE_ASSOCIE,
  type Categorie, type FraisCreation,
} from '@/lib/types';
import { detailsModification } from '@/lib/audit';
import Dialogue from '@/components/Dialogue';
import Alerte from '@/components/Alerte';
import styles from './frais.module.css';

type Props = {
  frais: FraisCreation[];
  categories: Categorie[];
  peutModifier: boolean;
};

export default function TableauFrais({ frais, categories, peutModifier }: Props) {
  const router = useRouter();
  const [edite, setEdite] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recap, setRecap] = useState(false);
  const [dialogueRatification, setDialogueRatification] = useState(false);

  const creation = frais.filter((f) => f.nature === 'creation');
  const preparation = frais.filter((f) => f.nature === 'preparation');
  const aRatifier = frais.filter((f) => f.statut_reprise === 'a_valider');

  const totaux = useMemo(() => {
    // Une ligne écartée ne fait plus partie de la reprise : ni la société
    // ne la doit à l'associé, ni sa TVA n'est récupérable. L'inclure
    // gonflerait le compte courant et fausserait la déclaration.
    const retenues = frais.filter((f) => f.statut_reprise !== 'rejete');

    const parAssocie: Record<string, { ttc: number; tva: number; n: number }> = {};
    for (const f of retenues) {
      const k = f.associe_payeur;
      parAssocie[k] ??= { ttc: 0, tva: 0, n: 0 };
      parAssocie[k].ttc += Number(f.montant_ttc);
      parAssocie[k].tva += Number(f.tva_deductible);
      parAssocie[k].n += 1;
    }

    return {
      parAssocie,
      nbRetenues: retenues.length,
      nbEcartees: frais.length - retenues.length,
      totalTTC: retenues.reduce((s, f) => s + Number(f.montant_ttc), 0),
      totalTVA: retenues.reduce((s, f) => s + Number(f.tva_deductible), 0),
      totalHT: retenues.reduce((s, f) => s + Number(f.montant_ht), 0),
      ratifie: retenues.filter((f) => f.statut_reprise === 'repris')
        .reduce((s, f) => s + Number(f.montant_ttc), 0),
    };
  }, [frais]);

  async function ratifierTout() {
    setEnCours(true);
    const supabase = createClient();
    // `valider_piece` fait le travail complet : elle numérote, fige les
    // montants et rend la TVA exigible. La mise à jour directe de
    // `frais_creation` ne touchait plus le registre — la ratification
    // n'aurait produit AUCUN effet comptable.
    for (const f of aRatifier) {
      const { error } = await supabase.rpc('valider_piece', { p_id: f.id });
      if (error) { setErreur(error.message); setEnCours(false); return; }
    }

    await supabase.rpc('journaliser', {
      p_action: 'ratification', p_table: 'frais_creation', p_id: null,
      p_details: {
        resume: `${aRatifier.length} lignes ratifiées en assemblée générale`,
        lignes: aRatifier.map((f) => ({
          date: f.date_engagement,
          fournisseur: f.fournisseur,
          montant_ttc: Number(f.montant_ttc),
          avance_par: f.associe_payeur,
        })),
        total_ttc: aRatifier.reduce((s, f) => s + Number(f.montant_ttc), 0),
      },
    });
    setEnCours(false);
    router.refresh();
  }

  return (
    <>
      {/* ---- Synthèse ---- */}
      <div className="grid-cards" style={{ marginBottom: '1.25rem' }}>
        <div className="card">
          <p className="card__title">Total avancé</p>
          <p className="amount" style={{ fontSize: '1.35rem', fontFamily: 'var(--display)', fontWeight: 600 }}>
            {money(totaux.totalTTC)}
          </p>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>
            {totaux.nbRetenues} ligne{totaux.nbRetenues > 1 ? 's' : ''} · {money(totaux.totalHT)} HT
            {totaux.nbEcartees > 0 && ` · ${totaux.nbEcartees} écartée${totaux.nbEcartees > 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="card">
          <p className="card__title">TVA à récupérer</p>
          <p className="amount" style={{ fontSize: '1.35rem', fontFamily: 'var(--display)', fontWeight: 600 }}>
            {money(totaux.totalTVA)}
          </p>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>
            Sur la première déclaration
          </p>
        </div>
        {Object.entries(totaux.parAssocie).map(([k, v]) => (
          <div className="card" key={k} style={{ borderLeft: '3px solid var(--gold)' }}>
            <p className="card__title">Dû à {LIBELLE_ASSOCIE[k]?.split(' ')[0]}</p>
            <p className="amount" style={{ fontSize: '1.35rem', fontFamily: 'var(--display)', fontWeight: 600 }}>
              {money(v.ttc)}
            </p>
            <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>
              Compte courant d'associé · {v.n} lignes
            </p>
          </div>
        ))}
      </div>

      {/* ---- Alerte ratification ---- */}
      {aRatifier.length > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--warning)' }}>
          <p className="card__title" style={{ color: 'var(--warning)' }}>
            {aRatifier.length} ligne{aRatifier.length > 1 ? 's' : ''} à ratifier
          </p>
          <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '68ch' }}>
            L'Annexe 1 des statuts ne couvre que les frais de création LegalPlace
            et l'ouverture du compte Qonto. Les autres dépenses doivent être
            reprises par une décision des associés prise après l'immatriculation.
            Sans cette ratification, elles restent des dépenses personnelles :
            ni déductibles du résultat, ni récupérables en TVA.
          </p>
          <div style={{ display: 'flex', gap: '.6rem', marginTop: '.9rem', flexWrap: 'wrap' }}>
            <button onClick={() => setRecap(!recap)} className="btn btn--gold">
              {recap ? 'Masquer' : 'Générer le tableau pour l\u2019AG'}
            </button>
            {peutModifier && (
              <button onClick={() => setDialogueRatification(true)} disabled={enCours} className="btn btn--ghost">
                Marquer comme ratifiées
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---- Tableau pour le procès-verbal ---- */}
      {recap && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div className={styles.recap}>
            <h2 style={{ fontSize: '1rem', marginBottom: '.3rem' }}>Hipla Services</h2>
            <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
              Société par actions simplifiée au capital de 400 euros<br />
              Siège social : 270 Rue du Maconnais, 73000 Chambéry<br />
              SIREN 108 105 875 — RCS Chambéry
            </p>

            <h3 style={{ fontSize: '.95rem', margin: '1.4rem 0 .6rem' }}>
              État des actes accomplis pour le compte de la société en formation
            </h3>
            <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6, marginBottom: '1rem' }}>
              Liste des dépenses engagées par les associés pour le compte de la
              société avant son immatriculation au Registre du Commerce et des
              Sociétés, intervenue le 29 juillet 2026, et soumises à la
              ratification de la collectivité des associés.
            </p>

            <div className="table-scroll">
              <table style={{ minWidth: 560, fontSize: 'var(--fs-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--g-400)' }}>
                    <th style={thRecap}>Date</th>
                    <th style={thRecap}>Nature de l'engagement</th>
                    <th style={thRecap}>Engagé par</th>
                    <th style={{ ...thRecap, textAlign: 'right' }}>Montant TTC</th>
                  </tr>
                </thead>
                <tbody>
                  {aRatifier.map((f) => (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--g-200)' }}>
                      <td style={tdRecap}>{date(f.date_engagement)}</td>
                      <td style={tdRecap}>
                        {f.fournisseur}{f.libelle ? ` — ${f.libelle}` : ''}
                      </td>
                      <td style={tdRecap}>{LIBELLE_ASSOCIE[f.associe_payeur]}</td>
                      <td style={{ ...tdRecap, textAlign: 'right' }} className="amount">
                        {money(Number(f.montant_ttc))}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--g-400)' }}>
                    <td style={tdRecap} colSpan={3}><strong>Total</strong></td>
                    <td style={{ ...tdRecap, textAlign: 'right' }} className="amount">
                      <strong>
                        {money(aRatifier.reduce((s, f) => s + Number(f.montant_ttc), 0))}
                      </strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6, margin: '1.2rem 0' }}>
              La collectivité des associés, statuant à la majorité, décide de
              reprendre l'ensemble des engagements figurant au présent état. Ces
              engagements sont réputés avoir été souscrits par la Société dès
              l'origine. Les montants correspondants sont inscrits au crédit du
              compte courant de l'associé les ayant avancés.
            </p>

            <div className={styles.signatures}>
              <div>
                <p style={{ fontSize: 'var(--fs-sm)', marginBottom: '2.5rem' }}>
                  Fait à Chambéry, le {dateLong(new Date())}
                </p>
                <p style={{ fontSize: 'var(--fs-sm)', borderTop: '1px solid var(--g-400)', paddingTop: '.4rem' }}>
                  Monsieur Mahdi MOHAMADI<br />
                  <span className="muted">Associé et Président</span>
                </p>
              </div>
              <div>
                <p style={{ fontSize: 'var(--fs-sm)', marginBottom: '2.5rem' }}>&nbsp;</p>
                <p style={{ fontSize: 'var(--fs-sm)', borderTop: '1px solid var(--g-400)', paddingTop: '.4rem' }}>
                  Monsieur Sabir MOHAMED AHMED<br />
                  <span className="muted">Associé et Directeur Général</span>
                </p>
              </div>
            </div>
          </div>

          <p className={`${styles.avertissement} sans-impression`}>
            Modèle de travail. Faites-le relire par un expert-comptable avant
            signature : c'est ce document qui justifiera la déduction des charges
            et la récupération de la TVA en cas de contrôle.
          </p>

          <button onClick={() => window.print()} className="btn btn--ghost" style={{ marginTop: '.9rem' }}>
            Imprimer
          </button>
        </div>
      )}

      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}

      <Dialogue
        ouvert={dialogueRatification}
        titre={`Ratifier ${aRatifier.length} ligne${aRatifier.length > 1 ? 's' : ''}`}
        description={
          "À ne faire qu'après avoir tenu l'assemblée générale et signé le " +
          "procès-verbal. Ces dépenses seront alors reprises par la société " +
          "et inscrites au compte courant de l'associé qui les a avancées."
        }
        libelleValider="Confirmer la ratification"
        onValider={() => { setDialogueRatification(false); ratifierTout(); }}
        onAnnuler={() => setDialogueRatification(false)}
      />

      {/* ---- Les deux blocs ---- */}
      <Bloc
        titre={LIBELLE_NATURE.creation}
        soustitre="Couverts par l'Annexe 1 des statuts — reprise acquise par la signature"
        lignes={creation}
        categories={categories}
        peutModifier={peutModifier}
        edite={edite} setEdite={setEdite}
      />

      <Bloc
        titre={LIBELLE_NATURE.preparation}
        soustitre="Achats réalisés pour préparer le démarrage de l'activité"
        lignes={preparation}
        categories={categories}
        peutModifier={peutModifier}
        edite={edite} setEdite={setEdite}
      />
    </>
  );
}

function Bloc({
  titre, soustitre, lignes, categories, peutModifier, edite, setEdite,
}: {
  titre: string; soustitre: string; lignes: FraisCreation[];
  categories: Categorie[]; peutModifier: boolean;
  edite: string | null; setEdite: (v: string | null) => void;
}) {
  if (lignes.length === 0) return null;
  const total = lignes
    .filter((f) => f.statut_reprise !== 'rejete')
    .reduce((s, f) => s + Number(f.montant_ttc), 0);

  return (
    <div className="card" style={{ marginBottom: '1.25rem' }}>
      <p className="card__title">{titre}</p>
      <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginBottom: '.9rem' }}>{soustitre}</p>

      <div className="table-scroll">
        <table style={{ minWidth: 680, fontSize: 'var(--fs-sm)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
              <th style={th}>Pièce</th>
              <th style={th}>Date</th>
              <th style={th}>Fournisseur</th>
              <th style={th} className="col-secondaire">Catégorie</th>
              <th style={{ ...th, textAlign: 'right' }}>HT</th>
              <th style={{ ...th, textAlign: 'right' }} className="col-secondaire">TVA</th>
              <th style={{ ...th, textAlign: 'right' }}>TTC</th>
              <th style={{ ...th, textAlign: 'right' }}>Reprise</th>
              {peutModifier && <th style={{ ...th, textAlign: 'right' }}></th>}
            </tr>
          </thead>
          <tbody>
            {lignes.map((f) =>
              edite === f.id ? (
                <LigneEdition key={f.id} frais={f} categories={categories} fermer={() => setEdite(null)} />
              ) : (
                <tr key={f.id} style={{
                  borderBottom: '1px solid var(--g-200)',
                  opacity: f.statut_reprise === 'rejete' ? 0.45 : 1,
                }}>
                  <td style={td} className="mono">
                    <span style={{ fontSize: '.72rem', color: 'var(--g-600)' }}>
                      {f.numero_piece ?? '—'}
                    </span>
                  </td>
                  <td style={td}>{date(f.date_engagement)}</td>
                  <td style={{ ...td, fontWeight: 500 }}>
                    {f.fournisseur}
                    {f.libelle && (
                      <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                        {f.libelle}
                      </span>
                    )}
                  </td>
                  <td style={td} className="col-secondaire">
                    {f.categories?.libelle ?? '—'}
                    <span className="mono muted" style={{ display: 'block', fontSize: '.68rem' }}>{f.compte}</span>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }} className="amount">{money(Number(f.montant_ht))}</td>
                  <td style={{ ...td, textAlign: 'right' }} className="amount col-secondaire">
                    {money(Number(f.montant_tva))}
                    {f.tva_a_confirmer && (
                      <span className="badge badge--warning" style={{ display: 'block', marginTop: '.2rem', fontSize: '.6rem' }}>
                        à confirmer
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }} className="amount">
                    {money(Number(f.montant_ttc))}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <span className={`badge ${CLASSE_STATUT_REPRISE[f.statut_reprise]}`}>
                      {LIBELLE_STATUT_REPRISE[f.statut_reprise]}
                    </span>
                    <span className="muted" style={{ display: 'block', fontSize: '.66rem', marginTop: '.2rem' }}>
                      {LIBELLE_REPRISE[f.mode_reprise]}
                    </span>
                  </td>
                  {peutModifier && (
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button onClick={() => setEdite(f.id)} className="btn btn--ghost"
                        style={{ minHeight: 28, padding: '.15rem .6rem', fontSize: '.7rem' }}>
                        Modifier
                      </button>
                    </td>
                  )}
                </tr>
              )
            )}
            <tr style={{ borderTop: '2px solid var(--g-300)' }}>
              <td style={td} colSpan={6}><strong>Total {titre.toLowerCase()}</strong></td>
              <td style={{ ...td, textAlign: 'right' }} className="amount"><strong>{money(total)}</strong></td>
              <td style={td} colSpan={peutModifier ? 2 : 1}></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LigneEdition({
  frais, categories, fermer,
}: { frais: FraisCreation; categories: Categorie[]; fermer: () => void }) {
  const router = useRouter();
  const [dateEng, setDateEng] = useState(frais.date_engagement);
  const [fournisseur, setFournisseur] = useState(frais.fournisseur);
  const [libelle, setLibelle] = useState(frais.libelle ?? '');
  const [categorieId, setCategorieId] = useState(frais.categorie_id ?? '');
  const [ttc, setTtc] = useState(String(frais.montant_ttc).replace('.', ','));
  const [taux, setTaux] = useState(Number(frais.taux_tva));
  const [payeur, setPayeur] = useState(frais.associe_payeur);
  const [statut, setStatut] = useState(frais.statut_reprise);
  const [enCours, setEnCours] = useState(false);
  // Ce composant n'avait aucun état d'erreur : un échec d'enregistrement
  // passait inaperçu, et l'on croyait avoir corrigé une ligne qui ne
  // l'était pas.
  const [erreur, setErreur] = useState<string | null>(null);

  async function enregistrer() {
    const v = parseFloat(ttc.replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) return;
    const m = depuisTTC(v, taux);
    const cat = categories.find((c) => c.id === categorieId);
    const dedu = cat ? cat.taux_deductibilite : 100;

    setEnCours(true);
    const supabase = createClient();
    // `modifier_achat` recalcule les montants, met à jour le tiers et
    // journalise. Écrire directement dans `frais_creation` laissait le
    // registre inchangé : la correction était invisible partout ailleurs.
    const { error } = await supabase.rpc('modifier_achat', {
      p_piece: frais.id,
      p_date: dateEng,
      p_tiers: fournisseur.trim(),
      p_categorie: categorieId || null,
      p_montant_ttc: m.ttc,
      p_taux_tva: taux,
      p_objet: libelle.trim() || null,
      p_paye_par: payeur,
      p_deductibilite: dedu,
    });

    if (error) { setErreur(error.message); setEnCours(false); return; }

    // Le statut n'est pas un champ modifiable : valider ou rejeter sont
    // des gestes, qui numérotent, figent les montants et rendent la TVA
    // exigible. `modifier_achat` ne les couvre pas.
    if (statut !== frais.statut_reprise) {
      if (statut === 'repris') {
        const { error: e } = await supabase.rpc('valider_piece', { p_id: frais.id });
        if (e) { setErreur(e.message); setEnCours(false); return; }
      } else if (statut === 'rejete') {
        const { error: e } = await supabase.rpc('rejeter_piece', {
          p_id: frais.id,
          p_motif: 'Rejeté depuis l\u2019écran des frais de création',
        });
        if (e) { setErreur(e.message); setEnCours(false); return; }
      }
    }

    if (!error) {
      await supabase.rpc('journaliser', {
        p_action: 'modification', p_table: 'pieces', p_id: frais.id,
        p_details: detailsModification(
          {
            date_engagement: frais.date_engagement,
            fournisseur: frais.fournisseur,
            libelle: frais.libelle,
            montant_ht: Number(frais.montant_ht),
            taux_tva: Number(frais.taux_tva),
            montant_ttc: Number(frais.montant_ttc),
            associe_payeur: frais.associe_payeur,
            statut_reprise: frais.statut_reprise,
          },
          {
            date_engagement: dateEng,
            fournisseur: fournisseur.trim(),
            libelle: libelle.trim() || null,
            montant_ht: m.ht,
            taux_tva: taux,
            montant_ttc: m.ttc,
            associe_payeur: payeur,
            statut_reprise: statut,
          },
          frais.fournisseur
        ),
      });
      fermer();
      router.refresh();
    }
    setEnCours(false);
  }

  const groupes = Array.from(new Set(categories.map((c) => c.groupe)));

  return (
    <tr style={{ borderBottom: '2px solid var(--gold)', background: 'var(--g-50)' }}>
      <td colSpan={8} style={{ padding: '.9rem .4rem' }}>
        {/* Dans la cellule : un paragraphe placé entre deux lignes de
            tableau serait sorti du tableau par le navigateur. */}
        {erreur && (
          <p style={{
            fontSize: 'var(--fs-xs)', color: 'var(--danger)',
            marginBottom: '.6rem',
          }}>
            {erreur}
          </p>
        )}
        <div className={styles.grilleEdition}>
          <label><span>Date</span>
            <input type="date" value={dateEng} onChange={(e) => setDateEng(e.target.value)} /></label>
          <label><span>Fournisseur</span>
            <input type="text" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} /></label>
          <label><span>Description</span>
            <input type="text" value={libelle} onChange={(e) => setLibelle(e.target.value)} /></label>
          <label><span>Catégorie</span>
            <select value={categorieId} onChange={(e) => setCategorieId(e.target.value)}>
              <option value="">—</option>
              {groupes.map((g) => (
                <optgroup key={g} label={g}>
                  {categories.filter((c) => c.groupe === g).map((c) => (
                    <option key={c.id} value={c.id}>{c.libelle}</option>
                  ))}
                </optgroup>
              ))}
            </select></label>
          <label><span>Montant TTC</span>
            <input type="text" inputMode="decimal" value={ttc} onChange={(e) => setTtc(e.target.value)} /></label>
          <label><span>TVA</span>
            <select value={taux} onChange={(e) => setTaux(Number(e.target.value))}>
              <option value={20}>20 %</option>
              <option value={10}>10 %</option>
              <option value={5.5}>5,5 %</option>
              <option value={0}>0 % — pas de TVA française</option>
            </select></label>
          <label><span>Avancé par</span>
            <select value={payeur} onChange={(e) => setPayeur(e.target.value as 'mahdi' | 'sabir')}>
              <option value="mahdi">Mahdi Mohamadi</option>
              <option value="sabir">Sabir Mohamed Ahmed</option>
            </select></label>
          <label><span>Statut</span>
            <select value={statut} onChange={(e) => setStatut(e.target.value as FraisCreation['statut_reprise'])}>
              <option value="a_valider">À ratifier</option>
              <option value="repris">Repris</option>
              <option value="rejete">Écarté</option>
            </select></label>
        </div>
        <div style={{ display: 'flex', gap: '.6rem', marginTop: '.8rem' }}>
          <button onClick={enregistrer} disabled={enCours} className="btn btn--gold"
            style={{ minHeight: 34, padding: '.3rem .9rem', fontSize: 'var(--fs-xs)' }}>
            {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button onClick={fermer} className="btn btn--ghost"
            style={{ minHeight: 34, padding: '.3rem .9rem', fontSize: 'var(--fs-xs)' }}>
            Annuler
          </button>
        </div>
      </td>
    </tr>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)',
  fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.6rem .4rem', verticalAlign: 'top' };
const thRecap: React.CSSProperties = { textAlign: 'left', padding: '.5rem .3rem', fontWeight: 600 };
const tdRecap: React.CSSProperties = { padding: '.5rem .3rem', verticalAlign: 'top' };
