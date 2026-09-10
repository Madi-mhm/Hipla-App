'use client';

/**
 * UTILISATEURS — nom, rôle et accès, modifiables.
 *
 * On ne peut pas changer son propre rôle ni se désactiver : un
 * propriétaire qui se rétrograde par erreur n'aurait plus personne pour
 * lui rendre ses droits. Les comptes se créent dans Supabase
 * (Authentication → Users) ; ils arrivent ici inactifs, en lecture seule.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Alerte from '@/components/Alerte';
import { LIBELLE_ROLE, DESCRIPTION_ROLE, type Role } from '@/lib/permissions';
import f from '@/styles/formulaire.module.css';

export type Compte = {
  id: string; email: string; nom_complet: string; role: Role; actif: boolean; cree_le: string;
};

const ROLES: Role[] = ['proprietaire', 'comptable', 'contributeur', 'lecture_seule', 'salarie'];

export default function GestionUtilisateurs({ comptes, moi, peutGerer }: {
  comptes: Compte[]; moi: string; peutGerer: boolean;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <p className="card__title">Comptes</p>
        <div className="table-scroll">
          <table style={{ minWidth: 640, fontSize: 'var(--fs-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--g-300)' }}>
                <th className={f.th}>Nom</th>
                <th className={f.th}>Courriel</th>
                <th className={f.th}>Rôle</th>
                <th className={f.th}>Accès</th>
                {peutGerer && <th className={f.th}></th>}
              </tr>
            </thead>
            <tbody>
              {comptes.map((c) => (
                <LigneCompte key={c.id} c={c} estMoi={c.id === moi} peutGerer={peutGerer}
                  onErreur={setErreur}
                  onFait={(m) => { setSucces(m); router.refresh(); }} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '.9rem', lineHeight: 1.5, maxWidth: '70ch' }}>
          Un nouveau compte se crée dans Supabase → Authentication → Users. Il
          apparaît alors ici, désactivé : donnez-lui son rôle, puis activez-le.
        </p>
      </div>

      <div className="card">
        <p className="card__title">Rôles</p>
        {ROLES.map((r) => (
          <div key={r} style={{ padding: '.7rem 0', borderBottom: '1px solid var(--g-200)' }}>
            <p style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 'var(--fs-sm)' }}>
              {LIBELLE_ROLE[r]}
            </p>
            <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: '.2rem' }}>
              {DESCRIPTION_ROLE[r]}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}

function LigneCompte({ c, estMoi, peutGerer, onErreur, onFait }: {
  c: Compte; estMoi: boolean; peutGerer: boolean;
  onErreur: (m: string) => void; onFait: (m: string) => void;
}) {
  const [nom, setNom] = useState(c.nom_complet);
  const [role, setRole] = useState<Role>(c.role);
  const [actif, setActif] = useState(c.actif);
  const [enCours, setEnCours] = useState(false);
  const modifie = nom !== c.nom_complet || role !== c.role || actif !== c.actif;

  async function enregistrer() {
    if (!nom.trim()) { onErreur('Le nom ne peut pas être vide.'); return; }
    setEnCours(true);
    const supabase = createClient();
    const { error } = await supabase.from('profils').update({
      nom_complet: nom.trim(), role, actif, modifie_le: new Date().toISOString(),
    }).eq('id', c.id);
    setEnCours(false);
    if (error) { onErreur(`Compte non modifié : ${error.message}`); return; }
    await supabase.rpc('journaliser', {
      p_action: 'modification', p_table: 'profils', p_id: c.id,
      p_details: { resume: `${c.email} : ${LIBELLE_ROLE[role]}, ${actif ? 'actif' : 'désactivé'}` },
    });
    onFait(`Compte ${c.email} mis à jour.`);
  }

  return (
    <tr className={`${f.ligne} ${c.actif ? '' : f.archive}`}>
      <td className={f.td}>
        {peutGerer ? (
          <input value={nom} onChange={(e) => setNom(e.target.value)}
            className={f.recherche} style={{ minHeight: 32, minWidth: '12rem' }} />
        ) : c.nom_complet}
      </td>
      <td className={`${f.td} mono`}>{c.email}</td>
      <td className={f.td}>
        {peutGerer && !estMoi ? (
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}
            className={f.recherche} style={{ minHeight: 32, minWidth: '10rem' }}>
            {ROLES.map((r) => <option key={r} value={r}>{LIBELLE_ROLE[r]}</option>)}
          </select>
        ) : (
          <span className={`badge ${c.role === 'proprietaire' ? 'badge--info' : 'badge--neutral'}`}>
            {LIBELLE_ROLE[c.role]}
          </span>
        )}
      </td>
      <td className={f.td}>
        {peutGerer && !estMoi ? (
          <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
            <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} />
            {actif ? 'Actif' : 'Désactivé'}
          </label>
        ) : (
          <span className={`badge ${c.actif ? 'badge--success' : 'badge--neutral'}`}>
            {c.actif ? 'Actif' : 'Désactivé'}{estMoi ? ' · vous' : ''}
          </span>
        )}
      </td>
      {peutGerer && (
        <td className={f.td} style={{ textAlign: 'right' }}>
          {modifie && (
            <button onClick={enregistrer} disabled={enCours} className="btn btn--gold btn--sm">
              {enCours ? '…' : 'Enregistrer'}
            </button>
          )}
        </td>
      )}
    </tr>
  );
}
