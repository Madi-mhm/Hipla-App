import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import GestionCategories from './GestionCategories';
import type { Categorie } from '@/lib/types';

export const metadata = { title: 'Catégories — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'read')) redirect('/');

  const supabase = await createClient();
  const [{ data }, { data: pieces }] = await Promise.all([
    supabase.from('categories').select('*').order('ordre'),
    supabase.from('pieces').select('categorie_id').not('categorie_id', 'is', null),
  ]);

  // Une catégorie utilisée par une pièce ne se supprime pas : elle
  // s'archive, pour que l'export FEC garde son compte.
  const usage: Record<string, number> = {};
  for (const p of pieces ?? []) usage[p.categorie_id] = (usage[p.categorie_id] ?? 0) + 1;

  const categories = (data ?? []) as Categorie[];

  return (
    <>
      <Header section="reglages" titre="Catégories"
        sousTitre={`${categories.filter((c) => c.actif).length} actives · plan comptable`} />
      <div className="content">
        <GestionCategories categories={categories} usage={usage}
          peutGerer={peut(profil.role, 'depenses', 'update')} />
      </div>
    </>
  );
}
