'use client';

/**
 * TIERS
 *
 * Deux champs pèsent plus que les autres :
 * · le type — un professionnel exige SIRET et numéro de TVA sur la
 *   facture, et l'indemnité forfaitaire de 40 € ;
 * · le code pays — c'est lui qui fait basculer une dépense en
 *   autoliquidation. Un fournisseur étranger enregistré « FR » voit sa
 *   TVA traitée comme exonérée, et elle manque à la déclaration.
 *
 * Supprimer n'est possible que pour une fiche sans aucune pièce ; les
 * autres s'archivent, pour que l'historique garde son tiers.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/format';
import Alerte from '@/components/Alerte';
import { LIBELLE_TYPE_CLIENT } from '@/lib/types';
import type { Tiers } from '@/lib/registre';
import f from '@/styles/formulaire.module.css';

export type Activite = { pieces: number; facture: number; du: number; achats: number };

type Filtre = 'tous' | 'clients' | 'fournisseurs' | 'archives';

type Saisie = {
  nom: string; type: string; est_client: boolean; est_fournisseur: boolean;
  contact: string; email: string; telephone: string;
  adresse: string; code_postal: string; ville: string; pays: string; pays_code: string;
  siret: string; tva_intracom: string; delai_paiement: string; notes: string;
};

const VIDE: Saisie = {
  nom: '', type: 'professionnel', est_client: false, est_fournisseur: true,
  contact: '', email: '', telephone: '', adresse: '', code_postal: '', ville: '',
  pays: 'France', pays_code: 'FR', siret: '', tva_intracom: '', delai_paiement: '15', notes: '',
};

const PAYS_COURANTS = ['FR', 'BE', 'DE', 'ES', 'IT', 'LU', 'NL', 'PT', 'IE', 'CH', 'GB', 'US'];

function depuisTiers(t: Tiers): Saisie {
  return {
    nom: t.nom, type: t.type, est_client: t.est_client, est_fournisseur: t.est_fournisseur,
    contact: t.contact ?? '', email: t.email ?? '', telephone: t.telephone ?? '',
    adresse: t.adresse ?? '', code_postal: t.code_postal ?? '', ville: t.ville ?? '',
    pays: t.pays ?? '', pays_code: t.pays_code ?? 'FR',
    siret: t.siret ?? '', tva_intracom: t.tva_intracom ?? t.numero_tva ?? '',
    delai_paiement: String(t.delai_paiement ?? 15), notes: t.notes ?? '',
  };
}

export default function ListeTiers({ tiers, activite, peutGerer }: {
  tiers: Tiers[]; activite: Record<string, Activite>; peutGerer: boolean;
}) {
  const router = useRouter();
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [recherche, setRecherche] = useState('');
  const [edite, setEdite] = useState<Tiers | 'nouveau' | null>(null);
  const [s, setS] = useState<Saisie>(VIDE);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  // Fusion : la fiche cliquée est absorbée par la fiche choisie.
  const [fusion, setFusion] = useState<Tiers | null>(null);
  const [cible, setCible] = useState('');
  const [nomRetenu, setNomRetenu] = useState('');

  const visibles = useMemo(() => {
    const r = recherche.trim().toLowerCase();
    return tiers.filter((t) => {
      if (filtre === 'archives' ? t.actif : !t.actif) return false;
      if (filtre === 'clients' && !t.est_client) return false;
      if (filtre === 'fournisseurs' && !t.est_fournisseur) return false;
      return !r || [t.nom, t.ville, t.siret, t.tva_intracom, t.reference]
        .some((v) => (v ?? '').toLowerCase().includes(r));
    });
  }, [tiers, filtre, recherche]);

  const champ = (k: keyof Saisie) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setS((v) => ({ ...v, [k]: e.target.value }));

  function ouvrir(t: Tiers | 'nouveau') {
    setFusion(null);
    setEdite(t);
    setS(t === 'nouveau' ? VIDE : depuisTiers(t));
    setErreur(null);
  }

  function fermer() { setEdite(null); setS(VIDE); }

  function ouvrirFusion(t: Tiers) {
    fermer();
    setFusion(t); setCible(''); setNomRetenu(''); setErreur(null);
  }

  async function fusionner(e: React.FormEvent) {
    e.preventDefault();
    const garde = tiers.find((t) => t.id === cible);
    if (!fusion || !garde) return;
    const nom = nomRetenu.trim() || garde.nom;
    if (!window.confirm(
      `Les pièces de « ${fusion.nom} » passent sur « ${nom} », puis la fiche « ${fusion.nom} » est supprimée. Continuer ?`,
    )) return;

    setEnCours(true); setErreur(null);
    const { data, error } = await createClient().rpc('fusionner_tiers', {
      p_garder: garde.id, p_absorber: fusion.id, p_nom: nom,
    });
    setEnCours(false);
    if (error) { setErreur(`Fusion impossible : ${error.message}`); return; }

    const n = Number((data as { pieces_reprises?: number } | null)?.pieces_reprises ?? 0);
    setSucces(`${fusion.nom} fusionné dans ${nom} — ${n} pièce${n > 1 ? 's' : ''} reprise${n > 1 ? 's' : ''}.`);
    setFusion(null);
    router.refresh();
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!s.nom.trim() || !edite) return;
    setEnCours(true); setErreur(null);

    const delai = parseInt(s.delai_paiement, 10);
    const tva = s.tva_intracom.trim().toUpperCase() || null;
    const donnees = {
      nom: s.nom.trim(), type: s.type,
      est_client: s.est_client, est_fournisseur: s.est_fournisseur,
      contact: s.contact.trim() || null, email: s.email.trim() || null,
      telephone: s.telephone.trim() || null, adresse: s.adresse.trim() || null,
      code_postal: s.code_postal.trim() || null, ville: s.ville.trim() || null,
      pays: s.pays.trim() || 'France',
      pays_code: s.pays_code.trim().toUpperCase().slice(0, 2) || 'FR',
      siret: s.siret.replace(/\s/g, '') || null,
      tva_intracom: tva, numero_tva: tva,
      delai_paiement: Number.isNaN(delai) ? 15 : Math.min(Math.max(delai, 0), 60),
      notes: s.notes.trim() || null,
      modifie_le: new Date().toISOString(),
    };

    const supabase = createClient();
    const res = edite === 'nouveau'
      ? await supabase.from('tiers').insert(donnees).select('id').single()
      : await supabase.from('tiers').update(donnees).eq('id', edite.id).select('id').single();

    if (res.error) {
      setErreur(`Enregistrement impossible : ${res.error.message}`);
      setEnCours(false);
      return;
    }

    await supabase.rpc('journaliser', {
      p_action: edite === 'nouveau' ? 'creation' : 'modification',
      p_table: 'tiers', p_id: res.data?.id ?? null,
      p_details: { resume: donnees.nom, pays: donnees.pays_code },
    });

    setSucces(edite === 'nouveau' ? `${donnees.nom} ajouté.` : `${donnees.nom} mis à jour.`);
    fermer();
    setEnCours(false);
    router.refresh();
  }

  async function basculerArchive(t: Tiers) {
    setErreur(null);
    const supabase = createClient();
    const { error } = await supabase.from('tiers')
      .update({ actif: !t.actif, modifie_le: new Date().toISOString() }).eq('id', t.id);
    if (error) { setErreur(error.message); return; }
    await supabase.rpc('journaliser', {
      p_action: 'modification', p_table: 'tiers', p_id: t.id,
      p_details: { resume: `${t.nom} ${t.actif ? 'archivé' : 'réactivé'}` },
    });
    router.refresh();
  }

  async function supprimer(t: Tiers) {
    if (!window.confirm(`Supprimer définitivement « ${t.nom} » ? Aucune pièce ne le référence.`)) return;
    setErreur(null);
    const supabase = createClient();
    const { error } = await supabase.from('tiers').delete().eq('id', t.id);
    if (error) {
      setErreur(`Suppression impossible — la fiche est encore référencée (${error.message}). Archivez-la plutôt.`);
      return;
    }
    await supabase.rpc('journaliser', {
      p_action: 'suppression', p_table: 'tiers', p_id: t.id, p_details: { resume: t.nom },
    });
    router.refresh();
  }

  const estPro = s.type !== 'particulier';
  const etranger = s.pays_code.trim().toUpperCase() !== 'FR';

  const bouton = (k: Filtre, libelle: string) => (
    <button type="button" onClick={() => setFiltre(k)}
      className={`btn btn--sm ${filtre === k ? 'btn--primary' : 'btn--ghost'}`}>
      {libelle}
    </button>
  );

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className={f.barre}>
          <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)}
            placeholder="Nom, ville, SIRET, n° de TVA…" className={f.recherche} />
          <div className={f.filtres}>
            {bouton('tous', 'Tous')}
            {bouton('clients', 'Clients')}
            {bouton('fournisseurs', 'Fournisseurs')}
            {bouton('archives', 'Archivés')}
          </div>
          {peutGerer && !edite && !fusion && (
            <button onClick={() => ouvrir('nouveau')} className="btn btn--gold">+ Nouveau tiers</button>
          )}
        </div>

        {fusion && (
          <form onSubmit={fusionner} className={f.formulaire}>
            <p className={`${f.note} ${f.pleine}`}>
              Fusionner <strong>{fusion.nom}</strong> dans une autre fiche : ses pièces,
              règles et alias bancaires y passent, les champs vides sont complétés,
              puis sa fiche est supprimée. Les pièces gardent leur numéro et leurs montants.
            </p>
            <label><span>Fiche conservée *</span>
              <select value={cible} required onChange={(e) => {
                setCible(e.target.value);
                setNomRetenu(tiers.find((t) => t.id === e.target.value)?.nom ?? '');
              }}>
                <option value="">Choisir…</option>
                {tiers.filter((t) => t.id !== fusion.id).map((t) => (
                  <option key={t.id} value={t.id}>{t.nom}{t.actif ? '' : ' (archivé)'}</option>
                ))}
              </select></label>
            <label><span>Nom retenu</span>
              <input value={nomRetenu} onChange={(e) => setNomRetenu(e.target.value)}
                placeholder="Nom de la fiche conservée" /></label>
            <div className={`${f.actions} ${f.pleine}`}>
              <button type="submit" className="btn btn--gold" disabled={enCours || !cible}>
                {enCours ? 'Fusion…' : 'Fusionner'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setFusion(null)}>Annuler</button>
            </div>
          </form>
        )}

        {edite && (
          <form onSubmit={enregistrer} className={f.formulaire}>
            <label className={f.pleine}><span>{estPro ? 'Raison sociale *' : 'Nom *'}</span>
              <input value={s.nom} onChange={champ('nom')} required autoFocus /></label>

            <label><span>Type</span>
              <select value={s.type} onChange={champ('type')}>
                {Object.entries(LIBELLE_TYPE_CLIENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            <label className={f.case}>
              <input type="checkbox" checked={s.est_client}
                onChange={(e) => setS((v) => ({ ...v, est_client: e.target.checked }))} /> Client
            </label>
            <label className={f.case}>
              <input type="checkbox" checked={s.est_fournisseur}
                onChange={(e) => setS((v) => ({ ...v, est_fournisseur: e.target.checked }))} /> Fournisseur
            </label>

            {estPro && (
              <label><span>Contact</span>
                <input value={s.contact} onChange={champ('contact')} placeholder="Nom de la personne" /></label>
            )}
            <label><span>Courriel</span>
              <input type="email" value={s.email} onChange={champ('email')} /></label>
            <label><span>Téléphone</span>
              <input type="tel" value={s.telephone} onChange={champ('telephone')} /></label>

            <label className={f.pleine}><span>Adresse</span>
              <input value={s.adresse} onChange={champ('adresse')} /></label>
            <label><span>Code postal</span>
              <input value={s.code_postal} onChange={champ('code_postal')} /></label>
            <label><span>Ville</span>
              <input value={s.ville} onChange={champ('ville')} /></label>
            <label><span>Pays</span>
              <input value={s.pays} onChange={champ('pays')} /></label>
            <label><span>Code pays *</span>
              <input value={s.pays_code} onChange={champ('pays_code')} maxLength={2}
                list="codes-pays" placeholder="FR" required /></label>
            <datalist id="codes-pays">
              {PAYS_COURANTS.map((c) => <option key={c} value={c} />)}
            </datalist>

            {estPro && (
              <>
                <label><span>SIRET</span>
                  <input value={s.siret} onChange={champ('siret')} placeholder="14 chiffres" /></label>
                <label><span>N° de TVA intracommunautaire</span>
                  <input value={s.tva_intracom} onChange={champ('tva_intracom')} placeholder="FR… / IE…" /></label>
              </>
            )}
            <label><span>Délai de paiement (jours)</span>
              <input type="number" value={s.delai_paiement} onChange={champ('delai_paiement')}
                min="0" max="60" /></label>

            <label className={f.pleine}><span>Notes</span>
              <textarea value={s.notes} onChange={champ('notes')} /></label>

            {etranger && s.est_fournisseur && (
              <p className={`${f.note} ${f.pleine}`}>
                Fournisseur hors de France : ses factures sans TVA française seront
                traitées en autoliquidation (TVA collectée et déduite sur la même
                déclaration). Les dépenses déjà saisies ne changent pas d&apos;elles-mêmes.
              </p>
            )}

            <div className={`${f.actions} ${f.pleine}`}>
              <button type="submit" className="btn btn--gold" disabled={enCours || !s.nom.trim()}>
                {enCours ? 'Enregistrement…' : edite === 'nouveau' ? 'Créer' : 'Enregistrer'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={fermer}>Annuler</button>
            </div>
          </form>
        )}
      </div>

      <div className="card">
        {visibles.length === 0 ? (
          <div className="etat-vide">
            <p>{recherche ? 'Aucun tiers ne correspond.' : 'Aucun tiers dans cette liste.'}</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table style={{ minWidth: 760, fontSize: 'var(--fs-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                  <th className={f.th}>Tiers</th>
                  <th className={`${f.th} col-secondaire`}>Rôle</th>
                  <th className={`${f.th} col-secondaire`}>Pays</th>
                  <th className={f.th} style={{ textAlign: 'right' }}>Facturé HT</th>
                  <th className={f.th} style={{ textAlign: 'right' }}>Dû</th>
                  <th className={f.th} style={{ textAlign: 'right' }}>Achats HT</th>
                  {peutGerer && <th className={f.th}></th>}
                </tr>
              </thead>
              <tbody>
                {visibles.map((t) => {
                  const a = activite[t.id] ?? { pieces: 0, facture: 0, du: 0, achats: 0 };
                  return (
                    <tr key={t.id} className={`${f.ligne} ${t.actif ? '' : f.archive}`}>
                      <td className={f.td} style={{ fontWeight: 500 }}>
                        {t.nom}
                        <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)', fontWeight: 400 }}>
                          {[LIBELLE_TYPE_CLIENT[t.type] ?? t.type, t.ville, t.siret ? 'SIRET' : null,
                            t.tva_intracom ? `TVA ${t.tva_intracom}` : null].filter(Boolean).join(' · ')}
                        </span>
                      </td>
                      <td className={`${f.td} col-secondaire`}>
                        {t.est_client && <span className="badge badge--info" style={{ marginRight: '.3rem' }}>Client</span>}
                        {t.est_fournisseur && <span className="badge badge--neutral">Fournisseur</span>}
                      </td>
                      <td className={`${f.td} col-secondaire mono`}>{t.pays_code ?? '—'}</td>
                      <td className={`${f.td} amount`} style={{ textAlign: 'right' }}>
                        {a.facture ? money(a.facture) : '—'}
                      </td>
                      <td className={`${f.td} amount`} style={{ textAlign: 'right' }}>
                        {a.du > 0.005
                          ? <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{money(a.du)}</span>
                          : '—'}
                      </td>
                      <td className={`${f.td} amount`} style={{ textAlign: 'right' }}>
                        {a.achats ? money(a.achats) : '—'}
                      </td>
                      {peutGerer && (
                        <td className={f.td} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button onClick={() => ouvrir(t)} className="btn btn--ghost btn--sm">Modifier</button>{' '}
                          <button onClick={() => basculerArchive(t)} className="btn btn--ghost btn--sm">
                            {t.actif ? 'Archiver' : 'Réactiver'}
                          </button>{' '}
                          <button onClick={() => ouvrirFusion(t)} className="btn btn--ghost btn--sm">
                            Fusionner
                          </button>{' '}
                          {a.pieces === 0 && (
                            <button onClick={() => supprimer(t)} className="btn btn--danger btn--sm">Supprimer</button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
