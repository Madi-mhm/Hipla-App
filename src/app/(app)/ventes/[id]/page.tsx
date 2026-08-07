import { notFound, redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import type { Piece, LignePiece, Tiers, Reglement } from '@/lib/registre';
import DetailFacture from './DetailFacture';
import type { Prestation, TransactionQonto } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'ventes', 'read')) redirect('/');

  const supabase = await createClient();
  const { data: piece } = await supabase
    .from('pieces')
    .select('*, tiers(*)')
    .eq('id', id)
    .single();

  if (!piece || (piece.nature !== 'vente' && piece.nature !== 'avoir')) notFound();

  const [{ data: lignes }, { data: prestations }, { data: entreprise },
         { data: credits }, { data: reglements }] =
    await Promise.all([
      supabase.from('pieces_lignes').select('*').eq('piece_id', id).order('ordre'),
      supabase.from('prestations').select('*').eq('actif', true).order('ordre'),
      supabase.from('entreprise').select('*').single(),
      supabase.from('transactions_qonto').select('*')
        .eq('statut_traitement', 'a_traiter')
        .eq('statut_qonto', 'completed')
        .eq('sens', 'credit')
        .order('date_operation', { ascending: false })
        .limit(30),
      supabase.from('reglements').select('*').eq('piece_id', id)
        .order('date_reglement'),
    ]);

  return (
    <>
      <Header
        // Le numéro n'est attribué qu'à l'émission : un brouillon n'en a
        // pas, et ne doit pas en afficher un faux.
        titre={piece.numero_piece ?? 'Facture — brouillon'}
        sousTitre={piece.tiers_libelle ?? ''}
      />
      <div className="content">
        <DetailFacture
          piece={piece as Piece & { tiers: Tiers | null }}
          lignes={(lignes ?? []) as LignePiece[]}
          reglements={(reglements ?? []) as Reglement[]}
          prestations={(prestations ?? []) as Prestation[]}
          entreprise={entreprise}
          creditsLibres={(credits ?? []) as TransactionQonto[]}
          peutGerer={peut(profil.role, 'ventes', 'update')}
          peutEncaisser={peut(profil.role, 'ventes', 'validate')}
        />
      </div>
    </>
  );
}
