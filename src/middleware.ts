/**
 * Middleware — mur d'authentification.
 *
 * Toute route est protégée sauf /connexion et /auth/*. Un visiteur non
 * authentifié est redirigé vers la page de connexion. Rafraîchit aussi la
 * session à chaque requête pour éviter les expirations en cours d'usage.
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIQUES = ['/connexion', '/auth'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookies: { name: string; value: string; options?: CookieOptions }[]) {
          cookies.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookies.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const chemin = request.nextUrl.pathname;
  const estPublique = PUBLIQUES.some((p) => chemin.startsWith(p));

  if (!user && !estPublique) {
    const url = request.nextUrl.clone();
    url.pathname = '/connexion';
    url.searchParams.set('suite', chemin);
    return NextResponse.redirect(url);
  }

  if (user && chemin === '/connexion') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|webp)$).*)'],
};
