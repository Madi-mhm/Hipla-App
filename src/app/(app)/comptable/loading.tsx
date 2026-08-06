import EnteteStatique from '@/components/EnteteStatique';
import { SquelettePage } from '@/components/Chargement';

export default function Chargement() {
  return (
    <>
      <EnteteStatique titre="Espace comptable" />
      <SquelettePage cartes={4} lignes={8} />
    </>
  );
}
