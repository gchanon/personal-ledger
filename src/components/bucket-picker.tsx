"use client";

import { BUCKET_LABEL, BUCKET_ORDER } from "@/lib/analytics";
import type { Bucket } from "@/lib/types";

const HINT: Record<Bucket, string> = {
  fixed: "จ่ายทุกเดือนไม่ว่าจะใช้หรือไม่",
  investment: "จ่ายแล้วคาดว่าจะได้กลับมา",
  variable: "ขึ้นลงตามการใช้ชีวิต",
};

export function BucketPicker({
  value,
  onChange,
}: {
  value: Bucket;
  onChange: (bucket: Bucket) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-neutral-500">กลุ่ม</span>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
        {BUCKET_ORDER.map((bucket) => (
          <button
            key={bucket}
            type="button"
            onClick={() => onChange(bucket)}
            aria-pressed={value === bucket}
            className={`rounded-lg py-1.5 text-xs font-medium transition ${
              value === bucket
                ? "bg-white shadow-sm dark:bg-neutral-950"
                : "text-neutral-500"
            }`}
          >
            {BUCKET_LABEL[bucket]}
          </button>
        ))}
      </div>
      <span className="text-xs text-neutral-400">{HINT[value]}</span>
    </div>
  );
}
