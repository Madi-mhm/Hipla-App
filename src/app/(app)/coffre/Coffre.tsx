'use client';

/**
 * LE COFFRE
 *
 * Les documents qui fondent la société : statuts, Kbis, attestation de
 * dépôt du capital, procès-verbaux, contrats.
 *
 * Ce qui MANQUE est affiché avant ce qui est là. Une société qui ne peut
 * pas produire ses statuts a un problème avant d'avoir un problème — et
 * c'est le premier document qu'un banquier, un bailleur ou un cabinet
 * réclame.
 */

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { date, dateLong } from '@/lib/format';
import Alerte from '@/components/Alerte';

export type Document = {
  id: string; type_document: string; libelle: string; reference: string | null;
  chemin: string; nom_original: string; type_mime: string; taille_octets: number;
  date_document: string; date_effet: string | null; date_expiration: string | null;
  remplace_id: string | null; en_vigueur: boolean; notes: string | null;
};

export type Etat = {
  total: number; archives: number; poids: number;
  expirent: Array<{ id: string; libelle: string; date_expiration: string; jours: number }>;
  manquants: string[];
};

const TYPES: Record<string, { libelle: string; aide: string }> = {
  statuts:      { libelle: 'Statuts', aide: 'L’acte fondateur. Réclamé par tout tiers sérieux.' },
  kbis:         { libelle: 'Extrait Kbis', aide: 'La carte d’identité de la société. Souvent exigé de moins de trois mois.' },
  capital:      { libelle: 'Dépôt du capital', aide: 'L’attestation du notaire ou de la banque.' },
  pv_assemblee: { libelle: 'Procès-verbal d’assemblée', aide: 'Chaque décision collective doit laisser une trace écrite.' },
  contrat:      { libelle: 'Contrat', aide: 'Banque, fournisseur, prestataire.' },
  assurance:    { libelle: 'Assurance', aide: 'La responsabilité civile professionnelle est souvent exigée par vos clients.' },
  bail:         { libelle: 'Bail', aide: 'Local commercial ou domiciliation.' },
  attestation:  { libelle: 'Attestation', aide: 'Vigilance URSSAF, régularité fiscale.' },
  fiscal:       { libelle: 'Document fiscal', aide: 'Avis, notification, accusé de dépôt.' },
  autre:        { libelle: 'Autre', aide: '' },
};

const INDISPENSABLES: Record<string, string> = {
  statuts: 'Les statuts fondent la société. Sans eux, aucune démarche sérieuse n’aboutit.',
  kbis:    'L’extrait Kbis prouve l’immatriculation. Un client ou un banquier le demandera.',
  capital: 'L’attestation de dépôt du capital prouve la libération des 400 €.',
};

function poids(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1048576) return `${(octets / 1024).toFixed(0)} Ko`;
  return `${(octets / 1048576).toFixed(1)} Mo`;
}

export default function Coffre({ documents, etat, peutDeposer }: {
  documents: Document[]; etat: Etat; peutDeposer: boolean;
}) {
  const router = useRouter();
  const champ = useRef<HTMLInputElement>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);

  const [type, setType] = useState('statuts');
  const [libelle, setLibelle] = useState('');
  const [reference, setReference] = useState('');
  const [dateDocument, setDateDocument] = useState(new Date().toISOString().slice(0, 10));
  const [dateExpiration, setDateExpiration] = useState('');
  const [remplace, setRemplace] = useState('');

  // Les documents du même type déjà en vigueur : candidats au
  // remplacement plutôt qu'au doublon.
  const memeType = documents.filter((d) => d.en_vigueur && d.type_document === type);

  // Les fichiers ne sont pas publics : une URL signée, valable une
  // heure, est produite à la demande.
  async function ouvrir(chemin: string) {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from('justificatifs').createSignedUrl(chemin, 3600);
    if (error || !data?.signedUrl) {
      setErreur('Fichier introuvable dans le stockage.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function deposer(e: React.FormEvent) {
    e.preventDefault();
    const fichier = champ.current?.files?.[0];
    if (!fichier) { setErreur('Choisissez un fichier.'); return; }
    if (!libelle.trim()) { setErreur('Le libellé est obligatoire.'); return; }

    setEnCours(true);
    setErreur(null);

    if (fichier.size > 20 * 1048576) {
      setErreur(`Fichier trop lourd (${(fichier.size / 1048576).toFixed(1)} Mo). `
              + 'Maximum 20 Mo.');
      setEnCours(false);
      return;
    }

    const supabase = createClient();

    // Le même bucket que les justificatifs, sous un préfixe distinct :
    // une seconde mécanique de stockage serait une seconde source de
    // panne.
    const extension = fichier.name.includes('.')
      ? fichier.name.slice(fichier.name.lastIndexOf('.')) : '';
    const chemin = `coffre/${type}/${Date.now()}-${crypto.randomUUID()}${extension}`;

    const { error: erreurDepot } = await supabase.storage
      .from('justificatifs')
      .upload(chemin, fichier, {
        contentType: fichier.type || 'application/octet-stream',
        upsert: false,
      });

    if (erreurDepot) {
      setErreur(`Dépôt impossible — ${erreurDepot.message}`);
      setEnCours(false);
      return;
    }

    // La ligne en base APRÈS le fichier : un fichier orphelin vaut mieux
    // qu'une ligne qui pointe vers rien.
    const { error } = await supabase.rpc('deposer_document', {
      p_type: type,
      p_libelle: libelle.trim(),
      p_chemin: chemin,
      p_nom_original: fichier.name,
      p_type_mime: fichier.type || 'application/octet-stream',
      p_taille: fichier.size,
      p_date_document: dateDocument,
      p_reference: reference.trim() || null,
      p_date_expiration: dateExpiration || null,
      p_remplace: remplace || null,
    });

    if (error) { setErreur(error.message); setEnCours(false); return; }

    setSucces(remplace
      ? 'Déposé. L’ancienne version reste consultable dans les archives.'
      : 'Document déposé.');
    setLibelle(''); setReference(''); setDateExpiration(''); setRemplace('');
    if (champ.current) champ.current.value = '';
    setOuvert(false);
    setEnCours(false);
    router.refresh();
  }

  const enVigueur = documents.filter((d) => d.en_vigueur);
  const archives = documents.filter((d) => !d.en_vigueur);

  // Groupés par type : c'est ainsi qu'on les cherche.
  const groupes = enVigueur.reduce<Record<string, Document[]>>((acc, d) => {
    (acc[d.type_document] ??= []).push(d);
    return acc;
  }, {});

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      {/* ---------- Ce qui manque, avant ce qui est là ---------- */}
      {etat.manquants?.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid var(--warning)' }}>
          <p className="card__title" style={{ color: 'var(--warning)' }}>
            {etat.manquants.length} document{etat.manquants.length > 1 ? 's' : ''} indispensable
            {etat.manquants.length > 1 ? 's' : ''} absent{etat.manquants.length > 1 ? 's' : ''}
          </p>
          {etat.manquants.map((m) => (
            <div key={m} style={{
              padding: '.6rem 0', borderBottom: '1px solid var(--g-200)',
            }}>
              <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 500 }}>
                {TYPES[m]?.libelle ?? m}
              </p>
              <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.1rem' }}>
                {INDISPENSABLES[m]}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Ce qui expire ---------- */}
      {etat.expirent?.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid var(--danger)' }}>
          <p className="card__title" style={{ color: 'var(--danger)' }}>
            À renouveler
          </p>
          {etat.expirent.map((x) => (
            <div key={x.id} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '.5rem 0', fontSize: 'var(--fs-sm)',
            }}>
              <span>{x.libelle}</span>
              <span className="muted">
                {x.jours < 0 ? `expiré depuis ${-x.jours} jours` : `dans ${x.jours} jours`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Déposer ---------- */}
      {peutDeposer && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          {!ouvert ? (
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
            }}>
              <div>
                <p className="card__title" style={{ margin: 0 }}>Déposer un document</p>
                <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.2rem' }}>
                  PDF ou image, 20 Mo maximum
                </p>
              </div>
              <button onClick={() => setOuvert(true)} className="btn btn--gold">
                Ajouter
              </button>
            </div>
          ) : (
            <form onSubmit={deposer}>
              <p className="card__title">Déposer un document</p>

              <div style={{
                display: 'grid', gap: '.9rem', marginTop: '.6rem',
                gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
              }}>
                <label>
                  <span>Nature *</span>
                  <select value={type} onChange={(e) => { setType(e.target.value); setRemplace(''); }}>
                    {Object.entries(TYPES).map(([k, v]) => (
                      <option key={k} value={k}>{v.libelle}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Libellé *</span>
                  <input type="text" value={libelle} required
                    onChange={(e) => setLibelle(e.target.value)}
                    placeholder="Statuts constitutifs" />
                </label>

                <label>
                  <span>Date du document *</span>
                  <input type="date" value={dateDocument} required
                    onChange={(e) => setDateDocument(e.target.value)} />
                </label>

                <label>
                  <span>Référence</span>
                  <input type="text" value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Numéro, greffe…" />
                </label>

                <label>
                  <span>Expire le</span>
                  <input type="date" value={dateExpiration}
                    onChange={(e) => setDateExpiration(e.target.value)} />
                </label>

                {/* Remplacer plutôt que dupliquer : de nouveaux statuts
                    succèdent aux anciens, ils ne coexistent pas. */}
                {memeType.length > 0 && (
                  <label>
                    <span>Remplace</span>
                    <select value={remplace} onChange={(e) => setRemplace(e.target.value)}>
                      <option value="">Nouveau document</option>
                      {memeType.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.libelle} du {date(d.date_document)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <p className="muted" style={{
                fontSize: 'var(--fs-xs)', marginTop: '.5rem', lineHeight: 1.5, maxWidth: '68ch',
              }}>
                {TYPES[type]?.aide}
                {memeType.length > 0 && ' Un document de même nature existe déjà : '
                  + 'indiquez s’il s’agit d’un remplacement, l’ancien restera consultable.'}
              </p>

              <div style={{ marginTop: '.9rem' }}>
                <input ref={champ} type="file" required
                  accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" />
              </div>

              <div style={{ display: 'flex', gap: '.6rem', marginTop: '1rem' }}>
                <button type="submit" disabled={enCours} className="btn btn--gold">
                  {enCours ? 'Dépôt…' : 'Déposer'}
                </button>
                <button type="button" onClick={() => setOuvert(false)} className="btn btn--ghost">
                  Abandonner
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ---------- Le coffre ---------- */}
      {enVigueur.length === 0 ? (
        <div className="card">
          <div className="etat-vide">
            <p>Le coffre est vide.</p>
            <p className="muted">
              Vos statuts, votre Kbis et l’attestation de dépôt du capital sont
              les trois documents qu’un tiers réclame en premier. Ils vivent
              probablement dans vos courriels.
            </p>
          </div>
        </div>
      ) : (
        Object.entries(groupes).map(([t, docs]) => (
          <div key={t} className="card" style={{ marginBottom: '1.25rem' }}>
            <p className="card__title">{TYPES[t]?.libelle ?? t} — {docs.length}</p>
            {docs.map((d) => (
              <div key={d.id} style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
                padding: '.7rem 0', borderBottom: '1px solid var(--g-200)',
              }}>
                <div style={{ flex: 1, minWidth: '16rem' }}>
                  <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 500 }}>{d.libelle}</p>
                  <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.1rem' }}>
                    {dateLong(d.date_document)}
                    {d.reference && ` · ${d.reference}`}
                    {' · '}{poids(d.taille_octets)}
                    {d.date_expiration && ` · expire le ${date(d.date_expiration)}`}
                  </p>
                </div>
                <button onClick={() => ouvrir(d.chemin)}
                  className="btn btn--ghost"
                  style={{ minHeight: 28, padding: '.15rem .6rem', fontSize: '.7rem' }}>
                  Ouvrir
                </button>
              </div>
            ))}
          </div>
        ))
      )}

      {archives.length > 0 && (
        <details className="card">
          <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)' }}>
            Versions remplacées — {archives.length}
          </summary>
          <p className="muted" style={{
            fontSize: 'var(--fs-xs)', marginTop: '.5rem', lineHeight: 1.5, maxWidth: '68ch',
          }}>
            Conservées : on peut avoir besoin de prouver ce qui valait à une date
            passée.
          </p>
          <div style={{ marginTop: '.6rem' }}>
            {archives.map((d) => (
              <div key={d.id} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '.45rem 0', fontSize: 'var(--fs-sm)', color: 'var(--g-500)',
              }}>
                <span>{d.libelle}</span>
                <span className="mono" style={{ fontSize: '.7rem' }}>
                  {date(d.date_document)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
