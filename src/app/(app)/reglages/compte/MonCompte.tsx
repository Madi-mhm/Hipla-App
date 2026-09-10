'use client';

/**
 * MON COMPTE
 *
 * La double authentification : après le mot de passe, un code à six
 * chiffres affiché par une application (Google Authenticator, Microsoft
 * Authenticator, 1Password…). Un mot de passe volé ne suffit plus.
 *
 * Perte du téléphone : le propriétaire du projet Supabase peut retirer
 * le facteur dans Authentication → Users → (compte) → MFA.
 */

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Alerte from '@/components/Alerte';
import f from '@/styles/formulaire.module.css';

type Inscription = { factorId: string; qr: string; secret: string };

export default function MonCompte({ nom, email, role }: { nom: string; email: string; role: string }) {
  const [actif, setActif] = useState<string | null>(null);     // id du facteur vérifié
  const [charge, setCharge] = useState(false);
  const [inscription, setInscription] = useState<Inscription | null>(null);
  const [code, setCode] = useState('');
  const [mdp, setMdp] = useState('');
  const [mdp2, setMdp2] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const lire = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    setActif(data?.totp?.find((x) => x.status === 'verified')?.id ?? null);
    setCharge(true);
  }, []);

  useEffect(() => { lire(); }, [lire]);

  async function commencer() {
    setErreur(null); setSucces(null); setEnCours(true);
    const supabase = createClient();
    // Une tentative abandonnée laisse un facteur non vérifié qui bloquerait
    // la nouvelle inscription : on le retire d'abord.
    const { data: liste } = await supabase.auth.mfa.listFactors();
    for (const x of liste?.all ?? []) {
      if (x.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: x.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp', friendlyName: `Hipla Gestion ${new Date().toISOString().slice(0, 10)}`,
    });
    setEnCours(false);
    if (error || !data) { setErreur(`Activation impossible : ${error?.message}`); return; }
    setInscription({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirmer(e: React.FormEvent) {
    e.preventDefault();
    if (!inscription) return;
    setErreur(null); setEnCours(true);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: inscription.factorId, code: code.replace(/\s/g, ''),
    });
    setEnCours(false);
    if (error) { setErreur('Code incorrect. Saisissez le code affiché maintenant par l’application.'); return; }
    await supabase.rpc('journaliser', {
      p_action: 'modification', p_table: 'profils', p_id: null,
      p_details: { resume: 'Double authentification activée' },
    });
    setInscription(null); setCode('');
    setSucces('Double authentification activée. Le code sera demandé à chaque connexion.');
    lire();
  }

  async function desactiver() {
    if (!actif) return;
    if (!window.confirm('Désactiver la double authentification ? Le mot de passe seul suffira de nouveau.')) return;
    setErreur(null); setEnCours(true);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId: actif });
    setEnCours(false);
    if (error) { setErreur(`Désactivation impossible : ${error.message}`); return; }
    await supabase.rpc('journaliser', {
      p_action: 'modification', p_table: 'profils', p_id: null,
      p_details: { resume: 'Double authentification désactivée' },
    });
    setSucces('Double authentification désactivée.');
    lire();
  }

  async function changerMotDePasse(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null); setSucces(null);
    if (mdp.length < 10) { setErreur('Au moins dix caractères.'); return; }
    if (mdp !== mdp2) { setErreur('Les deux saisies ne correspondent pas.'); return; }
    setEnCours(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: mdp });
    setEnCours(false);
    if (error) { setErreur(`Mot de passe non modifié : ${error.message}`); return; }
    setMdp(''); setMdp2('');
    setSucces('Mot de passe modifié.');
  }

  return (
    <>
      {erreur && <Alerte type="erreur" message={erreur} onFermer={() => setErreur(null)} />}
      {succes && <Alerte type="succes" message={succes} onFermer={() => setSucces(null)} />}

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card__title">Compte</p>
        <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.7 }}>
          <strong>{nom}</strong> · <span className="mono">{email}</span> · {role}
        </p>
      </div>

      <div className="card" style={{ marginBottom: '1.25rem', borderLeft: `3px solid ${actif ? 'var(--success)' : 'var(--warning)'}` }}>
        <p className="card__title">Double authentification</p>
        {!charge ? (
          <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>Lecture…</p>
        ) : actif ? (
          <>
            <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '68ch' }}>
              <span className="badge badge--success">Activée</span>{' '}
              Un code à six chiffres est demandé à chaque connexion, après le mot de passe.
            </p>
            <button onClick={desactiver} disabled={enCours} className="btn btn--danger btn--sm" style={{ marginTop: '.9rem' }}>
              Désactiver
            </button>
          </>
        ) : inscription ? (
          <form onSubmit={confirmer}>
            <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '68ch' }}>
              1. Dans votre application d&apos;authentification, ajoutez un compte
              en scannant ce code. 2. Saisissez le code à six chiffres qu&apos;elle affiche.
            </p>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '1rem' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={inscription.qr} alt="Code QR de la double authentification"
                width={180} height={180} style={{ background: '#fff', padding: 8, borderRadius: 6 }} />
              <div style={{ minWidth: '14rem' }}>
                <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Ou saisissez cette clé à la main :</p>
                <p className="mono" style={{ fontSize: '.8rem', wordBreak: 'break-all', marginTop: '.2rem' }}>
                  {inscription.secret}
                </p>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', marginTop: '1rem' }}>
                  <span className={f.etiquette}>Code affiché</span>
                  <input className={f.recherche} inputMode="numeric" autoComplete="one-time-code"
                    maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} required
                    placeholder="123 456" />
                </label>
                <div className={f.actions} style={{ marginTop: '.8rem' }}>
                  <button type="submit" disabled={enCours} className="btn btn--gold">Confirmer</button>
                  <button type="button" className="btn btn--ghost" onClick={() => { setInscription(null); setCode(''); }}>
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          </form>
        ) : (
          <>
            <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, maxWidth: '68ch' }}>
              <span className="badge badge--warning">Désactivée</span>{' '}
              Votre compte donne accès à toutes les finances de la société avec un
              simple mot de passe. Ajoutez un code à six chiffres, affiché par une
              application sur votre téléphone.
            </p>
            <button onClick={commencer} disabled={enCours} className="btn btn--gold" style={{ marginTop: '.9rem' }}>
              {enCours ? 'Préparation…' : 'Activer la double authentification'}
            </button>
          </>
        )}
      </div>

      <div className="card">
        <p className="card__title">Changer de mot de passe</p>
        <form onSubmit={changerMotDePasse} className={f.formulaire} style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
          <label><span>Nouveau mot de passe</span>
            <input type="password" autoComplete="new-password" value={mdp}
              onChange={(e) => setMdp(e.target.value)} minLength={10} required /></label>
          <label><span>Confirmation</span>
            <input type="password" autoComplete="new-password" value={mdp2}
              onChange={(e) => setMdp2(e.target.value)} minLength={10} required /></label>
          <div className={`${f.actions} ${f.pleine}`}>
            <button type="submit" disabled={enCours} className="btn btn--ghost">Enregistrer le mot de passe</button>
          </div>
        </form>
      </div>
    </>
  );
}
