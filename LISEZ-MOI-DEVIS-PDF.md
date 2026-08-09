# PDF du devis — 5 fichiers, aucune migration

```cmd
cd /d C:\Users\mahdi\Downloads\Hipla-App
git add -A && git commit -m "avant pdf devis"
tar -xf "%USERPROFILE%\Downloads\hipla-devis-pdf.zip"
npm run build
```

**Cet envoi suppose que `hipla-devis.zip` a été appliqué** : il modifie
`DetailDevis.tsx`, qui vient de là.

---

## Un gabarit, pas deux

Le devis réutilise le gabarit et l'adaptateur de la facture. Il partage tout
avec elle — émetteur, destinataire, lignes, ventilation par taux, mentions
légales — et n'en diffère que par trois points. Un second gabarit aurait
dupliqué trois cents lignes pour ces trois différences, et les aurait laissées
diverger au premier changement de mentions.

**Ce qui change sur un devis :**

| | Facture | Devis |
|---|---|---|
| Titre | FACTURE | **DEVIS** |
| Date | Échéance · Délai 15 jours | **Valable jusqu'au** — sans délai |
| Total | NET À PAYER | **TOTAL DU DEVIS** |
| Bas de page | IBAN, BIC, référence du virement | **Bon pour accord** — date, signature, mention manuscrite |

Le bloc bancaire est remplacé, pas seulement masqué : ce qu'on attend du client
à ce stade, c'est un accord, pas un virement. Il rappelle aussi qu'au-delà de la
validité les prix ne sont plus garantis.

## Une exigence levée

L'adaptateur refuse de produire une facture si l'IBAN de l'entreprise est absent
— « la facture ne serait pas payable ». Cette exigence ne tient pas pour un
devis : il n'appelle aucun paiement, et l'imposer empêcherait de chiffrer avant
d'avoir renseigné la banque. Elle ne s'applique donc plus qu'aux factures.

Le message d'erreur « aucune ligne » est également adapté : *« Ce devis ne
comporte aucune ligne : il n'y a rien à chiffrer. »*

## Où le trouver

Bouton **Télécharger le PDF** sur `/devis/{id}`, à côté de « Retour aux devis ».
Il n'apparaît que si le devis a au moins une ligne — un devis vide ne produit
rien d'utile.

L'adresse directe est `/api/devis/{id}/pdf`.

## À vérifier

1. Créer un devis, y mettre deux lignes, télécharger le PDF.
2. Le titre dit **DEVIS**, la date dit **Valable jusqu'au**, le total dit
   **TOTAL DU DEVIS**, et le bas de page demande un **bon pour accord** — pas un
   virement.
3. Télécharger le PDF d'une **facture** existante : rien ne doit avoir changé.
   C'est le seul risque de cet envoi, puisque les deux partagent le gabarit.
