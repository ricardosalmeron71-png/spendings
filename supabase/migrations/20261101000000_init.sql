-- =====================================================================
--  spendings$$ — esquema inicial
--  Todo vive en el esquema `finanzas`: NO toca las tablas, funciones ni
--  usuarios de otras apps que compartan el mismo proyecto de Supabase.
--  Ejecuta este archivo completo en Supabase → SQL Editor.
-- =====================================================================

create schema if not exists finanzas;
set search_path = finanzas, public;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
do $$ begin
  create type txn_kind as enum ('income', 'expense', 'transfer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_role as enum ('owner', 'admin', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type bill_frequency as enum ('once', 'weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'yearly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_kind as enum ('cash', 'debit', 'credit', 'payroll', 'savings', 'other');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Perfiles (1:1 con auth.users)
-- ---------------------------------------------------------------------
create table if not exists finanzas.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null default '',
  avatar_url    text,
  avatar_emoji  text default '😀',
  avatar_color  text default '#6C5CE7',
  currency      text not null default 'MXN',
  active_group_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists finanzas.push_tokens (
  token       text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text,
  updated_at  timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on finanzas.push_tokens(user_id);

-- ---------------------------------------------------------------------
-- Grupos (familia / casa / roomies)
-- ---------------------------------------------------------------------
create table if not exists finanzas.groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  emoji         text not null default '🏠',
  currency      text not null default 'MXN',
  invite_code   text not null unique default upper(substr(md5(random()::text), 1, 6)),
  owner_id      uuid not null references auth.users(id),
  -- Día de la semana en que se exige el registro de ingresos (0=domingo … 4=jueves)
  income_check_weekday smallint not null default 4 check (income_check_weekday between 0 and 6),
  timezone      text not null default 'America/Mexico_City',
  created_at    timestamptz not null default now()
);

create table if not exists finanzas.group_members (
  group_id    uuid not null references finanzas.groups(id) on delete cascade,
  user_id     uuid not null references finanzas.profiles(id) on delete cascade,
  role        member_role not null default 'member',
  -- Si es false, el miembro no está obligado al registro semanal de ingresos
  requires_weekly_income boolean not null default true,
  joined_at   timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on finanzas.group_members(user_id);

alter table finanzas.profiles
  drop constraint if exists profiles_active_group_fk,
  add constraint profiles_active_group_fk foreign key (active_group_id) references finanzas.groups(id) on delete set null;

-- ---------------------------------------------------------------------
-- Funciones auxiliares de seguridad (evitan recursión en RLS)
-- ---------------------------------------------------------------------
create or replace function finanzas.is_group_member(gid uuid)
returns boolean language sql stable security definer set search_path = finanzas, public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid());
$$;

create or replace function finanzas.is_group_admin(gid uuid)
returns boolean language sql stable security definer set search_path = finanzas, public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid() and role in ('owner','admin'));
$$;

create or replace function finanzas.shares_group_with(other uuid)
returns boolean language sql stable security definer set search_path = finanzas, public as $$
  select exists (
    select 1 from group_members a join group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

-- ---------------------------------------------------------------------
-- Catálogos: categorías y formas de pago
-- ---------------------------------------------------------------------
create table if not exists finanzas.categories (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references finanzas.groups(id) on delete cascade,
  name        text not null,
  kind        txn_kind not null default 'expense',
  type        text not null default 'Otro',        -- "lista tipo": Casa, Servicio, Carro…
  icon        text not null default 'pricetag',     -- nombre de Ionicons
  color       text not null default '#8E8E93',
  is_essential boolean not null default false,      -- necesidad vs deseo (regla 50/30/20)
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (group_id, kind, name)
);
create index if not exists categories_group_idx on finanzas.categories(group_id);

create table if not exists finanzas.payment_methods (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references finanzas.groups(id) on delete cascade,
  owner_id      uuid references auth.users(id) on delete set null,
  name          text not null,                 -- "Nómina Ricardo", "HSBC 2Now", "AMEX"
  kind          payment_kind not null default 'debit',
  institution   text,
  last4         text,
  credit_limit  numeric(14,2),
  cut_day       smallint check (cut_day between 1 and 31),   -- día de corte
  due_day       smallint check (due_day between 1 and 31),   -- día límite de pago
  color         text not null default '#0A84FF',
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists payment_methods_group_idx on finanzas.payment_methods(group_id);

-- ---------------------------------------------------------------------
-- Pagos recurrentes / recibos (calendario)
-- ---------------------------------------------------------------------
create table if not exists finanzas.bills (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references finanzas.groups(id) on delete cascade,
  name              text not null,
  amount            numeric(14,2) not null check (amount >= 0),
  category_id       uuid references finanzas.categories(id) on delete set null,
  payment_method_id uuid references finanzas.payment_methods(id) on delete set null,
  assigned_to       uuid references finanzas.profiles(id) on delete set null,
  frequency         bill_frequency not null default 'monthly',
  next_due_date     date not null,
  cutoff_date       date,
  remind_days_before smallint not null default 3 check (remind_days_before between 0 and 30),
  period_paid       numeric(14,2) not null default 0,   -- abonado en el periodo actual
  autopay           boolean not null default false,
  notes             text,
  active            boolean not null default true,
  created_by        uuid references auth.users(id) default auth.uid(),
  created_at        timestamptz not null default now()
);
create index if not exists bills_group_due_idx on finanzas.bills(group_id, next_due_date);

-- ---------------------------------------------------------------------
-- Movimientos
-- ---------------------------------------------------------------------
create table if not exists finanzas.transactions (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references finanzas.groups(id) on delete cascade,
  user_id           uuid not null references finanzas.profiles(id),     -- "¿Quién?"
  kind              txn_kind not null,
  amount            numeric(14,2) not null check (amount > 0),
  category_id       uuid references finanzas.categories(id) on delete set null,
  payment_method_id uuid references finanzas.payment_methods(id) on delete set null,
  bill_id           uuid references finanzas.bills(id) on delete set null,
  goal_id           uuid,
  description       text not null default '',
  notes             text,
  occurred_on       date not null default current_date,
  tags              text[] not null default '{}',
  -- Importación bancaria
  bank_txn_id       text,
  needs_review      boolean not null default false,
  created_by        uuid references auth.users(id) default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (group_id, bank_txn_id)
);
create index if not exists transactions_group_date_idx on finanzas.transactions(group_id, occurred_on desc);
create index if not exists transactions_user_idx on finanzas.transactions(user_id, occurred_on desc);
create index if not exists transactions_category_idx on finanzas.transactions(category_id);

create table if not exists finanzas.transaction_attachments (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null references finanzas.transactions(id) on delete cascade,
  group_id        uuid not null references finanzas.groups(id) on delete cascade,
  storage_path    text not null,
  width           int,
  height          int,
  created_by      uuid references auth.users(id) default auth.uid(),
  created_at      timestamptz not null default now()
);
create index if not exists attachments_txn_idx on finanzas.transaction_attachments(transaction_id);

-- ---------------------------------------------------------------------
-- Presupuestos, plan mensual y metas de ahorro
-- ---------------------------------------------------------------------
create table if not exists finanzas.budgets (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references finanzas.groups(id) on delete cascade,
  category_id   uuid references finanzas.categories(id) on delete cascade,   -- null = presupuesto total
  amount        numeric(14,2) not null check (amount >= 0),
  alert_percent smallint not null default 80 check (alert_percent between 1 and 100),
  created_at    timestamptz not null default now()
);
create unique index if not exists budgets_unique_cat on finanzas.budgets(group_id, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists finanzas.monthly_plans (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references finanzas.groups(id) on delete cascade,
  month             date not null,                        -- primer día del mes
  expected_income   numeric(14,2) not null default 0,
  savings_target    numeric(14,2) not null default 0,
  needs_pct         smallint not null default 50,
  wants_pct         smallint not null default 30,
  savings_pct       smallint not null default 20,
  notes             text,
  unique (group_id, month)
);

create table if not exists finanzas.savings_goals (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references finanzas.groups(id) on delete cascade,
  name            text not null,
  emoji           text not null default '🎯',
  target_amount   numeric(14,2) not null check (target_amount > 0),
  current_amount  numeric(14,2) not null default 0,
  target_date     date,
  color           text not null default '#34C759',
  completed       boolean not null default false,
  created_at      timestamptz not null default now()
);

alter table finanzas.transactions
  drop constraint if exists transactions_goal_fk,
  add constraint transactions_goal_fk foreign key (goal_id) references finanzas.savings_goals(id) on delete set null;

-- ---------------------------------------------------------------------
-- Registro semanal de ingresos
-- ---------------------------------------------------------------------
create table if not exists finanzas.income_checkins (
  group_id    uuid not null references finanzas.groups(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  week_start  date not null,                -- lunes de la semana
  status      text not null check (status in ('registered', 'no_income')),
  note        text,
  created_at  timestamptz not null default now(),
  primary key (group_id, user_id, week_start)
);

-- ---------------------------------------------------------------------
-- Notificaciones (bandeja + cola de push)
-- ---------------------------------------------------------------------
create table if not exists finanzas.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  group_id    uuid references finanzas.groups(id) on delete cascade,
  type        text not null default 'info',
  title       text not null,
  body        text not null,
  data        jsonb not null default '{}',
  read_at     timestamptz,
  pushed_at   timestamptz,
  dedupe_key  text,
  created_at  timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index if not exists notifications_user_idx on finanzas.notifications(user_id, created_at desc);
create index if not exists notifications_push_queue_idx on finanzas.notifications(created_at) where pushed_at is null;

-- ---------------------------------------------------------------------
-- Asistente IA
-- ---------------------------------------------------------------------
create table if not exists finanzas.assistant_messages (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references finanzas.groups(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists assistant_messages_idx on finanzas.assistant_messages(group_id, user_id, created_at);

-- ---------------------------------------------------------------------
-- Conexión bancaria (Belvo)
-- ---------------------------------------------------------------------
create table if not exists finanzas.bank_connections (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references finanzas.groups(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  provider        text not null default 'belvo',
  link_id         text not null unique,
  institution     text,
  payment_method_id uuid references finanzas.payment_methods(id) on delete set null,
  status          text not null default 'active',
  last_sync_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- =====================================================================
--  Triggers
-- =====================================================================

-- Nuevo usuario → perfil
create or replace function finanzas.handle_new_user()
returns trigger language plpgsql security definer set search_path = finanzas, public as $$
begin
  begin
    insert into profiles (id, full_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
    on conflict (id) do nothing;
  exception when others then
    null; -- nunca bloquear el registro de usuarios de otras apps del proyecto
  end;
  return new;
end $$;

-- Perfil para quien ya existía en el proyecto (usuarios de la app de inglés) o si el trigger no corrió
create or replace function finanzas.ensure_profile()
returns finanzas.profiles language plpgsql security definer set search_path = finanzas, public as $$
declare p profiles; u auth.users;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into u from auth.users where id = auth.uid();
  insert into profiles (id, full_name)
  values (u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)))
  on conflict (id) do nothing;
  select * into p from profiles where id = auth.uid();
  return p;
end $$;

drop trigger if exists finanzas_on_auth_user_created on auth.users;
create trigger finanzas_on_auth_user_created after insert on auth.users
  for each row execute function finanzas.handle_new_user();

-- updated_at
create or replace function finanzas.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists transactions_touch on finanzas.transactions;
create trigger transactions_touch before update on finanzas.transactions
  for each row execute function finanzas.touch_updated_at();
drop trigger if exists profiles_touch on finanzas.profiles;
create trigger profiles_touch before update on finanzas.profiles
  for each row execute function finanzas.touch_updated_at();

-- Categorías por defecto (basadas en tu hoja "lista tipo")
create or replace function finanzas.seed_group_defaults(gid uuid)
returns void language plpgsql security definer set search_path = finanzas, public as $$
begin
  insert into categories (group_id, kind, name, type, icon, color, is_essential) values
    (gid,'expense','Casa mensualidad','Casa','home','#5856D6',true),
    (gid,'expense','Teléfono plan','Servicio','phone-portrait','#007AFF',true),
    (gid,'expense','Luz','Servicio','flash','#FFCC00',true),
    (gid,'expense','Agua','Servicio','water','#32ADE6',true),
    (gid,'expense','Gas','Servicio','flame','#FF9500',true),
    (gid,'expense','Cable / Internet','Servicio','wifi','#5AC8FA',true),
    (gid,'expense','Gasolina','Carro','car','#FF3B30',true),
    (gid,'expense','Carro mensualidad','Carro','car-sport','#C0392B',true),
    (gid,'expense','Reparación / servicio carro','Carro','construct','#A2845E',true),
    (gid,'expense','Supermercado','Comida','cart','#34C759',true),
    (gid,'expense','Comida','Comida','restaurant','#30B0C7',false),
    (gid,'expense','Drink','Comida','beer','#FF9F0A',false),
    (gid,'expense','Netflix','Entretenimiento','tv','#E50914',false),
    (gid,'expense','Spotify','Entretenimiento','musical-notes','#1DB954',false),
    (gid,'expense','Amazon video','Entretenimiento','film','#00A8E1',false),
    (gid,'expense','Corte de cabello','Servicio','cut','#AF52DE',false),
    (gid,'expense','Dentista','Médico','medkit','#FF2D55',true),
    (gid,'expense','Laboratorio','Médico','flask','#FF375F',true),
    (gid,'expense','Ginecóloga','Médico','heart','#FF6482',true),
    (gid,'expense','Pediatra','Médico','happy','#FF8FA3',true),
    (gid,'expense','Ropa','Ropa','shirt','#BF5AF2',false),
    (gid,'expense','Regalo','Ropa','gift','#FF6B6B',false),
    (gid,'expense','Juguete','Compra','game-controller','#FFD60A',false),
    (gid,'expense','Electrodoméstico / aparato','Casa','tv-outline','#8E8E93',false),
    (gid,'expense','Material construcción','Casa','hammer','#A2845E',false),
    (gid,'expense','Bebé','Baby','balloon','#64D2FF',true),
    (gid,'expense','Curso de inglés','Educación','school','#0A84FF',false),
    (gid,'expense','Afore','Otro','trending-up','#30D158',false),
    (gid,'expense','Fonacot','Fonacot','document-text','#636366',true),
    (gid,'expense','Pago tarjeta','Tarjeta','card','#1C1C1E',true),
    (gid,'expense','Coppel','Compra','bag-handle','#FFCC00',false),
    (gid,'expense','Otro','Otros','ellipsis-horizontal','#8E8E93',false),
    (gid,'income','Salario','N/A','briefcase','#34C759',false),
    (gid,'income','SAT (devolución)','N/A','receipt','#30D158',false),
    (gid,'income','Utilidades','N/A','stats-chart','#32D74B',false),
    (gid,'income','Ahorro','N/A','wallet','#66D4CF',false),
    (gid,'income','Aguinaldo','N/A','gift','#FFD60A',false),
    (gid,'income','Freelance / extra','N/A','laptop','#5E5CE6',false),
    (gid,'income','Otro','N/A','ellipsis-horizontal','#8E8E93',false)
  on conflict do nothing;

  insert into payment_methods (group_id, name, kind, color) values
    (gid, 'Efectivo', 'cash', '#34C759')
  on conflict do nothing;
end $$;

-- =====================================================================
--  RPCs
-- =====================================================================

create or replace function finanzas.create_group(p_name text, p_emoji text default '🏠', p_currency text default 'MXN')
returns finanzas.groups language plpgsql security definer set search_path = finanzas, public as $$
declare g groups;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into groups (name, emoji, currency, owner_id) values (p_name, coalesce(p_emoji,'🏠'), coalesce(p_currency,'MXN'), auth.uid())
  returning * into g;
  insert into group_members (group_id, user_id, role) values (g.id, auth.uid(), 'owner');
  perform seed_group_defaults(g.id);
  update profiles set active_group_id = g.id where id = auth.uid();
  return g;
end $$;

create or replace function finanzas.join_group(p_code text)
returns finanzas.groups language plpgsql security definer set search_path = finanzas, public as $$
declare g groups; joiner text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into g from groups where invite_code = upper(trim(p_code));
  if g.id is null then raise exception 'Código de invitación inválido'; end if;
  insert into group_members (group_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  update profiles set active_group_id = g.id where id = auth.uid();
  select full_name into joiner from profiles where id = auth.uid();
  insert into notifications (user_id, group_id, type, title, body)
    select m.user_id, g.id, 'member_joined', '👋 Nuevo miembro', coalesce(joiner,'Alguien') || ' se unió a ' || g.name
    from group_members m where m.group_id = g.id and m.user_id <> auth.uid();
  return g;
end $$;

create or replace function finanzas.regenerate_invite_code(p_group uuid)
returns text language plpgsql security definer set search_path = finanzas, public as $$
declare c text;
begin
  if not is_group_admin(p_group) then raise exception 'forbidden'; end if;
  c := upper(substr(md5(random()::text), 1, 6));
  update groups set invite_code = c where id = p_group;
  return c;
end $$;

create or replace function finanzas.leave_group(p_group uuid)
returns void language plpgsql security definer set search_path = finanzas, public as $$
begin
  delete from group_members where group_id = p_group and user_id = auth.uid();
  update profiles set active_group_id = null where id = auth.uid() and active_group_id = p_group;
end $$;

-- Lunes de la semana para una fecha
create or replace function finanzas.week_start(d date)
returns date language sql immutable as $$ select (d - ((extract(isodow from d)::int) - 1))::date $$;

-- Estado semanal de ingresos por miembro
create or replace function finanzas.weekly_income_status(p_group uuid, p_week date default null)
returns table (user_id uuid, full_name text, avatar_url text, avatar_emoji text, avatar_color text,
               income_total numeric, status text)
language sql stable security definer set search_path = finanzas, public as $$
  with wk as (select week_start(coalesce(p_week, (now() at time zone (select timezone from groups where id = p_group))::date)) as ws)
  select m.user_id, p.full_name, p.avatar_url, p.avatar_emoji, p.avatar_color,
         coalesce(sum(t.amount), 0) as income_total,
         case
           when count(t.id) > 0 then 'registered'
           when max(c.status) = 'no_income' then 'no_income'
           when not m.requires_weekly_income then 'exempt'
           else 'missing'
         end as status
  from group_members m
  cross join wk
  join profiles p on p.id = m.user_id
  left join transactions t on t.group_id = m.group_id and t.user_id = m.user_id and t.kind = 'income'
       and t.occurred_on between wk.ws and wk.ws + 6
  left join income_checkins c on c.group_id = m.group_id and c.user_id = m.user_id and c.week_start = wk.ws
  where m.group_id = p_group and is_group_member(p_group)
  group by m.user_id, p.full_name, p.avatar_url, p.avatar_emoji, p.avatar_color, m.requires_weekly_income;
$$;

-- Registrar pago de un recibo (crea movimiento y avanza fecha si se completó)
create or replace function finanzas.next_bill_date(d date, f bill_frequency)
returns date language sql immutable as $$
  select case f
    when 'weekly' then d + 7
    when 'biweekly' then d + 14
    when 'monthly' then (d + interval '1 month')::date
    when 'bimonthly' then (d + interval '2 month')::date
    when 'quarterly' then (d + interval '3 month')::date
    when 'yearly' then (d + interval '1 year')::date
    else d end;
$$;

create or replace function finanzas.pay_bill(p_bill uuid, p_amount numeric default null, p_date date default current_date,
                                           p_payment_method uuid default null, p_user uuid default null)
returns finanzas.transactions language plpgsql security definer set search_path = finanzas, public as $$
declare b bills; t transactions; amt numeric;
begin
  select * into b from bills where id = p_bill;
  if b.id is null or not is_group_member(b.group_id) then raise exception 'forbidden'; end if;
  amt := coalesce(p_amount, greatest(b.amount - b.period_paid, 0));
  if amt <= 0 then raise exception 'Monto inválido'; end if;

  insert into transactions (group_id, user_id, kind, amount, category_id, payment_method_id, bill_id, description, occurred_on)
  values (b.group_id, coalesce(p_user, auth.uid()), 'expense', amt, b.category_id,
          coalesce(p_payment_method, b.payment_method_id), b.id, b.name, p_date)
  returning * into t;

  if b.period_paid + amt >= b.amount then
    if b.frequency = 'once' then
      update bills set period_paid = 0, active = false where id = b.id;
    else
      update bills set period_paid = 0, next_due_date = next_bill_date(b.next_due_date, b.frequency),
        cutoff_date = case when cutoff_date is null then null else next_bill_date(cutoff_date, b.frequency) end
      where id = b.id;
    end if;
  else
    update bills set period_paid = period_paid + amt where id = b.id;
  end if;
  return t;
end $$;

-- Aportar a meta de ahorro
create or replace function finanzas.contribute_goal(p_goal uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = finanzas, public as $$
declare g savings_goals;
begin
  select * into g from savings_goals where id = p_goal;
  if g.id is null or not is_group_member(g.group_id) then raise exception 'forbidden'; end if;
  update savings_goals set current_amount = current_amount + p_amount,
    completed = (current_amount + p_amount) >= target_amount where id = p_goal;
  if (g.current_amount + p_amount) >= g.target_amount and not g.completed then
    insert into notifications (user_id, group_id, type, title, body)
    select user_id, g.group_id, 'goal_completed', '🎉 ¡Meta alcanzada!', 'Completaron la meta "' || g.name || '"'
    from group_members where group_id = g.group_id;
  end if;
end $$;

-- =====================================================================
--  Notificaciones automáticas
-- =====================================================================

-- Alerta de presupuesto al registrar gastos
create or replace function finanzas.check_budget_after_expense()
returns trigger language plpgsql security definer set search_path = finanzas, public as $$
declare
  b record; spent numeric; pct numeric; m_start date; cat_name text;
begin
  if new.kind <> 'expense' then return new; end if;
  m_start := date_trunc('month', new.occurred_on)::date;
  for b in select * from budgets where group_id = new.group_id
             and (category_id = new.category_id or category_id is null) loop
    select coalesce(sum(amount),0) into spent from transactions
      where group_id = new.group_id and kind = 'expense'
        and occurred_on >= m_start and occurred_on < (m_start + interval '1 month')
        and (b.category_id is null or category_id = b.category_id);
    if b.amount <= 0 then continue; end if;
    pct := spent / b.amount * 100;
    select name into cat_name from categories where id = b.category_id;
    if pct >= 100 then
      insert into notifications (user_id, group_id, type, title, body, data, dedupe_key)
      select user_id, new.group_id, 'budget_exceeded', '🚨 Presupuesto excedido',
             'Se rebasó el presupuesto de ' || coalesce(cat_name, 'gasto total') || ' (' || round(pct) || '%)',
             jsonb_build_object('budget_id', b.id), 'budget100-' || b.id || '-' || m_start
      from group_members where group_id = new.group_id
      on conflict (user_id, dedupe_key) do nothing;
    elsif pct >= b.alert_percent then
      insert into notifications (user_id, group_id, type, title, body, data, dedupe_key)
      select user_id, new.group_id, 'budget_warning', '⚠️ Cuidado con el presupuesto',
             coalesce(cat_name, 'Gasto total') || ' va en ' || round(pct) || '% del presupuesto del mes',
             jsonb_build_object('budget_id', b.id), 'budgetwarn-' || b.id || '-' || m_start
      from group_members where group_id = new.group_id
      on conflict (user_id, dedupe_key) do nothing;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists transactions_budget_check on finanzas.transactions;
create trigger transactions_budget_check after insert on finanzas.transactions
  for each row execute function finanzas.check_budget_after_expense();

-- Aviso al grupo cuando alguien registra un gasto grande o un ingreso
create or replace function finanzas.notify_group_on_txn()
returns trigger language plpgsql security definer set search_path = finanzas, public as $$
declare who text; sym text;
begin
  if new.bank_txn_id is not null then return new; end if;
  select full_name into who from profiles where id = new.user_id;
  if new.kind = 'income' then
    insert into notifications (user_id, group_id, type, title, body, data)
    select user_id, new.group_id, 'income_added', '💰 Ingreso registrado',
           coalesce(who,'Alguien') || ' registró $' || to_char(new.amount, 'FM999,999,990.00') || ' — ' || new.description,
           jsonb_build_object('transaction_id', new.id)
    from group_members where group_id = new.group_id and user_id <> coalesce(auth.uid(), new.user_id);
    -- Marca el check-in semanal
    insert into income_checkins (group_id, user_id, week_start, status)
    values (new.group_id, new.user_id, week_start(new.occurred_on), 'registered')
    on conflict (group_id, user_id, week_start) do update set status = 'registered';
  elsif new.kind = 'expense' and new.amount >= 2000 then
    insert into notifications (user_id, group_id, type, title, body, data)
    select user_id, new.group_id, 'big_expense', '💸 Gasto importante',
           coalesce(who,'Alguien') || ' registró $' || to_char(new.amount, 'FM999,999,990.00') || ' — ' || new.description,
           jsonb_build_object('transaction_id', new.id)
    from group_members where group_id = new.group_id and user_id <> coalesce(auth.uid(), new.user_id);
  end if;
  return new;
end $$;

drop trigger if exists transactions_notify_group on finanzas.transactions;
create trigger transactions_notify_group after insert on finanzas.transactions
  for each row execute function finanzas.notify_group_on_txn();

-- =====================================================================
--  Row Level Security
-- =====================================================================
alter table finanzas.profiles                enable row level security;
alter table finanzas.push_tokens             enable row level security;
alter table finanzas.groups                  enable row level security;
alter table finanzas.group_members           enable row level security;
alter table finanzas.categories              enable row level security;
alter table finanzas.payment_methods         enable row level security;
alter table finanzas.bills                   enable row level security;
alter table finanzas.transactions            enable row level security;
alter table finanzas.transaction_attachments enable row level security;
alter table finanzas.budgets                 enable row level security;
alter table finanzas.monthly_plans           enable row level security;
alter table finanzas.savings_goals           enable row level security;
alter table finanzas.income_checkins         enable row level security;
alter table finanzas.notifications           enable row level security;
alter table finanzas.assistant_messages      enable row level security;
alter table finanzas.bank_connections        enable row level security;

-- profiles
drop policy if exists "profiles read" on finanzas.profiles;
create policy "profiles read" on finanzas.profiles for select
  using (id = auth.uid() or shares_group_with(id));
drop policy if exists "profiles update self" on finanzas.profiles;
create policy "profiles update self" on finanzas.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- push tokens
drop policy if exists "push tokens own" on finanzas.push_tokens;
create policy "push tokens own" on finanzas.push_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- groups
drop policy if exists "groups read" on finanzas.groups;
create policy "groups read" on finanzas.groups for select using (is_group_member(id));
drop policy if exists "groups update admin" on finanzas.groups;
create policy "groups update admin" on finanzas.groups for update using (is_group_admin(id));
drop policy if exists "groups delete owner" on finanzas.groups;
create policy "groups delete owner" on finanzas.groups for delete using (owner_id = auth.uid());

-- group members
drop policy if exists "members read" on finanzas.group_members;
create policy "members read" on finanzas.group_members for select using (is_group_member(group_id));
drop policy if exists "members admin update" on finanzas.group_members;
create policy "members admin update" on finanzas.group_members for update using (is_group_admin(group_id));
drop policy if exists "members admin delete" on finanzas.group_members;
create policy "members admin delete" on finanzas.group_members for delete
  using (is_group_admin(group_id) or user_id = auth.uid());

-- Tablas de grupo: cualquier miembro lee/escribe
do $$
declare t text;
begin
  foreach t in array array['categories','payment_methods','bills','transactions','transaction_attachments',
                           'budgets','monthly_plans','savings_goals','income_checkins','bank_connections']
  loop
    execute format('drop policy if exists "%1$s member all" on finanzas.%1$s', t);
    execute format('create policy "%1$s member all" on finanzas.%1$s for all using (is_group_member(group_id)) with check (is_group_member(group_id))', t);
  end loop;
end $$;

-- notifications: solo las propias
drop policy if exists "notifications own" on finanzas.notifications;
create policy "notifications own" on finanzas.notifications for select using (user_id = auth.uid());
drop policy if exists "notifications own update" on finanzas.notifications;
create policy "notifications own update" on finanzas.notifications for update using (user_id = auth.uid());
drop policy if exists "notifications own delete" on finanzas.notifications;
create policy "notifications own delete" on finanzas.notifications for delete using (user_id = auth.uid());

-- assistant: cada quien su conversación dentro del grupo
drop policy if exists "assistant own" on finanzas.assistant_messages;
create policy "assistant own" on finanzas.assistant_messages for all
  using (user_id = auth.uid() and is_group_member(group_id))
  with check (user_id = auth.uid() and is_group_member(group_id));

-- =====================================================================
--  Storage: evidencias (privado) y avatars (público)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fin_evidence', 'fin_evidence', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fin_avatars', 'fin_avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- evidence/{group_id}/{transaction_id}/{archivo}
drop policy if exists "fin evidence member read" on storage.objects;
create policy "fin evidence member read" on storage.objects for select
  using (bucket_id = 'fin_evidence' and finanzas.is_group_member((storage.foldername(name))[1]::uuid));
drop policy if exists "fin evidence member insert" on storage.objects;
create policy "fin evidence member insert" on storage.objects for insert
  with check (bucket_id = 'fin_evidence' and finanzas.is_group_member((storage.foldername(name))[1]::uuid));
drop policy if exists "fin evidence member delete" on storage.objects;
create policy "fin evidence member delete" on storage.objects for delete
  using (bucket_id = 'fin_evidence' and finanzas.is_group_member((storage.foldername(name))[1]::uuid));

-- avatars/{user_id}/{archivo}
drop policy if exists "fin avatars public read" on storage.objects;
create policy "fin avatars public read" on storage.objects for select using (bucket_id = 'fin_avatars');
drop policy if exists "fin avatars own write" on storage.objects;
create policy "fin avatars own write" on storage.objects for insert
  with check (bucket_id = 'fin_avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "fin avatars own update" on storage.objects;
create policy "fin avatars own update" on storage.objects for update
  using (bucket_id = 'fin_avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "fin avatars own delete" on storage.objects;
create policy "fin avatars own delete" on storage.objects for delete
  using (bucket_id = 'fin_avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
--  Realtime (para que el grupo vea cambios al instante)
-- =====================================================================
do $$ begin
  alter publication supabase_realtime add table finanzas.transactions;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table finanzas.bills;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table finanzas.notifications;
exception when others then null; end $$;


-- ---------------------------------------------------------------------
-- Tope diario de preguntas al asistente (controla el costo de la IA)
-- ---------------------------------------------------------------------
create table if not exists finanzas.assistant_usage (
  user_id uuid not null references finanzas.profiles(id) on delete cascade,
  day     date not null default current_date,
  count   int  not null default 0,
  primary key (user_id, day)
);
alter table finanzas.assistant_usage enable row level security; -- sin políticas: solo lo usa el servidor

create or replace function finanzas.use_assistant_quota(p_user uuid, p_limit int)
returns boolean language plpgsql security definer set search_path = finanzas, public as $$
declare c int;
begin
  insert into assistant_usage as u (user_id, day, count) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set count = u.count + 1 where u.count < p_limit
  returning u.count into c;
  return c is not null;
end $$;

-- =====================================================================
--  Permisos de la API (PostgREST) para el esquema finanzas
--  La seguridad real la imponen las políticas RLS de arriba.
-- =====================================================================
grant usage on schema finanzas to authenticated, service_role;
grant select, insert, update, delete on all tables in schema finanzas to authenticated;
grant all on all tables in schema finanzas to service_role;
revoke execute on all functions in schema finanzas from public, anon;
grant execute on all functions in schema finanzas to authenticated, service_role;
alter default privileges in schema finanzas grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema finanzas grant all on tables to service_role;
alter default privileges in schema finanzas grant execute on functions to authenticated, service_role;

-- Solo el servidor (service_role) puede consumir cuota; ningún usuario puede gastar la de otro
revoke execute on function finanzas.use_assistant_quota(uuid, int) from authenticated;
