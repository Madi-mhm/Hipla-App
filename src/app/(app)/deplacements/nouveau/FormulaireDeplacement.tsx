'use client';

/**
 * SAISIE D'UN DÉPLACEMENT
 *
 * Un trajet n'a pas de montant : le barème est progressif, et le même
 * trajet de 30 km ne vaut pas la même chose en janvier et en novembre.
 * On enregistre donc des kilomètres, jamais des euros — l'écriture
 * d'indemnité se constate périodiquement, ailleurs.
 *
 * AUTOCOMPLÉTION APPRISE, PAS FIGÉE
 * Les lieux viennent de vos trajets passés ET des villes de vos clients.
 * Les motifs viennent de ce que vous avez déjà écrit, les plus fréquents
 * en tête. Une liste figée conduirait à choisir le moins faux plutôt
 * qu'à écrire le vrai — et le motif est justement la seule mention qu'un
 * vérificateur exige vraiment.
 *
 * L'INDEMNITÉ S'AFFICHE À LA SAISIE
 * Non pas pour être enregistrée, mais pour que vous sachiez ce que vaut
 * le trajet. Un montant qu'on ne voit jamais finit par ne plus être
 * saisi.
 */

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/format';
import type { Vehicule } from '@/lib/types';
import { detailsCreation } from '@/lib/audit';
import styles from '../../depenses/nouvelle/formulaire.module.css';

type Tranche = { km_min: number; km_max: number | null; coefficient: number; forfait: number };

type Props = {
  vehicules: Vehicule[];
  peutValider: boolean;
  lieux: string[];
  motifs: string[];
  bareme: Tranche[];
  cumulAnnuel: number;
};

/**
 * L'indemnité d'un trajet est la DIFFÉRENCE entre le cumul avant et
 * après. Le barème étant progressif, valoriser les kilomètres isolément
 * surestimerait les premiers et sous-estimerait les suivants.
 */
function indemnite(cumulAvant: number, kmAjoutes: number, bareme: Tranche[]): number {
  const valeur = (cumul: number) => {
    if (cumul <= 0) return 0;
    const t = bareme.find(
      (b) => cumul >= b.km_min && (b.km_max === null || cumul <= b.km_max));
    if (!t) return 0;
    return cumul * Number(t.coefficient) + Number(t.forfait);
  };
  return Math.max(
    Math.round((valeur(cumulAvant + kmAjoutes) - valeur(cumulAvant)) * 100) / 100, 0);
}

export default function FormulaireDeplacement({
  vehicules, peutValider, lieux, motifs, bareme, cumulAnnuel,
}: Props) {
  const router = useRouter();
  const [dateTrajet, setDateTrajet] = useState(new Date().toISOString().slice(0, 10));
  const [vehiculeId, setVehiculeId] = useState(vehicules[0]?.id ?? '');
  const [depart, setDepart] = useState('Chambéry');
  const [arrivee, setArrivee] = useState('');
  const [etapes, setEtapes] = useState<string[]>([]);
  const [nouvelleEtape, setNouvelleEtape] = useState('');
  const [motif, setMotif] = useState('');
  const [kilometres, setKilometres] = useState('');
  const [allerRetour, setAllerRetour] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const km = parseFloat(kilometres.replace(',', '.'));
  const kmTotal = Number.isFinite(km) ? km * (allerRetour ? 2 : 1) : 0;

  const valeur = useMemo(
    () => indemnite(cumulAnnuel, kmTotal, bareme), [cumulAnnuel, kmTotal, bareme]);

  // Le passage d'une tranche à l'autre change le coefficient : le
  // signaler évite la surprise sur l'écriture du mois.
  const trancheAvant = bareme.find(
    (b) => cumulAnnuel >= b.km_min && (b.km_max === null || cumulAnnuel <= b.km_max));
  const trancheApres = bareme.find(
    (b) => cumulAnnuel + kmTotal >= b.km_min
        && (b.km_max === null || cumulAnnuel + kmTotal <= b.km_max));
  const changeDeTranche = kmTotal > 0 && trancheAvant !== trancheApres;

  function ajouterEtape() {
    const e = nouvelleEtape.trim();
    if (!e || etapes.includes(e)) return;
    setEtapes([...etapes, e]);
    setNouvelleEtape('');
  }

  // Une tournée : plusieurs arrêts, un seul trajet comptable. La
  // destination devient la liste des étapes.
  const destination = etapes.length > 0
    ? `Tournée — ${etapes.join(', ')}`
    : arrivee.trim();

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!vehiculeId) { setErreur('Choisissez un véhicule.'); return; }
    if (!destination) { setErreur('Indiquez une destination ou au moins une étape.'); return; }
    if (!Number.isFinite(km) || km <= 0) { setErreur('Kilométrage invalide.'); return; }
    if (motif.trim().length < 5) {
      setErreur('Le motif professionnel est obligatoire : c\u2019est lui qui justifie '
              + 'l\u2019indemnité en cas de contrôle.');
      return;
    }

    setEnCours(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErreur('Session expirée.'); setEnCours(false); return; }

    const { data, error } = await supabase.from('deplacements').insert({
      date_trajet: dateTrajet,
      vehicule_id: vehiculeId,
      depart: depart.trim(),
      arrivee: destination,
      motif: motif.trim(),
      kilometres: km,
      aller_retour: allerRetour,
      statut: peutValider ? 'validee' : 'en_attente',
      cree_par: user.id,
    }).select('id, numero_piece').single();

    if (error) { setErreur(error.message); setEnCours(false); return; }

    // `detailsCreation` attend l'enregistrement PUIS le résumé, dans cet
    // ordre. Le journal conserve tous les champs, pas seulement ceux qui
    // paraissent utiles aujourd'hui.
    const vehicule = vehicules.find((v) => v.id === vehiculeId);
    await supabase.rpc('journaliser', {
      p_action: 'creation',
      p_table: 'deplacements',
      p_id: data?.id ?? null,
      p_details: detailsCreation(
        {
          date_trajet: dateTrajet,
          vehicule: vehicule?.libelle ?? null,
          depart: depart.trim(),
          arrivee: destination,
          etapes: etapes.length > 0 ? etapes.join(' · ') : null,
          motif: motif.trim(),
          kilometres: km,
          aller_retour: allerRetour,
          km_comptes: kmTotal,
          indemnite_estimee: valeur,
          cumul_annuel_apres: cumulAnnuel + kmTotal,
          statut: peutValider ? 'validee' : 'en_attente',
        },
        `${depart.trim()} → ${destination} · ${kmTotal} km · ${money(valeur)}`
      ),
    });

    router.push('/deplacements');
    router.refresh();
  }

  return (
    <form onSubmit={soumettre} className={styles.form}>
      {erreur && <p className={styles.alerteRouge}>{erreur}</p>}

      {/* Les listes servent d'autocomplétion native : le champ reste
          libre, la suggestion n'impose rien. */}
      <datalist id="lieux-connus">
        {lieux.map((l) => <option key={l} value={l} />)}
      </datalist>
      <datalist id="motifs-connus">
        {motifs.map((m) => <option key={m} value={m} />)}
      </datalist>

      <div className={styles.grille}>
        <label className={styles.champ}>
          <span>Date du trajet *</span>
          <input type="date" value={dateTrajet} required
            onChange={(e) => setDateTrajet(e.target.value)} />
        </label>

        <label className={styles.champ}>
          <span>Véhicule *</span>
          <select value={vehiculeId} onChange={(e) => setVehiculeId(e.target.value)}>
            {vehicules.map((v) => (
              <option key={v.id} value={v.id}>
                {v.libelle} — {v.cv_fiscaux} CV
              </option>
            ))}
          </select>
        </label>

        <label className={styles.champ}>
          <span>Départ *</span>
          <input type="text" value={depart} list="lieux-connus" required
            onChange={(e) => setDepart(e.target.value)}
            placeholder="Chambéry" />
        </label>

        <label className={styles.champ}>
          <span>Arrivée</span>
          <input type="text" value={arrivee} list="lieux-connus"
            onChange={(e) => setArrivee(e.target.value)}
            placeholder="Aix-les-Bains"
            disabled={etapes.length > 0} />
        </label>
      </div>

      {/* ---- Tournée ---- */}
      <div style={{
        marginTop: '1rem', padding: '.9rem 1rem',
        background: 'var(--g-50)', borderRadius: 6,
      }}>
        <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 500, marginBottom: '.3rem' }}>
          Ou une tournée à plusieurs arrêts
        </p>
        <p className="muted" style={{
          fontSize: 'var(--fs-xs)', lineHeight: 1.5, marginBottom: '.7rem', maxWidth: '64ch',
        }}>
          Prospection, dépôt de cartes, visites de repérage : plusieurs arrêts
          font un seul trajet comptable. Relevez le compteur au départ et au
          retour, la différence est votre kilométrage — sans cocher
          aller-retour, il est déjà compris.
        </p>

        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <input type="text" value={nouvelleEtape} list="lieux-connus"
            onChange={(e) => setNouvelleEtape(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); ajouterEtape(); }
            }}
            placeholder="Ajouter un arrêt…"
            style={{ flex: '1 1 14rem' }} />
          <button type="button" onClick={ajouterEtape} className="btn btn--ghost"
            disabled={!nouvelleEtape.trim()}>
            Ajouter
          </button>
        </div>

        {etapes.length > 0 && (
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginTop: '.7rem' }}>
            {etapes.map((e, i) => (
              <span key={e} style={{
                display: 'inline-flex', alignItems: 'center', gap: '.4rem',
                background: 'var(--g-0)', border: '1px solid var(--g-300)',
                borderRadius: 4, padding: '.2rem .5rem', fontSize: 'var(--fs-xs)',
              }}>
                <span className="muted mono" style={{ fontSize: '.62rem' }}>{i + 1}</span>
                {e}
                <button type="button"
                  onClick={() => setEtapes(etapes.filter((x) => x !== e))}
                  style={{
                    border: 0, background: 'none', cursor: 'pointer',
                    color: 'var(--g-500)', padding: 0, lineHeight: 1,
                  }}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className={styles.grille} style={{ marginTop: '1rem' }}>
        <label className={`${styles.champ} ${styles.pleine}`}>
          <span>Motif professionnel *</span>
          <input type="text" value={motif} list="motifs-connus" required
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Prospection commerciale — hôtels et bureaux" />
        </label>

        <label className={styles.champ}>
          <span>Kilomètres *</span>
          <input type="text" inputMode="decimal" value={kilometres} required
            onChange={(e) => setKilometres(e.target.value)}
            placeholder="80" />
        </label>

        <label className={styles.champ}
          style={{ flexDirection: 'row', alignItems: 'center',
                   gap: '.5rem', paddingTop: '1.55rem' }}>
          <input type="checkbox" checked={allerRetour} style={{ width: 'auto' }}
            onChange={(e) => setAllerRetour(e.target.checked)}
            disabled={etapes.length > 0} />
          <span style={{ margin: 0 }}>Aller-retour</span>
        </label>
      </div>

      <p className="muted" style={{
        fontSize: 'var(--fs-xs)', marginTop: '.6rem', lineHeight: 1.5, maxWidth: '66ch',
      }}>
        Le motif est la seule mention qu&apos;un vérificateur exige vraiment.
        « Prospection commerciale » se défend ; « déplacement » ne se défend pas.
      </p>

      {/* ---- Ce que vaut le trajet ---- */}
      {kmTotal > 0 && (
        <div style={{
          marginTop: '1.2rem', padding: '.9rem 1rem',
          background: 'var(--bone)', borderRadius: 6,
          borderLeft: '2px solid var(--gold)',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 'var(--fs-sm)' }}>
              {kmTotal.toFixed(1).replace('.', ',')} km
              {allerRetour && etapes.length === 0 && ' (aller-retour)'}
            </span>
            <span className="amount" style={{
              fontFamily: 'var(--display)', fontSize: '1.15rem', fontWeight: 600,
              color: 'var(--navy)',
            }}>
              {money(valeur)}
            </span>
          </div>
          <p className="muted" style={{
            fontSize: 'var(--fs-xs)', marginTop: '.35rem', lineHeight: 1.5,
          }}>
            Cumul annuel porté de {cumulAnnuel.toFixed(0)} à{' '}
            {(cumulAnnuel + kmTotal).toFixed(0)} km.
            {changeDeTranche && (
              <strong style={{ color: 'var(--warning)' }}>
                {' '}Ce trajet fait changer de tranche : le coefficient du barème baisse
                au-delà de 5 000 km.
              </strong>
            )}
          </p>
          <p className="muted" style={{
            fontSize: 'var(--fs-xs)', marginTop: '.3rem', lineHeight: 1.5,
          }}>
            Ce montant n&apos;est pas enregistré. L&apos;indemnité se constate
            en fin de période, sur l&apos;écran des déplacements.
          </p>
        </div>
      )}

      <div className={styles.actions}>
        <button type="submit" disabled={enCours} className="btn btn--gold">
          {enCours ? 'Enregistrement…' : 'Enregistrer le trajet'}
        </button>
      </div>
    </form>
  );
}
