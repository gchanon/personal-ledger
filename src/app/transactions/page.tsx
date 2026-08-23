import Link from "next/link";
import { getActiveLedgerId } from "@/lib/ledger";
import { formatMinor } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 100;

// Rendering happens on the server (UTC on most hosts), so every date boundary
// has to name the ledger's zone explicitly.
const TZ = "Asia/Bangkok";

export default async function TransactionsPage() {
  const supabase = await createClient();
  const ledgerId = await getActiveLedgerId();

  const { data } = await supabase
    .from("transactions")
    .select("id, occurred_at, amount_minor, kind, note, categories(name, icon)")
    .eq("ledger_id", ledgerId)
    .is("deleted_at", null)
    .order("occurred_at", { ascending: false })
    .limit(PAGE_SIZE);

  const rows = (data ?? []) as unknown as Row[];
  const byDay = groupByDay(rows);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">รายการล่าสุด</h1>
        <Link href="/" className="text-sm text-neutral-500 underline">
          จดรายการ
        </Link>
      </header>

      {rows.length === 0 && (
        <p className="py-12 text-center text-sm text-neutral-500">
          ยังไม่มีรายการ — เริ่มจดได้เลย
        </p>
      )}

      {byDay.map(([day, items]) => (
        <section key={day} className="flex flex-col gap-1">
          <div className="flex justify-between px-1 pb-1 text-xs text-neutral-500">
            <span>{formatDay(day)}</span>
            <span className="tabular-nums">
              ฿{formatMinor(dayTotal(items))}
            </span>
          </div>

          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {items.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/transactions/${t.id}`}
                  className="flex items-center gap-3 px-3 py-3 active:bg-neutral-50 dark:active:bg-neutral-900"
                >
                  <span className="text-xl">{t.categories?.icon ?? "📦"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {t.categories?.name ?? "ไม่ระบุหมวด"}
                    </span>
                    {t.note && (
                      <span className="block truncate text-xs text-neutral-500">
                        {t.note}
                      </span>
                    )}
                  </span>
                  <span
                    className={`tabular-nums ${
                      t.kind === "income" ? "text-emerald-600" : ""
                    }`}
                  >
                    {t.kind === "income" ? "+" : "-"}
                    {formatMinor(t.amount_minor)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

type Row = {
  id: string;
  occurred_at: string;
  amount_minor: number;
  kind: string;
  note: string | null;
  categories: { name: string; icon: string | null } | null;
};

function groupByDay(rows: Row[]): [string, Row[]][] {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    // Group by local calendar day. Slicing the ISO string would bucket a 03:00
    // Bangkok transaction into the previous UTC day.
    const day = new Date(row.occurred_at).toLocaleDateString("sv-SE", { timeZone: TZ });
    const bucket = map.get(day);
    if (bucket) bucket.push(row);
    else map.set(day, [row]);
  }
  return [...map.entries()];
}

function dayTotal(items: Row[]): number {
  return items.reduce(
    (sum, t) => sum + (t.kind === "income" ? t.amount_minor : -t.amount_minor),
    0,
  );
}

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
