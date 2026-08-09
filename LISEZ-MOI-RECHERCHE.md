# Étape 4 — je retire ma proposition, et voici ce que je fais à la place

3 fichiers, aucune migration, **aucune page supprimée**.

```cmd
cd /d C:\Users\mahdi\Downloads\Hipla-App
git add -A && git commit -m "avant recherche"
tar -xf "%USERPROFILE%\Downloads\hipla-recherche.zip"
npm run build
```

---

## Ce que je devais faire, et pourquoi je ne le fais pas

Le plan prévoyait : construire une barre de filtres sur `/depenses` et
`/ventes`, puis supprimer `/recherche`.

Je l'ai commencé. Puis j'ai regardé ce que `/recherche` interroge réellement :

```
pieces (toutes natures : achats, frais de création, ventes, avoirs, km)
deplacements
abonnements
```

**Ce n'est pas un doublon des listes. C'est la seule vue transversale de
l'application.** « Où ai-je vu 45,60 € ? » n'a de réponse que là : ni
`/depenses` ni `/ventes` ne connaissent les déplacements ni les abonnements.

Deux barres de filtres par liste ne remplacent pas une recherche qui traverse
tout. Les construire pour supprimer `/recherche`, ce serait échanger une
capacité contre une symétrie. Vous avez demandé que ce soit simple **et** que
tout reste consultable : ici les deux exigences ne pointent pas dans la même
direction, et c'est la seconde qui doit gagner.

C'est la troisième fois de ce chantier que je révise une de mes propres
recommandations en regardant de plus près. `/tableau-de-bord`, `/echeances`,
maintenant `/recherche` : à chaque fois j'avais compté un écran de trop parce
que je regardais le menu au lieu de regarder ce que l'écran sait faire.

## Ce que je fais à la place

Le vrai défaut de `/recherche` n'était pas d'exister, mais d'être **isolée** :
aucune liste n'y menait. On l'atteignait par le menu, ou pas du tout.

- **`/depenses`** : un bouton « Rechercher » à côté de « Extraire » et
  « Saisie manuelle ».
- **`/ventes`** : le même, à côté de « Nouvelle facture ».
- **`/recherche`** : `autoFocus` retiré du champ. Il ouvrait le clavier dès le
  chargement sur téléphone, masquant la moitié de l'écran avant qu'on ait
  décidé de taper.

## Où en est la fusion

| Étape | État |
|---|---|
| 1 · Chiffres hors de `/seance` | fait |
| 2 · Échéances de `/comptable` → renvoi | fait |
| 3 · `/exports/journal` → onglet d'« Écritures » | fait |
| 4 · `/recherche` | **conservée, et reliée** |
| 5 · `/frais-creation` | après l'assemblée du 30 septembre |

**39 → 38 entrées de menu.** Trois doublons de chiffres supprimés, deux fichiers
morts effacés, deux entrées de menu fondues en une. Le reste tenait debout.
