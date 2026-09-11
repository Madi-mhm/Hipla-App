/**
 * CA12E — LIGNES DU FORMULAIRE 3517-S-SD (millésime 2026)
 *
 * La TVA de l'exercice telle que la calcule `declaration_tva` : exigible
 * à l'encaissement pour les services, à la facture pour les biens,
 * autoliquidée pour les prestataires établis hors de France (collectée
 * ligne AC, déduite ligne 20). Le formulaire ne porte pas de centimes :
 * chaque ligne est arrondie, les totaux se font sur les lignes arrondies.
 */

import { date } from '@/lib/format';
import s from './liasse.module.css';

type BaseTaxe = { base: number; tva: number };

export type DeclarationTva = {
  collectee: {
    taux_20: BaseTaxe; taux_10: BaseTaxe; taux_55: BaseTaxe;
    autoliquidation: BaseTaxe; total: number;
  };
  deductible: { achats: number; autoliquidation: number; total: number };
  solde: number;
};

type Ligne = { code: string; libelle: string; base?: number; taxe?: number; total?: boolean; cadre?: string };

const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const eur = (n: number | undefined) => (n === undefined ? '' : n === 0 ? '—' : nombre.format(n));
const r = (n: number | undefined) => Math.round(Number(n ?? 0));

export default function Ca12({ declaration, regime, debut, fin }: {
  declaration: DeclarationTva | null; regime: string | null; debut: string; fin: string;
}) {
  if ((regime ?? 'simplifie') !== 'simplifie') {
    return (
      <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55 }}>
        Cet exercice est réglé sur le réel normal : la TVA se déclare chaque mois (CA3), pas sur une
        CA12E. Si vous n&apos;avez pas choisi ce régime, repassez-le en « simplifié » dans Réglages →
        Entreprise.
      </p>
    );
  }
  if (!declaration) {
    return <p style={{ fontSize: 'var(--fs-sm)' }}>Déclaration indisponible.</p>;
  }

  const c = declaration.collectee;
  const l5A = { base: r(c.taux_20.base), taxe: r(c.taux_20.tva) };
  const l06 = { base: r(c.taux_55.base), taxe: r(c.taux_55.tva) };
  const l6C = { base: r(c.taux_10.base), taxe: r(c.taux_10.tva) };
  const lAC = { base: r(c.autoliquidation.base), taxe: r(c.autoliquidation.tva) };
  const t16 = l5A.taxe + l06.taxe + l6C.taxe + lAC.taxe;
  const t19 = t16;
  const l20 = r(declaration.deductible.total);
  const t22 = l20;
  const t26 = t22;
  const l28 = Math.max(t19 - t26, 0);
  const l29 = Math.max(t26 - t19, 0);
  const l30 = 0;
  const l33 = Math.max(l28 - l29 - l30, 0);
  const l34 = Math.max(l30 - l28, 0);
  const l35 = l29 + l34;
  const l57 = Math.max(t16 - t22, 0);

  const lignes: Ligne[] = [
    { cadre: 'I — TVA brute', code: '', libelle: '' },
    { code: '5A', libelle: 'Taux normal 20 %', ...l5A },
    { code: '06', libelle: 'Taux réduit 5,5 %', ...l06 },
    { code: '6C', libelle: 'Taux réduit 10 %', ...l6C },
    { code: 'AC', libelle: 'Achats de prestations de services auprès d’un assujetti non établi en France (art. 283-2)', ...lAC },
    { code: '16', libelle: 'Total de la taxe due (lignes 5A à 13)', taxe: t16, total: true },
    { code: '19', libelle: 'Total de la TVA brute due (16 + 17 + 18 + AD)', taxe: t19, total: true },
    { cadre: 'II — TVA déductible', code: '', libelle: '' },
    { code: '20', libelle: 'Autres biens et services — déductions sur factures', taxe: l20 },
    { code: '22', libelle: 'Total (lignes 20 + 21)', taxe: t22, total: true },
    { code: '23', libelle: 'TVA déductible sur immobilisations', taxe: 0 },
    { code: '24', libelle: 'Crédit antérieur non imputé et non remboursé', taxe: 0 },
    { code: '26', libelle: 'Total de la TVA déductible (22 + 23 + 24 + 25 + AE)', taxe: t26, total: true },
    { cadre: 'III — TVA nette', code: '', libelle: '' },
    { code: '28', libelle: 'TVA due (ligne 19 − ligne 26)', taxe: l28 },
    { code: '29', libelle: 'Crédit (ligne 26 − ligne 19)', taxe: l29 },
    { code: '30', libelle: 'Acomptes payés et / ou restant dus', taxe: l30 },
    { code: '33', libelle: 'Solde dû', taxe: l33, total: true },
    { code: '35', libelle: 'Solde excédentaire (lignes 29 + 34)', taxe: l35, total: true },
    { cadre: 'VI — Récapitulation', code: '', libelle: '' },
    { code: '49', libelle: 'Solde excédentaire (report de la ligne 35)', taxe: l35 },
    { code: '51', libelle: 'Crédit à reporter (ligne 24 de la prochaine CA12E), si pas de remboursement', taxe: l35 },
    { code: '54', libelle: 'TVA nette due (ligne 33)', taxe: l33 },
    { code: '56', libelle: 'Total à payer', taxe: l33, total: true },
    { code: '57', libelle: 'Base de calcul des acomptes de l’exercice suivant [16 − (11 + 12 + 22)]', taxe: l57 },
  ];

  return (
    <>
      <p style={{ fontSize: 'var(--fs-sm)', marginBottom: '.6rem' }}>
        Déclaration relative à l&apos;exercice du {date(debut)} au {date(fin)} — rayez la mention « CA 12 »
        (clôture en cours d&apos;année).
      </p>
      <div className="table-scroll">
        <table className={s.table}>
          <thead>
            <tr>
              <th>Ligne</th><th>Rubrique</th>
              <th style={{ textAlign: 'right' }}>Base HT</th>
              <th style={{ textAlign: 'right' }}>Taxe</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((x, i) => x.cadre ? (
              <tr key={`cadre-${i}`}>
                <td colSpan={4} style={{ fontWeight: 600, paddingTop: '.8rem' }}>{x.cadre}</td>
              </tr>
            ) : (
              <tr key={x.code} className={x.total ? s.total : undefined}>
                <td><span className={s.code}>{x.code}</span></td>
                <td>{x.libelle}</td>
                <td className={`${s.montant} ${x.base === 0 ? s.zero : ''}`}>{eur(x.base)}</td>
                <td className={`${s.montant} ${x.taxe === 0 ? s.zero : ''}`}>{eur(x.taxe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={s.note}>
        Ligne AC : les services achetés à des fournisseurs établis hors de France (hébergement,
        logiciels) — la TVA autoliquidée est due ligne AC et déduite ligne 20, pour un solde nul.
        TVA sur immobilisations : ligne 23, aucune dans ce dossier.
        {l29 >= 150
          ? ' Le crédit atteint 150 € : vous pouvez en demander le remboursement (ligne 50 et cadre VII) au lieu de le reporter (ligne 51).'
          : l29 > 0 ? ' Le crédit est inférieur à 150 € : il se reporte (ligne 51) sur la prochaine déclaration.' : ''}
        {' '}Premier exercice : aucun acompte (ligne 30). La ligne 57 sert de base aux acomptes de
        l&apos;exercice suivant, dus seulement si elle atteint 1 000 €.
      </p>
    </>
  );
}
