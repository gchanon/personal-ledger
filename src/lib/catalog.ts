import { uuidv7 } from "uuidv7";
import { db, getMeta, type LocalCategory, type LocalPreset } from "@/lib/db";
import { sync } from "@/lib/sync";
import type { Kind } from "@/lib/types";

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
}): Promise<void> {
  await db.categories.add({
    id: uuidv7(),
    ledger_id: await ledgerId(),
    name: input.name,
    kind: input.kind,
    icon: input.icon,
    updated_at: new Date().toISOString(),
    deleted_at: null,
    dirty: 1,
  });
  void sync();
}

export async function editCategory(
  id: string,
  input: { name: string; icon: string },
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
