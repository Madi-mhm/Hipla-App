-- ============================================================
-- 20260910e — CORRECTIONS DE DONNÉES (une seule fois)
--
-- Décidées à l'audit du 10/09/2026, appliquées après essai en
-- transaction. Aucune pièce n'est supprimée ; les montants payés ne
-- changent pas.
--
-- 1. Six opérations bancaires sans mouvement d'argent (empreintes de
--    carte à 0 €, un débit Vercel annulé par la banque) sont écartées.
-- 2. Doublons de fournisseurs fusionnés (20 fiches → 15) :
--      Vercel Inc ............................ → Vercel Inc.
--      AREA, AREA Direction Péage ............ → AREA Direction Péage
--      Anthropic ............................. → Anthropic, PBC
--      Ionos ................................. → IONOS SARL
-- 3. Vercel Inc. est une société américaine : pays US. Ses deux
--    dépenses (ABO-2026-0002, ACH-2026-0026) passent en autoliquidation :
--    TVA française de 20 % collectée et déduite sur la même déclaration
--    (art. 283-2 du CGI). Effet net nul, mais la déclaration doit la
--    faire apparaître.
-- ============================================================

-- 1. Empreintes et opérations annulées
update public.transactions_qonto
set    statut_traitement = 'ecartee',
       motif_ecart = 'Automatique : ' || case
         when statut_qonto in ('declined', 'reversed')
           then 'opération refusée ou annulée par la banque'
         else 'empreinte de carte à 0 €, sans mouvement' end
where  statut_traitement = 'a_traiter'
  and  (montant = 0 or statut_qonto in ('declined', 'reversed'));

select public.journaliser('modification', 'transactions_qonto', null,
  jsonb_build_object('resume', 'Empreintes de carte et opérations annulées écartées (audit du 10/09/2026)'));

-- 2. Fusion des doublons
select public.fusionner_tiers('e0274e25-9f05-4b93-a74b-139dcf108e43', '6fea56a7-985f-4d9c-a4f0-c31c52e344ba', 'Vercel Inc.');
-- « AREA Direction Péage » d'abord : la fiche qui porte déjà le nom retenu
-- doit disparaître avant que la fiche conservée ne le prenne.
select public.fusionner_tiers('41ac9010-d4c3-4533-afd2-b8bd66697d04', '122a56b0-6caa-41c4-b379-941dc92ec33d', 'AREA Direction Péage');
select public.fusionner_tiers('41ac9010-d4c3-4533-afd2-b8bd66697d04', '08904d8c-6a90-4253-b455-0c5c365e64dd', 'AREA Direction Péage');
select public.fusionner_tiers('1d2c26ee-b624-4456-b8f0-417efa93432b', '20a507b0-c4d9-467a-948e-35629eaec2b6', 'Anthropic, PBC');
select public.fusionner_tiers('54a8b14e-e231-44ea-a4e9-fa88d950c56d', '9a4a5aab-d181-4817-b663-80c4fd9c58e9', 'IONOS SARL');

-- 3. Vercel : fournisseur hors Union, autoliquidation
update public.tiers
set    pays = 'États-Unis', pays_code = 'US', modifie_le = now()
where  id = 'e0274e25-9f05-4b93-a74b-139dcf108e43';

update public.pieces
set    regime_tva = 'autoliquidation',
       tva_autoliquidee = round(montant_ht * 0.20, 2),
       modifie_le = now()
where  numero_piece in ('ABO-2026-0002', 'ACH-2026-0026')
  and  tiers_id = 'e0274e25-9f05-4b93-a74b-139dcf108e43'
  and  regime_tva = 'exonere';

select public.journaliser('modification', 'pieces', id::text,
  jsonb_build_object('resume', numero_piece || ' : TVA autoliquidée (fournisseur hors Union européenne)',
                     'tva_autoliquidee', tva_autoliquidee))
from   public.pieces where numero_piece in ('ABO-2026-0002', 'ACH-2026-0026');
