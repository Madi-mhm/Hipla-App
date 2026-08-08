import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import Recherche from './Recherche';

export const metadata = { title: 'Recherche — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'read')) redirect('/');

  const supabase = await createClient();

  // Une seule collection homogène : la recherche ne doit pas obliger
  // à savoir dans quelle section se trouve une écriture.
  //
  // Elle interrogeait `depenses` et `frais_creation` — les tables
  // d'avant la refonte, qui ne reçoivent plus rien. Toute écriture
  // récente lui était donc invisible, et son silence passait pour une
  // absence. Un moteur qui ne trouve pas est pire qu'absent : on lui
  // fait confiance.
  const [{ data: ecritures }, { data: depl }] = await Promise.all([
    supabase.from('pieces')
      .select('id, numero_piece, nature, date_piece, tiers_libelle, objet, montant_ttc, etat, notes, categories(libelle)')
      .neq('nature', 'vente')
      .neq('nature', 'avoir')
      .order('date_piece', { ascending: false }),
    supabase.from('deplacements')
      .select('id, numero_piece, date_trajet, depart, arrivee, motif, kilometres, aller_retour, statut')
      .order('date_trajet', { ascending: false }),
  ]);

  // Les ventes, à part : elles ont leur propre écran et leur propre lien.
  const { data: ventes } = await supabase.from('pieces')
    .select('id, numero_piece, nature, date_piece, tiers_libelle, objet, montant_ttc, etat, notes')
    .in('nature', ['vente', 'avoir'])
    .order('date_piece', { ascending: false });

  const { data: abos } = await supabase
    .from('abonnements')
    .select('id, numero_piece, date_debut, nom, fournisseur, montant_ttc, statut, notes, categories(libelle)')
    .order('date_debut', { ascending: false });

  type Cat = { libelle: string } | { libelle: string }[] | null;
  const nomCat = (c: Cat) => (Array.isArray(c) ? c[0]?.libelle : c?.libelle) ?? null;

  // La nature du registre porte des noms techniques ; l'écran attend
  // ceux qu'il affiche déjà.
  const natureAffichee = (n: string) =>
    n === 'creation' ? 'frais' as const
    : n === 'km' ? 'deplacement' as const
    : n === 'amortissement' ? 'depense' as const
    : n === 'banque' ? 'depense' as const
    : 'depense' as const;

  const lienDe = (n: string, id: string) =>
    n === 'creation' ? '/frais-creation'
    : n === 'banque' ? '/banque'
    : `/depenses/${id}`;

  const pieces = [
    ...(ecritures ?? []).map((d) => ({
      id: d.id,
      numero: d.numero_piece,
      nature: natureAffichee(d.nature),
      date: d.date_piece,
      tiers: d.tiers_libelle,
      libelle: d.objet ?? '',
      categorie: nomCat(d.categories as Cat),
      montant: Number(d.montant_ttc),
      statut: d.etat,
      notes: d.notes,
      lien: lienDe(d.nature, d.id),
    })),
    ...(ventes ?? []).map((v) => ({
      id: v.id,
      numero: v.numero_piece,
      nature: 'vente' as const,
      date: v.date_piece,
      tiers: v.tiers_libelle,
      libelle: v.objet ?? '',
      categorie: null,
      montant: Number(v.montant_ttc),
      statut: v.etat,
      notes: v.notes,
      lien: `/ventes/${v.id}`,
    })),
    ...(abos ?? []).map((a) => ({
      id: a.id,
      numero: a.numero_piece,
      nature: 'abonnement' as const,
      date: a.date_debut,
      tiers: a.fournisseur,
      libelle: a.nom,
      categorie: nomCat(a.categories as Cat),
      montant: Number(a.montant_ttc),
      statut: a.statut,
      notes: a.notes,
      lien: '/abonnements',
    })),
    ...(depl ?? []).map((t) => ({
      id: t.id,
      numero: t.numero_piece,
      nature: 'deplacement' as const,
      date: t.date_trajet,
      tiers: `${t.depart} → ${t.arrivee}`,
      libelle: t.motif,
      categorie: null,
      montant: null,
      statut: t.statut,
      notes: `${Number(t.kilometres) * (t.aller_retour ? 2 : 1)} km`,
      lien: '/deplacements',
    })),
  ];

  return (
    <>
      <Header titre="Recherche" sousTitre="Toutes les écritures, toutes sections confondues" />
      <div className="content">
        <Recherche pieces={pieces} />
      </div>
    </>
  );
}
