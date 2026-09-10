import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import GestionVehicules, { type LigneBareme } from './GestionVehicules';
import type { Vehicule } from '@/lib/types';

export const metadata = { title: 'Véhicules — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'read')) redirect('/');

  const supabase = await createClient();
  const [{ data: veh }, { data: bar }, { data: trajets }] = await Promise.all([
    supabase.from('vehicules').select('*').order('libelle'),
    supabase.from('bareme_km').select('*').order('annee').order('cv_min').order('km_min'),
    supabase.from('deplacements').select('vehicule_id'),
  ]);

  const usage: Record<string, number> = {};
  for (const t of trajets ?? []) usage[t.vehicule_id] = (usage[t.vehicule_id] ?? 0) + 1;

  return (
    <>
      <Header section="reglages" titre="Véhicules"
        sousTitre="Véhicules utilisés à titre professionnel et barème kilométrique" />
      <div className="content">
        <GestionVehicules
          vehicules={(veh ?? []) as Vehicule[]}
          bareme={(bar ?? []) as LigneBareme[]}
          usage={usage}
          peutGerer={peut(profil.role, 'depenses', 'update')}
        />
      </div>
    </>
  );
}
