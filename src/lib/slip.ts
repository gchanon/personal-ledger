/**
 * Reads a Thai bank transfer slip from the text iOS Live Text extracts from it.
 * An iOS Shortcut does the OCR on the phone and deep-links the raw text here as
 * `?slip=`, so fixing a bank's layout is a code change, not a Shortcut edit.
 *
 * OCR text is messy: labels and values land on the same or the next line, and
 * dots in month abbreviations sometimes pick up spaces ("พ. ย.").
 */

export type Slip = {
  /** "1,234.50" -> "1234.50"; ready for parseToMinor. */
  amount?: string;
  /** Local wall-clock time printed on the slip. */
  occurredAt?: Date;
  /** The bank's transaction reference — unique per transfer, so it dedupes. */
  ref?: string;
};

const THAI_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];
const EN_MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

const NUMBER = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?`;

// The amount label, then the first number on the same or a following line.
// "ค่าธรรมเนียม" (fee) also ends in a number, so it must never be the label.
const AMOUNT_LABEL = new RegExp(
  String.raw`(?:จำนวนเงิน|จำนวน|ยอดเงิน|ยอดชำระ|ยอดโอน|amount)\s*:?[^\d\n]*\n?[^\d\n]*?(${NUMBER})`,
  "i",
);
// References are long runs of letters and digits; a short one is more likely
// a stray account fragment than the transaction id.
const REF_LABEL =
  /(?:เลขที่รายการ|รหัสอ้างอิง|หมายเลขอ้างอิง|เลขอ้างอิง|ref(?:erence)?(?:\s*no\.?)?|transaction\s*id)\s*:?\s*\n?\s*([A-Za-z0-9]{10,})/i;

// Fallback when OCR dropped the label: a number glued to บาท/THB/฿.
const AMOUNT_CURRENCY = new RegExp(
  String.raw`(?:฿\s*(${NUMBER}))|(?:(${NUMBER})\s*(?:บาท|thb))`,
  "gi",
);

export function parseSlip(text: string): Slip {
  const normalized = text
    .replace(/\r/g, "")
    // "พ. ย." / "พ .ย ." -> "พ.ย." so month matching sees one token.
    .replace(/([ก-๙])\s*\.\s*(?=[ก-๙])/g, "$1.")
    .replace(/([ก-๙])\s+\./g, "$1.");

  return {
    amount: findAmount(normalized),
    occurredAt: findDate(normalized),
    ref: normalized.match(REF_LABEL)?.[1],
  };
}

/**
 * Seed for the slip's derived transaction id. The bank reference is the real
 * identity; without one, the OCR text itself is stable enough because the same
 * image yields the same text on the same phone.
 */
export function slipSeed(text: string, slip: Slip): string {
  return slip.ref ? `slip:${slip.ref}` : `slip:text:${text.replace(/\s+/g, " ").trim()}`;
}

function findAmount(text: string): string | undefined {
  const labelled = text.match(AMOUNT_LABEL)?.[1];
  if (labelled && positive(labelled)) return clean(labelled);

  for (const m of text.matchAll(AMOUNT_CURRENCY)) {
    const n = m[1] ?? m[2];
    if (n && positive(n)) return clean(n);
  }
  return undefined;
}

function findDate(text: string): Date | undefined {
  // Colon only: "80.00" would otherwise read as 80 o'clock.
  const time = text.match(/\b(\d{1,2}):(\d{2})\b/);

  const thai = new RegExp(
    String.raw`(\d{1,2})\s*(${THAI_MONTHS.map(escape).join("|")})\s*(\d{2,4})`,
  ).exec(text);
  if (thai) {
    const month = THAI_MONTHS.indexOf(thai[2]);
    return build(Number(thai[1]), month, thaiYear(thai[3]), time);
  }

  const en = new RegExp(
    String.raw`(\d{1,2})\s*(${EN_MONTHS.join("|")})[a-z]*\.?\s*(\d{2,4})`,
    "i",
  ).exec(text);
  if (en) {
    const month = EN_MONTHS.indexOf(en[2].toLowerCase());
    const y = Number(en[3]);
    return build(Number(en[1]), month, y < 100 ? 2000 + y : y, time);
  }

  return undefined;
}

/** Slips print Buddhist-era years: "69" or "2569" both mean 2026. */
function thaiYear(raw: string): number {
  const y = Number(raw);
  if (raw.length <= 2) return 2500 + y - 543;
  return y > 2400 ? y - 543 : y;
}

function build(day: number, month: number, year: number, time: RegExpMatchArray | null) {
  const h = time ? Number(time[1]) : 0;
  const m = time ? Number(time[2]) : 0;
  const d = new Date(year, month, day, h, m);
  // Reject OCR misreads like "32 พ.ย." rather than letting Date roll them over.
  return d.getDate() === day && d.getMonth() === month && h < 24 ? d : undefined;
}

const clean = (n: string) => n.replace(/,/g, "");
const positive = (n: string) => Number(clean(n)) > 0;
const escape = (s: string) => s.replace(/\./g, "\\.");
