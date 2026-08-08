import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import Exports from './Exports';
import type { Categorie } from '@/lib/types';

export const metadata = { title: 'Exports — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'exports', 'read')) redirect('/');

  const supabase = await createClient();

  // Le registre remplace `depenses` et `frais_creation`, qui ne
  // reçoivent plus rien depuis la bascule : l'export omettait donc
  // toute écriture récente — et c'est ce fichier qu'un cabinet reçoit.
  const [{ data: ecritures }, { data: depl }, { data: cats }, { data: exs }] =
    await Promise.all([
      supabase.from('pieces')
        .select('*, categories(libelle, groupe)')
        .in('nature', ['achat', 'creation', 'km', 'amortissement'])
        .order('date_piece'),
      supabase.from('deplacements').select('*, vehicules(libelle)').order('date_trajet'),
      supabase.from('categories').select('*').order('ordre'),
      supabase.from('exercices').select('*').order('date_debut'),
    ]);

  // L'écran attend deux collections distinctes, avec les noms de
  // colonnes d'avant. On les lui donne plutôt que de le récrire : moins
  // de surface de casse, et le format d'export ne change pas pour le
  // cabinet qui le reçoit.
  // `Record<string, unknown>` rendait chaque champ inconnu, et l'écran
  // attend des types précis. On décrit donc ce qu'on lit vraiment.
  type Piece = {
    id: string; numero_piece: string | null; nature: string;
    date_piece: string; tiers_libelle: string; objet: string | null;
    compte: string | null;
    montant_ht: number; taux_tva: number; montant_tva: number;
    montant_ttc: number; tva_comptable: number;
    moyen_paiement: string | null; paye_par: string | null;
    etat: string; notes: string | null; categorie_id: string | null;
    categories?: { libelle: string; groupe: string };
  };
  const versLigne = (p: Piece) => ({
    numero_piece: p.numero_piece,
    fournisseur: p.tiers_libelle,
    libelle: p.objet,
    compte: p.compte ?? '',
    montant_ht: p.montant_ht,
    taux_tva: p.taux_tva,
    montant_tva: p.montant_tva,
    // `tva_deductible` s'appelle `tva_comptable` dans le registre :
    // c'est la TVA réellement déduite, après taux de déductibilité.
    tva_deductible: p.tva_comptable,
    montant_ttc: p.montant_ttc,
    taux_deductibilite: p.montant_tva && Number(p.montant_tva) > 0
      ? Math.round(Number(p.tva_comptable) / Number(p.montant_tva) * 100) : 100,
    moyen_paiement: p.moyen_paiement,
    paye_par: p.paye_par,
    statut: p.etat,
    notes: p.notes,
    categorie_id: p.categorie_id ?? '',
    categories: p.categories,
  });

  const toutes = (ecritures ?? []) as Piece[];

  const dep = toutes
    .filter((p) => p.nature !== 'creation')
    .map((p) => ({ ...versLigne(p), date_depense: p.date_piece }));

  const frais = toutes
    .filter((p) => p.nature === 'creation')
    .map((p) => ({
      ...versLigne(p),
      date_engagement: p.date_piece,
      associe_payeur: p.paye_par ?? '',
      nature: 'creation',
      mode_reprise: p.moyen_paiement ?? '',
      statut_reprise: p.etat,
    }));

  const { data: abos } = await supabase
    .from('abonnements')
    .select('*, categories(libelle)')
    .order('date_debut');

  return (
    <>
      <Header titre="Exports" sousTitre="Extraction filtrée des écritures" />
      <div className="content">
        <Exports
          depenses={dep}
          frais={frais}
          deplacements={depl ?? []}
          abonnements={abos ?? []}
          categories={(cats ?? []) as Categorie[]}
          exercices={exs ?? []}
        />
      </div>
    </>
  );
}
