import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import ListeClients from './ListeClients';
import type { Client } from '@/lib/types';

export const metadata = { title: 'Clients — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'clients', 'read')) redirect('/');

  const supabase = await createClient();
  const [{ data: clients }, { data: factures }] = await Promise.all([
    supabase.from('clients').select('*').order('nom'),
    supabase.from('factures')
      .select('client_id, montant_ht, statut, net_a_payer, montant_encaisse')
      .neq('statut', 'annulee'),
  ]);

  return (
    <>
      <Header titre="Clients" sousTitre="Particuliers, professionnels et syndics" />
      <div className="content">
        <ListeClients
          clients={(clients ?? []) as Client[]}
          factures={factures ?? []}
          peutGerer={peut(profil.role, 'clients', 'update')}
        />
      </div>
    </>
  );
}
