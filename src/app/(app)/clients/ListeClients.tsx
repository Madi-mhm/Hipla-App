'use client';

/**
 * CLIENTS
 *
 * Le champ décisif est le type : un professionnel exige le SIRET et le
 * numéro de TVA sur la facture, ainsi que l'indemnité forfaitaire de
 * recouvrement de 40 €. Un particulier non.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/format';
import Alerte from '@/components/Alerte';
import { LIBELLE_TYPE_CLIENT, type Client } from '@/lib/types';
import styles from './clients.module.css';

type LigneFacture = {
  client_id: string; montant_ht: number; statut: string;
  net_a_payer: number; montant_encaisse: number;
};

type Props = {
  clients: Client[];
  factures: LigneFacture[];
  peutGerer: boolean;
};

export default function ListeClients({ clients, factures, peutGerer }: Props) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [edite, setEdite] = useState<Client | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');

  const [type, setType] = useState('particulier');
  const [nom, setNom] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [adresse, setAdresse] = useState('');
  const [codePostal, setCodePostal] = useState('');
  const [ville, setVille] = useState('');
  const [siret, setSiret] = useState('');
  const [tvaIntra, setTvaIntra] = useState('');
  const [delai, setDelai] = useState('15');

  const estPro = type !== 'particulier';

  const encours = useMemo(() => {
    const m: Record<string, { ca: number; du: number }> = {};
    for (const f of factures) {
      m[f.client_id] ??= { ca: 0, du: 0 };
      if (f.statut === 'encaissee') m[f.client_id].ca += Number(f.montant_ht);
      if (['emise', 'partielle', 'impayee'].includes(f.statut)) {
        m[f.client_id].du += Number(f.net_a_payer) - Number(f.montant_encaisse);
      }
    }
    return m;
  }, [factures]);

  const visibles = clients.filter((c) =>
    !recherche || c.nom.toLowerCase().includes(recherche.toLowerCase())
    || (c.ville ?? '').toLowerCase().includes(recherche.toLowerCase())
  );

  function reinitialiser() {
    setType('particulier'); setNom(''); setContact(''); setEmail('');
    setTelephone(''); setAdresse(''); setCodePostal(''); setVille('');
    setSiret(''); setTvaIntra(''); setDelai('15'); setEdite(null);
  }

  function ouvrirEdition(c: Client) {
    setType(c.type); setNom(c.nom); setContact(c.contact ?? '');
    setEmail(c.email ?? ''); setTelephone(c.telephone ?? '');
    setAdresse(c.adresse ?? ''); setCodePostal(c.code_postal ?? '');
    setVille(c.ville ?? ''); setSiret(c.siret ?? '');
    setTvaIntra(c.tva_intracom ?? ''); setDelai(String(c.delai_paiement));
    setEdite(c); setOuvert(true);
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim()) return;
    setErreur(null);
    setEnCours(true);

    const supabase = createClient();
    const donnees = {
      type, nom: nom.trim(),
      contact: contact.trim() || null,
      email: email.trim() || null,
      telephone: telephone.trim() || null,
      adresse: adresse.trim() || null,
      code_postal: codePostal.trim() || null,
      ville: ville.trim() || null,
      siret: siret.trim() || null,
      tva_intracom: tvaIntra.trim() || null,
      delai_paiement: parseInt(delai, 10) || 15,
      modifie_le: new Date().toISOString(),
    };

    const { error } = edite
      ? await supabase.from('clients').update(donnees).eq('id', edite.id)
      : await supabase.from('clients').insert(donnees);

    if (error) { setErreur(`Enregistrement impossible : ${error.message}`); setEnCours(false); return; }

    await supabase.rpc('journaliser', {
      p_action: edite ? 'modification' : 'creation',
      p_table: 'clients', p_id: edite?.id ?? null,
      p_details: { resume: nom.trim(), type },
    });

    reinitialiser();
    setOuvert(false);
    setEnCours(false);
    router.refresh();
  }

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className={styles.barre}>
          <input
            type="search" value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un client…"
            className={styles.recherche}
          />
          {peutGerer && (
            <button onClick={() => { if (ouvert) reinitialiser(); setOuvert(!ouvert); }}
              className="btn btn--gold">
              {ouvert ? 'Annuler' : '+ Nouveau client'}
            </button>
          )}
        </div>

        {ouvert && (
          <form onSubmit={enregistrer} className={styles.formulaire}>
            <label><span>Type *</span>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {Object.entries(LIBELLE_TYPE_CLIENT).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select></label>

            <label><span>{estPro ? 'Raison sociale *' : 'Nom *'}</span>
              <input type="text" value={nom} onChange={(e) => setNom(e.target.value)}
                required autoFocus /></label>

            {estPro && (
              <label><span>Contact</span>
                <input type="text" value={contact} onChange={(e) => setContact(e.target.value)}
                  placeholder="Nom de la personne" /></label>
            )}

            <label><span>Courriel</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label><span>Téléphone</span>
              <input type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} /></label>

            <label className={styles.pleine}><span>Adresse</span>
              <input type="text" value={adresse} onChange={(e) => setAdresse(e.target.value)} /></label>
            <label><span>Code postal</span>
              <input type="text" value={codePostal} onChange={(e) => setCodePostal(e.target.value)} /></label>
            <label><span>Ville</span>
              <input type="text" value={ville} onChange={(e) => setVille(e.target.value)} /></label>

            {estPro && (
              <>
                <label><span>SIRET</span>
                  <input type="text" value={siret} onChange={(e) => setSiret(e.target.value)}
                    placeholder="14 chiffres" /></label>
                <label><span>TVA intracommunautaire</span>
                  <input type="text" value={tvaIntra} onChange={(e) => setTvaIntra(e.target.value)}
                    placeholder="FR…" /></label>
              </>
            )}

            <label><span>Délai de paiement (jours)</span>
              <input type="number" value={delai} onChange={(e) => setDelai(e.target.value)}
                min="0" max="60" /></label>

            {estPro && (
              <p className={`${styles.note} ${styles.pleine}`}>
                Le SIRET figure sur la facture entre professionnels. Le délai
                de règlement ne peut pas dépasser soixante jours, et
                l'indemnité forfaitaire de recouvrement de 40 € est ajoutée
                automatiquement aux mentions.
              </p>
            )}

            <div className={styles.pleine}>
              <button type="submit" className="btn btn--gold" disabled={enCours || !nom.trim()}>
                {enCours ? 'Enregistrement…' : edite ? 'Modifier' : 'Créer le client'}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card">
        {visibles.length === 0 ? (
          <div className="etat-vide">
            <p>{recherche ? 'Aucun client ne correspond.' : 'Aucun client enregistré.'}</p>
            <p className="muted">
              Un client peut être créé au moment d'établir sa première facture,
              ou à l'avance.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table style={{ minWidth: 680, fontSize: 'var(--fs-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                  <th style={th}>Réf.</th>
                  <th style={th}>Client</th>
                  <th style={th} className="col-secondaire">Type</th>
                  <th style={th} className="col-secondaire">Ville</th>
                  <th style={{ ...th, textAlign: 'right' }}>CA encaissé</th>
                  <th style={{ ...th, textAlign: 'right' }}>En attente</th>
                  {peutGerer && <th style={{ ...th, textAlign: 'right' }}></th>}
                </tr>
              </thead>
              <tbody>
                {visibles.map((c) => {
                  const e = encours[c.id] ?? { ca: 0, du: 0 };
                  return (
                    <tr key={c.id} style={{
                      borderBottom: '1px solid var(--g-200)',
                      opacity: c.actif ? 1 : 0.5,
                    }}>
                      <td style={td} className="mono">
                        <span style={{ fontSize: '.72rem', color: 'var(--g-600)' }}>
                          {c.numero_piece ?? '—'}
                        </span>
                      </td>
                      <td style={{ ...td, fontWeight: 500 }}>
                        {c.nom}
                        {c.contact && (
                          <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                            {c.contact}
                          </span>
                        )}
                      </td>
                      <td style={td} className="col-secondaire">
                        <span className="badge badge--neutral">{LIBELLE_TYPE_CLIENT[c.type]}</span>
                      </td>
                      <td style={td} className="col-secondaire muted">{c.ville ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }} className="amount">
                        {e.ca > 0 ? money(e.ca) : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }} className="amount">
                        {e.du > 0 ? (
                          <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{money(e.du)}</span>
                        ) : '—'}
                      </td>
                      {peutGerer && (
                        <td style={{ ...td, textAlign: 'right' }}>
                          <button onClick={() => ouvrirEdition(c)} className="btn btn--ghost"
                            style={{ minHeight: 28, padding: '.15rem .6rem', fontSize: '.7rem' }}>
                            Modifier
                          </button>
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

const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)',
  fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.6rem .4rem', verticalAlign: 'top' };
