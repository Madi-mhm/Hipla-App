'use client';

/**
 * ÉCRITURES DE FIN D'EXERCICE
 *
 * Rattacher chaque charge et chaque produit à l'exercice qu'il concerne :
 * c'est le travail d'inventaire. Quatre cas couvrent ce dossier. Chaque
 * écriture est passée à la date de clôture et s'annule d'elle-même le
 * lendemain (extourne) : la facture, quand elle arrive, s'enregistre
 * normalement, sans double compte.
 *
 * L'impôt sur les sociétés se calcule une fois ces écritures passées ;
 * le recalculer remplace l'écriture précédente.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money, montantSaisi, date } from '@/lib/format';
import Alerte from '@/components/Alerte';
import Dialogue from '@/components/Dialogue';
import f from '@/styles/formulaire.module.css';

export type Ecriture = {
  id: string; numero_piece: string | null; origine: string; compte: string | null;
  objet: string | null; tiers_libelle: string; montant_ht: number; montant_tva: number;
};

export type EstimationIs = {
  resultat_avant_is: number; resultat_fiscal: number; impot: number;
  base_taux_reduit: number; base_taux_normal: number; plafond_taux_reduit: number;
  taux_reduit_applicable: boolean; is_comptabilise: number;
  deficit_impute: number; deficit_reportable: number;
};

type Type = 'cca' | 'fnp' | 'pca' | 'par';

const TYPES: Record<Type, { libelle: string; aide: string; classe: '6' | '7'; tva: boolean }> = {
  cca: {
    libelle: 'Charge constatée d’avance', classe: '6', tva: false,
    aide: 'Payée sur cet exercice, elle couvre en partie le suivant (abonnement annuel, assurance, '
      + 'nom de domaine) : indiquez la part de l’exercice suivant, hors taxe.',
  },
  fnp: {
    libelle: 'Facture non parvenue', classe: '6', tva: true,
    aide: 'Consommée sur cet exercice, sa facture arrivera après la clôture (péages, électricité, '
      + 'honoraires) : indiquez le montant hors taxe, et la TVA à part.',
  },
  pca: {
    libelle: 'Produit constaté d’avance', classe: '7', tva: false,
    aide: 'Facturée sur cet exercice, la prestation sera réalisée sur le suivant : indiquez la part '
      + 'non réalisée, hors taxe.',
  },
  par: {
    libelle: 'Produit à recevoir', classe: '7', tva: true,
    aide: 'Réalisée sur cet exercice, la prestation sera facturée après la clôture : indiquez le '
      + 'montant hors taxe, et la TVA à part.',
  },
};

export default function EcrituresInventaire({
  exerciceId, fin, ecritures, comptes, fiscal, peutModifier,
}: {
  exerciceId: string; fin: string; ecritures: Ecriture[];
  comptes: { compte: string; libelle: string }[];
  fiscal: EstimationIs | null; peutModifier: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState<Type>('cca');
  const [compte, setCompte] = useState('');
  const [libelle, setLibelle] = useState('');
  const [montant, setMontant] = useState('');
  const [tva, setTva] = useState('');
  const [tiers, setTiers] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [aAnnuler, setAAnnuler] = useState<Ecriture | null>(null);

  const t = TYPES[type];
  const lendemain = new Date(Date.parse(fin) + 86_400_000).toISOString().slice(0, 10);
  const proposes = comptes.filter((c) => c.compte.startsWith(t.classe));
  const regularisations = ecritures.filter((x) => x.origine !== 'is');

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    const m = montantSaisi(montant);
    const v = t.tva && tva.trim() ? montantSaisi(tva) : 0;
    if (m === null || m <= 0) { setErreur('Montant hors taxe illisible.'); return; }
    if (v === null || v < 0) { setErreur('Montant de TVA illisible.'); return; }
    setEnCours(true); setErreur(null); setSucces(null);
    const { data, error } = await createClient().rpc('creer_ecriture_inventaire', {
      p_type: type, p_exercice: exerciceId, p_compte: compte.trim(), p_libelle: libelle.trim(),
      p_montant: m, p_tva: v, p_tiers: tiers.trim() || null,
    });
    setEnCours(false);
    if (error) { setErreur(error.message); return; }
    const numero = (data as { numero_piece?: string } | null)?.numero_piece ?? 'Écriture';
    setSucces(`${numero} passée : ${t.libelle.toLowerCase()}.`);
    setCompte(''); setLibelle(''); setMontant(''); setTva(''); setTiers('');
    router.refresh();
  }

  async function annuler(motif: string) {
    const x = aAnnuler;
    setAAnnuler(null);
    if (!x) return;
    setEnCours(true); setErreur(null);
    const { error } = await createClient().rpc('annuler_piece', { p_id: x.id, p_motif: motif });
    setEnCours(false);
    if (error) { setErreur(error.message); return; }
    router.refresh();
  }

  async function calculerImpot() {
    setEnCours(true); setErreur(null); setSucces(null);
    const { data, error } = await createClient().rpc('comptabiliser_is', { p_exercice: exerciceId });
    setEnCours(false);
    if (error) { setErreur(error.message); return; }
    const r = data as { comptabilise: boolean; impot: number };
    setSucces(r.comptabilise
      ? `Impôt comptabilisé : ${money(Number(r.impot))}.`
      : 'Aucun impôt dû : le résultat fiscal n’est pas bénéficiaire.');
    router.refresh();
  }

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '72ch', marginTop: '.3rem' }}>
        Chaque charge et chaque produit doit tomber dans l&apos;exercice qu&apos;il concerne. Ces
        écritures sont passées au {date(fin)} et s&apos;annulent d&apos;elles-mêmes le {date(lendemain)} :
        la facture, quand elle arrive, s&apos;enregistre normalement, sans double compte. Si rien ne
        chevauche la clôture, il n&apos;y a rien à passer.
      </p>

      {regularisations.length > 0 && (
        <div className="table-scroll" style={{ marginTop: '.8rem' }}>
          <table style={{ minWidth: 640, fontSize: 'var(--fs-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                <th className={f.th}>Pièce</th>
                <th className={f.th}>Nature</th>
                <th className={f.th}>Compte</th>
                <th className={f.th}>Libellé</th>
                <th className={f.th} style={{ textAlign: 'right' }}>HT</th>
                <th className={f.th} style={{ textAlign: 'right' }}>TVA</th>
                {peutModifier && <th className={f.th}></th>}
              </tr>
            </thead>
            <tbody>
              {regularisations.map((x) => (
                <tr key={x.id} className={f.ligne}>
                  <td className={`${f.td} mono`}>{x.numero_piece ?? '—'}</td>
                  <td className={f.td}>{TYPES[x.origine as Type]?.libelle ?? x.origine}</td>
                  <td className={`${f.td} mono`}>{x.compte}</td>
                  <td className={f.td}>
                    {x.objet}
                    {x.tiers_libelle !== 'Écriture de clôture' && (
                      <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                        {x.tiers_libelle}
                      </span>
                    )}
                  </td>
                  <td className={`${f.td} amount`} style={{ textAlign: 'right' }}>{money(Number(x.montant_ht))}</td>
                  <td className={`${f.td} amount`} style={{ textAlign: 'right' }}>
                    {Number(x.montant_tva) > 0 ? money(Number(x.montant_tva)) : '—'}
                  </td>
                  {peutModifier && (
                    <td className={f.td} style={{ textAlign: 'right' }}>
                      <button onClick={() => setAAnnuler(x)} disabled={enCours} className="btn btn--ghost btn--sm">
                        Annuler
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {peutModifier && (
        <form onSubmit={ajouter} className={f.formulaire} style={{ marginTop: '1rem' }}>
          <label><span>Nature</span>
            <select value={type} onChange={(e) => setType(e.target.value as Type)}>
              {(Object.keys(TYPES) as Type[]).map((k) => <option key={k} value={k}>{TYPES[k].libelle}</option>)}
            </select></label>
          <label><span>{t.classe === '6' ? 'Compte de charge *' : 'Compte de produit *'}</span>
            <input value={compte} onChange={(e) => setCompte(e.target.value)} list="comptes-inventaire"
              placeholder={t.classe === '6' ? '616' : '706'} required /></label>
          <datalist id="comptes-inventaire">
            {proposes.map((c) => <option key={c.compte} value={c.compte}>{c.libelle}</option>)}
          </datalist>
          <label className={f.pleine}><span>Libellé *</span>
            <input value={libelle} onChange={(e) => setLibelle(e.target.value)}
              placeholder="Assurance RC Pro — part d’octobre à décembre" required /></label>
          <label><span>Montant hors taxe *</span>
            <input value={montant} onChange={(e) => setMontant(e.target.value)} inputMode="decimal" required /></label>
          {t.tva && (
            <label><span>TVA</span>
              <input value={tva} onChange={(e) => setTva(e.target.value)} inputMode="decimal" placeholder="0,00" /></label>
          )}
          {(type === 'fnp' || type === 'par') && (
            <label><span>{type === 'fnp' ? 'Fournisseur' : 'Client'}</span>
              <input value={tiers} onChange={(e) => setTiers(e.target.value)} /></label>
          )}
          <p className={`${f.note} ${f.pleine}`}>{t.aide}</p>
          <div className={`${f.actions} ${f.pleine}`}>
            <button type="submit" className="btn btn--gold" disabled={enCours}>
              {enCours ? 'Enregistrement…' : 'Passer l’écriture'}
            </button>
          </div>
        </form>
      )}

      {fiscal && (
        <div style={{ marginTop: '1.4rem', paddingTop: '1rem', borderTop: '1px solid var(--g-200)' }}>
          <p style={{ fontWeight: 600 }}>Impôt sur les sociétés</p>
          <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6, marginTop: '.3rem' }}>
            Résultat avant impôt : {money(Number(fiscal.resultat_avant_is))} · résultat fiscal :{' '}
            {money(Number(fiscal.resultat_fiscal))}
            {Number(fiscal.deficit_impute) > 0 && <> · déficits antérieurs imputés : {money(Number(fiscal.deficit_impute))}</>}
          </p>
          <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6 }}>
            {Number(fiscal.impot) > 0 ? (
              <>Impôt dû : <strong>{money(Number(fiscal.impot))}</strong> — 15 % sur{' '}
                {money(Number(fiscal.base_taux_reduit))}, 25 % sur {money(Number(fiscal.base_taux_normal))}.</>
            ) : (
              <>Aucun impôt dû{Number(fiscal.deficit_reportable) > 0
                ? ` : un déficit de ${money(Number(fiscal.deficit_reportable))} se reporte sur les bénéfices suivants.`
                : '.'}</>
            )}{' '}
            Comptabilisé : {money(Number(fiscal.is_comptabilise))}.
          </p>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.3rem', lineHeight: 1.5, maxWidth: '78ch' }}>
            Taux réduit de 15 % jusqu&apos;à {money(Number(fiscal.plafond_taux_reduit))} (42 500 € ajustés à la
            durée de l&apos;exercice)
            {fiscal.taux_reduit_applicable
              ? ' : capital entièrement libéré, détenu par des personnes physiques.'
              : ' — non appliqué : le capital n’est pas entièrement libéré.'}
            {' '}Les amendes (6712) et la taxe sur les véhicules de tourisme (63512) sont réintégrées
            d&apos;office. Une autre charge non déductible augmenterait le résultat fiscal réel.
          </p>
          {peutModifier && (
            <button onClick={calculerImpot} disabled={enCours} className="btn btn--ghost" style={{ marginTop: '.7rem' }}>
              {Number(fiscal.is_comptabilise) > 0 ? 'Recalculer l’impôt' : 'Calculer et comptabiliser l’impôt'}
            </button>
          )}
        </div>
      )}

      <Dialogue
        ouvert={!!aAnnuler}
        titre="Annuler cette écriture"
        description={aAnnuler
          ? `${aAnnuler.numero_piece ?? ''} · ${aAnnuler.objet ?? ''}. Elle reste au journal d’audit, avec le motif.`
          : ''}
        champ="Motif"
        placeholder="Montant erroné, écriture en double…"
        obligatoire
        libelleValider="Annuler l’écriture"
        danger
        onValider={annuler}
        onAnnuler={() => setAAnnuler(null)}
      />
    </>
  );
}
