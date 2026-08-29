-- Two additions that answer "what are my fixed costs, and what am I investing
-- in myself?"

-- ─── Buckets ─────────────────────────────────────────────────────────────────
-- A classification one level above categories: insurance and a phone bill are
-- different categories but the same kind of commitment. Named `bucket` because
-- `group` is reserved in SQL.
--
-- NULL means 'variable' — existing categories keep working untouched.

alter table categories add column bucket text
  check (bucket in ('fixed', 'investment', 'variable'));

comment on column categories.bucket is
  'fixed = ค่าคงที่ที่จ่ายทุกเดือน, investment = ลงทุนกับตัวเอง, '
  'variable/NULL = ผันแปรตามการใช้';

-- ─── Recurring ───────────────────────────────────────────────────────────────
-- A standing commitment: 1,500 on the 5th, every month. The client materialises
-- these into real transactions so every existing chart, filter and total keeps
-- working without knowing recurring exists.
--
-- No `last_generated` column on purpose: generated transactions carry an id
-- derived from (recurring id + month), so re-running is a no-op and two devices
-- generating the same month converge on one row instead of two.

create table recurring (
  id           uuid primary key,
  ledger_id    uuid not null references ledgers on delete cascade,
  label        text,
  icon         text,
  kind         text check (kind in ('expense', 'income')),
  amount_minor bigint,
  category_id  uuid references categories on delete set null,
  wallet_id    uuid references wallets on delete set null,
  note         text,
  -- 1..31, clamped to the last day of shorter months when materialised.
  day_of_month integer check (day_of_month between 1 and 31),
  -- 'YYYY-MM' — nothing is generated before this, so adding a commitment today
  -- doesn't invent a year of history.
  start_month  text,
  payload      text,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index recurring_by_ledger on recurring (ledger_id) where deleted_at is null;
create index recurring_by_cursor on recurring (ledger_id, updated_at);

create trigger touch_recurring before update on recurring
  for each row execute function touch_updated_at();

alter table recurring enable row level security;

create policy recurring_rw on recurring
  for all using (is_ledger_member(ledger_id)) with check (is_ledger_member(ledger_id));
