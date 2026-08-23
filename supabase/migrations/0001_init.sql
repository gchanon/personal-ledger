-- Personal Ledger — initial schema
-- Multi-tenant from day one: every row belongs to a ledger.

create extension if not exists pgcrypto;

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table ledgers (
  id            uuid primary key,
  name          text not null,
  base_currency char(3) not null default 'THB',
  owner_id      uuid not null references auth.users on delete cascade,
  created_at    timestamptz not null default now()
);

create type member_role as enum ('owner', 'editor', 'viewer');

create table ledger_members (
  ledger_id uuid not null references ledgers on delete cascade,
  user_id   uuid not null references auth.users on delete cascade,
  role      member_role not null default 'editor',
  primary key (ledger_id, user_id)
);

create table wallets (
  id         uuid primary key,
  ledger_id  uuid not null references ledgers on delete cascade,
  name       text not null,
  kind       text not null default 'cash',   -- cash | bank | credit | ewallet
  archived   boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table categories (
  id         uuid primary key,
  ledger_id  uuid not null references ledgers on delete cascade,
  name       text not null,
  kind       text not null check (kind in ('expense', 'income')),
  icon       text,
  parent_id  uuid references categories on delete set null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table transactions (
  id           uuid primary key,                 -- UUIDv7, generated on the client
  ledger_id    uuid not null references ledgers on delete cascade,
  occurred_at  timestamptz not null,
  amount_minor bigint not null,                  -- satang. never float.
  currency     char(3) not null default 'THB',
  kind         text not null check (kind in ('expense', 'income')),
  wallet_id    uuid references wallets on delete set null,
  category_id  uuid references categories on delete set null,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz                       -- tombstone, so deletes sync
);

-- Listing a month, newest first.
create index transactions_by_date on transactions (ledger_id, occurred_at desc)
  where deleted_at is null;

-- Sync cursor: "give me everything changed since X" (tombstones included).
create index transactions_by_cursor on transactions (ledger_id, updated_at);

create index categories_by_ledger on categories (ledger_id) where deleted_at is null;
create index wallets_by_ledger    on wallets    (ledger_id) where deleted_at is null;

-- ─── updated_at bookkeeping ──────────────────────────────────────────────────
-- The sync cursor is only trustworthy if the server owns this column.

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_transactions before update on transactions
  for each row execute function touch_updated_at();
create trigger touch_categories before update on categories
  for each row execute function touch_updated_at();
create trigger touch_wallets before update on wallets
  for each row execute function touch_updated_at();

-- ─── Membership check ────────────────────────────────────────────────────────
-- security definer so it bypasses RLS on ledger_members. Without this, a policy
-- on ledger_members that queries ledger_members recurses infinitely.

create or replace function is_ledger_member(p_ledger_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from ledger_members
    where ledger_id = p_ledger_id and user_id = auth.uid()
  );
$$;

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Tenant isolation lives here, not in application code.

alter table ledgers        enable row level security;
alter table ledger_members enable row level security;
alter table wallets        enable row level security;
alter table categories     enable row level security;
alter table transactions   enable row level security;

create policy ledgers_read on ledgers
  for select using (is_ledger_member(id));
create policy ledgers_write on ledgers
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy members_read on ledger_members
  for select using (is_ledger_member(ledger_id));
create policy members_write on ledger_members
  for all using (exists (select 1 from ledgers l where l.id = ledger_id and l.owner_id = auth.uid()))
  with check (exists (select 1 from ledgers l where l.id = ledger_id and l.owner_id = auth.uid()));

create policy wallets_rw on wallets
  for all using (is_ledger_member(ledger_id)) with check (is_ledger_member(ledger_id));
create policy categories_rw on categories
  for all using (is_ledger_member(ledger_id)) with check (is_ledger_member(ledger_id));
create policy transactions_rw on transactions
  for all using (is_ledger_member(ledger_id)) with check (is_ledger_member(ledger_id));

-- ─── New user bootstrap ──────────────────────────────────────────────────────
-- A signed-in user with no ledger has nowhere to write, so make one eagerly.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_ledger_id uuid := gen_random_uuid();
begin
  insert into ledgers (id, name, owner_id)
    values (new_ledger_id, 'บัญชีของฉัน', new.id);

  insert into ledger_members (ledger_id, user_id, role)
    values (new_ledger_id, new.id, 'owner');

  insert into wallets (id, ledger_id, name, kind) values
    (gen_random_uuid(), new_ledger_id, 'เงินสด', 'cash'),
    (gen_random_uuid(), new_ledger_id, 'ธนาคาร', 'bank');

  insert into categories (id, ledger_id, name, kind, icon) values
    (gen_random_uuid(), new_ledger_id, 'อาหาร',      'expense', '🍜'),
    (gen_random_uuid(), new_ledger_id, 'เดินทาง',    'expense', '🚕'),
    (gen_random_uuid(), new_ledger_id, 'ช้อปปิ้ง',   'expense', '🛍️'),
    (gen_random_uuid(), new_ledger_id, 'ที่พัก',     'expense', '🏠'),
    (gen_random_uuid(), new_ledger_id, 'สุขภาพ',     'expense', '💊'),
    (gen_random_uuid(), new_ledger_id, 'บันเทิง',    'expense', '🎬'),
    (gen_random_uuid(), new_ledger_id, 'อื่นๆ',      'expense', '📦'),
    (gen_random_uuid(), new_ledger_id, 'เงินเดือน',  'income',  '💰'),
    (gen_random_uuid(), new_ledger_id, 'ฟรีแลนซ์',   'income',  '💻'),
    (gen_random_uuid(), new_ledger_id, 'รายได้อื่น', 'income',  '🎁');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
