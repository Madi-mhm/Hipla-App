import Link from 'next/link';
import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { aujourdhuiIso } from '@/lib/dates';
import { date } from '@/lib/format';
import {
  preparerLiasse, dureeEnMois, type Fiscal, type Ligne, type LigneActif, type SoldeCompte,
} from '@/lib/liasse';
import Ca12, { type DeclarationTva } from './Ca12';
import Imprimer from './Imprimer';
import s from './liasse.module.css';

export const metadata = { title: 'Liasse — Hipla Compta' };
export const dynamic = 'force-dynamic';

/**
 * LIASSE — CE QU'IL FAUT RECOPIER
 *
 * Bilan (2033-A), compte de résultat et résultat fiscal (2033-B),
 * déficits (2033-D), valeur ajoutée (2033-E), capital (2033-F), impôt
 * sur les sociétés (2065, 2572) et TVA annuelle (CA12E), case par case,
 * à partir du journal. Numéros de case : millésime 2025 des formulaires
 * 2033 ; l'intitulé est donné avec chaque case, pour s'y retrouver si un
 * millésime ultérieur les renumérote.
 */

const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const eur = (n: number) => (n === 0 ? '—' : (n < 0 ? '−' : '') + nombre.format(Math.abs(n)));

type Exercice = {
  id: string; date_debut: string; date_fin: string; regime_tva: string | null; statut: string;
};
type Associe = {
  nom: string; prenom: string; parts: number | null; date_naissance: string | null;
  lieu_naissance: string | null; adresse: string | null; code_postal: string | null;
  ville: string | null;
};

export default async function Page(
  { searchParams }: { searchParams: Promise<{ exercice?: string }> },
) {
  const { exercice: choisi } = await searchParams;
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'exports', 'read')) redirect('/');

  const supabase = await createClient();
  const aujourdhui = aujourdhuiIso();

  const [{ data: exs }, { data: ent }, { data: ass }] = await Promise.all([
    supabase.from('exercices').select('id, date_debut, date_fin, regime_tva, statut').order('date_debut'),
    supabase.from('entreprise')
      .select('raison_sociale, forme_juridique, siret, adresse, code_postal, ville').maybeSingle(),
    supabase.from('associes')
      .select('nom, prenom, parts, date_naissance, lieu_naissance, adresse, code_postal, ville')
      .eq('actif', true).order('nom'),
  ]);

  const exercices = (exs ?? []) as Exercice[];
  const exercice = exercices.find((e) => e.id === choisi)
    ?? exercices.find((e) => e.statut !== 'clos' && e.date_debut <= aujourdhui)
    ?? exercices[exercices.length - 1];

  if (!exercice) {
    return (
      <>
        <Header section="comptabilite" titre="Comptabilité" sousTitre="Liasse" />
        <div className="content"><div className="card"><p>Aucun exercice déclaré.</p></div></div>
      </>
    );
  }

  const [{ data: etats, error }, { data: decl }] = await Promise.all([
    supabase.rpc('etats_financiers', { p_exercice: exercice.id }),
    supabase.rpc('declaration_tva', { p_debut: exercice.date_debut, p_fin: exercice.date_fin }),
  ]);

  if (error || !etats) {
    return (
      <>
        <Header section="comptabilite" titre="Comptabilité" sousTitre="Liasse" />
        <div className="content">
          <div className="card"><p>États indisponibles : {error?.message ?? 'aucune donnée'}.</p></div>
        </div>
      </>
    );
  }

  const ef = etats as { comptes: SoldeCompte[]; fiscal: Fiscal };
  const comptes = ef.comptes.map((c) => ({ ...c, debit: Number(c.debit), credit: Number(c.credit) }));
  const l = preparerLiasse(comptes, ef.fiscal);
  const d = decl as DeclarationTva | null;

  // ---- 2033-E : valeur ajoutée, lue sur les comptes ----
  const solde = (...p: string[]) => comptes
    .filter((c) => p.some((x) => c.compte.startsWith(x)))
    .reduce((t, c) => t + c.debit - c.credit, 0);
  const ve = {
    ca: Math.round(-solde('70')),
    autres: Math.round(-solde('75')),
    subventions: Math.round(-solde('74')),
    achats: Math.round(solde('60') - solde('603')),
    services: Math.round(solde('61', '62') - solde('612', '613')),
    loyers: Math.round(solde('613')),
    gestion: Math.round(solde('65')),
  };
  const total1 = ve.ca;
  const total2 = ve.autres + ve.subventions;
  const total3 = ve.achats + ve.services + ve.loyers + ve.gestion;

  // ---- 2033-D : déficits reportables ----
  const f = ef.fiscal;
  const d982 = Math.round(Number(f.deficits_anterieurs));
  const d983 = Math.round(Number(f.deficit_impute));
  const d860 = Number(f.resultat_fiscal) < 0 ? Math.round(-Number(f.resultat_fiscal)) : 0;

  const associes = (ass ?? []) as Associe[];
  const parts = associes.reduce((t, a) => t + Number(a.parts ?? 0), 0);
  const e = ent as { raison_sociale: string; forme_juridique: string; siret: string;
    adresse: string; code_postal: string; ville: string } | null;

  const enCours = exercice.date_fin >= aujourdhui;
  const aCloturer = !enCours && exercice.statut !== 'clos';
  const ecart = l.controles.ecartBilan;

  return (
    <>
      <Header section="comptabilite" titre="Comptabilité"
        sousTitre={`Liasse — exercice du ${date(exercice.date_debut)} au ${date(exercice.date_fin)}`} />
      <div className="content">
        <div className="sans-impression" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          {exercices.map((x) => (
            <Link key={x.id} href={`/comptabilite/liasse?exercice=${x.id}`}
              className={`btn btn--sm ${x.id === exercice.id ? 'btn--primary' : 'btn--ghost'}`}>
              {x.date_debut.slice(0, 4)}–{x.date_fin.slice(0, 4)}{x.statut === 'clos' ? ' · clos' : ''}
            </Link>
          ))}
          <span style={{ flex: 1 }} />
          <Imprimer />
        </div>

        {(enCours || aCloturer) && (
          <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--warning)' }}>
            <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55 }}>
              {enCours
                ? <>Situation provisoire au {date(aujourdhui)} : l&apos;exercice se termine le {date(exercice.date_fin)}.
                    Les montants à déclarer se lisent une fois l&apos;exercice terminé et clos.</>
                : <>Exercice terminé mais pas encore clos : passez d&apos;abord les écritures de fin
                    d&apos;exercice et l&apos;impôt (<Link href={`/comptabilite/cloture?exercice=${exercice.id}`}>Comptabilité → Clôture</Link>).</>}
            </p>
          </div>
        )}

        {(l.nonRanges.length > 0 || Math.abs(ecart) > 0) && (
          <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--danger)' }}>
            {l.nonRanges.length > 0 && (
              <p style={{ fontSize: 'var(--fs-sm)' }}>
                Comptes que la liasse ne sait pas ranger : {l.nonRanges.map((c) => `${c.compte} (${c.libelle})`).join(', ')}.
                Ils manquent au bilan ou au compte de résultat : à signaler avant de déclarer.
              </p>
            )}
            {Math.abs(ecart) > 0 && (
              <p style={{ fontSize: 'var(--fs-sm)', marginTop: '.4rem' }}>
                Actif et passif diffèrent de {eur(ecart)} €, au-delà des arrondis (absorbés
                d&apos;office) : un compte n&apos;est pas rangé ou le journal est déséquilibré. À corriger
                avant de déclarer.
              </p>
            )}
          </div>
        )}

        {/* ---- Identification ---- */}
        <section className={`card ${s.formulaire}`}>
          <div className={s.entete}>
            <p className="card__title" style={{ margin: 0 }}>Identification</p>
            <span className={s.numero}>En-têtes 2065 et 2033</span>
          </div>
          <table className={s.table}>
            <tbody>
              <tr><td>Désignation</td><td>{e?.raison_sociale} ({e?.forme_juridique})</td></tr>
              <tr><td>SIRET</td><td className="mono">{e?.siret}</td></tr>
              <tr><td>Adresse</td><td>{e?.adresse}, {e?.code_postal} {e?.ville}</td></tr>
              <tr><td>Exercice ouvert le / clos le</td><td>{date(exercice.date_debut)} — {date(exercice.date_fin)}</td></tr>
              <tr><td>Durée de l&apos;exercice en nombre de mois</td><td>{dureeEnMois(exercice.date_debut, exercice.date_fin)}</td></tr>
              <tr><td>Régime</td><td>Régime simplifié d&apos;imposition (2065 : case « Régime simplifié »)</td></tr>
              <tr><td>Comptabilité informatisée (2065, cadre F)</td><td>Oui — Hipla Compta, application interne</td></tr>
            </tbody>
          </table>
        </section>

        {/* ---- 2033-A ---- */}
        <section className={`card ${s.formulaire}`}>
          <div className={s.entete}>
            <p className="card__title" style={{ margin: 0 }}>Bilan simplifié — actif</p>
            <span className={s.numero}>2033-A</span>
          </div>
          <Actif lignes={l.actif} />
        </section>

        <section className={`card ${s.formulaire}`}>
          <div className={s.entete}>
            <p className="card__title" style={{ margin: 0 }}>Bilan simplifié — passif</p>
            <span className={s.numero}>2033-A</span>
          </div>
          <Cases lignes={[...l.passif, ...l.renvois]} />
          <p className={s.note}>
            Les comptes de TVA (445) sont compensés comme après la déclaration annuelle : un solde
            débiteur est un crédit de TVA (case 072), un solde créditeur une dette (172, dont 169).
            La TVA des ventes non encaissées (44574) reste une dette.
          </p>
        </section>

        {/* ---- 2033-B ---- */}
        <section className={`card ${s.formulaire}`}>
          <div className={s.entete}>
            <p className="card__title" style={{ margin: 0 }}>Compte de résultat simplifié</p>
            <span className={s.numero}>2033-B, cadre A</span>
          </div>
          <Cases lignes={l.compteResultat} />
        </section>

        <section className={`card ${s.formulaire}`}>
          <div className={s.entete}>
            <p className="card__title" style={{ margin: 0 }}>Résultat fiscal</p>
            <span className={s.numero}>2033-B, cadre B</span>
          </div>
          <Cases lignes={l.resultatFiscal} />
          <p className={s.note}>
            Réintégrations reprises d&apos;office : impôt sur les sociétés et taxe sur les véhicules de
            tourisme (324), amendes et pénalités (330). Rémunérations non déductibles (316),
            amortissements excédentaires (318) et provisions non déductibles (322) : aucune dans ce
            dossier ; toute autre charge non déductible s&apos;ajouterait ici.
          </p>
        </section>

        {/* ---- 2033-C, D ---- */}
        <section className={`card ${s.formulaire}`}>
          <div className={s.entete}>
            <p className="card__title" style={{ margin: 0 }}>Immobilisations, provisions, déficits</p>
            <span className={s.numero}>2033-C et 2033-D</span>
          </div>
          <p style={{ fontSize: 'var(--fs-sm)', marginBottom: '.6rem' }}>
            2033-C (immobilisations, amortissements, plus-values) :{' '}
            {l.actif.slice(0, 4).some((x) => x.brut !== 0)
              ? 'à remplir depuis le registre des immobilisations (Comptabilité → Immobilisations).'
              : 'cochez « Néant » — aucune immobilisation.'}
            {' '}2033-D, cadre I (provisions) : « Néant ».
          </p>
          <Cases lignes={[
            { code: '982', libelle: 'Déficits restant à reporter au titre de l’exercice précédent', montant: d982, comptes: [] },
            { code: '983', libelle: 'Déficits imputés', montant: d983, comptes: [] },
            { code: '984', libelle: 'Déficits reportables', montant: d982 - d983, comptes: [] },
            { code: '860', libelle: 'Déficit de l’exercice', montant: d860, comptes: [] },
            { code: '870', libelle: 'Total des déficits restant à reporter', montant: d982 - d983 + d860, comptes: [], total: true },
            { code: '374', libelle: 'Montant de la TVA collectée', montant: Math.round(Number(d?.collectee?.total ?? 0)), comptes: [] },
            { code: '378', libelle: 'Montant de la TVA déductible sur biens et services (sauf immobilisations)', montant: Math.round(Number(d?.deductible?.total ?? 0)), comptes: [] },
          ]} />
        </section>

        {/* ---- 2033-E ---- */}
        <section className={`card ${s.formulaire}`}>
          <div className={s.entete}>
            <p className="card__title" style={{ margin: 0 }}>Effectifs et valeur ajoutée</p>
            <span className={s.numero}>2033-E</span>
          </div>
          <Cases lignes={[
            { code: '376', libelle: 'Effectif moyen du personnel', montant: 0, comptes: [] },
            { code: '108', libelle: 'Ventes de produits fabriqués, prestations de services et marchandises', montant: ve.ca, comptes: ['70'] },
            { code: '106', libelle: 'Total 1 — chiffre d’affaires de référence', montant: total1, comptes: [], total: true },
            { code: '115', libelle: 'Autres produits de gestion courante', montant: ve.autres, comptes: ['75'] },
            { code: '113', libelle: 'Subventions d’exploitation reçues', montant: ve.subventions, comptes: ['74'] },
            { code: '144', libelle: 'Total 2', montant: total2, comptes: [], total: true },
            { code: '121', libelle: 'Achats', montant: ve.achats, comptes: ['60'] },
            { code: '125', libelle: 'Services extérieurs, à l’exception des loyers et redevances', montant: ve.services, comptes: ['61', '62'] },
            { code: '310', libelle: 'Loyers et redevances (hors locations de plus de six mois et crédit-bail)', montant: ve.loyers, comptes: ['613'] },
            { code: '148', libelle: 'Autres charges de gestion courante', montant: ve.gestion, comptes: ['65'] },
            { code: '152', libelle: 'Total 3', montant: total3, comptes: [], total: true },
            { code: '137', libelle: 'Valeur ajoutée produite (Total 1 + Total 2 − Total 3)', montant: total1 + total2 - total3, comptes: [], total: true },
          ]} />
          <p className={s.note}>
            La société n&apos;est pas redevable de la CVAE (chiffre d&apos;affaires inférieur à 500 000 €) :
            la case 117 et le cadre mono-établissement restent vides. Sans salarié, l&apos;effectif est 0.
          </p>
        </section>

        {/* ---- 2033-F, G ---- */}
        <section className={`card ${s.formulaire}`}>
          <div className={s.entete}>
            <p className="card__title" style={{ margin: 0 }}>Composition du capital</p>
            <span className={s.numero}>2033-F et 2033-G</span>
          </div>
          <Cases lignes={[
            { code: '901', libelle: 'Nombre d’associés personnes morales', montant: 0, comptes: [] },
            { code: '903', libelle: 'Nombre d’associés personnes physiques', montant: associes.length, comptes: [] },
            { code: '904', libelle: 'Nombre de parts ou d’actions correspondantes', montant: parts, comptes: [] },
            { code: '905', libelle: 'Total des associés (901 + 903)', montant: associes.length, comptes: [], total: true },
            { code: '906', libelle: 'Total des parts (902 + 904)', montant: parts, comptes: [], total: true },
          ]} />
          <div className="table-scroll" style={{ marginTop: '.8rem' }}>
            <table className={s.table}>
              <thead>
                <tr><th>Associé (cadre II)</th><th>Naissance</th><th>Adresse</th>
                  <th style={{ textAlign: 'right' }}>Parts</th><th style={{ textAlign: 'right' }}>%</th></tr>
              </thead>
              <tbody>
                {associes.map((a) => (
                  <tr key={a.nom + a.prenom}>
                    <td>{a.nom.toUpperCase()} {a.prenom}</td>
                    <td>{a.date_naissance ? date(a.date_naissance) : <span className="muted">à compléter</span>}
                      {a.lieu_naissance ? ` — ${a.lieu_naissance}` : ''}</td>
                    <td>{a.adresse ? `${a.adresse}, ${a.code_postal ?? ''} ${a.ville ?? ''}` : <span className="muted">à compléter</span>}</td>
                    <td className={s.montant}>{nombre.format(Number(a.parts ?? 0))}</td>
                    <td className={s.montant}>{parts ? `${Math.round((Number(a.parts ?? 0) / parts) * 1000) / 10} %` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={s.note}>2033-G (filiales et participations) : cochez « Néant ».</p>
        </section>

        {/* ---- 2065, 2572 ---- */}
        <section className={`card ${s.formulaire}`}>
          <div className={s.entete}>
            <p className="card__title" style={{ margin: 0 }}>Impôt sur les sociétés</p>
            <span className={s.numero}>2065, cadre C · relevé de solde 2572</span>
          </div>
          <Cases lignes={[
            { code: null, libelle: 'Bénéfice imposable au taux normal', montant: l.is.beneficeTauxNormal, comptes: [] },
            { code: null, libelle: 'Bénéfice imposable à 15 %', montant: l.is.beneficeTauxReduit, comptes: [] },
            { code: null, libelle: 'Déficit', montant: l.is.deficit, comptes: [] },
            { code: null, libelle: 'Impôt au taux de 15 %', montant: l.is.impot15, comptes: [] },
            { code: null, libelle: 'Impôt au taux normal de 25 %', montant: l.is.impot25, comptes: [] },
            { code: null, libelle: 'Impôt sur les sociétés dû', montant: l.is.impot, comptes: [], total: true },
            { code: null, libelle: 'Acomptes versés', montant: 0, comptes: [] },
            { code: null, libelle: 'Solde à payer avec le relevé 2572', montant: l.is.impot, comptes: [], total: true },
          ]} />
          <p className={s.note}>
            Le 2065 n&apos;a pas de numéros de case au cadre C : reportez chaque montant sur la ligne de
            même intitulé. Taux réduit de 15 % jusqu&apos;à {nombre.format(l.is.plafond)} € (42 500 €
            ajustés à la durée de l&apos;exercice){l.is.tauxReduit ? '' : ' — non applicable, le capital n’étant pas entièrement libéré'}.
            {l.is.comptabilise !== l.is.impot && ' L’impôt comptabilisé diffère du calcul : recalculez-le dans Comptabilité → Clôture.'}
            {' '}Aucun acompte n&apos;est dû au titre du premier exercice.
          </p>
        </section>

        {/* ---- CA12E ---- */}
        <section className={`card ${s.formulaire}`}>
          <div className={s.entete}>
            <p className="card__title" style={{ margin: 0 }}>TVA annuelle</p>
            <span className={s.numero}>CA12E — 3517-S-SD</span>
          </div>
          <Ca12 declaration={d} regime={exercice.regime_tva}
            debut={exercice.date_debut} fin={exercice.date_fin} />
        </section>

        <p className={s.note}>
          Ces montants sont lus sur le journal comptable, écritures de fin d&apos;exercice comprises :
          ils peuvent différer du tableau de bord, qui suit les pièces. Déclaration de résultat et
          TVA se déposent en ligne (espace professionnel impots.gouv.fr ou service de télétransmission).
        </p>
      </div>
    </>
  );
}

function Cases({ lignes }: { lignes: Ligne[] }) {
  return (
    <div className="table-scroll">
      <table className={s.table}>
        <thead>
          <tr><th>Case</th><th>Rubrique</th><th style={{ textAlign: 'right' }}>Montant (€)</th></tr>
        </thead>
        <tbody>
          {lignes.map((x, i) => (
            <tr key={`${x.code ?? 'x'}-${i}`} className={x.total ? s.total : x.dont ? s.dont : undefined}>
              <td>{x.code && <span className={s.code}>{x.code}</span>}</td>
              <td>
                {x.libelle}
                {x.comptes.length > 0 && x.montant !== 0 && (
                  <span className={s.comptes}>Comptes {x.comptes.join(', ')}</span>
                )}
              </td>
              <td className={`${s.montant} ${x.montant === 0 ? s.zero : ''}`}>{eur(x.montant)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Actif({ lignes }: { lignes: LigneActif[] }) {
  return (
    <div className="table-scroll">
      <table className={s.table}>
        <thead>
          <tr>
            <th>Case brut</th><th>Case amort.</th><th>Rubrique</th>
            <th style={{ textAlign: 'right' }}>Brut</th>
            <th style={{ textAlign: 'right' }}>Amort. / prov.</th>
            <th style={{ textAlign: 'right' }}>Net</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((x) => (
            <tr key={x.code} className={x.total ? s.total : undefined}>
              <td><span className={s.code}>{x.code}</span></td>
              <td><span className={s.code}>{x.codeAmort}</span></td>
              <td>
                {x.libelle}
                {x.comptes.length > 0 && x.brut !== 0 && (
                  <span className={s.comptes}>Comptes {x.comptes.join(', ')}</span>
                )}
              </td>
              <td className={`${s.montant} ${x.brut === 0 ? s.zero : ''}`}>{eur(x.brut)}</td>
              <td className={`${s.montant} ${x.amort === 0 ? s.zero : ''}`}>{eur(x.amort)}</td>
              <td className={`${s.montant} ${x.brut - x.amort === 0 ? s.zero : ''}`}>{eur(x.brut - x.amort)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
