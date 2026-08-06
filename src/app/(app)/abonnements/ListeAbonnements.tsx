'use client';

/**
 * ABONNEMENTS
 *
 * Les charges récurrentes échappent au suivi parce qu'elles sont petites
 * et automatiques. Trois pertes en découlent : la TVA non récupérée faute
 * de justificatif, la reconduction tacite découverte trop tard, et un coût
 * total que personne ne connaît.
 *
 * Le module ne crée jamais d'écriture comptable seul : il pré-remplit,
 * vous validez. Une écriture générée sans regard humain est une écriture
 * que personne n'a vérifiée — et elle entre dans les déclarations.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money, date, dateLong, daysUntil } from '@/lib/format';
import { depuisHT, depuisTTC } from '@/lib/comptabilite';
import Dialogue from '@/components/Dialogue';
import Alerte from '@/components/Alerte';
import {
  LIBELLE_PERIODICITE, LIBELLE_STATUT_ABO, CLASSE_STATUT_ABO,
  LIBELLE_STATUT_ECHEANCE, CLASSE_STATUT_ECHEANCE, LIBELLE_PAYS,
  coutAnnuel,
  type Abonnement, type Echeance, type Categorie,
} from '@/lib/types';
import styles from './abonnements.module.css';

type Couts = {
  actifs: number; gratuits: number; resilies: number;
  cout_mensuel_ttc: number; cout_annuel_ttc: number; tva_annuelle: number;
} | null;

type Props = {
  abonnements: Abonnement[];
  echeances: Echeance[];
  couts: Couts;
  categories: Categorie[];
  utilisateurId: string;
  peutGerer: boolean;
};

export default function ListeAbonnements({
  abonnements, echeances, couts, categories, utilisateurId, peutGerer,
}: Props) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [aResilier, setAResilier] = useState<Abonnement | null>(null);
  const [aPasserPayant, setAPasserPayant] = useState<Abonnement | null>(null);

  // --- formulaire de création ---
  const [nom, setNom] = useState('');
  const [fournisseur, setFournisseur] = useState('');
  const [categorieId, setCategorieId] = useState('');
  const [saisieEn, setSaisieEn] = useState<'ht' | 'ttc'>('ttc');
  const [montant, setMontant] = useState('');
  const [tauxTva, setTauxTva] = useState(20);
  const [autoliq, setAutoliq] = useState(false);
  const [pays, setPays] = useState('FR');
  const [periodicite, setPeriodicite] = useState('mensuel');
  const [dateDebut, setDateDebut] = useState(new Date().toISOString().slice(0, 10));
  const [engagement, setEngagement] = useState('');
  const [preavis, setPreavis] = useState('30');
  const [gratuit, setGratuit] = useState(false);

  const actifs = abonnements.filter((a) => a.statut === 'actif');
  const gratuits = abonnements.filter((a) => a.statut === 'gratuit');
  const resilies = abonnements.filter((a) => a.statut === 'resilie');

  const manquants = echeances.filter((e) => e.statut === 'justificatif_manquant');
  const prochaines = echeances
    .filter((e) => e.statut === 'attendue' && daysUntil(e.date_prevue) >= 0)
    .slice(0, 12);

  // Reconductions tacites approchant : c'est l'alerte qui rentabilise le module.
  const reconductions = actifs.filter((a) => {
    if (!a.engagement_jusquau) return false;
    const j = daysUntil(a.engagement_jusquau);
    return j >= 0 && j <= 60;
  });

  const montants = useMemo(() => {
    const v = parseFloat(montant.replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) return null;
    return saisieEn === 'ht' ? depuisHT(v, tauxTva) : depuisTTC(v, tauxTva);
  }, [montant, tauxTva, saisieEn]);

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!nom.trim() || !fournisseur.trim()) return;
    if (!gratuit && !montants) { setErreur('Montant invalide.'); return; }

    setEnCours(true);
    const supabase = createClient();

    const { data, error } = await supabase.from('abonnements').insert({
      nom: nom.trim(),
      fournisseur: fournisseur.trim(),
      categorie_id: categorieId || null,
      montant_ht: gratuit ? 0 : montants!.ht,
      taux_tva: gratuit ? 0 : tauxTva,
      montant_tva: gratuit ? 0 : montants!.tva,
      montant_ttc: gratuit ? 0 : montants!.ttc,
      autoliquidation: autoliq,
      pays_prestataire: pays,
      periodicite,
      date_debut: dateDebut,
      engagement_jusquau: engagement || null,
      preavis_jours: parseInt(preavis, 10) || 30,
      statut: gratuit ? 'gratuit' : 'actif',
      cree_par: utilisateurId,
    }).select('id, numero_piece').single();

    if (error) {
      setErreur(`Création impossible : ${error.message}`);
      setEnCours(false);
      return;
    }

    await supabase.rpc('generer_echeances', { p_abonnement: data?.id });
    await supabase.rpc('journaliser', {
      p_action: 'creation', p_table: 'abonnements', p_id: data?.id ?? null,
      p_details: {
        resume: `${data?.numero_piece ?? ''} · ${nom.trim()} — ${fournisseur.trim()}`,
        montant_ttc: gratuit ? 0 : montants!.ttc,
        periodicite,
      },
    });

    setNom(''); setFournisseur(''); setCategorieId(''); setMontant('');
    setEngagement(''); setGratuit(false); setOuvert(false);
    setSucces('Abonnement enregistré.');
    setEnCours(false);
    router.refresh();
  }

  async function resilier(a: Abonnement, motif: string, dateEffet: string) {
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    const { data, error } = await supabase.rpc('resilier_abonnement', {
      p_id: a.id, p_date_effet: dateEffet, p_motif: motif || null,
    });

    if (error) { setErreur(`Résiliation impossible : ${error.message}`); setEnCours(false); return; }

    await supabase.rpc('journaliser', {
      p_action: 'modification', p_table: 'abonnements', p_id: a.id,
      p_details: {
        resume: `${a.numero_piece ?? ''} · ${a.nom} résilié`,
        date_effet: dateEffet, motif: motif || null,
        echeances_supprimees: data,
      },
    });

    setSucces(`Abonnement résilié. ${data ?? 0} échéance(s) future(s) retirée(s).`);
    setEnCours(false);
    router.refresh();
  }

  /**
   * Constatation d'une échéance : crée la dépense correspondante.
   * Pré-remplie intégralement, mais déclenchée par un clic — l'application
   * propose, elle ne décide pas.
   */
  async function constater(e: Echeance, abo: Abonnement) {
    // Une charge se constate quand elle est engagée, jamais avant.
    // Enregistrer un prélèvement à venir gonflerait les charges de
    // l'exercice avec des montants qui n'ont pas été payés.
    if (daysUntil(e.date_prevue) > 0) {
      setErreur(
        `L'échéance du ${date(e.date_prevue)} n'est pas encore due. ` +
        "Une charge se constate à sa date, pas avant."
      );
      return;
    }

    setEnCours(true);
    setErreur(null);
    const supabase = createClient();

    const { data: dep, error } = await supabase.from('depenses').insert({
      date_depense: e.date_prevue,
      fournisseur: abo.fournisseur,
      libelle: `${abo.nom} — ${e.periode}`,
      categorie_id: abo.categorie_id,
      montant_ht: abo.montant_ht,
      taux_tva: abo.taux_tva,
      montant_tva: abo.montant_tva,
      montant_ttc: abo.montant_ttc,
      taux_deductibilite: 100,
      compte: '6226',
      tva_deductible: abo.montant_tva,
      moyen_paiement: abo.mode_paiement ?? 'carte',
      paye_par: 'societe',
      statut: 'validee',
      cree_par: utilisateurId,
      valide_par: utilisateurId,
      valide_le: new Date().toISOString(),
      notes: abo.autoliquidation
        ? 'TVA autoliquidée : déclarer en collectée et en déductible.'
        : null,
    }).select('id, numero_piece').single();

    if (error) { setErreur(`Constatation impossible : ${error.message}`); setEnCours(false); return; }

    await supabase.from('abonnement_echeances').update({
      statut: 'payee',
      date_constatee: new Date().toISOString().slice(0, 10),
      montant_reel: abo.montant_ttc,
      depense_id: dep?.id,
    }).eq('id', e.id);

    await supabase.rpc('journaliser', {
      p_action: 'creation', p_table: 'depenses', p_id: dep?.id ?? null,
      p_details: {
        resume: `${dep?.numero_piece ?? ''} · ${abo.nom} ${e.periode} constaté`,
        abonnement: abo.numero_piece,
        montant_ttc: abo.montant_ttc,
      },
    });

    setSucces(`Dépense ${dep?.numero_piece ?? ''} créée. Pensez à joindre le justificatif.`);
    setEnCours(false);
    router.refresh();
  }

  const groupes = Array.from(new Set(categories.map((c) => c.groupe)));

  return (
    <>
      {/* ---------- Coûts ---------- */}
      <div className="grid-cards" style={{ marginBottom: '1.25rem' }}>
        <div className="card">
          <p className="card__title">Coût mensuel</p>
          <p className="amount" style={{ fontSize: '1.4rem', fontFamily: 'var(--display)', fontWeight: 600 }}>
            {money(Number(couts?.cout_mensuel_ttc ?? 0))}
          </p>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>
            Toutes périodicités ramenées au mois
          </p>
        </div>
        <div className="card" style={{ borderLeft: '3px solid var(--gold)' }}>
          <p className="card__title">Coût annualisé</p>
          <p className="amount" style={{ fontSize: '1.4rem', fontFamily: 'var(--display)', fontWeight: 600 }}>
            {money(Number(couts?.cout_annuel_ttc ?? 0))}
          </p>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem' }}>
            {couts?.actifs ?? 0} actif{(couts?.actifs ?? 0) > 1 ? 's' : ''} · {couts?.gratuits ?? 0} gratuit{(couts?.gratuits ?? 0) > 1 ? 's' : ''}
          </p>
        </div>
        <div className="card">
          <p className="card__title">TVA récupérable / an</p>
          <p className="amount" style={{ fontSize: '1.4rem', fontFamily: 'var(--display)', fontWeight: 600 }}>
            {money(Number(couts?.tva_annuelle ?? 0))}
          </p>
        </div>
        <div className="card" style={{ borderLeft: manquants.length ? '3px solid var(--danger)' : undefined }}>
          <p className="card__title">Justificatifs manquants</p>
          <p className="amount" style={{
            fontSize: '1.4rem', fontFamily: 'var(--display)', fontWeight: 600,
            color: manquants.length ? 'var(--danger)' : undefined,
          }}>
            {manquants.length}
          </p>
        </div>
      </div>

      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      {/* ---------- Reconductions tacites ---------- */}
      {reconductions.length > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--warning)' }}>
          <p className="card__title" style={{ color: 'var(--warning)' }}>
            Reconduction tacite approchant
          </p>
          {reconductions.map((a) => {
            const j = daysUntil(a.engagement_jusquau!);
            const limite = j - (a.preavis_jours ?? 30);
            return (
              <p key={a.id} style={{ fontSize: 'var(--fs-sm)', marginTop: '.5rem', lineHeight: 1.55 }}>
                <strong>{a.nom}</strong> — engagement jusqu'au {dateLong(a.engagement_jusquau!)},
                soit dans {j} jours. Préavis de {a.preavis_jours ?? 30} jours :
                {limite > 0
                  ? ` il vous reste ${limite} jours pour résilier.`
                  : ' le délai de préavis est dépassé, la reconduction est acquise.'}
              </p>
            );
          })}
        </div>
      )}

      {/* ---------- Justificatifs manquants ---------- */}
      {manquants.length > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--danger)' }}>
          <p className="card__title" style={{ color: 'var(--danger)' }}>
            {manquants.length} justificatif{manquants.length > 1 ? 's' : ''} manquant{manquants.length > 1 ? 's' : ''}
          </p>
          <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginBottom: '.8rem', maxWidth: '64ch' }}>
            Sans facture, la charge n'est pas déductible et la TVA n'est pas
            récupérable. Récupérez la pièce chez le fournisseur, puis constatez
            l'échéance.
          </p>
          <Tableau
            echeances={manquants}
            abonnements={abonnements}
            peutGerer={peutGerer}
            enCours={enCours}
            onConstater={constater}
          />
        </div>
      )}

      {/* ---------- Création ---------- */}
      {peutGerer && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div className={styles.barre}>
            <p className="card__title">Enregistrer un abonnement</p>
            <button onClick={() => setOuvert(!ouvert)} className="btn btn--gold">
              {ouvert ? 'Annuler' : '+ Nouvel abonnement'}
            </button>
          </div>

          {ouvert && (
            <form onSubmit={creer} className={styles.formulaire}>
              <label><span>Nom *</span>
                <input type="text" value={nom} onChange={(e) => setNom(e.target.value)}
                  required placeholder="Claude — Max plan" autoFocus /></label>
              <label><span>Fournisseur *</span>
                <input type="text" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)}
                  required placeholder="Anthropic" /></label>
              <label className={styles.pleine}><span>Catégorie</span>
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

              <label className={styles.pleine}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '.5rem', textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--body)', fontWeight: 400, fontSize: 'var(--fs-sm)', color: 'var(--ink)' }}>
                  <input type="checkbox" checked={gratuit}
                    onChange={(e) => setGratuit(e.target.checked)}
                    style={{ width: 'auto', minHeight: 0 }} />
                  Outil gratuit — suivi sans coût, aucune échéance générée
                </span>
              </label>

              {!gratuit && (
                <>
                  <div className={`${styles.bascule} ${styles.pleine}`}>
                    <button type="button" onClick={() => setSaisieEn('ttc')}
                      className={saisieEn === 'ttc' ? styles.basculeActif : ''}>Je saisis le TTC</button>
                    <button type="button" onClick={() => setSaisieEn('ht')}
                      className={saisieEn === 'ht' ? styles.basculeActif : ''}>Je saisis le HT</button>
                  </div>

                  <label><span>Montant {saisieEn.toUpperCase()} *</span>
                    <input type="text" inputMode="decimal" value={montant}
                      onChange={(e) => setMontant(e.target.value)} required placeholder="108,00" /></label>
                  <label><span>Taux de TVA</span>
                    <select value={tauxTva} onChange={(e) => setTauxTva(Number(e.target.value))}>
                      <option value={20}>20 %</option>
                      <option value={10}>10 %</option>
                      <option value={5.5}>5,5 %</option>
                      <option value={0}>0 % — sans TVA</option>
                    </select></label>
                </>
              )}

              <label><span>Périodicité</span>
                <select value={periodicite} onChange={(e) => setPeriodicite(e.target.value)}>
                  <option value="mensuel">Mensuelle</option>
                  <option value="trimestriel">Trimestrielle</option>
                  <option value="annuel">Annuelle</option>
                </select></label>
              <label><span>Date de début *</span>
                <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} required /></label>

              <label><span>Pays du prestataire</span>
                <select value={pays} onChange={(e) => setPays(e.target.value)}>
                  <option value="FR">France</option>
                  <option value="UE">Union européenne</option>
                  <option value="HORS_UE">Hors Union européenne</option>
                </select></label>
              <label>
                <span style={{ display: 'flex', alignItems: 'center', gap: '.5rem', textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--body)', fontWeight: 400, fontSize: 'var(--fs-sm)', color: 'var(--ink)' }}>
                  <input type="checkbox" checked={autoliq}
                    onChange={(e) => setAutoliq(e.target.checked)}
                    style={{ width: 'auto', minHeight: 0 }} />
                  TVA autoliquidée
                </span>
              </label>

              <label><span>Engagement jusqu'au</span>
                <input type="date" value={engagement} onChange={(e) => setEngagement(e.target.value)} /></label>
              <label><span>Préavis (jours)</span>
                <input type="number" value={preavis} onChange={(e) => setPreavis(e.target.value)} min="0" /></label>

              {pays !== 'FR' && !autoliq && (
                <p className={`${styles.avertissement} ${styles.pleine}`}>
                  Prestataire étranger sans autoliquidation : vérifiez que la
                  facture porte bien de la TVA française. Certains prestataires
                  l'appliquent via le guichet unique, d'autres non — dans ce
                  second cas, cochez « TVA autoliquidée ».
                </p>
              )}

              {montants && !gratuit && (
                <div className={`${styles.recap} ${styles.pleine}`}>
                  <div><span>HT</span><strong className="amount">{money(montants.ht)}</strong></div>
                  <div><span>TVA</span><strong className="amount">{money(montants.tva)}</strong></div>
                  <div><span>TTC</span><strong className="amount">{money(montants.ttc)}</strong></div>
                  <div className={styles.recapAnnuel}>
                    <span>Coût annualisé</span>
                    <strong className="amount">{money(coutAnnuel(montants.ttc, periodicite))}</strong>
                  </div>
                </div>
              )}

              <div className={styles.pleine}>
                <button type="submit" className="btn btn--gold" disabled={enCours}>
                  {enCours ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ---------- Abonnements actifs ---------- */}
      <Bloc titre="Abonnements actifs" abonnements={actifs} peutGerer={peutGerer}
        onResilier={setAResilier} echeances={echeances} />

      {gratuits.length > 0 && (
        <Bloc
          titre="Outils gratuits"
          soustitre="Suivis sans coût. Un prélèvement inattendu signalera un passage au payant."
          abonnements={gratuits} peutGerer={peutGerer}
          onPasserPayant={setAPasserPayant} echeances={echeances} />
      )}

      {resilies.length > 0 && (
        <Bloc titre="Résiliés" abonnements={resilies} peutGerer={false} echeances={echeances} />
      )}

      {/* ---------- Calendrier ---------- */}
      {prochaines.length > 0 && (
        <div className="card">
          <p className="card__title">Prochaines échéances</p>
          <Tableau echeances={prochaines} abonnements={abonnements}
            peutGerer={peutGerer} enCours={enCours} onConstater={constater} />
        </div>
      )}

      {/* ---------- Dialogues ---------- */}
      <Dialogue
        ouvert={aResilier !== null}
        titre={`Résilier ${aResilier?.nom ?? ''}`}
        description={
          "Les échéances futures encore attendues seront retirées. Celles " +
          "déjà constatées demeurent : une charge payée reste une charge. " +
          "La résiliation prend effet aujourd'hui."
        }
        champ="Motif (facultatif)"
        placeholder="Outil remplacé, plus utilisé…"
        libelleValider="Résilier"
        danger
        onValider={(motif) => {
          const a = aResilier;
          setAResilier(null);
          if (a) resilier(a, motif, new Date().toISOString().slice(0, 10));
        }}
        onAnnuler={() => setAResilier(null)}
      />

      <Dialogue
        ouvert={aPasserPayant !== null}
        titre={`Passer ${aPasserPayant?.nom ?? ''} au payant`}
        description={
          "Saisissez le montant TTC du nouveau plan. Les échéances seront " +
          "générées à partir d'aujourd'hui ; l'historique gratuit reste " +
          "inchangé."
        }
        champ="Montant TTC mensuel"
        placeholder="25,00"
        obligatoire
        libelleValider="Activer"
        onValider={async (valeur) => {
          const a = aPasserPayant;
          setAPasserPayant(null);
          if (!a) return;
          const v = parseFloat(valeur.replace(',', '.'));
          if (!Number.isFinite(v) || v <= 0) { setErreur('Montant invalide.'); return; }

          setEnCours(true);
          const m = depuisTTC(v, 20);
          const supabase = createClient();
          const { error } = await supabase.from('abonnements').update({
            montant_ht: m.ht, taux_tva: 20, montant_tva: m.tva, montant_ttc: m.ttc,
            statut: 'actif', date_debut: new Date().toISOString().slice(0, 10),
            modifie_le: new Date().toISOString(),
          }).eq('id', a.id);

          if (error) { setErreur(`Modification impossible : ${error.message}`); setEnCours(false); return; }

          await supabase.rpc('generer_echeances', { p_abonnement: a.id });
          await supabase.rpc('journaliser', {
            p_action: 'modification', p_table: 'abonnements', p_id: a.id,
            p_details: { resume: `${a.nom} passé au payant`, montant_ttc: m.ttc },
          });
          setSucces(`${a.nom} est désormais payant : ${money(m.ttc)} TTC par mois.`);
          setEnCours(false);
          router.refresh();
        }}
        onAnnuler={() => setAPasserPayant(null)}
      />
    </>
  );
}

function Bloc({
  titre, soustitre, abonnements, peutGerer, onResilier, onPasserPayant, echeances,
}: {
  titre: string; soustitre?: string; abonnements: Abonnement[];
  peutGerer: boolean; echeances: Echeance[];
  onResilier?: (a: Abonnement) => void;
  onPasserPayant?: (a: Abonnement) => void;
}) {
  if (abonnements.length === 0) {
    return (
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card__title">{titre}</p>
        <div className="etat-vide">
          <p>Aucun abonnement enregistré.</p>
          <p className="muted">
            Enregistrez vos charges récurrentes pour connaître leur coût réel
            et ne plus rater une facture.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: '1.25rem' }}>
      <p className="card__title">{titre}</p>
      {soustitre && (
        <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginBottom: '.9rem' }}>{soustitre}</p>
      )}

      <div className="table-scroll">
        <table style={{ minWidth: 700, fontSize: 'var(--fs-sm)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
              <th style={th}>Pièce</th>
              <th style={th}>Abonnement</th>
              <th style={th} className="col-secondaire">Catégorie</th>
              <th style={{ ...th, textAlign: 'right' }}>Montant</th>
              <th style={{ ...th, textAlign: 'right' }} className="col-secondaire">Par an</th>
              <th style={{ ...th, textAlign: 'right' }}>Prochaine</th>
              <th style={{ ...th, textAlign: 'right' }}>Statut</th>
              {peutGerer && <th style={{ ...th, textAlign: 'right' }}></th>}
            </tr>
          </thead>
          <tbody>
            {abonnements.map((a) => {
              const suivante = echeances
                .filter((e) => e.abonnement_id === a.id && e.statut === 'attendue')
                .sort((x, y) => x.date_prevue.localeCompare(y.date_prevue))[0];

              return (
                <tr key={a.id} style={{
                  borderBottom: '1px solid var(--g-200)',
                  opacity: a.statut === 'resilie' ? 0.5 : 1,
                }}>
                  <td style={td} className="mono">
                    <span style={{ fontSize: '.72rem', color: 'var(--g-600)' }}>
                      {a.numero_piece ?? '—'}
                    </span>
                  </td>
                  <td style={{ ...td, fontWeight: 500 }}>
                    {a.nom}
                    <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                      {a.fournisseur}
                      {a.autoliquidation && ' · TVA autoliquidée'}
                      {a.pays_prestataire !== 'FR' && ` · ${LIBELLE_PAYS[a.pays_prestataire]}`}
                    </span>
                  </td>
                  <td style={td} className="col-secondaire muted">
                    {a.categories?.libelle ?? '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }} className="amount">
                    {a.montant_ttc > 0 ? money(Number(a.montant_ttc)) : '—'}
                    <span className="muted" style={{ display: 'block', fontSize: '.68rem' }}>
                      {LIBELLE_PERIODICITE[a.periodicite]}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }} className="amount col-secondaire">
                    {a.montant_ttc > 0
                      ? money(coutAnnuel(Number(a.montant_ttc), a.periodicite))
                      : '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {suivante ? date(suivante.date_prevue) : '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <span className={`badge ${CLASSE_STATUT_ABO[a.statut]}`}>
                      {LIBELLE_STATUT_ABO[a.statut]}
                    </span>
                  </td>
                  {peutGerer && (
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {a.statut === 'gratuit' && onPasserPayant && (
                        <button onClick={() => onPasserPayant(a)} className="btn btn--ghost"
                          style={{ minHeight: 28, padding: '.15rem .6rem', fontSize: '.7rem' }}>
                          Passer au payant
                        </button>
                      )}
                      {a.statut === 'actif' && onResilier && (
                        <button onClick={() => onResilier(a)} className="btn btn--ghost"
                          style={{ minHeight: 28, padding: '.15rem .6rem', fontSize: '.7rem', color: 'var(--danger)' }}>
                          Résilier
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tableau({
  echeances, abonnements, peutGerer, enCours, onConstater,
}: {
  echeances: Echeance[]; abonnements: Abonnement[];
  peutGerer: boolean; enCours: boolean;
  onConstater: (e: Echeance, a: Abonnement) => void;
}) {
  return (
    <div className="table-scroll">
      <table style={{ minWidth: 560, fontSize: 'var(--fs-sm)' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
            <th style={th}>Période</th>
            <th style={th}>Abonnement</th>
            <th style={{ ...th, textAlign: 'right' }}>Date prévue</th>
            <th style={{ ...th, textAlign: 'right' }}>Montant</th>
            <th style={{ ...th, textAlign: 'right' }}>Statut</th>
            {peutGerer && <th style={{ ...th, textAlign: 'right' }}></th>}
          </tr>
        </thead>
        <tbody>
          {echeances.map((e) => {
            const abo = abonnements.find((a) => a.id === e.abonnement_id);
            const j = daysUntil(e.date_prevue);
            return (
              <tr key={e.id} style={{ borderBottom: '1px solid var(--g-200)' }}>
                <td style={td} className="mono">{e.periode}</td>
                <td style={{ ...td, fontWeight: 500 }}>
                  {e.abonnements?.nom ?? abo?.nom ?? '—'}
                  <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                    {e.abonnements?.fournisseur ?? abo?.fournisseur}
                  </span>
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {date(e.date_prevue)}
                  {j >= 0 && j <= 30 && (
                    <span className="muted" style={{ display: 'block', fontSize: '.68rem' }}>
                      J-{j}
                    </span>
                  )}
                </td>
                <td style={{ ...td, textAlign: 'right' }} className="amount">
                  {money(Number(e.montant_prevu))}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <span className={`badge ${CLASSE_STATUT_ECHEANCE[e.statut]}`}>
                    {LIBELLE_STATUT_ECHEANCE[e.statut]}
                  </span>
                </td>
                {peutGerer && (
                  <td style={{ ...td, textAlign: 'right' }}>
                    {e.statut !== 'payee' && abo && (
                      j <= 0 ? (
                        <button onClick={() => onConstater(e, abo)} disabled={enCours}
                          className="btn btn--ghost"
                          style={{ minHeight: 28, padding: '.15rem .6rem', fontSize: '.7rem' }}>
                          Constater
                        </button>
                      ) : (
                        <span className="muted" style={{ fontSize: '.68rem' }}>
                          à venir
                        </span>
                      )
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)',
  fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.6rem .4rem', verticalAlign: 'top' };
