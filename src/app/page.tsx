"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { TransactionForm } from "@/components/transaction-form";
import { db } from "@/lib/db";
import { formatMinor } from "@/lib/money";

export default function AddPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<div className="h-12" />}>
        <TodayHeader />
      </Suspense>
      <Suspense fallback={null}>
        <PrefilledForm />
      </Suspense>
    </div>
  );
}

function TodayHeader() {
  const spentToday = useLiveQuery(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const iso = start.toISOString();

    const rows = await db.transactions
      .where("occurred_at")
      .aboveOrEqual(iso)
      .filter((t) => t.deleted_at === null && t.kind === "expense")
      .toArray();

    return rows.reduce((sum, t) => sum + t.amount_minor, 0);
  }, [], 0);

  return (
    <header className="flex items-baseline justify-between">
      <div>
        <p className="text-xs text-neutral-500">ใช้ไปวันนี้</p>
        <p className="text-2xl font-semibold tabular-nums">฿{formatMinor(spentToday)}</p>
      </div>
    </header>
  );
}

// Prefill lets an iOS Shortcut deep-link straight into a filled form:
//   https://<host>/?amount=80&cat=อาหาร&note=กาแฟ
function PrefilledForm() {
  const params = useSearchParams();

  return (
    <TransactionForm
      prefill={{
        amount: params.get("amount") ?? undefined,
        note: params.get("note") ?? undefined,
        category: params.get("cat") ?? undefined,
        kind: params.get("kind") === "income" ? "income" : undefined,
      }}
    />
  );
}
