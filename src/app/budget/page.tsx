"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useState } from "react";
import {
  BUCKET_LABEL,
  currentMonthKey,
  formatMonth,
  monthBounds,
  shiftMonth,
  type MonthKey,
} from "@/lib/analytics";
import { buildBudget } from "@/lib/budget";
import { db, getMeta, setMeta } from "@/lib/db";
import { formatBaht, parseToMinor } from "@/lib/money";
import type { Bucket } from "@/lib/types";

const INCOME_KEY = "monthly_income";

const COLOR: Record<Bucket, string> = {
  fixed: "var(--viz-series-1)",
  investment: "var(--viz-series-3)",
  variable: "var(--viz-series-2)",
};

export default function BudgetPage() {
  const [month, setMonth] = useState<MonthKey>(currentMonthKey);
  const [editing, setEditing] = useState(false);

  const salary = useLiveQuery(
    async () => Number(await getMeta(INCOME_KEY)) || 0,
    [],
    null,
  );

  const rows = useLiveQuery(
    async () => {
      const { start, end } = monthBounds(month);
      return db.transactions
        .where("occurred_at")
        .between(start.toISOString(), end.toISOString())
        .filter((t) => t.deleted_at === null)
        .toArray();
    },
    [month],
    [],
  );

  const categories = useLiveQuery(() => db.categories.toArray(), [], []);

  if (salary === null) return null; // first paint, before Dexie answers

  if (salary === 0 || editing) {
    return (
      <IncomeForm
        current={salary}
        onDone={() => setEditing(false)}
        onCancel={salary > 0 ? () => setEditing(false) : null}
      />
    );
  }

  const budget = buildBudget(rows, categories, month, salary);
  const isCurrentMonth = month === currentMonthKey();
  const over = budget.left < 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, -1))}
          className="size-9 rounded-lg text-lg text-neutral-500 active:bg-neutral-100 dark:active:bg-neutral-800"
          aria-label="เดือนก่อนหน้า"
        >
          &lsaquo;
        </button>
        <span className="text-sm font-medium">{formatMonth(month)}</span>
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={isCurrentMonth}
          className="size-9 rounded-lg text-lg text-neutral-500 disabled:opacity-25 active:bg-neutral-100 dark:active:bg-neutral-800"
          aria-label="เดือนถัดไป"
        >
          &rsaquo;
        </button>
      </div>

      <section className="viz flex flex-col gap-4">
        <div>
          <p className="text-xs text-neutral-500">
            {over ? "ใช้เกินไปแล้ว" : "เหลือใช้เดือนนี้"}
          </p>
          <p className={`text-5xl font-light ${over ? "text-red-600" : ""}`}>
            {formatBaht(Math.abs(budget.left))}
          </p>
          {/* The one number that changes a decision at the till. */}
          {budget.perDay !== null ? (
            <p className="mt-1 text-sm text-neutral-500">
              เหลืออีก {budget.daysLeft} วัน &rarr; ใช้ได้วันละ{" "}
              <span className="tabular-nums text-neutral-900 dark:text-neutral-100">
                {formatBaht(budget.perDay)}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-neutral-500">
              {budget.daysLeft > 0
                ? `เหลืออีก ${budget.daysLeft} วัน และงบหมดแล้ว`
                : "เดือนนี้จบแล้ว"}
            </p>
          )}
        </div>

        <IncomeBar budget={budget} />
      </section>

      <section className="viz flex flex-col gap-3">
        <h2 className="text-sm font-medium text-neutral-500">ที่มาที่ไป</h2>
        <ul className="flex flex-col gap-2 text-sm">
          <Row label="เงินเดือน" value={budget.salary} />
          {budget.extra > 0 && <Row label="รายรับอื่นที่จด" value={budget.extra} />}
          {budget.spending.map((s) => (
            <Row
              key={s.bucket}
              label={BUCKET_LABEL[s.bucket]}
              value={-s.total}
              share={budget.income > 0 ? s.total / budget.income : 0}
              dot={COLOR[s.bucket]}
            />
          ))}
          <li className="mt-1 flex items-baseline gap-2 border-t border-neutral-200 pt-3 font-medium dark:border-neutral-800">
            <span className="flex-1">เหลือ</span>
            <span className="tabular-nums text-neutral-500">
              {budget.income > 0
                ? `${Math.round((budget.left / budget.income) * 100)}%`
                : ""}
            </span>
            <span className={`w-24 text-right tabular-nums ${over ? "text-red-600" : ""}`}>
              {over ? "-" : ""}
              {formatBaht(Math.abs(budget.left))}
            </span>
          </li>
        </ul>
      </section>

      <div className="flex items-center justify-between text-sm text-neutral-500">
        <button type="button" onClick={() => setEditing(true)} className="underline">
          แก้ไขเงินเดือน
        </button>
        <Link href="/settings" className="underline">
          แก้ไขค่าคงที่
        </Link>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  share,
  dot,
}: {
  label: string;
  value: number;
  share?: number;
  dot?: string;
}) {
  return (
    <li className="flex items-baseline gap-2">
      {dot && (
        <span
          className="inline-block size-2.5 shrink-0 translate-y-px rounded-full"
          style={{ background: dot }}
        />
      )}
      <span className="flex-1 truncate">{label}</span>
      <span className="tabular-nums text-neutral-500">
        {share !== undefined && share > 0 ? `${Math.round(share * 100)}%` : ""}
      </span>
      <span className="w-24 text-right tabular-nums">
        {value < 0 ? "-" : "+"}
        {formatBaht(Math.abs(value))}
      </span>
    </li>
  );
}

/**
 * Spending and what is left, as parts of one month's income. Segments are
 * labelled in the list below — the aqua step is under 3:1 on white, so colour
 * never carries the meaning on its own.
 */
function IncomeBar({ budget }: { budget: ReturnType<typeof buildBudget> }) {
  const scale = Math.max(budget.income, budget.spent);
  if (scale <= 0) return null;

  return (
    <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
      {budget.spending
        .filter((s) => s.total > 0)
        .map((s) => (
          <div
            key={s.bucket}
            style={{ width: `${(s.total / scale) * 100}%`, background: COLOR[s.bucket] }}
          />
        ))}
    </div>
  );
}

function IncomeForm({
  current,
  onDone,
  onCancel,
}: {
  current: number;
  onDone: () => void;
  onCancel: (() => void) | null;
}) {
  const [value, setValue] = useState(current ? String(current / 100) : "");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const minor = parseToMinor(value);
    if (minor === null) return setError("ใส่จำนวนเงินที่ถูกต้อง");
    await setMeta(INCOME_KEY, String(minor));
    onDone();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-medium">รายได้ต่อเดือน</h1>
        <p className="mt-1 text-sm text-neutral-500">
          ใส่ยอดที่เข้าบัญชีจริงหลังหักภาษีและประกันสังคมแล้ว
        </p>
      </div>

      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
        placeholder="41000"
        autoFocus
        className="rounded-xl border border-neutral-200 px-3 py-2.5 text-lg tabular-nums outline-none focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:focus:border-neutral-100"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <p className="text-xs text-neutral-500">
        เก็บไว้ในเครื่องนี้เท่านั้น ไม่ถูกส่งขึ้นเซิร์ฟเวอร์และไม่ sync ไปเครื่องอื่น —
        ถ้าเปิดบนมือถือด้วยต้องใส่ซ้ำอีกครั้ง
      </p>

      <div className={onCancel ? "grid grid-cols-2 gap-3" : "grid"}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-neutral-200 py-2.5 text-sm dark:border-neutral-800"
          >
            ยกเลิก
          </button>
        )}
        <button
          type="button"
          onClick={save}
          className="rounded-xl bg-neutral-900 py-2.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          บันทึก
        </button>
      </div>
    </div>
  );
}
