# Étape 1 de la fusion — la séance redevient une file d'attente

2 fichiers, aucune migration.

```cmd
cd /d C:\Users\mahdi\Downloads\Hipla-App
git add -A && git commit -m "avant fusion 1"
tar -xf "%USERPROFILE%\Downloads\hipla-seance.zip"
npm run build
```

---

## Ce qui change

Le bloc « Les chiffres » quitte `/seance`. Huit montants y figuraient —
encaissé du mois, charges du mois, reste à encaisser, solde bancaire, TVA
collectée, TVA déductible, solde de TVA, compte courant — et **les huit
figurent aussi au tableau de bord**.

Deux écrans qui annoncent les mêmes montants, ce sont deux occasions de
diverger. Ce n'est pas théorique : les charges du mois se calculaient ici sans
tenir compte du sens, si bien qu'un avoir fournisseur les **augmentait** au lieu
de les réduire.

À la place, une ligne et trois liens : tableau de bord, TVA, banque.

## Pourquoi ceci plutôt qu'une fusion des deux écrans

J'avais proposé de fondre `/tableau-de-bord` dans `/seance`. Après avoir relevé
le contenu de chaque page, je retire cette proposition — je comptais les écrans
au lieu de compter les rôles.

- **`/seance` répond à « qu'est-ce que je fais ? »** Chaque bloc porte un
  bouton, on le traite, il disparaît. Une file d'attente.
- **`/tableau-de-bord` répond à « où en est l'entreprise ? »** Résultat,
  graphique, répartition par poste, sept contrôles. On le lit.

Les fondre donnerait un écran très long où l'urgent se noierait dans le
contemplatif. Le vrai défaut n'était pas d'avoir deux pages, mais que les mêmes
huit chiffres soient sur les deux. C'est ce défaut-là qui est corrigé.

Aucun détail n'est perdu : tout ce qui disparaît d'ici existe ailleurs, à un
clic.

## À vérifier

`/seance` doit se terminer par un encadré « Où en est l'entreprise » avec trois
boutons. Tout ce qui précède — mouvements à expliquer, à confirmer, à valider,
anomalies, assemblée, relances — reste inchangé.
