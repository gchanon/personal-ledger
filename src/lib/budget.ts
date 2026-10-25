import { monthBounds, spendByBucket, type BucketTotal, type MonthKey } from "@/lib/analytics";
import type { LocalCategory, LocalTransaction } from "@/lib/db";

/**
 * A month measured against what comes in rather than against last month.
 *
 * The salary lives in local `meta`, not in the ledger: it is one number the user
 * knows by heart, it never needs a history, and keeping it off the server means
 * the single most sensitive figure here is never uploaded at all — plaintext
 * ledger or not.
 */
export type Budget = {
  salary: number;
  /** Income rows actually recorded this month — a bonus, a refund. */
  extra: number;
  income: number;
  spending: BucketTotal[];
  spent: number;
  left: number;
  /** Days still to come in the month, today included. 0 once it is over. */
  daysLeft: number;
  /** What `left` allows per remaining day; null when there are none left. */
  perDay: number | null;
};

export function buildBudget(
  rows: LocalTransaction[],
  categories: LocalCategory[],
  month: MonthKey,
  salary: number,
  now = new Date(),
): Budget {
  const range = monthBounds(month);
  const spending = spendByBucket(rows, categories, range);
  const spent = spending.reduce((acc, s) => acc + s.total, 0);

  const extra = rows
    .filter(
      (r) =>
        r.kind === "income" &&
        new Date(r.occurred_at) >= range.start &&
        new Date(r.occurred_at) < range.end,
    )
    .reduce((acc, r) => acc + r.amount_minor, 0);

  const income = salary + extra;
  const left = income - spent;

  // end is the first instant of the next month, so its date number is the
  // length of this one.
  const daysInMonth = new Date(range.end.getTime() - 1).getDate();
  const daysLeft =
    now >= range.end ? 0 : now < range.start ? daysInMonth : daysInMonth - now.getDate() + 1;

  return {
    salary,
    extra,
    income,
    spending,
    spent,
    left,
    daysLeft,
    // A negative allowance is not a budget, it is an overspend; say so with
    // null and let the page word it, rather than printing "-฿120 ต่อวัน".
    perDay: daysLeft > 0 && left > 0 ? Math.floor(left / daysLeft) : null,
  };
}
