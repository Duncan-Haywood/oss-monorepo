// Check the marketplace deposits on a bank statement against what the books say each platform should have
// paid out. Pure function: the route feeds it the statement's money-in rows and the P&L cells for the
// statement's months.
//
// Why: a month whose report was never imported is invisible in the books' own totals, but its payouts are
// still on the bank statement. A platform's deposits running ahead of the books means sales are missing
// (or a deposit was matched wrongly); the books running ahead means money is still on the platform, went to
// another account, or the same report was imported twice.
//
// Expected payout = revenue (item sales + shipping buyers paid − refunds) − marketplace fees − postage, the
// amounts the platforms take out of the balance before paying out. Sales tax the platform collected never
// reaches the seller and is left out. Charges billed to a card instead of the balance (some platforms bill
// postage or subscriptions that way) make the books' expected figure too low; the finding says so.
//
// Deposits are matched to a platform by its name in the statement's description. The descriptor text each
// platform's payouts carry was not checked against a real statement, so matching is deliberately simple
// (a word starting with the name, case ignored) and every match is listed for the seller to check and exclude.
// Nothing here is tax or accounting advice.

export interface PayoutDeposit {
  line: number;
  date: string; // YYYY-MM-DD
  description: string;
  amountCents: number; // money in, positive
}

export interface PayoutBooksCell {
  platform: string;
  month: string; // YYYY-MM
  orders: number;
  revenueCents: number;
  feesCents: number;
  postageCents: number;
}

export interface ReconcilePayoutsInput {
  /** The statement's first and last dates (over every row, money in or out). */
  from: string;
  to: string;
  deposits: PayoutDeposit[];
  books: PayoutBooksCell[];
  /** Statement lines the seller said are not payouts. */
  exclude?: number[];
  platforms: readonly string[];
  labels: Record<string, string>;
}

export interface PayoutMonth {
  month: string;
  orders: number;
  expectedCents: number;
  depositsCents: number;
  /** Expected minus deposited, summed from the statement's first month to this one. */
  runningGapCents: number;
}

export type PayoutStatus =
  | "matches"
  | "books_ahead"
  | "deposits_ahead"
  | "no_deposits"
  | "no_books";

export interface PayoutPlatform {
  platform: string;
  label: string;
  expectedCents: number;
  depositsCents: number;
  depositCount: number;
  /** Expected minus deposited over the statement's months: positive means the books expect more. */
  gapCents: number;
  status: PayoutStatus;
  months: PayoutMonth[];
}

export interface MatchedDeposit extends PayoutDeposit {
  platform: string | null;
  excluded: boolean;
}

export interface ReconcilePayoutsResult {
  from: string;
  to: string;
  months: string[];
  platforms: PayoutPlatform[];
  deposits: MatchedDeposit[];
  otherDepositsCents: number;
  findings: string[];
  disclaimer: string;
}

export const PAYOUT_DISCLAIMER =
  "A comparison of the deposits on your statement with the payouts your books expect, to find reports not imported yet. Deposits are matched by the platform's name in the description: check the list. It is not tax or accounting advice.";

const usd = (cents: number) => {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
};

/**
 * The platform whose name starts a word of a deposit's description ("EBAY COMMERCE", "Etsy, Inc.",
 * "AMAZON.COM", "TikTokShop"), or null. A word that only contains the name ("Betsy") does not match, and
 * two platforms on one line match neither.
 */
export function matchPlatform(description: string, platforms: readonly string[]): string | null {
  const words = description
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  const hits = platforms.filter((p) => words.some((w) => w.startsWith(p.toLowerCase())));
  return hits.length === 1 ? (hits[0] as string) : null;
}

/** Every YYYY-MM from the month of `from` to the month of `to`. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (out.length > 120) break;
  }
  return out;
}

/** A gap is worth a finding above $25 and above 15% of what the books expect (a few days' payouts held). */
export function gapThreshold(expectedCents: number) {
  return Math.max(2500, Math.round(Math.abs(expectedCents) * 0.15));
}

// Names that also show up on money in that is not a payout: a refund of a purchase, a personal transfer.
const MIXED_USE: Record<string, string> = {
  amazon: "a refund of something you bought on Amazon",
  paypal: "a personal PayPal transfer or a refund",
  square: "a refund from a shop that takes Square",
  shopify: "a refund of a Shopify subscription or app charge",
};

export function reconcilePayouts(input: ReconcilePayoutsInput): ReconcilePayoutsResult {
  const months = monthsBetween(input.from, input.to);
  const inWindow = new Set(months);
  const excluded = new Set(input.exclude ?? []);
  const deposits: MatchedDeposit[] = input.deposits.map((d) => ({
    ...d,
    platform: matchPlatform(d.description, input.platforms),
    excluded: excluded.has(d.line),
  }));
  const counted = deposits.filter((d) => d.platform && !d.excluded);
  const otherDepositsCents = deposits
    .filter((d) => !d.platform && !d.excluded)
    .reduce((s, d) => s + d.amountCents, 0);

  const books = input.books.filter((b) => inWindow.has(b.month));
  const seen = new Set<string>([
    ...counted.map((d) => d.platform as string),
    ...books.filter((b) => b.orders > 0 || b.revenueCents !== 0).map((b) => b.platform),
  ]);
  const findings: string[] = [];
  const platforms: PayoutPlatform[] = [];

  for (const p of input.platforms) {
    if (!seen.has(p)) continue;
    const label = input.labels[p] ?? p;
    let running = 0;
    const rows: PayoutMonth[] = months.map((month) => {
      const cells = books.filter((b) => b.platform === p && b.month === month);
      const expectedCents = cells.reduce(
        (s, c) => s + c.revenueCents - c.feesCents - c.postageCents,
        0,
      );
      const orders = cells.reduce((s, c) => s + c.orders, 0);
      const depositsCents = counted
        .filter((d) => d.platform === p && d.date.slice(0, 7) === month)
        .reduce((s, d) => s + d.amountCents, 0);
      running += expectedCents - depositsCents;
      return { month, orders, expectedCents, depositsCents, runningGapCents: running };
    });
    const expectedCents = rows.reduce((s, r) => s + r.expectedCents, 0);
    const depositsCents = rows.reduce((s, r) => s + r.depositsCents, 0);
    const depositCount = counted.filter((d) => d.platform === p).length;
    const gapCents = expectedCents - depositsCents;
    const threshold = gapThreshold(expectedCents);
    let status: PayoutStatus;
    if (depositCount === 0) status = "no_deposits";
    else if (rows.every((r) => r.orders === 0 && r.expectedCents === 0)) status = "no_books";
    else if (Math.abs(gapCents) <= threshold) status = "matches";
    else status = gapCents > 0 ? "books_ahead" : "deposits_ahead";
    platforms.push({
      platform: p,
      label,
      expectedCents,
      depositsCents,
      depositCount,
      gapCents,
      status,
      months: rows,
    });

    if (status === "no_deposits") {
      if (expectedCents > 2500)
        findings.push(
          `${label}: the books expect ${usd(expectedCents)} in payouts over these months and no deposit on this statement names ${label}. The payouts may go to another account, or still sit on ${label}.`,
        );
      continue;
    }
    if (status === "no_books") {
      findings.push(
        `${label}: ${depositCount} deposit(s) of ${usd(depositsCents)} and no ${label} sales in the books for these months. Import ${label}'s report for this period.`,
      );
      continue;
    }
    // A month with deposits but no sales in it or the month before: that month's report is likely missing.
    rows.forEach((r, i) => {
      const prev = i > 0 ? rows[i - 1] : null;
      if (
        r.depositsCents > 2500 &&
        r.orders === 0 &&
        r.expectedCents === 0 &&
        (prev == null || (prev.orders === 0 && prev.expectedCents === 0))
      )
        findings.push(
          `${label}, ${r.month}: ${usd(r.depositsCents)} deposited and no ${label} sales in the books that month${prev ? " or the month before" : ""}. Import that month's report.`,
        );
    });
    if (status === "deposits_ahead")
      findings.push(
        `${label}: ${usd(-gapCents)} more deposited than the books expect (${usd(depositsCents)} against ${usd(expectedCents)}). Usual causes: a month or a second account not imported yet, a payout of a balance from before the statement, or a deposit that is not a payout (exclude it below).`,
      );
    else if (status === "books_ahead")
      findings.push(
        `${label}: the books expect ${usd(gapCents)} more than was deposited (${usd(expectedCents)} against ${usd(depositsCents)}). Usual causes: money still on ${label} at the statement's end, payouts to another account, the same report imported twice, or charges billed to a card rather than taken from the balance.`,
      );
    else
      findings.push(
        `${label}: deposits of ${usd(depositsCents)} are within ${usd(threshold)} of the ${usd(expectedCents)} the books expect.`,
      );
    const mixed = MIXED_USE[p];
    if (mixed && depositCount > 0)
      findings.push(
        `${label} deposits can include ${mixed}. Check the ${label} lines in the list and exclude any that are not payouts.`,
      );
  }

  if (platforms.length === 0)
    findings.push(
      "No deposit names a platform and the books have no sales in these months. Choose the statement of the account your payouts go to.",
    );
  if (otherDepositsCents > 0)
    findings.push(
      `${usd(otherDepositsCents)} of other money in names no platform. If some of it is sales (Venmo, Cash App, Zelle, cash deposited), make sure those sales are entered as sales made off the marketplaces.`,
    );

  return {
    from: input.from,
    to: input.to,
    months,
    platforms,
    deposits,
    otherDepositsCents,
    findings,
    disclaimer: PAYOUT_DISCLAIMER,
  };
}
