// A bank or credit-card statement saved as CSV -> candidate expenses, each with a suggested category.
// Pure: no DB.
//
// Resellers pay for postage, packaging and listing software on the same card they shop with, so the
// statement is where their expenses already are. Typing them in one by one is the chore that keeps the
// Expenses page empty. This reads the CSV every US bank and card issuer offers for download.
//
// Columns are matched by name, as for the marketplace reports (parse.ts). Three layouts are read:
// 1. one signed Amount column (Chase and Capital One cards, most checking accounts); which sign is money
//    out differs by issuer (Chase cards print purchases negative, Amex and Discover positive), so a
//    "Type" or "Debit/Credit" column decides when there is one, then the caller's `chargesAre`, then the
//    sign most rows have (a statement is mostly purchases), with the guess reported so the page can flip it;
// 2. separate Debit and Credit (or Withdrawals and Deposits) columns;
// 3. either of those with a Category column from the bank, shown as a hint.
// Rows that are money in (refunds, deposits, card payments) are skipped with the reason, as are rows
// with no date or an unreadable amount. Nothing is ever guessed: an amount that does not parse skips the
// row with its line number.
import { type ColumnSpec, ImportFormatError, parseDate, parseMoney, readTable } from "./parse";
import { type Suggestion, suggest } from "./statement-rules";

export const MAX_STATEMENT_ROWS = 2000;

export type ChargesAre = "positive" | "negative";

export interface StatementRow {
  line: number;
  date: string;
  description: string;
  /** Money out, in cents, always positive. */
  amountCents: number;
  bankCategory: string | null;
  suggestion: Suggestion;
}

export interface StatementParseResult {
  rows: StatementRow[];
  rowCount: number;
  skipped: { line: number; reason: string }[];
  warnings: string[];
  matched: Record<string, string>;
  /** How money out was told from money in, so the page can say so and offer the flip. */
  signRule: "debit-credit-columns" | "type-column" | "given" | "guessed";
  chargesAre: ChargesAre | null;
  /** The money-in rows left out of `rows` (payouts, refunds, card payments), for the payout check. */
  moneyIn: { line: number; date: string; description: string; amountCents: number }[];
  /** First and last readable date over every row, money in or out; null when none was read. */
  period: { from: string; to: string } | null;
}

type Field = "date" | "description" | "amount" | "debit" | "credit" | "type" | "category";

const SPEC: ColumnSpec<Field> = {
  date: {
    required: true,
    names: [
      "transaction date",
      "trans date",
      "trans. date",
      "date",
      "posted date",
      "posting date",
      "post date",
      "effective date",
      "date posted",
    ],
  },
  description: {
    required: true,
    names: [
      "description",
      "transaction description",
      "merchant",
      "merchant name",
      "payee",
      "name",
      "details",
      "original description",
      "narrative",
      "memo",
    ],
  },
  amount: { names: ["amount", "transaction amount", "amount (usd)", "amount usd"] },
  debit: {
    names: [
      "debit",
      "debits",
      "debit amount",
      "withdrawal",
      "withdrawals",
      "withdrawal amount",
      "money out",
      "paid out",
      "charge",
      "charges",
    ],
  },
  credit: {
    names: [
      "credit",
      "credits",
      "credit amount",
      "deposit",
      "deposits",
      "deposit amount",
      "money in",
      "paid in",
    ],
  },
  type: { names: ["type", "transaction type", "debit/credit", "dr/cr", "credit/debit indicator"] },
  category: { names: ["category", "transaction category"] },
};

const OUT_TYPES = new Set(["debit", "dr", "sale", "purchase", "fee", "withdrawal", "charge"]);
const IN_TYPES = new Set(["credit", "cr", "return", "refund", "payment", "deposit"]);

function typeDirection(raw: string | undefined): "out" | "in" | null {
  const t = (raw ?? "").trim().toLowerCase();
  if (OUT_TYPES.has(t)) return "out";
  if (IN_TYPES.has(t)) return "in";
  return null;
}

function money(raw: string | undefined, line: number, skipped: StatementParseResult["skipped"]) {
  try {
    return { ok: true as const, cents: parseMoney(raw) };
  } catch {
    skipped.push({ line, reason: `Unreadable amount ${JSON.stringify(raw ?? "")}` });
    return { ok: false as const, cents: null };
  }
}

export function parseStatement(
  text: string,
  opts: { chargesAre?: ChargesAre } = {},
): StatementParseResult {
  const table = readTable(text, SPEC, "bank or card statement (it needs a date and a description)");
  const has = (f: Field) => table.matched[f] !== undefined;
  const split = has("debit") && has("credit");
  if (!split && !has("amount") && !has("debit")) {
    throw new ImportFormatError(
      "This statement has no amount column: expected Amount, or Debit and Credit.",
      [
        { field: "amount", expectedOneOf: SPEC.amount.names },
        { field: "debit", expectedOneOf: SPEC.debit.names },
      ],
    );
  }
  if (table.rows.length > MAX_STATEMENT_ROWS) {
    throw new ImportFormatError(
      `This statement has ${table.rows.length} rows; split it into files of up to ${MAX_STATEMENT_ROWS}.`,
    );
  }
  const skipped: StatementParseResult["skipped"] = [];
  const warnings: string[] = [];

  // Pass 1: read each row's date, description and signed amount (or debit/credit pair).
  interface Raw {
    line: number;
    date: string;
    description: string;
    bankCategory: string | null;
    signed: number; // as printed, single-column layout; for split columns, + is out and - is in
    dir: "out" | "in" | null; // decided by a debit/credit split or a type column
  }
  const raws: Raw[] = [];
  for (const r of table.rows) {
    const date = parseDate(r.get("date"));
    if (!date) {
      skipped.push({
        line: r.line,
        reason: `No readable date (${JSON.stringify(r.get("date") ?? "")})`,
      });
      continue;
    }
    const description = (r.get("description") ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    const bankCategory = r.get("category")?.trim() || null;
    let signed: number;
    let dir: Raw["dir"] = null;
    if (split || (has("debit") && !has("amount"))) {
      const d = money(r.get("debit"), r.line, skipped);
      if (!d.ok) continue;
      const c = split
        ? money(r.get("credit"), r.line, skipped)
        : { ok: true as const, cents: null };
      if (!c.ok) continue;
      const out = Math.abs(d.cents ?? 0);
      const inn = Math.abs(c.cents ?? 0);
      if (out > 0 && inn > 0) {
        skipped.push({ line: r.line, reason: "Both a debit and a credit on one row" });
        continue;
      }
      signed = out > 0 ? out : -inn;
      dir = out > 0 ? "out" : inn > 0 ? "in" : null;
    } else {
      const a = money(r.get("amount"), r.line, skipped);
      if (!a.ok) continue;
      signed = a.cents ?? 0;
      dir = has("type") ? typeDirection(r.get("type")) : null;
    }
    if (signed === 0) {
      skipped.push({ line: r.line, reason: "Zero amount" });
      continue;
    }
    raws.push({ line: r.line, date, description, bankCategory, signed, dir });
  }

  // Pass 2: which sign is money out, for single-column rows a type column did not decide.
  let signRule: StatementParseResult["signRule"];
  let chargesAre: ChargesAre | null = null;
  if (split || (has("debit") && !has("amount"))) {
    signRule = "debit-credit-columns";
  } else {
    const undecided = raws.filter((x) => x.dir === null);
    if (undecided.length === 0 && raws.length > 0) {
      signRule = "type-column";
    } else if (opts.chargesAre) {
      signRule = "given";
      chargesAre = opts.chargesAre;
    } else {
      signRule = "guessed";
      const negatives = undecided.filter((x) => x.signed < 0).length;
      chargesAre = negatives * 2 > undecided.length ? "negative" : "positive";
      warnings.push(
        `Money out was taken to be the ${chargesAre} amounts, because most rows are ${chargesAre}. If the list below shows your refunds and payments instead of your purchases, flip it.`,
      );
    }
  }

  const rows: StatementRow[] = [];
  const moneyInRows: StatementParseResult["moneyIn"] = [];
  for (const x of raws) {
    let out: boolean;
    if (x.dir) out = x.dir === "out";
    else if (signRule === "debit-credit-columns") out = x.signed > 0;
    else out = chargesAre === "negative" ? x.signed < 0 : x.signed > 0;
    if (!out) {
      moneyInRows.push({
        line: x.line,
        date: x.date,
        description: x.description || "(no description)",
        amountCents: Math.abs(x.signed),
      });
      skipped.push({ line: x.line, reason: "Money in (a refund, deposit or card payment)" });
      continue;
    }
    rows.push({
      line: x.line,
      date: x.date,
      description: x.description || "(no description)",
      amountCents: Math.abs(x.signed),
      bankCategory: x.bankCategory,
      suggestion: suggest(x.description),
    });
  }
  if (moneyInRows.length > 0) {
    warnings.push(
      `${moneyInRows.length} row(s) are money in and were left out. A refund of a business purchase lowers that expense: enter the net amount by hand.`,
    );
  }
  const matched: Record<string, string> = {};
  for (const [k, v] of Object.entries(table.matched)) if (v !== undefined) matched[k] = v;
  skipped.sort((a, b) => a.line - b.line);
  const dates = raws.map((x) => x.date).sort();
  const period = dates.length
    ? { from: dates[0] as string, to: dates[dates.length - 1] as string }
    : null;
  return {
    rows,
    rowCount: table.rows.length,
    skipped,
    warnings,
    matched,
    signRule,
    chargesAre,
    moneyIn: moneyInRows,
    period,
  };
}
