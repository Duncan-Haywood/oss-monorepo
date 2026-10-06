import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, sampleStatement, sampleBrokenStatement, SAMPLE_RATES, SAMPLE_ITEMS, buildStatement, parseDate, parseAmount, parseRates, rateFor, parseMapping, toXeroJournalCsv, toQboJournalCsv, toIif, journalsCsv, workingsCsv, findingsCsv } from "./calc.mjs";

const run = (text = sampleStatement(), o = {}) => validate(text, { base: "USD", ratesText: SAMPLE_RATES, ...o });
const line = (j, cat) => j.lines.find((l) => l.category === cat);
const bal = (j) => j.lines.reduce((a, l) => a + l.debit - l.credit, 0);

test("the sample reads newest-first, follows its running balance and every journal balances", () => {
  const r = run();
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(r.rows[0].date, "2026-09-03");
  assert.equal(r.closing, 16710);
  assert.deepEqual(r.journals.map((j) => j.period), ["2026-09", "2026-10"]);
  for (const j of r.journals) assert.equal(bal(j), 0);
});

test("a receipt is valued at the day's rate and becomes cost; spending it realises the difference", () => {
  const [sept] = run().journals;
  assert.equal(line(sept, "incoming").credit, 332000);
  assert.equal(line(sept, "card").debit, 2220);
  assert.equal(line(sept, "fx").credit, 7);
});

test("a conversion to the base currency uses Revolut's own rate and books the fee separately at spot", () => {
  const oct = run().journals[1];
  assert.equal(line(oct, "clearing").debit, 281250);
  assert.equal(line(oct, "fees").debit, 1294 + 158);
  assert.equal(line(oct, "bank").credit, 311295);
});

test("realised FX is the sum of the per-row gains and the position carries the rest at cost", () => {
  const r = run();
  assert.equal(r.fx.realised, r.workings.reduce((a, w) => a + w.fx, 0));
  assert.equal(r.fx.realised, 5164);
  assert.equal(r.fx.position.qty, 16710);
  assert.equal(r.fx.position.cost, 18492);
  assert.equal(r.fx.position.unrealised, 307);
});

test("a base-currency statement needs no rates and has no FX", () => {
  const text = buildStatement({ currency: "USD", items: [{ date: "2026-09-02", desc: "Received money from X", amount: 500 }, { date: "2026-09-05", desc: "Sent money to Y", amount: -120, fee: 0.8 }] });
  const r = validate(text, { base: "USD" });
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(r.fx.realised, 0);
  assert.equal(line(r.journals[0], "fx"), undefined);
  assert.equal(line(r.journals[0], "fees").debit, 80);
});

test("a foreign statement with no rate refuses to journal and says what to type", () => {
  const r = validate(sampleStatement(), { base: "USD" });
  assert.equal(r.journals.length, 0);
  assert.match(r.findings[0].title, /No EUR-to-USD rate/);
});

test("rate lookup: exact day, then earlier day, then month, then a later day", () => {
  const rates = parseRates("2026-09-10 1.2\n2026-09 1.1\n2026-12-01 1.3\n");
  assert.equal(rateFor(rates, "2026-09-10"), 1.2);
  assert.equal(rateFor(rates, "2026-09-20"), 1.2);
  assert.equal(rateFor(rates, "2026-09-05"), 1.1);
  assert.equal(rateFor(rates, "2026-08-05"), 1.2);
  assert.equal(parseRates("junk").errors.length, 1);
  assert.equal(parseRates("2026-02-31 1.1").errors.length, 1);
});

test("a dropped row breaks the running balance and the journal is flagged", () => {
  const r = run(sampleBrokenStatement());
  assert.ok(r.findings.some((f) => f.severity === "error" && /Running balance does not follow/.test(f.title)));
  assert.ok(r.findings.some((f) => /could not be read|not a number/.test(f.title)));
});

test("a typed closing balance that disagrees is an error", () => {
  assert.ok(run(sampleStatement(), { closing: 16709 }).findings.some((f) => /Closing balance is/.test(f.title)));
  assert.ok(!run(sampleStatement(), { closing: 16710 }).findings.some((f) => /Closing balance is/.test(f.title)));
});

test("fees are taken on top of a debit and detected from the running balance", () => {
  const r = run();
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.ok(r.findings.some((f) => /on top of the Amount/.test(f.title)));
  for (const j of r.journals) assert.equal(bal(j), 0);
  assert.equal(r.closing, 3000_00 - 20_00 - 2500_00 - 11_50 - 300_00 - 1_40);
});

test("a credit that carries a fee arrives net of it", () => {
  const text = buildStatement({ currency: "USD", items: [{ date: "2026-09-02", desc: "Payment from X", amount: 500, fee: 5, type: "TOPUP" }] });
  const r = validate(text, { base: "USD" });
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(r.closing, 49500);
  assert.equal(r.journals[0].lines.find((l) => l.category === "bank").debit, 49500);
});

test("Revolut row types and exchange descriptions drive the category; both date styles read", () => {
  const r = run();
  const kinds = Object.fromEntries(r.rows.map((x) => [x.desc, x.kind]));
  assert.equal(kinds["Figma"], "card");
  assert.equal(kinds["Exchanged to USD"], "conversion");
  assert.equal(kinds["Payment from Acme GmbH"], "incoming");
  assert.equal(kinds["To Lisbon Cowork"], "outgoing");
  assert.equal(r.rows.find((x) => x.kind === "conversion").to, "USD");
  assert.equal(parseDate("3 Sep 2026"), "2026-09-03");
  assert.equal(parseDate("12 Oct 2026, 09:30"), "2026-10-12");
  assert.equal(parseDate("2026-09-03 12:00:00"), "2026-09-03");
});

test("oldest-first statements and statements without a balance column both work", () => {
  const asc = run(buildStatement({ items: SAMPLE_ITEMS, newestFirst: false }));
  assert.equal(asc.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(asc.fx.realised, 5164);
  const noBal = sampleStatement().split("\n").map((l, i) => {
    if (!i) return l;
    const c = l.split(","); c[18] = ""; return c.join(",");
  }).join("\n");
  const r = run(noBal);
  assert.equal(r.journals.length, 2);
  assert.equal(r.fx.realised, 5164);
});

test("an opening balance is carried at the typed cost and warned about when it is not typed", () => {
  const text = buildStatement({ opening: 1000, items: [{ date: "2026-09-03", desc: "Sent money to Z", amount: -400 }] });
  assert.ok(run(text).findings.some((f) => /Opening balance 1,000.00 EUR/.test(f.title)));
  const typed = run(text, { openingCost: 105000 });
  assert.equal(typed.workings[0].fx, 44000 - 42000);
});

test("spending more than the balance holds is flagged, not silently costed", () => {
  const text = buildStatement({ opening: 0, items: [{ date: "2026-09-03", desc: "Sent money to Z", amount: -50 }] });
  const r = run(text);
  assert.ok(r.findings.some((f) => /spent more EUR than the balance held/.test(f.title)));
});

test("two currencies in one file are refused row by row", () => {
  const text = sampleStatement().split("\n").map((l) => (l.includes("Beta SARL") ? l.replace(",EUR,1000.00,", ",GBP,1000.00,") : l)).join("\n");
  assert.ok(run(text).findings.some((f) => /More than one currency/.test(f.title)));
});

test("not a Revolut statement says which columns are missing", () => {
  assert.match(run("a,b\n1,2\n").findings[0].title, /does not look like a Revolut statement/);
  assert.match(run("").findings[0].title, /empty/);
});

test("dates and amounts: Revolut ISO and day-month-name dates, DD-MM-YYYY, European decimals", () => {
  assert.equal(parseDate("03-09-2026 12:00:00"), "2026-09-03");
  assert.equal(parseDate("2026-09-03"), "2026-09-03");
  assert.equal(parseDate("31-02-2026"), null);
  assert.equal(parseAmount("-1.234,56"), -123456);
  assert.equal(parseAmount("1,234.56"), 123456);
  assert.ok(Number.isNaN(parseAmount("2O.00")));
});

test("account mapping renames categories and rejects unknown ones", () => {
  const { mapping, errors } = parseMapping("fx = 7600\nbank = 1010\nnope = x", "EUR");
  assert.equal(mapping.fx, "7600");
  assert.equal(errors.length, 1);
  assert.equal(parseMapping("", "EUR").mapping.bank, "Revolut EUR");
  assert.equal(line(run(sampleStatement(), { mapping }).journals[0], "fx").account, "7600");
});

test("exports: Xero amounts are debit-positive, IIF has one transaction per journal, QBO carries the base currency", () => {
  const { journals } = run();
  const xero = toXeroJournalCsv(journals).trim().split("\r\n");
  assert.equal(xero[0], "*Narration,*Date,Description,*AccountCode,*TaxRate,*Amount");
  assert.equal(xero.slice(1).reduce((a, l) => a + Math.round(parseFloat(l.split(",").pop()) * 100), 0), 0);
  assert.equal(toIif(journals).split("\r\n").filter((l) => l.startsWith("TRNS")).length, 2);
  assert.match(toQboJournalCsv(journals), /,USD\r\n/);
  assert.match(journalsCsv(journals), /^period,date,category/);
});

test("workings and findings CSVs carry every row", () => {
  const r = run();
  assert.equal(workingsCsv(r).trim().split("\r\n").length, 6);
  assert.match(workingsCsv(r), /realised_fx_USD/);
  assert.match(findingsCsv(r), /^severity,line,title,detail/);
});

test("mappingText is applied after the currency is known; the generic balance account stays per-currency", () => {
  const r = validate(sampleStatement(), { base: "USD", ratesText: SAMPLE_RATES, mappingText: "bank = Revolut\nfx = 7600\nbad line" });
  assert.equal(line(r.journals[0], "bank").account, "Revolut EUR");
  assert.equal(line(r.journals[0], "fx").account, "7600");
  assert.ok(r.findings.some((f) => /account line was not read/.test(f.title)));
});
