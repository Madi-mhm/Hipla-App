import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import Relances, { type Relance } from '@/components/accueil/Relances';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';

export const metadata = { title: 'Relances — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'ventes', 'read')) redirect('/');

  const supabase = await createClient();
  const { data } = await supabase.rpc('a_relancer');
  const lignes = (data ?? []) as Relance[];

  return (
    <>
      <Header section="ventes" titre="Relances" sousTitre="Factures émises non réglées" />
      <div className="content">
        {lignes.length === 0 ? (
          <div className="card">
            <div className="etat-vide">
              <p>Aucune facture à relancer.</p>
              <p className="muted">Toutes les factures émises sont réglées ou pas encore échues.</p>
            </div>
          </div>
        ) : (
          <Relances lignes={lignes} peutRelancer={peut(profil.role, 'ventes', 'update')} />
        )}
      </div>
    </>
  );
}
