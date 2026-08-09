import { redirect } from 'next/navigation';
import Header from '@/components/Header';
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
  // Le compte courant fait l'objet d'un troisième appel. `seance_hebdomadaire`
  // le recalcule à sa façon — `sum(montant_ttc) where moyen_paiement =
  // 'avance_associe'` — et manque les remboursements, écrits avec le moyen
  // « virement ». Une fois remboursé, l'écran continuait donc d'annoncer une
  // dette éteinte, indéfiniment, pendant que /associes affichait le bon solde.
  //
  // On lit la source, `solde_compte_courant()`, plutôt que de réécrire une
  // fonction que six écrans partagent.
  const [{ data, error }, { data: relances }, { data: comptesCourants }] =
    await Promise.all([
      supabase.rpc('seance_hebdomadaire'),
      supabase.rpc('a_relancer'),
      supabase.rpc('solde_compte_courant'),
    ]);

  const compteCourant = ((comptesCourants ?? []) as Array<{ solde: number | string }>)
    .reduce((t, s) => t + Number(s.solde), 0);

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
        <SeanceHebdo seance={seance} compteCourant={compteCourant} />
        <Relances
          lignes={(relances ?? []) as Relance[]}
          peutRelancer={peut(profil.role, 'ventes', 'update')}
        />
      </div>
    </>
  );
}
