import { redirect } from 'next/navigation';
import { profilCourant } from '@/lib/auth';

/**
 * L'ACCUEIL MÈNE À LA SÉANCE
 *
 * Le centre d'action lançait quatorze requêtes sur les anciennes tables
 * et, depuis la bascule du registre, ne voyait plus rien. Il redémontrait
 * par ailleurs des règles que les vues établissaient déjà — trois
 * définitions concurrentes de « ce qui ne va pas ».
 *
 * La séance hebdomadaire le remplace intégralement, avec une seule
 * lecture et une seule définition. Plutôt que de laisser cohabiter deux
 * écrans dont l'un ment, l'accueil conduit désormais au bon.
 */

export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');

  // Le comptable a son propre espace : l'y conduire évite de lui
  // présenter un écran de dirigeant.
  if (profil.role === 'comptable') redirect('/comptable');

  redirect('/seance');
}
