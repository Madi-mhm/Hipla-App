'use client';

/**
 * VÉHICULES ET BARÈME KILOMÉTRIQUE
 *
 * Le barème est lu pour l'ANNÉE du trajet. Sans ligne pour une année,
 * les indemnités de cette année valent zéro sans prévenir : d'où le
 * bouton qui prépare l'année suivante à partir de la précédente, à
 * vérifier ensuite sur impots.gouv.fr.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Alerte from '@/components/Alerte';
import type { Vehicule } from '@/lib/types';
import f from '@/styles/formulaire.module.css';

export type LigneBareme = {
  id: string; annee: number; cv_min: number; cv_max: number;
  km_min: number; km_max: number | null; coefficient: number; forfait: number;
};

type Saisie = {
  libelle: string; immatriculation: string; proprietaire_nom: string; cv_fiscaux: string;
  motorisation: 'thermique' | 'electrique' | 'hybride'; genre: 'VP' | 'VU';
  usage_societe: boolean; date_ct: string;
};

const VIDE: Saisie = {
  libelle: '', immatriculation: '', proprietaire_nom: '', cv_fiscaux: '5',
  motorisation: 'thermique', genre: 'VP', usage_societe: false, date_ct: '',
};

export default function GestionVehicules({ vehicules, bareme, usage, peutGerer }: {
  vehicules: Vehicule[]; bareme: LigneBareme[]; usage: Record<string, number>; peutGerer: boolean;
}) {
  const router = useRouter();
  const [edite, setEdite] = useState<Vehicule | 'nouveau' | null>(null);
  const [s, setS] = useState<Saisie>(VIDE);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const anneeCourante = new Date().getFullYear();
  const annees = useMemo(() => {
    const a = new Set(bareme.map((b) => b.annee));
    a.add(anneeCourante); a.add(anneeCourante + 1);
    return Array.from(a).sort();
  }, [bareme, anneeCourante]);
  const [annee, setAnnee] = useState(anneeCourante);
  const lignesAnnee = bareme.filter((b) => b.annee === annee);
  const derniere = Math.max(...bareme.filter((b) => b.annee < annee).map((b) => b.annee), 0);

  const champ = (k: keyof Saisie) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setS((v) => ({ ...v, [k]: e.target.value }));

  function ouvrir(v: Vehicule | 'nouveau') {
    setEdite(v); setErreur(null);
    setS(v === 'nouveau' ? VIDE : {
      libelle: v.libelle, immatriculation: v.immatriculation, proprietaire_nom: v.proprietaire_nom,
      cv_fiscaux: String(v.cv_fiscaux), motorisation: v.motorisation, genre: v.genre,
      usage_societe: v.usage_societe, date_ct: v.date_ct ?? '',
    });
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!edite) return;
    const cv = parseInt(s.cv_fiscaux, 10);
    if (Number.isNaN(cv) || cv < 1 || cv > 20) { setErreur('La puissance fiscale va de 1 à 20 CV.'); return; }
    setEnCours(true); setErreur(null);

    const donnees = {
      libelle: s.libelle.trim(), immatriculation: s.immatriculation.trim().toUpperCase(),
      proprietaire_nom: s.proprietaire_nom.trim(), cv_fiscaux: cv,
      motorisation: s.motorisation, genre: s.genre, usage_societe: s.usage_societe,
      date_ct: s.date_ct || null,
    };
    const supabase = createClient();
    const res = edite === 'nouveau'
      ? await supabase.from('vehicules').insert(donnees).select('id').single()
      : await supabase.from('vehicules').update(donnees).eq('id', edite.id).select('id').single();
    setEnCours(false);
    if (res.error) { setErreur(`Enregistrement impossible : ${res.error.message}`); return; }

    await supabase.rpc('journaliser', {
      p_action: edite === 'nouveau' ? 'creation' : 'modification',
      p_table: 'vehicules', p_id: res.data?.id ?? null,
      p_details: { resume: `${donnees.libelle} (${donnees.cv_fiscaux} CV)` },
    });
    setSucces(`Véhicule « ${donnees.libelle} » enregistré.`);
    setEdite(null);
    router.refresh();
  }

  async function basculer(v: Vehicule) {
    const supabase = createClient();
    const { error } = await supabase.from('vehicules').update({ actif: !v.actif }).eq('id', v.id);
    if (error) { setErreur(error.message); return; }
    router.refresh();
  }

  async function supprimer(v: Vehicule) {
    if (!window.confirm(`Supprimer « ${v.libelle} » ? Aucun trajet ne l'utilise.`)) return;
    const supabase = createClient();
    const { error } = await supabase.from('vehicules').delete().eq('id', v.id);
    if (error) { setErreur(`Suppression impossible (${error.message}). Archivez-le plutôt.`); return; }
    await supabase.rpc('journaliser', {
      p_action: 'suppression', p_table: 'vehicules', p_id: v.id, p_details: { resume: v.libelle },
    });
    router.refresh();
  }

  async function preparerAnnee() {
    const source = bareme.filter((b) => b.annee === derniere);
    if (source.length === 0) return;
    if (!window.confirm(`Créer le barème ${annee} en recopiant celui de ${derniere} ? `
      + 'Vérifiez ensuite les coefficients publiés pour cette année.')) return;
    const supabase = createClient();
    const { error } = await supabase.from('bareme_km').insert(source.map((b) => ({
      annee, cv_min: b.cv_min, cv_max: b.cv_max, km_min: b.km_min, km_max: b.km_max,
      coefficient: b.coefficient, forfait: b.forfait,
    })));
    if (error) { setErreur(`Barème non créé : ${error.message}`); return; }
    await supabase.rpc('journaliser', {
      p_action: 'creation', p_table: 'bareme_km', p_id: null,
      p_details: { resume: `Barème ${annee} recopié de ${derniere}` },
    });
    setSucces(`Barème ${annee} créé. Pensez à le comparer au barème officiel.`);
    router.refresh();
  }

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className={f.barre}>
          <p className="card__title" style={{ marginBottom: 0 }}>Véhicules</p>
          {peutGerer && !edite && (
            <button onClick={() => ouvrir('nouveau')} className="btn btn--gold">+ Nouveau véhicule</button>
          )}
        </div>

        {edite && (
          <form onSubmit={enregistrer} className={f.formulaire}>
            <label><span>Désignation *</span>
              <input value={s.libelle} onChange={champ('libelle')} required autoFocus
                placeholder="Renault Mégane Break" /></label>
            <label><span>Immatriculation *</span>
              <input value={s.immatriculation} onChange={champ('immatriculation')} required /></label>
            <label><span>Propriétaire *</span>
              <input value={s.proprietaire_nom} onChange={champ('proprietaire_nom')} required /></label>
            <label><span>Puissance fiscale (CV) *</span>
              <input type="number" min="1" max="20" value={s.cv_fiscaux} onChange={champ('cv_fiscaux')} required /></label>
            <label><span>Motorisation</span>
              <select value={s.motorisation} onChange={champ('motorisation')}>
                <option value="thermique">Thermique</option>
                <option value="hybride">Hybride</option>
                <option value="electrique">100 % électrique (+20 %)</option>
              </select></label>
            <label><span>Genre</span>
              <select value={s.genre} onChange={champ('genre')}>
                <option value="VP">VP — tourisme</option>
                <option value="VU">VU — utilitaire</option>
              </select></label>
            <label><span>Contrôle technique</span>
              <input type="date" value={s.date_ct} onChange={champ('date_ct')} /></label>
            <label className={f.case}>
              <input type="checkbox" checked={s.usage_societe}
                onChange={(e) => setS((v) => ({ ...v, usage_societe: e.target.checked }))} />
              Inscrit à l&apos;actif de la société
            </label>
            {s.usage_societe && (
              <p className={`${f.avert} ${f.pleine}`}>
                Un véhicule de la société ne donne pas lieu à indemnités kilométriques :
                ses frais réels (carburant, entretien, assurance) se saisissent en dépenses.
              </p>
            )}
            <div className={`${f.actions} ${f.pleine}`}>
              <button type="submit" className="btn btn--gold" disabled={enCours}>
                {enCours ? 'Enregistrement…' : edite === 'nouveau' ? 'Créer' : 'Enregistrer'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setEdite(null)}>Annuler</button>
            </div>
          </form>
        )}

        <div className="table-scroll" style={{ marginTop: '.8rem' }}>
          <table style={{ minWidth: 640, fontSize: 'var(--fs-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                <th className={f.th}>Véhicule</th>
                <th className={f.th}>Immatriculation</th>
                <th className={f.th}>Propriétaire</th>
                <th className={f.th} style={{ textAlign: 'right' }}>CV</th>
                <th className={f.th} style={{ textAlign: 'right' }}>Trajets</th>
                {peutGerer && <th className={f.th}></th>}
              </tr>
            </thead>
            <tbody>
              {vehicules.map((v) => (
                <tr key={v.id} className={`${f.ligne} ${v.actif ? '' : f.archive}`}>
                  <td className={f.td} style={{ fontWeight: 500 }}>
                    {v.libelle}
                    <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)', fontWeight: 400 }}>
                      {v.motorisation} · {v.genre}{v.usage_societe ? ' · à l’actif' : ' · personnel'}
                      {v.date_ct && ` · CT ${v.date_ct.split('-').reverse().join('/')}`}
                    </span>
                  </td>
                  <td className={`${f.td} mono`}>{v.immatriculation}</td>
                  <td className={f.td}>{v.proprietaire_nom}</td>
                  <td className={f.td} style={{ textAlign: 'right' }}>{v.cv_fiscaux}</td>
                  <td className={f.td} style={{ textAlign: 'right' }}>{usage[v.id] ?? 0}</td>
                  {peutGerer && (
                    <td className={f.td} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => ouvrir(v)} className="btn btn--ghost btn--sm">Modifier</button>{' '}
                      <button onClick={() => basculer(v)} className="btn btn--ghost btn--sm">
                        {v.actif ? 'Archiver' : 'Réactiver'}
                      </button>{' '}
                      {!usage[v.id] && (
                        <button onClick={() => supprimer(v)} className="btn btn--danger btn--sm">Supprimer</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className={f.barre}>
          <p className="card__title" style={{ marginBottom: 0 }}>Barème kilométrique</p>
          <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))}
            className={f.recherche} style={{ flex: '0 0 8rem', minHeight: 36 }}>
            {annees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {lignesAnnee.length === 0 ? (
          <div style={{ marginTop: '.9rem' }}>
            <p className={f.avert}>
              Aucun barème pour {annee} : les indemnités des trajets de {annee} vaudraient zéro.
            </p>
            {peutGerer && derniere > 0 && (
              <button onClick={preparerAnnee} className="btn btn--gold" style={{ marginTop: '.8rem' }}>
                Créer le barème {annee} à partir de {derniere}
              </button>
            )}
          </div>
        ) : (
          <div className="table-scroll" style={{ marginTop: '.8rem' }}>
            <table style={{ minWidth: 560, fontSize: 'var(--fs-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                  <th className={f.th}>Puissance</th>
                  <th className={f.th}>Tranche annuelle</th>
                  <th className={f.th} style={{ textAlign: 'right' }}>Coefficient (€/km)</th>
                  <th className={f.th} style={{ textAlign: 'right' }}>Forfait (€)</th>
                  {peutGerer && <th className={f.th}></th>}
                </tr>
              </thead>
              <tbody>
                {lignesAnnee.map((b) => (
                  <LigneBaremeEditable key={b.id} b={b} peutGerer={peutGerer}
                    onErreur={setErreur} onFait={() => router.refresh()} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.85rem', maxWidth: '64ch', lineHeight: 1.5 }}>
          Barème officiel à vérifier chaque année sur impots.gouv.fr. Il couvre
          carburant, entretien, assurance et usure d&apos;un véhicule personnel :
          ces frais ne se saisissent pas en plus. Péages et stationnement, oui.
        </p>
      </div>
    </>
  );
}

function LigneBaremeEditable({ b, peutGerer, onErreur, onFait }: {
  b: LigneBareme; peutGerer: boolean; onErreur: (m: string) => void; onFait: () => void;
}) {
  const [coef, setCoef] = useState(String(b.coefficient));
  const [forfait, setForfait] = useState(String(b.forfait));
  const modifie = coef !== String(b.coefficient) || forfait !== String(b.forfait);

  async function enregistrer() {
    const c = Number(coef.replace(',', '.'));
    const fo = Number(forfait.replace(',', '.'));
    if (Number.isNaN(c) || Number.isNaN(fo) || c <= 0 || fo < 0) { onErreur('Coefficient ou forfait invalide.'); return; }
    const supabase = createClient();
    const { error } = await supabase.from('bareme_km').update({ coefficient: c, forfait: fo }).eq('id', b.id);
    if (error) { onErreur(error.message); return; }
    await supabase.rpc('journaliser', {
      p_action: 'modification', p_table: 'bareme_km', p_id: b.id,
      p_details: { resume: `Barème ${b.annee}, ${b.cv_min}-${b.cv_max} CV : ${c} €/km + ${fo} €` },
    });
    onFait();
  }

  const puissance = b.cv_min === b.cv_max ? `${b.cv_min} CV` : b.cv_max >= 20 ? `${b.cv_min} CV et plus` : `${b.cv_min} à ${b.cv_max} CV`;
  const tranche = b.km_max ? `${b.km_min.toLocaleString('fr-FR')} à ${b.km_max.toLocaleString('fr-FR')} km`
    : `plus de ${(b.km_min - 1).toLocaleString('fr-FR')} km`;

  return (
    <tr className={f.ligne}>
      <td className={f.td}>{puissance}</td>
      <td className={f.td}>{tranche}</td>
      <td className={f.td} style={{ textAlign: 'right' }}>
        <input value={coef} onChange={(e) => setCoef(e.target.value)} disabled={!peutGerer}
          className={f.recherche} style={{ width: '6rem', minHeight: 32, flex: 'none', textAlign: 'right' }} />
      </td>
      <td className={f.td} style={{ textAlign: 'right' }}>
        <input value={forfait} onChange={(e) => setForfait(e.target.value)} disabled={!peutGerer}
          className={f.recherche} style={{ width: '6rem', minHeight: 32, flex: 'none', textAlign: 'right' }} />
      </td>
      {peutGerer && (
        <td className={f.td} style={{ textAlign: 'right' }}>
          {modifie && <button onClick={enregistrer} className="btn btn--gold btn--sm">Enregistrer</button>}
        </td>
      )}
    </tr>
  );
}
