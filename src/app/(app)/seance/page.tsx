import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import EtatAutomatismes, { type EtatTraitement } from '@/components/EtatAutomatismes';
import ContratsAFacturer, { type EcheanceContrat } from './ContratsAFacturer';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import SeanceHebdo, { type Seance } from './SeanceHebdo';
import Relances, { type Relance } from './Relances';

export const metadata = { title: 'Séance hebdomadaire — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'read')) redirect('/');

  const supabase = await createClient();

  // Une seule lecture. Le centre d'action en lançait quatorze, et
  // redémontrait des règles que les vues établissaient déjà.
  //
  // Les relances font l'objet d'un second appel : elles n'existaient pas
  // au moment où `seance_hebdomadaire` a été écrite, et l'élargir
  // obligerait à retoucher une fonction que six écrans lisent.
  //
  // Le compte courant n'est plus lu ici : le bloc de chiffres a quitté cet
  // écran pour le tableau de bord, où il n'était pas en double.
  // L'état des traitements automatiques : une sauvegarde en échec écrivait
  // jusqu'ici dans une table que personne ne consulte.
  const [{ data, error }, { data: relances }, { data: sync }, { data: sauv },
         { data: aFacturer }] =
    await Promise.all([
      supabase.rpc('seance_hebdomadaire'),
      supabase.rpc('a_relancer'),
      supabase.from('synchronisations')
        .select('statut, demarree_le, erreur')
        .order('demarree_le', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('sauvegardes')
        .select('statut, demarree_le, erreur')
        .order('demarree_le', { ascending: false }).limit(1).maybeSingle(),
      // Les contrats font l'objet d'un appel à part, comme les relances :
      // élargir `seance_hebdomadaire` obligerait à retoucher une fonction
      // que six écrans lisent.
      supabase.from('v_contrats_a_facturer').select('*').eq('echue', true),
    ]);

  const etatSync: EtatTraitement = {
    statut: sync?.statut ?? null, quand: sync?.demarree_le ?? null,
    erreur: sync?.erreur ?? null,
  };
  const etatSauv: EtatTraitement = {
    statut: sauv?.statut ?? null, quand: sauv?.demarree_le ?? null,
    erreur: sauv?.erreur ?? null,
  };

  if (error || !data) {
    return (
      <>
        <Header titre="Séance hebdomadaire" sousTitre="Tout ce qui attend une décision" />
        <div className="content">
          <div className="card">
            <p className="card__title" style={{ color: 'var(--danger)' }}>
              Lecture impossible
            </p>
            <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55 }}>
              {error?.message ?? 'La séance n\u2019a pas pu être constituée.'}
            </p>
          </div>
        </div>
      </>
    );
  }

  const seance = data as Seance;

  return (
    <>
      <Header
        titre="Séance hebdomadaire"
        sousTitre="Tout ce qui attend une décision, en un seul endroit"
      />
      <div className="content">
        <EtatAutomatismes synchro={etatSync} sauvegarde={etatSauv} />
        <ContratsAFacturer lignes={(aFacturer ?? []) as EcheanceContrat[]}
          peutGerer={peut(profil.role, 'ventes', 'create')} />
        <SeanceHebdo seance={seance} />
        <Relances
          lignes={(relances ?? []) as Relance[]}
          peutRelancer={peut(profil.role, 'ventes', 'update')}
        />
      </div>
    </>
  );
}
