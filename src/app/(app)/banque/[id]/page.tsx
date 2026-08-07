import { notFound, redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import DetailTransaction, {
  type CandidatPiece, type Ecriture, type EcritureOuverte,
} from './DetailTransaction';
import type { Categorie } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'banque', 'read')) redirect('/');

  const supabase = await createClient();

  const { data: t } = await supabase
    .from('transactions_qonto').select('*').eq('id', id).single();

  if (!t) notFound();

  const [{ data: cats }, { data: piece }] = await Promise.all([
    supabase.from('categories').select('*').eq('actif', true).order('ordre'),
    // L'écriture rattachée, s'il y en a une : elle se lit sur les
    // règlements, où le moteur d'appariement inscrit le lien.
    supabase.from('reglements')
      .select('piece_id, montant, pieces(id, numero_piece, tiers_libelle, montant_ttc, etat)')
      .eq('transaction_id', id).maybeSingle(),
  ]);

  // Candidats à l'appariement, avec leurs motifs. Un score nu ne se juge
  // pas ; « montant exact · même date » se juge d'un coup d'œil.
  let candidats: CandidatPiece[] = [];
  if (t.statut_traitement === 'a_traiter' && t.statut_qonto === 'completed') {
    const { data } = await supabase.rpc('candidats_pour_transaction', {
      p_transaction: id,
    });
    candidats = ((data ?? []) as CandidatPiece[])
      .filter((c) => c.decision !== 'ecarte');
  }

  // Toutes les écritures encore ouvertes du même sens, pour le
  // rattachement manuel. Le moteur ne propose que ce dont il est sûr ;
  // il faut pouvoir décider soi-même quand il se tait.
  let ouvertes: EcritureOuverte[] = [];
  if (t.statut_traitement === 'a_traiter') {
    const { data } = await supabase
      .from('pieces')
      .select('id, numero_piece, date_piece, tiers_libelle, net_a_payer, montant_regle, etat')
      .in('etat', ['validee', 'a_valider'])
      .eq('sens', t.sens)
      .is('transaction_id', null)
      .order('date_piece', { ascending: false })
      .limit(100);

    ouvertes = ((data ?? []) as EcritureOuverte[])
      .filter((p) => Number(p.net_a_payer) - Number(p.montant_regle) > 0.005);
  }

  // Le justificatif récupéré de Qonto est déjà dans le stockage : on ne
  // le retélécharge pas, on l'affiche.
  let urlJustificatif: string | null = null;
  if (t.chemin_justificatif) {
    const { data } = await supabase.storage
      .from('justificatifs').createSignedUrl(t.chemin_justificatif, 3600);
    urlJustificatif = data?.signedUrl ?? null;
  }

  // Une règle déclarée ou un alias appris peut pré-remplir la saisie.
  const { data: regle } = await supabase.rpc('regle_pour_transaction', {
    p_transaction: id,
  });

  // PostgREST rend une relation imbriquée sous forme de tableau, même
  // lorsqu'elle est unique côté base. On la ramène à l'objet attendu
  // plutôt que de forcer le type — un cast masquerait un vrai changement
  // de forme le jour où la requête évoluerait.
  const relation = piece?.pieces;
  const ecriture: Ecriture = Array.isArray(relation)
    ? (relation[0] ?? null)
    : (relation ?? null);

  return (
    <>
      <Header
        titre={t.contrepartie ?? t.libelle}
        sousTitre={t.numero_piece ? `Opération ${t.numero_piece}` : 'Opération bancaire'}
      />
      <div className="content">
        <DetailTransaction
          transaction={t}
          categories={(cats ?? []) as Categorie[]}
          candidats={candidats}
          ouvertes={ouvertes}
          urlJustificatif={urlJustificatif}
          ecriture={ecriture}
          regle={regle as Record<string, unknown> | null}
          peutGerer={peut(profil.role, 'banque', 'update')}
        />
      </div>
    </>
  );
}
