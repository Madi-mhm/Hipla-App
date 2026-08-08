'use client';

/**
 * CONSTATATION DES INDEMNITÉS KILOMÉTRIQUES
 *
 * Un trajet n'est pas une charge. Le barème étant progressif, le même
 * trajet ne vaut pas la même chose selon la place qu'il occupe dans
 * l'année — on ne peut donc valoriser qu'une PÉRIODE entière.
 *
 * L'écriture produite crédite le compte courant d'associé : c'est un
 * remboursement dû à celui qui a utilisé son véhicule personnel, pas un
 * décaissement. Rien ne passe par la banque tant que l'argent n'est pas
 * versé.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money, date } from '@/lib/format';
import Alerte from '@/components/Alerte';

export type EtatKm = {
  trajets: number;
  kilometres: number;
  premier: string | null;
  dernier: string | null;
  cumul_annuel: number;
  cv_fiscaux: number | null;
  bareme_renseigne: boolean;
  annee: number;
  en_attente: number;
};

export default function ConstaterKm({ etat, peutConstater }: {
  etat: EtatKm; peutConstater: boolean;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  // Par défaut, le mois écoulé : c'est la périodicité qui convient à une
  // petite structure, assez fine pour suivre, assez large pour ne pas
  // fabriquer une écriture par semaine.
  const finMoisDernier = new Date();
  finMoisDernier.setDate(0);
  const [debut, setDebut] = useState(
    etat.premier ?? new Date(finMoisDernier.getFullYear(), finMoisDernier.getMonth(), 1)
      .toISOString().slice(0, 10));
  const [fin, setFin] = useState(
    etat.dernier ?? finMoisDernier.toISOString().slice(0, 10));

  async function constater() {
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    const supabase = createClient();

    const { data, error } = await supabase.rpc('constater_indemnites_km', {
      p_debut: debut, p_fin: fin,
    });

    if (error) { setErreur(`Constatation impossible — ${error.message}`); setEnCours(false); return; }

    const r = data as {
      constate?: boolean; motif?: string; numero_piece?: string;
      trajets?: number; km_periode?: number; indemnite?: number;
    } | null;

    if (!r?.constate) {
      setErreur(r?.motif ?? 'Rien à constater sur cette période.');
      setEnCours(false);
      return;
    }

    setSucces(
      `${r.numero_piece} — ${money(Number(r.indemnite ?? 0))} pour `
      + `${r.trajets} trajet${(r.trajets ?? 0) > 1 ? 's' : ''} et `
      + `${Number(r.km_periode ?? 0).toFixed(0)} km. `
      + 'La somme est portée à votre compte courant d\u2019associé.'
    );
    setEnCours(false);
    router.refresh();
  }

  if (!etat.bareme_renseigne) {
    return (
      <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--danger)' }}>
        <p className="card__title" style={{ color: 'var(--danger)' }}>
          Barème kilométrique {etat.annee} absent
        </p>
        <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '68ch' }}>
          Aucune indemnité ne peut être calculée. Le barème est publié chaque
          année par l&apos;administration ; sans lui, vos trajets s&apos;accumulent
          sans jamais devenir une charge ni une créance.
        </p>
      </div>
    );
  }

  if (etat.trajets === 0) {
    return (
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card__title">Indemnités kilométriques</p>
        <p className="muted" style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '68ch' }}>
          Aucun trajet validé n&apos;attend d&apos;être indemnisé.
          {etat.en_attente > 0 && (
            <> {etat.en_attente} trajet{etat.en_attente > 1 ? 's' : ''} attend
            {etat.en_attente > 1 ? 'ent' : ''} votre validation.</>
          )}
        </p>
        <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.5rem' }}>
          Cumul {etat.annee} : {Number(etat.cumul_annuel).toFixed(0)} km
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--gold)' }}>
      <p className="card__title">Indemnités à constater</p>

      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '70ch' }}>
        <strong>{etat.trajets} trajet{etat.trajets > 1 ? 's' : ''}</strong> validé
        {etat.trajets > 1 ? 's' : ''} et non encore indemnisé
        {etat.trajets > 1 ? 's' : ''}, pour{' '}
        <strong>{Number(etat.kilometres).toFixed(0)} km</strong>
        {etat.premier && etat.dernier && (
          <> — du {date(etat.premier)} au {date(etat.dernier)}</>
        )}.
      </p>

      <p className="muted" style={{
        fontSize: 'var(--fs-sm)', marginTop: '.6rem', lineHeight: 1.55, maxWidth: '70ch',
      }}>
        L&apos;indemnité se calcule sur la période entière, jamais trajet par
        trajet : le barème est progressif, et le coefficient dépend du cumul
        annuel — {Number(etat.cumul_annuel).toFixed(0)} km à ce jour pour{' '}
        {etat.annee}.
      </p>

      {peutConstater && (
        <>
          <div style={{
            display: 'grid', gap: '.9rem', marginTop: '1.1rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
          }}>
            <label>
              <span>Du</span>
              <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} />
            </label>
            <label>
              <span>Au</span>
              <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
            </label>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <button onClick={constater} disabled={enCours} className="btn btn--gold">
              {enCours ? 'Calcul…' : 'Constater les indemnités'}
            </button>
          </div>

          <p className="muted" style={{
            fontSize: 'var(--fs-xs)', marginTop: '.8rem', lineHeight: 1.5, maxWidth: '70ch',
          }}>
            L&apos;écriture porte la charge au compte 6251 et crédite votre compte
            courant d&apos;associé : la société vous doit cette somme, et pourra
            vous la rembourser sans impôt ni charge sociale. Aucune TVA — le
            barème est forfaitaire. Aucun mouvement bancaire tant que le
            versement n&apos;a pas lieu.
          </p>
        </>
      )}
    </div>
  );
}
