import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import GestionUtilisateurs, { type Compte } from './GestionUtilisateurs';

export const metadata = { title: 'Utilisateurs — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'utilisateurs', 'read')) redirect('/');

  const supabase = await createClient();
  const { data } = await supabase
    .from('profils').select('id, email, nom_complet, role, actif, cree_le').order('cree_le');

  return (
    <>
      <Header section="reglages" titre="Utilisateurs" sousTitre="Comptes et niveaux d'accès" />
      <div className="content">
        <GestionUtilisateurs
          comptes={(data ?? []) as Compte[]}
          moi={profil.id}
          peutGerer={peut(profil.role, 'utilisateurs', 'update')}
        />
      </div>
    </>
  );
}
