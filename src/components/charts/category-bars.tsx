"use client";

import type { CategorySlice } from "@/lib/analytics";
import { formatBaht } from "@/lib/money";

/**
 * Ranked horizontal bars, not a donut: the reader's job here is comparing
 * categories that often sit close together, which a pie is bad at, and Thai
 * category names need horizontal room to sit beside their mark.
 *
 * One series means one color — a darker-where-bigger ramp would re-encode bar
 * length as hue and spend the only free channel on nothing.
 */
export function CategoryBars({ slices }: { slices: CategorySlice[] }) {
  if (slices.length === 0) {
    return <Empty>ยังไม่มีรายจ่ายในเดือนนี้</Empty>;
  }

  const max = slices[0].total;

  return (
    <ul className="flex flex-col gap-3">
      {slices.map((slice) => (
        <li key={slice.id} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">
              <span aria-hidden>{slice.icon}</span> {slice.name}
            </span>
            {/* Direct label: every value stays readable without a hover layer,
                which a touch device doesn't have. */}
            <span className="shrink-0 tabular-nums text-neutral-500">
              {formatBaht(slice.total)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-900">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(slice.total / max) * 100}%`,
                background: "var(--viz-series-1)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-sm text-neutral-500">{children}</p>
  );
}
