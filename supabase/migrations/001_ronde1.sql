-- ============================================================
-- HIPLA GESTION — RONDE 1
-- Utilisateurs, rôles, permissions, journal d'audit, entreprise.
--
-- À exécuter dans Supabase : SQL Editor → New query → coller → Run.
-- Le script est idempotent : il peut être relancé sans dommage.
-- ============================================================

-- ------------------------------------------------------------
-- 1. RÔLES
-- ------------------------------------------------------------
create type role_utilisateur as enum (
  'proprietaire',   -- Mahdi : tout, y compris validation et gestion des accès
  'contributeur',   -- Sabir : lecture totale + saisie de dépenses à valider
  'comptable',      -- futur : lecture totale + exports, aucune écriture comptable
  'salarie'         -- futur, module 2 : uniquement son espace personnel
);

-- ------------------------------------------------------------
-- 2. PROFILS
-- Étend auth.users de Supabase avec le rôle et les données métier.
-- ------------------------------------------------------------
create table if not exists public.profils (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  nom_complet text not null,
  role        role_utilisateur not null default 'contributeur',
  actif       boolean not null default true,
  cree_le     timestamptz not null default now(),
  modifie_le  timestamptz not null default now()
);

comment on table public.profils is
  'Profil applicatif lié à un compte auth.users. Le rôle porte les permissions.';

-- Création automatique du profil à l''inscription
create or replace function public.creer_profil()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profils (id, email, nom_complet, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nom_complet', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::role_utilisateur, 'contributeur')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_creer_profil on auth.users;
create trigger trg_creer_profil
  after insert on auth.users
  for each row execute function public.creer_profil();

-- ------------------------------------------------------------
-- 3. PERMISSIONS
-- Modèle (rôle, module, action). Une ligne = un droit accordé.
-- Ajouter un rôle ou un module = insérer des lignes, pas réécrire du code.
-- ------------------------------------------------------------
create table if not exists public.permissions (
  role    role_utilisateur not null,
  module  text not null,
  action  text not null,
  primary key (role, module, action)
);

comment on column public.permissions.action is
  'read | create | update | delete | validate | export | admin';

insert into public.permissions (role, module, action) values
  -- ---- PROPRIÉTAIRE : tout ----
  ('proprietaire','entreprise','read'),   ('proprietaire','entreprise','update'),
  ('proprietaire','utilisateurs','read'), ('proprietaire','utilisateurs','create'),
  ('proprietaire','utilisateurs','update'),('proprietaire','utilisateurs','delete'),
  ('proprietaire','depenses','read'),     ('proprietaire','depenses','create'),
  ('proprietaire','depenses','update'),   ('proprietaire','depenses','delete'),
  ('proprietaire','depenses','validate'),
  ('proprietaire','ventes','read'),       ('proprietaire','ventes','create'),
  ('proprietaire','ventes','update'),     ('proprietaire','ventes','delete'),
  ('proprietaire','ventes','validate'),
  ('proprietaire','abonnements','read'),  ('proprietaire','abonnements','create'),
  ('proprietaire','abonnements','update'),('proprietaire','abonnements','delete'),
  ('proprietaire','banque','read'),       ('proprietaire','banque','update'),
  ('proprietaire','tva','read'),          ('proprietaire','tva','validate'),
  ('proprietaire','echeances','read'),    ('proprietaire','echeances','update'),
  ('proprietaire','documents','read'),    ('proprietaire','documents','create'),
  ('proprietaire','documents','delete'),
  ('proprietaire','exports','read'),      ('proprietaire','exports','export'),
  ('proprietaire','audit','read'),

  -- ---- CONTRIBUTEUR (Sabir) ----
  -- Lecture partout, mais création limitée aux dépenses et documents.
  -- Aucune validation : ses saisies passent en attente.
  ('contributeur','entreprise','read'),
  ('contributeur','depenses','read'),     ('contributeur','depenses','create'),
  ('contributeur','ventes','read'),
  ('contributeur','abonnements','read'),
  ('contributeur','banque','read'),
  ('contributeur','tva','read'),
  ('contributeur','echeances','read'),
  ('contributeur','documents','read'),    ('contributeur','documents','create'),
  ('contributeur','exports','read'),

  -- ---- COMPTABLE (futur) ----
  ('comptable','entreprise','read'),
  ('comptable','depenses','read'),
  ('comptable','ventes','read'),
  ('comptable','abonnements','read'),
  ('comptable','banque','read'),
  ('comptable','tva','read'),
  ('comptable','echeances','read'),
  ('comptable','documents','read'),
  ('comptable','exports','read'),         ('comptable','exports','export')
on conflict do nothing;

-- Fonction utilitaire : le rôle courant a-t-il ce droit ?
create or replace function public.a_permission(p_module text, p_action text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.permissions p
    join public.profils u on u.role = p.role
    where u.id = auth.uid()
      and u.actif = true
      and p.module = p_module
      and p.action = p_action
  );
$$;

create or replace function public.role_courant()
returns role_utilisateur
language sql
stable
security definer set search_path = public
as $$
  select role from public.profils where id = auth.uid() and actif = true;
$$;

-- ------------------------------------------------------------
-- 4. ENTREPRISE
-- Une seule ligne. Données issues de l''extrait Kbis du 29/07/2026.
-- ------------------------------------------------------------
create table if not exists public.entreprise (
  id                uuid primary key default gen_random_uuid(),
  raison_sociale    text not null,
  forme_juridique   text not null,
  capital           numeric(12,2) not null,
  siren             text not null,
  siret             text not null,
  rcs               text,
  tva_intracom      text,
  code_ape          text,
  adresse           text not null,
  code_postal       text not null,
  ville             text not null,
  president         text not null,
  directeur_general text,
  email             text,
  telephone         text,
  modifie_le        timestamptz not null default now(),
  modifie_par       uuid references public.profils(id)
);

insert into public.entreprise (
  raison_sociale, forme_juridique, capital, siren, siret, rcs, tva_intracom,
  code_ape, adresse, code_postal, ville, president, directeur_general,
  email, telephone
)
select
  'Hipla Services','SAS',400.00,'108105875','10810587500018',
  'RCS Chambéry 108 105 875','FR77108105875','8121Z',
  '270 Rue du Maconnais','73000','Chambéry',
  'Mahdi Mohamadi','Sabir Mohamed Ahmed',
  'contact@hipla.fr','07 58 98 87 11'
where not exists (select 1 from public.entreprise);

-- ------------------------------------------------------------
-- 5. EXERCICES
-- ------------------------------------------------------------
create table if not exists public.exercices (
  id          uuid primary key default gen_random_uuid(),
  date_debut  date not null,
  date_fin    date not null,
  statut      text not null default 'ouvert' check (statut in ('ouvert','clos')),
  regime_tva  text not null check (regime_tva in ('simplifie','reel_normal')),
  cree_le     timestamptz not null default now()
);

-- Exercice 1 : 14 mois. Le régime simplifié s''applique jusqu''à sa clôture,
-- puis bascule au réel normal (art. 38 LF 2025).
insert into public.exercices (date_debut, date_fin, regime_tva)
select '2026-07-28','2027-09-30','simplifie'
where not exists (select 1 from public.exercices);

insert into public.exercices (date_debut, date_fin, regime_tva)
select '2027-10-01','2028-09-30','reel_normal'
where not exists (select 1 from public.exercices where date_debut = '2027-10-01');

-- ------------------------------------------------------------
-- 6. JOURNAL D'AUDIT
-- Trace de toute écriture. Non modifiable, non supprimable.
-- ------------------------------------------------------------
create table if not exists public.audit (
  id           bigserial primary key,
  utilisateur  uuid references public.profils(id),
  email        text,
  action       text not null,          -- connexion | creation | modification | suppression | validation
  table_cible  text,
  id_cible     text,
  details      jsonb,
  adresse_ip   text,
  horodatage   timestamptz not null default now()
);

create index if not exists idx_audit_horodatage on public.audit (horodatage desc);
create index if not exists idx_audit_utilisateur on public.audit (utilisateur);

create or replace function public.journaliser(
  p_action text,
  p_table text default null,
  p_id text default null,
  p_details jsonb default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.audit (utilisateur, email, action, table_cible, id_cible, details)
  values (
    auth.uid(),
    (select email from public.profils where id = auth.uid()),
    p_action, p_table, p_id, p_details
  );
end;
$$;

-- ------------------------------------------------------------
-- 7. SÉCURITÉ AU NIVEAU DES LIGNES (RLS)
-- Rien n'est accessible sans politique explicite.
-- ------------------------------------------------------------
alter table public.profils     enable row level security;
alter table public.permissions enable row level security;
alter table public.entreprise  enable row level security;
alter table public.exercices   enable row level security;
alter table public.audit       enable row level security;

-- PROFILS
drop policy if exists profils_lecture on public.profils;
create policy profils_lecture on public.profils
  for select using (
    id = auth.uid() or public.a_permission('utilisateurs','read')
  );

drop policy if exists profils_ecriture on public.profils;
create policy profils_ecriture on public.profils
  for update using (public.a_permission('utilisateurs','update'));

-- PERMISSIONS : lisible par tout utilisateur connecté, non modifiable via l'API
drop policy if exists permissions_lecture on public.permissions;
create policy permissions_lecture on public.permissions
  for select using (auth.uid() is not null);

-- ENTREPRISE
drop policy if exists entreprise_lecture on public.entreprise;
create policy entreprise_lecture on public.entreprise
  for select using (public.a_permission('entreprise','read'));

drop policy if exists entreprise_ecriture on public.entreprise;
create policy entreprise_ecriture on public.entreprise
  for update using (public.a_permission('entreprise','update'));

-- EXERCICES
drop policy if exists exercices_lecture on public.exercices;
create policy exercices_lecture on public.exercices
  for select using (public.a_permission('entreprise','read'));

drop policy if exists exercices_ecriture on public.exercices;
create policy exercices_ecriture on public.exercices
  for all using (public.a_permission('entreprise','update'));

-- AUDIT : lecture réservée, écriture par fonction uniquement,
-- aucune modification ni suppression possible — y compris par le propriétaire.
drop policy if exists audit_lecture on public.audit;
create policy audit_lecture on public.audit
  for select using (public.a_permission('audit','read'));

-- ------------------------------------------------------------
-- 8. VÉRIFICATION
-- ------------------------------------------------------------
do $$
begin
  raise notice 'Rôles définis      : %', (select count(*) from pg_enum e
      join pg_type t on t.oid = e.enumtypid where t.typname = 'role_utilisateur');
  raise notice 'Permissions        : %', (select count(*) from public.permissions);
  raise notice 'Entreprise         : %', (select raison_sociale from public.entreprise limit 1);
  raise notice 'Exercices          : %', (select count(*) from public.exercices);
end $$;
