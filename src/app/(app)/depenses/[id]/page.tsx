import { notFound, redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { statutSaisie, type Candidat } from '@/lib/registre';
import DetailDepense from './DetailDepense';
import DepotJustificatif from './DepotJustificatif';
import Commentaires from '@/components/Commentaires';
import Rapprochement, { type OperationLibre } from '@/components/Rapprochement';
import type { Categorie, Depense, Commentaire } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'read')) redirect('/');

  const supabase = await createClient();

  const { data: piece } = await supabase
    .from('pieces')
    .select('*, categories(*)')
    .eq('id', id)
    .single();

  if (!piece || !['achat', 'creation', 'km'].includes(piece.nature)) notFound();

  const [{ data: cats }, { data: justifs }, { data: commentaires },
         { data: relecteur }, { data: reglements }] =
    await Promise.all([
      supabase.from('categories').select('*').eq('actif', true).order('ordre'),
      supabase.from('justificatifs').select('*').eq('piece_id', id),
      supabase.from('commentaires')
        .select('*, profils!commentaires_cree_par_fkey(nom_complet)')
        .eq('table_cible', 'depenses').eq('id_cible', id)
        .order('cree_le', { ascending: false }),
      piece.revu_par
        ? supabase.from('profils').select('nom_complet').eq('id', piece.revu_par).single()
        : Promise.resolve({ data: null }),
      supabase.from('reglements').select('*, transactions_qonto(*)')
        .eq('piece_id', id).order('date_reglement'),
    ]);

  // L'opération bancaire rattachée se lit sur les règlements : c'est là
  // que vit le lien depuis que le moteur d'appariement crée un règlement
  // plutôt qu'un simple rattachement.
  const avecTransaction = (reglements ?? []).find((r) => r.transactions_qonto);
  const t = avecTransaction?.transactions_qonto as Record<string, unknown> | undefined;
  const rattachee = t
    ? {
        id: String(t.id),
        numero_piece: t.numero_piece ? String(t.numero_piece) : null,
        date_operation: String(t.date_operation),
        montant: Math.abs(Number(t.montant)),
        libelle: String(t.contrepartie ?? t.libelle ?? ''),
      }
    : null;

  // Le moteur ne propose que si rien n'est encore rattaché.
  let candidats: Candidat[] = [];
  let operationsLibres: OperationLibre[] = [];

  if (!rattachee && piece.attendu_en_banque) {
    const { data } = await supabase.rpc('candidats_pour_piece', { p_piece: id });
    candidats = ((data ?? []) as Candidat[]).filter((c) => c.decision !== 'ecarte');

    // Toutes les opérations libres du même sens, pour le rapprochement
    // manuel. Un moteur qui se tait doit toujours laisser un recours :
    // sans cette liste, une écriture sans candidat restait bloquée.
    const { data: libres } = await supabase
      .from('transactions_qonto')
      .select('id, numero_piece, date_operation, montant, libelle, contrepartie')
      .eq('statut_traitement', 'a_traiter')
      .eq('statut_qonto', 'completed')
      .eq('sens', piece.sens)
      .order('date_operation', { ascending: false })
      .limit(100);

    operationsLibres = ((libres ?? []) as OperationLibre[])
      .map((o) => ({ ...o, montant: Math.abs(Number(o.montant)) }));
  }

  // Le bucket est privé : on génère des URL signées, valables une heure.
  const fichiers = await Promise.all(
    (justifs ?? []).map(async (j) => {
      const { data } = await supabase.storage
        .from('justificatifs').createSignedUrl(j.chemin, 3600);
      return { ...j, url: data?.signedUrl ?? null };
    })
  );

  const statut = statutSaisie(piece.etat);

  // Le propriétaire modifie tout ; le contributeur seulement ses propres
  // saisies encore en attente.
  const peutModifier =
    peut(profil.role, 'depenses', 'update') ||
    (piece.cree_par === profil.id && statut === 'en_attente');

  const depense = {
    ...piece,
    date_depense: piece.date_piece,
    fournisseur: piece.tiers_libelle,
    libelle: piece.objet,
    tva_deductible: piece.tva_comptable,
    statut,
    montant_encaisse: piece.montant_regle,
  };

  return (
    <>
      <Header
        titre={piece.tiers_libelle}
        sousTitre={piece.numero_piece ? `Pièce ${piece.numero_piece}` : 'Détail de la dépense'}
      />
      <div className="content">
        <DetailDepense
          depense={depense as unknown as Depense}
          categories={(cats ?? []) as Categorie[]}
          fichiers={fichiers}
          peutModifier={peutModifier}
          peutValider={peut(profil.role, 'depenses', 'validate')}
          peutSupprimer={peut(profil.role, 'depenses', 'delete')}
          peutRevue={peut(profil.role, 'depenses', 'revue')}
          nomRelecteur={relecteur?.nom_complet ?? null}
        />

        {/*
          Ce bloc avait été livré puis perdu : une livraison ultérieure est
          repartie d'une version antérieure du fichier. Sans lui, une pièce
          validée n'a plus aucun moyen de recevoir sa facture — joindre un
          document ne change aucun chiffre et doit rester possible.
        */}
        <DepotJustificatif
          pieceId={id}
          numeroPiece={piece.numero_piece}
          annulee={piece.etat === 'annulee'}
          aDesJustificatifs={fichiers.length > 0}
          peutDeposer={peut(profil.role, 'depenses', 'update')}
        />

        <div style={{ marginTop: '1rem' }}>
          <Rapprochement
            pieceId={id}
            attenduEnBanque={piece.attendu_en_banque}
            resteDu={Number(piece.net_a_payer) - Number(piece.montant_regle)}
            rattachee={rattachee}
            candidats={candidats}
            operationsLibres={operationsLibres}
            peutGerer={peut(profil.role, 'banque', 'update')}
          />
        </div>

        <div style={{ marginTop: '1rem' }}>
          <Commentaires
            commentaires={(commentaires ?? []) as Commentaire[]}
            tableCible="depenses"
            idCible={id}
            numeroPiece={piece.numero_piece}
            utilisateurId={profil.id}
            peutCommenter={peut(profil.role, 'commentaires', 'create')}
            peutResoudre={peut(profil.role, 'commentaires', 'update')}
          />
        </div>
      </div>
    </>
  );
}
