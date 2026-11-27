// P&L by platform and month, the stock report, the Schedule C worksheet (JSON + CSV download), the
// row-by-row sales ledger behind them (CSV download), the same rows as QuickBooks Online journal entries, the year-end records behind three worksheet figures
// (closing inventory, mileage log, expenses; CSV downloads) and a Form 1099-K checked against the books.
import { csvCell, toCsv } from "@shared/csv";
import { type ExpenseCategory, PLATFORM_LABELS, PLATFORMS, type Platform } from "@shared/enums";
import { estimate } from "@shared/estimated-tax";
import { reconcile1099k } from "@shared/reconcile-1099k";
import { Hono } from "hono";
import { z } from "zod";
import { badRequest, notFound } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { zip } from "../../lib/zip";
import { requireRole } from "../../middleware/tenant";
import { getReminderSetting, setReminder } from "../../services/books/estimate-reminders";
import {
  deleteEstimateSettings,
  getEstimateSettings,
  putEstimateSettings,
} from "../../services/books/estimate-settings";
import {
  buildJournal,
  DEFAULT_JOURNAL_ACCOUNTS,
  JOURNAL_ACCOUNT_KEYS,
  type JournalAccounts,
  journalCsvRows,
} from "../../services/books/journal";
import { ledgerCsvRows } from "../../services/books/ledger";
import type { ScWorksheet } from "../../services/books/schedule-c";
import {
  deleteFiledInventory,
  deleteHomeOffice,
  getFiledInventory,
  getHomeOffice,
  pnlReport,
  profitToDateByPeriod,
  putFiledInventory,
  putHomeOffice,
  salesLedger,
  scheduleCWorksheet,
  stockReport,
  yearEndExpenses,
  yearEndInventory,
  yearEndTrips,
} from "../../services/books/service";
import {
  type CsvRow,
  closingInventoryList,
  expenseList,
  mileageLog,
  yearEndPackageFiles,
  yearEndReadme,
} from "../../services/books/year-end";
import type { AppEnv } from "../../types";
import { isoDate } from "./schemas";

const routes = new Hono<AppEnv>();

routes.get("/pnl", validate("query", z.object({ from: isoDate, to: isoDate })), async (c) => {
  const { from, to } = c.req.valid("query");
  if (from > to) throw badRequest("from must be on or before to");
  return c.json(await pnlReport(c.var.ctx, c.var.tenant.orgId, from, to));
});

routes.get(
  "/stock",
  validate("query", z.object({ asOf: isoDate, from: isoDate, to: isoDate })),
  async (c) => {
    const { asOf, from, to } = c.req.valid("query");
    if (from > to) throw badRequest("from must be on or before to");
    if (to > asOf) throw badRequest("to must be on or before asOf");
    return c.json(await stockReport(c.var.ctx, c.var.tenant.orgId, asOf, from, to));
  },
);

routes.get(
  "/sales-ledger.csv",
  validate("query", z.object({ from: isoDate, to: isoDate })),
  async (c) => {
    const { from, to } = c.req.valid("query");
    if (from > to) throw badRequest("from must be on or before to");
    const ledger = await salesLedger(c.var.ctx, c.var.tenant.orgId, from, to);
    const rows = ledgerCsvRows(ledger, (p) => PLATFORM_LABELS[p as Platform] ?? p);
    return new Response(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=${csvCell(`sales-ledger-${from}-to-${to}.csv`)}`,
      },
    });
  },
);

// QuickBooks Online journal entries: one summary journal per platform per month (services/books/journal.ts).
// Account names default to DEFAULT_JOURNAL_ACCOUNTS; `account.<key>` overrides one (QuickBooks names are at
// most 100 characters; "Parent:Sub" picks a subaccount). `cogs=1` also posts cost of goods against inventory.
const accountName = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[^\p{Cc}]+$/u, "no control characters");
const journalQuery = z.object({
  from: isoDate,
  to: isoDate,
  cogs: z.enum(["0", "1"]).optional(),
  ...Object.fromEntries(JOURNAL_ACCOUNT_KEYS.map((k) => [`account.${k}`, accountName.optional()])),
});

routes.get("/quickbooks-journal.csv", validate("query", journalQuery), async (c) => {
  const q = c.req.valid("query") as z.infer<typeof journalQuery> &
    Record<string, string | undefined>;
  if (q.from > q.to) throw badRequest("from must be on or before to");
  const accounts = { ...DEFAULT_JOURNAL_ACCOUNTS } as JournalAccounts;
  for (const k of JOURNAL_ACCOUNT_KEYS) {
    const v = q[`account.${k}`];
    if (v) accounts[k] = v;
  }
  const ledger = await salesLedger(c.var.ctx, c.var.tenant.orgId, q.from, q.to);
  const journal = buildJournal(ledger, {
    accounts,
    includeCogs: q.cogs === "1",
    platformLabel: (p) => PLATFORM_LABELS[p as Platform] ?? p,
  });
  return new Response(toCsv(journalCsvRows(journal)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${csvCell(`quickbooks-journal-${q.from}-to-${q.to}.csv`)}`,
    },
  });
});

const scQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  /** Cents per mile, e.g. 70 or 72.5 (the IRS standard mileage rate the seller looked up). */
  mileageRate: z.coerce.number().min(0).max(500).optional(),
});

// Business use of the home for one tax year (Schedule C line 30, simplified method), saved with the shop
// so the worksheet and its CSV carry it. Months are 1..12, each one with 15 or more days of business use.
const yearParam = z.object({ year: z.coerce.number().int().min(2000).max(2100) });
const homeOfficeBody = z
  .object({
    officeSqft: z.number().int().min(1).max(100_000),
    homeSqft: z.number().int().min(1).max(1_000_000).nullable().default(null),
    months: z.array(z.number().int().min(1).max(12)).min(1).max(12),
  })
  .refine((b) => b.homeSqft == null || b.officeSqft <= b.homeSqft, {
    message: "The business area cannot be larger than the whole home",
    path: ["officeSqft"],
  });

routes.get("/home-office/:year", validate("param", yearParam), async (c) => {
  const { year } = c.req.valid("param");
  return c.json({ year, homeOffice: await getHomeOffice(c.var.ctx, c.var.tenant.orgId, year) });
});

routes.put(
  "/home-office/:year",
  requireRole("editor"),
  validate("param", yearParam),
  validate("json", homeOfficeBody),
  async (c) => {
    const { year } = c.req.valid("param");
    const b = c.req.valid("json");
    await putHomeOffice(c.var.ctx, c.var.tenant.orgId, year, b);
    return c.json({ year, homeOffice: await getHomeOffice(c.var.ctx, c.var.tenant.orgId, year) });
  },
);

routes.delete(
  "/home-office/:year",
  requireRole("editor"),
  validate("param", yearParam),
  async (c) => {
    const { year } = c.req.valid("param");
    if (!(await deleteHomeOffice(c.var.ctx, c.var.tenant.orgId, year))) {
      throw notFound("Home office entry");
    }
    return c.json({ ok: true });
  },
);

// Line 41 (inventory at end of year) as filed on the seller's return for one tax year. The next year's
// worksheet uses it as line 35 and checks it against the books. Dollars in, cents stored.
const filedInventoryBody = z.object({ closing: z.number().min(0).max(100_000_000) });

routes.get("/filed-inventory/:year", validate("param", yearParam), async (c) => {
  const { year } = c.req.valid("param");
  const cents = await getFiledInventory(c.var.ctx, c.var.tenant.orgId, year);
  return c.json({ year, closing: cents == null ? null : cents / 100 });
});

routes.put(
  "/filed-inventory/:year",
  requireRole("editor"),
  validate("param", yearParam),
  validate("json", filedInventoryBody),
  async (c) => {
    const { year } = c.req.valid("param");
    const cents = Math.round(c.req.valid("json").closing * 100);
    await putFiledInventory(c.var.ctx, c.var.tenant.orgId, year, cents);
    return c.json({ year, closing: cents / 100 });
  },
);

routes.delete(
  "/filed-inventory/:year",
  requireRole("editor"),
  validate("param", yearParam),
  async (c) => {
    const { year } = c.req.valid("param");
    if (!(await deleteFiledInventory(c.var.ctx, c.var.tenant.orgId, year))) {
      throw notFound("Filed inventory figure");
    }
    return c.json({ ok: true });
  },
);

routes.get("/schedule-c", validate("query", scQuery), async (c) => {
  const q = c.req.valid("query");
  return c.json(
    await scheduleCWorksheet(c.var.ctx, c.var.tenant.orgId, q.year, q.mileageRate ?? null),
  );
});

// Quarterly estimated tax (1040-ES) from the books: the year-to-date profit at each Form 2210 Schedule AI
// period end, then the regular and annualized installments. The seller's other figures (filing status,
// wages, withholding, last year's tax, payments sent) come in a POST body, not the URL, so request logs
// never hold them. This route stores nothing; the owner and admins can save them with the settings
// routes below.
const dollarsIn = z.number().finite().min(-1e9).max(1e9);
const etBody = z.object({
  year: z.number().int().min(2000).max(2100),
  /** The day the books are read to, the seller's own today (defaults to today in UTC). */
  asOf: isoDate.optional(),
  /** Cents per mile, as on the Schedule C page. */
  mileageRate: z.number().min(0).max(500).optional(),
  filing: z.enum(["single", "mfj", "hoh"]).default("single"),
  /** Dollars. */
  wages: dollarsIn.min(0).default(0),
  otherIncome: dollarsIn.default(0),
  withholding: dollarsIn.min(0).default(0),
  priorYearTax: dollarsIn.min(0).nullable().optional(),
  priorAgiOver150k: z.boolean().default(false),
  /** Dollars paid toward each of the four dates. */
  paid: z.array(dollarsIn.min(0)).max(4).default([]),
});

routes.post("/estimated-tax", validate("json", etBody), async (c) => {
  const q = c.req.valid("json");
  const asOf = q.asOf ?? new Date().toISOString().slice(0, 10);
  const cents = (d: number) => Math.round(d * 100);
  const books = await profitToDateByPeriod(
    c.var.ctx,
    c.var.tenant.orgId,
    q.year,
    asOf,
    q.mileageRate ?? null,
  );
  const est = estimate({
    year: q.year,
    asOf,
    filing: q.filing,
    wages: cents(q.wages),
    otherIncome: cents(q.otherIncome),
    withholding: cents(q.withholding),
    priorYearTax: q.priorYearTax == null ? null : cents(q.priorYearTax),
    priorAgiOver150k: q.priorAgiOver150k,
    paid: q.paid.map(cents),
    profitToDate: books.profitToDate,
    homeOffice: books.homeOffice != null,
  });
  return c.json({
    ...est,
    rows: est.rows.map((r, i) => ({ ...r, homeOfficeToDate: books.homeOfficeToDate[i] ?? null })),
    homeOffice: books.homeOffice,
    warnings: [...est.warnings, ...books.warnings],
  });
});

// The seller's figures for the estimated-tax page, saved per tax year so every device shows the same
// ones. Owner and admins only: wages, withholding and last year's tax are the taxpayer's own, not the
// shop's books, so an editor or viewer keeps using the page with figures that stay in their browser.
// The calculation above still takes its figures in the POST body; this only stores them.
const estimateSettingsBody = z.object({
  filing: z.enum(["single", "mfj", "hoh"]),
  wages: dollarsIn.min(0),
  otherIncome: dollarsIn,
  withholding: dollarsIn.min(0),
  priorYearTax: dollarsIn.min(0).nullable(),
  priorAgiOver150k: z.boolean(),
  mileageRate: z.number().min(0).max(500).nullable(),
  paid: z.tuple([dollarsIn.min(0), dollarsIn.min(0), dollarsIn.min(0), dollarsIn.min(0)]),
});

routes.get(
  "/estimated-tax/settings/:year",
  requireRole("admin"),
  validate("param", yearParam),
  async (c) => {
    const { year } = c.req.valid("param");
    return c.json({
      year,
      settings: await getEstimateSettings(c.var.ctx, c.var.tenant.orgId, year),
    });
  },
);

routes.put(
  "/estimated-tax/settings/:year",
  requireRole("admin"),
  validate("param", yearParam),
  validate("json", estimateSettingsBody),
  async (c) => {
    const { year } = c.req.valid("param");
    await putEstimateSettings(c.var.ctx, c.var.tenant.orgId, year, c.req.valid("json"));
    return c.json({
      year,
      settings: await getEstimateSettings(c.var.ctx, c.var.tenant.orgId, year),
    });
  },
);

routes.delete(
  "/estimated-tax/settings/:year",
  requireRole("admin"),
  validate("param", yearParam),
  async (c) => {
    const { year } = c.req.valid("param");
    if (!(await deleteEstimateSettings(c.var.ctx, c.var.tenant.orgId, year))) {
      throw notFound("Estimated-tax figures");
    }
    return c.json({ ok: true });
  },
);

// The 1040-ES reminder email for the signed-in member (services/books/estimate-reminders.ts): on or off,
// the next due date and the day its reminder goes out. Owner and admins only, like the saved figures the
// amount in it comes from.
routes.get("/estimated-tax/reminder", requireRole("admin"), async (c) => {
  const t = c.var.tenant;
  return c.json(await getReminderSetting(c.var.ctx, t.orgId, t.userId));
});

routes.put(
  "/estimated-tax/reminder",
  requireRole("admin"),
  validate("json", z.object({ enabled: z.boolean() })),
  async (c) => {
    const t = c.var.tenant;
    const { enabled } = c.req.valid("json");
    return c.json(await setReminder(c.var.ctx, t.orgId, t.userId, enabled));
  },
);

// A platform's Form 1099-K against the books. The form's figures come in the POST body and nothing is
// stored, as with the estimated-tax calculation above.
const formDollars = z.number().finite().min(0).max(1e9);
const recBody = z.object({
  year: z.number().int().min(2000).max(2100),
  platform: z.enum(PLATFORMS),
  /** Dollars, box 1a. */
  box1a: formDollars,
  /** Dollars, boxes 5a-5l; null for a blank box. */
  months: z.array(formDollars.nullable()).length(12).nullable().optional(),
  box3: z.number().int().min(0).max(1e8).nullable().optional(),
});

routes.post("/1099k-reconcile", validate("json", recBody), async (c) => {
  const q = c.req.valid("json");
  const cents = (d: number) => Math.round(d * 100);
  const pnl = await pnlReport(c.var.ctx, c.var.tenant.orgId, `${q.year}-01-01`, `${q.year}-12-31`);
  return c.json(
    reconcile1099k({
      year: q.year,
      platform: q.platform,
      box1aCents: cents(q.box1a),
      monthsCents: q.months?.map((m) => (m == null ? null : cents(m))) ?? null,
      box3Transactions: q.box3 ?? null,
      books: pnl.cells.filter((cell) => cell.platform === q.platform),
    }),
  );
});

const dollars = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2));

function scheduleCCsvRows(
  ws: ScWorksheet & { businessMiles: number },
  mileageRate: number | null,
): CsvRow[] {
  return [
    [`Schedule C worksheet ${ws.year}`],
    [ws.disclaimer],
    [],
    ["Part", "Line", "Description", "Amount (USD)", "Note"],
    ...ws.lines.map((l) => ["I/II", l.line, l.label, dollars(l.amountCents), l.note ?? ""]),
    ...ws.partIII.map((l) => ["III", l.line, l.label, dollars(l.amountCents), l.note ?? ""]),
    ...ws.otherExpenses.map((l) => ["V", l.line, l.label, dollars(l.amountCents), ""]),
    [
      "IV",
      "44a",
      "Business miles",
      ws.businessMiles.toFixed(1),
      mileageRate == null
        ? "Line 9 at the IRS rate in force on each trip's date"
        : `Line 9 at ${mileageRate} cents/mile, the rate you chose`,
    ],
    ...ws.warnings.map((w) => ["", "", "Warning", "", w]),
  ];
}

routes.get("/schedule-c.csv", validate("query", scQuery), async (c) => {
  const q = c.req.valid("query");
  const ws = await scheduleCWorksheet(c.var.ctx, c.var.tenant.orgId, q.year, q.mileageRate ?? null);
  return new Response(toCsv(scheduleCCsvRows(ws, q.mileageRate ?? null)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${csvCell(`schedule-c-worksheet-${ws.year}.csv`)}`,
    },
  });
});

// Year-end records: the lists behind worksheet line 41, the business miles and the typed-in expenses.
const csvDownload = (rows: CsvRow[], filename: string) =>
  new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${csvCell(filename)}`,
    },
  });

const categoryLabel = (c: ExpenseCategory) => {
  const s = c.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

routes.get("/closing-inventory.csv", validate("query", yearParam), async (c) => {
  const { year } = c.req.valid("query");
  const items = await yearEndInventory(c.var.ctx, c.var.tenant.orgId, year);
  return csvDownload(closingInventoryList(year, items).rows, `closing-inventory-${year}.csv`);
});

routes.get("/mileage-log.csv", validate("query", scQuery), async (c) => {
  const q = c.req.valid("query");
  const trips = await yearEndTrips(c.var.ctx, c.var.tenant.orgId, q.year);
  return csvDownload(
    mileageLog(q.year, trips, q.mileageRate ?? null).rows,
    `mileage-log-${q.year}.csv`,
  );
});

routes.get("/expenses.csv", validate("query", yearParam), async (c) => {
  const { year } = c.req.valid("query");
  const rows = await yearEndExpenses(c.var.ctx, c.var.tenant.orgId, year);
  const list = expenseList(year, rows, {
    category: categoryLabel,
    platform: (p) => PLATFORM_LABELS[p as Platform] ?? p,
  });
  return csvDownload(list.rows, `expenses-${year}.csv`);
});

// The year-end package: every file above for one tax year in one ZIP, for the seller's records or their
// preparer, with a README that names each file and the figure it totals to. Built from the same functions
// as the single downloads, so each file in the ZIP is byte for byte the one its own link gives.
routes.get("/year-end.zip", validate("query", scQuery), async (c) => {
  const q = c.req.valid("query");
  const { ctx } = c.var;
  const { orgId } = c.var.tenant;
  const rate = q.mileageRate ?? null;
  const from = `${q.year}-01-01`;
  const to = `${q.year}-12-31`;
  const platformLabel = (p: string) => PLATFORM_LABELS[p as Platform] ?? p;
  const [ws, items, trips, expenseRows, ledger] = await Promise.all([
    scheduleCWorksheet(ctx, orgId, q.year, rate),
    yearEndInventory(ctx, orgId, q.year),
    yearEndTrips(ctx, orgId, q.year),
    yearEndExpenses(ctx, orgId, q.year),
    salesLedger(ctx, orgId, from, to),
  ]);
  const inventory = closingInventoryList(q.year, items);
  const log = mileageLog(q.year, trips, rate);
  const expenses = expenseList(q.year, expenseRows, {
    category: categoryLabel,
    platform: platformLabel,
  });
  const ledgerRows = ledgerCsvRows(ledger, platformLabel);
  const journal = buildJournal(ledger, {
    accounts: { ...DEFAULT_JOURNAL_ACCOUNTS },
    includeCogs: false,
    platformLabel,
  });
  const files = yearEndPackageFiles(q.year);
  const csv = {
    worksheet: toCsv(scheduleCCsvRows(ws, rate)),
    ledger: toCsv(ledgerRows),
    inventory: toCsv(inventory.rows),
    mileage: toCsv(log.rows),
    expenses: toCsv(expenses.rows),
    journal: toCsv(journalCsvRows(journal)),
  };
  const readme = yearEndReadme({
    year: q.year,
    generatedAt: new Date().toISOString(),
    worksheet: ws,
    mileageRate: rate,
    counts: {
      ledgerRows: ledger.rows.length,
      revenueCents: ledger.totals.revenueCents,
      inventoryItems: inventory.count,
      inventoryCents: inventory.totalCents,
      trips: log.count,
      miles: log.miles,
      line9Cents: log.line9Cents,
      expenses: expenses.count,
      expensesCents: expenses.totalCents,
    },
  });
  const body = zip([
    { name: files.readme, data: readme },
    { name: files.worksheet, data: csv.worksheet },
    { name: files.ledger, data: csv.ledger },
    { name: files.inventory, data: csv.inventory },
    { name: files.mileage, data: csv.mileage },
    { name: files.expenses, data: csv.expenses },
    { name: files.journal, data: csv.journal },
  ]);
  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename=${csvCell(`seller-books-year-end-${q.year}.zip`)}`,
      "Cache-Control": "no-store",
    },
  });
});

export default routes;
