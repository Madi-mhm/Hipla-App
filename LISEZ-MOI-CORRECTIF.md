# Correctif de compilation — extraction

1 fichier. Remplace celui de l'envoi « automatismes ».

```cmd
cd /d C:\Users\mahdi\Downloads\Hipla-App
tar -xf "%USERPROFILE%\Downloads\hipla-correctif-extraction.zip"
npm run build
```

---

## Ce que j'ai cassé

En sortant l'appel HTTP dans une fonction imbriquée — pour pouvoir le rejouer
avec un modèle plus précis — j'ai fait perdre à TypeScript une certitude qu'il
avait avant.

`ANTHROPIC_API_KEY` est vérifiée en début de route :

```ts
const cle = process.env.ANTHROPIC_API_KEY;
if (!cle) { return NextResponse.json({ erreur: ... }, { status: 500 }); }
```

Après cette garde, TypeScript sait que `cle` est une chaîne. Mais **il abandonne
cette restriction à l'entrée d'une fermeture** : rien ne garantit qu'une fonction
imbriquée sera appelée pendant que la garde tient encore. Le type redevient donc
`string | undefined`, que `HeadersInit` refuse.

Le compilateur avait raison sur le principe, et tort sur ce cas précis — la
fonction est appelée immédiatement, dans la même portée. On fige donc la valeur
déjà restreinte avant de la capturer :

```ts
const cleApi: string = cle;
```

## Ce qui n'a pas changé

La relecture par le modèle précis fonctionne comme décrit : Haiku d'abord,
Sonnet si la confiance tombe sous 0,7 ou si HT + TVA ne tombe pas sur le TTC, et
la seconde lecture n'est gardée que si elle fait mieux.

## Note

Le `tar -xf` de l'envoi « moteur » a bien été exécuté chez vous — il apparaît
après l'échec du build dans votre terminal. `SeanceHebdo.tsx` est donc déjà en
place ; il attendait seulement que ce fichier-ci compile.
