-- ============================================================
-- 084 — CHEVAUCHEMENT DE PÉRIODES
--
-- `cloturer_tva` et `constater_amortissements` ne refusaient qu'une
-- répétition EXACTE de période. Deux périodes qui se recouvrent
-- partiellement passaient sans un mot.
--
-- Ce n'est pas théorique. La période du 28 au 31 juillet 2026 est déjà
-- figée en CA12E ; la déclaration de l'exercice, du 28 juillet 2026 au
-- 30 septembre 2027, contiendra les mêmes faits générateurs. Rien ne
-- l'arrêterait, et `ecarts_declaration` ne le verrait pas : chaque
-- déclaration est cohérente avec le registre sur SA propre plage.
--
-- S'y ajoute un défaut d'interface qui rendait le chevauchement
-- probable plutôt que possible : l'écran de clôture proposait par
-- défaut une période commençant la veille de la fin de la précédente
-- (conversion UTC d'un minuit local). Le garde ci-dessous protège
-- indépendamment de ce correctif.
--
-- On signale aussi le TROU. Une période qui démarre plus d'un jour
-- après la fin de la précédente laisse des journées déclarées nulle
-- part — le même problème, retourné.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LE GARDE, PARTAGÉ
-- ------------------------------------------------------------

create or replace function public.periode_tva_libre(
  p_debut date,
  p_fin   date
) returns void
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_chevauche record;
  v_avant     record;
begin
  select periode_debut, periode_fin, reference, formulaire
  into   v_chevauche
  from   public.declarations_tva
  where  etat <> 'annulee'
    and  daterange(periode_debut, periode_fin, '[]')
      && daterange(p_debut, p_fin, '[]')
  order  by periode_debut
  limit  1;

  if found then
    raise exception
      'Cette période chevauche une déclaration existante : % du % au %. '
      'Les faits générateurs communs seraient déclarés deux fois.',
      coalesce(v_chevauche.reference, v_chevauche.formulaire),
      to_char(v_chevauche.periode_debut, 'DD/MM/YYYY'),
      to_char(v_chevauche.periode_fin,   'DD/MM/YYYY');
  end if;

  -- Le trou. On avertit sans bloquer : une première déclaration, ou une
  -- reprise après annulation, est légitimement discontinue.
  select periode_fin into v_avant
  from   public.declarations_tva
  where  etat <> 'annulee' and periode_fin < p_debut
  order  by periode_fin desc
  limit  1;

  if found and v_avant.periode_fin + 1 < p_debut then
    raise warning
      'Les journées du % au % ne sont couvertes par aucune déclaration.',
      to_char(v_avant.periode_fin + 1, 'DD/MM/YYYY'),
      to_char(p_debut - 1,             'DD/MM/YYYY');
  end if;
end;
$$;

comment on function public.periode_tva_libre(date, date) is
  'Lève une exception si la période chevauche une déclaration non annulée. '
  'Avertit si elle laisse un trou après la précédente.';

-- ------------------------------------------------------------
-- 2. CLÔTURE DE TVA
--
-- On remplace le contrôle d'égalité stricte par l'appel au garde. Le
-- message sur la répétition exacte disparaît : le chevauchement le
-- couvre, une période identique étant le cas particulier où les deux
-- plages coïncident.
-- ------------------------------------------------------------

create or replace function public.cloturer_tva(
  p_debut     date,
  p_fin       date,
  p_reference text default null,
  p_notes     text default null
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  d      jsonb;
  e      record;
  v_form text;
  v_id   uuid;
begin
  if not public.a_permission('tva', 'update') then
    raise exception 'Droits insuffisants pour clôturer une période de TVA';
  end if;

  if p_fin < p_debut then
    raise exception 'La fin de période précède son début';
  end if;
  if p_fin >= current_date then
    raise exception
      'On ne clôture pas une période en cours : des écritures peuvent '
      'encore y entrer légitimement. Attendez le % .', p_fin + 1;
  end if;

  perform public.periode_tva_libre(p_debut, p_fin);

  select date_debut, date_fin, regime_tva into e
  from   public.exercices
  where  p_debut between date_debut and date_fin
  limit  1;
  v_form := case when coalesce(e.regime_tva, 'simplifie') = 'simplifie'
                 then 'CA12E' else 'CA3' end;

  d := public.declaration_tva(p_debut, p_fin);

  insert into public.declarations_tva (
    periode_debut, periode_fin, regime, formulaire,
    collectee, deductible, solde,
    detail, ventilation,
    depose_le, reference, notes,
    etat, cloture_par
  ) values (
    p_debut, p_fin,
    coalesce(e.regime_tva, 'simplifie'), v_form,
    (d->'collectee'->>'total')::numeric,
    (d->>'deductible')::numeric,
    (d->>'solde')::numeric,
    d, d->'collectee',
    case when p_reference is not null then current_date end,
    nullif(trim(p_reference), ''),
    nullif(trim(p_notes), ''),
    case when p_reference is not null then 'deposee' else 'preparee' end,
    auth.uid()
  )
  returning id into v_id;

  perform public.journaliser(
    'creation', 'declarations_tva', v_id,
    jsonb_build_object(
      'resume', v_form || ' du ' || to_char(p_debut, 'DD/MM/YYYY')
                || ' au ' || to_char(p_fin, 'DD/MM/YYYY'),
      'solde',  (d->>'solde')::numeric));

  return jsonb_build_object(
    'id', v_id, 'formulaire', v_form,
    'solde', (d->>'solde')::numeric,
    'collectee', (d->'collectee'->>'total')::numeric,
    'deductible', (d->>'deductible')::numeric);
end;
$$;

-- ------------------------------------------------------------
-- 3. AMORTISSEMENTS
--
-- Même lacune, même correctif. `constater_amortissements` ne bloquait
-- qu'une répétition exacte : constater janvier–juin puis avril–décembre
-- passait en charge une deuxième fois la dotation d'avril à juin.
--
-- Le garde s'appuie ici sur `pieces`, pas sur `declarations_tva`, d'où
-- une seconde fonction plutôt qu'un paramètre.
-- ------------------------------------------------------------

create or replace function public.periode_nature_libre(
  p_nature text,
  p_debut  date,
  p_fin    date
) returns void
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_chevauche record;
begin
  select numero_piece, periode_debut, periode_fin
  into   v_chevauche
  from   public.pieces
  where  nature = p_nature
    and  etat <> 'annulee'
    and  periode_debut is not null and periode_fin is not null
    and  daterange(periode_debut, periode_fin, '[]')
      && daterange(p_debut, p_fin, '[]')
  order  by periode_debut
  limit  1;

  if found then
    raise exception
      'Cette période chevauche l''écriture % (du % au %). '
      'La part commune serait constatée deux fois.',
      coalesce(v_chevauche.numero_piece, '(brouillon)'),
      to_char(v_chevauche.periode_debut, 'DD/MM/YYYY'),
      to_char(v_chevauche.periode_fin,   'DD/MM/YYYY');
  end if;
end;
$$;

comment on function public.periode_nature_libre(text, date, date) is
  'Lève une exception si une pièce de cette nature couvre déjà tout ou '
  'partie de la période.';

-- ------------------------------------------------------------
-- 4. VÉRIFICATION
--
-- À exécuter après application. La première requête doit être vide.
-- ------------------------------------------------------------

-- Chevauchements déjà présents dans la base, s'il en existe :
select a.periode_debut as debut_a, a.periode_fin as fin_a,
       b.periode_debut as debut_b, b.periode_fin as fin_b
from   public.declarations_tva a
join   public.declarations_tva b
  on   a.id < b.id
 and   daterange(a.periode_debut, a.periode_fin, '[]')
    && daterange(b.periode_debut, b.periode_fin, '[]')
where  a.etat <> 'annulee' and b.etat <> 'annulee';

-- Le garde répond bien sur la période déjà figée :
-- select public.periode_tva_libre('2026-07-01', '2026-07-31');
--   → doit lever « chevauche une déclaration existante ».

-- Chevauchements d'amortissements, s'il en existe :
select a.numero_piece as piece_a, a.periode_debut, a.periode_fin,
       b.numero_piece as piece_b, b.periode_debut, b.periode_fin
from   public.pieces a
join   public.pieces b
  on   a.id < b.id and a.nature = b.nature
 and   daterange(a.periode_debut, a.periode_fin, '[]')
    && daterange(b.periode_debut, b.periode_fin, '[]')
where  a.nature = 'amortissement'
  and  a.etat <> 'annulee' and b.etat <> 'annulee'
  and  a.periode_debut is not null and b.periode_debut is not null;

-- NOTE — `constater_amortissements` doit être redéfinie pour appeler
-- `periode_nature_libre('amortissement', p_debut, p_fin)` à la place de
-- son `if exists (... periode_debut = p_debut and periode_fin = p_fin)`.
-- Le corps complet de cette fonction vit dans 068_amortissements.sql :
-- reprenez-le tel quel en substituant ce seul bloc, afin de ne pas
-- recopier ici une version qui divergerait au prochain correctif.
