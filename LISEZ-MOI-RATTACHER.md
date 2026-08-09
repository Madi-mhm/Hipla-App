# Rattacher un devis à une facture établie à part

**Migration 095 d'abord**, puis 2 fichiers.

```
1. Supabase → SQL Editor → 095_rattacher_devis.sql
2. tar -xf "%USERPROFILE%\Downloads\hipla-rattacher.zip"
   npm run build
```

Suppose `hipla-documents.zip` appliqué : ces deux fichiers en viennent.

---

## Le cas

`accepter_devis` était le seul chemin reliant les deux : il crée la facture et
pose le lien au passage.

Mais on ne passe pas toujours par là. On chiffre un chantier, le client accepte
au téléphone, on fait le travail, et l'on établit la facture directement. Les
deux documents existent, ils se rapportent au même chantier, et rien ne les
relie — l'application n'a aucun moyen de le deviner. **Il faut le lui dire.**

## Ce que ça donne

Sur une facture **sans devis rattaché**, et seulement si le client a des devis
libres, une ligne apparaît : *« Cette facture vient-elle d'un devis ? »*, avec la
liste des devis du même client non encore rattachés.

Chaque option montre **l'écart déjà calculé** :

```
DEV-2026-0003 · 12/08/2026 · 792,00 € · montant identique
DEV-2026-0001 · 03/08/2026 · 640,00 € · écart 152,00 €
```

C'est ce qui permet de choisir sans ouvrir les devis un par un. Le bon candidat
est presque toujours celui dont le montant tombe juste.

Sur une facture **déjà rattachée**, la ligne d'origine gagne l'écart en clair et
un lien « détacher » :

> Issue du devis DEV-2026-0001 du 03/08/2026, chiffré 640,00 € — **écart de
> 152,00 €**. *détacher*

## Ce que le rattachement refuse

- **Un devis déjà accepté** — il a produit sa propre facture ; le rattacher à
  une seconde ferait croire qu'un chiffrage en a payé deux.
- **Une facture déjà issue d'un devis** — le lien est unique par nature.
- **Un devis et une facture de clients différents** — c'est presque toujours une
  erreur de saisie, et la laisser passer rendrait le rapprochement faux plutôt
  qu'absent. La liste ne propose d'ailleurs que le bon client.

**Il n'interdit pas l'écart de montant** : il avertit. Un devis révisé en cours
de chantier reste le bon devis, et c'est justement cet écart qu'on veut voir.

## Détacher remet le devis à « envoyé »

Il n'a plus produit de facture, donc il n'est plus accepté. Il redevient
disponible au rattachement — sur cette facture ou une autre.

## Une facture sans devis n'affiche rien

Pas de « aucun devis », pas d'encadré vide. La plupart de vos factures n'en
auront pas : un contrat de copropriété ne se rechiffre pas tous les mois, et une
rotation à 65 € est un tarif, pas une négociation. Le sélecteur n'apparaît que
s'il y a réellement quelque chose à proposer.

## À vérifier

1. Créer un devis pour un client, ne pas l'accepter.
2. Établir une facture directement pour ce même client.
3. La ligne « Cette facture vient-elle d'un devis ? » apparaît, avec l'écart.
4. Rattacher : la ligne devient « Issue du devis … », et le devis passe à
   « Accepté » sur `/devis`.
5. Détacher : le devis redevient « Envoyé » et réapparaît dans la liste.
