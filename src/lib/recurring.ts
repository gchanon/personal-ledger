import { shiftMonth, toMonthKey, type MonthKey } from "@/lib/analytics";
import { db, getMeta, type LocalRecurring } from "@/lib/db";
import { derivedId } from "@/lib/ids";
import { sync } from "@/lib/sync";

/**
 * Turns standing commitments into real transactions.
 *
 * Everything downstream — charts, filters, totals, the ledger list — keeps
 * working without knowing recurring exists, because what it sees is an ordinary
 * transaction.
 */

/** A bad start_month shouldn't spin through a decade of months. */
const MAX_BACKFILL_MONTHS = 60;

/**
 * The id is derived from the rule and the month rather than generated, which is
 * what makes this safe to run repeatedly: a second run finds the row already
 * there, and two devices generating the same month converge on one row instead
 * of quietly producing two identical bills.
 */
export async function occurrenceId(
  recurringId: string,
  month: MonthKey,
): Promise<string> {
  return derivedId(`recurring:${recurringId}:${month}`);
}

/** Clamps to the last day of shorter months, so "the 31st" still works in April. */
export function occurrenceDate(month: MonthKey, dayOfMonth: number): Date {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return new Date(year, monthNumber - 1, Math.min(dayOfMonth, lastDay), 12, 0, 0);
}

function monthsUpTo(start: MonthKey, end: MonthKey): MonthKey[] {
  const months: MonthKey[] = [];
  let cursor = start;
  while (cursor <= end && months.length < MAX_BACKFILL_MONTHS) {
    months.push(cursor);
    cursor = shiftMonth(cursor, 1);
  }
  return months;
}

/** Returns how many transactions were created. */
export async function materializeRecurring(now = new Date()): Promise<number> {
  const ledger = await getMeta("ledger_id");
  if (!ledger) return 0;

  const rules = await db.recurring.filter((r) => r.deleted_at === null).toArray();
  if (rules.length === 0) return 0;

  const thisMonth = toMonthKey(now);
  const timestamp = now.toISOString();
  let created = 0;

  for (const rule of rules) {
    for (const month of monthsUpTo(rule.start_month, thisMonth)) {
      const occurred = occurrenceDate(month, rule.day_of_month);
      // Don't book a bill before its date arrives.
      if (occurred > now) continue;

      const id = await occurrenceId(rule.id, month);
      // Also catches one the user deleted: the tombstone still occupies the id,
      // so a removed bill doesn't reappear on the next run.
      if (await db.transactions.get(id)) continue;

      await db.transactions.add({
        id,
        ledger_id: ledger,
        occurred_at: occurred.toISOString(),
        amount_minor: rule.amount_minor,
        currency: "THB",
        kind: rule.kind,
        wallet_id: rule.wallet_id,
        category_id: rule.category_id,
        note: rule.note ?? rule.label,
        updated_at: timestamp,
        deleted_at: null,
        dirty: 1,
      });
      created += 1;
    }
  }

  if (created > 0) void sync();
  return created;
}

/** What the standing commitments add up to per month, for the dashboard. */
export function monthlyCommitment(rules: LocalRecurring[]): number {
  return rules
    .filter((r) => r.kind === "expense")
    .reduce((sum, r) => sum + r.amount_minor, 0);
}
