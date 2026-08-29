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
  recurring: ["id", "ledger_id", "updated_at", "deleted_at"],
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
  categories: ["name", "kind", "icon", "bucket"],
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
  recurring: [
    "label",
    "icon",
    "kind",
    "amount_minor",
    "category_id",
    "wallet_id",
    "note",
    "day_of_month",
    "start_month",
  ],
};

/**
 * Which of the two shapes a ledger stores. Modelling the key as part of the
 * e2ee variant makes "encrypted but no key" unrepresentable.
 *
 * plaintext still carries an optional key: right after a switch away from e2ee
 * the server may still hold ciphertext rows that need opening once.
 */
export type Cipher =
  | { mode: "e2ee"; dek: CryptoKey }
  | { mode: "plaintext"; dek: CryptoKey | null };

/** Splits a local row into readable routing columns plus one opaque blob. */
export async function seal(
  cipher: Cipher,
  table: string,
  row: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (cipher.mode === "plaintext") {
    // Content goes into its own columns, and payload is cleared so switching
    // away from e2ee doesn't leave stale ciphertext beside readable values.
    return { ...row, payload: null };
  }

  const routing: Record<string, unknown> = {};
  const content: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(row)) {
    if (ROUTING[table].includes(field)) routing[field] = value;
    else content[field] = value;
  }

  const blanked = Object.fromEntries(
    LEGACY_COLUMNS[table].map((column) => [column, null]),
  );

  return { ...blanked, ...routing, payload: await encryptJson(cipher.dek, content) };
}

/** Throws when the key is missing or wrong, or the ciphertext was tampered with. */
export async function open<T>(
  cipher: Cipher,
  row: Record<string, unknown>,
): Promise<T> {
  const { payload, ...routing } = row;

  if (typeof payload !== "string") {
    // Under plaintext this is simply the normal shape. Under e2ee it is a row
    // from before encryption, and flagging it dirty is what converts it on the
    // next push — flagging it in plaintext mode instead would spin forever:
    // pull, flag, push, pull.
    return { ...routing, dirty: cipher.mode === "e2ee" ? 1 : 0 } as T;
  }

  if (!cipher.dek) throw new Error("ไม่มีกุญแจสำหรับถอดรหัสแถวนี้");

  const content = await decryptJson<Record<string, unknown>>(cipher.dek, payload);
  return { ...routing, ...content, dirty: 0 } as T;
}
