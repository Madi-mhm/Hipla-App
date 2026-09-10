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

  const [{ data: tx }, { data: synchros }, { data: controle }, { data: cats }, { data: soldeRecon }] =
    await Promise.all([
      // L'écriture liée passait par `depenses`, table que le registre a
      // remplacée : `confirmer_appariement` ne renseigne plus `depense_id`.
      // La colonne « Écriture » était donc vide sur toute opération
      // rapprochée depuis la bascule. Le lien vit maintenant dans
      // `reglements`, résolu juste en dessous.
      supabase.from('transactions_qonto')
        .select('*')
        .order('date_operation', { ascending: false })
        .limit(300),
      supabase.from('synchronisations')
        .select('*').order('demarree_le', { ascending: false }).limit(10),
      supabase.rpc('solde_controle'),
      supabase.from('categories').select('*').eq('actif', true).order('ordre'),
      // Calculé côté base sur TOUTE la table : la liste ci-dessus est
      // plafonnée à 300 lignes pour l'affichage, le solde ne doit pas
      // hériter de ce plafond. Voir migration 101.
      supabase.rpc('solde_reconstitue'),
    ]);

  const { count: justificatifsEnAttente } = await supabase
    .from('v_justificatifs_qonto')
    .select('*', { count: 'exact', head: true });

  /* Écriture rattachée à chaque opération.
     Une requête séparée plutôt qu'une jointure imbriquée : le nom de la
     contrainte n'a pas à être deviné, et une opération peut porter
     plusieurs règlements — un acompte puis un solde. On garde le premier
     et l'on signale le nombre. */
  const idsTx = (tx ?? []).map((t) => t.id as string);
  const { data: regl } = idsTx.length
    ? await supabase.from('reglements')
        .select('transaction_id, piece_id, pieces(numero_piece, tiers_libelle)')
        .in('transaction_id', idsTx)
    : { data: [] as unknown[] };

  const parTransaction = new Map<string, { piece_id: string; numero_piece: string | null;
                                           tiers: string | null; nombre: number }>();
  for (const r of (regl ?? []) as Array<{
    transaction_id: string; piece_id: string;
    pieces: { numero_piece: string | null; tiers_libelle: string | null } | null;
  }>) {
    const dejaVu = parTransaction.get(r.transaction_id);
    if (dejaVu) { dejaVu.nombre += 1; continue; }
    parTransaction.set(r.transaction_id, {
      piece_id: r.piece_id,
      numero_piece: r.pieces?.numero_piece ?? null,
      tiers: r.pieces?.tiers_libelle ?? null,
      nombre: 1,
    });
  }

  const transactions = (tx ?? []).map((t) => ({
    ...t,
    ecriture: parTransaction.get(t.id as string) ?? null,
  }));

  return (
    <>
      <Header section="banque" titre="Banque" sousTitre="Opérations Qonto et rapprochement" />
      <div className="content">
        <Banque
          transactions={transactions as TransactionQonto[]}
          synchronisations={(synchros ?? []) as Synchronisation[]}
          controle={controle}
          categories={(cats ?? []) as Categorie[]}
          utilisateurId={profil.id}
          peutGerer={peut(profil.role, 'banque', 'update')}
          justificatifsEnAttente={justificatifsEnAttente ?? 0}
          soldeReconstitue={soldeRecon as { solde: number; nb_operations: number } | null}
        />
      </div>
    </>
  );
}
