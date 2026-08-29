import { uuidv7 } from "uuidv7";
import {
  db,
  getMeta,
  type LocalCategory,
  type LocalPreset,
  type LocalRecurring,
} from "@/lib/db";
import { sync } from "@/lib/sync";
import type { Bucket, Kind } from "@/lib/types";

/**
 * Categories and presets follow the same local-first rule as transactions:
 * write to IndexedDB with dirty = 1, push opportunistically.
 */

async function ledgerId(): Promise<string> {
  const id = await getMeta("ledger_id");
  if (!id) {
    throw new Error("ยังไม่ได้ซิงก์ครั้งแรก — ต่ออินเทอร์เน็ตแล้วเปิดแอพอีกครั้ง");
  }
  return id;
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function addCategory(input: {
  name: string;
  kind: Kind;
  icon: string;
  bucket: Bucket;
}): Promise<void> {
  await db.categories.add({
    id: uuidv7(),
    ledger_id: await ledgerId(),
    name: input.name,
    kind: input.kind,
    icon: input.icon,
    bucket: input.bucket,
    updated_at: new Date().toISOString(),
    deleted_at: null,
    dirty: 1,
  });
  void sync();
}

export async function editCategory(
  id: string,
  input: { name: string; icon: string; bucket: Bucket },
): Promise<void> {
  await db.categories.update(id, {
    ...input,
    updated_at: new Date().toISOString(),
    dirty: 1,
  });
  void sync();
}

/**
 * Tombstone, like every other delete here. Past transactions keep pointing at
 * the row — the server's ON DELETE SET NULL only fires on a real delete, and
 * blanking a year of history because a category was retired would be wrong.
 */
export async function removeCategory(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.categories.update(id, { deleted_at: now, updated_at: now, dirty: 1 });
  void sync();
}

export function liveCategories(): Promise<LocalCategory[]> {
  return db.categories.filter((c) => c.deleted_at === null).toArray();
}

// ─── Presets ─────────────────────────────────────────────────────────────────

export type PresetInput = {
  label: string;
  icon: string;
  kind: Kind;
  amount_minor: number;
  category_id: string | null;
  wallet_id: string | null;
  note: string | null;
};

export async function addPreset(input: PresetInput): Promise<void> {
  const count = await db.presets.count();
  await db.presets.add({
    id: uuidv7(),
    ledger_id: await ledgerId(),
    sort_order: count,
    updated_at: new Date().toISOString(),
    deleted_at: null,
    dirty: 1,
    ...input,
  });
  void sync();
}

export async function editPreset(id: string, input: PresetInput): Promise<void> {
  await db.presets.update(id, {
    ...input,
    updated_at: new Date().toISOString(),
    dirty: 1,
  });
  void sync();
}

export async function removePreset(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.presets.update(id, { deleted_at: now, updated_at: now, dirty: 1 });
  void sync();
}

export function livePresets(): Promise<LocalPreset[]> {
  return db.presets
    .orderBy("sort_order")
    .filter((p) => p.deleted_at === null)
    .toArray();
}

// ─── First-run defaults ──────────────────────────────────────────────────────

const DEFAULT_CATEGORIES: [string, Kind, string, Bucket][] = [
  // Committed every month whether or not you use them.
  ["ที่พัก", "expense", "🏠", "fixed"],
  ["ค่าประกัน", "expense", "🛡️", "fixed"],
  ["ค่าโทรศัพท์/เน็ต", "expense", "📱", "fixed"],
  // Spending that is meant to come back later.
  ["เรียนรู้/พัฒนาตัวเอง", "expense", "📚", "investment"],
  // Moves with how the month goes.
  ["อาหาร", "expense", "🍜", "variable"],
  ["เดินทาง", "expense", "🚕", "variable"],
  ["ช้อปปิ้ง", "expense", "🛍️", "variable"],
  ["สุขภาพ", "expense", "💊", "variable"],
  ["บันเทิง", "expense", "🎬", "variable"],
  ["อื่นๆ", "expense", "📦", "variable"],
  ["เงินเดือน", "income", "💰", "variable"],
  ["ฟรีแลนซ์", "income", "💻", "variable"],
  ["รายได้อื่น", "income", "🎁", "variable"],
];

const DEFAULT_WALLETS: [string, string][] = [
  ["เงินสด", "cash"],
  ["ธนาคาร", "bank"],
];

/**
 * Seeded on the client, not by a database trigger: the trigger has no key, so
 * anything it wrote would sit in the table as readable plaintext.
 */
export async function seedDefaults(): Promise<void> {
  const ledger = await ledgerId();
  const now = new Date().toISOString();

  if ((await db.categories.count()) === 0) {
    await db.categories.bulkAdd(
      DEFAULT_CATEGORIES.map(([name, kind, icon, bucket]) => ({
        id: uuidv7(),
        ledger_id: ledger,
        name,
        kind,
        icon,
        bucket,
        updated_at: now,
        deleted_at: null,
        dirty: 1 as const,
      })),
    );
  }

  if ((await db.wallets.count()) === 0) {
    await db.wallets.bulkAdd(
      DEFAULT_WALLETS.map(([name, kind]) => ({
        id: uuidv7(),
        ledger_id: ledger,
        name,
        kind,
        updated_at: now,
        deleted_at: null,
        dirty: 1 as const,
      })),
    );
  }

  void sync();
}

// ─── Recurring ───────────────────────────────────────────────────────────────

export type RecurringInput = {
  label: string;
  icon: string;
  kind: Kind;
  amount_minor: number;
  category_id: string | null;
  wallet_id: string | null;
  note: string | null;
  day_of_month: number;
  start_month: string;
};

export async function addRecurring(input: RecurringInput): Promise<void> {
  await db.recurring.add({
    id: uuidv7(),
    ledger_id: await ledgerId(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    dirty: 1,
    ...input,
  });
  void sync();
}

export async function editRecurring(
  id: string,
  input: RecurringInput,
): Promise<void> {
  await db.recurring.update(id, {
    ...input,
    updated_at: new Date().toISOString(),
    dirty: 1,
  });
  void sync();
}

/**
 * Tombstone only. Transactions this already produced stay put — they were real
 * payments, and deleting the commitment shouldn't rewrite history.
 */
export async function removeRecurring(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.recurring.update(id, { deleted_at: now, updated_at: now, dirty: 1 });
  void sync();
}

export function liveRecurring(): Promise<LocalRecurring[]> {
  return db.recurring.filter((r) => r.deleted_at === null).toArray();
}
