-- Quick-add presets: a saved (amount, category, wallet, note) combo that records
-- in one tap. The recurring-fare case — same BTS ride, same 50 baht, every day.

create table presets (
  id           uuid primary key,
  ledger_id    uuid not null references ledgers on delete cascade,
  label        text not null,
  icon         text,
  kind         text not null check (kind in ('expense', 'income')),
  amount_minor bigint not null,
  category_id  uuid references categories on delete set null,
  wallet_id    uuid references wallets on delete set null,
  note         text,
  sort_order   integer not null default 0,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index presets_by_ledger on presets (ledger_id, sort_order)
  where deleted_at is null;
create index presets_by_cursor on presets (ledger_id, updated_at);

create trigger touch_presets before update on presets
  for each row execute function touch_updated_at();

alter table presets enable row level security;

create policy presets_rw on presets
  for all using (is_ledger_member(ledger_id)) with check (is_ledger_member(ledger_id));
