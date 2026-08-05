# Hipla Gestion — app.hipla.fr

Application de gestion interne de **Hipla Services SAS**.
Next.js + Supabase, hébergée sur Vercel.

⚠️ Application privée. Ne jamais rendre ce dépôt public : il décrit la
structure des données comptables de l'entreprise.

---

## Démarrer

```bash
npm install
cp .env.local.example .env.local   # puis compléter les valeurs
npm run dev                        # http://localhost:3000
```

Node 18.18 minimum, Node 20+ recommandé.

## Variables d'environnement

| Variable | Nature | Où la saisir |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | publique | `.env.local` + Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publique | `.env.local` + Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | **secrète** | Vercel uniquement |

La clé `anon` est publique par conception : la sécurité repose entièrement sur
les politiques RLS définies en base. La clé `service_role` contourne RLS — elle
ne doit jamais apparaître dans le dépôt ni côté navigateur.

## Déploiement

1. Pousser sur GitHub
2. Importer le dépôt sur Vercel (Next.js détecté automatiquement)
3. Renseigner les trois variables d'environnement
4. Ajouter le domaine `app.hipla.fr` (Settings → Domains)
5. Chez le registrar : `CNAME app → cname.vercel-dns.com`

## Non-indexation

Trois barrières, volontairement redondantes :
- en-tête `X-Robots-Tag` dans `next.config.mjs`
- balise `robots` dans `src/app/layout.tsx`
- `public/robots.txt`

Aucun lien depuis hipla.fr ne doit pointer vers cette application.

## Avancement

| Ronde | Objet | État |
|---|---|---|
| 0 | Fondations, charte, coquille | ✅ |
| 1 | Authentification, rôles, journal d'audit | ⬜ |
| 2 | Dépenses + compression des justificatifs | ⬜ |
| 3 | Frais de création (reprise) | ⬜ |
| 4 | Sauvegardes indépendantes | ⬜ |
| 5 | Abonnements | ⬜ |
| 6 | Synchronisation Qonto | ⬜ |
| 7 | Capture IA des factures | ⬜ |
| 8 | Ventes et facturation Factur-X | ⬜ |
| 9 | Moteur TVA | ⬜ |
| 10 | Échéances et centre d'action | ⬜ |
| 11 | Tableau de bord | ⬜ |
| 12 | Rapport mensuel automatique | ⬜ |
| 13 | Export FEC | ⬜ |

## Structure

```
src/
├── app/          routes (App Router)
├── components/   composants réutilisables
├── lib/
│   ├── supabase/ clients navigateur et serveur
│   └── format.ts formatage monétaire et dates, conventions françaises
└── styles/       jetons de design et styles globaux
```
