'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money, date, montantSaisi } from '@/lib/format';
import Alerte from '@/components/Alerte';

export type ClientDevis = { id: string; nom: string };

export type LigneDevis = {
  id: string;
  numero_piece: string | null;
  date_piece: string;
  valable_jusquau: string | null;
  tiers_libelle: string;
  objet: string | null;
  montant_ht: number;
  montant_ttc: number;
  facture_issue_id: string | null;
  facture_numero: string | null;
  statut: string;
  jours_restants: number | null;
  nb_lignes: number;
};

const LIBELLE: Record<string, string> = {
  brouillon: 'Brouillon', envoye: 'Envoyé', accepte: 'Accepté',
  refuse: 'Refusé', expire: 'Expiré',
};

const CLASSE: Record<string, string> = {
  brouillon: 'badge--neutral', envoye: 'badge--info', accepte: 'badge--success',
  refuse: 'badge--neutral', expire: 'badge--warning',
};

export default function ListeDevis({
  devis, clients, peutGerer,
}: {
  devis: LigneDevis[];
  clients: ClientDevis[];
  peutGerer: boolean;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [clientId, setClientId] = useState('');
  const [objet, setObjet] = useState('');
  const [validite, setValidite] = useState('30');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const ouverts = devis.filter((d) => d.statut === 'brouillon' || d.statut === 'envoye');
  const clos = devis.filter((d) => d.statut !== 'brouillon' && d.statut !== 'envoye');

  // Ce qui est en jeu : le montant des devis encore vivants. Un devis
  // accepté n'y figure plus — il est devenu une facture, et serait
  // compté deux fois.
  const enJeu = ouverts.reduce((s, d) => s + Number(d.montant_ttc), 0);

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) { setErreur('Choisissez un client.'); return; }

    const jours = montantSaisi(validite);
    if (jours === null || jours < 1) { setErreur('Durée de validité invalide.'); return; }

    setEnCours(true);
    setErreur(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('creer_devis', {
      p_tiers: clientId,
      p_objet: objet.trim() || null,
      p_validite_jours: Math.round(jours),
    });

    if (error) { setErreur(`Création impossible — ${error.message}`); setEnCours(false); return; }
    const d = data as { id?: string } | null;
    setEnCours(false);
    if (d?.id) router.push(`/ventes/devis/${d.id}`);
  }

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}

      <div className="grid-cards" style={{ marginBottom: '1.25rem' }}>
        <div className="card">
          <p className="card__title">En cours</p>
          <p className="amount" style={chiffre}>{ouverts.length}</p>
          <p className="muted" style={petit}>Brouillons et devis envoyés</p>
        </div>
        <div className="card">
          <p className="card__title">Montant en jeu</p>
          <p className="amount" style={chiffre}>{money(enJeu)}</p>
          <p className="muted" style={petit}>TTC, devis non encore tranchés</p>
        </div>
        <div className="card">
          <p className="card__title">Acceptés</p>
          <p className="amount" style={chiffre}>
            {devis.filter((d) => d.statut === 'accepte').length}
          </p>
          <p className="muted" style={petit}>Devenus factures</p>
        </div>
      </div>

      {peutGerer && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', gap: '.8rem', flexWrap: 'wrap',
          }}>
            <p className="card__title" style={{ margin: 0 }}>Établir un devis</p>
            <button onClick={() => setOuvert(!ouvert)} className="btn btn--gold">
              {ouvert ? 'Annuler' : '+ Nouveau devis'}
            </button>
          </div>

          {clients.length === 0 ? (
            <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: '.7rem' }}>
              Aucun client enregistré.{' '}
              <Link href="/tiers" style={{ color: 'var(--gold-ink)' }}>
                Créez-en un d&apos;abord
              </Link>.
            </p>
          ) : ouvert && (
            <form onSubmit={creer} style={{ marginTop: '1rem' }}>
              <div style={{
                display: 'grid', gap: '.7rem',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))',
              }}>
                <label><span>Client *</span>
                  <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                    <option value="">Choisir…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.nom}</option>
                    ))}
                  </select></label>

                <label><span>Objet</span>
                  <input type="text" value={objet} onChange={(e) => setObjet(e.target.value)}
                    placeholder="Nettoyage fin de chantier — rue du Maconnais" /></label>

                <label><span>Validité (jours)</span>
                  <input type="text" inputMode="numeric" value={validite}
                    onChange={(e) => setValidite(e.target.value)} /></label>
              </div>

              <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.7rem', maxWidth: '68ch', lineHeight: 1.5 }}>
                Les lignes s&apos;ajoutent à l&apos;étape suivante. Au-delà de la
                validité, le devis est réputé expiré : le prix n&apos;engage plus,
                sans que vous ayez à le pointer.
              </p>

              <div style={{ marginTop: '.9rem' }}>
                <button type="submit" className="btn btn--gold" disabled={enCours || !clientId}>
                  {enCours ? 'Création…' : 'Créer et chiffrer'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <Tableau titre="En cours" lignes={ouverts} vide="Aucun devis en cours." />
      {clos.length > 0 && <Tableau titre="Tranchés" lignes={clos} vide="" />}
    </>
  );
}

function Tableau({ titre, lignes, vide }: {
  titre: string; lignes: LigneDevis[]; vide: string;
}) {
  return (
    <div className="card" style={{ marginBottom: '1.25rem' }}>
      <p className="card__title">{titre} — {lignes.length}</p>

      {lignes.length === 0 ? (
        <div className="etat-vide"><p>{vide}</p></div>
      ) : (
        <div className="table-scroll">
          <table style={{ minWidth: 720, fontSize: 'var(--fs-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                <th style={th}>Numéro</th>
                <th style={th}>Date</th>
                <th style={th}>Client</th>
                <th style={th} className="col-secondaire">Objet</th>
                <th style={{ ...th, textAlign: 'right' }}>Montant TTC</th>
                <th style={{ ...th, textAlign: 'right' }}>Validité</th>
                <th style={{ ...th, textAlign: 'right' }}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((d) => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--g-200)' }}>
                  <td style={td} className="mono">
                    <Link href={`/ventes/devis/${d.id}`}
                      style={{ color: 'var(--navy)', fontWeight: 600, fontSize: '.72rem' }}>
                      {d.numero_piece ?? 'Ouvrir'}
                    </Link>
                    {d.nb_lignes === 0 && (
                      <span className="muted" style={{ display: 'block', fontSize: '.66rem' }}>
                        sans ligne
                      </span>
                    )}
                  </td>
                  <td style={td}>{date(d.date_piece)}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{d.tiers_libelle}</td>
                  <td style={td} className="col-secondaire">{d.objet ?? '—'}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }} className="amount">
                    {money(Number(d.montant_ttc))}
                  </td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {d.valable_jusquau ? date(d.valable_jusquau) : '—'}
                    {d.statut === 'envoye' && d.jours_restants !== null
                      && d.jours_restants >= 0 && d.jours_restants <= 7 && (
                      <span className="muted" style={{ display: 'block', fontSize: '.66rem' }}>
                        J-{d.jours_restants}
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <span className={`badge ${CLASSE[d.statut] ?? 'badge--neutral'}`}>
                      {LIBELLE[d.statut] ?? d.statut}
                    </span>
                    {d.facture_numero && (
                      <span className="muted" style={{ display: 'block', fontSize: '.66rem' }}>
                        → {d.facture_numero}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)',
  fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.55rem .4rem', verticalAlign: 'top' };
const chiffre: React.CSSProperties = { fontSize: '1.5rem', fontWeight: 600, marginTop: '.2rem' };
const petit: React.CSSProperties = { fontSize: 'var(--fs-xs)', marginTop: '.15rem' };
