import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Hipla Gestion',
  description: "Application de gestion interne de Hipla Services SAS.",
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#001D3B',
  // Autorise le zoom : c'est une exigence d'accessibilité, et sur des
  // tableaux de chiffres c'est souvent utile.
  maximumScale: 5,
};

/**
 * Layout racine : uniquement <html> et <body>.
 * La coquille applicative (barre latérale, en-tête) vit dans le groupe
 * de routes (app), pour que /connexion s'affiche sans elle.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&family=Karla:wght@400;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
