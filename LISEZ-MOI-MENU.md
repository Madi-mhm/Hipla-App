# Menu par fréquence + un aperçu manquant

2 fichiers, aucune migration.

```cmd
cd /d C:\Users\mahdi\Downloads\Hipla-App
git add -A && git commit -m "avant menu"
tar -xf "%USERPROFILE%\Downloads\hipla-menu.zip"
npm run build
```

---

## 1. Le menu est rangé par rythme

Il l'était par domaine — Pilotage, Comptabilité, Documents, Réglages. Vingt-huit
entrées au même niveau, où « Immobilisations » pesait autant que « Séance
hebdomadaire ». L'une s'ouvre une fois l'an, l'autre chaque semaine.

Ce n'est pas le nombre d'entrées qui fatigue, c'est l'absence de hiérarchie de
fréquence.

```
CETTE SEMAINE     Séance · Banque · Dépenses · Devis · Ventes
                  Déplacements · Tâches · Recherche

CE MOIS           TVA · Abonnements · Tableau de bord
                  Rapports mensuels · Écritures

CETTE ANNÉE  ▸    Échéances · Espace comptable · Immobilisations
                  Associés · Frais de création

RÉFÉRENCES   ▸    Clients · Prestations · Catégories · Règles
                  Véhicules · Coffre · Entreprise · Utilisateurs
                  Journal d'audit · Supervision
```

**Les deux derniers groupes sont repliés par défaut.** Vous voyez treize entrées
au lieu de vingt-huit, et les quinze autres sont à un clic.

Deux détails qui comptent :

- **Un groupe replié contenant la page ouverte se déplie tout seul.** Sinon
  l'entrée active serait invisible et l'on se croirait perdu.
- **Ce sont les groupes FERMÉS qui sont mémorisés**, pas les ouverts. Un groupe
  ajouté plus tard apparaît donc ouvert — un écran neuf doit se voir.

Aucune entrée n'est supprimée. « Clients » et « Prestations » ont simplement
rejoint les références, où elles sont : on les consulte, on n'y travaille pas.

## 2. Le numéro de facture des relances s'ouvre enfin

J'ai relu chaque écran à la recherche de numéros de pièce affichés sans pouvoir
s'ouvrir, ou de liens qui changent de page là où le panneau suffirait.

**Un seul cas :** le bloc Relances de la séance affichait le numéro de facture
en texte gris. C'était le seul endroit de la séance où une pièce ne s'ouvrait
pas. Il passe par `Reference`, comme partout ailleurs.

### Ce que j'ai vérifié et trouvé déjà juste

- **Anomalies de la séance** : le numéro utilise déjà `Reference`. Le bouton
  « Corriger » change de page, et c'est voulu — on va corriger, pas consulter.
- **Banque, TVA, Dépenses, Ventes, Abonnements, Déplacements, Immobilisations,
  Frais de création, Échéances, Coffre, Associés, Espace comptable, Recherche** :
  tous passent par `Reference`, `RefBanque` ou `RefAssocie`.
- **Liste des devis** : le numéro mène à `/devis/{id}`, à dessein. Un devis se
  modifie — on y ajoute des lignes, on l'accepte — et un panneau d'aperçu ne
  sert qu'à consulter.
- **Clients** : le numéro affiché est celui du client (`CLI-…`), pas d'une
  pièce. Rien à ouvrir.
- **Aperçu d'export** : c'est la prévisualisation d'un CSV. Du texte, à raison.

L'application était donc plus cohérente que vous ne le pensiez sur ce point —
un seul manque, sur un bloc récent.

## À vérifier

1. Le menu montre quatre groupes, les deux derniers avec un chevron et repliés.
2. Ouvrir `/immobilisations` par une adresse directe : le groupe « Cette année »
   doit se déplier tout seul et l'entrée apparaître active.
3. Sur `/seance`, dans les relances, le numéro de facture est cliquable et ouvre
   le panneau — sans quitter la page.
