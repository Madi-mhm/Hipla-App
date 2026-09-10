'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { destinationSure } from '../ForumConnexion';
import styles from '../connexion.module.css';

export default function CodeConnexion() {
  const router = useRouter();
  const params = useSearchParams();
  const [facteur, setFacteur] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/connexion'); return; }
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = data?.totp?.find((f) => f.status === 'verified');
      // Sans facteur vérifié, il n'y a pas de code à demander.
      if (!totp) { router.replace(destinationSure(params.get('suite'))); return; }
      setFacteur(totp.id);
    })();
  }, [router, params]);

  async function verifier(e: React.FormEvent) {
    e.preventDefault();
    if (!facteur) return;
    setErreur(null);
    setEnCours(true);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: facteur, code: code.replace(/\s/g, ''),
    });
    if (error) {
      setErreur('Code incorrect ou expiré. Saisissez le code affiché maintenant.');
      setEnCours(false);
      return;
    }
    await supabase.rpc('journaliser', {
      p_action: 'connexion', p_table: null, p_id: null,
      p_details: { double_authentification: true },
    });
    router.push(destinationSure(params.get('suite')));
    router.refresh();
  }

  async function changerDeCompte() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/connexion');
  }

  return (
    <form onSubmit={verifier} className={styles.form}>
      <label className={styles.champ}>
        <span>Code de vérification</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          autoFocus
          placeholder="123 456"
        />
      </label>

      {erreur && <p className={styles.erreur}>{erreur}</p>}

      <button type="submit" className="btn btn--primary" disabled={enCours || !facteur}>
        {enCours ? 'Vérification…' : 'Valider'}
      </button>
      <button type="button" className="btn btn--ghost" onClick={changerDeCompte}>
        Se connecter avec un autre compte
      </button>
    </form>
  );
}
