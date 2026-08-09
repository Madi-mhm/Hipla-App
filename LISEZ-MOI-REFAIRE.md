# « Refaire ce trajet »

3 fichiers, aucune migration.

```cmd
git add -A && git commit -m "avant refaire trajet"
tar -xf "%USERPROFILE%\Downloads\hipla-refaire-trajet.zip"
npm run build
```

---

Un bouton **Refaire** sur chaque ligne du journal des trajets. Il ouvre le
formulaire pré-rempli : même départ, même arrivée, même motif, même
kilométrage, même véhicule, même aller-retour.

**Seule la date change** — elle repart du jour même, ce qui est presque toujours
ce qu'on veut.

Tout reste modifiable avant d'enregistrer : c'est un point de départ, pas une
copie figée. L'indemnité se recalcule pendant que vous ajustez, au barème et au
cumul annuel du moment.

Pour un hôtel tous les samedis, c'est cinquante-deux fois quatre champs qu'on ne
retape pas.

## À vérifier

1. Enregistrer un trajet.
2. Cliquer **Refaire** sur sa ligne : le formulaire s'ouvre rempli, à la date du
   jour.
3. L'indemnité affichée tient compte du cumul annuel — elle peut donc différer
   de celle du trajet d'origine, si vous avez changé de tranche du barème
   entre-temps. C'est correct : le barème est progressif.
