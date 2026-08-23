"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearLocalData, db } from "@/lib/db";
import { createClient } from "@/lib/supabase/client";
import { sync } from "@/lib/sync";

export function SyncBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const pending = useLiveQuery(
    () => db.transactions.where("dirty").equals(1).count(),
    [],
    0,
  );

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // No service worker means no offline shell; the app still works online.
      });
    }
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);

    async function attempt() {
      setOnline(navigator.onLine);
      if (!navigator.onLine) return;
      setSyncing(true);
      await sync();
      setSyncing(false);
    }

    function onVisible() {
      if (document.visibilityState === "visible") void attempt();
    }

    void attempt();
    window.addEventListener("online", attempt);
    window.addEventListener("offline", () => setOnline(false));
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("online", attempt);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  async function signOut() {
    await createClient().auth.signOut();
    await clearLocalData(); // otherwise the next user reads this one's rows
    router.push("/login");
    router.refresh();
  }

  // Nothing to sync or sign out of before the user is authenticated.
  if (pathname.startsWith("/login")) return null;

  const label = !online
    ? `ออฟไลน์${pending > 0 ? ` · รอซิงก์ ${pending}` : ""}`
    : syncing
      ? "กำลังซิงก์..."
      : pending > 0
        ? `รอซิงก์ ${pending}`
        : "ซิงก์แล้ว";

  return (
    <div className="flex items-center justify-between pt-6 text-xs text-neutral-400">
      <span className="flex items-center gap-1.5">
        <span
          className={`inline-block size-1.5 rounded-full ${
            !online ? "bg-amber-500" : pending > 0 ? "bg-blue-500" : "bg-emerald-500"
          }`}
        />
        {label}
      </span>
      <button onClick={signOut} className="underline">
        ออกจากระบบ
      </button>
    </div>
  );
}
