"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { db, type LocalCategory, type LocalTransaction } from "@/lib/db";
import { formatMinor } from "@/lib/money";
import { liveTransactions } from "@/lib/transactions";

const PAGE_SIZE = 200;

export default function TransactionsPage() {
  const rows = useLiveQuery(() => liveTransactions(PAGE_SIZE), [], []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);

  const byId = new Map(categories.map((c: LocalCategory) => [c.id, c]));
  const byDay = groupByDay(rows);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">รายการล่าสุด</h1>
        <Link href="/" className="text-sm text-neutral-500 underline">
          จดรายการ
        </Link>
      </header>

      {rows.length === 0 && (
        <p className="py-12 text-center text-sm text-neutral-500">
          ยังไม่มีรายการ — เริ่มจดได้เลย
        </p>
      )}

      {byDay.map(([day, items]) => (
        <section key={day} className="flex flex-col gap-1">
          <div className="flex justify-between px-1 pb-1 text-xs text-neutral-500">
            <span>{formatDay(day)}</span>
            <span className="tabular-nums">{formatSigned(dayTotal(items))}</span>
          </div>

          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {items.map((t) => {
              const category = t.category_id ? byId.get(t.category_id) : undefined;
              return (
                <li key={t.id}>
                  <Link
                    href={`/transactions/edit?id=${t.id}`}
                    className="flex items-center gap-3 px-3 py-3 active:bg-neutral-50 dark:active:bg-neutral-900"
                  >
                    <span className="text-xl">{category?.icon ?? "📦"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {category?.name ?? "ไม่ระบุหมวด"}
                      </span>
                      {t.note && (
                        <span className="block truncate text-xs text-neutral-500">
                          {t.note}
                        </span>
                      )}
                    </span>
                    {t.dirty === 1 && (
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-blue-500"
                        title="ยังไม่ได้ซิงก์"
                      />
                    )}
                    <span
                      className={`tabular-nums ${t.kind === "income" ? "text-emerald-600" : ""}`}
                    >
                      {t.kind === "income" ? "+" : "-"}
                      {formatMinor(t.amount_minor)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function groupByDay(rows: LocalTransaction[]): [string, LocalTransaction[]][] {
  const map = new Map<string, LocalTransaction[]>();
  for (const row of rows) {
    // Group by the device's calendar day. Slicing the ISO string would bucket a
    // 03:00 Bangkok transaction into the previous UTC day.
    const day = new Date(row.occurred_at).toLocaleDateString("sv-SE");
    const bucket = map.get(day);
    if (bucket) bucket.push(row);
    else map.set(day, [row]);
  }
  return [...map.entries()];
}

function dayTotal(items: LocalTransaction[]): number {
  return items.reduce(
    (sum, t) => sum + (t.kind === "income" ? t.amount_minor : -t.amount_minor),
    0,
  );
}

function formatSigned(minor: number): string {
  return `${minor < 0 ? "-" : "+"}฿${formatMinor(Math.abs(minor))}`;
}

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
