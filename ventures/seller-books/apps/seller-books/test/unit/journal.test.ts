import { parseCsv, toCsv } from "@shared/csv";
import {
  buildJournal,
  DEFAULT_JOURNAL_ACCOUNTS,
  JOURNAL_HEADER,
  journalCsvRows,
  journalNo,
} from "@worker/services/books/journal";
import {
  buildSalesLedger,
  type LedgerChargeInput,
  type LedgerSaleInput,
} from "@worker/services/books/ledger";
import { describe, expect, it } from "vitest";

const base: Omit<LedgerSaleInput, "kind" | "date"> = {
  platform: "ebay",
  orderId: "12-3456",
  title: "Wool coat",
  sku: null,
  quantity: 1,
  itemCents: 0,
  shippingChargedCents: 0,
  salesTaxCents: 0,
  refundCents: 0,
  shippingLabelCents: 0,
  netCents: null,
  fees: [],
  item: null,
};

const sales: LedgerSaleInput[] = [
  {
    ...base,
    kind: "order",
    date: "2026-03-02",
    itemCents: 5000,
    shippingChargedCents: 800,
    salesTaxCents: 400,
    shippingLabelCents: 650,
    fees: [
      { kind: "final_value", amountCents: 765 },
      { kind: "advertising", amountCents: 250 },
    ],
    item: { title: "Wool coat (thrift)", costCents: 1200 },
  },
  {
    ...base,
    kind: "refund",
    date: "2026-03-20",
    refundCents: 1500,
    fees: [{ kind: "final_value", amountCents: -200 }],
  },
  { ...base, kind: "order", date: "2026-04-03", itemCents: 3000, item: null },
  {
    ...base,
    platform: "poshmark",
    kind: "order",
    date: "2026-03-05",
    itemCents: 2000,
    fees: [{ kind: "marketplace_fee", amountCents: 400 }],
  },
];

const charges: LedgerChargeInput[] = [
  {
    platform: "ebay",
    date: "2026-03-31",
    kind: "subscription",
    amountCents: 2195,
    orderId: null,
    description: "Store",
  },
  {
    platform: "ebay",
    date: "2026-03-15",
    kind: "advertising",
    amountCents: 300,
    orderId: null,
    description: "Promoted listings",
  },
];

const labels: Record<string, string> = { ebay: "eBay", poshmark: "Poshmark" };
const platformLabel = (p: string) => labels[p] ?? p;
const ledger = buildSalesLedger("2026-01-01", "2026-12-31", { sales, charges });
const journal = (includeCogs = false, accounts = DEFAULT_JOURNAL_ACCOUNTS) =>
  buildJournal(ledger, { accounts, includeCogs, platformLabel });

const byAccount = (lines: { account: string; debitCents: number; creditCents: number }[]) =>
  Object.fromEntries(lines.map((l) => [l.account, l.debitCents - l.creditCents]));

describe("QuickBooks journal", () => {
  it("makes one journal per platform per month, sorted by month then platform", () => {
    const j = journal();
    expect(j.entries.map((e) => e.journalNo)).toEqual([
      "SB-EBAY-2026-03",
      "SB-POSHMARK-2026-03",
      "SB-EBAY-2026-04",
    ]);
    expect(j.entries.map((e) => e.date)).toEqual(["2026-03-31", "2026-03-31", "2026-04-30"]);
    expect(j.entries[0]?.rows).toBe(4);
  });

  it("puts each figure on its account and the net on the platform's clearing account", () => {
    const march = journal().entries[0];
    // Debits positive, credits negative.
    expect(byAccount(march?.lines ?? [])).toEqual({
      Sales: -5000,
      "Shipping Income": -800,
      "Refunds and Allowances": 1500,
      Advertising: 550, // 250 on the order + 300 bought separately: Schedule C line 8
      "Marketplace Fees": 565, // 765 − 200 credited on the refund: line 10
      "Postage and Shipping": 650,
      "Software and Subscriptions": 2195,
      // credits 5800 − debits 5460 = 340 left with eBay
      "eBay Clearing": 340,
    });
  });

  it("balances every journal and leaves out sales tax the marketplace collected", () => {
    for (const e of journal(true).entries) {
      const debits = e.lines.reduce((t, l) => t + l.debitCents, 0);
      const credits = e.lines.reduce((t, l) => t + l.creditCents, 0);
      expect(debits, e.journalNo).toBe(credits);
      expect(e.lines.every((l) => l.debitCents >= 0 && l.creditCents >= 0)).toBe(true);
      expect(e.lines.every((l) => (l.debitCents === 0) !== (l.creditCents === 0))).toBe(true);
    }
    const accounts = journal().entries.flatMap((e) => e.lines.map((l) => l.account));
    expect(accounts.some((a) => /tax/i.test(a))).toBe(false);
  });

  it("the clearing accounts hold what the platforms kept: gross profit before cost of goods, less subscriptions", () => {
    const clearing = journal()
      .entries.flatMap((e) => e.lines)
      .filter((l) => / Clearing$/.test(l.account))
      .reduce((t, l) => t + l.debitCents - l.creditCents, 0);
    expect(clearing).toBe(
      ledger.totals.grossProfitCents + ledger.totals.cogsCents - ledger.totals.subscriptionCents,
    );
  });

  it("posts cost of goods against inventory only when asked, without changing the clearing line", () => {
    const off = journal(false).entries[0]?.lines ?? [];
    const on = journal(true).entries[0]?.lines ?? [];
    expect(off.some((l) => l.account === "Cost of Goods Sold")).toBe(false);
    expect(byAccount(on)["Cost of Goods Sold"]).toBe(1200);
    expect(byAccount(on)["Inventory Asset"]).toBe(-1200);
    expect(byAccount(on)["eBay Clearing"]).toBe(byAccount(off)["eBay Clearing"]);
    expect(journal(true).ordersWithoutCost).toBe(2); // April eBay and the Poshmark order
  });

  it("moves a negative month to the other side and credits clearing when the platform is owed", () => {
    const l = buildSalesLedger("2026-05-01", "2026-05-31", {
      sales: [
        {
          ...base,
          kind: "refund",
          date: "2026-05-02",
          refundCents: 1000,
          fees: [{ kind: "final_value", amountCents: -150 }],
        },
      ],
      charges: [],
    });
    const e = buildJournal(l, {
      accounts: DEFAULT_JOURNAL_ACCOUNTS,
      includeCogs: false,
      platformLabel,
    }).entries[0];
    expect(byAccount(e?.lines ?? [])).toEqual({
      "Refunds and Allowances": 1000,
      "Marketplace Fees": -150,
      "eBay Clearing": -850,
    });
  });

  it("dates a partial month by the export's last day, and uses custom account names", () => {
    const l = buildSalesLedger("2026-03-01", "2026-03-10", { sales, charges });
    const j = buildJournal(l, {
      accounts: {
        ...DEFAULT_JOURNAL_ACCOUNTS,
        sales: "Income:Resale",
        clearing: "Due from {platform}",
      },
      includeCogs: false,
      platformLabel,
    });
    expect(j.entries.map((e) => e.date)).toEqual(["2026-03-10", "2026-03-10"]);
    expect(j.entries[0]?.lines.map((l) => l.account)).toContain("Income:Resale");
    expect(j.entries[0]?.lines.map((l) => l.account)).toContain("Due from eBay");
  });

  it("writes the CSV QuickBooks maps from its first row, US dates, blank zero cells", () => {
    const rows = parseCsv(toCsv(journalCsvRows(journal())));
    expect(rows[0]).toEqual([...JOURNAL_HEADER]);
    const first = rows[1] ?? [];
    expect(first).toEqual([
      "SB-EBAY-2026-03",
      "03/31/2026",
      "Sales",
      "eBay 2026-03: item sales (Seller Books)",
      "",
      "50.00",
    ]);
    const lineCount = journal().entries.reduce((t, e) => t + e.lines.length, 0);
    expect(rows.filter((r) => r.some((c) => c !== ""))).toHaveLength(lineCount + 1);
  });

  it("neutralises an account name that looks like a formula", () => {
    const csv = toCsv(
      journalCsvRows(journal(false, { ...DEFAULT_JOURNAL_ACCOUNTS, sales: "=HYPERLINK(1)" })),
    );
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/m);
  });

  it("keeps journal numbers within QuickBooks' 21 characters", () => {
    for (const p of [
      "ebay",
      "poshmark",
      "mercari",
      "whatnot",
      "depop",
      "etsy",
      "shopify",
      "amazon",
      "tiktok",
    ])
      expect(journalNo(p, "2026-12").length).toBeLessThanOrEqual(21);
  });
});
