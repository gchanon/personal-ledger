-- End-to-end encryption.
--
-- Content moves into an opaque `payload` column; only what the sync protocol and
-- RLS actually need stays readable. The project owner can still see that a row
-- exists and when it changed — that metadata is the documented limit of this
-- design — but not what it says.

-- The wrapped data key. Safe to store: without the user's passphrase it is
-- 600k PBKDF2 iterations from being useful, and the server never sees either.
create table ledger_keys (
  ledger_id  uuid primary key references ledgers on delete cascade,
  salt       text not null,
  iterations integer not null,
  wrapped    text not null,
  created_at timestamptz not null default now()
);

alter table ledger_keys enable row level security;

create policy ledger_keys_rw on ledger_keys
  for all using (is_ledger_member(ledger_id)) with check (is_ledger_member(ledger_id));

-- ─── Ciphertext columns ──────────────────────────────────────────────────────

alter table transactions add column payload text;
alter table categories   add column payload text;
alter table presets      add column payload text;
alter table wallets      add column payload text;

-- The old plaintext columns stay for one migration cycle so existing rows remain
-- readable while the client re-encrypts them, then it writes NULL over them.
alter table transactions
  alter column occurred_at  drop not null,
  alter column amount_minor drop not null,
  alter column currency     drop not null,
  alter column kind         drop not null;

alter table categories
  alter column name drop not null,
  alter column kind drop not null;

alter table presets
  alter column label        drop not null,
  alter column kind         drop not null,
  alter column amount_minor drop not null;

alter table wallets
  alter column name drop not null,
  alter column kind drop not null;

-- Wallets are user content too, so they join the sync set and need a cursor.
-- (touch_wallets already exists from 0001.)
create index wallets_by_cursor on wallets (ledger_id, updated_at);

-- ─── Stop seeding plaintext ──────────────────────────────────────────────────
-- The trigger runs on the server and has no key, so anything it writes would be
-- readable. Defaults are created by the client instead, after the key exists.

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

  return new;
end;
$$;
