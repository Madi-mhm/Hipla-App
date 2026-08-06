import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { statistiquesR2, r2Configure, QUOTA_R2 } from '@/lib/r2';
import Supervision from './Supervision';

export const metadata = { title: 'Supervision — Hipla Gestion' };
export const dynamic = 'force-dynamic';

/** Quotas du palier gratuit Supabase. */
const QUOTA_BASE = 500 * 1024 * 1024;
const QUOTA_STORAGE = 1024 * 1024 * 1024;

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  // Une sauvegarde contient les comptes utilisateurs et le journal d'audit :
  // la page reste réservée au propriétaire.
  if (!peut(profil.role, 'entreprise', 'update')) redirect('/');

  const supabase = await createClient();

  const [stats, tailleBase, sauvegardes, audit, usageIa] = await Promise.all([
    supabase.rpc('statistiques_donnees'),
    supabase.rpc('taille_base'),
    supabase.from('sauvegardes').select('*').order('demarree_le', { ascending: false }).limit(10),
    supabase.from('audit').select('email, action, table_cible, horodatage')
      .order('horodatage', { ascending: false }).limit(20),
    supabase.from('usage_ia')
      .select('id, horodatage, nom_fichier, tokens_entree, tokens_sortie, cout_estime, confiance, succes')
      .order('horodatage', { ascending: false }).limit(20),
  ]);

  let r2 = null;
  let erreurR2: string | null = null;
  if (r2Configure()) {
    try {
      r2 = await statistiquesR2();
    } catch (e) {
      erreurR2 = e instanceof Error ? e.message : 'Connexion à R2 impossible';
    }
  } else {
    erreurR2 = "Identifiants R2 absents des variables d'environnement.";
  }

  return (
    <>
      <Header titre="Supervision" sousTitre="Stockage, sauvegardes et volumétrie" />
      <div className="content">
        <Supervision
          stats={stats.data}
          tailleBase={Number(tailleBase.data ?? 0)}
          quotaBase={QUOTA_BASE}
          quotaStorage={QUOTA_STORAGE}
          quotaR2={QUOTA_R2}
          r2={r2}
          erreurR2={erreurR2}
          sauvegardes={sauvegardes.data ?? []}
          audit={audit.data ?? []}
          usageIa={usageIa.data ?? []}
        />
      </div>
    </>
  );
}
