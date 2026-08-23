"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });

    if (error) {
      setError(error.message);
      setStatus("idle");
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="flex min-h-[70dvh] flex-col justify-center">
      <h1 className="text-2xl font-semibold">รายรับรายจ่าย</h1>
      <p className="mt-1 text-sm text-neutral-500">
        ใส่อีเมลเพื่อรับลิงก์เข้าใช้งาน ไม่ต้องตั้งรหัสผ่าน
      </p>

      {status === "sent" ? (
        <p className="mt-8 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          ส่งลิงก์ไปที่ <strong>{email}</strong> แล้ว เปิดอีเมลแล้วกดลิงก์ได้เลย
        </p>
      ) : (
        <form onSubmit={signIn} className="mt-8 flex flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded-xl border border-neutral-300 px-4 py-3 text-base outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-100"
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="rounded-xl bg-neutral-900 px-4 py-3 font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {status === "sending" ? "กำลังส่ง..." : "ส่งลิงก์เข้าใช้งาน"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
}
