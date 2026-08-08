import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import Catalogue from './Catalogue';
import type { Prestation } from '@/lib/types';

export const metadata = { title: 'Prestations — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'prestations', 'read')) redirect('/');

  const supabase = await createClient();
  const [{ data: prestations }, { data: utilisees }] = await Promise.all([
    supabase.from('prestations').select('*').order('ordre'),
    // Les lignes vivent dans `pieces_lignes` depuis la refonte : cet
    // écran croyait qu'aucune prestation n'était utilisée, et proposait
    // donc de les supprimer toutes.
    supabase.from('pieces_lignes').select('prestation_id'),
  ]);

  const idsUtilises = new Set(
    (utilisees ?? []).map((l) => l.prestation_id).filter(Boolean) as string[]
  );

  return (
    <>
      <Header titre="Prestations" sousTitre="Catalogue et tarifs" />
      <div className="content">
        <Catalogue
          prestations={(prestations ?? []) as Prestation[]}
          idsUtilises={Array.from(idsUtilises)}
          peutGerer={peut(profil.role, 'prestations', 'update')}
        />
      </div>
    </>
  );
}
