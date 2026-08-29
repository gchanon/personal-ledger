"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { EmojiPicker } from "@/components/emoji-picker";
import { currentMonthKey } from "@/lib/analytics";
import {
  addRecurring,
  editRecurring,
  liveRecurring,
  removeRecurring,
  type RecurringInput,
} from "@/lib/catalog";
import type { LocalCategory, LocalRecurring } from "@/lib/db";
import { formatBaht, parseToMinor } from "@/lib/money";
import { materializeRecurring, monthlyCommitment } from "@/lib/recurring";
import type { Kind } from "@/lib/types";

/**
 * Standing commitments — insurance, a phone bill. Declared once here and turned
 * into ordinary transactions each month, so nothing downstream needs to know
 * they were automatic.
 */
export function RecurringSettings({
  categories,
  wallets,
}: {
  categories: LocalCategory[];
  wallets: { id: string; name: string }[];
}) {
  const rules = useLiveQuery(liveRecurring, [], []);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const categoryName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium">รายการประจำทุกเดือน</h2>
        <button
          type="button"
          onClick={() => {
            setCreating(!creating);
            setEditingId(null);
          }}
          className="text-sm text-neutral-500 underline"
        >
          {creating ? "ยกเลิก" : "+ เพิ่ม"}
        </button>
      </div>
      <p className="-mt-2 text-xs text-neutral-500">
        ค่าประกัน ค่าโทรศัพท์ ค่าเช่า — ประกาศครั้งเดียว แอพลงรายการให้ทุกเดือนเอง
      </p>

      {rules.length > 0 && (
        <div className="rounded-xl border border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
          <p className="text-xs text-neutral-500">ภาระคงที่ต่อเดือน</p>
          <p className="text-lg tabular-nums">
            {formatBaht(monthlyCommitment(rules))}
          </p>
        </div>
      )}

      {creating && (
        <RecurringForm
          categories={categories}
          wallets={wallets}
          onSubmit={async (input) => {
            await addRecurring(input);
            await materializeRecurring();
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {rules.length === 0 && !creating && (
        <p className="py-4 text-center text-sm text-neutral-500">
          ยังไม่มีรายการประจำ
        </p>
      )}

      <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
        {rules.map((rule) =>
          editingId === rule.id ? (
            <li key={rule.id} className="py-3">
              <RecurringForm
                rule={rule}
                categories={categories}
                wallets={wallets}
                onSubmit={async (input) => {
                  await editRecurring(rule.id, input);
                  await materializeRecurring();
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li key={rule.id} className="flex items-center gap-3 py-3">
              <span className="text-xl">{rule.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{rule.label}</span>
                <span className="block truncate text-xs text-neutral-500">
                  ทุกวันที่ {rule.day_of_month} ·{" "}
                  {categoryName(rule.category_id) ?? "⚠️ ไม่ได้เลือกหมวด"}
                </span>
              </span>
              <span className="tabular-nums text-neutral-500">
                {formatBaht(rule.amount_minor)}
              </span>
              <button
                type="button"
                onClick={() => {
                  setEditingId(rule.id);
                  setCreating(false);
                }}
                className="text-sm text-neutral-500"
              >
                แก้ไข
              </button>
              <button
                type="button"
                onClick={() =>
                  confirm(
                    `ลบ "${rule.label}"? รายการที่ลงไปแล้วในเดือนก่อนๆ จะยังอยู่ครบ`,
                  ) && removeRecurring(rule.id)
                }
                className="text-sm text-red-600"
              >
                ลบ
              </button>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function RecurringForm({
  rule,
  categories,
  wallets,
  onSubmit,
  onCancel,
}: {
  rule?: LocalRecurring;
  categories: LocalCategory[];
  wallets: { id: string; name: string }[];
  onSubmit: (input: RecurringInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(rule?.label ?? "");
  const [icon, setIcon] = useState(rule?.icon ?? "🛡️");
  const [amount, setAmount] = useState(
    rule ? (rule.amount_minor / 100).toFixed(2) : "",
  );
  const [kind, setKind] = useState<Kind>(rule?.kind ?? "expense");
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? "");
  const [walletId, setWalletId] = useState(rule?.wallet_id ?? "");
  const [day, setDay] = useState(String(rule?.day_of_month ?? 1));
  const [startMonth] = useState(rule?.start_month ?? currentMonthKey());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const options = categories.filter((c) => c.kind === kind);

  async function submit() {
    const amountMinor = parseToMinor(amount);
    const dayNumber = Number(day);
    if (!label.trim()) return setError("ตั้งชื่อรายการก่อน");
    if (amountMinor === null) return setError("จำนวนเงินไม่ถูกต้อง");
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) {
      return setError("วันที่ต้องอยู่ระหว่าง 1–31");
    }
    if (!categoryId) return setError("เลือกหมวดหมู่ด้วย");

    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        label: label.trim(),
        icon,
        kind,
        amount_minor: amountMinor,
        category_id: categoryId,
        wallet_id: walletId || null,
        note: null,
        day_of_month: dayNumber,
        start_month: startMonth,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
        {(["expense", "income"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setCategoryId("");
            }}
            className={`rounded-lg py-1.5 text-sm ${
              kind === k ? "bg-white shadow-sm dark:bg-neutral-950" : "text-neutral-500"
            }`}
          >
            {k === "expense" ? "รายจ่าย" : "รายรับ"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="ชื่อ เช่น ค่าประกัน"
          className={inputClass}
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="จำนวนเงิน"
          className={`${inputClass} tabular-nums`}
        />
      </div>

      <label className="flex items-center gap-3">
        <span className="shrink-0 text-sm text-neutral-500">ทุกวันที่</span>
        <input
          value={day}
          onChange={(e) => setDay(e.target.value)}
          inputMode="numeric"
          className={`${inputClass} w-20 text-center tabular-nums`}
        />
        {/* Nobody should have to know what the app does in February. */}
        <span className="text-xs text-neutral-400">
          เดือนที่สั้นกว่าจะเลื่อนเป็นวันสุดท้ายให้
        </span>
      </label>

      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className={inputClass}
      >
        <option value="">— เลือกหมวดหมู่ —</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.icon} {c.name}
          </option>
        ))}
      </select>

      <select
        value={walletId}
        onChange={(e) => setWalletId(e.target.value)}
        className={inputClass}
      >
        <option value="">ไม่ระบุกระเป๋า</option>
        {wallets.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>

      <EmojiPicker value={icon} onChange={setIcon} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onCancel} className={secondaryClass}>
          ยกเลิก
        </button>
        <button type="button" onClick={submit} disabled={busy} className={primaryClass}>
          {busy ? "กำลังบันทึก..." : rule ? "บันทึก" : "เพิ่มรายการประจำ"}
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "rounded-xl border border-neutral-200 px-3 py-2.5 outline-none focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:focus:border-neutral-100";
const primaryClass =
  "rounded-xl bg-neutral-900 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900";
const secondaryClass =
  "rounded-xl border border-neutral-200 py-2.5 text-sm dark:border-neutral-800";
