import { uuidv7 } from "uuidv7";
import { db, getMeta, type LocalTransaction } from "@/lib/db";
import { sync } from "@/lib/sync";
import type { Kind } from "@/lib/types";

/**
 * Every write lands in IndexedDB first and is pushed opportunistically, so the
 * UI never waits on the network and works with the radio off.
 */

export type TransactionInput = {
  amount_minor: number;
  kind: Kind;
  occurred_at: string;
  category_id: string | null;
  wallet_id: string | null;
  note: string | null;
};

/**
 * Returns the new row's id so a one-tap caller can offer undo. Pass `id` only
 * for a derived (dedupe) id; otherwise it is time-ordered so offline rows still
 * sort correctly on arrival.
 */
export async function addTransaction(
  input: TransactionInput,
  id: string = uuidv7(),
): Promise<string> {
  const ledgerId = await getMeta("ledger_id");
  if (!ledgerId) {
    throw new Error("ยังไม่ได้ซิงก์ครั้งแรก — ต่ออินเทอร์เน็ตแล้วเปิดแอพอีกครั้ง");
  }

  await db.transactions.add({
    id,
    ledger_id: ledgerId,
    currency: "THB",
    updated_at: new Date().toISOString(),
    deleted_at: null,
    dirty: 1,
    ...input,
  });

  void sync();
  return id;
}

export async function editTransaction(
  id: string,
  input: TransactionInput,
): Promise<void> {
  await db.transactions.update(id, {
    ...input,
    updated_at: new Date().toISOString(),
    dirty: 1,
  });
  void sync();
}

/** Tombstone, not a row removal — a hard delete would come back on the next pull. */
export async function removeTransaction(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.transactions.update(id, {
    deleted_at: now,
    updated_at: now,
    dirty: 1,
  });
  void sync();
}

export function liveTransactions(limit: number): Promise<LocalTransaction[]> {
  return db.transactions
    .orderBy("occurred_at")
    .reverse()
    .filter((t) => t.deleted_at === null)
    .limit(limit)
    .toArray();
}
