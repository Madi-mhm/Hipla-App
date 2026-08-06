import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import EspaceComptable from './EspaceComptable';
import type { Anomalie, Commentaire, Tache } from '@/lib/types';

export const metadata = { title: 'Espace comptable — Hipla Gestion' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'exports', 'export')) redirect('/');

  const supabase = await createClient();

  const [
    { data: exercices }, { data: anomalies }, { data: depenses },
    { data: frais }, { data: commentaires }, { data: taches },
  ] = await Promise.all([
    supabase.from('exercices').select('*').order('date_debut'),
    supabase.from('v_anomalies').select('*').order('date_piece', { ascending: false }),
    supabase.from('depenses')
      .select('id, date_depense, montant_ht, montant_ttc, tva_deductible, statut, revu_le'),
    supabase.from('frais_creation')
      .select('id, montant_ht, montant_ttc, tva_deductible, statut_reprise, revu_le'),
    supabase.from('commentaires')
      .select('*, profils!commentaires_cree_par_fkey(nom_complet)')
      .order('cree_le', { ascending: false }).limit(50),
    supabase.from('taches')
      .select('*, assigne:profils!taches_assignee_a_fkey(nom_complet), auteur:profils!taches_cree_par_fkey(nom_complet)')
      .neq('statut', 'annulee')
      .order('echeance', { ascending: true, nullsFirst: false }),
  ]);

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const exerciceCourant =
    (exercices ?? []).find((e) => aujourdhui >= e.date_debut && aujourdhui <= e.date_fin)
    ?? (exercices ?? [])[0];

  const dep = depenses ?? [];
  const frs = frais ?? [];

  const chiffres = {
    chargesHT:
      dep.filter((d) => d.statut === 'validee').reduce((s, d) => s + Number(d.montant_ht), 0)
      + frs.filter((f) => f.statut_reprise === 'repris').reduce((s, f) => s + Number(f.montant_ht), 0),
    tvaDeductible:
      dep.filter((d) => d.statut === 'validee').reduce((s, d) => s + Number(d.tva_deductible), 0)
      + frs.filter((f) => f.statut_reprise === 'repris').reduce((s, f) => s + Number(f.tva_deductible), 0),
    ecrituresTotal: dep.length + frs.length,
    ecrituresRevues: dep.filter((d) => d.revu_le).length + frs.filter((f) => f.revu_le).length,
  };

  return (
    <>
      <Header
        titre="Espace comptable"
        sousTitre={`Bonjour ${profil.nom_complet.split(' ')[0]} — état du dossier`}
      />
      <div className="content">
        <EspaceComptable
          exercice={exerciceCourant ?? null}
          chiffres={chiffres}
          anomalies={(anomalies ?? []) as Anomalie[]}
          commentaires={(commentaires ?? []) as Commentaire[]}
          taches={(taches ?? []) as Tache[]}
          utilisateurId={profil.id}
        />
      </div>
    </>
  );
}
