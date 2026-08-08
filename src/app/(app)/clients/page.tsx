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

  // `factures` est vide depuis la bascule : chaque client affichait
  // zéro chiffre d'affaires. Les ventes vivent dans le registre, et
  // c'est `tiers_id` qui porte le client, non `client_id`.
  const [{ data: clients }, { data: ventes }] = await Promise.all([
    supabase.from('clients').select('*').order('nom'),
    supabase.from('pieces')
      .select('tiers_id, tiers_libelle, montant_ht, etat, net_a_payer, montant_regle')
      .in('nature', ['vente', 'avoir'])
      .neq('etat', 'annulee'),
  ]);

  // Le registre ne connaît pas les statuts « encaissee » ou « impayee » :
  // il compare le réglé au net à payer. On traduit pour l'écran, qui
  // raisonne encore dans l'ancien vocabulaire.
  const factures = (ventes ?? []).map((v) => {
    const net = Number(v.net_a_payer ?? 0);
    const regle = Number(v.montant_regle ?? 0);
    return {
      // Le lien passe par le nom : `clients` et `tiers` sont deux
      // tables distinctes, reliées par leur libellé.
      client_id: (clients ?? []).find(
        (c) => c.nom?.toLowerCase() === String(v.tiers_libelle).toLowerCase())?.id ?? '',
      montant_ht: Number(v.montant_ht ?? 0),
      statut: v.etat !== 'validee' ? 'brouillon'
            : regle >= net - 0.005 ? 'encaissee'
            : regle > 0.005 ? 'partielle' : 'emise',
      net_a_payer: net,
      montant_encaisse: regle,
    };
  }).filter((f) => f.client_id !== '');

  return (
    <>
      <Header titre="Clients" sousTitre="Particuliers, professionnels et syndics" />
      <div className="content">
        <ListeClients
          clients={(clients ?? []) as Client[]}
          factures={factures}
          peutGerer={peut(profil.role, 'clients', 'update')}
        />
      </div>
    </>
  );
}
