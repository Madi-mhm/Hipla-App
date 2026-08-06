import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import ListeAbonnements from './ListeAbonnements';
import type { Abonnement, Echeance, Categorie } from '@/lib/types';

export const metadata = { title: 'Abonnements — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'abonnements', 'read')) redirect('/');

  const supabase = await createClient();

  // La génération se fait aussi ici, en complément du cron : si celui-ci
  // ne tourne pas, les échéances restent malgré tout à jour.
  if (peut(profil.role, 'abonnements', 'update')) {
    await supabase.rpc('generer_echeances');
    await supabase.rpc('marquer_justificatifs_manquants');
  }

  const [{ data: abos }, { data: echeances }, { data: couts }, { data: cats }] =
    await Promise.all([
      supabase.from('abonnements')
        .select('*, categories(libelle)')
        .order('statut').order('nom'),
      supabase.from('abonnement_echeances')
        .select('*, abonnements(nom, fournisseur)')
        .order('date_prevue'),
      supabase.from('v_couts_abonnements').select('*').single(),
      supabase.from('categories').select('*').eq('actif', true).order('ordre'),
    ]);

  return (
    <>
      <Header titre="Abonnements" sousTitre="Charges récurrentes et engagements" />
      <div className="content">
        <ListeAbonnements
          abonnements={(abos ?? []) as Abonnement[]}
          echeances={(echeances ?? []) as Echeance[]}
          couts={couts}
          categories={(cats ?? []) as Categorie[]}
          utilisateurId={profil.id}
          peutGerer={peut(profil.role, 'abonnements', 'update')}
        />
      </div>
    </>
  );
}
