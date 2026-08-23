"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [oauthPending, setOauthPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read straight from the URL rather than useSearchParams, which would force a
  // Suspense boundary around a statically prerendered page.
  useEffect(() => {
    const reason = new URLSearchParams(location.search).get("error");
    if (reason === "link_expired") setError("ลิงก์หมดอายุหรือถูกใช้ไปแล้ว ขอใหม่อีกครั้งได้เลย");
    else if (reason === "oauth") setError("เข้าใช้งานด้วย Google ไม่สำเร็จ ลองใหม่อีกครั้ง");
  }, []);

  async function signInWithGoogle() {
    setOauthPending(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });

    // On success the browser has already navigated away, so only failure lands here.
    if (error) {
      setError(error.message);
      setOauthPending(false);
    }
  }

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });

    if (error) {
      setError(describe(error.message));
      setStatus("idle");
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="flex min-h-[70dvh] flex-col justify-center">
      <h1 className="text-2xl font-semibold">รายรับรายจ่าย</h1>
      <p className="mt-1 text-sm text-neutral-500">
        เข้าใช้งานเพื่อซิงก์ข้อมูลข้ามเครื่อง
      </p>

      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={oauthPending}
        className="mt-8 flex items-center justify-center gap-3 rounded-xl border border-neutral-300 px-4 py-3 font-medium disabled:opacity-50 dark:border-neutral-700"
      >
        <GoogleMark />
        {oauthPending ? "กำลังพาไป Google..." : "เข้าใช้งานด้วย Google"}
      </button>

      <div className="my-6 flex items-center gap-3 text-xs text-neutral-400">
        <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
        หรือใช้อีเมล
        <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
      </div>

      {status === "sent" ? (
        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          ส่งลิงก์ไปที่ <strong>{email}</strong> แล้ว เปิดอีเมลแล้วกดลิงก์ได้เลย
        </p>
      ) : (
        <form onSubmit={signInWithEmail} className="flex flex-col gap-3">
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
        </form>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}

/** The email quota is small enough that users hit it during normal setup. */
function describe(message: string): string {
  return /rate limit|too many requests/i.test(message)
    ? "ส่งอีเมลบ่อยเกินโควตา รอสักครู่แล้วลองใหม่ หรือใช้ Google แทน"
    : message;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
