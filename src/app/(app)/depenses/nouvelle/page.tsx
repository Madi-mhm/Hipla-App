import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import ChoixSaisie from './ChoixSaisie';
import Extraction from './Extraction';
import FormulaireDepense from './FormulaireDepense';
import type { Categorie } from '@/lib/types';

export const metadata = { title: 'Nouvelle dépense — Hipla Gestion' };
export const dynamic = 'force-dynamic';

/**
 * UNE SEULE ENTRÉE POUR SAISIR
 *
 * « Nouvelle dépense » et « Extraire une facture » étaient deux pages du
 * menu pour un seul geste. Elles sont réunies : on dépose la facture, ou
 * on tape les montants.
 */
export default async function Page({ searchParams }: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'create')) redirect('/depenses');

  const { mode } = await searchParams;
  const supabase = await createClient();
  const [{ data: cats }, { data: usage }] = await Promise.all([
    supabase.from('categories').select('*').eq('actif', true).order('ordre'),
    supabase.rpc('usage_ia_du_mois'),
  ]);

  const categories = (cats ?? []) as Categorie[];
  const peutValider = peut(profil.role, 'depenses', 'validate');

  return (
    <>
      <Header
        section="depenses"
        titre="Nouvelle dépense"
        sousTitre={peutValider ? undefined : 'Sera soumise à validation'}
      />
      <div className="content">
        <ChoixSaisie
          initial={mode === 'manuel' ? 'manuel' : 'facture'}
          facture={
            <Extraction categories={categories} usage={usage}
              utilisateurId={profil.id} peutValider={peutValider} />
          }
          manuel={<FormulaireDepense categories={categories} peutValider={peutValider} />}
        />
      </div>
    </>
  );
}
