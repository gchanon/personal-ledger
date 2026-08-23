import type { SupabaseClient } from "@supabase/supabase-js";
import {
  db,
  getMeta,
  setMeta,
  type LocalCategory,
  type LocalTransaction,
  type LocalWallet,
} from "@/lib/db";
import { createClient } from "@/lib/supabase/client";

/**
 * Push-then-pull delta sync against Supabase. RLS scopes every query to the
 * signed-in user, so the browser talks to Postgres directly — no API layer.
 *
 * Conflict resolution is last-write-wins per row. Pushing first means a local
 * edit beats a concurrent remote one, which is the behaviour you want when the
 * "conflict" is almost always the same person on a second device.
 */

const EPOCH = "1970-01-01T00:00:00Z";

/** Clock skew and commit-order slack. Re-reading a few rows is free; missing one isn't. */
const CURSOR_REWIND_MS = 2000;

let inFlight: Promise<SyncResult> | null = null;

export type SyncResult = { ok: true; pushed: number } | { ok: false; error: string };

export function sync(): Promise<SyncResult> {
  // Collapse overlapping triggers (focus + online + a fresh write) into one run.
  inFlight ??= run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(): Promise<SyncResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "offline" };
  }

  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "not signed in" };

  try {
    await ensureLedgerId(supabase);
    const pushed = await push(supabase);
    await pull(supabase);
    await setMeta("last_synced_at", new Date().toISOString());
    return { ok: true, pushed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** New transactions need a ledger_id before they can be written, even offline. */
async function ensureLedgerId(supabase: SupabaseClient): Promise<void> {
  if (await getMeta("ledger_id")) return;

  const { data, error } = await supabase
    .from("ledger_members")
    .select("ledger_id")
    .limit(1)
    .single();

  if (error) throw error;
  await setMeta("ledger_id", data.ledger_id);
}

async function push(supabase: SupabaseClient): Promise<number> {
  const dirty = await db.transactions.where("dirty").equals(1).toArray();
  if (dirty.length === 0) return 0;

  const { error } = await supabase.from("transactions").upsert(
    dirty.map(({ dirty: _dirty, ...row }) => row),
  );
  if (error) throw error;

  // Clear the flag only on rows the user hasn't touched again mid-flight —
  // matching on updated_at is what keeps a concurrent edit from being dropped.
  await db.transaction("rw", db.transactions, async () => {
    for (const row of dirty) {
      await db.transactions
        .where("id")
        .equals(row.id)
        .and((r) => r.updated_at === row.updated_at)
        .modify({ dirty: 0 });
    }
  });

  return dirty.length;
}

async function pull(supabase: SupabaseClient): Promise<void> {
  await pullTable<LocalCategory>(supabase, "categories", (rows) =>
    db.categories.bulkPut(rows),
  );
  await pullTable<LocalWallet>(supabase, "wallets", (rows) =>
    db.wallets.bulkPut(rows),
  );
  await pullTransactions(supabase);
}

type Syncable = { id: string; updated_at: string };

async function pullTable<T extends Syncable>(
  supabase: SupabaseClient,
  table: string,
  write: (rows: T[]) => Promise<unknown>,
): Promise<void> {
  const rows = await fetchSince<T>(supabase, table);
  if (rows.length === 0) return;

  await write(rows);
  await advanceCursor(table, rows);
}

async function pullTransactions(supabase: SupabaseClient): Promise<void> {
  const rows = await fetchSince<Omit<LocalTransaction, "dirty">>(
    supabase,
    "transactions",
  );
  if (rows.length === 0) return;

  const dirtyIds = new Set(
    await db.transactions.where("dirty").equals(1).primaryKeys(),
  );

  // A row we haven't pushed yet is newer than anything the server can send.
  const incoming = rows
    .filter((row) => !dirtyIds.has(row.id))
    .map((row) => ({ ...row, dirty: 0 as const }));

  if (incoming.length > 0) await db.transactions.bulkPut(incoming);
  await advanceCursor("transactions", rows);
}

async function fetchSince<T>(supabase: SupabaseClient, table: string): Promise<T[]> {
  const since = (await getMeta(cursorKey(table))) ?? EPOCH;
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .gt("updated_at", since)
    .order("updated_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as T[];
}

async function advanceCursor(table: string, rows: Syncable[]): Promise<void> {
  const newest = rows.reduce(
    (max, row) => (row.updated_at > max ? row.updated_at : max),
    EPOCH,
  );
  const rewound = new Date(Date.parse(newest) - CURSOR_REWIND_MS).toISOString();
  await setMeta(cursorKey(table), rewound);
}

function cursorKey(table: string): string {
  return `cursor:${table}`;
}
