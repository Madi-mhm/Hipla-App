# Avant le premier client — le dernier paquet

**Migration 100 d'abord**, puis 5 fichiers.

```
1. Supabase → SQL Editor → 100_indemnites_km.sql
2. cd /d C:\Users\mahdi\Downloads\Hipla-App
   git add -A && git commit -m "avant demarrage"
   tar -xf "%USERPROFILE%\Downloads\hipla-avant-demarrage.zip"
   npm run build
```

Ce paquet **remplace et contient** `hipla-piece-id.zip`. Si vous ne l'aviez
pas appliqué, c'est fait ici.

---

## Pourquoi ces deux-là, et rien d'autre

Le bilan listait une quinzaine de points. Deux seulement écrivent des données
fausses — le reste affiche des chiffres faux, ce qui se corrige n'importe
quand. **Une écriture validée, elle, ne se reprend pas : elle s'annule et se
refait.**

## 1. Les indemnités kilométriques — migration 100

**L'associé était écrit en dur.** L'écriture se terminait par
`'avance_associe', 'mahdi'`, quel que soit le conducteur. Le jour où Sabir
roule pour la société, ses kilomètres créditent votre compte courant : la
société doit alors de l'argent à la mauvaise personne, et l'écriture est
validée.

L'associé vient désormais du **propriétaire du véhicule**, à défaut de
l'auteur des trajets. Si aucun ne se laisse désigner, la fonction refuse au
lieu de choisir.

**La majoration électrique de 20 %** — que l'écran affiche et que le barème
prévoit — n'était jamais appliquée à l'écriture. Elle l'est.

**Une période à cheval sur deux années** consommait les trajets de décembre
sans les indemniser : le cumul annuel filtrait sur l'année de fin, pas les
kilomètres de la période. Refusée désormais, avec l'explication.

**Deux véhicules sur une même période** recevaient tous le barème du plus
utilisé. Refusé également : la puissance fiscale change l'indemnité.

> ⚠️ La dernière requête de vérification affiche `associe_reconnu` pour votre
> véhicule. **S'il est vide, la constatation échouera** : le nom du
> propriétaire dans Réglages → Véhicules doit contenir le nom d'un associé.

## 2. `piece_id` au lieu de `depense_id` — 5 fichiers

La table `depenses` a été supprimée. Cinq écritures du code visaient encore
son ancienne colonne :

- trois dépôts de justificatif — ils fonctionnaient grâce à un déclencheur de
  compatibilité qui les réécrivait ;
- deux constatations d'abonnement — `abonnement_echeances` porte les deux
  colonnes, et l'application remplissait la périmée.

Rien n'échouait. Mais tout lecteur cherchant `piece_id` trouvait null.

## À vérifier après application

```sql
-- Après avoir déposé un justificatif : zéro attendu.
select count(*) from public.justificatifs where piece_id is null;
```

Et la requête sur les véhicules, en fin de migration 100.

## Ce qui reste, et peut attendre des années

Les totaux additionnés en JavaScript sur des listes plafonnées — `/ventes`,
`/deplacements`, `/banque`. Ils sont exacts jusqu'à 200 ou 300 lignes. À un
aller-retour par semaine et un client, cela laisse trois ou quatre ans.

Le prorata d'amortissement en jours sur 365 plutôt que 360 : quelques
centimes, et un choix documenté.

Le bouton « + » permanent, les compteurs de menu, la validation en lot : du
confort, pas de la justesse.

**Rien de tout cela ne mérite de retarder le premier client.**
