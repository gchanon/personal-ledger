"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useEffect, useState } from "react";
import { byThaiName } from "@/lib/analytics";
import { db } from "@/lib/db";
import { derivedId } from "@/lib/ids";
import { formatMinor, parseToMinor } from "@/lib/money";
import { parseSlip, slipSeed } from "@/lib/slip";
import { addTransaction } from "@/lib/transactions";

/**
 * Review screen for slips read by the "อ่านสลิป" iOS Shortcut, which finds the
 * bank albums' recent slips and OCRs them with Live Text (a web page can't call
 * Apple's OCR itself). The batch is `slip=<text>&slip=<text>…` and arrives one
 * of two ways:
 *
 * - Fragment: the Shortcut opens /import#<batch>. Simplest, but iOS opens it in
 *   Safari, whose storage is separate from the Home Screen app.
 * - Clipboard: the button below runs the Shortcut with input "clipboard", it
 *   copies the batch, and the user pastes it back here — so a Home Screen app
 *   stays in its own storage.
 *
 * The fragment never leaves the phone, so a long batch can't trip the host's
 * URL limit and slip text never lands in server logs.
 */

const SHORTCUT = "อ่านสลิป";
const RUN_SHORTCUT = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT)}&input=text&text=clipboard`;

type Row = {
  id: string;
  amountMinor: number | null;
  occurredAt?: Date;
  include: boolean;
  categoryId: string;
};

/** Already-saved slips are dropped, not listed: a 7-day window is mostly repeats. */
async function readBatch(batch: string): Promise<{ rows: Row[]; skipped: number }> {
  const seen = new Set<string>();
  const rows: Row[] = [];
  let skipped = 0;
  for (const text of new URLSearchParams(batch).getAll("slip")) {
    const slip = parseSlip(text);
    const id = await derivedId(slipSeed(text, slip));
    // The same slip twice in one batch (overlapping albums or runs) shows once.
    if (seen.has(id)) continue;
    seen.add(id);
    // A tombstone counts: a slip the user already deleted stays deleted.
    if (await db.transactions.get(id)) {
      skipped += 1;
      continue;
    }
    const amountMinor = slip.amount ? parseToMinor(slip.amount) : null;
    rows.push({
      id,
      amountMinor,
      occurredAt: slip.occurredAt,
      include: amountMinor !== null,
      categoryId: "",
    });
  }
  return { rows, skipped };
}

export default function ImportPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [saved, setSaved] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const categories = useLiveQuery(
    async () =>
      byThaiName(
        await db.categories
          .filter((c) => c.deleted_at === null && c.kind === "expense")
          .toArray(),
      ),
    [],
    [],
  );
  const wallets = useLiveQuery(
    async () => byThaiName(await db.wallets.filter((w) => w.deleted_at === null).toArray()),
    [],
    [],
  );

  async function load(batch: string) {
    const result = await readBatch(batch);
    setRows(result.rows);
    setSkipped(result.skipped);
    setSaved(null);
  }

  useEffect(() => {
    void load(location.hash.slice(1));
  }, []);

  async function paste() {
    setError(null);
    try {
      const batch = (await navigator.clipboard.readText()).trim();
      if (!batch.startsWith("slip=")) {
        setError(`คลิปบอร์ดไม่มีสลิป — กด "อ่านสลิปจาก Photos" ก่อน`);
        return;
      }
      await load(batch);
    } catch {
      setError("อ่านคลิปบอร์ดไม่ได้ — กด “วาง” เมื่อ iOS ถาม");
    }
  }

  function update(id: string, patch: Partial<Row>) {
    setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, ...patch } : r)) ?? rs);
  }

  const chosen = rows?.filter((r) => r.include && r.amountMinor !== null) ?? [];

  async function saveAll() {
    setBusy(true);
    setError(null);
    try {
      for (const r of chosen) {
        await addTransaction(
          {
            amount_minor: r.amountMinor!,
            kind: "expense",
            occurred_at: (r.occurredAt ?? new Date()).toISOString(),
            category_id: r.categoryId || null,
            // Same default the add form shows: the first wallet.
            wallet_id: wallets[0]?.id ?? null,
            note: null,
          },
          r.id,
        );
      }
      // Drop the slip texts from the address bar, history entry and clipboard
      // (which Universal Clipboard would otherwise carry to other devices).
      history.replaceState(null, "", location.pathname);
      navigator.clipboard?.writeText("").catch(() => {});
      setSaved(chosen.length);
      setSkipped(0);
      setRows([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (rows === null) {
    return <p className="py-16 text-center text-sm text-neutral-500">กำลังอ่านสลิป...</p>;
  }

  const sources = (
    <div className="grid grid-cols-2 gap-2">
      <a
        href={RUN_SHORTCUT}
        className="rounded-xl border border-neutral-200 py-3 text-center text-sm dark:border-neutral-800"
      >
        📷 อ่านสลิปจาก Photos
      </a>
      <button
        type="button"
        onClick={paste}
        className="rounded-xl border border-neutral-200 py-3 text-sm dark:border-neutral-800"
      >
        📋 วางสลิป
      </button>
    </div>
  );

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {sources}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="py-12 text-center text-sm text-neutral-500">
          {saved !== null
            ? `บันทึกแล้ว ${saved} รายการ ✓`
            : skipped > 0
              ? `ไม่มีสลิปใหม่ (ข้าม ${skipped} ใบที่บันทึกแล้ว)`
              : "กดอ่านสลิปจาก Photos แล้วกลับมากดวางสลิป"}
        </p>
        {saved !== null && (
          <Link href="/transactions" className="text-center text-sm text-neutral-500 underline">
            ดูรายการ
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {sources}
      <h1 className="text-lg font-semibold">
        สลิปใหม่ {rows.length} ใบ
        {skipped > 0 && (
          <span className="ml-2 text-sm font-normal text-neutral-500">
            (ข้าม {skipped} ใบที่บันทึกแล้ว)
          </span>
        )}
      </h1>

      <ul className="flex flex-col gap-2">
        {rows.map((r) => {
          const disabled = r.amountMinor === null;
          return (
            <li
              key={r.id}
              className={`flex flex-col gap-2 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800 ${
                disabled ? "opacity-50" : ""
              }`}
            >
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={r.include}
                  disabled={disabled}
                  onChange={(e) => update(r.id, { include: e.target.checked })}
                  className="size-5"
                />
                <span className="flex-1 text-xl tabular-nums">
                  {disabled ? "อ่านยอดไม่ได้" : `฿${formatMinor(r.amountMinor!)}`}
                </span>
                <span className="text-xs text-neutral-500">
                  {r.occurredAt
                      ? r.occurredAt.toLocaleString("th-TH", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "ไม่พบวันที่ — ใช้เวลาตอนนี้"}
                </span>
              </label>
              {!disabled && (
                <select
                  value={r.categoryId}
                  onChange={(e) => update(r.id, { categoryId: e.target.value })}
                  aria-label="หมวด"
                  className="rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <option value="">ไม่ระบุหมวด</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={saveAll}
        disabled={busy || chosen.length === 0}
        className="rounded-xl bg-neutral-900 py-4 text-lg font-medium text-white transition disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {busy ? "กำลังบันทึก..." : `บันทึก ${chosen.length} รายการ`}
      </button>
    </div>
  );
}
