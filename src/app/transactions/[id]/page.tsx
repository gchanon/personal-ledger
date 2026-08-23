import Link from "next/link";
import { notFound } from "next/navigation";
import { TransactionForm } from "@/components/transaction-form";
import { getActiveLedgerId } from "@/lib/ledger";
import { createClient } from "@/lib/supabase/server";
import type { Category, Transaction, Wallet } from "@/lib/types";

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const ledgerId = await getActiveLedgerId();

  const [transaction, categories, wallets] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, occurred_at, amount_minor, currency, kind, wallet_id, category_id, note")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
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
  ]);

  if (!transaction.data) notFound();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">แก้ไขรายการ</h1>
        <Link href="/transactions" className="text-sm text-neutral-500 underline">
          ยกเลิก
        </Link>
      </header>

      <TransactionForm
        transaction={transaction.data as Transaction}
        categories={(categories.data ?? []) as Category[]}
        wallets={(wallets.data ?? []) as Wallet[]}
      />
    </div>
  );
}
