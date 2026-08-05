'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './connexion.module.css';

export default function ForumConnexion() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: motDePasse,
    });

    if (error) {
      // Message volontairement générique : ne pas révéler si l'email existe.
      setErreur('Identifiants incorrects.');
      setEnCours(false);
      return;
    }

    await supabase.rpc('journaliser', {
      p_action: 'connexion',
      p_table: null,
      p_id: null,
      p_details: null,
    });

    router.push(params.get('suite') ?? '/');
    router.refresh();
  }

  return (
    <form onSubmit={soumettre} className={styles.form}>
      <label className={styles.champ}>
        <span>Adresse e-mail</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          autoFocus
        />
      </label>

      <label className={styles.champ}>
        <span>Mot de passe</span>
        <input
          type="password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          required
          autoComplete="current-password"
        />
      </label>

      {erreur && <p className={styles.erreur}>{erreur}</p>}

      <button type="submit" className="btn btn--primary" disabled={enCours}>
        {enCours ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}
