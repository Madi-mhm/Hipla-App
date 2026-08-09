# Règle dans le score + candidat faible visible

**Migration d'abord**, puis 1 fichier.

```
1. Supabase → SQL Editor → 087_regle_dans_le_score.sql
2. cd /d C:\Users\mahdi\Downloads\Hipla-App
   git add -A && git commit -m "avant moteur"
   tar -xf "%USERPROFILE%\Downloads\hipla-moteur.zip"
   npm run build
```

Les deux fonctions sont reprises depuis la base — `pg_get_functiondef` — et non
depuis les fichiers de migration. `apparier` y est redéfinie par 026, 027, 035
et 036 ; c'est exactement le piège dans lequel je suis tombé avec
`cloturer_tva`.

---

## Je me suis trompé sur ce que ce correctif allait produire

J'avais écrit que brancher les règles dans le score ferait se comptabiliser
seuls vos frais bancaires Qonto. **C'est faux**, et la lecture de la fonction le
montre.

`apparier` rapproche une opération d'une **pièce existante**. Il n'existe aucune
pièce pour un frais de 0,35 € — c'est précisément pour cela que l'opération
figure dans « sans écriture ». Il n'y a rien à rapprocher : il y a une écriture
à créer.

Automatiser ce cas suppose un autre mécanisme — **créer** la pièce, pas en
trouver une. Plus engageant, et qui mérite son propre envoi : le montant d'un
frais bancaire n'est pas connu d'avance, donc le principe de la maison impose
qu'il ne soit pas comptabilisé seul. La création automatique devra produire une
pièce « à valider », déjà rapprochée : un clic au lieu d'un formulaire.

## Ce que cette migration fait vraiment

### 1. La règle entre dans le score — mais elle est confrontée

Une règle porte sur un **libellé bancaire**, pas sur une pièce. Qu'une règle
reconnaisse « QONTO » ne dit pas que la pièce candidate est la bonne. Ce qui le
dit, c'est que **la règle et la pièce désignent la même catégorie**.

| Situation | Effet |
|---|---|
| Règle et pièce, même catégorie | **+40**, et le montant vaut « connu d'avance » |
| Règle pointant une autre catégorie | **−10** : elle témoigne contre ce candidat |
| Règle marquée `jamais_automatique` | +40, mais jamais de comptabilisation seule |

Accorder les 40 points sans cette confrontation aurait fait remonter n'importe
quelle pièce dont le montant tombe juste, du moment qu'une règle existait pour
le libellé. C'est le genre de correctif qui aggrave ce qu'il prétend réparer.

**Ce que ça change en pratique** : une facture fournisseur que vous avez saisie,
dont le prélèvement porte un libellé couvert par une règle de la même catégorie,
se rapproche désormais seule. C'est le cas des abonnements dont vous avez saisi
la facture à l'avance.

### 2. Le tier « incertain » cesse d'être muet

Le moteur produit quatre décisions : `automatique`, `propose`, `incertain`
(30–59) et `ecarte`. La séance n'en lisait que deux. Les opérations à candidat
faible tombaient dans « sans écriture » comme si le moteur n'avait aucun avis —
alors qu'il en avait un, simplement pas assez sûr pour le proposer.

Une ligne « Piste faible » apparaît désormais sous ces opérations, avec le numéro
de pièce cliquable, le tiers, le score et les motifs. **Rien n'est rapproché
automatiquement** : on cesse seulement de taire une opinion.

## À vérifier

La migration se termine par trois requêtes :

1. **Une seule signature** par fonction. Deux lignes signaleraient une surcharge.
2. `regle_dans_le_score` et `candidat_faible_expose` à **true**.
3. La répartition des décisions actuelles — utile à lire une fois : elle vous dit
   combien de couples le moteur juge `incertain` aujourd'hui, c'est-à-dire
   combien de lignes « Piste faible » vont apparaître.

Puis sur `/seance` : les opérations sans écriture qui ont un candidat faible
portent une seconde ligne grise. Le reste est inchangé.
