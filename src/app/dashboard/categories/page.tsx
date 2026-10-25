"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CategoryBars } from "@/components/charts/category-bars";
import {
  byThaiName,
  currentMonthKey,
  dayRange,
  formatDate,
  formatMonth,
  monthBounds,
  spendByCategory,
  type MonthKey,
} from "@/lib/analytics";
import { db } from "@/lib/db";
import { formatBaht } from "@/lib/money";

// Query params rather than [month]/[day] segments, for the same reason as
// /transactions/edit: a static route can be precached, a dynamic one can't.
export default function AllCategoriesPage() {
  return (
    <Suspense fallback={null}>
      <AllCategories />
    </Suspense>
  );
}

function AllCategories() {
  const params = useSearchParams();
  const month: MonthKey = params.get("month") ?? currentMonthKey();
  const dayParam = Number(params.get("day"));
  const day = Number.isInteger(dayParam) && dayParam > 0 ? dayParam : null;

  const [year, monthNumber] = month.split("-").map(Number);
  const range =
    day === null
      ? monthBounds(month)
      : dayRange(new Date(year, monthNumber - 1, day));

  const rows = useLiveQuery(
    async () =>
      db.transactions
        .where("occurred_at")
        .between(range.start.toISOString(), range.end.toISOString())
        .filter((t) => t.deleted_at === null)
        .toArray(),
    [range.start.getTime(), range.end.getTime()],
    [],
  );

  const categories = useLiveQuery(
    async () => (await db.categories.toArray()).filter((c) => c.deleted_at === null),
    [],
    [],
  );

  // Infinity, so nothing folds into an "อื่นๆ" row — seeing every category is
  // the whole point of this page.
  const slices = spendByCategory(rows, categories, range, Infinity);
  const total = slices.reduce((sum, s) => sum + s.total, 0);

  const spent = new Set(slices.map((s) => s.id));
  const untouched = byThaiName(
    categories.filter((c) => c.kind === "expense" && !spent.has(c.id)),
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="min-w-0 truncate text-xl font-semibold">รายจ่ายตามหมวด</h1>
        <Link href="/dashboard" className="shrink-0 text-sm text-neutral-500 underline">
          กลับ
        </Link>
      </header>

      <div>
        <p className="text-xs text-neutral-500">
          {day === null
            ? formatMonth(month)
            : formatDate(new Date(year, monthNumber - 1, day))}
        </p>
        <p className="text-3xl font-light">{formatBaht(total)}</p>
        <p className="mt-1 text-xs text-neutral-500">
          {slices.length} หมวดที่มีรายจ่าย
        </p>
      </div>

      {/* The chart tokens are scoped to .viz, so the bars render colourless
          without this wrapper — same container the dashboard puts them in. */}
      <section className="viz">
        <CategoryBars slices={slices} />
      </section>

      {untouched.length > 0 && (
        <section className="flex flex-col gap-2 border-t border-neutral-200 pt-5 dark:border-neutral-800">
          <h2 className="text-xs text-neutral-500">
            ไม่มีรายจ่ายในช่วงนี้ ({untouched.length} หมวด)
          </h2>
          {/* Listed, not hidden: "฿0" is an answer too, and the only way to
              tell it apart from "I forgot to write it down" is to see the name. */}
          <p className="text-sm leading-relaxed text-neutral-500">
            {untouched.map((c) => `${c.icon ?? "📦"} ${c.name}`).join(" · ")}
          </p>
        </section>
      )}
    </div>
  );
}
