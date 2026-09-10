import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import ChoixSaisie from './ChoixSaisie';
import Extraction from './Extraction';
import FormulaireDepense, { type ValeursInitiales, type FournisseurConnu } from './FormulaireDepense';
import type { Categorie } from '@/lib/types';

export const metadata = { title: 'Nouvelle dépense — Hipla Gestion' };
export const dynamic = 'force-dynamic';

/**
 * UNE SEULE ENTRÉE POUR SAISIR
 *
 * « Nouvelle dépense » et « Extraire une facture » étaient deux pages du
 * menu pour un seul geste. Elles sont réunies : on dépose la facture, ou
 * on tape les montants.
 *
 * `?depuis=<id>` reprend une dépense existante — c'est ce qui remplace
 * les abonnements : l'hébergement du mois se duplique en deux clics.
 */
export default async function Page({ searchParams }: {
  searchParams: Promise<{ mode?: string; depuis?: string }>;
}) {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'create')) redirect('/depenses');

  const { mode, depuis } = await searchParams;
  const supabase = await createClient();
  const [{ data: cats }, { data: usage }, { data: source }, { data: fourn }] = await Promise.all([
    supabase.from('categories').select('*').eq('actif', true).order('ordre'),
    supabase.rpc('usage_ia_du_mois'),
    depuis
      ? supabase.from('pieces')
          .select('numero_piece, nature, tiers_libelle, objet, categorie_id, montant_ttc, taux_tva, moyen_paiement, paye_par, notes')
          .eq('id', depuis).in('nature', ['achat', 'creation']).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('tiers').select('nom, pays_code')
      .eq('est_fournisseur', true).eq('actif', true).order('nom'),
  ]);

  const categories = (cats ?? []) as Categorie[];
  const peutValider = peut(profil.role, 'depenses', 'validate');

  const initial: ValeursInitiales | undefined = source ? {
    fournisseur: source.tiers_libelle ?? '',
    libelle: source.objet ?? '',
    categorieId: categories.some((c) => c.id === source.categorie_id) ? source.categorie_id : '',
    montantTtc: Number(source.montant_ttc),
    tauxTva: Number(source.taux_tva),
    moyenPaiement: source.moyen_paiement ?? 'carte',
    payePar: source.paye_par ?? 'societe',
    notes: '',
  } : undefined;

  return (
    <>
      <Header
        section="depenses"
        titre={source ? `Nouvelle dépense — copie de ${source.numero_piece ?? 'brouillon'}` : 'Nouvelle dépense'}
        sousTitre={peutValider ? undefined : 'Sera soumise à validation'}
      />
      <div className="content">
        <ChoixSaisie
          initial={mode === 'manuel' || source ? 'manuel' : 'facture'}
          facture={
            <Extraction categories={categories} usage={usage}
              utilisateurId={profil.id} peutValider={peutValider} />
          }
          manuel={
            <FormulaireDepense categories={categories} peutValider={peutValider} initial={initial}
              fournisseurs={(fourn ?? []) as FournisseurConnu[]} />
          }
        />
      </div>
    </>
  );
}
