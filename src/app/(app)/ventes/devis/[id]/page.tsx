import { redirect, notFound } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { dateLong } from '@/lib/format';
import DetailDevis, { type Devis, type Ligne, type PrestationDevis } from './DetailDevis';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'ventes', 'read')) redirect('/');

  const supabase = await createClient();

  const [{ data: devis }, { data: lignes }, { data: prestations }] = await Promise.all([
    supabase.from('v_devis').select('*').eq('id', id).maybeSingle(),
    supabase.from('pieces_lignes').select('*').eq('piece_id', id).order('ordre'),
    supabase.from('prestations').select('*').eq('actif', true).order('ordre'),
  ]);

  if (!devis) notFound();

  return (
    <>
      <Header section="ventes"
        titre={devis.numero_piece ?? 'Devis'}
        sousTitre={`${devis.tiers_libelle} · établi le ${dateLong(devis.date_piece)}`}
      />
      <div className="content">
        <DetailDevis
          devis={devis as Devis}
          lignes={(lignes ?? []) as Ligne[]}
          prestations={(prestations ?? []) as PrestationDevis[]}
          peutGerer={peut(profil.role, 'ventes', 'update')}
        />
      </div>
    </>
  );
}
