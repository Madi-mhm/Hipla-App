/**
 * Client Cloudflare R2.
 *
 * R2 expose une API compatible S3 : on utilise donc le client AWS standard,
 * en pointant l'endpoint vers Cloudflare. Ce module ne doit jamais être
 * importé côté navigateur — il porte des identifiants.
 */
import {
  S3Client, PutObjectCommand, GetObjectCommand,
  ListObjectsV2Command, DeleteObjectCommand, HeadObjectCommand,
} from '@aws-sdk/client-s3';

const COMPTE = process.env.R2_ACCOUNT_ID;
export const BUCKET = process.env.R2_BUCKET ?? 'hipla-sauvegardes';

/** Quota du palier gratuit R2, en octets. */
export const QUOTA_R2 = 10 * 1024 * 1024 * 1024;

let client: S3Client | null = null;

export function r2(): S3Client {
  if (client) return client;
  if (!COMPTE || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error(
      "Identifiants R2 absents. Vérifiez R2_ACCOUNT_ID, R2_ACCESS_KEY_ID et " +
      "R2_SECRET_ACCESS_KEY dans les variables d'environnement."
    );
  }
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${COMPTE}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

export function r2Configure(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
  );
}

export async function deposer(
  cle: string,
  contenu: Buffer | Uint8Array | string,
  typeMime = 'application/octet-stream'
): Promise<void> {
  await r2().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: cle,
    Body: contenu,
    ContentType: typeMime,
  }));
}

export async function lire(cle: string): Promise<string> {
  const res = await r2().send(new GetObjectCommand({ Bucket: BUCKET, Key: cle }));
  return (await res.Body?.transformToString()) ?? '';
}

export async function existe(cle: string): Promise<boolean> {
  try {
    await r2().send(new HeadObjectCommand({ Bucket: BUCKET, Key: cle }));
    return true;
  } catch {
    return false;
  }
}

export type ObjetR2 = { cle: string; taille: number; modifie: Date };

/** Liste tous les objets d'un préfixe, en suivant la pagination. */
export async function lister(prefixe = ''): Promise<ObjetR2[]> {
  const objets: ObjetR2[] = [];
  let suite: string | undefined;

  do {
    const res = await r2().send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefixe,
      ContinuationToken: suite,
      MaxKeys: 1000,
    }));
    for (const o of res.Contents ?? []) {
      if (!o.Key) continue;
      objets.push({
        cle: o.Key,
        taille: o.Size ?? 0,
        modifie: o.LastModified ?? new Date(0),
      });
    }
    suite = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (suite);

  return objets;
}

export async function supprimer(cle: string): Promise<void> {
  await r2().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: cle }));
}

/** Statistiques d'occupation du bucket. */
export async function statistiquesR2() {
  const objets = await lister();
  const total = objets.reduce((s, o) => s + o.taille, 0);
  const parPrefixe: Record<string, { nombre: number; octets: number }> = {};

  for (const o of objets) {
    const p = o.cle.split('/')[0];
    parPrefixe[p] ??= { nombre: 0, octets: 0 };
    parPrefixe[p].nombre += 1;
    parPrefixe[p].octets += o.taille;
  }

  return {
    nombre: objets.length,
    octets: total,
    quota: QUOTA_R2,
    pourcentage: (total / QUOTA_R2) * 100,
    parPrefixe,
  };
}
