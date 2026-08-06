import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import Extraction from './Extraction';
import type { Categorie } from '@/lib/types';

export const metadata = { title: 'Extraire une facture — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'create')) redirect('/depenses');

  const supabase = await createClient();
  const [{ data: cats }, { data: usage }] = await Promise.all([
    supabase.from('categories').select('*').eq('actif', true).order('ordre'),
    supabase.rpc('usage_ia_du_mois'),
  ]);

  return (
    <>
      <Header
        titre="Extraire une facture"
        sousTitre="Photographiez ou déposez un document, les champs sont remplis automatiquement"
      />
      <div className="content">
        <Extraction
          categories={(cats ?? []) as Categorie[]}
          usage={usage}
          utilisateurId={profil.id}
          peutValider={peut(profil.role, 'depenses', 'validate')}
        />
      </div>
    </>
  );
}
