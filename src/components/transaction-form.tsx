"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createTransaction, deleteTransaction, updateTransaction } from "@/app/actions";
import type { Category, Kind, Transaction, Wallet } from "@/lib/types";

type Props = {
  categories: Category[];
  wallets: Wallet[];
  /** Absent = create mode. Present = edit mode. */
  transaction?: Transaction;
  prefill?: { amount?: string; note?: string; kind?: Kind; category?: string };
};

export function TransactionForm({
  categories,
  wallets,
  transaction,
  prefill = {},
}: Props) {
  const editing = transaction !== undefined;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [kind, setKind] = useState<Kind>(
    transaction?.kind ?? prefill.kind ?? "expense",
  );
  const [amount, setAmount] = useState(
    transaction ? (transaction.amount_minor / 100).toFixed(2) : (prefill.amount ?? ""),
  );
  const [categoryId, setCategoryId] = useState(
    () =>
      transaction?.category_id ??
      categories.find((c) => c.name === prefill.category)?.id ??
      "",
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const visible = categories.filter((c) => c.kind === kind);

  function submit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const result = editing
        ? await updateTransaction(form)
        : await createTransaction(form);

      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (editing) {
        router.push("/transactions");
        return;
      }
      formRef.current?.reset();
      setAmount("");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  function remove() {
    if (!transaction || !confirm("ลบรายการนี้?")) return;
    startTransition(async () => {
      const result = await deleteTransaction(transaction.id);
      if (result.ok) router.push("/transactions");
      else setError(result.error);
    });
  }

  function switchKind(next: Kind) {
    setKind(next);
    setCategoryId(""); // categories don't carry across expense/income
  }

  return (
    <form ref={formRef} action={submit} className="flex flex-col gap-5">
      {editing && <input type="hidden" name="id" value={transaction.id} />}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="category_id" value={categoryId} />

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
        {(["expense", "income"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => switchKind(k)}
            className={`rounded-lg py-2 text-sm font-medium transition ${
              kind === k ? "bg-white shadow-sm dark:bg-neutral-950" : "text-neutral-500"
            }`}
          >
            {k === "expense" ? "รายจ่าย" : "รายรับ"}
          </button>
        ))}
      </div>

      <div className="flex items-baseline justify-center gap-2 py-2">
        <span className="text-3xl text-neutral-400">฿</span>
        <input
          name="amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          autoFocus={!editing}
          placeholder="0"
          aria-label="จำนวนเงิน"
          className={`w-full bg-transparent text-center text-6xl font-light tabular-nums outline-none placeholder:text-neutral-300 dark:placeholder:text-neutral-700 ${
            kind === "income" ? "text-emerald-600" : ""
          }`}
        />
      </div>

      <div className="grid grid-cols-4 gap-2">
        {visible.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategoryId(c.id)}
            className={`flex flex-col items-center gap-1 rounded-xl border py-3 text-xs transition ${
              categoryId === c.id
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                : "border-neutral-200 dark:border-neutral-800"
            }`}
          >
            <span className="text-xl leading-none">{c.icon}</span>
            <span className="line-clamp-1">{c.name}</span>
          </button>
        ))}
      </div>

      <input
        name="note"
        defaultValue={transaction?.note ?? prefill.note ?? ""}
        placeholder="โน้ต (ไม่บังคับ)"
        className="rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:focus:border-neutral-100"
      />

      <div className="grid grid-cols-2 gap-3">
        <select
          name="wallet_id"
          defaultValue={transaction?.wallet_id ?? ""}
          className="rounded-xl border border-neutral-200 px-3 py-3 dark:border-neutral-800 dark:bg-neutral-900"
        >
          {wallets.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          name="occurred_at"
          defaultValue={toLocalInput(transaction?.occurred_at)}
          className="rounded-xl border border-neutral-200 px-3 py-3 dark:border-neutral-800 dark:bg-neutral-900"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-neutral-900 py-4 text-lg font-medium text-white transition disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {pending ? "กำลังบันทึก..." : saved ? "บันทึกแล้ว ✓" : "บันทึก"}
      </button>

      {editing && (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="py-2 text-sm text-red-600 disabled:opacity-50"
        >
          ลบรายการนี้
        </button>
      )}
    </form>
  );
}

/** datetime-local wants local wall-clock time, not an ISO/UTC string. */
function toLocalInput(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
