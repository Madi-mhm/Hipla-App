import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import Banque from './Banque';
import type { TransactionQonto, Synchronisation, Categorie } from '@/lib/types';

export const metadata = { title: 'Banque — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'banque', 'read')) redirect('/');

  const supabase = await createClient();

  const [{ data: tx }, { data: synchros }, { data: controle }, { data: cats }] =
    await Promise.all([
      // Deux clés étrangères relient ces tables — depense_id d'un côté,
      // transaction_qonto_id de l'autre. PostgREST ne peut pas choisir seul :
      // la contrainte à emprunter doit être nommée explicitement.
      supabase.from('transactions_qonto')
        .select('*, depenses!transactions_qonto_depense_id_fkey(numero_piece, fournisseur)')
        .order('date_operation', { ascending: false })
        .limit(300),
      supabase.from('synchronisations')
        .select('*').order('demarree_le', { ascending: false }).limit(10),
      supabase.rpc('solde_controle'),
      supabase.from('categories').select('*').eq('actif', true).order('ordre'),
    ]);

  const { count: justificatifsEnAttente } = await supabase
    .from('v_justificatifs_qonto')
    .select('*', { count: 'exact', head: true });

  return (
    <>
      <Header titre="Banque" sousTitre="Opérations Qonto et rapprochement" />
      <div className="content">
        <Banque
          transactions={(tx ?? []) as TransactionQonto[]}
          synchronisations={(synchros ?? []) as Synchronisation[]}
          controle={controle}
          categories={(cats ?? []) as Categorie[]}
          utilisateurId={profil.id}
          peutGerer={peut(profil.role, 'banque', 'update')}
          justificatifsEnAttente={justificatifsEnAttente ?? 0}
        />
      </div>
    </>
  );
}
