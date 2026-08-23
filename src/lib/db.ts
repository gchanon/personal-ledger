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
};

export type LocalWallet = {
  id: string;
  ledger_id: string;
  name: string;
  kind: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Meta = { key: string; value: string };

export const db = new Dexie("ledger") as Dexie & {
  transactions: EntityTable<LocalTransaction, "id">;
  categories: EntityTable<LocalCategory, "id">;
  wallets: EntityTable<LocalWallet, "id">;
  meta: EntityTable<Meta, "key">;
};

db.version(1).stores({
  transactions: "id, occurred_at, dirty, updated_at",
  categories: "id, kind",
  wallets: "id",
  meta: "key",
});

export async function getMeta(key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}

/** Drops every cached row. Used on sign-out so the next user can't read them. */
export async function clearLocalData(): Promise<void> {
  await db.transaction("rw", db.transactions, db.categories, db.wallets, db.meta, async () => {
    await Promise.all([
      db.transactions.clear(),
      db.categories.clear(),
      db.wallets.clear(),
      db.meta.clear(),
    ]);
  });
}
