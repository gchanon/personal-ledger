"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRef, useState } from "react";
import { livePresets } from "@/lib/catalog";
import type { LocalPreset } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import { addTransaction, removeTransaction } from "@/lib/transactions";

/**
 * One tap records the whole transaction. Because there is no confirm step, a
 * mis-tap needs a way back — hence the undo bar rather than "go find it in the
 * list and delete it".
 */
const UNDO_MS = 6000;

export function QuickAdd() {
  const presets = useLiveQuery(livePresets, [], []);
  const [done, setDone] = useState<{ id: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function record(preset: LocalPreset) {
    setError(null);
    try {
      const id = await addTransaction({
        amount_minor: preset.amount_minor,
        kind: preset.kind,
        occurred_at: new Date().toISOString(),
        category_id: preset.category_id,
        wallet_id: preset.wallet_id,
        note: preset.note,
      });

      setDone({ id, label: preset.label });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(null), UNDO_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function undo() {
    if (!done) return;
    if (timer.current) clearTimeout(timer.current);
    await removeTransaction(done.id);
    setDone(null);
  }

  if (presets.length === 0) {
    return (
      <Link
        href="/settings"
        className="rounded-xl border border-dashed border-neutral-300 py-3 text-center text-sm text-neutral-500 dark:border-neutral-700"
      >
        + สร้างปุ่มลัด เช่น &ldquo;BTS ฿50&rdquo; กดทีเดียวจด
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => record(preset)}
            className="flex shrink-0 items-center gap-2 rounded-full border border-neutral-200 px-3 py-2 text-sm active:scale-95 dark:border-neutral-800"
          >
            <span aria-hidden>{preset.icon}</span>
            <span>{preset.label}</span>
            <span className="tabular-nums text-neutral-500">
              {formatBaht(preset.amount_minor)}
            </span>
          </button>
        ))}
      </div>

      {done && (
        <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          <span>บันทึก {done.label} แล้ว</span>
          <button type="button" onClick={undo} className="font-medium underline">
            เลิกทำ
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
