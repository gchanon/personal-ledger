import { createClient } from "@/lib/supabase/server";

/**
 * The ledger the user is currently working in. One per user today; when sharing
 * lands this becomes a cookie-backed selection over their memberships.
 */
export async function getActiveLedgerId(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ledger_members")
    .select("ledger_id")
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error("ไม่พบบัญชีของผู้ใช้นี้");
  }
  return data.ledger_id;
}
