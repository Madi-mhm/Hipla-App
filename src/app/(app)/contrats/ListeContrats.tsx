'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money, date, montantSaisi } from '@/lib/format';
import Alerte from '@/components/Alerte';

export type ClientContrat = { id: string; nom: string };
export type PrestationContrat = {
  id: string; libelle: string; prix_ht: number; unite: string | null; taux_tva: number;
};

export type Contrat = {
  id: string; reference: string | null; libelle: string; objet: string | null;
  tiers_id: string; tiers: { nom: string } | null;
  designation: string; quantite: number; prix_unitaire_ht: number;
  unite: string | null; taux_tva: number;
  periodicite: string; jour_facturation: number;
  date_debut: string; date_fin: string | null;
  engagement_jusquau: string | null; preavis_jours: number | null;
  adresse_site: string | null; agents_repris: number | null;
  actif: boolean;
};

export type EtatContrats = {
  actifs?: number; a_facturer?: number;
  recurrent_mensuel?: number; engagements_proches?: number;
};

type AFacturer = {
  echeance_id: string; periode: string; date_prevue: string;
  montant_prevu: number; libelle: string; client: string; echue: boolean;
};

const PERIODICITE: Record<string, string> = {
  hebdomadaire: 'Chaque semaine', mensuel: 'Chaque mois',
  trimestriel: 'Chaque trimestre', annuel: 'Chaque année',
};

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

export default function ListeContrats({
  contrats, clients, prestations, aFacturer, etat, peutGerer,
}: {
  contrats: Contrat[];
  clients: ClientContrat[];
  prestations: PrestationContrat[];
  aFacturer: AFacturer[];
  etat: EtatContrats;
  peutGerer: boolean;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const [clientId, setClientId] = useState('');
  const [libelle, setLibelle] = useState('');
  const [prestationId, setPrestationId] = useState('');
  const [designation, setDesignation] = useState('');
  const [quantite, setQuantite] = useState('1');
  const [prix, setPrix] = useState('');
  const [taux, setTaux] = useState('20');
  const [periodicite, setPeriodicite] = useState('hebdomadaire');
  const [jour, setJour] = useState('6');
  const [debut, setDebut] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [site, setSite] = useState('');

  const actifs = contrats.filter((c) => c.actif);

  function choisirPrestation(id: string) {
    setPrestationId(id);
    const p = prestations.find((x) => x.id === id);
    if (!p) return;
    setDesignation(p.libelle);
    if (Number(p.prix_ht) > 0) setPrix(String(p.prix_ht).replace('.', ','));
    setTaux(String(p.taux_tva));
  }

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    const q = montantSaisi(quantite);
    const pu = montantSaisi(prix);
    const tx = montantSaisi(taux);
    if (!clientId || !libelle.trim() || !designation.trim()
        || q === null || pu === null || tx === null) {
      setErreur('Client, libellé, désignation, quantité et prix sont requis.');
      return;
    }

    setEnCours('creation'); setErreur(null);
    const supabase = createClient();
    const { error } = await supabase.from('contrats').insert({
      tiers_id: clientId,
      libelle: libelle.trim(),
      prestation_id: prestationId || null,
      designation: designation.trim(),
      quantite: q, prix_unitaire_ht: pu, taux_tva: tx,
      unite: prestations.find((p) => p.id === prestationId)?.unite ?? null,
      periodicite,
      jour_facturation: Number(jour),
      date_debut: debut,
      adresse_site: site.trim() || null,
    });
    if (error) { setErreur(`Création impossible — ${error.message}`); setEnCours(null); return; }

    setOuvert(false); setLibelle(''); setDesignation(''); setPrix(''); setSite('');
    setEnCours(null);
    router.refresh();
  }

  async function facturer(echeanceId: string) {
    setEnCours(echeanceId); setErreur(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('facturer_echeance', { p_echeance: echeanceId });
    if (error) { setErreur(`Facturation impossible — ${error.message}`); setEnCours(null); return; }
    const r = data as { piece_id?: string } | null;
    setEnCours(null);
    if (r?.piece_id) router.push(`/ventes/${r.piece_id}`);
  }

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}

      <div className="grid-cards" style={{ marginBottom: '1.25rem' }}>
        <div className="card">
          <p className="card__title">Contrats actifs</p>
          <p className="amount" style={chiffre}>{etat.actifs ?? 0}</p>
          <p className="muted" style={petit}>En cours à ce jour</p>
        </div>
        <div className="card">
          <p className="card__title">Récurrent mensuel</p>
          <p className="amount" style={chiffre}>{money(Number(etat.recurrent_mensuel ?? 0))}</p>
          {/* Ramener au mois est la seule façon de comparer un contrat
              hebdomadaire et un contrat trimestriel. */}
          <p className="muted" style={petit}>TTC, toutes périodicités ramenées au mois</p>
        </div>
        <div className="card">
          <p className="card__title">À facturer</p>
          <p className="amount" style={{
            ...chiffre, color: etat.a_facturer ? 'var(--warning)' : undefined,
          }}>{etat.a_facturer ?? 0}</p>
          <p className="muted" style={petit}>Échéances dues</p>
        </div>
      </div>

      {/* ---------- À facturer ---------- */}
      {aFacturer.length > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--gold)' }}>
          <p className="card__title">Échéances à facturer — {aFacturer.length}</p>
          <p className="muted" style={{
            fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '68ch', marginBottom: '.9rem',
          }}>
            La facture est créée <strong>en brouillon</strong> : vous la relisez et
            vous l&apos;émettez. Émettre seul daterait la facture d&apos;un jour
            choisi par une machine et rendrait la TVA exigible sur une prestation
            peut-être pas faite.
          </p>

          {aFacturer.map((e) => (
            <div key={e.echeance_id} style={ligne}>
              <div style={{ flex: 1, minWidth: '17rem' }}>
                <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 500 }}>
                  {e.client}
                  <span className="muted" style={{ marginLeft: '.5rem', fontWeight: 400 }}>
                    {e.libelle}
                  </span>
                </p>
                <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.15rem' }}>
                  Période {e.periode} · prévue le {date(e.date_prevue)} ·{' '}
                  {money(Number(e.montant_prevu))}
                  {!e.echue && ' · à venir'}
                </p>
              </div>
              <button onClick={() => facturer(e.echeance_id)}
                disabled={enCours === e.echeance_id}
                className="btn btn--gold btn--sm" style={{ whiteSpace: 'nowrap' }}>
                {enCours === e.echeance_id ? 'Création…' : 'Établir la facture'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Création ---------- */}
      {peutGerer && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', gap: '.8rem', flexWrap: 'wrap',
          }}>
            <p className="card__title" style={{ margin: 0 }}>Nouveau contrat</p>
            <button onClick={() => setOuvert(!ouvert)} className="btn btn--gold">
              {ouvert ? 'Annuler' : '+ Déclarer un contrat'}
            </button>
          </div>

          {ouvert && (
            <form onSubmit={creer} style={{ marginTop: '1rem' }}>
              <div style={grille}>
                <label><span>Client *</span>
                  <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                    <option value="">Choisir…</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select></label>

                <label style={{ gridColumn: 'span 2' }}><span>Libellé du contrat *</span>
                  <input type="text" value={libelle} onChange={(e) => setLibelle(e.target.value)}
                    placeholder="Nettoyage hebdomadaire — Hôtel des Alpes" /></label>

                <label style={{ gridColumn: '1 / -1' }}><span>Prestation du catalogue</span>
                  <select value={prestationId} onChange={(e) => choisirPrestation(e.target.value)}>
                    <option value="">Ligne libre…</option>
                    {prestations.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.libelle}{Number(p.prix_ht) > 0 ? ` — ${p.prix_ht} €` : ' — au forfait'}
                      </option>
                    ))}
                  </select></label>

                <label style={{ gridColumn: 'span 2' }}><span>Désignation facturée *</span>
                  <input type="text" value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="Nettoyage des parties communes" /></label>

                <label><span>Quantité *</span>
                  <input type="text" inputMode="decimal" value={quantite}
                    onChange={(e) => setQuantite(e.target.value)} /></label>

                <label><span>Prix unitaire HT *</span>
                  <input type="text" inputMode="decimal" value={prix} placeholder="0,00"
                    onChange={(e) => setPrix(e.target.value)} /></label>

                <label><span>TVA (%)</span>
                  <input type="text" inputMode="decimal" value={taux}
                    onChange={(e) => setTaux(e.target.value)} /></label>

                <label><span>Périodicité *</span>
                  <select value={periodicite} onChange={(e) => setPeriodicite(e.target.value)}>
                    <option value="hebdomadaire">Chaque semaine</option>
                    <option value="mensuel">Chaque mois</option>
                    <option value="trimestriel">Chaque trimestre</option>
                    <option value="annuel">Chaque année</option>
                  </select></label>

                <label><span>
                  {periodicite === 'hebdomadaire' ? 'Jour de la semaine' : 'Jour du mois'}
                </span>
                  {periodicite === 'hebdomadaire' ? (
                    <select value={jour} onChange={(e) => setJour(e.target.value)}>
                      {JOURS.map((j, i) => (
                        <option key={j} value={String(i + 1)}>{j}</option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" inputMode="numeric" value={jour}
                      onChange={(e) => setJour(e.target.value)} />
                  )}</label>

                <label><span>Début *</span>
                  <input type="date" value={debut}
                    onChange={(e) => setDebut(e.target.value)} /></label>

                <label style={{ gridColumn: 'span 2' }}><span>Adresse du site</span>
                  <input type="text" value={site} onChange={(e) => setSite(e.target.value)}
                    placeholder="12 avenue de Lyon, Chambéry" /></label>
              </div>

              <p className="muted" style={{
                fontSize: 'var(--fs-xs)', marginTop: '.8rem', maxWidth: '68ch', lineHeight: 1.5,
              }}>
                Les échéances sont engendrées à l&apos;avance sur soixante jours.
                Chacune vous proposera une facture en brouillon le moment venu —
                rien n&apos;est émis sans vous.
              </p>

              <div style={{ marginTop: '.9rem' }}>
                <button type="submit" className="btn btn--gold"
                  disabled={enCours === 'creation' || !clientId}>
                  {enCours === 'creation' ? 'Création…' : 'Déclarer le contrat'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ---------- Les contrats ---------- */}
      <div className="card">
        <p className="card__title">Contrats — {actifs.length}</p>

        {contrats.length === 0 ? (
          <div className="etat-vide">
            <p>Aucun contrat déclaré.</p>
            <p className="muted">
              Un contrat déclaré une fois engendre ses factures tout seul. Pour un
              client hebdomadaire, c&apos;est cinquante-deux saisies évitées par an.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table style={{ minWidth: 760, fontSize: 'var(--fs-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                  <th style={th}>Client</th>
                  <th style={th}>Contrat</th>
                  <th style={th}>Rythme</th>
                  <th style={{ ...th, textAlign: 'right' }}>Montant TTC</th>
                  <th style={th} className="col-secondaire">Depuis</th>
                  <th style={{ ...th, textAlign: 'right' }}>État</th>
                </tr>
              </thead>
              <tbody>
                {contrats.map((c) => {
                  const ttc = Number(c.quantite) * Number(c.prix_unitaire_ht)
                    * (1 + Number(c.taux_tva) / 100);
                  return (
                    <tr key={c.id} style={{
                      borderBottom: '1px solid var(--g-200)',
                      opacity: c.actif ? 1 : 0.5,
                    }}>
                      <td style={{ ...td, fontWeight: 500 }}>{c.tiers?.nom ?? '—'}</td>
                      <td style={td}>
                        {c.libelle}
                        <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                          {c.designation}
                          {c.adresse_site && ` · ${c.adresse_site}`}
                        </span>
                        {(c.agents_repris ?? 0) > 0 && (
                          <span className="muted" style={{ display: 'block', fontSize: '.66rem' }}>
                            {c.agents_repris} agent{(c.agents_repris ?? 0) > 1 ? 's' : ''} repris
                          </span>
                        )}
                      </td>
                      <td style={td}>
                        {PERIODICITE[c.periodicite] ?? c.periodicite}
                        <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                          {c.periodicite === 'hebdomadaire'
                            ? `le ${JOURS[c.jour_facturation - 1] ?? ''}`
                            : `le ${c.jour_facturation}`}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600 }} className="amount">
                        {money(ttc)}
                      </td>
                      <td style={td} className="col-secondaire">{date(c.date_debut)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <span className={`badge ${c.actif ? 'badge--success' : 'badge--neutral'}`}>
                          {c.actif ? 'Actif' : 'Clos'}
                        </span>
                        {c.engagement_jusquau && (
                          <span className="muted" style={{ display: 'block', fontSize: '.66rem' }}>
                            engagé jusqu&apos;au {date(c.engagement_jusquau)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.9rem' }}>
          Les clients se gèrent depuis <Link href="/clients" style={{ color: 'var(--gold-ink)' }}>
            la fiche client</Link>, les tarifs depuis{' '}
          <Link href="/reglages/prestations" style={{ color: 'var(--gold-ink)' }}>
            le catalogue</Link>.
        </p>
      </div>
    </>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)',
  fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.55rem .4rem', verticalAlign: 'top' };
const chiffre: React.CSSProperties = { fontSize: '1.5rem', fontWeight: 600, marginTop: '.2rem' };
const petit: React.CSSProperties = { fontSize: 'var(--fs-xs)', marginTop: '.15rem' };
const ligne: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  gap: '1rem', flexWrap: 'wrap',
  padding: '.75rem 0', borderBottom: '1px solid var(--g-200)',
};
const grille: React.CSSProperties = {
  display: 'grid', gap: '.7rem',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))',
};
