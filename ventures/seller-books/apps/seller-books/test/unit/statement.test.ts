import { readFileSync } from "node:fs";
import { ImportFormatError } from "@worker/services/importers/parse";
import { parseStatement } from "@worker/services/importers/statement";
import { normDescription, suggest } from "@worker/services/importers/statement-rules";
import { describe, expect, it } from "vitest";

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

describe("bank or card statement import", () => {
  it("reads a signed Amount column with a Type column (purchases negative)", () => {
    const r = parseStatement(fixture("statement-chase-card.csv"));
    expect(r.signRule).toBe("type-column");
    expect(r.rowCount).toBe(12);
    expect(
      r.rows.map((x) => [
        x.line,
        x.date,
        x.amountCents,
        x.suggestion.kind,
        x.suggestion.category,
        x.suggestion.include,
      ]),
    ).toEqual([
      [2, "2026-01-03", 1240, "expense", "shipping_postage", true],
      [3, "2026-01-05", 8615, "expense", "supplies", true],
      [4, "2026-01-07", 2999, "expense", "software_subscriptions", true],
      [5, "2026-01-09", 4500, "inventory", "other", false],
      [6, "2026-01-10", 3820, "fuel", "travel", false],
      [7, "2026-01-12", 1999, "ambiguous", "supplies", false],
      [8, "2026-01-14", 750, "marketplace", "commissions_fees", false],
      [11, "2026-01-21", 1240, "expense", "shipping_postage", true],
      [12, "2026-01-21", 1240, "expense", "shipping_postage", true],
      [13, "2026-01-22", 875, "unknown", "other", false],
    ]);
    // The return and the card payment are money in.
    expect(r.skipped.map((s) => s.line)).toEqual([9, 10]);
    expect(r.skipped[0]?.reason).toMatch(/Money in/);
    expect(r.rows[0]?.bankCategory).toBe("Shopping");
    expect(r.matched).toMatchObject({
      date: "Transaction Date",
      description: "Description",
      amount: "Amount",
      type: "Type",
      category: "Category",
    });
  });

  it("reads Debit and Credit columns and skips unreadable amounts with the line", () => {
    const r = parseStatement(fixture("statement-debit-credit.csv"));
    expect(r.signRule).toBe("debit-credit-columns");
    expect(r.rows.map((x) => [x.description, x.amountCents, x.suggestion.category])).toEqual([
      ["PIRATE SHIP", 2460, "shipping_postage"],
      ["PUBLIC STORAGE 25123", 8900, "rent"],
      ["STAPLES 00123", 120410, "supplies"],
    ]);
    expect(r.skipped).toEqual([
      { line: 4, reason: "Money in (a refund, deposit or card payment)" },
      { line: 6, reason: 'Unreadable amount "abc"' },
    ]);
  });

  it("guesses which sign is money out, and takes the caller's choice to flip it", () => {
    const text = fixture("statement-positive-charges.csv");
    const guessed = parseStatement(text);
    expect(guessed.signRule).toBe("guessed");
    expect(guessed.chargesAre).toBe("positive");
    expect(guessed.rows.map((x) => x.amountCents)).toEqual([1520, 1499, 2200]);
    expect(guessed.rows.map((x) => x.suggestion.kind)).toEqual(["expense", "expense", "inventory"]);
    expect(guessed.warnings.join(" ")).toMatch(/flip it/);

    const flipped = parseStatement(text, { chargesAre: "negative" });
    expect(flipped.signRule).toBe("given");
    expect(flipped.rows.map((x) => [x.description, x.amountCents])).toEqual([
      ["AUTOPAY PAYMENT - THANK YOU", 25000],
    ]);
    expect(flipped.rows[0]?.suggestion.kind).toBe("transfer");
  });

  it("refuses a file without the columns it needs, naming them", () => {
    expect(() => parseStatement("Foo,Bar\n1,2\n")).toThrow(ImportFormatError);
    expect(() => parseStatement("Date,Description,Balance\n01/01/2026,X,10\n")).toThrow(
      /no amount column/,
    );
  });
});

describe("merchant rules", () => {
  it("matches whole words only", () => {
    expect(normDescription("PAYPAL *VENDOO 402-935")).toBe(" PAYPAL VENDOO 402 935 ");
    expect(suggest("BP#1234 GAS").kind).toBe("fuel");
    expect(suggest("BPS SUPPLY CO").kind).toBe("unknown");
    expect(suggest("CUPS AND MORE").kind).toBe("unknown");
    expect(suggest("THE UPS STORE 1234").category).toBe("shipping_postage");
    expect(suggest("AT&T*BILL PAYMENT").category).toBe("utilities");
    expect(suggest("PLATO'S CLOSET").kind).toBe("inventory");
  });

  it("puts marketplace and inventory before shipping, so an eBay label is not counted twice", () => {
    expect(suggest("EBAY USPS LABEL").kind).toBe("marketplace");
    expect(suggest("SHPGOODWILL.COM").kind).toBe("inventory");
  });
});

describe("money in and the statement's period, for the payout check", () => {
  it("keeps the money-in rows it leaves out of the expenses, and the first and last dates", () => {
    const csv = [
      "Date,Description,Debit,Credit",
      "01/03/2026,USPS POSTAGE,12.40,",
      "01/09/2026,EBAY COMMERCE PAYOUT,,250.00",
      "02/02/2026,ULINE BOXES,48.10,",
    ].join("\n");
    const r = parseStatement(csv);
    expect(r.rows.map((x) => x.amountCents)).toEqual([1240, 4810]);
    expect(r.moneyIn).toEqual([
      { line: 3, date: "2026-01-09", description: "EBAY COMMERCE PAYOUT", amountCents: 25000 },
    ]);
    expect(r.period).toEqual({ from: "2026-01-03", to: "2026-02-02" });
  });
});
