# Devis — l'écran

**Migration 091 d'abord** (elle corrige une erreur des précédentes), puis 5 fichiers.

```
1. Supabase → SQL Editor → 091_devis_correctif_tiers.sql
2. cd /d C:\Users\mahdi\Downloads\Hipla-App
   git add -A && git commit -m "avant devis"
   tar -xf "%USERPROFILE%\Downloads\hipla-devis.zip"
   npm run build
```

---

## D'abord : une erreur des migrations 088-090

`creer_devis` lisait `v_tiers.libelle`. **La colonne n'existe pas** — la table
`tiers` porte `nom`. La fonction aurait échoué au premier devis créé.

L'essai de la migration 090 ne l'a pas vu, et la raison mérite d'être dite :
il commençait par

```sql
if v_tiers is null then
  raise notice 'Aucun client enregistré : essai ignoré.';
  return;
end if;
```

Sans client en base, il ne s'exécutait pas — et la requête de contrôle qui
suivait donnait le même résultat qu'un essai passé et nettoyé. **J'avais écrit
une porte de sortie silencieuse dans un contrôle destiné à empêcher les échecs
silencieux**, ce que je reproche à l'application depuis le début.

La migration 091 corrige la colonne et remplace l'essai : s'il n'y a pas de
client, il en crée un, s'en sert, et le supprime. Il lève au lieu de s'abstenir,
et se termine par une requête visible — trois zéros attendus, sans avoir à lire
les notices.

## L'écran

**`/devis`** — trois chiffres (en cours, montant en jeu, acceptés), un
formulaire de création, deux tableaux : en cours, tranchés.

Le montant en jeu ne compte que les devis vivants. Un devis accepté est devenu
une facture ; le compter encore le compterait deux fois.

**`/devis/{id}`** — l'état, les lignes, et la suite à donner.

Les lignes passent par `ajouter_ligne`, la même fonction que les factures : un
devis est une facture qui n'engage pas encore, et le calcul d'une ligne n'a
aucune raison d'en différer.

Le catalogue est proposé en tête du formulaire de ligne. **Une prestation au
forfait ne préremplit aucun prix** — c'est justement ce qu'il faut chiffrer.
Les six concernées s'affichent « — au forfait » plutôt qu'à 0 €.

**Le statut se calcule.** Un devis envoyé dont la validité est écoulée est
expiré, que vous l'ayez pointé ou non : `v_devis` compare à la date du jour.

## Accepter, c'est facturer — en brouillon

Le bouton crée une facture **en brouillon** reprenant les lignes, et vous y
conduit. Pas une facture émise.

C'est le métier qui le veut : on chiffre, on exécute, puis on facture. Émettre
au moment de l'accord daterait la facture du jour de la signature et rendrait la
TVA exigible sur une prestation pas encore faite.

Le devis garde la trace de la facture qu'il a produite, et la facture porte en
note le devis d'où elle vient.

## Le client vient de `tiers`, pas de `clients`

Les deux tables coexistent, reliées par le nom — vous l'aviez noté vous-même
comme fragile. `creer_devis` cherche son client dans `tiers`, que le registre
référence. Passer par `clients` obligerait à retraverser ce lien à chaque écran.

## À vérifier

1. La migration 091 se termine par **trois zéros** et **`lit_la_bonne_colonne` à
   true**.
2. Une entrée **Devis** apparaît au menu, au-dessus de Ventes.
3. Créer un devis, y mettre deux lignes, vérifier le total.
4. L'accepter : vous atterrissez sur une facture en brouillon portant les mêmes
   montants, et le devis affiche « Accepté » avec un lien vers elle.
5. `/ventes` ne montre pas les devis — la liste filtre sur `nature = 'vente'`.

## Ce qui manque encore

Le **PDF du devis**. `facture-pdf.tsx` peut le produire en changeant le titre et
en ajoutant la ligne de validité, mais je préfère le livrer à part plutôt que
d'alourdir cet envoi. Pour l'instant, un devis se lit à l'écran.
