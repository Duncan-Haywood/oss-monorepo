// Money and percentage formatting/parsing. Money is integer cents; percentages are basis points.

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

/** 123456 -> "$1,234.56"; negatives as "-$1,234.56". */
export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** 123456 -> "1234.56" (plain, for CSV and inputs). */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Parses a dollar amount typed by a person ("$1,234.5", "-20", "(1,000.00)") to cents.
 * Returns null when the text is not a valid amount or has more than two decimals.
 */
export function parseDollarsToCents(input: string): number | null {
  let s = input.trim().replace(/[$,\s]/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  const m = /^(\d*)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m || (m[1] === "" && (m[2] ?? "") === "")) return null;
  const cents = Number(m[1] || "0") * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return negative && cents !== 0 ? -cents : cents;
}

/** 1000 -> "10%", 750 -> "7.5%", 1234 -> "12.34%". */
export function formatBps(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0$/, "")}%`;
}

/** "10" / "7.5" / "12.34%" -> basis points; null when invalid or outside 0–100%. */
export function parsePercentToBps(input: string): number | null {
  const s = input.trim().replace(/%$/, "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(s)) return null;
  const bps = Math.round(Number(s) * 100);
  return bps >= 0 && bps <= 10_000 ? bps : null;
}
