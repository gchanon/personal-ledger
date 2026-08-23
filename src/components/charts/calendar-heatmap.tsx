"use client";

import { useState } from "react";
import type { DayCell } from "@/lib/analytics";
import { formatBaht } from "@/lib/money";

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const STEPS = 5;

/**
 * Magnitude on a grid — sequential, one hue, more-is-darker (more-is-lighter on
 * the dark surface, where receding means going toward black).
 */
export function CalendarHeatmap({ cells }: { cells: DayCell[] }) {
  const [selected, setSelected] = useState<DayCell | null>(null);

  const max = Math.max(...cells.map((c) => c.total), 0);
  const leadingBlanks = cells.length > 0 ? cells[0].date.getDay() : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-neutral-400">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}

        {cells.map((cell) => {
          const step = bucket(cell.total, max);
          return (
            <button
              key={cell.day}
              type="button"
              onClick={() => setSelected(cell)}
              aria-label={`วันที่ ${cell.day} ใช้ไป ${formatBaht(cell.total)}`}
              className={`flex aspect-square items-center justify-center rounded-md text-[10px] tabular-nums transition ${
                selected?.day === cell.day
                  ? "ring-2 ring-neutral-900 dark:ring-neutral-100"
                  : ""
              } ${
                step >= 4
                  ? "text-white dark:text-neutral-900"
                  : "text-neutral-500 dark:text-neutral-300"
              }`}
              style={{ background: `var(--viz-heat-${step})` }}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>
          {selected
            ? `${selected.day} — ${formatBaht(selected.total)}`
            : "แตะวันที่เพื่อดูยอด"}
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[10px]">น้อย</span>
          {Array.from({ length: STEPS + 1 }, (_, i) => (
            <span
              key={i}
              className="inline-block size-2.5 rounded-sm ring-1 ring-black/10 dark:ring-white/10"
              style={{ background: `var(--viz-heat-${i})` }}
            />
          ))}
          <span className="text-[10px]">มาก</span>
        </span>
      </div>
    </div>
  );
}

function bucket(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(STEPS, Math.ceil((value / max) * STEPS));
}
