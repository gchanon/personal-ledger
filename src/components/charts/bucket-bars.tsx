"use client";

import { BUCKET_LABEL, type BucketTotal } from "@/lib/analytics";
import { formatBaht } from "@/lib/money";
import type { Bucket } from "@/lib/types";

const COLOR: Record<Bucket, string> = {
  fixed: "var(--viz-series-1)",
  investment: "var(--viz-series-3)",
  variable: "var(--viz-series-2)",
};

/**
 * Part-to-whole across three named things, so this is categorical: one hue per
 * bucket, assigned by identity and never by rank, so the colours hold still as
 * the amounts move month to month.
 *
 * Every segment is also spelled out in the rows below. That is deliberate — the
 * aqua step sits under 3:1 against a white surface, so colour alone is never
 * carrying the meaning here.
 */
export function BucketBars({ totals }: { totals: BucketTotal[] }) {
  const sum = totals.reduce((acc, t) => acc + t.total, 0);

  if (sum === 0) {
    return (
      <p className="py-6 text-center text-sm text-neutral-500">
        ยังไม่มีรายจ่ายในช่วงนี้
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 2px surface gaps between segments rather than borders around them. */}
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {totals
          .filter((t) => t.total > 0)
          .map((t) => (
            <div
              key={t.bucket}
              style={{
                width: `${(t.total / sum) * 100}%`,
                background: COLOR[t.bucket],
              }}
            />
          ))}
      </div>

      <ul className="flex flex-col gap-2">
        {totals.map((t) => (
          <li key={t.bucket} className="flex items-baseline gap-2 text-sm">
            <span
              className="inline-block size-2.5 shrink-0 translate-y-px rounded-full"
              style={{ background: COLOR[t.bucket] }}
            />
            <span className="flex-1 truncate">{BUCKET_LABEL[t.bucket]}</span>
            <span className="tabular-nums text-neutral-500">
              {Math.round((t.total / sum) * 100)}%
            </span>
            <span className="w-20 text-right tabular-nums">
              {formatBaht(t.total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
