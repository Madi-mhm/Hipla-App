/**
 * Accès à l'utilisateur connecté depuis un composant serveur.
 */
import { createClient } from '@/lib/supabase/server';
import type { Role } from '@/lib/permissions';

export type Profil = {
  id: string;
  email: string;
  nom_complet: string;
  role: Role;
  actif: boolean;
};

export async function profilCourant(): Promise<Profil | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profils')
    .select('id, email, nom_complet, role, actif')
    .eq('id', user.id)
    .single();

  return (data as Profil) ?? null;
}
