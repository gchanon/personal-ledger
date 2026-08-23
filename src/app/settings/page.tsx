"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { EmojiPicker } from "@/components/emoji-picker";
import { byThaiName } from "@/lib/analytics";
import {
  addCategory,
  addPreset,
  editCategory,
  liveCategories,
  livePresets,
  removeCategory,
  removePreset,
} from "@/lib/catalog";
import { db, type LocalCategory, type LocalPreset } from "@/lib/db";
import { formatBaht, parseToMinor } from "@/lib/money";
import type { Kind } from "@/lib/types";

export default function SettingsPage() {
  const categories = useLiveQuery(
    async () => byThaiName(await liveCategories()),
    [],
    [],
  );
  const presets = useLiveQuery(livePresets, [], []);
  const wallets = useLiveQuery(
    async () => byThaiName(await db.wallets.toArray()),
    [],
    [],
  );

  return (
    <div className="flex flex-col gap-10">
      <PresetSection presets={presets} categories={categories} wallets={wallets} />
      <CategorySection categories={categories} />
    </div>
  );
}

// ─── Presets ─────────────────────────────────────────────────────────────────

function PresetSection({
  presets,
  categories,
  wallets,
}: {
  presets: LocalPreset[];
  categories: LocalCategory[];
  wallets: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("🚆");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<Kind>("expense");
  const [categoryId, setCategoryId] = useState("");
  const [walletId, setWalletId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const options = categories.filter((c) => c.kind === kind);

  async function create() {
    const amountMinor = parseToMinor(amount);
    if (!label.trim()) return setError("ตั้งชื่อปุ่มก่อน");
    if (amountMinor === null) return setError("จำนวนเงินไม่ถูกต้อง");

    setError(null);
    await addPreset({
      label: label.trim(),
      icon,
      kind,
      amount_minor: amountMinor,
      category_id: categoryId || null,
      wallet_id: walletId || null,
      note: null,
    });

    setLabel("");
    setAmount("");
    setCategoryId("");
    setOpen(false);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium">ปุ่มลัด</h2>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-sm text-neutral-500 underline"
        >
          {open ? "ยกเลิก" : "+ เพิ่ม"}
        </button>
      </div>
      <p className="-mt-2 text-xs text-neutral-500">
        รายการที่จดซ้ำๆ เช่น ค่า BTS เที่ยวละ ฿50 — กดปุ่มเดียวบันทึกทันที
      </p>

      {open && (
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
              placeholder="ชื่อปุ่ม เช่น BTS"
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

          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={inputClass}
          >
            <option value="">ไม่ระบุหมวด</option>
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

          <button type="button" onClick={create} className={primaryClass}>
            สร้างปุ่มลัด
          </button>
        </div>
      )}

      {presets.length === 0 && !open && (
        <p className="py-4 text-center text-sm text-neutral-500">ยังไม่มีปุ่มลัด</p>
      )}

      <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
        {presets.map((preset) => (
          <li key={preset.id} className="flex items-center gap-3 py-3">
            <span className="text-xl">{preset.icon}</span>
            <span className="flex-1 truncate">{preset.label}</span>
            <span className="tabular-nums text-neutral-500">
              {formatBaht(preset.amount_minor)}
            </span>
            <button
              type="button"
              onClick={() => confirm(`ลบปุ่ม "${preset.label}"?`) && removePreset(preset.id)}
              className="text-sm text-red-600"
            >
              ลบ
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Categories ──────────────────────────────────────────────────────────────

function CategorySection({ categories }: { categories: LocalCategory[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📦");
  const [kind, setKind] = useState<Kind>("expense");
  const [editingId, setEditingId] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    await addCategory({ name: name.trim(), kind, icon });
    setName("");
    setOpen(false);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium">หมวดหมู่</h2>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-sm text-neutral-500 underline"
        >
          {open ? "ยกเลิก" : "+ เพิ่ม"}
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
            {(["expense", "income"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-lg py-1.5 text-sm ${
                  kind === k ? "bg-white shadow-sm dark:bg-neutral-950" : "text-neutral-500"
                }`}
              >
                {k === "expense" ? "รายจ่าย" : "รายรับ"}
              </button>
            ))}
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ชื่อหมวด"
            className={inputClass}
          />
          <EmojiPicker value={icon} onChange={setIcon} />
          <button type="button" onClick={create} className={primaryClass}>
            เพิ่มหมวดหมู่
          </button>
        </div>
      )}

      {(["expense", "income"] as const).map((k) => (
        <div key={k} className="flex flex-col gap-1">
          <h3 className="pt-2 text-xs text-neutral-500">
            {k === "expense" ? "รายจ่าย" : "รายรับ"}
          </h3>
          <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
            {categories
              .filter((c) => c.kind === k)
              .map((c) =>
                editingId === c.id ? (
                  <CategoryEditor
                    key={c.id}
                    category={c}
                    onDone={() => setEditingId(null)}
                  />
                ) : (
                  <li key={c.id} className="flex items-center gap-3 py-3">
                    <span className="text-xl">{c.icon}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <button
                      type="button"
                      onClick={() => setEditingId(c.id)}
                      className="text-sm text-neutral-500"
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        confirm(
                          `ลบหมวด "${c.name}"? รายการเก่าที่ใช้หมวดนี้จะยังอยู่ครบ`,
                        ) && removeCategory(c.id)
                      }
                      className="text-sm text-red-600"
                    >
                      ลบ
                    </button>
                  </li>
                ),
              )}
          </ul>
        </div>
      ))}
    </section>
  );
}

function CategoryEditor({
  category,
  onDone,
}: {
  category: LocalCategory;
  onDone: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState(category.icon ?? "📦");

  async function save() {
    if (!name.trim()) return;
    await editCategory(category.id, { name: name.trim(), icon });
    onDone();
  }

  return (
    <li className="flex flex-col gap-3 py-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={inputClass}
        autoFocus
      />
      <EmojiPicker value={icon} onChange={setIcon} />
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onDone} className="rounded-xl border border-neutral-200 py-2.5 text-sm dark:border-neutral-800">
          ยกเลิก
        </button>
        <button type="button" onClick={save} className={primaryClass}>
          บันทึก
        </button>
      </div>
    </li>
  );
}

const inputClass =
  "rounded-xl border border-neutral-200 px-3 py-2.5 outline-none focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:focus:border-neutral-100";
const primaryClass =
  "rounded-xl bg-neutral-900 py-2.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900";
