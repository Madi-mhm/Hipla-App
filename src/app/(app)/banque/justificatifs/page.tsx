import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import JustificatifsQonto from './JustificatifsQonto';
import type { Categorie } from '@/lib/types';

export const metadata = { title: 'Justificatifs Qonto — Hipla Gestion' };
export const dynamic = 'force-dynamic';

/**
 * Type réel du fichier.
 *
 * Qonto ne renseigne pas toujours `file_content_type`, et le repli sur
 * « application/pdf » faisait annoncer une image comme un PDF : le
 * service d'extraction recevait des octets PNG dans un bloc document et
 * répondait 400. L'extension est ici plus fiable que la banque.
 */
function typeReel(declare: string | null | undefined, nom: string | null | undefined): string {
  const ext = (nom ?? '').toLowerCase().split('.').pop() ?? '';
  const parExtension: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    heic: 'image/heic',
  };

  const deduit = parExtension[ext];
  if (deduit) return deduit;
  // Sans extension exploitable, on garde ce que la banque annonce.
  return declare ?? 'application/pdf';
}

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'banque', 'update')) redirect('/banque');

  const supabase = await createClient();

  const [{ data: enAttente }, { data: cats }] = await Promise.all([
    supabase.from('v_justificatifs_qonto').select('*').order('date_operation', { ascending: false }),
    supabase.from('categories').select('*').eq('actif', true).order('ordre'),
  ]);

  // Le bucket est privé : une URL signée d'une heure permet l'affichage.
  const lignes = await Promise.all(
    (enAttente ?? []).map(async (t) => {
      const { data: tx } = await supabase
        .from('transactions_qonto')
        .select('chemin_justificatif, type_justificatif, nom_justificatif')
        .eq('id', t.id).single();

      let url: string | null = null;
      if (tx?.chemin_justificatif) {
        const { data } = await supabase.storage
          .from('justificatifs')
          .createSignedUrl(tx.chemin_justificatif, 3600);
        url = data?.signedUrl ?? null;
      }

      // Une écriture correspond-elle déjà à cette opération ?
      //
      // `chercher_depense` interrogeait l'ancienne table, vidée depuis
      // la bascule : elle ne trouvait donc plus jamais rien, et l'écran
      // proposait de créer une écriture déjà existante.
      // D'ABORD : une écriture est-elle DÉJÀ rattachée à cette opération ?
      //
      // Le moteur d'appariement écarte, à dessein, toute écriture déjà
      // rapprochée — il cherche des liens à établir, pas à constater.
      // Mais la question posée ici est autre : à quelle écriture ce
      // fichier appartient-il ? Quand le rapprochement existe, la
      // réponse est acquise et il ne manque que la pièce jointe.
      const { data: dejaLiee } = await supabase
        .from('reglements')
        .select('piece_id, pieces(id, numero_piece, tiers_libelle, montant_ttc, etat)')
        .eq('transaction_id', t.id)
        .limit(1).maybeSingle();

      const liee = Array.isArray(dejaLiee?.pieces)
        ? dejaLiee?.pieces[0]
        : dejaLiee?.pieces;

      const { data: cands } = liee ? { data: [] } : await supabase.rpc(
        'candidats_pour_transaction', { p_transaction: t.id });
      const certains = ((cands ?? []) as Array<{
        piece_id: string; numero_piece: string | null; tiers: string;
        reste_du: number; decision: string;
      }>).filter((c) => c.decision === 'automatique' || c.decision === 'propose');

      const corr = liee
        ? {
            resultat: 'correspondance_forte',
            depense_id: liee.id,
            // Une écriture en attente de validation n'a pas encore de
            // numéro : le dire vaut mieux qu'un tiret muet.
            numero_piece: liee.numero_piece ?? 'en attente de validation',
            fournisseur: liee.tiers_libelle,
            montant_ttc: liee.montant_ttc,
          }
        : certains.length > 0
          ? {
              resultat: certains.length === 1 ? 'correspondance_forte' : 'plusieurs',
              depense_id: certains[0].piece_id,
              numero_piece: certains[0].numero_piece ?? 'en attente de validation',
              fournisseur: certains[0].tiers,
              montant_ttc: certains[0].reste_du,
            }
          : null;

      return {
        ...t,
        url,
        typeMime: typeReel(tx?.type_justificatif, tx?.nom_justificatif ?? t.nom_justificatif),
        correspondance: corr,
      };
    })
  );

  return (
    <>
      <Header
        titre="Justificatifs Qonto"
        sousTitre="Pièces déposées dans la banque, en attente de traitement"
      />
      <div className="content">
        <JustificatifsQonto
          lignes={lignes}
          categories={(cats ?? []) as Categorie[]}
          peutValider={peut(profil.role, 'depenses', 'validate')}
        />
      </div>
    </>
  );
}
