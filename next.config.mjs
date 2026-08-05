/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // L'application ne doit jamais apparaître dans un moteur de recherche.
  // Trois barrières : cet en-tête, robots.txt, et la balise meta du layout.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
