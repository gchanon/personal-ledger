import Link from "next/link";
import { TransactionForm } from "@/components/transaction-form";
import { getActiveLedgerId } from "@/lib/ledger";
import { formatMinor } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Category, Kind, Wallet } from "@/lib/types";

export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const ledgerId = await getActiveLedgerId();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [categories, wallets, today] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, kind, icon")
      .eq("ledger_id", ledgerId)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("wallets")
      .select("id, name, kind")
      .eq("ledger_id", ledgerId)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("transactions")
      .select("amount_minor, kind")
      .eq("ledger_id", ledgerId)
      .is("deleted_at", null)
      .gte("occurred_at", startOfToday.toISOString()),
  ]);

  const spentToday = (today.data ?? [])
    .filter((t) => t.kind === "expense")
    .reduce((sum, t) => sum + t.amount_minor, 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-baseline justify-between">
        <div>
          <p className="text-xs text-neutral-500">ใช้ไปวันนี้</p>
          <p className="text-2xl font-semibold tabular-nums">
            ฿{formatMinor(spentToday)}
          </p>
        </div>
        <Link href="/transactions" className="text-sm text-neutral-500 underline">
          ดูรายการ
        </Link>
      </header>

      <TransactionForm
        categories={(categories.data ?? []) as Category[]}
        wallets={(wallets.data ?? []) as Wallet[]}
        prefill={{
          amount: str(params.amount),
          note: str(params.note),
          category: str(params.cat),
          kind: str(params.kind) === "income" ? "income" : undefined,
        }}
      />
    </div>
  );
}

function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// Prefill lets an iOS Shortcut deep-link straight into a filled form:
//   https://<host>/?amount=80&cat=อาหาร&note=กาแฟ
