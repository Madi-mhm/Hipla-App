'use client';

/**
 * CATALOGUE DES PRESTATIONS
 *
 * Entièrement modifiable. Une prestation déjà facturée s'archive mais ne
 * se supprime pas : les factures passées y font référence, et les effacer
 * rendrait l'export FEC incohérent. L'archivage la retire des listes de
 * saisie sans toucher à l'historique.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/format';
import { TAUX_TVA } from '@/lib/comptabilite';
import Dialogue from '@/components/Dialogue';
import Alerte from '@/components/Alerte';
import { LIBELLE_UNITE, type Prestation } from '@/lib/types';
import styles from './prestations.module.css';

type Props = {
  prestations: Prestation[];
  idsUtilises: string[];
  peutGerer: boolean;
};

export default function Catalogue({ prestations, idsUtilises, peutGerer }: Props) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [edite, setEdite] = useState<Prestation | null>(null);
  const [aSupprimer, setASupprimer] = useState<Prestation | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [montrerArchivees, setMontrerArchivees] = useState(false);

  const [libelle, setLibelle] = useState('');
  const [description, setDescription] = useState('');
  const [groupe, setGroupe] = useState('Nettoyage');
  const [prix, setPrix] = useState('');
  const [unite, setUnite] = useState('forfait');
  const [taux, setTaux] = useState(20);

  const utilises = new Set(idsUtilises);
  const visibles = prestations.filter((p) => montrerArchivees || p.actif);
  const groupes = Array.from(new Set(prestations.map((p) => p.groupe)));

  function reinitialiser() {
    setLibelle(''); setDescription(''); setGroupe('Nettoyage');
    setPrix(''); setUnite('forfait'); setTaux(20); setEdite(null);
  }

  function ouvrirEdition(p: Prestation) {
    setLibelle(p.libelle); setDescription(p.description ?? '');
    setGroupe(p.groupe); setPrix(String(p.prix_ht).replace('.', ','));
    setUnite(p.unite); setTaux(Number(p.taux_tva));
    setEdite(p); setOuvert(true);
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!libelle.trim()) return;
    setErreur(null);
    setEnCours(true);

    const v = parseFloat(prix.replace(',', '.'));
    const supabase = createClient();
    const donnees = {
      libelle: libelle.trim(),
      description: description.trim() || null,
      groupe: groupe.trim() || 'Divers',
      prix_ht: Number.isFinite(v) ? v : 0,
      unite, taux_tva: taux,
    };

    const { error } = edite
      ? await supabase.from('prestations').update(donnees).eq('id', edite.id)
      : await supabase.from('prestations').insert(donnees);

    if (error) { setErreur(`Enregistrement impossible : ${error.message}`); setEnCours(false); return; }

    await supabase.rpc('journaliser', {
      p_action: edite ? 'modification' : 'creation',
      p_table: 'prestations', p_id: edite?.id ?? null,
      p_details: { resume: libelle.trim(), prix_ht: donnees.prix_ht, unite },
    });

    reinitialiser();
    setOuvert(false);
    setEnCours(false);
    router.refresh();
  }

  async function basculerActif(p: Prestation) {
    setEnCours(true);
    const supabase = createClient();
    const { error } = await supabase.from('prestations')
      .update({ actif: !p.actif }).eq('id', p.id);
    if (error) { setErreur(error.message); setEnCours(false); return; }

    await supabase.rpc('journaliser', {
      p_action: 'modification', p_table: 'prestations', p_id: p.id,
      p_details: { resume: `${p.libelle} ${p.actif ? 'archivée' : 'réactivée'}` },
    });
    setEnCours(false);
    router.refresh();
  }

  async function supprimer(p: Prestation) {
    setEnCours(true);
    const supabase = createClient();
    const { error } = await supabase.from('prestations').delete().eq('id', p.id);
    if (error) { setErreur(`Suppression impossible : ${error.message}`); setEnCours(false); return; }

    await supabase.rpc('journaliser', {
      p_action: 'suppression', p_table: 'prestations', p_id: p.id,
      p_details: { resume: p.libelle, prix_ht: p.prix_ht },
    });
    setEnCours(false);
    router.refresh();
  }

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className={styles.barre}>
          <p className="card__title">
            {visibles.length} prestation{visibles.length > 1 ? 's' : ''}
          </p>
          <div className={styles.actionsBarre}>
            <label className={styles.bascule}>
              <input type="checkbox" checked={montrerArchivees}
                onChange={(e) => setMontrerArchivees(e.target.checked)} />
              Voir les archivées
            </label>
            {peutGerer && (
              <button onClick={() => { if (ouvert) reinitialiser(); setOuvert(!ouvert); }}
                className="btn btn--gold">
                {ouvert ? 'Annuler' : '+ Nouvelle prestation'}
              </button>
            )}
          </div>
        </div>

        {ouvert && (
          <form onSubmit={enregistrer} className={styles.formulaire}>
            <label className={styles.pleine}><span>Libellé *</span>
              <input type="text" value={libelle} onChange={(e) => setLibelle(e.target.value)}
                required autoFocus placeholder="Nettoyage de canapé — 3 places" /></label>
            <label className={styles.pleine}><span>Description</span>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Injection-extraction" /></label>

            <label><span>Groupe</span>
              <input type="text" value={groupe} onChange={(e) => setGroupe(e.target.value)}
                list="groupes" /></label>
            <datalist id="groupes">
              {groupes.map((g) => <option key={g} value={g} />)}
            </datalist>

            <label><span>Prix HT</span>
              <input type="text" inputMode="decimal" value={prix}
                onChange={(e) => setPrix(e.target.value)} placeholder="120,00" /></label>
            <label><span>Unité</span>
              <select value={unite} onChange={(e) => setUnite(e.target.value)}>
                {Object.entries(LIBELLE_UNITE).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select></label>
            <label><span>Taux de TVA</span>
              <select value={taux} onChange={(e) => setTaux(Number(e.target.value))}>
                {TAUX_TVA.map((t) => (
                  <option key={t.valeur} value={t.valeur}>{t.libelle}</option>
                ))}
              </select></label>

            <p className={`${styles.note} ${styles.pleine}`}>
              Un prix à zéro signifie « sur devis » : le montant sera saisi
              ligne par ligne au moment de facturer.
            </p>

            <div className={styles.pleine}>
              <button type="submit" className="btn btn--gold" disabled={enCours || !libelle.trim()}>
                {enCours ? 'Enregistrement…' : edite ? 'Modifier' : 'Créer'}
              </button>
            </div>
          </form>
        )}
      </div>

      {groupes.map((g) => {
        const lignes = visibles.filter((p) => p.groupe === g);
        if (lignes.length === 0) return null;

        return (
          <div className="card" key={g} style={{ marginBottom: '1rem' }}>
            <p className="card__title">{g}</p>
            <div className="table-scroll">
              <table style={{ minWidth: 600, fontSize: 'var(--fs-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                    <th style={th}>Prestation</th>
                    <th style={{ ...th, textAlign: 'right' }}>Prix HT</th>
                    <th style={{ ...th, textAlign: 'right' }}>Unité</th>
                    <th style={{ ...th, textAlign: 'right' }} className="col-secondaire">TVA</th>
                    <th style={{ ...th, textAlign: 'right' }} className="col-secondaire">TTC</th>
                    {peutGerer && <th style={{ ...th, textAlign: 'right' }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((p) => {
                    const ttc = Number(p.prix_ht) * (1 + Number(p.taux_tva) / 100);
                    const estUtilisee = utilises.has(p.id);
                    return (
                      <tr key={p.id} style={{
                        borderBottom: '1px solid var(--g-200)',
                        opacity: p.actif ? 1 : 0.45,
                      }}>
                        <td style={{ ...td, fontWeight: 500 }}>
                          {p.libelle}
                          {!p.actif && (
                            <span className="badge badge--neutral" style={{ marginLeft: '.4rem' }}>
                              archivée
                            </span>
                          )}
                          {p.description && (
                            <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                              {p.description}
                            </span>
                          )}
                        </td>
                        <td style={{ ...td, textAlign: 'right' }} className="amount">
                          {Number(p.prix_ht) > 0 ? money(Number(p.prix_ht)) : 'sur devis'}
                        </td>
                        <td style={{ ...td, textAlign: 'right' }} className="muted">
                          {LIBELLE_UNITE[p.unite] ?? p.unite}
                        </td>
                        <td style={{ ...td, textAlign: 'right' }} className="col-secondaire muted">
                          {p.taux_tva} %
                        </td>
                        <td style={{ ...td, textAlign: 'right' }} className="amount col-secondaire">
                          {Number(p.prix_ht) > 0 ? money(ttc) : '—'}
                        </td>
                        {peutGerer && (
                          <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-flex', gap: '.3rem' }}>
                              <button onClick={() => ouvrirEdition(p)} className="btn btn--ghost"
                                style={{ minHeight: 26, padding: '.1rem .55rem', fontSize: '.7rem' }}>
                                Modifier
                              </button>
                              <button onClick={() => basculerActif(p)} disabled={enCours}
                                className="btn btn--ghost"
                                style={{ minHeight: 26, padding: '.1rem .55rem', fontSize: '.7rem' }}>
                                {p.actif ? 'Archiver' : 'Réactiver'}
                              </button>
                              {!estUtilisee && (
                                <button onClick={() => setASupprimer(p)} disabled={enCours}
                                  className="btn btn--ghost"
                                  style={{ minHeight: 26, padding: '.1rem .55rem', fontSize: '.7rem', color: 'var(--danger)' }}>
                                  Supprimer
                                </button>
                              )}
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <p className="muted" style={{ fontSize: 'var(--fs-xs)', maxWidth: '64ch' }}>
        Une prestation déjà utilisée sur une facture ne peut pas être
        supprimée : les documents passés y font référence. L'archiver la
        retire des listes de saisie sans toucher à l'historique.
      </p>

      <Dialogue
        ouvert={aSupprimer !== null}
        titre={`Supprimer ${aSupprimer?.libelle ?? ''}`}
        description="Cette prestation n'a jamais été facturée : sa suppression est sans conséquence sur l'historique."
        libelleValider="Supprimer"
        danger
        onValider={() => {
          const p = aSupprimer;
          setASupprimer(null);
          if (p) supprimer(p);
        }}
        onAnnuler={() => setASupprimer(null)}
      />
    </>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)',
  fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.6rem .4rem', verticalAlign: 'top' };
