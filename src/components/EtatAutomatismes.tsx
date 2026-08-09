import Link from 'next/link';

/**
 * BANDEAU D'ÉTAT DES TRAITEMENTS AUTOMATIQUES
 *
 * Une sauvegarde qui échoue écrit `statut: 'echouee'` dans une table que
 * personne ne regarde. Elle peut échouer six semaines de suite en
 * silence — et l'on ne s'en aperçoit que le jour où l'on en a besoin,
 * c'est-à-dire le pire jour possible.
 *
 * C'est le défaut le plus grave de tout l'échafaudage automatique :
 * un traitement qui échoue sans le dire est pire qu'un traitement
 * absent, parce qu'on compte dessus.
 *
 * Deux signaux, donc : l'échec, et le silence. Une synchronisation qui
 * n'a pas tourné depuis trois jours est aussi inquiétante qu'une
 * synchronisation en erreur — Vercel peut avoir cessé d'appeler le cron
 * sans que rien ne s'en plaigne.
 *
 * Le bandeau vit sur la séance : c'est le seul écran que l'on ouvre
 * chaque semaine.
 */

export type EtatTraitement = {
  statut: string | null;
  quand: string | null;
  erreur: string | null;
};

/** Au-delà de ces délais, l'absence de nouvelle est un signal. */
const TOLERANCE_JOURS = { synchro: 3, sauvegarde: 10 };

function jours(depuis: string | null): number | null {
  if (!depuis) return null;
  const d = new Date(depuis);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function diagnostic(
  nom: string, e: EtatTraitement, tolerance: number,
): { texte: string; grave: boolean } | null {
  const age = jours(e.quand);

  if (e.quand === null) {
    return { texte: `${nom} : aucune trace d'exécution.`, grave: true };
  }
  if (e.statut === 'echouee') {
    return {
      texte: `${nom} : dernier passage en échec`
        + (age !== null ? ` il y a ${age} jour${age > 1 ? 's' : ''}` : '')
        + (e.erreur ? ` — ${e.erreur.slice(0, 120)}` : '.'),
      grave: true,
    };
  }
  if (age !== null && age > tolerance) {
    return {
      texte: `${nom} : rien depuis ${age} jours. Le déclenchement automatique `
        + `ne fonctionne peut-être plus.`,
      grave: false,
    };
  }
  return null;
}

export default function EtatAutomatismes({
  synchro, sauvegarde,
}: {
  synchro: EtatTraitement;
  sauvegarde: EtatTraitement;
}) {
  const points = [
    diagnostic('Synchronisation bancaire', synchro, TOLERANCE_JOURS.synchro),
    diagnostic('Sauvegarde', sauvegarde, TOLERANCE_JOURS.sauvegarde),
  ].filter((p): p is { texte: string; grave: boolean } => p !== null);

  if (points.length === 0) return null;

  const grave = points.some((p) => p.grave);

  return (
    <div className="card" style={{
      marginBottom: '1.25rem',
      borderLeft: `3px solid ${grave ? 'var(--danger)' : 'var(--warning)'}`,
    }} role={grave ? 'alert' : 'status'}>
      <p className="card__title" style={{ color: grave ? 'var(--danger)' : 'var(--warning)' }}>
        {grave ? 'Un traitement automatique a échoué' : 'Un traitement automatique se fait attendre'}
      </p>

      <ul style={{ margin: '.4rem 0 0', paddingLeft: '1.1rem', fontSize: 'var(--fs-sm)', lineHeight: 1.55 }}>
        {points.map((p) => <li key={p.texte}>{p.texte}</li>)}
      </ul>

      <p className="muted" style={{
        fontSize: 'var(--fs-xs)', marginTop: '.7rem', lineHeight: 1.5, maxWidth: '68ch',
      }}>
        Tant qu&apos;une synchronisation ne passe pas, les opérations bancaires
        n&apos;arrivent plus et la séance paraît vide à tort. Tant qu&apos;une
        sauvegarde ne passe pas, les écritures récentes ne sont archivées nulle
        part.
      </p>

      <div style={{ marginTop: '.9rem', display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        <Link href="/banque" className="btn btn--ghost btn--sm">Relancer la synchronisation</Link>
        <Link href="/reglages/supervision" className="btn btn--ghost btn--sm">Supervision</Link>
      </div>
    </div>
  );
}
