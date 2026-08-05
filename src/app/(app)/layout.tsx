import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { profilCourant } from '@/lib/auth';

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

  return (
    <div className="shell">
      <Sidebar role={profil.role} />
      <div className="main">{children}</div>
    </div>
  );
}
