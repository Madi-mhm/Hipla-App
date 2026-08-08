import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import TableauFrais from './TableauFrais';
import type { Categorie, FraisCreation } from '@/lib/types';

export const metadata = { title: 'Frais de création — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'read')) redirect('/');

  const supabase = await createClient();

  // `frais_creation` ne reçoit plus rien depuis la bascule : les
  // chiffres concordent aujourd'hui par recopie, mais un frais saisi
  // désormais n'y figurerait pas.
  const [{ data: pieces }, { data: cats }] = await Promise.all([
    supabase.from('pieces')
      .select('*, categories(libelle)')
      .eq('nature', 'creation')
      .neq('etat', 'annulee')
      .order('date_piece'),
    supabase.from('categories').select('*').eq('actif', true).order('ordre'),
  ]);

  // L'écran raisonne dans le vocabulaire d'avant. On traduit plutôt que
  // de le récrire : le module des frais de création n'a plus vocation à
  // évoluer, il ne sert qu'à la ratification.
  type Piece = {
    id: string; numero_piece: string | null; date_piece: string;
    tiers_libelle: string; objet: string | null; categorie_id: string | null;
    montant_ht: number; taux_tva: number; montant_tva: number;
    montant_ttc: number; tva_comptable: number;
    paye_par: string | null; moyen_paiement: string | null;
    etat: string; compte: string | null; notes: string | null;
    categories?: { libelle: string };
  };

  const frais = ((pieces ?? []) as Piece[]).map((p) => ({
    id: p.id,
    numero_piece: p.numero_piece,
    date_engagement: p.date_piece,
    fournisseur: p.tiers_libelle,
    libelle: p.objet,
    categorie_id: p.categorie_id,
    montant_ht: Number(p.montant_ht),
    taux_tva: Number(p.taux_tva),
    montant_tva: Number(p.montant_tva),
    montant_ttc: Number(p.montant_ttc),
    tva_deductible: Number(p.tva_comptable),
    // La TVA n'est acquise qu'après ratification : tant que l'écriture
    // attend l'assemblée, elle reste à confirmer.
    tva_a_confirmer: p.etat === 'a_valider',
    associe_payeur: (p.paye_par ?? 'mahdi') as 'mahdi' | 'sabir',
    nature: 'creation' as const,
    mode_reprise: 'ag_ratification' as const,
    statut_reprise: (p.etat === 'validee' ? 'repris'
                   : p.etat === 'rejetee' ? 'rejete' : 'a_valider') as
                   'a_valider' | 'repris' | 'rejete',
    type_comptable: (String(p.compte ?? '6').startsWith('2')
                   ? 'immobilisation' : 'charge') as 'charge' | 'immobilisation',
    compte: p.compte ?? '',
    notes: p.notes,
    categories: p.categories,
  }));

  return (
    <>
      <Header
        titre="Frais de création"
        sousTitre="Dépenses engagées avant l'immatriculation du 29 juillet 2026"
      />
      <div className="content">
        <TableauFrais
          frais={frais as FraisCreation[]}
          categories={(cats ?? []) as Categorie[]}
          peutModifier={peut(profil.role, 'depenses', 'update')}
        />
      </div>
    </>
  );
}
