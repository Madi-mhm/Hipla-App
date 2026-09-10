import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import ListeTiers, { type Activite } from './ListeTiers';
import type { Tiers } from '@/lib/registre';

export const metadata = { title: 'Tiers — Hipla Gestion' };
export const dynamic = 'force-dynamic';

/**
 * TIERS — clients et fournisseurs, un seul référentiel.
 *
 * Il y en avait deux : `clients`, que cet écran modifiait, et `tiers`,
 * que lisent les factures, les devis et les dépenses, reliés par le nom.
 * L'écran travaille désormais directement sur `tiers`. L'ancienne table
 * `clients` est conservée telle quelle, en archive.
 */
export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'clients', 'read')) redirect('/');

  const supabase = await createClient();
  const [{ data: tiers }, { data: pieces }] = await Promise.all([
    supabase.from('tiers').select('*').order('nom'),
    supabase.from('pieces')
      .select('tiers_id, nature, sens, etat, montant_ht, net_a_payer, montant_regle'),
  ]);

  // Toute pièce — même annulée ou brouillon — empêche la suppression :
  // elle garde un lien vers la fiche.
  const activite: Record<string, Activite> = {};
  for (const p of pieces ?? []) {
    if (!p.tiers_id) continue;
    const a = (activite[p.tiers_id] ??= { pieces: 0, facture: 0, du: 0, achats: 0 });
    a.pieces += 1;
    if (p.etat !== 'validee') continue;
    if (p.nature === 'vente') {
      a.facture += Number(p.montant_ht);
      a.du += Math.max(Number(p.net_a_payer) - Number(p.montant_regle), 0);
    } else if (p.nature === 'avoir') {
      a.facture -= Number(p.montant_ht);
    } else if (p.nature === 'achat' || p.nature === 'creation') {
      a.achats += Number(p.montant_ht) * (p.sens === 'credit' ? -1 : 1);
    }
  }

  return (
    <>
      <Header section="tiers" titre="Tiers" sousTitre="Clients et fournisseurs" />
      <div className="content">
        <ListeTiers
          tiers={(tiers ?? []) as Tiers[]}
          activite={activite}
          peutGerer={peut(profil.role, 'clients', 'update')}
        />
      </div>
    </>
  );
}
