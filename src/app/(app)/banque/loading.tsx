import EnteteStatique from '@/components/EnteteStatique';
import { SquelettePage } from '@/components/Chargement';

export default function Chargement() {
  return (
    <>
      <EnteteStatique titre="Banque" />
      <SquelettePage cartes={4} lignes={10} />
    </>
  );
}
