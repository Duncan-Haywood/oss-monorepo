import type { Cents } from "./port.ts";

/** Integer cents to the decimal amount QuickBooks Online expects (e.g. 123456 -> 1234.56). */
export function centsToAmount(cents: Cents): number {
  if (!Number.isInteger(cents)) throw new RangeError(`cents must be an integer, got ${cents}`);
  return cents / 100;
}

/** A decimal amount from QuickBooks Online to integer cents, rounding away float noise. */
export function amountToCents(amount: number | string | undefined | null): Cents {
  if (amount === undefined || amount === null || amount === "") return 0;
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) throw new RangeError(`not a finite amount: ${String(amount)}`);
  return Math.round(n * 100);
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
