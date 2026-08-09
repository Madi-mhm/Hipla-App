# Écran Dépenses — 1 fichier, aucune migration

```cmd
cd /d C:\Users\mahdi\Downloads\Hipla-App
git add -A && git commit -m "avant depenses"
tar -xf "%USERPROFILE%\Downloads\hipla-depenses.zip"
npm run build
```

Un seul fichier : `src/app/(app)/depenses/page.tsx`. Pour voir le changement
avant de l'appliquer : `git diff HEAD`.

---

## Le problème

L'écran chargeait 200 lignes, puis calculait ses quatre cartes en JavaScript
sur ces 200 lignes. Justes tant qu'il y a moins de 200 écritures. Faux ensuite,
sans que rien ne le signale : « Charges validées » cesserait simplement de
monter.

Et il réécrivait en TypeScript une règle qui vit en base depuis la migration
057 — le coût réel d'un achat, hors taxes plus la TVA non déductible, un avoir
retranchant au lieu d'ajouter. Le commentaire du fichier racontait d'ailleurs
l'écart que cette duplication avait déjà produit : 453,55 € ici contre 453,63 €
au tableau de bord.

Enfin, `etat_achats()` existe en base, maintenue jusqu'à la migration 067, et
n'était appelée de nulle part. Votre propre documentation indiquait cet écran
comme sa source.

## Ce qui change

Les quatre cartes viennent d'`etat_achats()`. La règle du coût réel disparaît du
TypeScript. L'en-tête dit « 8 affichées sur 340 » au lieu de prétendre que 200
est le total.

**Un changement visible** : `etat_achats` compte les indemnités kilométriques
parmi les charges, comme le tableau de bord et le fichier des écritures. La
liste inclut donc désormais les pièces de nature « km ». Une carte et une liste
qui ne portent pas sur le même ensemble sont une invitation à se tromper — mais
c'est bien une pièce de plus à l'écran, et il faut le savoir avant de l'ouvrir.

**Un chiffre change aussi** : « TVA récupérable » venait de la somme des
`tva_comptable` des pièces validées ; elle vient maintenant de
`v_tva_exigible`, c'est-à-dire de la TVA réellement exigible au paiement. Sur un
achat de services non encore réglé, l'ancienne version comptait la TVA d'avance.
La nouvelle est celle que vous déclarez.

## À vérifier une fois lancé

« Charges validées » sur `/depenses` doit désormais afficher **le même montant**
que « charges » sur `/tableau-de-bord`. C'est le seul contrôle qui compte.
