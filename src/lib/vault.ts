import {
  createDataKey,
  rewrapDataKey,
  unwrapDataKey,
  type WrappedKey,
} from "@/lib/crypto";
import { db } from "@/lib/db";
import { createClient } from "@/lib/supabase/client";

/**
 * Custody of the data key on this device.
 *
 * There is deliberately no recovery path. The server holds the wrapped key and
 * nothing else, so a forgotten passphrase means the ledger is unreadable by
 * anyone — which is the whole point, and the one thing the UI must say plainly.
 */

export type EncryptionMode = "e2ee" | "plaintext";

let cached: CryptoKey | null = null;

export async function currentKey(): Promise<CryptoKey | null> {
  if (cached) return cached;
  cached = (await db.keys.get("dek"))?.key ?? null;
  return cached;
}

async function remember(dek: CryptoKey): Promise<void> {
  cached = dek;
  await db.keys.put({ id: "dek", key: dek });
}

export async function forgetKey(): Promise<void> {
  cached = null;
  await db.keys.delete("dek");
}

// ─── Server side of the key ──────────────────────────────────────────────────

export async function fetchWrappedKey(
  ledgerId: string,
): Promise<WrappedKey | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ledger_keys")
    .select("salt, iterations, wrapped")
    .eq("ledger_id", ledgerId)
    .maybeSingle();

  if (error) throw error;
  return data as WrappedKey | null;
}

async function storeWrappedKey(
  ledgerId: string,
  wrapped: WrappedKey,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("ledger_keys")
    .upsert({ ledger_id: ledgerId, ...wrapped });
  if (error) throw error;
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/** First run for a ledger: mint a key and publish only its wrapped form. */
export async function createVault(
  ledgerId: string,
  passphrase: string,
): Promise<void> {
  if (await fetchWrappedKey(ledgerId)) {
    throw new Error("บัญชีนี้ตั้งรหัสไว้แล้ว");
  }

  const { dek, wrapped } = await createDataKey(passphrase);
  // Publish before caching: if the write fails, this device must not end up
  // encrypting rows with a key no other device can ever obtain.
  await storeWrappedKey(ledgerId, wrapped);
  await remember(dek);
}

/** Returns false when the passphrase is wrong, rather than throwing. */
export async function unlockVault(
  ledgerId: string,
  passphrase: string,
): Promise<boolean> {
  const wrapped = await fetchWrappedKey(ledgerId);
  if (!wrapped) throw new Error("ยังไม่ได้ตั้งรหัสสำหรับบัญชีนี้");

  try {
    await remember(await unwrapDataKey(passphrase, wrapped));
    return true;
  } catch {
    return false;
  }
}

/** Re-wraps the same key, so no row has to be re-encrypted. */
export async function changePassphrase(
  ledgerId: string,
  current: string,
  next: string,
): Promise<boolean> {
  const wrapped = await fetchWrappedKey(ledgerId);
  if (!wrapped) throw new Error("ยังไม่ได้ตั้งรหัสสำหรับบัญชีนี้");

  let dek: CryptoKey;
  try {
    dek = await unwrapDataKey(current, wrapped);
  } catch {
    return false;
  }

  await storeWrappedKey(ledgerId, await rewrapDataKey(dek, next));
  await remember(dek);
  return true;
}

// ─── Mode ────────────────────────────────────────────────────────────────────

/** null means the user has not chosen yet. */
export async function fetchMode(
  ledgerId: string,
): Promise<EncryptionMode | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ledgers")
    .select("encryption_mode")
    .eq("id", ledgerId)
    .single();

  if (error) throw error;
  return (data.encryption_mode as EncryptionMode | null) ?? null;
}

export async function setMode(
  ledgerId: string,
  mode: EncryptionMode,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("ledgers")
    .update({ encryption_mode: mode })
    .eq("id", ledgerId);
  if (error) throw error;
}
