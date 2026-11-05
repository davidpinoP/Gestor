-- =====================================================================
-- WEALTH OS — Migración 0001: núcleo financiero (Fase 1)
-- Importes SIEMPRE en céntimos (bigint) para exactitud. Moneda: EUR.
-- Todas las tablas con RLS: cada usuario sólo ve y modifica sus datos.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tipos ----------
create type public.scope_t          as enum ('personal', 'business');
create type public.tx_kind          as enum ('income', 'expense', 'transfer');
create type public.flow_kind        as enum ('income', 'expense');
create type public.tx_status        as enum ('paid', 'pending');
create type public.deductible_t     as enum ('no', 'yes', 'pending_validation');
create type public.account_type     as enum ('checking', 'savings', 'cash', 'investment', 'credit_card', 'loan', 'other_asset', 'other_liability');
create type public.account_purpose  as enum ('operating', 'reserve', 'emergency', 'tax', 'investment', 'debt');
create type public.planned_status   as enum ('planned', 'reserved', 'paid', 'cancelled');
create type public.priority_t       as enum ('high', 'medium', 'low');
create type public.certainty_t      as enum ('exact', 'estimated', 'approximate');
create type public.recurrence_t     as enum ('none', 'weekly', 'monthly', 'quarterly', 'yearly');
create type public.payment_method_t as enum ('card', 'transfer', 'cash', 'direct_debit', 'bizum', 'paypal', 'other');
create type public.tx_source        as enum ('manual', 'natural_language', 'planned', 'import', 'bank');

-- ---------- Utilidades ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- Perfil ----------
create table public.profiles (
  id                          uuid primary key references auth.users (id) on delete cascade,
  display_name                text,
  currency                    char(3) not null default 'EUR',
  timezone                    text not null default 'Europe/Madrid',
  min_liquidity_buffer_cents  bigint not null default 50000 check (min_liquidity_buffer_cents >= 0),
  emergency_fund_months       smallint not null default 6 check (emergency_fund_months between 0 and 36),
  monthly_income_target_cents bigint not null default 1000000 check (monthly_income_target_cents >= 0),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- ---------- Negocios ----------
create table public.businesses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 80),
  color       text not null default '#C8A96A',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);
create index on public.businesses (user_id);

-- ---------- Cuentas ----------
-- Convención de signo: el saldo es "valor para el patrimonio".
-- Activos (corriente, ahorro, efectivo, inversión) => saldo positivo.
-- Pasivos (tarjeta de crédito, préstamo) => saldo negativo (lo que se debe).
-- opening_balance_cents = saldo al INICIO de opening_date. Los movimientos
-- anteriores a opening_date son históricos y no alteran el saldo.
create table public.accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                  text not null check (length(trim(name)) between 1 and 80),
  type                  public.account_type not null,
  purpose               public.account_purpose not null default 'operating',
  scope                 public.scope_t not null default 'personal',
  business_id           uuid references public.businesses (id) on delete restrict,
  institution           text,
  opening_balance_cents bigint not null default 0 check (abs(opening_balance_cents) < 100000000000),
  opening_date          date not null default (now() at time zone 'Europe/Madrid')::date,
  include_in_net_worth  boolean not null default true,
  archived              boolean not null default false,
  sort_order            int not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint accounts_business_scope check ((scope = 'business') = (business_id is not null))
);
create index on public.accounts (user_id);

-- ---------- Categorías (2 niveles: categoría y subcategoría) ----------
create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scope         public.scope_t not null,
  kind          public.flow_kind not null,
  name          text not null check (length(trim(name)) between 1 and 60),
  parent_id     uuid references public.categories (id) on delete restrict,
  is_essential  boolean not null default true,  -- false = gasto discrecional (candidato a recorte)
  archived      boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  unique nulls not distinct (user_id, scope, kind, parent_id, name)
);
create index on public.categories (user_id);

-- ---------- Previsiones (calendario de gastos/ingresos futuros) ----------
create table public.planned_items (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind                public.flow_kind not null default 'expense',
  name                text not null check (length(trim(name)) between 1 and 120),
  amount_cents        bigint not null check (amount_cents > 0 and amount_cents < 100000000000),
  expected_date       date not null,
  due_date            date,
  category_id         uuid references public.categories (id) on delete set null,
  scope               public.scope_t not null default 'personal',
  business_id         uuid references public.businesses (id) on delete set null,
  account_id          uuid references public.accounts (id) on delete set null,
  priority            public.priority_t not null default 'medium',
  status              public.planned_status not null default 'planned',
  is_mandatory        boolean not null default true,
  certainty           public.certainty_t not null default 'estimated',
  recurrence          public.recurrence_t not null default 'none',
  recurrence_end      date,
  notes               text check (length(notes) <= 2000),
  paid_transaction_id uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint planned_due_after check (due_date is null or due_date >= expected_date),
  constraint planned_business_scope check (business_id is null or scope = 'business')
);
create index on public.planned_items (user_id, expected_date) where deleted_at is null;

-- ---------- Movimientos ----------
create table public.transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind              public.tx_kind not null,
  status            public.tx_status not null default 'paid',
  date              date not null,
  amount_cents      bigint not null check (amount_cents > 0 and amount_cents < 100000000000),
  account_id        uuid not null references public.accounts (id) on delete restrict,
  to_account_id     uuid references public.accounts (id) on delete restrict,
  category_id       uuid references public.categories (id) on delete set null,
  scope             public.scope_t not null default 'personal',
  business_id       uuid references public.businesses (id) on delete set null,
  payment_method    public.payment_method_t,
  description       text check (length(description) <= 500),
  tags              text[] not null default '{}',
  is_recurring      boolean not null default false,
  is_extraordinary  boolean not null default false,
  tax_deductible    public.deductible_t not null default 'no',
  planned_item_id   uuid references public.planned_items (id) on delete set null,
  source            public.tx_source not null default 'manual',
  external_id       text,  -- futuro: id del proveedor Open Banking (deduplicación)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint tx_transfer_shape check (
    (kind = 'transfer' and to_account_id is not null and to_account_id <> account_id and category_id is null)
    or (kind <> 'transfer' and to_account_id is null)
  ),
  constraint tx_business_scope check (business_id is null or scope = 'business'),
  constraint tx_recurring_vs_extra check (not (is_recurring and is_extraordinary))
);
create index on public.transactions (user_id, date desc) where deleted_at is null;
create index on public.transactions (account_id) where deleted_at is null;
create index on public.transactions (to_account_id) where deleted_at is null;
create unique index transactions_external_uq on public.transactions (user_id, external_id) where external_id is not null;

alter table public.planned_items
  add constraint planned_paid_tx_fk foreign key (paid_transaction_id) references public.transactions (id) on delete set null;

-- ---------- Historial de cambios ----------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  table_name  text not null,
  record_id   uuid not null,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data    jsonb,
  new_data    jsonb,
  at          timestamptz not null default now()
);
create index on public.audit_log (user_id, at desc);

-- =====================================================================
-- Integridad: las claves foráneas NO pasan por RLS, así que validamos
-- explícitamente que cada referencia pertenece al mismo usuario.
-- =====================================================================
create or replace function public.owns(tbl text, rid uuid, uid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare ok boolean;
begin
  if rid is null then return true; end if;
  execute format('select exists(select 1 from public.%I where id = $1 and user_id = $2)', tbl)
    into ok using rid, uid;
  return ok;
end $$;
revoke all on function public.owns(text, uuid, uuid) from public, anon, authenticated;

create or replace function public.check_account_refs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.owns('businesses', new.business_id, new.user_id) then
    raise exception 'Negocio no válido' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.check_category_refs() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if new.parent_id is not null then
    select * into p from public.categories where id = new.parent_id and user_id = new.user_id;
    if not found then raise exception 'Categoría padre no válida' using errcode = '42501'; end if;
    if p.parent_id is not null then raise exception 'Sólo se permiten dos niveles de categoría'; end if;
    if p.kind <> new.kind or p.scope <> new.scope then
      raise exception 'La subcategoría debe tener el mismo tipo y ámbito que su categoría';
    end if;
  end if;
  return new;
end $$;

create or replace function public.check_flow_refs() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record; flow text;
begin
  if not public.owns('accounts', new.account_id, new.user_id)
     or not public.owns('businesses', new.business_id, new.user_id)
     or not public.owns('categories', new.category_id, new.user_id) then
    raise exception 'Referencia no válida (cuenta, negocio o categoría)' using errcode = '42501';
  end if;
  if tg_table_name = 'transactions' then
    if not public.owns('accounts', new.to_account_id, new.user_id)
       or not public.owns('planned_items', new.planned_item_id, new.user_id) then
      raise exception 'Referencia no válida (cuenta destino o previsión)' using errcode = '42501';
    end if;
  end if;
  flow := new.kind::text;
  if new.category_id is not null then
    select kind::text as kind into c from public.categories where id = new.category_id;
    if c.kind <> flow then
      raise exception 'La categoría no corresponde al tipo de movimiento (%)', flow;
    end if;
  end if;
  return new;
end $$;

create trigger accounts_refs   before insert or update on public.accounts      for each row execute function public.check_account_refs();
create trigger categories_refs before insert or update on public.categories    for each row execute function public.check_category_refs();
create trigger tx_refs         before insert or update on public.transactions  for each row execute function public.check_flow_refs();
create trigger planned_refs    before insert or update on public.planned_items for each row execute function public.check_flow_refs();

create trigger profiles_updated   before update on public.profiles      for each row execute function public.set_updated_at();
create trigger businesses_updated before update on public.businesses    for each row execute function public.set_updated_at();
create trigger accounts_updated   before update on public.accounts      for each row execute function public.set_updated_at();
create trigger tx_updated         before update on public.transactions  for each row execute function public.set_updated_at();
create trigger planned_updated    before update on public.planned_items for each row execute function public.set_updated_at();

-- ---------- Auditoría ----------
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (user_id, table_name, record_id, action, old_data, new_data)
  values (
    coalesce(new.user_id, old.user_id),
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger tx_audit       after insert or update or delete on public.transactions  for each row execute function public.audit_row();
create trigger planned_audit  after insert or update or delete on public.planned_items for each row execute function public.audit_row();
create trigger accounts_audit after insert or update or delete on public.accounts      for each row execute function public.audit_row();

-- =====================================================================
-- Saldos: calculados en la base de datos a partir de movimientos pagados.
-- security_invoker => respeta RLS del usuario que consulta.
-- =====================================================================
create view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.opening_balance_cents + coalesce(sum(
    case
      when t.kind = 'income'   and t.account_id = a.id    then  t.amount_cents
      when t.kind = 'expense'  and t.account_id = a.id    then -t.amount_cents
      when t.kind = 'transfer' and t.account_id = a.id    then -t.amount_cents
      when t.kind = 'transfer' and t.to_account_id = a.id then  t.amount_cents
      else 0
    end), 0)::bigint as balance_cents
from public.accounts a
left join public.transactions t
  on (t.account_id = a.id or t.to_account_id = a.id)
 and t.status = 'paid'
 and t.deleted_at is null
 and t.date >= a.opening_date
group by a.id;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.profiles      enable row level security;
alter table public.businesses    enable row level security;
alter table public.accounts      enable row level security;
alter table public.categories    enable row level security;
alter table public.planned_items enable row level security;
alter table public.transactions  enable row level security;
alter table public.audit_log     enable row level security;

create policy profiles_own on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['businesses', 'accounts', 'categories', 'planned_items', 'transactions'] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_own', t);
  end loop;
end $$;

-- El historial es de sólo lectura para el usuario (lo escriben los triggers).
create policy audit_read_own on public.audit_log for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.audit_log from anon;
revoke insert, update, delete on public.audit_log from authenticated;

-- =====================================================================
-- Alta de usuario: perfil + datos iniciales (categorías, KYZ, efectivo)
-- =====================================================================
create or replace function public.seed_user(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  n text; i int;
  personal_exp text[] := array['Alimentación','Transporte','Vivienda','Restaurantes','Ocio','Ropa','Gimnasio','Suscripciones','Viajes','Multas','Salud','Imprevistos','Otros'];
  personal_discretionary text[] := array['Restaurantes','Ocio','Ropa','Suscripciones','Viajes'];
  business_exp text[] := array['Marketing','Publicidad','Producción','Packaging','Logística','Personal','Software','Servicios profesionales','Impuestos','Viajes comerciales','Formación','Otros'];
  personal_inc text[] := array['Nómina','Retribución de negocio','Facturación freelance','Intereses y dividendos','Reembolsos','Venta de bienes','Otros ingresos'];
  business_inc text[] := array['Ventas','Servicios','Subvenciones','Otros ingresos'];
begin
  insert into public.profiles (id) values (uid) on conflict do nothing;

  insert into public.businesses (user_id, name) values (uid, 'KYZ') on conflict do nothing;

  for i in 1 .. array_length(personal_exp, 1) loop
    n := personal_exp[i];
    insert into public.categories (user_id, scope, kind, name, is_essential, sort_order)
    values (uid, 'personal', 'expense', n, not (n = any (personal_discretionary)), i) on conflict do nothing;
  end loop;
  for i in 1 .. array_length(business_exp, 1) loop
    insert into public.categories (user_id, scope, kind, name, sort_order)
    values (uid, 'business', 'expense', business_exp[i], i) on conflict do nothing;
  end loop;
  for i in 1 .. array_length(personal_inc, 1) loop
    insert into public.categories (user_id, scope, kind, name, sort_order)
    values (uid, 'personal', 'income', personal_inc[i], i) on conflict do nothing;
  end loop;
  for i in 1 .. array_length(business_inc, 1) loop
    insert into public.categories (user_id, scope, kind, name, sort_order)
    values (uid, 'business', 'income', business_inc[i], i) on conflict do nothing;
  end loop;

  -- Subcategorías útiles por defecto
  insert into public.categories (user_id, scope, kind, name, parent_id, is_essential)
  select uid, 'personal', 'expense', s.name, c.id, c.is_essential
  from public.categories c
  join (values ('Transporte','Combustible'), ('Transporte','Parking y peajes'), ('Transporte','Seguro del coche'),
               ('Vivienda','Alquiler/Hipoteca'), ('Vivienda','Suministros'), ('Alimentación','Supermercado')) as s(parent, name)
    on c.name = s.parent
  where c.user_id = uid and c.scope = 'personal' and c.kind = 'expense' and c.parent_id is null
  on conflict do nothing;

  insert into public.accounts (user_id, name, type, purpose, scope)
  select uid, 'Efectivo', 'cash', 'operating', 'personal'
  where not exists (select 1 from public.accounts where user_id = uid);
end $$;
revoke all on function public.seed_user(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_user(new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Liquidar una previsión (atómico): crea el movimiento real, cierra la
-- previsión y genera la siguiente si es recurrente. security invoker => RLS.
-- =====================================================================
create or replace function public.settle_planned(
  p_id uuid, p_amount_cents bigint, p_date date, p_account_id uuid, p_payment_method public.payment_method_t default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  it public.planned_items;
  tx_id uuid;
  nxt date;
  anchor int;
  step interval;
begin
  select * into it from public.planned_items where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Previsión no encontrada' using errcode = 'P0002'; end if;
  if it.status in ('paid', 'cancelled') then raise exception 'Esta previsión ya está cerrada'; end if;

  insert into public.transactions (user_id, kind, status, date, amount_cents, account_id, category_id, scope, business_id,
                                   payment_method, description, is_recurring, planned_item_id, source)
  values (it.user_id, it.kind::text::public.tx_kind, 'paid', p_date, p_amount_cents, p_account_id, it.category_id, it.scope, it.business_id,
          p_payment_method, it.name, it.recurrence <> 'none', it.id, 'planned')
  returning id into tx_id;

  update public.planned_items set status = 'paid', paid_transaction_id = tx_id where id = it.id;

  if it.recurrence <> 'none' then
    anchor := extract(day from it.expected_date);
    if it.recurrence = 'weekly' then
      nxt := it.expected_date + 7;
    else
      step := case it.recurrence when 'monthly' then interval '1 month' when 'quarterly' then interval '3 months' else interval '12 months' end;
      nxt := (date_trunc('month', it.expected_date) + step)::date;
      -- conserva el día original sin pasarse del fin de mes (31 → 28/30)
      nxt := nxt + (least(anchor, extract(day from (nxt + interval '1 month' - interval '1 day'))::int) - 1);
    end if;
    if it.recurrence_end is null or nxt <= it.recurrence_end then
      insert into public.planned_items (user_id, kind, name, amount_cents, expected_date, due_date, category_id, scope, business_id,
                                        account_id, priority, status, is_mandatory, certainty, recurrence, recurrence_end, notes)
      values (it.user_id, it.kind, it.name, it.amount_cents, nxt,
              case when it.due_date is null then null else it.due_date + (nxt - it.expected_date) end,
              it.category_id, it.scope, it.business_id, it.account_id, it.priority, 'planned', it.is_mandatory, it.certainty,
              it.recurrence, it.recurrence_end, it.notes);
    end if;
  end if;
  return tx_id;
end $$;
revoke all on function public.settle_planned(uuid, bigint, date, uuid, public.payment_method_t) from public, anon;
grant execute on function public.settle_planned(uuid, bigint, date, uuid, public.payment_method_t) to authenticated;
