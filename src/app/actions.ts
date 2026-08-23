"use server";

import { revalidatePath } from "next/cache";
import { uuidv7 } from "uuidv7";
import { getActiveLedgerId } from "@/lib/ledger";
import { parseToMinor } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createTransaction(form: FormData): Promise<ActionResult> {
  const amountMinor = parseToMinor(String(form.get("amount") ?? ""));
  if (amountMinor === null) return { ok: false, error: "จำนวนเงินไม่ถูกต้อง" };

  const kind = form.get("kind") === "income" ? "income" : "expense";
  const categoryId = String(form.get("category_id") ?? "") || null;
  const walletId = String(form.get("wallet_id") ?? "") || null;
  const note = String(form.get("note") ?? "").trim() || null;
  const occurredAt = String(form.get("occurred_at") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.from("transactions").insert({
    id: uuidv7(), // client-side id: works offline, and sorts by time
    ledger_id: await getActiveLedgerId(),
    occurred_at: occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString(),
    amount_minor: amountMinor,
    kind,
    category_id: categoryId,
    wallet_id: walletId,
    note,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/transactions");
  return { ok: true };
}

export async function updateTransaction(form: FormData): Promise<ActionResult> {
  const id = String(form.get("id") ?? "");
  const amountMinor = parseToMinor(String(form.get("amount") ?? ""));
  if (!id) return { ok: false, error: "ไม่พบรายการ" };
  if (amountMinor === null) return { ok: false, error: "จำนวนเงินไม่ถูกต้อง" };

  const occurredAt = String(form.get("occurred_at") ?? "");

  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .update({
      amount_minor: amountMinor,
      kind: form.get("kind") === "income" ? "income" : "expense",
      category_id: String(form.get("category_id") ?? "") || null,
      wallet_id: String(form.get("wallet_id") ?? "") || null,
      note: String(form.get("note") ?? "").trim() || null,
      ...(occurredAt ? { occurred_at: new Date(occurredAt).toISOString() } : {}),
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/transactions");
  return { ok: true };
}

/** Soft delete — a hard delete would resurrect from other devices on next sync. */
export async function deleteTransaction(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/transactions");
  return { ok: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
}
