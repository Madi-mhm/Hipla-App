import Link from 'next/link';
import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { aujourdhuiIso } from '@/lib/dates';
import { date } from '@/lib/format';
import { calendrier, rappels } from '@/lib/obligations';
import Calendrier, { type Suivi } from './Calendrier';
import EcrituresInventaire, { type Ecriture, type EstimationIs } from './EcrituresInventaire';
import ActionsCloture from './ActionsCloture';

export const metadata = { title: 'Clôture — Hipla Gestion' };
export const dynamic = 'force-dynamic';

/**
 * CLÔTURE DE L'EXERCICE
 *
 * Trois temps, dans l'ordre où ils se présentent :
 *  · le calendrier des obligations, pour ne rien laisser passer ;
 *  · la préparation — ce qui doit être à jour, contrôlé sur les données,
 *    puis les écritures de fin d'exercice et l'impôt ;
 *  · la clôture elle-même, qui fige l'exercice.
 *
 * Les montants à déclarer se lisent ensuite dans Comptabilité → Liasse.
 */

type Exercice = {
  id: string; date_debut: string; date_fin: string;
  regime_tva: string | null; statut: string; cloture_le: string | null;
};
type Etape = { cle: string; libelle: string; ok: boolean | null; mesure: string; lien: string | null };

export default async function Page(
  { searchParams }: { searchParams: Promise<{ exercice?: string }> },
) {
  const { exercice: choisi } = await searchParams;
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'exports', 'read')) redirect('/');
  const peutCloturer = peut(profil.role, 'tva', 'validate');

  const supabase = await createClient();
  const aujourdhui = aujourdhuiIso();

  const [{ data: exs }, { data: suivi }, { data: cats }] = await Promise.all([
    supabase.from('exercices')
      .select('id, date_debut, date_fin, regime_tva, statut, cloture_le').order('date_debut'),
    supabase.from('obligations_suivi').select('cle, fait_le, reference'),
    supabase.from('categories').select('compte, libelle').eq('actif', true).order('compte'),
  ]);

  const exercices = (exs ?? []) as Exercice[];
  if (exercices.length === 0) {
    return (
      <>
        <Header section="comptabilite" titre="Comptabilité" sousTitre="Clôture" />
        <div className="content">
          <div className="card"><p>Aucun exercice déclaré. Réglages → Entreprise.</p></div>
        </div>
      </>
    );
  }

  // Par défaut, l'exercice à préparer : le premier commencé qui n'est pas clos.
  const exercice = exercices.find((e) => e.id === choisi)
    ?? exercices.find((e) => e.statut !== 'clos' && e.date_debut <= aujourdhui)
    ?? exercices[exercices.length - 1];

  const [{ data: etat }, { data: ecr }] = await Promise.all([
    supabase.rpc('etat_cloture', { p_exercice: exercice.id }),
    supabase.from('pieces')
      .select('id, numero_piece, origine, compte, objet, tiers_libelle, montant_ht, montant_tva')
      .eq('nature', 'inventaire').eq('etat', 'validee').eq('date_piece', exercice.date_fin)
      .order('numero_piece'),
  ]);

  const e = etat as {
    etapes: Etape[]; resultat: EstimationIs; exercice: { termine: boolean };
  } | null;
  const etapes = e?.etapes ?? [];
  const aReprendre = etapes.filter((x) => x.ok === false).length;
  const clos = exercice.statut === 'clos';

  // Comptes proposés : ceux des catégories de charges, et les produits usuels.
  const comptes = [
    ...new Map(((cats ?? []) as Array<{ compte: string; libelle: string }>)
      .filter((c) => c.compte.startsWith('6'))
      .map((c) => [c.compte, c.libelle])).entries(),
  ].map(([compte, libelle]) => ({ compte, libelle })).concat([
    { compte: '706', libelle: 'Prestations de services' },
    { compte: '708', libelle: 'Produits des activités annexes' },
  ]);

  return (
    <>
      <Header section="comptabilite" titre="Comptabilité"
        sousTitre={`Clôture — exercice du ${date(exercice.date_debut)} au ${date(exercice.date_fin)}`} />
      <div className="content">
        {exercices.length > 1 && (
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            {exercices.map((x) => (
              <Link key={x.id} href={`/comptabilite/cloture?exercice=${x.id}`}
                className={`btn btn--sm ${x.id === exercice.id ? 'btn--primary' : 'btn--ghost'}`}>
                {x.date_debut.slice(0, 4)}–{x.date_fin.slice(0, 4)}{x.statut === 'clos' ? ' · clos' : ''}
              </Link>
            ))}
          </div>
        )}

        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <p className="card__title">Calendrier des obligations</p>
          <Calendrier obligations={calendrier(exercices)} rappels={rappels(exercices)}
            suivi={(suivi ?? []) as Suivi[]} aujourdhui={aujourdhui}
            peutModifier={peutCloturer} />
        </div>

        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <p className="card__title">Préparer la clôture</p>
          {!e?.exercice.termine && (
            <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: '.3rem' }}>
              L&apos;exercice se termine le {date(exercice.date_fin)} : ces contrôles donnent
              l&apos;état à ce jour.
            </p>
          )}
          <ul style={{ listStyle: 'none', padding: 0, margin: '.8rem 0 0' }}>
            {etapes.map((x) => (
              <li key={x.cle} style={{
                display: 'flex', gap: '.8rem', alignItems: 'center',
                padding: '.55rem 0', borderBottom: '1px solid var(--g-200)',
              }}>
                <span className={`badge ${x.ok === true ? 'badge--success'
                  : x.ok === false ? 'badge--warning' : 'badge--neutral'}`}
                  style={{ minWidth: '1.7rem', textAlign: 'center' }}>
                  {x.ok === true ? '✓' : x.ok === false ? '!' : '?'}
                </span>
                <span style={{ flex: 1, fontSize: 'var(--fs-sm)' }}>
                  <span style={{ fontWeight: 500 }}>{x.libelle}</span>
                  <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                    {x.mesure}
                  </span>
                </span>
                {x.lien && <Link href={x.lien} className="btn btn--ghost btn--sm">Ouvrir</Link>}
              </li>
            ))}
          </ul>
        </div>

        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <p className="card__title">Écritures de fin d&apos;exercice</p>
          <EcrituresInventaire exerciceId={exercice.id} fin={exercice.date_fin}
            ecritures={(ecr ?? []) as Ecriture[]} comptes={comptes}
            fiscal={e?.resultat ?? null} peutModifier={peutCloturer && !clos} />
        </div>

        <div className="card">
          <p className="card__title">Clôturer l&apos;exercice</p>
          <ActionsCloture exerciceId={exercice.id} statut={exercice.statut}
            termine={!!e?.exercice.termine} fin={exercice.date_fin}
            clotureLe={exercice.cloture_le} aReprendre={aReprendre}
            peutModifier={peutCloturer} />
        </div>

        <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: '1rem' }}>
          Bilan, compte de résultat et montants à déclarer, case par case :{' '}
          <Link href={`/comptabilite/liasse?exercice=${exercice.id}`}>Comptabilité → Liasse</Link>.
        </p>
      </div>
    </>
  );
}
