/**
 * Money is stored as an integer number of satang. Parsing and formatting are the
 * only two places a decimal is allowed to exist.
 */

const baht = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMinor(minor: number): string {
  return baht.format(minor / 100);
}

/** "80.5" -> 8050. Returns null when the input isn't a positive amount. */
export function parseToMinor(input: string): number | null {
  const cleaned = input.replace(/,/g, "").trim();
  if (!/^\d*\.?\d{0,2}$/.test(cleaned) || cleaned === "" || cleaned === ".") {
    return null;
  }
  const minor = Math.round(Number(cleaned) * 100);
  return minor > 0 ? minor : null;
}

/** Rounded whole baht — satang is noise on axis ticks and chart labels. */
export function formatBaht(minor: number): string {
  return `฿${Math.round(minor / 100).toLocaleString("th-TH")}`;
}
