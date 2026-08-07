import Link from 'next/link';
import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { profilCourant } from '@/lib/auth';
import { peut } from '@/lib/permissions';
import { money, date } from '@/lib/format';
import { LIBELLE_STATUT, CLASSE_STATUT } from '@/lib/types';
import { statutSaisie } from '@/lib/registre';
import ActionsValidation from '@/components/ActionsValidation';

export const metadata = { title: 'Dépenses — Hipla Gestion' };
export const dynamic = 'force-dynamic';

/**
 * Les achats sont lus dans le registre, par la vue `v_pieces_completes`
 * qui porte déjà le nombre de justificatifs et l'état bancaire.
 *
 * Deux manques sont désormais visibles à l'écran, parce qu'ils
 * conditionnent tout le reste : une écriture validée sans facture voit
 * sa TVA contestée, et une écriture attendue en banque sans opération
 * rattachée signale une comptabilité incomplète.
 */

type Ligne = {
  id: string;
  numero_piece: string | null;
  date_piece: string;
  tiers_libelle: string;
  objet: string | null;
  compte: string | null;
  categorie_libelle: string | null;
  montant_ht: number;
  montant_ttc: number;
  tva_comptable: number;
  taux_deductibilite: number;
  etat: string;
  statut: string;
  nature: string;
  sens: 'debit' | 'credit';
  attendu_en_banque: boolean;
  transaction_id: string | null;
  nb_justificatifs: number;
  banque_manquante: boolean;
  // La vue sait quelles charges appellent vraiment une facture.
  facture_manquante: boolean;
  // Faux quand le relevé bancaire ou le carnet de trajets tient lieu de pièce.
  justificatif_requis: boolean;
};

export default async function Page() {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  if (!peut(profil.role, 'depenses', 'read')) redirect('/');

  const supabase = await createClient();
  const { data } = await supabase
    .from('v_pieces_completes')
    .select('*')
    .in('nature', ['achat', 'creation'])
    .order('date_piece', { ascending: false })
    .limit(200);

  const depenses: Ligne[] = (data ?? []).map((p) => ({
    ...p,
    statut: statutSaisie(p.etat),
  }));

  const attente = depenses.filter((d) => d.statut === 'en_attente');
  const validees = depenses.filter((d) => d.statut === 'validee');
  const annulees = depenses.filter((d) => d.statut === 'annulee');

  // Ce qui manque, sur les seules écritures entrées en comptabilité :
  // un brouillon sans facture n'est pas encore une anomalie.
  // La vue sait désormais quelles charges appellent VRAIMENT une facture :
  // un frais bancaire est justifié par le relevé, une indemnité
  // kilométrique par le carnet de trajets.
  const sansJustificatif = depenses.filter((d) => d.facture_manquante);
  const sansBanque = depenses.filter((d) => d.banque_manquante);
  const aCompleter = depenses.filter((d) => d.facture_manquante || d.banque_manquante);

  // Un avoir fournisseur va dans l'autre sens : il RETRANCHE. Additionner
  // les montants sans regarder le sens gonflait les charges du double du
  // montant — une remise de 18 € comptée comme une dépense de 18 €.
  const signe = (d: Ligne) => (d.sens === 'credit' ? -1 : 1);
  const totalHT = validees.reduce((s, d) => s + signe(d) * Number(d.montant_ht), 0);
  const totalTVA = validees.reduce((s, d) => s + Number(d.tva_comptable), 0);
  const avoirs = validees.filter((d) => d.sens === 'credit');

  const peutValider = peut(profil.role, 'depenses', 'validate');
  const peutCreer = peut(profil.role, 'depenses', 'create');

  return (
    <>
      <Header titre="Dépenses" sousTitre={`${depenses.length} enregistrées`} />

      <div className="content">
        <div className="grid-cards" style={{ marginBottom: '1.25rem' }}>
          <div className="card">
            <p className="card__title">Total HT validé</p>
            <p className="amount" style={chiffre}>{money(totalHT)}</p>
          </div>
          <div className="card">
            <p className="card__title">TVA récupérable</p>
            <p className="amount" style={chiffre}>{money(totalTVA)}</p>
            <p className="muted" style={petit}>
              {avoirs.length > 0
                ? `Net de ${avoirs.length} avoir${avoirs.length > 1 ? 's' : ''}`
                : 'Déductible au paiement pour un service'}
            </p>
          </div>
          <div className="card">
            <p className="card__title">Sans justificatif</p>
            <p className="amount" style={{
              ...chiffre, color: sansJustificatif.length ? 'var(--danger)' : undefined,
            }}>
              {sansJustificatif.length}
            </p>
            <p className="muted" style={petit}>
              {sansJustificatif.length
                ? 'TVA non déductible en l\u2019état'
                : 'Toutes les pièces sont justifiées'}
            </p>
          </div>
          <div className="card">
            <p className="card__title">En attente de validation</p>
            <p className="amount" style={{
              ...chiffre, color: attente.length ? 'var(--warning)' : undefined,
            }}>
              {attente.length}
            </p>
            <p className="muted" style={petit}>
              {annulees.length} annulée{annulees.length > 1 ? 's' : ''}, hors totaux
            </p>
          </div>
        </div>

        {peutCreer && (
          <div style={{ marginBottom: '1.25rem', display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            <Link href="/depenses/extraire" className="btn btn--gold">
              Extraire une facture
            </Link>
            <Link href="/depenses/nouvelle" className="btn btn--ghost">
              + Saisie manuelle
            </Link>
          </div>
        )}

        {/* ---------- Ce qui manque ---------- */}
        {aCompleter.length > 0 && (
          <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--danger)' }}>
            <p className="card__title" style={{ color: 'var(--danger)' }}>
              À compléter — {aCompleter.length}
            </p>
            <p className="muted" style={{
              fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '68ch', marginBottom: '.8rem',
            }}>
              Une écriture sans facture voit sa TVA contestée et sa charge
              rejetée. Une écriture attendue en banque sans opération rattachée
              signale une comptabilité incomplète — c&apos;est le premier point
              qu&apos;un vérificateur contrôle.
              {sansBanque.length > 0 && ` ${sansBanque.length} sans opération bancaire.`}
            </p>
            <Tableau depenses={aCompleter} peutValider={false} />
          </div>
        )}

        {attente.length > 0 && (
          <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--warning)' }}>
            <p className="card__title" style={{ color: 'var(--warning)' }}>
              À valider — {attente.length}
            </p>
            <Tableau depenses={attente} peutValider={peutValider} />
          </div>
        )}

        <div className="card">
          <p className="card__title">Toutes les dépenses</p>
          {depenses.length === 0 ? (
            <div className="etat-vide">
              <p>Aucune dépense enregistrée.</p>
              <p className="muted">
                Saisissez vos factures d&apos;achat au fil de l&apos;eau : chaque pièce
                jointe conditionne la déduction de la charge et la récupération
                de la TVA.
              </p>
              {peutCreer && (
                <Link href="/depenses/nouvelle" className="btn btn--gold">
                  Saisir une première dépense
                </Link>
              )}
            </div>
          ) : (
            <Tableau depenses={depenses} peutValider={false} />
          )}
        </div>
      </div>
    </>
  );
}

/** État bancaire d'une ligne, en un mot et une couleur. */
function badgeBanque(d: Ligne) {
  // Une écriture annulée n'attend plus rien : la signaler « en attente »
  // laissait croire à un travail restant.
  if (d.statut === 'annulee') return { texte: '—', classe: 'badge--neutral' };
  if (d.transaction_id) return { texte: 'Rapprochée', classe: 'badge--success' };
  if (!d.attendu_en_banque) return { texte: 'Hors banque', classe: 'badge--neutral' };
  if (d.statut === 'validee') return { texte: 'Manquante', classe: 'badge--danger' };
  return { texte: 'En attente', classe: 'badge--warning' };
}

function Tableau({ depenses, peutValider }: { depenses: Ligne[]; peutValider: boolean }) {
  return (
    <div className="table-scroll">
      <table style={{ minWidth: 700, fontSize: 'var(--fs-sm)' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
            <th style={th}>Pièce</th>
            <th style={th}>Date</th>
            <th style={th}>Fournisseur</th>
            <th style={th} className="col-secondaire">Catégorie</th>
            <th style={{ ...th, textAlign: 'right' }}>HT</th>
            <th style={{ ...th, textAlign: 'right' }} className="col-secondaire">TVA réc.</th>
            <th style={{ ...th, textAlign: 'right' }}>TTC</th>
            <th style={{ ...th, textAlign: 'center' }}>Facture</th>
            <th style={{ ...th, textAlign: 'right' }}>Statut</th>
            <th style={{ ...th, textAlign: 'right' }}>Banque</th>
            <th style={{ ...th, textAlign: 'right' }}></th>
            {peutValider && <th style={{ ...th, textAlign: 'right' }}>Action</th>}
          </tr>
        </thead>
        <tbody>
          {depenses.map((d) => {
            const banque = badgeBanque(d);
            const manqueFacture = d.facture_manquante;

            return (
              <tr key={d.id} style={{
                borderBottom: '1px solid var(--g-200)',
                opacity: d.statut === 'annulee' ? 0.45 : 1,
              }}>
                <td style={td} className="mono">
                  <span style={{ fontSize: '.72rem', color: 'var(--g-600)' }}>
                    {d.numero_piece ?? '—'}
                  </span>
                </td>
                <td style={td}>{date(d.date_piece)}</td>
                <td style={{ ...td, fontWeight: 500 }}>
                  <Link href={`/depenses/${d.id}`} style={{ color: 'var(--navy)', textDecoration: 'none' }}>
                    {d.tiers_libelle}
                  </Link>
                  {d.sens === 'credit' && (
                    <span className="badge badge--success" style={{
                      marginLeft: '.4rem', fontSize: '.62rem',
                    }}>
                      avoir
                    </span>
                  )}
                  {d.objet && (
                    <span className="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                      {d.objet}
                    </span>
                  )}
                </td>
                <td style={td} className="col-secondaire">
                  {d.categorie_libelle}
                  <span className="mono muted" style={{ display: 'block', fontSize: '0.68rem' }}>
                    {d.compte}
                  </span>
                </td>
                <td style={{ ...td, textAlign: 'right' }} className="amount">
                  {d.sens === 'credit' && '− '}{money(Number(d.montant_ht))}
                </td>
                <td style={{ ...td, textAlign: 'right' }} className="amount col-secondaire">
                  {money(Number(d.tva_comptable))}
                  {d.taux_deductibilite < 100 && (
                    <span className="muted" style={{ display: 'block', fontSize: '0.68rem' }}>
                      {d.taux_deductibilite} %
                    </span>
                  )}
                </td>
                <td style={{
                  ...td, textAlign: 'right', fontWeight: 600,
                  color: d.sens === 'credit' ? 'var(--success)' : undefined,
                }} className="amount">
                  {d.sens === 'credit' && '− '}{money(Number(d.montant_ttc))}
                </td>

                {/* Facture jointe : l'information la plus déterminante du tableau. */}
                {/*
                  Trois cas distincts, et les confondre trompe :
                  · une pièce est jointe ;
                  · aucune n'est attendue — le relevé ou le carnet fait foi ;
                  · une facture manque, en rouge si l'écriture est déjà validée.
                */}
                <td style={{ ...td, textAlign: 'center' }}>
                  {d.nb_justificatifs > 0 ? (
                    <span className="muted">
                      {d.nb_justificatifs > 1 ? `${d.nb_justificatifs} pièces` : 'jointe'}
                    </span>
                  ) : !d.justificatif_requis ? (
                    <span className="muted" title="Le relevé bancaire tient lieu de justificatif">
                      relevé
                    </span>
                  ) : (
                    <span
                      title={manqueFacture
                        ? 'Aucune facture — TVA non déductible'
                        : 'Facture à joindre avant validation'}
                      style={{
                        color: manqueFacture ? 'var(--danger)' : 'var(--warning)',
                        fontWeight: manqueFacture ? 600 : 400,
                      }}>
                      manquante
                    </span>
                  )}
                </td>

                <td style={{ ...td, textAlign: 'right' }}>
                  <span className={`badge ${CLASSE_STATUT[d.statut]}`}>
                    {LIBELLE_STATUT[d.statut]}
                  </span>
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <span className={`badge ${banque.classe}`}>{banque.texte}</span>
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <Link href={`/depenses/${d.id}`} className="btn btn--ghost"
                    style={{ minHeight: 28, padding: '.15rem .6rem', fontSize: '.7rem' }}>
                    Ouvrir
                  </Link>
                </td>
                {peutValider && (
                  <td style={{ ...td, textAlign: 'right' }}>
                    <ActionsValidation table="depenses" id={d.id}
                      resume={`${d.numero_piece ?? ''} · ${d.tiers_libelle} — ${Number(d.montant_ttc).toFixed(2).replace('.', ',')} € TTC`} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const chiffre: React.CSSProperties = {
  fontSize: '1.35rem', fontFamily: 'var(--display)', fontWeight: 600,
};
const petit: React.CSSProperties = { fontSize: 'var(--fs-xs)', marginTop: '.3rem' };
const th: React.CSSProperties = {
  textAlign: 'left', padding: '.5rem .4rem', color: 'var(--g-500)',
  fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '.65rem .4rem', verticalAlign: 'top' };
