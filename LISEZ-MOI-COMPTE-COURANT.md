# Compte courant d'associé — 6 fichiers + 1 migration

**La migration passe en premier** : le code appelle `creer_operation_banque`
avec un cinquième paramètre qui n'existe pas encore.

```
1. Supabase → SQL Editor → 086_compte_courant.sql
2. cd /d C:\Users\mahdi\Downloads\Hipla-App
   git add -A && git commit -m "avant compte courant"
   tar -xf "%USERPROFILE%\Downloads\hipla-compte-courant.zip"
   npm run build
```

---

## Le problème

Le compte courant est, pour une société financée par ses dirigeants, le chiffre
le plus personnel de la comptabilité : ce que l'entreprise vous doit. Chez vous
il dépasse déjà le capital — 539,84 € contre 400 €.

Il est affiché sur trois écrans. Deux le calculent faux.

**`/associes`** lit `solde_compte_courant()`, qui repose sur `v_compte_courant`.
Correct.

**`/seance`** et **`/tableau-de-bord`** recalculent chacun le leur :

```sql
sum(montant_ttc) where moyen_paiement = 'avance_associe'
```

Un remboursement est écrit par `rembourser_associe` avec
`moyen_paiement = 'virement'`. Il échappe donc au filtre. **Le jour où la
société vous rembourse, ces deux écrans continuent d'afficher la dette éteinte,
indéfiniment**, pendant que `/associes` montre le bon solde. Trois écrans, deux
réponses.

Et un second manque, plus discret : un **apport** — de l'argent que vous versez
à la société — se comptabilise au 4551 en crédit. `v_compte_courant` n'avait que
deux branches, avances et remboursements, toutes deux au débit. L'apport ne
correspondait à aucune. La société reçoit l'argent, vous le doit, et le compte
courant l'ignore.

Enfin `creer_operation_banque` écrivait `paye_par = 'societe'` en dur : même
corrigée, la branche n'aurait su à qui rattacher l'apport.

## Ce qui change

**La vue gagne une troisième branche** — les apports au 4551 en crédit,
comptés comme dus à l'associé.

**`creer_operation_banque` prend l'associé concerné.** Obligatoire dès que le
compte est 4551, et vérifié contre la table `associes` : un mouvement de compte
courant sans titulaire n'entre dans le solde de personne, ce qui revient à ne
pas l'enregistrer. L'ancienne signature à quatre paramètres est supprimée avant
la création de la nouvelle — sans quoi `create or replace` aurait laissé les
deux coexister et l'application aurait continué d'appeler l'ancienne.

**Les deux écrans lisent la source.** Plutôt que de réécrire
`seance_hebdomadaire` et `tableau_de_bord` — deux fonctions longues que six
écrans partagent — chaque page appelle `solde_compte_courant()` et affiche ce
qu'elle renvoie. Le champ `compte_courant` reste dans leur charge utile, ignoré.
Il pourra disparaître le jour où ces fonctions seront reprises pour d'autres
raisons.

**`/banque/{id}` propose l'associé** quand le compte 4551 est choisi, avec une
phrase qui dit le sens du mouvement : apport ou remboursement.

## Vérification

La migration se termine par cinq requêtes. Les deux premières comptent :

- **une seule signature** de `creer_operation_banque`, à **5 arguments** ;
- **`branche_apport_presente` à `true`**.

La cinquième liste les mouvements de 4551 encore attribués à « societe » —
héritage de l'ancienne fonction. S'il y en a, corrigez-les à la main : la
requête `update` commentée à la fin du fichier est prête, il suffit de
remplacer l'identifiant et le numéro de pièce.

Une fois l'application relancée, les trois écrans doivent afficher **le même
montant**. C'est le seul contrôle qui compte.

## À l'essai

Le plus simple, si vous voulez voir la branche fonctionner : sur une opération
Qonto au crédit correspondant à un virement personnel vers la société, ouvrez
`/banque/{id}` → Opération diverse → compte **4551** → votre nom. L'écriture
créée doit faire monter le solde des trois écrans du montant versé.

Sur une opération au débit, le même chemin propose « Remboursement à un
associé » et fait descendre le solde.
