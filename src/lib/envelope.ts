import { decryptJson, encryptJson } from "@/lib/crypto";

/**
 * The boundary between what the server may read and what it may not.
 *
 * Kept free of Dexie and Supabase imports on purpose: this is the one piece of
 * the sync path whose correctness decides whether data leaks, so it has to be
 * testable on its own.
 */

/**
 * Columns the server is still allowed to read. Everything else in a row goes
 * into `payload`. Keep these lists minimal — each entry is metadata the ledger
 * owner can see.
 */
export const ROUTING: Record<string, string[]> = {
  transactions: ["id", "ledger_id", "updated_at", "deleted_at"],
  categories: ["id", "ledger_id", "updated_at", "deleted_at"],
  wallets: ["id", "ledger_id", "updated_at", "deleted_at"],
  presets: ["id", "ledger_id", "sort_order", "updated_at", "deleted_at"],
};

/**
 * Plaintext columns from before encryption. Pushed as explicit NULLs so that
 * re-encrypting a legacy row actually erases the readable copy — an upsert only
 * touches the columns it names.
 */
export const LEGACY_COLUMNS: Record<string, string[]> = {
  transactions: [
    "occurred_at",
    "amount_minor",
    "currency",
    "kind",
    "wallet_id",
    "category_id",
    "note",
  ],
  categories: ["name", "kind", "icon"],
  wallets: ["name", "kind"],
  presets: [
    "label",
    "icon",
    "kind",
    "amount_minor",
    "category_id",
    "wallet_id",
    "note",
  ],
};

/** Splits a local row into readable routing columns plus one opaque blob. */
export async function seal(
  dek: CryptoKey,
  table: string,
  row: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const routing: Record<string, unknown> = {};
  const content: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(row)) {
    if (ROUTING[table].includes(field)) routing[field] = value;
    else content[field] = value;
  }

  const blanked = Object.fromEntries(
    LEGACY_COLUMNS[table].map((column) => [column, null]),
  );

  return { ...blanked, ...routing, payload: await encryptJson(dek, content) };
}

/** Throws when the key is wrong or the ciphertext was tampered with. */
export async function open<T>(
  dek: CryptoKey,
  row: Record<string, unknown>,
): Promise<T> {
  const { payload, ...routing } = row;

  if (typeof payload !== "string") {
    // A row written before encryption. Readable as-is, and marked dirty so the
    // next push replaces the plaintext copy with ciphertext.
    return { ...routing, dirty: 1 } as T;
  }

  const content = await decryptJson<Record<string, unknown>>(dek, payload);
  return { ...routing, ...content, dirty: 0 } as T;
}
