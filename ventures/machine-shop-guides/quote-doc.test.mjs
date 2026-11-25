import test from "node:test";
import assert from "node:assert/strict";
import { customerLines, validUntil, reviewQuote, quoteToHtml, quoteToText, normaliseMeta } from "./quote-doc.mjs";
import { quoteBreaks } from "./quote.mjs";

// Same invented inputs as quote.test.mjs: at 10 off the lot price is $846.00.
const input = {
  materialPerPart: 10, scrapPct: 0, setupHours: 2, setupRate: 50,
  programHours: 2, programRate: 50, lotsOverProgramLife: 1,
  cycleMinutes: 30, machineRate: 60, markupPct: 20,
  ops: [{ name: "Deburr", minutesPerPart: 6, rate: 30, lotCharge: 0 }, { name: "Anodize", minutesPerPart: 0, rate: 0, lotCharge: 75 }],
};
const rows = quoteBreaks(input, [1, 10, 25]);
const meta = {
  shopName: "Example Machine Co.", shopContact: "Pat Example", shopEmail: "quotes@example.com",
  customer: "Example Aero", customerContact: "Sam", rfqRef: "RFQ-0042", quoteNumber: "Q-1001",
  date: "2026-11-25", validDays: "30", partNumber: "BRK-200", revision: "C", description: "Bracket",
  material: "6061-T6", finish: "Clear anodize", leadTime: "3 weeks ARO", paymentTerms: "Net 30", shipping: "FOB origin",
  notes: "Material certs included\nFirst article inspection not included",
};

test("customer lines: price each rounded up to the cent, extended = unit x quantity", () => {
  const lines = customerLines(rows);
  assert.deepEqual(lines.map((l) => l.quantity), [1, 10, 25]);
  assert.equal(lines[1].unit, 84.6);
  assert.equal(lines[1].extended, 846);
  // At 1 off: cost = 10 + 100 + 100 + 30 + 3 + 75 = 318, price 381.60.
  assert.equal(lines[0].unit, 381.6);
  for (const l of lines) {
    const r = rows.find((x) => x.quantity === l.quantity);
    assert.ok(l.unit >= r.priceEach - 1e-9, "never below the calculated price");
    assert.ok(l.unit - r.priceEach < 0.01);
    assert.equal(Math.round(l.unit * 100) * l.quantity, Math.round(l.extended * 100));
  }
});

test("a fraction of a cent rounds up, float noise does not", () => {
  assert.equal(customerLines([{ quantity: 3, price: 100, priceEach: 100 / 3 }])[0].unit, 33.34);
  assert.equal(customerLines([{ quantity: 3, price: 100, priceEach: 100 / 3 }])[0].extended, 100.02);
  assert.equal(customerLines([{ quantity: 10, price: 0.1 * 3 * 10, priceEach: 0.1 * 3 }])[0].unit, 0.3);
});

test("valid until: date plus days, empty when unreadable", () => {
  assert.equal(validUntil("2026-11-25", "30"), "2026-12-25");
  assert.equal(validUntil("2026-12-15", 30), "2027-01-14");
  assert.equal(validUntil("2028-02-28", "1"), "2028-02-29");
  assert.equal(validUntil("2026-02-30", "5"), "");
  assert.equal(validUntil("25/11/2026", "30"), "");
  assert.equal(validUntil("2026-11-25", ""), "");
  assert.equal(validUntil("2026-11-25", "2.5"), "");
});

test("review: a complete quote has nothing missing", () => {
  assert.deepEqual(reviewQuote(meta, rows), []);
});

test("review: names the missing revision, validity and lead time", () => {
  const r = reviewQuote({ ...meta, revision: "", validDays: "", leadTime: "" }, rows);
  const fields = r.filter((x) => x.level === "missing").map((x) => x.field).sort();
  assert.deepEqual(fields, ["leadTime", "revision", "validDays"]);
  assert.ok(reviewQuote({}, []).some((x) => x.field === "prices"));
});

test("review: flags a larger lot that costs less in total", () => {
  const odd = [{ quantity: 10, price: 500, priceEach: 50 }, { quantity: 20, price: 400, priceEach: 20 }];
  assert.ok(reviewQuote(meta, odd).some((x) => /costs less in total/.test(x.text)));
});

test("HTML: escapes every field and never shows cost lines", () => {
  const html = quoteToHtml({ ...meta, customer: '<script>alert(1)</script>', notes: 'a & b\n"quoted"' }, rows);
  assert.doesNotMatch(html, /<script\b/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /<li>a &amp; b<\/li>/);
  assert.match(html, /\$846\.00/);
  assert.match(html, /\$84\.60/);
  assert.match(html, /30 days, until 2026-12-25/);
  assert.match(html, /<td>C<\/td>/);
  for (const internal of [/Setup/i, /Machining/i, /Markup/i, /Lot cost/i, /Material cost/i]) assert.doesNotMatch(html, internal);
});

test("text: the same prices and terms, ready to paste", () => {
  const text = quoteToText(meta, rows);
  assert.match(text, /^Quote Q-1001, 2026-11-25, from Example Machine Co\./);
  assert.match(text, /Revision: C/);
  assert.match(text, /\s10\s+\$84\.60\s+\$846\.00/);
  assert.match(text, /Lead time: 3 weeks ARO/);
  assert.match(text, /- First article inspection not included/);
  assert.doesNotMatch(text, /Setup|Machining|Markup/i);
});

test("normalise keeps only known fields, trimmed", () => {
  const m = normaliseMeta({ partNumber: "  X1 ", evil: "y" });
  assert.equal(m.partNumber, "X1");
  assert.equal(m.evil, undefined);
});
