-- ============================================================
-- 20260910i — ANNULER UN TRAJET VALIDÉ PAR ERREUR
--
-- Un trajet validé n'avait plus d'issue : ni suppression, ni retour en
-- arrière. Il ne restait qu'à le constater — c'est-à-dire à payer une
-- indemnité pour un trajet qui n'a pas eu lieu.
--
-- Un trajet validé justifie une indemnité : on ne l'efface pas, on
-- l'annule avec un motif, qui reste au journal. C'est possible tant
-- qu'aucune indemnité de l'année ne l'a compté — ni celle qui couvre sa
-- date, ni une plus tardive, dont le cumul annuel l'inclut (le barème
-- est progressif). Sinon on annule d'abord l'écriture d'indemnités.
--
-- Aucune donnée n'est modifiée par ce script.
-- ============================================================

create or replace function public.annuler_trajet(p_id uuid, p_motif text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  d       public.deplacements%rowtype;
  v_piece text;
begin
  if auth.uid() is not null and not public.a_permission('depenses','validate') then
    raise exception 'Permission insuffisante';
  end if;

  select * into d from public.deplacements where id = p_id for update;
  if not found then raise exception 'Trajet introuvable'; end if;
  if d.statut = 'annulee' then raise exception 'Ce trajet est déjà annulé'; end if;
  if d.statut <> 'validee' then
    raise exception 'Seul un trajet validé s''annule ; un trajet en attente se rejette.';
  end if;
  if trim(coalesce(p_motif, '')) = '' then
    raise exception 'Un motif d''annulation est obligatoire';
  end if;

  -- Déjà indemnisé : l'écriture d'indemnités couvre sa date.
  select numero_piece into v_piece from public.pieces
  where  nature = 'km' and etat <> 'annulee'
    and  periode_debut <= d.date_trajet and periode_fin >= d.date_trajet
  limit  1;
  if found then
    raise exception
      'Ce trajet est déjà indemnisé par l''écriture %. Annulez d''abord cette '
      'écriture (Dépenses), puis le trajet.', v_piece;
  end if;

  -- Une indemnité constatée plus tard dans l'année l'a compté dans son
  -- cumul : le retirer fausserait sa tranche du barème.
  select numero_piece into v_piece from public.pieces
  where  nature = 'km' and etat <> 'annulee'
    and  periode_fin > d.date_trajet
    and  extract(year from periode_fin) = extract(year from d.date_trajet)
  order  by periode_fin
  limit  1;
  if found then
    raise exception
      'L''écriture %, constatée après ce trajet, l''a compté dans le cumul annuel. '
      'Annulez-la d''abord, puis le trajet.', v_piece;
  end if;

  update public.deplacements
  set    statut = 'annulee', motif_annulation = trim(p_motif),
         annule_le = now(), annule_par = auth.uid()
  where  id = p_id;

  perform public.journaliser(
    'annulation', 'deplacements', p_id::text,
    jsonb_build_object(
      'resume', coalesce(d.numero_piece, 'Trajet') || ' annulé · ' || d.depart || ' → '
                || d.arrivee || ' · ' || public.km_effectifs(d) || ' km',
      'motif', trim(p_motif)));

  return jsonb_build_object('id', p_id, 'statut', 'annulee');
end;
$function$;

revoke execute on function public.annuler_trajet(uuid, text) from public, anon;
grant  execute on function public.annuler_trajet(uuid, text) to authenticated, service_role;
