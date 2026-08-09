# Documents accessibles, et références réciproques

3 fichiers, aucune migration. **Suppose `hipla-devis-pdf.zip` appliqué.**

```cmd
git add -A && git commit -m "avant documents"
tar -xf "%USERPROFILE%\Downloads\hipla-documents.zip"
npm run build
```

---

## Ce que j'ai cherché

Trois questions, sur chaque écran.

## 1. Les documents sont-ils atteignables de partout ?

**Trois manques, tous dans le panneau d'aperçu.**

Le panneau proposait « Télécharger la facture » pour `nature === 'vente'` **et
pour elle seule**. Conséquences :

- **Un avoir** n'avait pas de bouton. Il a pourtant un PDF — même gabarit, même
  route, l'adaptateur l'accepte depuis toujours. Il fallait ouvrir sa page.
- **Un devis** non plus, puisqu'il n'existait pas quand ce bloc a été écrit.
- **Le libellé disait « la facture »** même sur un avoir.

Les trois sont réglés : bouton pour l'avoir, avec son propre libellé, et bouton
pour le devis vers `/api/devis/{id}/pdf`.

**Un brouillon reste volontairement exclu.** Le PDF sortirait marqué
« brouillon », et l'envoyer serait une erreur. On le télécharge depuis sa page,
où l'on voit qu'il n'est pas émis.

**Les justificatifs, eux, étaient déjà partout.** Le composant
`apercu/Justificatifs` est embarqué dans le panneau : voir, déposer, retirer,
depuis n'importe quel écran affichant un numéro de pièce. C'était déjà juste.

## 2. Les références liées sont-elles montrées là où il faut ?

**Un manque, et il est de moi.**

Le devis pointait sa facture ; **la facture ignorait son devis.** Le lien
n'existait que dans un sens.

C'est pourtant de la facture qu'on part quand un client conteste un prix —
« c'était bien ce qui avait été chiffré ? ». La question n'avait pas de réponse
à l'écran.

`/ventes/{id}` affiche désormais, au-dessus des prestations : *« Issue du devis
DEV-2026-0001 du 12/08/2026, chiffré 792,00 € »*, le numéro ouvrant le panneau.
Le montant du devis est rappelé volontairement : c'est l'écart entre le chiffré
et le facturé qui intéresse, et il devient visible d'un coup d'œil.

### Les autres liens, vérifiés

`banque` et `reglements` figurent déjà dans le panneau. Une opération bancaire
mène à son écriture, une écriture à son opération. Un déplacement mène à sa
pièce `km`. Une échéance d'abonnement mène à la dépense constatée. Rien à
ajouter.

## 3. Les boutons — pourquoi celui-là, pourquoi pas un autre

J'ai compté les boutons de chaque écran. Les plus denses :

```
11  ventes/{id}      10  séance      10  extraction      10  dépenses/{id}
 8  banque/{id}       7  règles       7  devis/{id}       7  espace comptable
```

**Aucun n'est de trop**, et c'est un résultat en soi. Sur `/ventes/{id}` les
onze correspondent à onze gestes distincts — ajouter une ligne, émettre,
encaisser, annuler, télécharger, relancer… Aucun n'en double un autre.

Deux remarques tout de même :

- **« Retour à … » apparaît six fois** dans l'application. Le navigateur a déjà
  un bouton retour, et le menu est à un clic. Ce sont six boutons qui occupent
  de la place sans rien apporter. Je ne les ai pas retirés — c'est une
  préférence, pas un défaut, et elle vous appartient.
- **Le geste le plus fréquent n'a pas de bouton du tout** : saisir une dépense
  demande trois navigations. C'est le « + » permanent dans l'en-tête, déjà noté.
  C'est le seul bouton qui manque vraiment.

## À vérifier

1. Ouvrir le panneau sur un **avoir** : le bouton dit « Télécharger l'avoir ».
2. Ouvrir le panneau sur un **devis** depuis la recherche : bouton
   « Télécharger le devis ».
3. Accepter un devis, ouvrir la facture produite : la ligne « Issue du devis … »
   apparaît au-dessus des prestations, et le numéro ouvre le panneau du devis.
4. Une facture sans devis n'affiche rien de plus — la ligne ne s'invente pas.
