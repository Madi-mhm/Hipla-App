import EnteteStatique from '@/components/EnteteStatique';
import { SquelettePage } from '@/components/Chargement';

/**
 * Affiché instantanément pendant que la page se construit côté serveur.
 * Next.js l'utilise comme limite de Suspense automatique.
 */
export default function Chargement() {
  return (
    <>
      <EnteteStatique titre="Dépenses" />
      <SquelettePage cartes={3} lignes={8} />
    </>
  );
}
