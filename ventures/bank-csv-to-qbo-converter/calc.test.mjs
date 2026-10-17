import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, detectDelimiter, parseAmountText, detectDecimal, detectDateOrder, toIsoDate, convert, toOfx, toQif, toCleanCsv, findingsCsv, money, maskAccount, decodeBuffer, sampleCsv, sampleEuropean, sampleBroken, detectColumns } from "./calc.mjs";

const T = { today: "2026-10-20" };

test("parseCsv handles quotes, embedded commas, doubled quotes and CRLF", () => {
  const rows = parseCsv('a,b\r\n"x, y","say ""hi"""\r\n');
  assert.deepEqual(rows, [["a", "b"], ["x, y", 'say "hi"']]);
});

test("delimiter detection picks semicolon and tab", () => {
  assert.equal(detectDelimiter("a;b;c\n1;2;3"), ";");
  assert.equal(detectDelimiter("a\tb\tc\n1\t2\t3"), "\t");
  assert.equal(detectDelimiter("a,b,c\n1,2,3"), ",");
});

test("amounts: parentheses, trailing minus, symbols, thousands, DR/CR", () => {
  assert.equal(parseAmountText("($1,234.56)"), -123456);
  assert.equal(parseAmountText("1,234.50-"), -123450);
  assert.equal(parseAmountText("-12.5"), -1250);
  assert.equal(parseAmountText("12.00 DR"), -1200);
  assert.equal(parseAmountText("12.00 CR"), 1200);
  assert.equal(parseAmountText("1.234,56", ","), 123456);
  assert.equal(parseAmountText("0.07"), 7);
  assert.equal(parseAmountText("12.9x"), null);
  assert.equal(parseAmountText("USD 12.50"), 1250);
  assert.equal(parseAmountText(""), null);
  assert.equal(parseAmountText("19.995"), null);
});

test("no floating point drift: 0.1 + 0.2 style sums are exact", () => {
  const r = convert("Date,Description,Amount\n2026-10-01,a,0.10\n2026-10-02,b,0.20", T);
  assert.equal(r.summary.net, 30);
  assert.equal(money(r.summary.net), "0.30");
});

test("decimal comma is detected from the column", () => {
  assert.equal(detectDecimal(["1.250,00", "-96,40"]), ",");
  assert.equal(detectDecimal(["1,250.00", "96.40"]), ".");
});

test("date order: day>12 forces DMY, second>12 forces MDY, else ambiguous", () => {
  assert.deepEqual(detectDateOrder(["13/10/2026", "02/10/2026"]), { order: "DMY", ambiguous: false });
  assert.deepEqual(detectDateOrder(["10/13/2026", "02/10/2026"]), { order: "MDY", ambiguous: false });
  assert.equal(detectDateOrder(["03/04/2026", "05/06/2026"]).ambiguous, true);
  assert.equal(toIsoDate("03/04/2026", "DMY"), "2026-04-03");
  assert.equal(toIsoDate("03/04/2026", "MDY"), "2026-03-04");
  assert.equal(toIsoDate("2026-10-04"), "2026-10-04");
  assert.equal(toIsoDate("20261004"), "2026-10-04");
  assert.equal(toIsoDate("4 Oct 2026"), "2026-10-04");
  assert.equal(toIsoDate("Oct 4, 2026"), "2026-10-04");
  assert.equal(toIsoDate("02/30/2026", "MDY"), null);
  assert.equal(toIsoDate("2024-02-29"), "2024-02-29");
  assert.equal(toIsoDate("2026-02-29"), null);
});

test("column detection by header synonyms", () => {
  const c = detectColumns(["Posting Date", "Details", "Withdrawals", "Deposits", "Running Balance", "Check Number"]);
  assert.deepEqual(c, { date: 0, desc: 1, debit: 2, credit: 3, balance: 4, check: 5 });
});

test("debit/credit columns convert to signed amounts and the sample balances", () => {
  const r = convert(sampleCsv(), T);
  assert.equal(r.summary.imported, 6);
  assert.equal(r.transactions[1].cents, -81240);
  assert.equal(r.transactions[2].desc, "STRIPE PAYOUT, ORDERS");
  assert.equal(r.findings.filter((f) => f.title.startsWith("Running balance")).length, 0);
  assert.equal(r.summary.net, 523459);
});

test("European semicolon file with decimal comma and DMY", () => {
  const r = convert(sampleEuropean(), T);
  assert.equal(r.delimiter, ";");
  assert.equal(r.summary.dateOrder, "DMY");
  assert.equal(r.transactions[0].cents, -125000);
  assert.equal(r.transactions[1].cents, 238050);
  assert.equal(r.transactions[1].date, "2026-10-13");
});

test("broken example: unreadable rows named, identical rows flagged, balance break found, future date", () => {
  const r = convert(sampleBroken(), T);
  const titles = r.findings.map((f) => f.title);
  assert.ok(titles.includes("Row skipped: unreadable date"));
  assert.ok(titles.includes("Row skipped: unreadable amount"));
  assert.ok(titles.includes("Identical rows"));
  assert.ok(titles.includes("Dates in the future"));
  assert.ok(titles.some((t) => t.startsWith("Running balance")));
  assert.equal(r.summary.skipped, 2);
  assert.equal(r.transactions.find((t) => t.desc === "Office Depot").cents, -14219);
});

test("identical rows get distinct, stable ids", () => {
  const a = convert(sampleBroken(), T).transactions.filter((t) => t.desc === "Coffee Roasters");
  const b = convert(sampleBroken(), T).transactions.filter((t) => t.desc === "Coffee Roasters");
  assert.notEqual(a[0].fitid, a[1].fitid);
  assert.deepEqual(a.map((t) => t.fitid), b.map((t) => t.fitid));
});

test("flipSign inverts every amount (credit card files)", () => {
  const r = convert("Date,Description,Amount\n2026-10-01,Shop,25.00", { ...T, flipSign: true });
  assert.equal(r.transactions[0].cents, -2500);
});

test("Type column with Debit/Credit words fixes signs of an unsigned amount column", () => {
  const r = convert("Date,Description,Amount,Type\n2026-10-01,Shop,25.00,Debit\n2026-10-02,Pay,40.00,Credit", T);
  assert.deepEqual(r.transactions.map((t) => t.cents), [-2500, 4000]);
});

test("headerless file is guessed and warned about", () => {
  const r = convert("2026-10-01,Coffee,-4.50\n2026-10-02,Lunch,-12.00", T);
  assert.equal(r.summary.imported, 2);
  assert.ok(r.findings.some((f) => f.title === "No header row found"));
});

test("missing date or amount column is an error, not a silent empty file", () => {
  assert.ok(convert("Foo,Bar\n1,2", T).findings.some((f) => f.severity === "error"));
  assert.equal(convert("", T).summary.imported, 0);
});

test("OFX output has QBO structure, sorted, escaped, 32-char names, FITIDs", () => {
  const r = convert("Date,Description,Amount\n2026-10-02,AT&T <wireless> bill for the whole long month of october,-60.00\n2026-10-01,Pay,100.00", T);
  const ofx = toOfx(r, { accountId: "1234", routing: "021000021", intuBid: "3000", now: "2026-10-04T00:00:00Z", endingBalanceCents: 4000 });
  assert.match(ofx, /^OFXHEADER:100\r\nDATA:OFXSGML\r\nVERSION:102/);
  assert.match(ofx, /<INTU\.BID>3000/);
  assert.match(ofx, /<BANKID>021000021<ACCTID>1234<ACCTTYPE>CHECKING/);
  assert.ok(ofx.indexOf("<TRNAMT>100.00") < ofx.indexOf("<TRNAMT>-60.00"));
  assert.match(ofx, /<NAME>AT&amp;T &lt;wireless&gt; bill for the who<MEMO>AT&amp;T/);
  assert.match(ofx, /<LEDGERBAL><BALAMT>40.00/);
  assert.match(ofx, /<DTSTART>20261001120000<DTEND>20261002120000/);
  assert.equal((ofx.match(/<STMTTRN>/g) || []).length, (ofx.match(/<\/STMTTRN>/g) || []).length);
});

test("credit card OFX uses the CC message set and no BANKID", () => {
  const ofx = toOfx(convert("Date,Description,Amount\n2026-10-01,Shop,-5.00", T), { accountType: "credit", accountId: "9999" });
  assert.match(ofx, /<CREDITCARDMSGSRSV1><CCSTMTTRNRS>/);
  assert.match(ofx, /<CCACCTFROM><ACCTID>9999<\/CCACCTFROM>/);
  assert.doesNotMatch(ofx, /BANKID/);
});

test("QIF output uses MM/DD/YYYY and type header", () => {
  const q = toQif(convert("Date,Description,Amount\n2026-10-01,Shop,-5.00", T));
  assert.match(q, /^!Type:Bank\r\nD10\/01\/2026\r\nT-5\.00\r\nPShop\r\n\^/);
  assert.match(toQif(convert("Date,Description,Amount\n2026-10-01,Shop,-5.00", T), { accountType: "credit" }), /^!Type:CCard/);
});

test("clean CSV neutralises formula characters in descriptions", () => {
  const r = convert('Date,Description,Amount\n2026-10-01,"=HYPERLINK(""http://x"")",-5.00\n2026-10-02,"@SUM(1)",1.00', T);
  const csv = toCleanCsv(r);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /'@SUM/);
  assert.match(csv, /-5\.00/);
  assert.match(findingsCsv(r), /^Severity,Line,Title,Detail/);
});

test("utf-8 BOM and windows-1252 bytes decode", () => {
  assert.equal(decodeBuffer(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]).buffer), "a");
  assert.equal(decodeBuffer(new Uint8Array([0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72]).buffer), "Müller");
});

test("maskAccount keeps the last four", () => {
  assert.equal(maskAccount("123456789"), "*****6789");
});

test("a large file converts without losing rows", () => {
  const lines = ["Date,Description,Amount"];
  for (let i = 0; i < 5000; i++) lines.push(`2026-09-${String(1 + (i % 28)).padStart(2, "0")},Item ${i},-${(i % 90) + 1}.25`);
  assert.equal(convert(lines.join("\n"), T).summary.imported, 5000);
});
