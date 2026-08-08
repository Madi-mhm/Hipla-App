import { redirect } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { money } from '@/lib/format';
import Immobilisations, { type Bien, type AInscrire } from './Immobilisations';

export const metadata = { title: 'Immobilisations — Hipla Gestion' };
export const dynamic = 'force-dynamic';

/**
 * LE REGISTRE DES IMMOBILISATIONS
 *
 * Un bien durable ne se consomme pas dans l'exercice. Le passer en
 * charge d'un coup fausse le résultat de l'année et appauvrit le bilan
 * — c'est l'un des redressements les plus classiques.
 */

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'read')) redirect('/');

  const supabase = await createClient();

  const [{ data: biens }, { data: etat }, { data: aInscrire }] = await Promise.all([
    supabase.from('immobilisations')
      .select('*, pieces(numero_piece, tiers_libelle)')
      .order('date_mise_en_service', { ascending: false }),
    supabase.rpc('etat_immobilisations'),
    // Les écritures de classe 2 qui n'ont pas encore rejoint le registre.
    supabase.from('pieces')
      .select('id, numero_piece, date_piece, tiers_libelle, objet, compte, montant_ht, montant_tva, tva_comptable, categorie_id, categories(libelle, duree_amortissement)')
      .eq('etat', 'validee')
      .in('nature', ['achat', 'creation'])
      .like('compte', '2%')
      .order('date_piece'),
  ]);

  const inscrits = new Set((biens ?? []).map((b) => b.piece_id));
  const manquants = ((aInscrire ?? []) as unknown as AInscrire[])
    .filter((p) => !inscrits.has(p.id));

  // Le plan de chaque bien : calculé en base, jamais stocké.
  const plans: Record<string, unknown[]> = {};
  for (const b of biens ?? []) {
    const { data } = await supabase.rpc('plan_amortissement', { p_id: b.id });
    plans[b.id] = data ?? [];
  }

  const e = (etat ?? {}) as Record<string, number>;

  return (
    <>
      <Header
        titre="Immobilisations"
        sousTitre="Les biens durables et leur amortissement"
      />
      <div className="content">

        <div className="grid-cards" style={{ marginBottom: '1.5rem' }}>
          <div className="card">
            <p className="card__title">Valeur d&apos;acquisition</p>
            <p className="amount" style={chiffre}>{money(Number(e.valeur_brute ?? 0))}</p>
            <p className="muted" style={petit}>
              {Number(e.inscrites ?? 0)} bien{Number(e.inscrites ?? 0) > 1 ? 's' : ''} au registre
            </p>
          </div>
          <div className="card">
            <p className="card__title">Amortissements cumulés</p>
            <p className="amount" style={chiffre}>
              {money(Number(e.amortissements_cumules ?? 0))}
            </p>
            <p className="muted" style={petit}>Déjà passés en charge</p>
          </div>
          <div className="card">
            <p className="card__title">Valeur nette</p>
            <p className="amount" style={chiffre}>
              {money(Number(e.valeur_brute ?? 0) - Number(e.amortissements_cumules ?? 0))}
            </p>
            <p className="muted" style={petit}>Ce qui reste à amortir</p>
          </div>
          <div className="card" style={{
            borderLeft: Number(e.a_inscrire ?? 0) > 0 ? '3px solid var(--warning)' : undefined,
          }}>
            <p className="card__title">À inscrire</p>
            <p className="amount" style={{
              ...chiffre,
              color: Number(e.a_inscrire ?? 0) > 0 ? 'var(--warning)' : undefined,
            }}>
              {Number(e.a_inscrire ?? 0)}
            </p>
            <p className="muted" style={petit}>
              {Number(e.a_inscrire ?? 0) > 0
                ? 'Passés en charge à tort' : 'Registre à jour'}
            </p>
          </div>
        </div>

        <Immobilisations
          biens={(biens ?? []) as unknown as Bien[]}
          plans={plans}
          aInscrire={manquants}
          peutGerer={peut(profil.role, 'depenses', 'validate')}
        />

        {(biens ?? []).length === 0 && manquants.length === 0 && (
          <div className="card">
            <div className="etat-vide">
              <p>Aucune immobilisation.</p>
              <p className="muted">
                Un achat durable au-delà de 500 € HT relève de la classe 2 :
                matériel de nettoyage, véhicule, informatique, mobilier. En
                dessous, il passe en charge.
              </p>
              <Link href="/depenses/nouvelle" className="btn btn--ghost">
                Saisir une dépense
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const chiffre: React.CSSProperties = {
  fontSize: '1.35rem', fontFamily: 'var(--display)', fontWeight: 600,
};
const petit: React.CSSProperties = { fontSize: 'var(--fs-xs)', marginTop: '.3rem' };
