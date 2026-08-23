"use client";

import { useState } from "react";
import { formatMonth, type TrendPoint } from "@/lib/analytics";
import { formatBaht } from "@/lib/money";

const W = 320;
const H = 150;
const PAD = { top: 14, right: 6, bottom: 20, left: 6 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/**
 * Income and expense share one y-axis — both are baht, so a second scale would
 * invent a relationship that isn't in the data.
 *
 * Touch devices have no hover, so the readout is tap-driven: tapping a column
 * pins the crosshair and prints both values above the plot.
 */
export function TrendLines({ points }: { points: TrendPoint[] }) {
  const [selected, setSelected] = useState<number | null>(null);

  const max = Math.max(
    1,
    ...points.map((p) => Math.max(p.income, p.expense)),
  );
  const active = selected ?? points.length - 1;
  const shown = points[active];

  const x = (i: number) => PAD.left + (i * PLOT_W) / Math.max(1, points.length - 1);
  const y = (value: number) => PAD.top + PLOT_H * (1 - value / max);
  const path = (pick: (p: TrendPoint) => number) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)} ${y(pick(p))}`).join(" ");

  return (
    <div className="flex flex-col gap-2">
      {/* Legend doubles as the readout — identity is never carried by color alone. */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
        <span className="text-neutral-500">{formatMonth(shown.key)}</span>
        <Key color="var(--viz-series-1)" label="รายจ่าย" value={shown.expense} />
        <Key color="var(--viz-series-2)" label="รายรับ" value={shown.income} />
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`แนวโน้มรายรับรายจ่าย ${points.length} เดือน`}
      >
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(max)}
          y2={y(max)}
          stroke="var(--viz-grid)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <text x={PAD.left} y={PAD.top - 4} fontSize={9} fill="var(--viz-muted)">
          {formatBaht(max)}
        </text>
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(0)}
          y2={y(0)}
          stroke="var(--viz-axis)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />

        <line
          x1={x(active)}
          x2={x(active)}
          y1={PAD.top}
          y2={y(0)}
          stroke="var(--viz-axis)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />

        <path
          d={path((p) => p.expense)}
          fill="none"
          stroke="var(--viz-series-1)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path((p) => p.income)}
          fill="none"
          stroke="var(--viz-series-2)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* 2px surface ring keeps the markers legible where the lines cross. */}
        <circle cx={x(active)} cy={y(shown.expense)} r={4} fill="var(--viz-series-1)" stroke="var(--background)" strokeWidth={2} />
        <circle cx={x(active)} cy={y(shown.income)} r={4} fill="var(--viz-series-2)" stroke="var(--background)" strokeWidth={2} />

        {points.map((p, i) =>
          i % 3 === 0 || i === points.length - 1 ? (
            <text
              key={p.key}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              fontSize={9}
              fill="var(--viz-muted)"
            >
              {formatMonth(p.key, "short")}
            </text>
          ) : null,
        )}

        {/* Hit areas are a full column wide, well past the 24px minimum. */}
        {points.map((p, i) => (
          <rect
            key={`hit-${p.key}`}
            x={x(i) - PLOT_W / points.length / 2}
            y={0}
            width={PLOT_W / points.length}
            height={H}
            fill="transparent"
            onClick={() => setSelected(i)}
          />
        ))}
      </svg>
    </div>
  );
}

function Key({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        className="inline-block size-2 shrink-0 translate-y-px rounded-full"
        style={{ background: color }}
      />
      <span className="text-neutral-500">{label}</span>
      <span className="tabular-nums">{formatBaht(value)}</span>
    </span>
  );
}
