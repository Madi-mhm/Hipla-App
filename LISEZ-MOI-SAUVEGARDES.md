# Semaine 2 — sauvegardes

Deux fichiers modifiés, une migration livrée à part.

```cmd
cd /d C:\Users\mahdi\Downloads\Hipla-App
git add -A && git commit -m "avant sauvegardes"
tar -xf "%USERPROFILE%\Downloads\hipla-sauvegardes.zip"
npm run build
```

**La migration `085_sauvegarde_complete.sql` doit passer AVANT de lancer une
sauvegarde.** Le code appelle trois fonctions qu'elle crée ; sans elle, la
sauvegarde échoue avec « la migration 085 est-elle appliquée ? ».

---

## Le problème

La sauvegarde portait une liste de 23 tables écrite à la main. La base en
compte 42. Manquaient :

```
pieces  pieces_lignes  reglements  tiers  immobilisations
declarations_tva  prestations  clients  regles_appariement
alias_bancaires  documents_permanents  associes  obligations
relances  devis  factures  lignes_document  bascule_registre
```

C'est-à-dire tout le registre, et vos déclarations de TVA déposées. La liste
nommait encore `depenses`, `frais_creation` et `libelles_bancaires`, vidées ou
renommées depuis. Le cron tournait deux fois par semaine, écrivait « réussie »,
et archivait à peu près rien de ce qui compte.

La restauration avait la même liste, en pire : 18 tables. Elle aurait rendu un
registre vide, sans erreur.

## Ce qui change

**La liste disparaît.** Elle a dérivé une fois, elle dériverait encore. La base
énumère ses propres tables (`tables_publiques`), et l'ordre de restauration se
déduit du graphe des clés étrangères (`ordre_restauration`) plutôt que d'être
tenu à jour à la main. Toute table créée par une migration future entre dans la
sauvegarde sans que personne ait à y penser.

**La pagination.** `select('*')` s'arrête au plafond de PostgREST — mille lignes
par défaut. `audit` le franchira dans l'année. Chaque table est maintenant lue
par lots, et le nombre de lignes lues est comparé au compte exact : s'il manque
une ligne, la sauvegarde **échoue** au lieu de se déclarer réussie sur un dump
amputé. Un succès silencieux sur une copie incomplète est pire qu'une panne :
on croit la copie fidèle.

**Le schéma.** 135 fonctions et 15 vues ne figuraient dans aucune sauvegarde.
`schema_public()` en produit un instantané — définitions de fonctions et de
vues, colonnes, contraintes, index, politiques RLS — archivé à côté des lignes.
Un dump de données sans le schéma qui les fait vivre ne se restaure nulle part.

**Le format passe en version 2.** La restauration accepte encore les dumps
version 1, en prévenant qu'ils sont partiels.

**La restauration compare.** Tables du fichier absentes de la base, tables de la
base absentes du fichier : les deux écarts sont signalés dans `avertissements`.

---

## L'exercice de restauration

Un correctif de sauvegarde non éprouvé n'est qu'une hypothèse. Comptez trente
minutes.

**1. Lancer une sauvegarde.** Page Supervision → Lancer une sauvegarde. Ou :

```
POST /api/cron/sauvegarde
```

La réponse doit annoncer `tables: 42` environ — et non 23.

**2. Créer un projet Supabase vierge.** `hipla-restauration-test`, formule
gratuite, même région.

**3. Y passer les migrations** 001 à 085, dans l'ordre.

**4. Pointer temporairement l'application dessus.** Dans `.env.local`, remplacer
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` et
`SUPABASE_SERVICE_ROLE_KEY` par ceux du projet de test. Garder les vraies
valeurs de côté. **Les identifiants R2 restent inchangés** : c'est là que se
trouve le dump.

**5. Simuler d'abord.**

```
POST /api/restauration
```

Sans `?reel=1`, rien n'est écrit. Lire le rapport : chaque table doit annoncer
le nombre de lignes attendu, et `avertissements` doit être absent.

**6. Appliquer.**

```
POST /api/restauration?reel=1
```

**7. Vérifier.** Se connecter au projet de test et ouvrir `/tableau-de-bord`,
`/depenses`, `/tva`. Les chiffres doivent être ceux de la production. C'est le
seul contrôle qui vaille.

**8. Revenir.** Remettre les valeurs de production dans `.env.local`,
`npm run dev`, vérifier que l'on est bien rentré. Le projet de test peut être
mis en pause — ou gardé pour la prochaine fois.

---

## Ce qui reste hors sauvegarde

À savoir, et à ne pas oublier le jour venu :

- **Les fichiers du bucket Supabase.** Ils sont bien copiés vers R2, mais la
  restauration ne les recopie pas dans le sens inverse — elle le dit. À faire à
  la main, ou à automatiser plus tard.
- **Les comptes `auth.users`.** Volontairement exclus : les identifiants d'un
  projet lui appartiennent. Recréer les comptes, le trigger `creer_profil`
  refait les profils.
- **Les variables d'environnement.** Ni dans le dépôt ni dans la sauvegarde.
  Gardez-en une copie hors ligne.

---

## Vérification après application

La migration se termine par cinq requêtes. Les deux premières comptent :

- **nombre de tables réelles** : environ 42, pas 23 ;
- **`a_sauvegarder` = `a_restaurer`**, et `identiques` à `true`.

La troisième liste les tables que l'ancienne sauvegarde ignorait. Elle est là
pour être lue une fois — c'est ce qui n'était pas archivé.
