import EnteteStatique from '@/components/EnteteStatique';
import { SquelettePage } from '@/components/Chargement';
export default function Chargement() {
  return (<><EnteteStatique titre="Clients" /><SquelettePage cartes={0} lignes={8} /></>);
}
