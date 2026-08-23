import type { LocalCategory, LocalTransaction } from "@/lib/db";

/**
 * Aggregation runs over the rows already in IndexedDB, so every dashboard works
 * offline and re-renders instantly. At a few hundred thousand rows this is still
 * well under a frame; if it ever isn't, the fix is a summary table, not a server.
 */

/** "2026-08" — a local calendar month, not a UTC one. */
export type MonthKey = string;

export function toMonthKey(date: Date): MonthKey {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function currentMonthKey(): MonthKey {
  return toMonthKey(new Date());
}

export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const [year, month] = key.split("-").map(Number);
  return toMonthKey(new Date(year, month - 1 + delta, 1));
}

export function monthBounds(key: MonthKey): { start: Date; end: Date } {
  const [year, month] = key.split("-").map(Number);
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 1),
  };
}

export function formatMonth(key: MonthKey, style: "long" | "short" = "long"): string {
  const { start } = monthBounds(key);
  return start.toLocaleDateString("th-TH", {
    month: style === "long" ? "long" : "short",
    year: style === "long" ? "numeric" : undefined,
  });
}

function inMonth(row: LocalTransaction, key: MonthKey): boolean {
  const { start, end } = monthBounds(key);
  const at = new Date(row.occurred_at);
  return at >= start && at < end;
}

// ─── Headline numbers ────────────────────────────────────────────────────────

export type Summary = { income: number; expense: number; net: number };

export function summarize(rows: LocalTransaction[], key: MonthKey): Summary {
  let income = 0;
  let expense = 0;

  for (const row of rows) {
    if (!inMonth(row, key)) continue;
    if (row.kind === "income") income += row.amount_minor;
    else expense += row.amount_minor;
  }

  return { income, expense, net: income - expense };
}

// ─── Spend by category ───────────────────────────────────────────────────────

export type CategorySlice = {
  id: string;
  name: string;
  icon: string;
  total: number;
};

/** Ranked descending. The tail folds into one "อื่นๆ" row rather than growing the chart. */
export function spendByCategory(
  rows: LocalTransaction[],
  categories: LocalCategory[],
  key: MonthKey,
  keep = 7,
): CategorySlice[] {
  const totals = new Map<string, number>();

  for (const row of rows) {
    if (row.kind !== "expense" || !inMonth(row, key)) continue;
    const id = row.category_id ?? "uncategorized";
    totals.set(id, (totals.get(id) ?? 0) + row.amount_minor);
  }

  const byId = new Map(categories.map((c) => [c.id, c]));
  const slices = [...totals.entries()]
    .map(([id, total]) => ({
      id,
      name: byId.get(id)?.name ?? "ไม่ระบุหมวด",
      icon: byId.get(id)?.icon ?? "📦",
      total,
    }))
    .sort((a, b) => b.total - a.total);

  if (slices.length <= keep) return slices;

  const tail = slices.slice(keep);
  return [
    ...slices.slice(0, keep),
    {
      id: "other",
      name: `อื่นๆ (${tail.length} หมวด)`,
      icon: "➕",
      total: tail.reduce((sum, s) => sum + s.total, 0),
    },
  ];
}

// ─── Trend ───────────────────────────────────────────────────────────────────

export type TrendPoint = { key: MonthKey; income: number; expense: number };

/** `months` buckets ending at (and including) `endKey`. */
export function monthlyTrend(
  rows: LocalTransaction[],
  endKey: MonthKey,
  months = 12,
): TrendPoint[] {
  const keys = Array.from({ length: months }, (_, i) =>
    shiftMonth(endKey, i - months + 1),
  );
  const buckets = new Map(
    keys.map((key) => [key, { key, income: 0, expense: 0 }]),
  );

  for (const row of rows) {
    const bucket = buckets.get(toMonthKey(new Date(row.occurred_at)));
    if (!bucket) continue;
    if (row.kind === "income") bucket.income += row.amount_minor;
    else bucket.expense += row.amount_minor;
  }

  return keys.map((key) => buckets.get(key)!);
}

// ─── Daily spend, for the calendar ───────────────────────────────────────────

export type DayCell = { day: number; date: Date; total: number };

export function dailySpend(rows: LocalTransaction[], key: MonthKey): DayCell[] {
  const { start, end } = monthBounds(key);
  const dayCount = Math.round((end.getTime() - start.getTime()) / 86_400_000);

  const cells: DayCell[] = Array.from({ length: dayCount }, (_, i) => ({
    day: i + 1,
    date: new Date(start.getFullYear(), start.getMonth(), i + 1),
    total: 0,
  }));

  for (const row of rows) {
    if (row.kind !== "expense" || !inMonth(row, key)) continue;
    cells[new Date(row.occurred_at).getDate() - 1].total += row.amount_minor;
  }

  return cells;
}

/** Thai dictionary order. Plain string comparison sorts by code point instead. */
export function byThaiName<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, "th"));
}
