import Header from '@/components/Header';
import EtatAutomatismes, { type EtatTraitement } from '@/components/EtatAutomatismes';
import SeanceHebdo, { type Seance } from '@/components/accueil/SeanceHebdo';
import Relances, { type Relance } from '@/components/accueil/Relances';
import { ChiffresCles, Analyse, type Bord } from '@/components/accueil/TableauDeBord';
import Echeancier from '@/components/Echeancier';
import { type Groupes, sansRecurrences } from '@/lib/echeances';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { dateLong } from '@/lib/format';

export const metadata = { title: 'Accueil — Hipla Gestion' };
export const dynamic = 'force-dynamic';

/**
 * L'ACCUEIL
 *
 * Réunit ce qui était réparti sur quatre écrans — séance hebdomadaire,
 * tableau de bord, échéances et espace comptable — dans l'ordre où l'on
 * s'en sert : l'état des automatismes, les chiffres, ce qui attend une
 * décision, ce qui arrive à échéance, puis l'analyse détaillée.
 */
export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');

  if (!peut(profil.role, 'depenses', 'read')) {
    return (
      <>
        <Header titre="Accueil" />
        <div className="content">
          <div className="card">
            <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55 }}>
              Votre rôle ne donne encore accès à aucune section. Le
              propriétaire peut l&apos;ajuster dans Réglages → Utilisateurs.
            </p>
          </div>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const [seance, relances, sync, sauv, bord, comptes, echeances] = await Promise.all([
    supabase.rpc('seance_hebdomadaire'),
    supabase.rpc('a_relancer'),
    supabase.from('synchronisations').select('statut, demarree_le, erreur')
      .order('demarree_le', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('sauvegardes').select('statut, demarree_le, erreur')
      .order('demarree_le', { ascending: false }).limit(1).maybeSingle(),
    supabase.rpc('tableau_de_bord'),
    // `tableau_de_bord` recalcule le compte courant à sa façon et manque
    // remboursements et apports : on lit la source.
    supabase.rpc('solde_compte_courant'),
    supabase.rpc('echeancier', { p_horizon: 31 }),
  ]);

  const etat = (r: { data: { statut: string; demarree_le: string; erreur: string | null } | null }): EtatTraitement => ({
    statut: r.data?.statut ?? null, quand: r.data?.demarree_le ?? null, erreur: r.data?.erreur ?? null,
  });

  const compteCourant = ((comptes.data ?? []) as Array<{ solde: number | string }>)
    .reduce((t, s) => t + Number(s.solde), 0);

  const donnees = bord.data as Bord | null;

  // Seuls le retard et le mois en cours ont leur place ici ; le
  // calendrier complet est dans Comptabilité → Échéances.
  const groupes = sansRecurrences((echeances.data ?? {}) as Groupes);
  const urgentes: Groupes = { ...groupes, a_venir: [], accomplies: [] };

  return (
    <>
      <Header
        titre="Accueil"
        sousTitre={donnees
          ? `Exercice du ${dateLong(donnees.exercice_debut)} au ${dateLong(donnees.exercice_fin)}`
          : undefined}
      />
      <div className="content">
        <EtatAutomatismes synchro={etat(sync)} sauvegarde={etat(sauv)} />

        {donnees
          ? <ChiffresCles bord={donnees} compteCourant={compteCourant} />
          : <Erreur message={bord.error?.message ?? 'Les chiffres n’ont pas pu être calculés.'} />}

        {seance.data
          ? <SeanceHebdo seance={seance.data as Seance}
              peutAgir={peut(profil.role, 'depenses', 'validate')} />
          : <Erreur message={seance.error?.message ?? 'La liste des tâches n’a pas pu être constituée.'} />}

        {((relances.data ?? []) as Relance[]).length > 0 && (
          <Relances lignes={(relances.data ?? []) as Relance[]}
            peutRelancer={peut(profil.role, 'ventes', 'update')} />
        )}

        {(urgentes.en_retard?.length ?? 0) + (urgentes.ce_mois?.length ?? 0) > 0 && (
          <div style={{ marginTop: '1.5rem' }}>
            <Echeancier groupes={urgentes}
              peutAccomplir={peut(profil.role, 'echeances', 'update')} />
          </div>
        )}

        {donnees && (
          <div style={{ marginTop: '1.5rem' }}>
            <Analyse bord={donnees} compteCourant={compteCourant} />
          </div>
        )}
      </div>
    </>
  );
}

function Erreur({ message }: { message: string }) {
  return (
    <div className="card" style={{ marginBottom: '1.25rem' }}>
      <p className="card__title" style={{ color: 'var(--danger)' }}>Lecture impossible</p>
      <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55 }}>{message}</p>
    </div>
  );
}
