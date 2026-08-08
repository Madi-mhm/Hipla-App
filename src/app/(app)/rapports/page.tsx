import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import Rapports, { type Mois } from './Rapports';

export const metadata = { title: 'Rapports mensuels — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'exports', 'read')) redirect('/');

  const supabase = await createClient();
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const { data: exercice } = await supabase.from('exercices')
    .select('date_debut, date_fin')
    .lte('date_debut', aujourdhui).gte('date_fin', aujourdhui)
    .limit(1).maybeSingle();

  // Un rapport ne se produit que sur un mois ACHEVÉ : sur un mois en
  // cours, les chiffres changeraient encore après l'envoi.
  const debut = new Date(exercice?.date_debut ?? aujourdhui);
  const finMoisDernier = new Date();
  finMoisDernier.setDate(0);

  const mois: Mois[] = [];
  const curseur = new Date(debut.getFullYear(), debut.getMonth(), 1);
  while (curseur <= finMoisDernier) {
    mois.push({
      periode: `${curseur.getFullYear()}-${String(curseur.getMonth() + 1).padStart(2, '0')}`,
      libelle: curseur.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
    });
    curseur.setMonth(curseur.getMonth() + 1);
  }

  return (
    <>
      <Header
        titre="Rapports mensuels"
        sousTitre="Un récapitulatif par mois achevé"
      />
      <div className="content">
        <Rapports mois={mois.reverse()} />
      </div>
    </>
  );
}
