# Contrats clients — l'écran

**Migration 096 déjà passée.** 5 fichiers.

```cmd
git add -A && git commit -m "avant contrats"
tar -xf "%USERPROFILE%\Downloads\hipla-contrats.zip"
npm run build
```

---

## Votre hôtel, concrètement

**Une fois :** `/contrats` → Déclarer un contrat → l'hôtel, « Nettoyage
hebdomadaire — Hôtel X », la désignation facturée, le prix, **Chaque semaine**,
**samedi**, la date de début.

**Chaque semaine, ensuite :** la séance affiche « À facturer — 1 · 240,00 € ».
Vous cliquez **Établir la facture**, vous atterrissez sur le brouillon, vous
émettez. Trois secondes.

Le paiement, lui, se rapproche déjà tout seul : une facture de vente émise vaut
« montant connu d'avance » pour le moteur, donc un virement au même montant se
rattache sans vous.

## Pourquoi un brouillon et non une facture émise

Une machine ne sait pas qu'un samedi était férié, qu'un hôtel était fermé, ou
qu'une semaine a sauté. Émettre seul daterait la facture d'un jour choisi sans
vous et rendrait la TVA exigible sur une prestation peut-être pas faite.

C'est le même principe que partout ailleurs ici : la machine propose, vous
validez.

## « Sauter » demande un motif

Une semaine non travaillée se saute — elle ne reste pas en attente
indéfiniment. Mais le motif est **obligatoire** : une période sautée sans
explication ressemble à un oubli, et dans six mois vous ne saurez plus laquelle
c'était.

## Le récurrent mensuel

La carte en tête de `/contrats` ramène toutes les périodicités au mois :
hebdomadaire × 52/12, trimestriel ÷ 3, annuel ÷ 12.

C'est la seule mesure qui permette de comparer un hôtel hebdomadaire et une
copropriété trimestrielle — et le chiffre que votre entreprise n'avait nulle
part. Pour une société de nettoyage, c'est probablement le plus important de
tous.

## Ce qui est prévu et pas encore à l'écran

La table porte `engagement_jusquau`, `preavis_jours` et `agents_repris` ;
l'écran les affiche mais ne permet pas encore de les saisir. Ils se remplissent
pour l'instant en base.

`agents_repris` n'est pas décoratif : c'est l'article 7 de la convention
collective propreté. Gagner un site sur un prestataire sortant peut vous
apporter son personnel, et le noter à la signature rend le coût réel du contrat
visible dès le départ.

## À vérifier

1. `/contrats` apparaît au menu, sous Devis.
2. Déclarer un contrat hebdomadaire au samedi, débutant aujourd'hui.
3. Les échéances sont engendrées au chargement de la page — la première doit
   apparaître sous « Échéances à facturer » si son samedi est passé, sinon
   « à venir ».
4. « Établir la facture » mène à un brouillon portant la bonne ligne et le bon
   montant.
5. Sur `/seance`, le bloc « À facturer » n'apparaît que s'il y a une échéance
   **échue**.
