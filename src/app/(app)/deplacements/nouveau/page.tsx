import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import AvisBareme from '@/components/AvisBareme';
import { aujourdhuiIso } from '@/lib/dates';
import FormulaireDeplacement from './FormulaireDeplacement';
import type { Vehicule } from '@/lib/types';

export const metadata = { title: 'Nouveau trajet — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page(
  { searchParams }: { searchParams: Promise<{ refaire?: string }> },
) {
  const { refaire } = await searchParams;
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'create')) redirect('/deplacements');

  const supabase = await createClient();
  const annee = Number(aujourdhuiIso().slice(0, 4));

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

  /* « Refaire ce trajet » : le même client, la même adresse, souvent le
     même kilométrage — cinquante-deux fois dans l'année pour un contrat
     hebdomadaire. On recopie tout sauf la date, qui repart d'aujourd'hui. */
  const { data: reprise } = refaire
    ? await supabase.from('deplacements')
        .select('depart, arrivee, motif, kilometres, aller_retour, vehicule_id')
        .eq('id', refaire).maybeSingle()
    : { data: null };

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
      <Header section="deplacements"
        titre="Nouveau trajet"
        sousTitre={peut(profil.role, 'depenses', 'validate')
          ? undefined : 'Sera soumis à validation'}
      />
      <div className="content">
        {(bareme ?? []).length === 0 && <AvisBareme annee={annee} />}
        <FormulaireDeplacement
          vehicules={v}
          peutValider={peut(profil.role, 'depenses', 'validate')}
          lieux={((lieux ?? []) as Array<{ lieu: string }>).map((l) => l.lieu)}
          motifs={((motifs ?? []) as Array<{ motif: string }>).map((m) => m.motif)}
          bareme={tranches}
          reprise={reprise ?? null}
          cumulAnnuel={Number(e.cumul_annuel ?? 0)}
        />
      </div>
    </>
  );
}
