# Lecture des montants — 12 fichiers, aucune migration

**Pas de migration cette fois.** Rien à passer dans Supabase.

```cmd
cd /d C:\Users\mahdi\Downloads\Hipla-App
git add -A && git commit -m "avant lecture des montants"
tar -xf "%USERPROFILE%\Downloads\hipla-montants.zip"
npm run build
```

Pour voir l'étendue avant d'appliquer :

```cmd
git diff HEAD --stat
```

---

## Le problème

Onze écrans lisaient les montants saisis de la même façon :

```js
parseFloat(saisie.replace(',', '.'))
```

Deux défauts s'y cumulaient. `String.replace` avec une chaîne ne remplace que
la **première** occurrence. Et `parseFloat` s'arrête au premier caractère
invalide au lieu de refuser.

D'où, en silence :

| Saisi | Interprété | Résultat |
|---|---|---|
| `1 234,56` | `parseFloat("1 234.56")` | **1** |
| `1.234,56` | `parseFloat("1.234.56")` | **1,234** |
| `1 000` | `parseFloat("1 000")` | **1** |

Une facture de mille euros entrait donc à un euro. Et rien ne s'en apercevait :
la valeur est finie, positive, HT + TVA = TTC se vérifie parfaitement — sur le
mauvais nombre. Les contrôles de cohérence passaient, la pièce se validait, la
TVA se déduisait.

Le cas n'est pas théorique : c'est exactement ce qui arrive quand on recopie un
montant depuis un PDF, ou qu'on le tape comme les factures françaises
l'impriment.

## Ce qui change

Une fonction, `montantSaisi`, dans `src/lib/format.ts`. Elle nettoie ce qui est
décoratif — espaces ordinaires, insécables, insécables étroits, symbole € — puis
interprète le séparateur de milliers, et **refuse ce qui reste ambigu**.

Elle renvoie `null` pour dire « je n'ai pas compris ». Jamais zéro, jamais un
nombre inventé. Les vérifications existantes (`Number.isFinite`) rejettent alors
la saisie et affichent le message d'erreur déjà prévu à cet endroit — le
comportement en cas d'erreur ne change pas, seule la détection s'améliore.

### Les cas vérifiés

Testés un par un avant livraison :

```
1234,56    → 1234.56      1.234,56  → 1234.56      1,234.56 → 1234.56
1 234,56   → 1234.56      1234.56   → 1234.56      1.234.567 → 1234567
108        → 108          108,00 €  → 108          0,10     → 0.1
-45,60     → -45.6        12€       → 12           0        → 0
""         → null         abc       → null         12abc    → null
1,23,45    → null         .         → null
```

`1,23,45` renvoie `null` plutôt que de deviner : deux virgules décimales n'ont
pas de lecture unique, et inventer une réponse est précisément ce qu'on cherche
à supprimer.

## Où c'est appliqué

Les onze écrans qui lisent un montant tapé :

```
depenses/nouvelle          montant de la facture
depenses/extraire          montant corrigé après lecture par l'IA
depenses/[id]              correction d'une pièce
abonnements                montant du contrat, passage au payant
ventes/[id]                quantité, prix unitaire, montant encaissé
banque/justificatifs       montant lu sur le justificatif Qonto
deplacements/nouveau       kilomètres
frais-creation             montant d'un frais
recherche                  bornes du filtre montant
reglages/prestations       prix du catalogue
reglages/regles            taux de TVA d'une règle
```

## Ce que je n'ai pas pu vérifier

Comme d'habitude, je n'ai pas de réseau : rien n'a été compilé. `npm run build`
fait le contrôle de types.

Le point le plus probable de friction est un import mal placé. J'ai vérifié
qu'ils sont présents et bien formés dans les onze fichiers, mais une erreur de
compilation les désignerait immédiatement.

## À essayer une fois lancé

Sur `/depenses/nouvelle`, tapez **`1 234,56`** dans le montant, avec l'espace.
Le récapitulatif doit afficher **1 234,56 € TTC**. Avant ce correctif, il
affichait **1,00 €**.
