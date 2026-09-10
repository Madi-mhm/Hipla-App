-- ============================================================
-- 20260910d — EMPREINTES DE CARTE ET FUSION DE TIERS
--
-- 1. Une empreinte de carte (0 €) ou une opération refusée / annulée
--    par la banque n'est pas un mouvement d'argent. Elles restaient
--    « à traiter » pour toujours et encombraient la file de la banque.
--    Un déclencheur les écarte à leur arrivée, quelle que soit la
--    source ; une empreinte devenue une vraie opération redevient à
--    traiter.
--
-- 2. `fusionner_tiers` réunit deux fiches d'un même fournisseur ou
--    client : les pièces, contrats, règles et alias passent sur la fiche
--    conservée, le libellé des pièces suit le nom retenu (un fournisseur,
--    un compte auxiliaire dans le FEC), les champs vides sont complétés,
--    puis la fiche absorbée est supprimée. Rien n'est perdu.
--
-- Aucune donnée n'est modifiée par ce script.
-- ============================================================

create or replace function public.ecarter_empreintes()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if (coalesce(new.montant, 0) = 0 or new.statut_qonto in ('declined', 'reversed'))
     and new.statut_traitement = 'a_traiter' then
    new.statut_traitement := 'ecartee';
    new.motif_ecart := 'Automatique : ' || case
      when new.statut_qonto in ('declined', 'reversed')
        then 'opération refusée ou annulée par la banque'
      else 'empreinte de carte à 0 €, sans mouvement' end;
  -- Une empreinte devenue une vraie opération redevient à traiter.
  elsif new.statut_traitement = 'ecartee'
     and coalesce(new.motif_ecart, '') like 'Automatique : %'
     and coalesce(new.montant, 0) <> 0 and new.statut_qonto = 'completed' then
    new.statut_traitement := 'a_traiter';
    new.motif_ecart := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_ecarter_empreintes on public.transactions_qonto;
create trigger trg_ecarter_empreintes
  before insert or update of montant, statut_qonto on public.transactions_qonto
  for each row execute function public.ecarter_empreintes();

create or replace function public.fusionner_tiers(p_garder uuid, p_absorber uuid, p_nom text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  g        record;
  a        record;
  v_nom    text;
  v_pieces integer;
begin
  if auth.uid() is not null and not public.a_permission('clients','update') then
    raise exception 'Permission insuffisante';
  end if;
  if p_garder = p_absorber then
    raise exception 'Choisissez deux fiches différentes.';
  end if;

  select * into g from public.tiers where id = p_garder;
  if not found then raise exception 'Fiche à conserver introuvable'; end if;
  select * into a from public.tiers where id = p_absorber;
  if not found then raise exception 'Fiche à fusionner introuvable'; end if;

  v_nom := coalesce(nullif(trim(coalesce(p_nom, '')), ''), g.nom);

  update public.pieces set tiers_id = p_garder where tiers_id = p_absorber;
  get diagnostics v_pieces = row_count;

  -- Le libellé recopié sur les pièces forme le compte auxiliaire du FEC :
  -- il suit le nom retenu, pour qu'un fournisseur n'ait qu'un compte.
  update public.pieces set tiers_libelle = v_nom
  where  tiers_id = p_garder and tiers_libelle is distinct from v_nom;

  update public.contrats           set tiers_id = p_garder where tiers_id = p_absorber;
  update public.regles_appariement set tiers_id = p_garder where tiers_id = p_absorber;
  update public.alias_bancaires    set tiers_id = p_garder where tiers_id = p_absorber;

  -- La fiche absorbée disparaît AVANT que la fiche conservée prenne le
  -- nom retenu : les noms sont uniques, et le nom retenu peut être le sien.
  delete from public.tiers where id = p_absorber;

  update public.tiers set
    nom             = v_nom,
    est_client      = g.est_client or a.est_client,
    est_fournisseur = g.est_fournisseur or a.est_fournisseur,
    contact     = coalesce(g.contact, a.contact),
    email       = coalesce(g.email, a.email),
    telephone   = coalesce(g.telephone, a.telephone),
    adresse     = coalesce(g.adresse, a.adresse),
    code_postal = coalesce(g.code_postal, a.code_postal),
    ville       = coalesce(g.ville, a.ville),
    siret       = coalesce(g.siret, a.siret),
    tva_intracom = coalesce(g.tva_intracom, a.tva_intracom),
    numero_tva  = coalesce(g.numero_tva, a.numero_tva, g.tva_intracom, a.tva_intracom),
    pays_code   = case when coalesce(g.pays_code, 'FR') = 'FR' and coalesce(a.pays_code, 'FR') <> 'FR'
                       then a.pays_code else g.pays_code end,
    notes       = nullif(concat_ws(E'\n', g.notes, a.notes), ''),
    modifie_le  = now()
  where id = p_garder;

  perform public.journaliser(
    'fusion', 'tiers', p_garder::text,
    jsonb_build_object('resume', a.nom || ' fusionné dans ' || v_nom,
                       'pieces_reprises', v_pieces, 'fiche_absorbee', p_absorber));

  return jsonb_build_object('id', p_garder, 'nom', v_nom, 'pieces_reprises', v_pieces);
end;
$function$;

revoke execute on function public.fusionner_tiers(uuid, uuid, text) from public, anon;
grant  execute on function public.fusionner_tiers(uuid, uuid, text) to authenticated, service_role;
