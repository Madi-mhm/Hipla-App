import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import ListeContrats, {
  type Contrat, type ClientContrat, type PrestationContrat, type EtatContrats,
} from './ListeContrats';

export const metadata = { title: 'Contrats — Hipla Gestion' };
export const dynamic = 'force-dynamic';

/**
 * LES CONTRATS CLIENTS
 *
 * Le jumeau des abonnements, dans l'autre sens. Toute la machinerie du
 * récurrent existait pour ce que vous payez ; celle-ci sert ce que vous
 * facturez — un hôtel tous les samedis, une copropriété tous les mois.
 *
 * L'horizon des échéances est maintenu au chargement, comme les
 * abonnements le font : sans quoi un contrat déclaré aujourd'hui
 * n'annoncerait sa première facture qu'après le passage du cron.
 */
export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'ventes', 'read')) redirect('/');

  const supabase = await createClient();

  await supabase.rpc('generer_echeances_contrats');

  const [{ data: contrats }, { data: clients }, { data: prestations },
         { data: aFacturer }, { data: etat }] = await Promise.all([
    supabase.from('contrats').select('*, tiers(nom)').order('libelle'),
    supabase.from('tiers').select('id, nom').eq('est_client', true).order('nom'),
    supabase.from('prestations').select('*').eq('actif', true).order('ordre'),
    supabase.from('v_contrats_a_facturer').select('*'),
    supabase.rpc('etat_contrats'),
  ]);

  return (
    <>
      <Header titre="Contrats" sousTitre="Ce que vous facturez régulièrement" />
      <div className="content">
        <ListeContrats
          contrats={(contrats ?? []) as Contrat[]}
          clients={(clients ?? []) as ClientContrat[]}
          prestations={(prestations ?? []) as PrestationContrat[]}
          aFacturer={(aFacturer ?? []) as never[]}
          etat={(etat ?? {}) as EtatContrats}
          peutGerer={peut(profil.role, 'ventes', 'update')}
        />
      </div>
    </>
  );
}
