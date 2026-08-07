import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import GestionRegles, { type Regle, type Alias } from './GestionRegles';
import type { Categorie } from '@/lib/types';

export const metadata = { title: 'Règles d\u2019appariement — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'banque', 'read')) redirect('/');

  const supabase = await createClient();

  const [{ data: regles }, { data: alias }, { data: cats }] = await Promise.all([
    supabase.from('regles_appariement').select('*').order('ordre').order('libelle'),
    supabase.from('alias_bancaires')
      .select('*, tiers(nom)')
      .order('occurrences', { ascending: false })
      .order('derniere_le', { ascending: false })
      .limit(100),
    supabase.from('categories').select('*').eq('actif', true).order('ordre'),
  ]);

  return (
    <>
      <Header
        titre="Règles d’appariement"
        sousTitre="Ce que le système reconnaît tout seul"
      />
      <div className="content">
        <GestionRegles
          regles={(regles ?? []) as Regle[]}
          alias={(alias ?? []) as Alias[]}
          categories={(cats ?? []) as Categorie[]}
          peutGerer={peut(profil.role, 'banque', 'update')}
        />
      </div>
    </>
  );
}
