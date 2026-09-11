# Hipla Gestion — app.hipla.fr

Application de gestion et de comptabilité de **Hipla Services SAS**.
Next.js 15 + Supabase (PostgreSQL), hébergée sur Vercel.

⚠️ Dépôt privé : il décrit la structure des données comptables de l'entreprise.

---

## Démarrer en local

```bash
npm install
cp .env.local.example .env.local   # puis compléter les valeurs
npm run dev                        # http://localhost:3000
```

Node 20 ou plus.

## Variables d'environnement

| Variable | Où | Rôle |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | local + Vercel | Accès à la base, protégé par RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | local + Vercel | Synchronisation Qonto et sauvegardes (contourne RLS : jamais côté navigateur) |
| `CRON_SECRET` | local + Vercel | **Obligatoire.** Sans lui, les tâches planifiées sont refusées |
| `QONTO_LOGIN`, `QONTO_SECRET_KEY` | local + Vercel | Lecture des opérations bancaires (clé en lecture seule) |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | local + Vercel | Archive des sauvegardes (Cloudflare R2) |
| `ANTHROPIC_API_KEY` | local + Vercel | Lecture automatique des factures |
| `DATABASE_URL` | **local uniquement** | Connexion directe à PostgreSQL, pour appliquer les migrations |

## Organisation de l'application

Neuf sections, définies dans `src/lib/navigation.ts` (menu et onglets
lisent cette seule liste) :

| Section | Contenu |
|---|---|
| Accueil | Chiffres clés, ce qui attend une décision, relances, échéances, analyse |
| Banque | Opérations Qonto, rapprochement, justificatifs déposés dans Qonto |
| Dépenses | Liste, saisie (manuelle ou lecture de facture), duplication, frais de création |
| Déplacements | Trajets et indemnités kilométriques |
| Ventes | Factures, avoirs, devis, relances |
| Tiers | Clients et fournisseurs |
| TVA | Suivi et déclarations |
| Comptabilité | Journal, exports et FEC, rapports mensuels, associés, immobilisations, échéances, clôture (calendrier des obligations, écritures de fin d'exercice, impôt, verrou), liasse (2033-A à G, 2065, CA12E case par case) |
| Réglages | Mon compte (double authentification), entreprise, utilisateurs, catégories, prestations, véhicules, documents, audit, sauvegardes |

## La base de données

Toute la logique comptable vit en base : fonctions SQL (création des
pièces, TVA, journal/FEC, rapprochement), déclencheurs et politiques RLS.

- `supabase/schema/schema_public.sql` — **schéma complet exporté de la
  production** (tables, contraintes, fonctions, vues, déclencheurs,
  politiques, droits). Ne pas modifier à la main ; le régénérer après
  chaque migration.
- `supabase/migrations/` — les changements, datés. Chaque migration est
  d'abord exécutée dans une transaction annulée, avec des contrôles
  chiffrés, puis appliquée seulement si tous les contrôles passent.

Principes qui ne se négocient pas :
- une facture émise ne s'annule pas : elle se corrige par un **avoir** ;
- une pièce validée garde son numéro ; seul un brouillon se supprime ;
- la TVA des services est exigible à l'**encaissement** ;
- les dates « du jour » sont celles de **Paris** (`src/lib/dates.ts`).

## Sécurité

- Aucun accès anonyme : la clé publique n'ouvre ni table, ni vue, ni fonction.
- Inscription publique fermée ; un compte créé naît inactif, sans rôle choisi.
- Double authentification : une fois activée, la base refuse tout droit à
  une session qui n'a pas saisi le code (`a_permission`).
- Les droits par rôle sont dans la table `permissions`, lue par `a_permission`.

## Tâches planifiées (Vercel)

| Tâche | Route | Horaire (UTC) |
|---|---|---|
| Synchronisation Qonto | `/api/qonto` | tous les jours, 04:00 |
| Sauvegarde vers R2 | `/api/cron/sauvegarde` | dimanche et mercredi, 03:00 |

Elles se déclenchent aussi à la main (bouton « Synchroniser » en Banque,
« Sauvegarder maintenant » en Réglages → Sauvegardes) ou depuis Vercel →
Settings → Cron Jobs → Run.

## Déploiement

`git push origin main` : Vercel construit et publie automatiquement.
L'application ne doit jamais apparaître dans un moteur de recherche
(`X-Robots-Tag`, balise `robots`, `public/robots.txt`).
