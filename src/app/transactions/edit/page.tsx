"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { TransactionForm } from "@/components/transaction-form";
import { db } from "@/lib/db";

// A query param rather than a [id] segment: a static route can be precached by
// the service worker, a dynamic one can't, and editing has to work offline too.
export default function EditTransactionPage() {
  return (
    <Suspense fallback={null}>
      <Editor />
    </Suspense>
  );
}

function Editor() {
  const id = useSearchParams().get("id") ?? "";
  // undefined = still loading, null = no such row.
  const transaction = useLiveQuery(
    async () => (await db.transactions.get(id)) ?? null,
    [id],
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">แก้ไขรายการ</h1>
        <Link href="/transactions" className="text-sm text-neutral-500 underline">
          ยกเลิก
        </Link>
      </header>

      {transaction === undefined ? (
        <p className="py-12 text-center text-sm text-neutral-500">กำลังโหลด...</p>
      ) : transaction === null ? (
        <p className="py-12 text-center text-sm text-neutral-500">ไม่พบรายการนี้</p>
      ) : (
        <TransactionForm transaction={transaction} />
      )}
    </div>
  );
}
