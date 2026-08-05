/**
 * Client Supabase côté serveur (composants serveur, routes, actions).
 * Lit et écrit la session dans les cookies.
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieAPoser = {
  name: string;
  value: string;
  options?: CookieOptions;
};

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesAPoser: CookieAPoser[]) {
          try {
            cookiesAPoser.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Appelé depuis un composant serveur : le middleware rafraîchira
            // la session. Sans conséquence.
          }
        },
      },
    }
  );
}
