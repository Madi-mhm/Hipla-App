import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { statutVente, natureVente } from '@/lib/registre';
import ListeFactures from './ListeFactures';
import type { Facture, Client, Prestation } from '@/lib/types';

export const metadata = { title: 'Ventes — Hipla Gestion' };
export const dynamic = 'force-dynamic';

/**
 * Les ventes vivent désormais dans le registre.
 *
 * `ListeFactures.tsx` n'est pas modifié : cette page lui reconstitue la
 * forme qu'il attend. Un écran de liste n'a pas à savoir dans quelle
 * table ses données sont rangées, et ne pas y toucher, c'est ne pas
 * pouvoir y introduire d'erreur.
 */
export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'ventes', 'read')) redirect('/');

  const supabase = await createClient();

  const [{ data: pieces }, { data: clients }, { data: prestations }, { data: etat }] =
    await Promise.all([
      supabase.from('pieces')
        .select('*, tiers(nom, type, email)')
        .in('nature', ['vente', 'avoir'])
        .order('date_piece', { ascending: false })
        .limit(200),
      supabase.from('clients').select('*').eq('actif', true).order('nom'),
      supabase.from('prestations').select('*').eq('actif', true).order('ordre'),
      supabase.rpc('etat_ventes'),
    ]);

  // « Impayée » et « partielle » ne sont plus des statuts stockés mais
  // des comparaisons. Aucun balayage nocturne n'a plus à les réparer.
  const factures = (pieces ?? []).map((p) => ({
    id: p.id,
    numero_piece: p.numero_piece,
    client_id: p.tiers_id,
    devis_id: null,
    nature: natureVente(p),
    facture_liee_id: p.piece_liee_id,

    date_emission: p.date_piece,
    date_echeance: p.date_echeance,
    delai_paiement: p.delai_paiement,
    date_prestation: p.date_prestation,
    periode_debut: p.periode_debut,
    periode_fin: p.periode_fin,

    objet: p.objet,
    conditions: null,

    montant_ht: p.montant_ht,
    montant_tva: p.montant_tva,
    montant_ttc: p.montant_ttc,
    acomptes_deduits: p.acomptes_deduits,
    net_a_payer: p.net_a_payer,

    statut: statutVente(p),

    encaisse_le: p.paye_le,
    montant_encaisse: p.montant_regle,
    mode_encaissement: p.moyen_paiement,

    transaction_qonto_id: p.transaction_id,
    statut_rapprochement: p.transaction_id ? 'confirme' : 'sans_transaction',
    transaction_proposee_id: null,

    relances_envoyees: p.relances_envoyees ?? 0,
    derniere_relance: p.derniere_relance,

    motif_annulation: p.motif_annulation,
    annule_le: p.annule_le,
    mentions_gelees: p.mentions_gelees,
    emise_le: p.emise_le,

    notes: p.notes,
    cree_par: p.cree_par,
    cree_le: p.cree_le,
    modifie_le: p.modifie_le,

    clients: p.tiers,
  }));

  return (
    <>
      <Header titre="Ventes" sousTitre="Factures, devis et encaissements" />
      <div className="content">
        <ListeFactures
          factures={factures as unknown as Facture[]}
          clients={(clients ?? []) as Client[]}
          prestations={(prestations ?? []) as Prestation[]}
          etat={etat}
          peutGerer={peut(profil.role, 'ventes', 'update')}
        />
      </div>
    </>
  );
}
