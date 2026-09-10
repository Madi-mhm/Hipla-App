/** @type {import('next').NextConfig} */

// Anciennes adresses → nouvelles sections. Les favoris et les liens
// déjà envoyés continuent de mener quelque part.
const ANCIENNES_ADRESSES = [
  ['/seance', '/'],
  ['/tableau-de-bord', '/'],
  ['/comptable', '/'],
  ['/taches', '/'],
  ['/abonnements', '/depenses'],
  ['/contrats', '/ventes'],
  ['/reglages', '/reglages/entreprise'],
  ['/reglages/regles', '/banque'],
  ['/reglages/supervision', '/reglages/sauvegardes'],
  ['/coffre', '/reglages/documents'],
  ['/clients', '/tiers'],
  ['/devis', '/ventes/devis'],
  ['/devis/:id', '/ventes/devis/:id'],
  ['/exports', '/comptabilite/exports'],
  ['/exports/journal', '/comptabilite'],
  ['/rapports', '/comptabilite/rapports'],
  ['/associes', '/comptabilite/associes'],
  ['/associes/:id', '/comptabilite/associes/:id'],
  ['/immobilisations', '/comptabilite/immobilisations'],
  ['/echeances', '/comptabilite/echeances'],
  ['/frais-creation', '/depenses/creation'],
  ['/depenses/extraire', '/depenses/nouvelle'],
];

const nextConfig = {
  reactStrictMode: true,

  // @react-pdf/renderer est un paquet lourd et non bundlable : il doit
  // rester externe au bundle serveur, sinon la compilation échoue sur
  // Vercel.
  serverExternalPackages: ['@react-pdf/renderer'],

  async redirects() {
    return ANCIENNES_ADRESSES.map(([source, destination]) => ({
      source, destination, permanent: false,
    }));
  },

  // Les en-têtes de sécurité et de non-indexation sont posés dans
  // vercel.json ; les répéter ici les doublait dans chaque réponse.
};

export default nextConfig;
