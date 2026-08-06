import { notFound, redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import DetailDepense from './DetailDepense';
import Commentaires from '@/components/Commentaires';
import type { Commentaire } from '@/lib/types';
import type { Categorie, Depense } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'read')) redirect('/');

  const supabase = await createClient();

  const { data: depense } = await supabase
    .from('depenses')
    .select('*, categories(*), profils!depenses_cree_par_fkey(nom_complet)')
    .eq('id', id)
    .single();

  if (!depense) notFound();

  const [{ data: cats }, { data: justifs }, { data: commentaires }, { data: relecteur }] =
    await Promise.all([
      supabase.from('categories').select('*').eq('actif', true).order('ordre'),
      supabase.from('justificatifs').select('*').eq('depense_id', id),
      supabase.from('commentaires')
        .select('*, profils!commentaires_cree_par_fkey(nom_complet)')
        .eq('table_cible', 'depenses').eq('id_cible', id)
        .order('cree_le', { ascending: false }),
      depense.revu_par
        ? supabase.from('profils').select('nom_complet').eq('id', depense.revu_par).single()
        : Promise.resolve({ data: null }),
    ]);

  // Le bucket est privé : on génère des URL signées, valables une heure.
  const fichiers = await Promise.all(
    (justifs ?? []).map(async (j) => {
      const { data } = await supabase.storage
        .from('justificatifs').createSignedUrl(j.chemin, 3600);
      return { ...j, url: data?.signedUrl ?? null };
    })
  );

  // Le propriétaire modifie tout ; le contributeur seulement ses propres
  // saisies encore en attente.
  const peutModifier =
    peut(profil.role, 'depenses', 'update') ||
    (depense.cree_par === profil.id && depense.statut === 'en_attente');

  return (
    <>
      <Header
        titre={depense.fournisseur}
        sousTitre={depense.numero_piece ? `Pièce ${depense.numero_piece}` : 'Détail de la dépense'}
      />
      <div className="content">
        <DetailDepense
          depense={depense as Depense}
          categories={(cats ?? []) as Categorie[]}
          fichiers={fichiers}
          peutModifier={peutModifier}
          peutValider={peut(profil.role, 'depenses', 'validate')}
          peutSupprimer={peut(profil.role, 'depenses', 'delete')}
          peutRevue={peut(profil.role, 'depenses', 'revue')}
          nomRelecteur={relecteur?.nom_complet ?? null}
        />

        <div style={{ marginTop: '1rem' }}>
          <Commentaires
            commentaires={(commentaires ?? []) as Commentaire[]}
            tableCible="depenses"
            idCible={id}
            numeroPiece={depense.numero_piece}
            utilisateurId={profil.id}
            peutCommenter={peut(profil.role, 'commentaires', 'create')}
            peutResoudre={peut(profil.role, 'commentaires', 'update')}
          />
        </div>
      </div>
    </>
  );
}
