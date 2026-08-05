'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Vehicule } from '@/lib/types';
import styles from '../../depenses/nouvelle/formulaire.module.css';

export default function FormulaireDeplacement({
  vehicules, peutValider,
}: { vehicules: Vehicule[]; peutValider: boolean }) {
  const router = useRouter();
  const [dateTrajet, setDateTrajet] = useState(new Date().toISOString().slice(0, 10));
  const [vehiculeId, setVehiculeId] = useState(vehicules[0]?.id ?? '');
  const [depart, setDepart] = useState('Chambéry');
  const [arrivee, setArrivee] = useState('');
  const [motif, setMotif] = useState('');
  const [kilometres, setKilometres] = useState('');
  const [allerRetour, setAllerRetour] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const km = parseFloat(kilometres.replace(',', '.'));
  const kmTotal = Number.isFinite(km) ? km * (allerRetour ? 2 : 1) : 0;

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!vehiculeId) { setErreur('Choisissez un véhicule.'); return; }
    if (!Number.isFinite(km) || km <= 0) { setErreur('Kilométrage invalide.'); return; }
    if (motif.trim().length < 5) {
      setErreur("Le motif professionnel est obligatoire : c'est lui qui justifie l'indemnité en cas de contrôle.");
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
      arrivee: arrivee.trim(),
      motif: motif.trim(),
      kilometres: km,
      aller_retour: allerRetour,
      statut: peutValider ? 'validee' : 'en_attente',
      cree_par: user.id,
      valide_par: peutValider ? user.id : null,
      valide_le: peutValider ? new Date().toISOString() : null,
    }).select('id').single();

    if (error) { setErreur(`Enregistrement impossible : ${error.message}`); setEnCours(false); return; }

    await supabase.rpc('journaliser', {
      p_action: 'creation', p_table: 'deplacements', p_id: data?.id ?? null,
      p_details: { trajet: `${depart} → ${arrivee}`, km: kmTotal },
    });

    router.push('/deplacements');
    router.refresh();
  }

  return (
    <form onSubmit={soumettre} className={styles.form}>
      <div className="card">
        <p className="card__title">Trajet</p>
        <div className={styles.grille}>
          <label className={styles.champ}>
            <span>Date *</span>
            <input type="date" value={dateTrajet} onChange={(e) => setDateTrajet(e.target.value)} required />
          </label>
          <label className={styles.champ}>
            <span>Véhicule *</span>
            <select value={vehiculeId} onChange={(e) => setVehiculeId(e.target.value)} required>
              {vehicules.map((v) => (
                <option key={v.id} value={v.id}>{v.libelle} — {v.cv_fiscaux} CV</option>
              ))}
            </select>
          </label>
          <label className={styles.champ}>
            <span>Départ *</span>
            <input type="text" value={depart} onChange={(e) => setDepart(e.target.value)} required />
          </label>
          <label className={styles.champ}>
            <span>Arrivée *</span>
            <input type="text" value={arrivee} onChange={(e) => setArrivee(e.target.value)} required placeholder="Aix-les-Bains, Courchevel…" />
          </label>
          <label className={`${styles.champ} ${styles.pleine}`}>
            <span>Motif professionnel *</span>
            <input type="text" value={motif} onChange={(e) => setMotif(e.target.value)} required placeholder="Intervention chez M. Dupont, devis bureaux…" />
          </label>
          <label className={styles.champ}>
            <span>Kilomètres (aller) *</span>
            <input type="text" inputMode="decimal" value={kilometres} onChange={(e) => setKilometres(e.target.value)} required placeholder="15" />
          </label>
          <label className={styles.champ} style={{ justifyContent: 'flex-end' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '.5rem', textTransform: 'none', letterSpacing: 0, fontSize: 'var(--fs-sm)', fontFamily: 'var(--body)', fontWeight: 400, color: 'var(--ink)' }}>
              <input type="checkbox" checked={allerRetour} onChange={(e) => setAllerRetour(e.target.checked)} style={{ width: 'auto', minHeight: 0 }} />
              Aller-retour
            </span>
          </label>
        </div>

        {kmTotal > 0 && (
          <div className={styles.recap}>
            <div><span>Distance comptée</span><strong className="amount">{kmTotal.toLocaleString('fr-FR')} km</strong></div>
          </div>
        )}

        <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.8rem', lineHeight: 1.5 }}>
          L'indemnité n'est pas calculée par trajet : le barème dépend du
          kilométrage cumulé sur l'année. Le total apparaît sur la page
          Déplacements.
        </p>
      </div>

      {erreur && <p className={styles.alerteRouge}>{erreur}</p>}

      <div className={styles.actions}>
        <button type="submit" className="btn btn--gold" disabled={enCours}>
          {enCours ? 'Enregistrement…' : peutValider ? 'Enregistrer' : 'Soumettre à validation'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => router.push('/deplacements')}>Annuler</button>
      </div>
    </form>
  );
}
