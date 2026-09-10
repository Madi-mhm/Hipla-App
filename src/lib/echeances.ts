/**
 * Types et filtre de l'échéancier, lisibles côté serveur comme client.
 */

export type Echeance = {
  source: string; id: string; echeance: string;
  libelle: string; detail: string;
  montant: number | null; nature: string;
  accomplie: boolean; accomplie_le: string | null;
  lien: string | null;
};

export type Groupes = {
  en_retard: Echeance[]; ce_mois: Echeance[];
  a_venir: Echeance[]; accomplies: Echeance[];
  compteurs: { en_retard: number; ce_mois: number };
};

/**
 * Retire les échéances d'abonnement et de contrat. Ces deux modules ont
 * été supprimés : leurs lignes restent en base, mais ne doivent plus
 * annoncer de prélèvements ni de factures que personne n'attend.
 */
export function sansRecurrences(g: Groupes): Groupes {
  const garder = (e: Echeance) =>
    e.source !== 'abonnement' && e.nature !== 'abonnement' && e.source !== 'contrat';
  const en_retard = (g.en_retard ?? []).filter(garder);
  const ce_mois = (g.ce_mois ?? []).filter(garder);
  return {
    en_retard,
    ce_mois,
    a_venir: (g.a_venir ?? []).filter(garder),
    accomplies: (g.accomplies ?? []).filter(garder),
    compteurs: { en_retard: en_retard.length, ce_mois: ce_mois.length },
  };
}
