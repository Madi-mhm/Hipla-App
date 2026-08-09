import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import ListeDevis, { type LigneDevis, type ClientDevis } from './ListeDevis';

export const metadata = { title: 'Devis — Hipla Gestion' };
export const dynamic = 'force-dynamic';

/**
 * LES DEVIS
 *
 * Six de vos quinze prestations sont au forfait — nettoyage de bureaux,
 * fin de chantier, débarras, fin de bail, copropriété, déplacement hors
 * zone. Elles se chiffrent au cas par cas, et le parcours vente
 * commençait pourtant à la facture.
 *
 * Le client vient de `tiers`, et non de `clients`. Les deux tables
 * coexistent, reliées par le nom, et c'est `tiers` que le registre
 * référence : `creer_devis` y cherche son client. Passer par `clients`
 * obligerait à retraverser ce lien fragile à chaque écran.
 */
export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'ventes', 'read')) redirect('/');

  const supabase = await createClient();

  const [{ data: devis }, { data: clients }] = await Promise.all([
    supabase.from('v_devis').select('*').order('date_piece', { ascending: false }),
    supabase.from('tiers').select('id, nom')
      .eq('est_client', true).order('nom'),
  ]);

  return (
    <>
      <Header titre="Devis" sousTitre="Chiffrer avant de facturer" />
      <div className="content">
        <ListeDevis
          devis={(devis ?? []) as LigneDevis[]}
          clients={(clients ?? []) as ClientDevis[]}
          peutGerer={peut(profil.role, 'ventes', 'create')}
        />
      </div>
    </>
  );
}
