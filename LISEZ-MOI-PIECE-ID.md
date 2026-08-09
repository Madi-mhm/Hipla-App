# Les justificatifs écrivent la bonne colonne

3 fichiers, aucune migration. **Premier pas vers la suppression de
l'ancien modèle.**

```cmd
git add -A && git commit -m "avant piece_id"
tar -xf "%USERPROFILE%\Downloads\hipla-piece-id.zip"
npm run build
```

---

## Pourquoi

Trois écrans déposaient un justificatif en écrivant `depense_id`. Cette
colonne n'existe plus que pour un déclencheur de compatibilité posé par la
migration 029 :

```sql
create trigger trg_rerouter_justificatif
  before insert on public.justificatifs …
```

Il réécrit silencieusement `depense_id` en `piece_id`. Le commentaire de la
migration est explicite : *« Ce déclencheur meurt avec la table depenses. »*

**Tant que ces trois écrans envoient `depense_id`, la table `depenses` ne peut
pas être supprimée** — le jour où elle partirait, chaque dépôt de justificatif
casserait, et le seul symptôme serait le compteur « sans justificatif » qui
monte.

Ils écrivent désormais `piece_id`. Le déclencheur devient inutile pour eux, et
la table peut partir quand le reste sera vérifié.

## Ce qui n'est pas encore fait

`abonnement_echeances.depense_id` référence `depenses(id)` d'après les
migrations, alors que l'application y écrit l'identifiant d'une **pièce**. Soit
une migration a repointé cette clé, soit la constatation d'abonnement échoue en
silence.

Je ne le suppose pas : le fichier `PREVOL_suppression_ancien_modele.sql` pose la
question à votre base. Envoyez-moi ses quatre résultats et j'écris la
suppression sans deviner.

## À vérifier

1. Déposer un justificatif sur une dépense : il doit apparaître dans le panneau
   d'aperçu.
2. `select count(*) from justificatifs where piece_id is null;` → **zéro**.
