import type { Cents } from "./port.ts";

/** Integer cents to the decimal amount QuickBooks Online expects (e.g. 123456 -> 1234.56). */
export function centsToAmount(cents: Cents): number {
  if (!Number.isInteger(cents)) throw new RangeError(`cents must be an integer, got ${cents}`);
  return cents / 100;
}

/**
 * A decimal amount from QuickBooks Online to integer cents, rounded half away from zero on the
 * decimal digits as written (QBO unit prices and some amounts carry more than two places).
 * `n * 100` would round 1.005 down to 100 (binary 1.005 is 1.00499...) and -0.125 to -12 while
 * 0.125 goes to 13, so a credit and its debit would disagree by a cent.
 */
export function amountToCents(amount: number | string | undefined | null): Cents {
  if (amount === undefined || amount === null || amount === "") return 0;
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) throw new RangeError(`not a finite amount: ${String(amount)}`);
  // The shortest decimal that round-trips to n is the amount as QBO wrote it.
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(n));
  if (!m) return n < 0 ? -Math.round(-n * 100) : Math.round(n * 100); // exponent form: huge or tiny
  const [, minus, whole, frac = ""] = m;
  const digits = `${frac}000`;
  let cents = Number(whole) * 100 + Number(digits.slice(0, 2));
  if (Number(digits[2]) >= 5) cents += 1;
  return minus && cents !== 0 ? -cents : cents;
}

/** amount × rate (basis points), rounded half away from zero to whole cents. */
export function applyRateBps(amountCents: Cents, rateBps: number): Cents {
  const sign = amountCents < 0 ? -1 : 1;
  const r = Math.round((Math.abs(amountCents) * rateBps) / 10_000);
  return r === 0 ? 0 : sign * r;
}

export function formatRateBps(rateBps: number): string {
  return `${(rateBps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}
