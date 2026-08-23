"use client";

import { useEffect, useState } from "react";
import { getMeta } from "@/lib/db";
import { markEverythingDirty, sync } from "@/lib/sync";
import {
  createVault,
  fetchMode,
  fetchWrappedKey,
  forgetKey,
  setMode,
  unlockVault,
  type EncryptionMode,
} from "@/lib/vault";

const MIN_PASSPHRASE = 10;

/**
 * Switching mode rewrites every row on the server, so both directions run the
 * same shape: sync while the current mode still works, flip the flag, flag every
 * local row, sync again. IndexedDB always holds plaintext, so it is the source
 * of truth for the rewrite either way.
 */
export function EncryptionSettings() {
  const [mode, setModeState] = useState<EncryptionMode | null>(null);
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const [target, setTarget] = useState<EncryptionMode | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [hasWrapped, setHasWrapped] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const id = await getMeta("ledger_id");
      if (!id) return;
      setLedgerId(id);
      setModeState(await fetchMode(id));
      setHasWrapped((await fetchWrappedKey(id)) !== null);
    })();
  }, []);

  function reset() {
    setTarget(null);
    setPassphrase("");
    setConfirmation("");
    setAccepted(false);
    setError(null);
  }

  async function rewriteAs(next: EncryptionMode) {
    if (!ledgerId) return;
    // Pull anything remote first: after the flip, rows still in the old shape
    // would need a key this device may no longer be holding.
    await sync();
    await setMode(ledgerId, next);
    await markEverythingDirty();
    const result = await sync();
    if (!result.ok) throw new Error(result.error);
    setModeState(next);
  }

  async function turnOnEncryption() {
    if (!ledgerId) return;
    setError(null);

    if (hasWrapped) {
      // A key already exists from a previous stint on e2ee; reusing it keeps any
      // ciphertext still on the server readable.
      setBusy(true);
      try {
        if (!(await unlockVault(ledgerId, passphrase))) {
          setError("รหัสไม่ถูกต้อง");
          return setBusy(false);
        }
        await rewriteAs("e2ee");
        reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
      return setBusy(false);
    }

    if (passphrase.length < MIN_PASSPHRASE) {
      return setError(`รหัสต้องยาวอย่างน้อย ${MIN_PASSPHRASE} ตัวอักษร`);
    }
    if (passphrase !== confirmation) return setError("รหัสสองช่องไม่ตรงกัน");

    setBusy(true);
    try {
      await createVault(ledgerId, passphrase);
      await rewriteAs("e2ee");
      setHasWrapped(true);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  }

  async function turnOffEncryption() {
    setError(null);
    setBusy(true);
    try {
      await rewriteAs("plaintext");
      await forgetKey(); // nothing left to unlock, so don't keep the key around
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  }

  if (!mode) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">ความเป็นส่วนตัว</h2>

      <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <p className="text-sm font-medium">
          {mode === "e2ee" ? "🔒 เข้ารหัสอยู่" : "👁️ ไม่เข้ารหัส"}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          {mode === "e2ee"
            ? "ข้อมูลถูกเข้ารหัสบนเครื่องก่อนส่งขึ้นเซิร์ฟเวอร์ ผู้ดูแลระบบเปิดดูไม่ได้"
            : "ผู้ดูแลระบบเห็นข้อมูลของคุณได้ทั้งหมด"}
        </p>
      </div>

      {target === null && (
        <button
          type="button"
          onClick={() => setTarget(mode === "e2ee" ? "plaintext" : "e2ee")}
          className="text-left text-sm text-neutral-500 underline"
        >
          {mode === "e2ee" ? "เลิกเข้ารหัส" : "เปิดการเข้ารหัส"}
        </button>
      )}

      {target === "e2ee" && (
        <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <strong>รหัสนี้กู้คืนไม่ได้</strong> — ถ้าลืม ข้อมูลจะอ่านไม่ได้อีกตลอดไป
            ไม่มีใครรีเซ็ตให้ได้รวมถึงผู้พัฒนา
          </div>
          <input
            type="password"
            autoComplete={hasWrapped ? "current-password" : "new-password"}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder={hasWrapped ? "รหัสเดิมของคุณ" : `รหัสใหม่ (อย่างน้อย ${MIN_PASSPHRASE} ตัว)`}
            className={inputClass}
          />
          {!hasWrapped && (
            <input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="ยืนยันรหัสอีกครั้ง"
              className={inputClass}
            />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={reset} className={secondaryClass}>
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={turnOnEncryption}
              disabled={busy}
              className={primaryClass}
            >
              {busy ? "กำลังเข้ารหัส..." : "เปิดการเข้ารหัส"}
            </button>
          </div>
        </div>
      )}

      {target === "plaintext" && (
        <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <strong>ผู้ดูแลระบบจะเห็นข้อมูลของคุณได้ทั้งหมด</strong> — ทั้งจำนวนเงิน
            โน้ต และหมวดหมู่ ข้อมูลเดิมที่เข้ารหัสไว้จะถูกเขียนทับเป็นแบบอ่านได้
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
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={reset} className={secondaryClass}>
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={turnOffEncryption}
              disabled={busy || !accepted}
              className={primaryClass}
            >
              {busy ? "กำลังเขียนใหม่..." : "เลิกเข้ารหัส"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

const inputClass =
  "rounded-xl border border-neutral-200 px-3 py-2.5 outline-none focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:focus:border-neutral-100";
const primaryClass =
  "rounded-xl bg-neutral-900 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900";
const secondaryClass =
  "rounded-xl border border-neutral-200 py-2.5 text-sm dark:border-neutral-800";
