import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntityTable } from "dexie";
import { open, seal } from "@/lib/envelope";
import {
  db,
  getMeta,
  setMeta,
  type LocalCategory,
  type LocalPreset,
  type LocalTransaction,
  type LocalWallet,
} from "@/lib/db";
import { createClient } from "@/lib/supabase/client";
import { currentKey } from "@/lib/vault";

/**
 * Push-then-pull delta sync against Supabase, with every content field encrypted
 * before it leaves the device.
 *
 * The server is dumb storage: it filters on updated_at and nothing else, which is
 * what makes end-to-end encryption free here — no aggregate, join or sort depends
 * on a value the server can no longer read.
 *
 * Conflict resolution is last-write-wins per row. Pushing first means a local
 * edit beats a concurrent remote one, which is the behaviour you want when the
 * "conflict" is almost always the same person on a second device.
 */

const EPOCH = "1970-01-01T00:00:00Z";

const TABLES = ["categories", "wallets", "transactions", "presets"] as const;

/** Clock skew and commit-order slack. Re-reading a few rows is free; missing one isn't. */
const CURSOR_REWIND_MS = 2000;

let inFlight: Promise<SyncResult> | null = null;

export type SyncResult =
  | { ok: true; pushed: number; undecryptable: number }
  | { ok: false; error: string; locked?: boolean };

/**
 * Forgets every cursor so the next pull re-reads the whole ledger.
 *
 * Needed right after a vault is created: a pre-encryption row is only converted
 * when it comes back through pull, and on the device that wrote it the cursor is
 * already past it — so without this, that plaintext would sit on the server for
 * good.
 */
export async function resetCursors(): Promise<void> {
  await Promise.all(TABLES.map((table) => setMeta(cursorKey(table), EPOCH)));
}

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

  // Without the key there is nothing safe to do: pushing would write plaintext
  // and pulling would store ciphertext the app can't read.
  const dek = await currentKey();
  if (!dek) return { ok: false, error: "locked", locked: true };

  try {
    await ensureLedgerId(supabase);
    const pushed = await push(supabase, dek);
    const undecryptable = await pull(supabase, dek);
    await setMeta("last_synced_at", new Date().toISOString());
    return { ok: true, pushed, undecryptable };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

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

type Dirty = { id: string; updated_at: string; dirty: 0 | 1 };

// ─── Push ────────────────────────────────────────────────────────────────────

async function push(supabase: SupabaseClient, dek: CryptoKey): Promise<number> {
  let pushed = 0;
  // Categories and wallets before transactions: a transaction can reference one
  // that exists only on this device, and the foreign key rejects that order.
  pushed += await pushTable(supabase, dek, "categories", db.categories);
  pushed += await pushTable(supabase, dek, "wallets", db.wallets);
  pushed += await pushTable(supabase, dek, "transactions", db.transactions);
  pushed += await pushTable(supabase, dek, "presets", db.presets);
  return pushed;
}

async function pushTable<T extends Dirty>(
  supabase: SupabaseClient,
  dek: CryptoKey,
  table: string,
  store: EntityTable<T, "id">,
): Promise<number> {
  const dirty = await store.where("dirty").equals(1).toArray();
  if (dirty.length === 0) return 0;

  const payload = await Promise.all(
    dirty.map(({ dirty: _dirty, ...row }) => seal(dek, table, row)),
  );

  const { error } = await supabase.from(table).upsert(payload);
  if (error) throw error;

  // Clear the flag only on rows the user hasn't touched again mid-flight —
  // matching on updated_at is what keeps a concurrent edit from being dropped.
  await db.transaction("rw", store, async () => {
    for (const row of dirty) {
      await store
        .where("id")
        .equals(row.id)
        .and((r) => r.updated_at === row.updated_at)
        .modify((r) => {
          r.dirty = 0;
        });
    }
  });

  return dirty.length;
}

// ─── Pull ────────────────────────────────────────────────────────────────────

/** Returns how many rows could not be decrypted. */
async function pull(supabase: SupabaseClient, dek: CryptoKey): Promise<number> {
  let failed = 0;
  failed += await pullTable<LocalCategory>(supabase, dek, "categories", db.categories);
  failed += await pullTable<LocalWallet>(supabase, dek, "wallets", db.wallets);
  failed += await pullTable<LocalTransaction>(
    supabase,
    dek,
    "transactions",
    db.transactions,
  );
  failed += await pullTable<LocalPreset>(supabase, dek, "presets", db.presets);
  return failed;
}

async function pullTable<T extends Dirty>(
  supabase: SupabaseClient,
  dek: CryptoKey,
  table: string,
  store: EntityTable<T, "id">,
): Promise<number> {
  const rows = await fetchSince(supabase, table);
  if (rows.length === 0) return 0;

  const dirtyIds = new Set<string>(
    (await store.where("dirty").equals(1).primaryKeys()) as string[],
  );

  const opened: T[] = [];
  let newestHandled = EPOCH;
  let failed = 0;

  for (const row of rows) {
    const updatedAt = row.updated_at as string;

    // A row we haven't pushed yet is newer than anything the server can send.
    if (dirtyIds.has(row.id as string)) {
      newestHandled = maxIso(newestHandled, updatedAt);
      continue;
    }

    try {
      opened.push(await open<T>(dek, row));
      newestHandled = maxIso(newestHandled, updatedAt);
    } catch {
      // Wrong key or damaged ciphertext. Leaving the cursor behind this row
      // means a later fix re-reads it instead of losing it silently.
      failed += 1;
      break;
    }
  }

  if (opened.length > 0) await store.bulkPut(opened);
  if (newestHandled !== EPOCH) await advanceCursor(table, newestHandled);

  return failed;
}

async function fetchSince(
  supabase: SupabaseClient,
  table: string,
): Promise<Record<string, unknown>[]> {
  const since = (await getMeta(cursorKey(table))) ?? EPOCH;
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .gt("updated_at", since)
    .order("updated_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

async function advanceCursor(table: string, newest: string): Promise<void> {
  const rewound = new Date(Date.parse(newest) - CURSOR_REWIND_MS).toISOString();
  await setMeta(cursorKey(table), rewound);
}

function maxIso(a: string, b: string): string {
  return b > a ? b : a;
}

function cursorKey(table: string): string {
  return `cursor:${table}`;
}
