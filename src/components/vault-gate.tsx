"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { seedDefaults } from "@/lib/catalog";
import { getMeta, setMeta } from "@/lib/db";
import { createClient } from "@/lib/supabase/client";
import { resetCursors, sync } from "@/lib/sync";
import {
  createVault,
  currentKey,
  fetchMode,
  fetchWrappedKey,
  setMode,
  unlockVault,
} from "@/lib/vault";

const MIN_PASSPHRASE = 10;

type Gate =
  | { state: "checking" }
  | { state: "open" }
  | { state: "choose"; ledgerId: string }
  | { state: "setup"; ledgerId: string }
  | { state: "unlock"; ledgerId: string };

/**
 * Nothing renders until the data key is in hand. Without it the app can neither
 * read what it pulls nor safely write what it pushes, so this is a hard gate
 * rather than a banner.
 */
export function VaultGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [gate, setGate] = useState<Gate>({ state: "checking" });

  const evaluate = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();

    // Signed out: the login page is the whole UI, and there is no ledger yet.
    if (!data.user) return setGate({ state: "open" });

    let ledgerId = await getMeta("ledger_id");
    if (!ledgerId) {
      const { data: member } = await supabase
        .from("ledger_members")
        .select("ledger_id")
        .limit(1)
        .single();
      if (!member) return setGate({ state: "open" });
      ledgerId = member.ledger_id as string;
      await setMeta("ledger_id", ledgerId);
    }

    const mode = await fetchMode(ledgerId);
    if (!mode) return setGate({ state: "choose", ledgerId });

    // Plaintext ledgers have no key to wait for.
    if (mode === "plaintext") return setGate({ state: "open" });

    if (await currentKey()) return setGate({ state: "open" });

    const wrapped = await fetchWrappedKey(ledgerId);
    setGate({ state: wrapped ? "unlock" : "setup", ledgerId });
  }, []);

  useEffect(() => {
    void evaluate();
  }, [evaluate]);

  if (pathname.startsWith("/login")) return <>{children}</>;

  if (gate.state === "checking") {
    return <p className="py-16 text-center text-sm text-neutral-500">กำลังตรวจสอบ...</p>;
  }
  if (gate.state === "open") return <>{children}</>;

  if (gate.state === "choose") {
    return <ChooseMode ledgerId={gate.ledgerId} onDone={evaluate} />;
  }
  return gate.state === "setup" ? (
    <SetupForm ledgerId={gate.ledgerId} onDone={evaluate} />
  ) : (
    <UnlockForm ledgerId={gate.ledgerId} onDone={evaluate} />
  );
}

/**
 * The trade being offered is privacy against recoverability, not privacy against
 * convenience — framed the second way everyone picks convenience without
 * realising what it costs.
 */
function ChooseMode({
  ledgerId,
  onDone,
}: {
  ledgerId: string;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<"e2ee" | "plaintext" | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choosePlaintext() {
    setError(null);
    setBusy(true);
    try {
      await setMode(ledgerId, "plaintext");
      await resetCursors();
      await sync();
      await seedDefaults();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (picked === "e2ee") {
    return <SetupForm ledgerId={ledgerId} onDone={onDone} />;
  }

  return (
    <div className="flex flex-col gap-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">เลือกวิธีเก็บข้อมูล</h1>
        <p className="mt-1 text-sm text-neutral-500">
          เลือกได้ครั้งเดียวตอนนี้ และเปลี่ยนภายหลังได้ในหน้าตั้งค่า
        </p>
      </div>

      <button
        type="button"
        onClick={() => setPicked("e2ee")}
        className="flex flex-col gap-1 rounded-xl border-2 border-neutral-900 p-4 text-left dark:border-neutral-100"
      >
        <span className="font-medium">เข้ารหัส (แนะนำ)</span>
        <span className="text-sm text-neutral-500">
          ข้อมูลถูกเข้ารหัสบนเครื่องก่อนส่งขึ้นเซิร์ฟเวอร์ ผู้ดูแลระบบเปิดดูไม่ได้
          — แลกกับต้องตั้งรหัสที่ <strong>ลืมแล้วกู้คืนไม่ได้</strong>
        </span>
      </button>

      {picked === "plaintext" ? (
        <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="font-medium">ไม่เข้ารหัส</p>
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <strong>ผู้ดูแลระบบจะเห็นข้อมูลของคุณได้ทั้งหมด</strong> — ทั้งจำนวนเงิน
            โน้ต และหมวดหมู่ทุกรายการ แลกกับไม่มีรหัสให้ลืม และเข้าจากเครื่องใหม่ได้เลย
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1"
            />
            <span>ฉันเข้าใจว่าผู้ดูแลระบบจะเห็นข้อมูลของฉันได้</span>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="button"
            onClick={choosePlaintext}
            disabled={busy || !accepted}
            className={primaryClass}
          >
            {busy ? "กำลังตั้งค่า..." : "ใช้แบบไม่เข้ารหัส"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPicked("plaintext")}
          className="flex flex-col gap-1 rounded-xl border border-neutral-200 p-4 text-left dark:border-neutral-800"
        >
          <span className="font-medium">ไม่เข้ารหัส</span>
          <span className="text-sm text-neutral-500">
            ไม่มีรหัสให้ลืม เข้าจากเครื่องใหม่ได้ทันที — แต่ผู้ดูแลระบบจะเห็นข้อมูลของคุณ
          </span>
        </button>
      )}
    </div>
  );
}

function SetupForm({
  ledgerId,
  onDone,
}: {
  ledgerId: string;
  onDone: () => void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (passphrase.length < MIN_PASSPHRASE) {
      return setError(`รหัสต้องยาวอย่างน้อย ${MIN_PASSPHRASE} ตัวอักษร`);
    }
    if (passphrase !== confirmation) return setError("รหัสสองช่องไม่ตรงกัน");

    setError(null);
    setBusy(true);
    try {
      await createVault(ledgerId, passphrase);
      await setMode(ledgerId, "e2ee");
      // Re-read the whole ledger so anything stored before encryption comes
      // back, gets flagged, and is pushed again as ciphertext.
      await resetCursors();
      await sync();
      await seedDefaults();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">ตั้งรหัสเข้ารหัสข้อมูล</h1>
        <p className="mt-1 text-sm text-neutral-500">
          ข้อมูลจะถูกเข้ารหัสบนเครื่องคุณก่อนส่งขึ้นเซิร์ฟเวอร์
          ผู้ดูแลระบบจึงเปิดดูไม่ได้
        </p>
      </div>

      {/* The one thing the user must actually read. */}
      <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
        <p className="font-medium">รหัสนี้กู้คืนไม่ได้</p>
        <p className="mt-1">
          ไม่มีปุ่ม &ldquo;ลืมรหัส&rdquo; และไม่มีใครรีเซ็ตให้ได้ รวมถึงผู้พัฒนา
          ถ้าลืม ข้อมูลทั้งหมดจะอ่านไม่ได้อีกตลอดไป — จดเก็บไว้ในที่ปลอดภัย
        </p>
      </div>

      <input
        type="password"
        autoComplete="new-password"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        placeholder={`รหัส (อย่างน้อย ${MIN_PASSPHRASE} ตัว)`}
        className={inputClass}
      />
      <input
        type="password"
        autoComplete="new-password"
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        placeholder="ยืนยันรหัสอีกครั้ง"
        className={inputClass}
      />

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
          className="mt-1"
        />
        <span>ฉันเข้าใจว่าถ้าลืมรหัสนี้ ข้อมูลจะกู้คืนไม่ได้</span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={busy || !understood} className={primaryClass}>
        {busy ? "กำลังสร้างกุญแจ..." : "ตั้งรหัสและเริ่มใช้งาน"}
      </button>
    </form>
  );
}

function UnlockForm({
  ledgerId,
  onDone,
}: {
  ledgerId: string;
  onDone: () => void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (await unlockVault(ledgerId, passphrase)) {
        void sync();
        onDone();
      } else {
        setError("รหัสไม่ถูกต้อง");
        setBusy(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">ปลดล็อกข้อมูล</h1>
        <p className="mt-1 text-sm text-neutral-500">
          ใส่รหัสเข้ารหัสของคุณ — เครื่องนี้จะจำไว้ ไม่ต้องใส่ทุกครั้ง
        </p>
      </div>

      <input
        type="password"
        autoComplete="current-password"
        autoFocus
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        placeholder="รหัสเข้ารหัสข้อมูล"
        className={inputClass}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={busy} className={primaryClass}>
        {busy ? "กำลังปลดล็อก..." : "ปลดล็อก"}
      </button>
    </form>
  );
}

const inputClass =
  "rounded-xl border border-neutral-300 px-4 py-3 text-base outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-100";
const primaryClass =
  "rounded-xl bg-neutral-900 px-4 py-3 font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900";
