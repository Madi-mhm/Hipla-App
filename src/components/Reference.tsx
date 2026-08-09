'use client';

/**
 * UNE RÉFÉRENCE CLIQUABLE
 *
 * Partout où un numéro de pièce apparaît — séance, échéancier, journal,
 * TVA, comptes associés, immobilisations — il ouvre le même aperçu.
 *
 * POURQUOI UN SEUL COMPOSANT
 * Avant, certaines références étaient des liens vers une page, d'autres
 * du texte mort. Le lecteur ne pouvait pas savoir ce qui était cliquable
 * sans essayer. Une référence est une référence : elle mène quelque
 * part, toujours de la même façon.
 *
 * L'ORDRE COMPTE : ouvrir d'abord, charger ensuite. Charger d'abord
 * donnerait l'impression d'un bouton mort pendant la demi-seconde de
 * réponse — le défaut le plus courant des fenêtres modales, et le plus
 * facile à éviter.
 *
 * Un clic du milieu, ou avec Ctrl, ouvre la page complète dans un nouvel
 * onglet : le comportement d'un lien reste disponible pour qui le veut.
 */

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Fenetre from '@/components/Fenetre';
import {
  Squelette, EnTeteApercu, Ligne, PiedApercu, Encadre, etiquette,
} from './apercu/briques';
import Justificatifs, { type Justificatif } from './apercu/Justificatifs';
import { money, date, dateLong } from '@/lib/format';

type Apercu = {
  trouvee: boolean;
  id: string; numero_piece: string | null;
  nature: string; sens: string; etat: string;
  date_piece: string; date_echeance: string | null;
  tiers: string; objet: string | null;
  categorie: string | null; compte: string | null;
  montant_ht: number; taux_tva: number; montant_tva: number;
  montant_ttc: number; tva_comptable: number; regime_tva: string;
  montant_regle: number; net_a_payer: number; reste_du: number;
  moyen_paiement: string | null; paye_par: string | null;
  facture_manquante: boolean; banque_manquante: boolean;
  nb_justificatifs: number;
  justificatifs: Justificatif[];
  modifiable: boolean;
  justificatif_exige: boolean | null;
  justificatif_regle: boolean;
  motif_exemption: string | null;
  decision_manuelle: boolean;
  relances: Array<{
    id: string; degre: string; envoyee_le: string;
    reste_du: number; jours_retard: number; moyen: string | null;
  }>;
  relances_envoyees: number;
  derniere_relance: string | null;
  relance_possible: boolean;
  degre_suggere: string | null;
  banque: { numero_piece: string; date_operation: string; libelle: string; montant: number } | null;
  reglements: Array<{ date: string; montant: number; moyen: string }>;
  lien: string;
};

const ETATS: Record<string, { libelle: string; classe: string }> = {
  brouillon: { libelle: 'Brouillon', classe: 'badge--neutral' },
  a_valider: { libelle: 'En attente', classe: 'badge--warning' },
  validee:   { libelle: 'Validée', classe: 'badge--success' },
  rejetee:   { libelle: 'Rejetée', classe: 'badge--danger' },
  annulee:   { libelle: 'Annulée', classe: 'badge--neutral' },
};

const DEGRES: Record<string, string> = {
  rappel: 'Rappel d\u2019échéance',
  relance: 'Relance',
  mise_en_demeure: 'Mise en demeure',
};

const NATURES: Record<string, string> = {
  achat: 'Achat', vente: 'Facture', avoir: 'Avoir',
  creation: 'Frais de création', km: 'Indemnités kilométriques',
  banque: 'Opération bancaire', amortissement: 'Dotation aux amortissements',
  devis: 'Devis', paie: 'Paie',
};

export default function Reference({ id, children, style, className, title }: {
  id: string;
  /** Le numéro affiché. Par défaut, celui que l'aperçu rapporte. */
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  title?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  /** Relit l'aperçu : après un dépôt ou un retrait, la fenêtre doit
      montrer l'état nouveau sans qu'on la referme. */
  async function recharger() {
    const supabase = createClient();
    const { data } = await supabase.rpc('apercu_piece', { p_id: id });
    const r = data as Apercu | null;
    if (r?.trouvee) setApercu(r);
  }

  async function ouvrir(e: React.MouseEvent) {
    // Ctrl, Cmd ou clic du milieu : on laisse le lien faire son office.
    if (e.metaKey || e.ctrlKey || e.button === 1) return;
    e.preventDefault();

    // La fenêtre d'abord, le contenu ensuite.
    setOuvert(true);
    setApercu(null);
    setErreur(null);

    const supabase = createClient();
    const { data, error } = await supabase.rpc('apercu_piece', { p_id: id });

    if (error) { setErreur(error.message); return; }
    const a = data as Apercu | null;
    if (!a?.trouvee) { setErreur('Écriture introuvable.'); return; }
    setApercu(a);
  }

  return (
    <>
      {/*
        La nature de la pièce n'est connue qu'après chargement : le lien
        de repli passe donc par les dépenses, qui redirigent au besoin.
        Ce chemin ne sert qu'au Ctrl-clic et aux moteurs d'indexation.
      */}
      <Link href={`/depenses/${id}`} onClick={ouvrir}
        data-fenetre="oui"
        style={{ cursor: 'pointer', ...style }}
        className={className} title={title ?? 'Voir le détail'}>
        {children ?? '—'}
      </Link>

      <FenetreApercu
        ouvert={ouvert}
        onFermer={() => setOuvert(false)}
        apercu={apercu}
        onRecharger={recharger}
        erreur={erreur}
      />
    </>
  );
}

/* ================================================================ */

function FenetreApercu({ ouvert, onFermer, apercu, erreur, onRecharger }: {
  ouvert: boolean; onFermer: () => void;
  apercu: Apercu | null; erreur: string | null;
  // Le rechargement vit dans `Reference` : il doit descendre jusqu'ici,
  // sinon `Contenu` appelle un nom qui n'existe pas dans sa portée.
  onRecharger: () => void;
}) {
  return (
    <Fenetre ouvert={ouvert} onFermer={onFermer} titre="Aperçu de l’écriture">
      {/* L'alignement et la police viennent de la feuille de styles :
          la fenêtre ne doit rien hériter de la cellule qui l'ouvre. */}
      <div style={{ padding: '1.5rem' }}>
        {erreur ? (
          <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }}>{erreur}</p>
        ) : !apercu ? (
          <Squelette />
        ) : (
          <Contenu a={apercu} onFermer={onFermer} onRecharger={onRecharger} />
        )}
      </div>
    </Fenetre>
  );
}

function Contenu({ a, onFermer, onRecharger }: {
  a: Apercu; onFermer: () => void; onRecharger: () => void;
}) {
  const etat = ETATS[a.etat] ?? ETATS.brouillon;
  const avoir = a.sens === 'credit' && a.nature !== 'vente';

  return (
    <>
      <EnTeteApercu
        titre={a.tiers}
        badge={etat.libelle}
        badgeClasse={etat.classe}
        repere={
          <>
            {a.numero_piece ?? 'sans numéro'} · {NATURES[a.nature] ?? a.nature}
            {' · '}{dateLong(a.date_piece)}
          </>
        }
      />

      {a.objet && (
        <p style={{ fontSize: 'var(--fs-sm)', marginTop: '.8rem' }}>{a.objet}</p>
      )}

      {/* ---- Les montants ---- */}
      <Encadre>
        <Ligne cle="Montant hors taxes"
          valeur={money(Math.abs(Number(a.montant_ht)))} signe={avoir} />
        {Number(a.montant_tva) > 0.005 && (
          <Ligne cle={`TVA ${Number(a.taux_tva).toFixed(0)} %`}
            valeur={money(Math.abs(Number(a.montant_tva)))} signe={avoir} />
        )}
        <Ligne cle="Total TTC" valeur={money(Math.abs(Number(a.montant_ttc)))}
          signe={avoir} fort />
        {Number(a.tva_comptable) !== 0
          && Math.abs(Number(a.tva_comptable)) !== Math.abs(Number(a.montant_tva)) && (
          <Ligne cle="TVA récupérable"
            valeur={money(Math.abs(Number(a.tva_comptable)))} />
        )}
        {a.regime_tva === 'autoliquidation' && (
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.4rem' }}>
            Autoliquidation — la TVA figure des deux côtés, le solde est nul.
          </p>
        )}
      </Encadre>

      {/* ---- Le règlement ---- */}
      {Number(a.reste_du) > 0.005 && (
        <div style={{
          marginTop: '.8rem', padding: '.8rem 1rem', borderRadius: 6,
          background: 'var(--bone)', borderLeft: '2px solid var(--gold)',
        }}>
          <Ligne cle="Reste dû" valeur={money(Number(a.reste_du))} fort />
          {a.date_echeance && (
            <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.2rem' }}>
              Échéance le {dateLong(a.date_echeance)}
            </p>
          )}
        </div>
      )}

      {a.reglements.length > 0 && (
        <div style={{ marginTop: '.8rem' }}>
          <p style={etiquette}>Règlements reçus</p>
          {a.reglements.map((r, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 'var(--fs-sm)', padding: '.25rem 0',
            }}>
              <span className="muted">{date(r.date)} · {r.moyen.replace(/_/g, ' ')}</span>
              <span className="amount">{money(Number(r.montant))}</span>
            </div>
          ))}
        </div>
      )}

      {/* ---- Le rattachement ---- */}
      <div style={{ marginTop: '.9rem', display: 'grid', gap: '.3rem' }}>
        {a.categorie && (
          <Ligne cle="Catégorie" valeur={`${a.categorie} (${a.compte ?? '—'})`} />
        )}
        {a.paye_par && <Ligne cle="Avancé par" valeur={a.paye_par} />}
        {a.banque ? (
          <Ligne cle="Opération bancaire"
            valeur={`${a.banque.numero_piece} · ${date(a.banque.date_operation)}`} />
        ) : a.banque_manquante && a.nature !== 'vente' && a.nature !== 'avoir' ? (
          /*
            Une VENTE attend son encaissement : l'absence d'opération
            bancaire est le cours normal des choses, pas une anomalie.
            Un achat, lui, est payé avant d'être saisi.
          */
          <Ligne cle="Banque" valeur="Aucune opération rattachée" alerte />
        ) : null}
      </div>

      {/*
        Une facture de VENTE est elle-même le justificatif : c'est nous
        qui l'émettons. Lui en réclamer un revient à demander la preuve
        de ce qu'on vient d'écrire.
      */}
      {a.nature !== 'vente' && a.nature !== 'avoir' && (
      <Justificatifs
        pieceId={a.id}
        liste={a.justificatifs ?? []}
        manquante={a.facture_manquante}
        modifiable={a.modifiable}
        peutGerer
        onChange={onRecharger}
        exige={a.justificatif_exige}
        regle={a.justificatif_regle}
        motifExemption={a.motif_exemption}
        decisionManuelle={a.decision_manuelle}
        nature={a.nature}
      />
      )}

      {/* ---- Ce qui a été réclamé ---- */}
      {a.nature === 'vente' && (a.relances?.length > 0 || Number(a.reste_du) > 0.005) && (
        <div style={{ marginTop: '1rem' }}>
          <p style={etiquette}>
            Relances{a.relances?.length > 0 && ` — ${a.relances.length}`}
          </p>

          {a.relances?.length > 0 ? (
            a.relances.map((r) => (
              <div key={r.id} style={{
                display: 'flex', justifyContent: 'space-between',
                gap: '1rem', padding: '.3rem 0', fontSize: 'var(--fs-sm)',
              }}>
                <span>
                  {DEGRES[r.degre] ?? r.degre}
                  {r.moyen && <span className="muted"> · {r.moyen}</span>}
                </span>
                <span className="muted mono" style={{ fontSize: '.7rem' }}>
                  {dateLong(r.envoyee_le)} · {money(Number(r.reste_du))}
                </span>
              </div>
            ))
          ) : (
            <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
              Aucune relance envoyée.
            </p>
          )}

          {/*
            Le degré ne se choisit pas : il se déduit du retard. Envoyer
            une mise en demeure pour trois jours coûte un client ; un
            rappel poli après trois mois coûte une créance.
          */}
          {a.relance_possible && a.degre_suggere && (
            <a href={`/api/ventes/${a.id}/relance`} target="_blank" rel="noopener"
              className="btn btn--ghost" data-fenetre="oui"
              style={{
                display: 'inline-block', marginTop: '.5rem',
                minHeight: 28, padding: '.15rem .7rem', fontSize: '.72rem',
              }}>
              Préparer {(DEGRES[a.degre_suggere] ?? '').toLowerCase()}
            </a>
          )}
          {!a.relance_possible && a.derniere_relance && Number(a.reste_du) > 0.005 && (
            <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.4rem' }}>
              Prochaine relance possible à partir du{' '}
              {dateLong(new Date(new Date(a.derniere_relance).getTime()
                + 8 * 86400000).toISOString().slice(0, 10))}.
            </p>
          )}
        </div>
      )}

      {/*
        La facture n'était téléchargeable que depuis sa page complète.
        Pour la consulter ou l'envoyer, il fallait donc quitter la liste
        — alors que c'est le geste le plus fréquent.
      */}
      {/*
        Le document se téléchargeait pour une facture de vente émise, et
        pour elle seule. Un avoir en a un — même gabarit, même route — et
        un devis aussi depuis qu'il existe. Les exclure obligeait à ouvrir
        la page complète pour un geste que le panneau savait déjà faire.

        Un brouillon reste exclu : le PDF sortirait marqué « brouillon »,
        et l'envoyer serait une erreur. On le télécharge depuis sa page,
        où l'on voit qu'il n'est pas émis.
      */}
      {((a.nature === 'vente' || a.nature === 'avoir') && a.etat === 'validee') && (
        <div style={{
          display: 'flex', gap: '.5rem', marginTop: '1rem', flexWrap: 'wrap',
          paddingTop: '.8rem', borderTop: '1px solid var(--g-200)',
        }}>
          <a href={`/api/factures/${a.id}/pdf`} target="_blank" rel="noopener"
            className="btn btn--ghost btn--sm" data-fenetre="oui">
            {a.nature === 'avoir' ? "Télécharger l'avoir" : 'Télécharger la facture'}
          </a>
          {/*
            Le courrier de relance vit dans le bloc « Relances », qui
            connaît le délai de huit jours et le degré appelé par le
            retard. Un second bouton ici appliquait une règle différente
            — le reste dû seulement — et proposait de relancer une
            facture non échue.
          */}
        </div>
      )}

      {a.nature === 'devis' && (
        <div style={{
          display: 'flex', gap: '.5rem', marginTop: '1rem', flexWrap: 'wrap',
          paddingTop: '.8rem', borderTop: '1px solid var(--g-200)',
        }}>
          <a href={`/api/devis/${a.id}/pdf`} target="_blank" rel="noopener"
            className="btn btn--ghost btn--sm" data-fenetre="oui">
            Télécharger le devis
          </a>
        </div>
      )}

      <PiedApercu lien={a.lien} onFermer={onFermer} />
    </>
  );
}

/* ================================================================ */

