# Détail d'une opération bancaire

Prérequis : migration `034_operations_diverses.sql` exécutée.

## 1. Installation

```cmd
cd /d C:\Users\mahdi\Downloads\Hipla-App
tar -xf "%USERPROFILE%\Downloads\hipla-detail-banque-v1.zip"
npm run build
```

## 2. Une retouche dans `src/app/(app)/banque/Banque.tsx`

Le nouvel écran est à `/banque/{id}` ; il faut y mener depuis la liste.

**Chercher** (vers la ligne 427) :

```tsx
                    <td style={td} className="mono">
                      <span style={{ fontSize: '.72rem', color: 'var(--g-600)' }}>
                        {t.numero_piece ?? '—'}
                      </span>
                    </td>
```

**Remplacer par** :

```tsx
                    <td style={td} className="mono">
                      <Link href={`/banque/${t.id}`}
                        style={{ fontSize: '.72rem', color: 'var(--navy)', fontWeight: 600 }}>
                        {t.numero_piece ?? 'Ouvrir'}
                      </Link>
                    </td>
```

`Link` est déjà importé dans ce fichier.

## 3. Ce que l'écran apporte

**L'identifiant Qonto est affiché.** Sans lui, retrouver une opération
dans votre banque tient de la fouille.

**Le justificatif déposé dans Qonto s'affiche.** Le fichier était
téléchargé depuis la synchronisation mais n'apparaissait nulle part,
faute d'écriture à laquelle le rattacher. Il est désormais visible, et
sera rattaché automatiquement à l'écriture que vous créerez.

**Le taux et le régime de TVA sont saisissables.** Le dialogue rapide
n'offrait que la catégorie : pour Vercel, il aurait appliqué 20 % au
17,36 € alors que la facture est en autoliquidation. L'écriture aurait
été fausse sans que rien ne le signale.

**Les opérations diverses ont enfin un chemin.** Un apport en capital,
un remboursement, un mouvement de compte courant : ni vente ni charge,
mais des écritures obligatoires. Les 400 € du notaire vont au compte
1013, les 22,07 € de Qonto au 7581.

**Les candidats à l'appariement sont proposés avec leurs motifs.**

## 4. Ce que vous pouvez traiter, dans l'ordre

1. **`BAN-2026-0009`, 400,00 €** → compte 1013, « Libération du capital
   social ». Sans cette écriture, votre bilan d'ouverture est faux de
   400 €.
2. **`BAN-2026-0010`, 22,07 €** → compte 7581, « Produit divers Qonto ».
   Le justificatif Qonto s'y rattachera.
3. **`BAN-2026-0006`, 17,36 €** → dépense, fournisseur Vercel Inc.,
   catégorie « Abonnements logiciels », **régime : autoliquidation**.
   Puis annulez `ACH-2026-0001`, saisie en dollars.
4. **`BAN-2026-0008`, 5,21 €** → ouvrez d'abord le justificatif affiché
   pour savoir ce que c'est.
5. **`BAN-2026-0005` et `0007`** → frais bancaires, compte 627, **0 %**.
   Les commissions sont exonérées ; seul l'abonnement Qonto est taxé.
6. **`BAN-2026-0002`, `0003`, `0004`** à 0,00 € → écarter, ce sont des
   empreintes de carte.

Après cela, « débits sans écriture » doit tomber à zéro et le solde
reconstitué rester à 399,05 €.
