# Étape 3 de la fusion — « Écritures », une section au lieu de deux entrées

5 fichiers (1 nouveau), aucune migration, aucune suppression manuelle.

```cmd
cd /d C:\Users\mahdi\Downloads\Hipla-App
git add -A && git commit -m "avant fusion 3"
tar -xf "%USERPROFILE%\Downloads\hipla-ecritures.zip"
npm run build
```

---

## Ce qui change

Deux entrées de menu répondaient au même besoin depuis deux endroits :

- **Exports** — extraction filtrée en CSV, et le fichier des écritures (FEC) ;
- **Journal comptable** — les mêmes écritures, mises en forme pour être lues.

On ne se demande jamais « vais-je dans Exports ou dans Journal ? ». On se
demande « j'ai besoin des écritures — pour les lire, ou pour les transmettre ? ».
C'est un seul endroit, avec deux vues.

Le menu ne porte donc plus qu'une entrée, **« Écritures »**, et les deux écrans
partagent une barre d'onglets : *Extraction* · *Journal comptable*.

## Pourquoi relier plutôt que fondre

Le journal est une page serveur de 286 lignes, groupée par journal puis par
écriture, avec sa balance générale et son contrôle d'équilibre. La réécrire pour
la loger dans un onglet ferait courir un risque réel — et n'apporterait rien de
plus que ces deux liens.

L'URL `/exports/journal` reste donc valide. Vos favoris continuent de
fonctionner ; c'est la navigation qui se simplifie, pas le code qui se déplace.

## Détail annexe

Sur `/comptable`, le bouton « Exports filtrés » devient « Écritures et exports »,
pour désigner la même chose que le menu.

## À vérifier

1. Le menu ne montre plus « Journal comptable » sous Pilotage, et « Exports »
   s'appelle désormais « Écritures ».
2. `/exports` affiche deux onglets en haut ; celui de gauche est actif.
3. Un clic sur *Journal comptable* mène au journal, avec les mêmes onglets et
   celui de droite actif.
4. Le contenu des deux écrans est inchangé — balance, quatre journaux, contrôle
   d'équilibre d'un côté ; filtres, CSV et FEC de l'autre.
