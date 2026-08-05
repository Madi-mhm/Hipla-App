/**
 * Client Supabase côté navigateur.
 *
 * N'utilise que la clé « anon », publique par conception. Toute la sécurité
 * repose sur les politiques RLS définies en base : une clé anon sans politique
 * ne donne accès à rien. La clé service_role ne doit JAMAIS arriver ici.
 */
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
