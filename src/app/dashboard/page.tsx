"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useState } from "react";
import { BucketBars } from "@/components/charts/bucket-bars";
import { CalendarHeatmap } from "@/components/charts/calendar-heatmap";
import { CategoryBars } from "@/components/charts/category-bars";
import { TrendLines } from "@/components/charts/trend-lines";
import {
  currentMonthKey,
  dailySpend,
  dayRange,
  formatDate,
  formatMonth,
  monthBounds,
  monthlyTrend,
  shiftMonth,
  spendByBucket,
  spendByCategory,
  summarize,
  type MonthKey,
} from "@/lib/analytics";
import { db } from "@/lib/db";
import { formatBaht } from "@/lib/money";

const TREND_MONTHS = 12;

export default function DashboardPage() {
  const [month, setMonth] = useState<MonthKey>(currentMonthKey);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // One window covers every chart on the page: the trend needs the 11 months
  // before the selected one, the rest need only the month itself.
  const rows = useLiveQuery(async () => {
    const from = monthBounds(shiftMonth(month, -(TREND_MONTHS - 1))).start;
    const to = monthBounds(month).end;
    return db.transactions
      .where("occurred_at")
      .between(from.toISOString(), to.toISOString())
      .filter((t) => t.deleted_at === null)
      .toArray();
  }, [month], []);

  const categories = useLiveQuery(() => db.categories.toArray(), [], []);

  const summary = summarize(rows, month);
  const isCurrentMonth = month === currentMonthKey();

  const cells = dailySpend(rows, month);
  const selectedDate = cells.find((c) => c.day === selectedDay)?.date ?? null;
  // No day picked means the breakdown covers the whole month.
  const scope = selectedDate ? dayRange(selectedDate) : monthBounds(month);

  return (
    <div className="flex flex-col gap-8">
      {/* One filter row, above everything it scopes. */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setMonth(shiftMonth(month, -1));
            setSelectedDay(null);
          }}
          className="size-9 rounded-lg text-lg text-neutral-500 active:bg-neutral-100 dark:active:bg-neutral-800"
          aria-label="เดือนก่อนหน้า"
        >
          ‹
        </button>
        <span className="text-sm font-medium">{formatMonth(month)}</span>
        <button
          type="button"
          onClick={() => {
            setMonth(shiftMonth(month, 1));
            setSelectedDay(null);
          }}
          disabled={isCurrentMonth}
          className="size-9 rounded-lg text-lg text-neutral-500 disabled:opacity-25 active:bg-neutral-100 dark:active:bg-neutral-800"
          aria-label="เดือนถัดไป"
        >
          ›
        </button>
      </div>

      <section className="viz flex flex-col gap-4">
        <div>
          <p className="text-xs text-neutral-500">รายจ่ายเดือนนี้</p>
          {/* Hero figure: proportional digits, system sans, no chart needed. */}
          <p className="text-5xl font-light">{formatBaht(summary.expense)}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="รายรับ" value={summary.income} />
          <Stat label="คงเหลือ" value={summary.net} signed />
        </div>
      </section>

      <Panel title="แยกตามกลุ่ม — ทั้งเดือน">
        <BucketBars totals={spendByBucket(rows, categories, monthBounds(month))} />
      </Panel>

      {/* The calendar sits above the breakdown because it selects for it:
          picking a day should change something the eye is already heading toward,
          not something it has already passed. */}
      <Panel title="ใช้จ่ายรายวัน">
        <CalendarHeatmap
          cells={cells}
          selectedDay={selectedDay}
          onSelect={setSelectedDay}
        />
      </Panel>

      <section className="viz flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-neutral-500">
            {selectedDate ? `หมดไปกับอะไร — ${formatDate(selectedDate)}` : "รายจ่ายตามหมวด — ทั้งเดือน"}
          </h2>
          {selectedDay !== null && (
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="shrink-0 text-sm text-neutral-500 underline"
            >
              ดูทั้งเดือน
            </button>
          )}
        </div>
        <CategoryBars slices={spendByCategory(rows, categories, scope)} />
        {/* The chart keeps a ranked top few; everything below the fold lives
            one tap away rather than stretching the page. */}
        <Link
          href={`/dashboard/categories?month=${month}${selectedDay ? `&day=${selectedDay}` : ""}`}
          className="text-sm text-neutral-500 underline"
        >
          ดูทุกหมวด &rsaquo;
        </Link>
      </section>

      <Panel title={`แนวโน้ม ${TREND_MONTHS} เดือน`}>
        <TrendLines points={monthlyTrend(rows, month, TREND_MONTHS)} />
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="viz flex flex-col gap-4">
      <h2 className="text-sm font-medium text-neutral-500">{title}</h2>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  signed = false,
}: {
  label: string;
  value: number;
  signed?: boolean;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`text-lg ${signed && value < 0 ? "text-red-600" : ""}`}>
        {signed && value !== 0 ? (value > 0 ? "+" : "-") : ""}
        {formatBaht(Math.abs(value))}
      </p>
    </div>
  );
}
