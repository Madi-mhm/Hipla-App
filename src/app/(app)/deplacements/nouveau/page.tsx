import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import FormulaireDeplacement from './FormulaireDeplacement';
import type { Vehicule } from '@/lib/types';

export const metadata = { title: 'Nouveau trajet — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'create')) redirect('/deplacements');

  const supabase = await createClient();
  const annee = new Date().getFullYear();

  const [{ data: vehicules }, { data: lieux }, { data: motifs },
         { data: bareme }, { data: etat }] = await Promise.all([
    supabase.from('vehicules').select('*').eq('actif', true).order('libelle'),
    // L'autocomplétion apprend de l'historique et des villes des clients.
    supabase.rpc('lieux_frequents'),
    supabase.rpc('motifs_frequents'),
    supabase.from('bareme_km')
      .select('km_min, km_max, coefficient, forfait, cv_min, cv_max')
      .eq('annee', annee).order('km_min'),
    supabase.rpc('km_a_constater'),
  ]);

  const v = (vehicules ?? []) as Vehicule[];
  const cv = v[0]?.cv_fiscaux ?? 5;

  // Le barème du véhicule : la puissance fiscale commande les tranches.
  const tranches = ((bareme ?? []) as Array<{
    km_min: number; km_max: number | null; coefficient: number;
    forfait: number; cv_min: number; cv_max: number;
  }>).filter((b) => cv >= b.cv_min && cv <= b.cv_max);

  const e = (etat ?? {}) as Record<string, number>;

  return (
    <>
      <Header
        titre="Nouveau trajet"
        sousTitre={peut(profil.role, 'depenses', 'validate')
          ? undefined : 'Sera soumis à validation'}
      />
      <div className="content">
        <FormulaireDeplacement
          vehicules={v}
          peutValider={peut(profil.role, 'depenses', 'validate')}
          lieux={((lieux ?? []) as Array<{ lieu: string }>).map((l) => l.lieu)}
          motifs={((motifs ?? []) as Array<{ motif: string }>).map((m) => m.motif)}
          bareme={tranches}
          cumulAnnuel={Number(e.cumul_annuel ?? 0)}
        />
      </div>
    </>
  );
}
