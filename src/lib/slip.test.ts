// Run: node --test src/lib/slip.test.ts
// Sample texts mimic Live Text output; replace them with real slips as they turn up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSlip, slipSeed } from "./slip.ts";

const at = (y: number, mo: number, d: number, h: number, mi: number) =>
  new Date(y, mo - 1, d, h, mi).getTime();

test("K PLUS style: label and value on separate lines, 2-digit BE year", () => {
  const s = parseSlip(`โอนเงินสำเร็จ
13 พ.ย. 69 14:32 น.
นาย ก ข
ธ.กสิกรไทย
xxx-x-x1234-x
ร้านกาแฟ
เลขที่รายการ:
015317143214ABC12345
จำนวน:
1,280.50 บาท
ค่าธรรมเนียม:
0.00 บาท`);
  assert.equal(s.amount, "1280.50");
  assert.equal(s.occurredAt?.getTime(), at(2026, 11, 13, 14, 32));
  assert.equal(s.ref, "015317143214ABC12345");
});

test("SCB style: 4-digit BE year with dash before time", () => {
  const s = parseSlip(`จ่ายเงินสำเร็จ
13 พ.ย. 2569 - 09:05
รหัสอ้างอิง: 2026111309051234
จาก นาย ก ข
ไปยัง 7-ELEVEN
จำนวนเงิน 80.00`);
  assert.equal(s.amount, "80.00");
  assert.equal(s.occurredAt?.getTime(), at(2026, 11, 13, 9, 5));
  assert.equal(s.ref, "2026111309051234");
});

test("OCR spaces inside month abbreviation", () => {
  const s = parseSlip(`วันที่ทำรายการ 1 ม. ค. 2570 - 23:59:10\nจำนวนเงิน 45 บาท`);
  assert.equal(s.amount, "45");
  assert.equal(s.occurredAt?.getTime(), at(2027, 1, 1, 23, 59));
});

test("fee line before amount is not taken as the amount", () => {
  const s = parseSlip(`ค่าธรรมเนียม 0.00 บาท\nจำนวน 350.00 บาท`);
  assert.equal(s.amount, "350.00");
});

test("no label: falls back to number next to บาท / ฿", () => {
  assert.equal(parseSlip(`โอนสำเร็จ\n฿ 99.00`).amount, "99.00");
  assert.equal(parseSlip(`โอนสำเร็จ\n0.00 บาท\n120 บาท`).amount, "120");
});

test("English slip", () => {
  const s = parseSlip(`Transfer successful\n13 Nov 2026 14:32\nAmount 500.00 THB`);
  assert.equal(s.amount, "500.00");
  assert.equal(s.occurredAt?.getTime(), at(2026, 11, 13, 14, 32));
});

test("garbage gives nothing instead of a wrong guess", () => {
  assert.deepEqual(parseSlip("hello"), {
    amount: undefined,
    occurredAt: undefined,
    ref: undefined,
  });
  assert.equal(parseSlip("32 พ.ย. 69 10:00").occurredAt, undefined);
});

test("dedupe seed: ref wins; without one, whitespace-insensitive text", () => {
  const a = "จำนวน 80 บาท\nเลขที่รายการ: 0153ABC12345";
  assert.equal(slipSeed(a, parseSlip(a)), "slip:0153ABC12345");
  const b = "จำนวน 80 บาท\n13 พ.ย. 69";
  assert.equal(slipSeed(b, parseSlip(b)), slipSeed(" จำนวน 80 บาท 13 พ.ย. 69 ", parseSlip(b)));
});

test("short number after a ref label is not a ref", () => {
  assert.equal(parseSlip("เลขที่รายการ: 1234\nจำนวน 5 บาท").ref, undefined);
});
