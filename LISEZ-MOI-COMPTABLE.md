# Étape 2 de la fusion — les échéances cessent d'être en double

2 fichiers remplacés, **2 fichiers à supprimer à la main**, aucune migration.

```cmd
cd /d C:\Users\mahdi\Downloads\Hipla-App
git add -A && git commit -m "avant fusion 2"
tar -xf "%USERPROFILE%\Downloads\hipla-comptable.zip"

del src\lib\actions.ts
del src\lib\echeances.ts

npm run build
```

Une archive ne peut qu'ajouter ou remplacer, jamais effacer : les deux
suppressions sont donc manuelles. Si le `build` passe après, elles étaient bien
sans emploi — c'est le contrôle.

---

## Ce qui change

**Le tableau des échéances quitte `/comptable`.** Il vivait ici *et* sur
`/echeances`, qui porte en plus l'action « Accomplir » — laquelle engendre
l'occurrence suivante d'une obligation périodique. Deux tableaux, une seule
action : celui d'ici ne faisait que répéter.

Reste ce qui est utile à cet endroit : **combien d'échéances à venir, laquelle
vient en premier, et combien sont dépassées.** Avec un bouton « Voir et
pointer ». Le détail est à un clic, et le pointage se fait là où il a toujours
été possible.

## Les deux fichiers supprimés

**`src/lib/echeances.ts`** — le tableau de quatre échéances écrit en dur. Il
n'avait plus qu'un lecteur, `/comptable`, qui lit désormais la base. Rappel de
ce qu'il coûtait : il ignorait les deux obligations les plus proches, dont la
plateforme de facturation agréée au 1er septembre 2026.

**`src/lib/actions.ts`** — 467 lignes, l'ancien « centre d'action » remplacé par
`/seance`. Plus personne ne l'importait depuis cette bascule ; il était seulement
resté sur le disque. C'était son dernier lien avec le reste : il importait
`echeances.ts`.

## Pourquoi `/echeances` n'est pas supprimée

Je l'avais rangée parmi les écrans à retirer. À tort : elle porte une action que
rien d'autre ne porte — marquer une obligation accomplie. Un écran qui fait
quelque chose d'unique n'est pas un doublon, même s'il est court.

## À vérifier

Sur `/comptable`, l'encadré « Échéances déclaratives » affiche un compte et une
phrase du type : *« La plus proche : Plateforme de facturation agréée, le
1er septembre 2026 — J-23 »*. Le bouton mène à `/echeances`, où le tableau
complet et le bouton « Accomplir » sont inchangés.
