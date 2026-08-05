import type { Metadata } from 'next';
import Sidebar from '@/components/Sidebar';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Hipla Gestion',
  description: "Application de gestion interne de Hipla Services SAS.",
  // Barrière n°1 contre l'indexation. Voir aussi next.config.mjs et robots.txt.
  robots: { index: false, follow: false, nocache: true },
};

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
        <meta name="theme-color" content="#001D3B" />
      </head>
      <body>
        <div className="shell">
          <Sidebar />
          <div className="main">{children}</div>
        </div>
      </body>
    </html>
  );
}
