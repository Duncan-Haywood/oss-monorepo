// Journal entries for QuickBooks Online: one summary journal per platform per month, built from the sales
// ledger (ledger.ts), so every figure is the same arithmetic the P&L and the Schedule C worksheet use.
// This is the summary-posting approach accountants use for marketplace sellers (one entry per payout
// period instead of one per order): income and fees land on their own accounts, and the net goes to a
// clearing account per platform. When the marketplace pays out, the bank deposit is recorded as a transfer
// from that clearing account, so what is left in it is money still held by the platform (or a difference
// worth a look).
//
// Per platform and month:
//   credit  Sales                 item sales
//   credit  Shipping income       shipping charged to buyers
//   debit   Refunds               refunds
//   debit   Advertising           ads / promoted-listing fees (Schedule C line 8)
//   debit   Marketplace fees      every other fee, fee credits netted (line 10)
//   debit   Postage               shipping labels (line 27a)
//   debit   Subscriptions         store subscriptions billed by the platform (line 27a)
//   debit   Cost of goods sold    the linked items' cost        } only when the seller asks for it:
//   credit  Inventory asset       the same amount               } most sellers expense purchases already
//   debit/credit  <Platform> clearing, the balance (credits − debits)
// A negative amount (fee credits larger than fees in a month) goes on the other side. Zero lines are left out.
// Sales tax the marketplace collected is not income and never passed through the seller, so it is not posted.
// Hand-entered expenses and mileage are not here: they are usually already in QuickBooks from the bank feed.
//
// The CSV follows QuickBooks Online's journal-entry import (Settings > Import data > Journal entries): the
// first row is the header it maps from, so the file has no title or notes rows. Column names are the ones
// Intuit's help article lists ("Journal No.", "Journal Date", "Account Name", "Journal/Description",
// "Debits", "Credits"; read 2026-11-26). Accounts must exist in QuickBooks before the import.
import type { JournalAccounts } from "@shared/journal-accounts";
import type { LedgerRow, SalesLedger } from "./ledger";

export {
  DEFAULT_JOURNAL_ACCOUNTS,
  JOURNAL_ACCOUNT_KEYS,
  type JournalAccountKey,
  type JournalAccounts,
} from "@shared/journal-accounts";

export interface JournalLine {
  account: string;
  debitCents: number;
  creditCents: number;
  description: string;
}

export interface JournalEntry {
  journalNo: string;
  platform: string;
  month: string; // YYYY-MM
  /** The entry's date: the month's last day, or the export's `to` when that comes first. */
  date: string;
  lines: JournalLine[];
  rows: number;
}

export interface Journal {
  from: string;
  to: string;
  entries: JournalEntry[];
  /** Orders in range with no linked item; with COGS posted, their cost is missing from it. */
  ordersWithoutCost: number;
}

const lastDayOfMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(d).padStart(2, "0")}`;
};

interface Sums {
  sales: number;
  shipping: number;
  refunds: number;
  advertising: number;
  fees: number;
  postage: number;
  subscriptions: number;
  cogs: number;
  rows: number;
}

const emptySums = (): Sums => ({
  sales: 0,
  shipping: 0,
  refunds: 0,
  advertising: 0,
  fees: 0,
  postage: 0,
  subscriptions: 0,
  cogs: 0,
  rows: 0,
});

function add(sums: Sums, r: LedgerRow) {
  sums.sales += r.itemSalesCents;
  sums.shipping += r.shippingChargedCents;
  sums.refunds += r.refundCents;
  sums.advertising += r.advertisingCents;
  sums.fees += r.feesCents - r.advertisingCents;
  sums.postage += r.postageCents;
  sums.subscriptions += r.subscriptionCents;
  sums.cogs += r.cogsCents;
  sums.rows += 1;
}

/** A line on its natural side; a negative amount moves to the other side. */
function line(account: string, cents: number, side: "debit" | "credit", description: string) {
  const debit = (side === "debit") === cents >= 0;
  const abs = Math.abs(cents);
  return {
    account,
    debitCents: debit ? abs : 0,
    creditCents: debit ? 0 : abs,
    description,
  };
}

/** QuickBooks Online allows 21 characters in a journal number; ours is at most 19 ("SB-POSHMARK-2026-03"). */
export const journalNo = (platform: string, month: string) =>
  `SB-${platform.toUpperCase()}-${month}`.slice(0, 21);

export function buildJournal(
  ledger: SalesLedger,
  opts: {
    accounts: JournalAccounts;
    includeCogs: boolean;
    platformLabel: (p: string) => string;
  },
): Journal {
  const groups = new Map<string, Sums>();
  for (const r of ledger.rows) {
    const key = `${r.platform}|${r.date.slice(0, 7)}`;
    let g = groups.get(key);
    if (!g) {
      g = emptySums();
      groups.set(key, g);
    }
    add(g, r);
  }

  const a = opts.accounts;
  const entries: JournalEntry[] = [];
  for (const [key, s] of groups) {
    const [platform, month] = key.split("|") as [string, string];
    const label = opts.platformLabel(platform);
    const desc = (what: string) => `${label} ${month}: ${what} (Seller Books)`;
    const lines: JournalLine[] = [
      line(a.sales, s.sales, "credit", desc("item sales")),
      line(a.shipping, s.shipping, "credit", desc("shipping charged to buyers")),
      line(a.refunds, s.refunds, "debit", desc("refunds")),
      line(a.advertising, s.advertising, "debit", desc("ads and promoted listings")),
      line(a.fees, s.fees, "debit", desc("marketplace fees")),
      line(a.postage, s.postage, "debit", desc("postage and shipping labels")),
      line(a.subscriptions, s.subscriptions, "debit", desc("platform subscriptions")),
    ];
    if (opts.includeCogs) {
      lines.push(line(a.cogs, s.cogs, "debit", desc("cost of goods sold")));
      lines.push(line(a.inventory, s.cogs, "credit", desc("cost of goods sold")));
    }
    const nonZero = lines.filter((l) => l.debitCents !== 0 || l.creditCents !== 0);
    if (nonZero.length === 0) continue;
    const credits = nonZero.reduce((t, l) => t + l.creditCents, 0);
    const debits = nonZero.reduce((t, l) => t + l.debitCents, 0);
    const balance = credits - debits;
    if (balance !== 0) {
      nonZero.push(
        line(
          a.clearing.replaceAll("{platform}", label),
          balance,
          "debit",
          desc("net to the platform balance"),
        ),
      );
    }
    const end = lastDayOfMonth(month);
    entries.push({
      journalNo: journalNo(platform, month),
      platform,
      month,
      date: end > ledger.to ? ledger.to : end,
      lines: nonZero,
      rows: s.rows,
    });
  }
  entries.sort((x, y) => x.month.localeCompare(y.month) || x.platform.localeCompare(y.platform));
  const ordersWithoutCost = ledger.totals.ordersWithoutCost;
  return { from: ledger.from, to: ledger.to, entries, ordersWithoutCost };
}

export const JOURNAL_HEADER = [
  "Journal No.",
  "Journal Date",
  "Account Name",
  "Journal/Description",
  "Debits",
  "Credits",
] as const;

const money = (cents: number) => (cents === 0 ? "" : (cents / 100).toFixed(2));
/** MM/DD/YYYY, the date format of a US QuickBooks Online company. */
const usDate = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

/** CSV rows for QuickBooks Online's journal-entry import: the header, then one row per line. */
export function journalCsvRows(journal: Journal): string[][] {
  return [
    [...JOURNAL_HEADER],
    ...journal.entries.flatMap((e) =>
      e.lines.map((l) => [
        e.journalNo,
        usDate(e.date),
        l.account,
        l.description,
        money(l.debitCents),
        money(l.creditCents),
      ]),
    ),
  ];
}
