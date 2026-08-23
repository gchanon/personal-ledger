import Dexie, { type EntityTable } from "dexie";
import type { Kind } from "@/lib/types";

/**
 * The IndexedDB mirror. Safari evicts this storage after periods of disuse, so
 * treat it as a cache that can vanish at any time — Supabase stays the source of
 * truth. The only rows that are *not* reconstructible are the ones still marked
 * dirty, which is why sync pushes before it pulls.
 */

export type LocalTransaction = {
  id: string;
  ledger_id: string;
  occurred_at: string;
  amount_minor: number;
  currency: string;
  kind: Kind;
  wallet_id: string | null;
  category_id: string | null;
  note: string | null;
  updated_at: string;
  deleted_at: string | null;
  /** 1 = written locally, not yet accepted by the server. Dexie can't index booleans. */
  dirty: 0 | 1;
};

export type LocalCategory = {
  id: string;
  ledger_id: string;
  name: string;
  kind: Kind;
  icon: string | null;
  updated_at: string;
  deleted_at: string | null;
  dirty: 0 | 1;
};

export type LocalPreset = {
  id: string;
  ledger_id: string;
  label: string;
  icon: string | null;
  kind: Kind;
  amount_minor: number;
  category_id: string | null;
  wallet_id: string | null;
  note: string | null;
  sort_order: number;
  updated_at: string;
  deleted_at: string | null;
  dirty: 0 | 1;
};

export type LocalWallet = {
  id: string;
  ledger_id: string;
  name: string;
  kind: string;
  updated_at: string;
  deleted_at: string | null;
  dirty: 0 | 1;
};

/**
 * The unwrapped data key, cached so the passphrase is asked for once per device
 * rather than once per launch. Stored as a non-extractable CryptoKey: IndexedDB
 * keeps the handle, but no script can read the raw bytes back out of it.
 */
export type StoredKey = { id: "dek"; key: CryptoKey };

export type Meta = { key: string; value: string };

export const db = new Dexie("ledger") as Dexie & {
  transactions: EntityTable<LocalTransaction, "id">;
  categories: EntityTable<LocalCategory, "id">;
  wallets: EntityTable<LocalWallet, "id">;
  presets: EntityTable<LocalPreset, "id">;
  keys: EntityTable<StoredKey, "id">;
  meta: EntityTable<Meta, "key">;
};

db.version(1).stores({
  transactions: "id, occurred_at, dirty, updated_at",
  categories: "id, kind",
  wallets: "id",
  meta: "key",
});

// v2 makes categories editable offline, which means they need the same dirty
// flag transactions have, and adds the presets store.
db.version(2)
  .stores({
    transactions: "id, occurred_at, dirty, updated_at",
    categories: "id, kind, dirty",
    wallets: "id",
    presets: "id, sort_order, dirty",
    meta: "key",
  })
  .upgrade((tx) =>
    tx
      .table("categories")
      .toCollection()
      .modify((row) => {
        row.dirty = 0;
      }),
  );

// v3 adds the key cache, and wallets become user-editable content so they need
// the same dirty flag as everything else that is encrypted before it is pushed.
db.version(3)
  .stores({
    transactions: "id, occurred_at, dirty, updated_at",
    categories: "id, kind, dirty",
    wallets: "id, dirty",
    presets: "id, sort_order, dirty",
    keys: "id",
    meta: "key",
  })
  .upgrade((tx) =>
    tx
      .table("wallets")
      .toCollection()
      .modify((row) => {
        row.dirty = 0;
      }),
  );

export async function getMeta(key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}

/** Drops every cached row. Used on sign-out so the next user can't read them. */
export async function clearLocalData(): Promise<void> {
  await db.transaction(
    "rw",
    [db.transactions, db.categories, db.wallets, db.presets, db.keys, db.meta],
    async () => {
      await Promise.all([
        db.transactions.clear(),
        db.categories.clear(),
        db.wallets.clear(),
        db.presets.clear(),
        db.keys.clear(), // the data key must not outlive the session
        db.meta.clear(),
      ]);
    },
  );
}
