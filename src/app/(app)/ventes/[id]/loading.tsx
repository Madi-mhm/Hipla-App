import EnteteStatique from '@/components/EnteteStatique';
import { SquelettePage } from '@/components/Chargement';
export default function Chargement() {
  return (<><EnteteStatique titre="Chargement…" /><SquelettePage cartes={0} lignes={8} /></>);
}
