import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import Echeancier, { type Groupes } from './Echeancier';

export const metadata = { title: 'Échéances — Hipla Gestion' };
export const dynamic = 'force-dynamic';

/**
 * L'ÉCHÉANCIER
 *
 * Tout ce qui a une date, en un seul endroit : obligations
 * déclaratives, prélèvements attendus, factures à encaisser, dettes à
 * payer.
 *
 * Rien n'est stocké en double — la vue calcule depuis les sources
 * existantes. Une échéance saisie deux fois, ou oubliée, vaut moins
 * qu'une échéance déduite.
 */

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'echeances', 'read')) redirect('/');

  const supabase = await createClient();
  const { data } = await supabase.rpc('echeancier', { p_horizon: 365 });

  return (
    <>
      <Header
        titre="Échéances"
        sousTitre="Ce qui vous attend, par ordre d’urgence"
      />
      <div className="content">
        <Echeancier
          groupes={(data ?? {}) as Groupes}
          peutAccomplir={peut(profil.role, 'echeances', 'update')}
        />
      </div>
    </>
  );
}
