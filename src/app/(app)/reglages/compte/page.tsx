import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { profilCourant } from '@/lib/auth';
import { LIBELLE_ROLE } from '@/lib/permissions';
import MonCompte from './MonCompte';

export const metadata = { title: 'Mon compte — Hipla Compta' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');

  return (
    <>
      <Header section="reglages" titre="Mon compte" sousTitre="Mot de passe et double authentification" />
      <div className="content">
        <MonCompte nom={profil.nom_complet} email={profil.email} role={LIBELLE_ROLE[profil.role]} />
      </div>
    </>
  );
}
