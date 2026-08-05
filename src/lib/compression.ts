/**
 * Compression des justificatifs, côté navigateur.
 *
 * Une photo de facture prise au téléphone pèse 2 à 4 Mo. Compressée en
 * WebP à 2000 px, elle tombe autour de 250 Ko sans devenir illisible.
 * Sur le quota gratuit de 1 Go, la différence est de huit mois contre
 * huit ans d'archivage.
 *
 * Les PDF passent tels quels : ils sont déjà légers et les recompresser
 * dégraderait le texte.
 */

const LARGEUR_MAX = 2000;
const QUALITE = 0.8;

export type ResultatCompression = {
  fichier: File;
  tailleOrigine: number;
  tailleFinale: number;
  ratio: number;
};

export async function compresser(fichier: File): Promise<ResultatCompression> {
  const tailleOrigine = fichier.size;

  // Les PDF ne sont pas retouchés.
  if (fichier.type === 'application/pdf') {
    return { fichier, tailleOrigine, tailleFinale: tailleOrigine, ratio: 1 };
  }

  if (!fichier.type.startsWith('image/')) {
    return { fichier, tailleOrigine, tailleFinale: tailleOrigine, ratio: 1 };
  }

  const bitmap = await creerBitmap(fichier);

  // Redimensionne en conservant les proportions.
  let { width, height } = bitmap;
  if (width > LARGEUR_MAX || height > LARGEUR_MAX) {
    const echelle = LARGEUR_MAX / Math.max(width, height);
    width = Math.round(width * echelle);
    height = Math.round(height * echelle);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { fichier, tailleOrigine, tailleFinale: tailleOrigine, ratio: 1 };
  }

  // Fond blanc : évite qu'une transparence devienne noire en WebP.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', QUALITE)
  );

  if (!blob || blob.size >= tailleOrigine) {
    // La compression n'a rien gagné : on garde l'original.
    return { fichier, tailleOrigine, tailleFinale: tailleOrigine, ratio: 1 };
  }

  const nom = fichier.name.replace(/\.[^.]+$/, '') + '.webp';
  const compresse = new File([blob], nom, { type: 'image/webp' });

  return {
    fichier: compresse,
    tailleOrigine,
    tailleFinale: blob.size,
    ratio: blob.size / tailleOrigine,
  };
}

/**
 * createImageBitmap applique automatiquement l'orientation EXIF, ce qui
 * évite les photos couchées. Repli sur <img> si l'API est absente.
 */
async function creerBitmap(fichier: File): Promise<ImageBitmap> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(fichier, { imageOrientation: 'from-image' });
    } catch {
      /* repli ci-dessous */
    }
  }
  const url = URL.createObjectURL(fichier);
  try {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = url;
    });
    return await createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 262144 → « 256 Ko » */
export function poids(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / 1024 / 1024).toFixed(1)} Mo`;
}
