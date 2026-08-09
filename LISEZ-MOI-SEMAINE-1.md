# Semaine 1 — 9 fichiers + 1 migration

## Appliquer

```cmd
cd /d C:\Users\mahdi\Downloads\Hipla-App
git add -A && git commit -m "avant semaine 1"
tar -xf "%USERPROFILE%\Downloads\hipla-semaine1.zip"
npx tsc --noEmit
npm run build
npm run dev
```

Le `commit` d'abord : en cas de problème, `git checkout .` remet tout en place.

Puis la migration dans Supabase → SQL Editor : coller
`supabase/migrations/084_chevauchement_periodes.sql` en entier, exécuter.
Elle se termine par deux requêtes de contrôle — **les deux doivent renvoyer zéro
ligne.** Si la première en renvoie, vous avez déjà des déclarations qui se
chevauchent : arrêtez-vous là et regardons ensemble.

## Fichiers remplacés

```
src/styles/globals.css
src/lib/types.ts
src/app/(app)/seance/SeanceHebdo.tsx
src/app/(app)/banque/Banque.tsx
src/app/(app)/banque/page.tsx
src/app/(app)/comptable/EspaceComptable.tsx
src/app/(app)/comptable/page.tsx
src/app/(app)/depenses/nouvelle/FormulaireDepense.tsx
src/app/(app)/tableau-de-bord/TableauDeBord.tsx
supabase/migrations/084_chevauchement_periodes.sql   (nouveau)
```

## Ce qui change

**Partout** — les champs de saisie passent à 16 px sous 900 px : iOS cesse
d'agrandir la page à chaque fois qu'on touche un champ. Nouvelle classe
`.btn--sm` à 34 px, appliquée à la séance et à la banque ; les ~40 autres
`minHeight: 26/28/30` en ligne restent à balayer.

**Séance** — confirmer une ligne n'éteint plus toute la page. Le bouton concerné
affiche « Confirmation… » ou « Validation… » ; les autres restent actifs.

**Banque** — le plus lourd. `confirmer_appariement` ne renseigne plus
`transactions_qonto.depense_id` depuis la bascule vers le registre : le lien vit
dans `reglements`. Deux conséquences étaient en cours :

1. La colonne « Écriture » affichait `—` sur toute opération rapprochée depuis
   la bascule. Elle est maintenant résolue via `reglements`.
2. **« Défaire » ne défaisait rien.** L'appel à `detacher_appariement` était
   conditionné à `t.depense_id`, donc faux sur tout rapprochement récent : la
   fonction remettait l'opération à traiter sans détacher l'écriture ni
   supprimer le règlement. La facture restait réglée et l'opération pouvait être
   rapprochée une seconde fois.

« Défaire » demande maintenant confirmation. Les erreurs de synchronisation
s'affichent en entier au lieu d'être coupées à 60 caractères ; les statuts
passent par un libellé français.

**Nouvelle dépense** — « Annuler » demande confirmation si quelque chose a été
saisi, et annonce le nombre de justificatifs joints qui seraient perdus.

**Tableau de bord** — le nombre de contrôles est compté au lieu d'être écrit
« Six ». Le titre de la tuile de TVA suit le signe.

**Espace comptable** — les échéances viennent de `v_echeances` au lieu du tableau
écrit en dur dans `lib/echeances.ts`. Six obligations au lieu de quatre, dont la
plateforme agréée au 1er septembre 2026 et la ratification des frais de création
au 30 — absentes jusqu'ici de l'écran fait pour les surveiller.

## ⚠️ La base est la production

**Ne testez pas « Défaire » sur une opération réellement rapprochée.** Le bouton
fonctionne maintenant — avant, il ne faisait rien, et c'est pour cela que le
défaut a survécu. Sur des données réelles, il détache la pièce et supprime le
règlement.

Pour l'essayer : créez une dépense jetable, rapprochez-la, défaites celle-là.

## Non vérifié

Je n'ai pas pu compiler : pas de réseau dans mon environnement. Le point de
friction le plus probable est le type `TransactionQonto`, dont le champ
`depenses` devient `ecriture`. Deux autres à surveiller, écrits d'après les
migrations et non d'après un `\d pieces` :

- le nom de la relation `reglements → pieces` dans le `select` de
  `src/app/(app)/banque/page.tsx` — si PostgREST renvoie une ambiguïté, nommez
  la contrainte : `pieces!reglements_piece_id_fkey(...)` ;
- la colonne `pieces.tiers_libelle`.

Les deux se manifestent immédiatement, au `tsc` ou au premier chargement.

## À vérifier une fois lancé

1. `/banque` — la colonne « Écriture » affiche un numéro de pièce sur une
   opération que vous savez rapprochée.
2. `/comptable` — six échéances, la plateforme agréée en tête à environ J-23.
3. `/seance` — Confirmer ne change l'état que du bouton cliqué.
4. Un formulaire sur téléphone — plus de zoom au toucher d'un champ.
