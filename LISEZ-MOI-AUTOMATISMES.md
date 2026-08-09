# Alertes de panne + relecture IA

3 fichiers (1 nouveau), aucune migration.

```cmd
cd /d C:\Users\mahdi\Downloads\Hipla-App
git add -A && git commit -m "avant automatismes"
tar -xf "%USERPROFILE%\Downloads\hipla-automatismes.zip"
npm run build
```

---

## 1. Le bandeau d'état — point 1 de la liste

Une sauvegarde qui échoue écrit `statut: 'echouee'` dans une table que personne
ne regarde. Elle peut échouer six semaines de suite en silence, et l'on ne s'en
aperçoit que le jour où l'on en a besoin — c'est-à-dire le pire jour possible.

Un bandeau apparaît en tête de `/seance` si la dernière synchronisation ou la
dernière sauvegarde est en échec.

**Il surveille aussi le silence**, et c'est le point important : une
synchronisation qui n'a pas tourné depuis trois jours est aussi inquiétante
qu'une synchronisation en erreur. Vercel peut cesser d'appeler le cron sans que
rien ne s'en plaigne — et dans ce cas il n'y a pas de ligne « échouée » à
trouver, il n'y a **rien du tout**. Seuils : 3 jours pour la synchro, 10 pour la
sauvegarde.

Aucun bandeau quand tout va bien. Pas de courriel pour l'instant : cela demande
un service d'envoi que vous n'avez pas encore. Le bandeau, lui, n'attend rien et
se trouve sur le seul écran que vous ouvrez chaque semaine.

## 2. La relecture par un modèle plus précis — point 5

L'en-tête d'`api/extraction` promettait depuis le début : *« un repli sur Sonnet
est déclenché uniquement si la confiance est basse »*. Le code disait
`const modele = MODELE_RAPIDE;` et rien d'autre. `MODELE_PRECIS` était déclaré,
tarifé, et jamais employé.

Il l'est désormais. Haiku lit en premier. Si sa confiance tombe sous 0,7 **ou si
HT + TVA ne tombe pas sur le TTC**, Sonnet relit.

Ce second critère compte autant que le premier : l'arithmétique d'une facture ne
ment pas. Un total qui ne tombe pas juste signale une valeur mal lue, même quand
le modèle se déclare sûr de lui.

Trois précautions :

- **La relecture n'est gardée que si elle fait mieux** — cohérente là où la
  première ne l'était pas, ou plus sûre à cohérence égale. Une seconde lecture
  moins bonne est ignorée.
- **Les jetons des deux lectures sont additionnés** dans le suivi de coût. Sans
  cela, `usage_ia` sous-estimerait la consommation et le plafond mensuel
  protégerait mal.
- **Une seule relecture**, jamais de boucle.

Sur une facture nette, rien ne change : ni coût, ni délai. Sur une photo prise de
travers dans un couloir, vous récupérez une saisie au lieu de la refaire à la
main.

## Ce qui n'est pas dans cet envoi

**Les règles dans le score du rapprochement** (point 2) et **l'affichage du tier
`incertain`** (point 3) touchent `apparier()` et `seance_hebdomadaire()`.

Ces deux fonctions sont redéfinies par plusieurs migrations successives —
`apparier` l'est par 026, 027, 035 et 036. Je me suis déjà trompé deux fois dans
ce chantier en reconstruisant une fonction depuis les fichiers de migration
plutôt que depuis la base : la première version de la migration 084 aurait créé
une surcharge de `cloturer_tva` et abaissé un droit.

Je ne recommencerai pas. Avant de les modifier, envoyez-moi le résultat de :

```sql
select pg_get_functiondef(p.oid)
from   pg_proc p join pg_namespace n on n.oid = p.pronamespace
where  n.nspname = 'public' and p.proname = 'apparier';
```

```sql
select pg_get_functiondef(p.oid)
from   pg_proc p join pg_namespace n on n.oid = p.pronamespace
where  n.nspname = 'public' and p.proname = 'seance_hebdomadaire';
```

Je travaillerai sur ce qui tourne réellement.

## À vérifier

Aucun bandeau ne doit apparaître sur `/seance` — votre dernière sauvegarde date
d'aujourd'hui et la synchro est récente. Pour le voir fonctionner, attendez trois
jours sans synchroniser, ou consultez `/reglages/supervision`, qui montre le
même historique.
