import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import BarreProgression from '@/components/BarreProgression';
import { profilCourant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { aujourdhuiIso } from '@/lib/dates';

/**
 * Coquille des pages authentifiées.
 * Le middleware bloque déjà l'accès sans session ; cette seconde
 * vérification garantit qu'aucune donnée n'est rendue si le profil
 * est absent ou désactivé.
 */
export default async function LayoutApplication({
  children,
}: {
  children: React.ReactNode;
}) {
  const profil = await profilCourant();
  if (!profil || !profil.actif) redirect('/connexion');

  // L'exercice couvrant aujourd'hui, pour le pied du menu. Il était écrit
  // en dur (« 2026–2027 ») et serait resté faux au second exercice.
  const supabase = await createClient();

  // Double authentification activée mais code non saisi : retour à
  // l'étape du code. La base refuse de son côté tout droit à une telle
  // session ; ceci évite d'afficher des pages vides.
  const { data: niveau } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (niveau && niveau.nextLevel === 'aal2' && niveau.currentLevel !== 'aal2') {
    redirect('/connexion/code');
  }

  const jour = aujourdhuiIso();
  const { data: ex } = await supabase.from('exercices')
    .select('date_debut, date_fin')
    .lte('date_debut', jour).gte('date_fin', jour)
    .limit(1).maybeSingle();
  const fr = (d: string) => d.split('-').reverse().join('/');
  const exercice = ex ? `Exercice du ${fr(ex.date_debut)} au ${fr(ex.date_fin)}` : null;

  return (
    <div className="shell">
      <BarreProgression />
      <Sidebar role={profil.role} exercice={exercice} />
      <div className="main">{children}</div>
    </div>
  );
}