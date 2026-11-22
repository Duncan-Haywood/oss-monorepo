import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { parseStatementText, sampleStatement, sampleCard, sampleBroken } from "./calc.mjs";
import { stitch } from "./bankfile.mjs";
import { toXlsx, workbookSheets, dateSerial, crc32 } from "./xlsx.mjs";

// Reads back the entries of a zip written by toXlsx (stored or deflated).
function unzip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = {};
  let p = 0;
  while (dv.getUint32(p, true) === 0x04034b50) {
    const method = dv.getUint16(p + 8, true), crc = dv.getUint32(p + 14, true), size = dv.getUint32(p + 18, true), nlen = dv.getUint16(p + 26, true), xlen = dv.getUint16(p + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 30, p + 30 + nlen));
    const body = bytes.subarray(p + 30 + nlen + xlen, p + 30 + nlen + xlen + size);
    const data = method === 8 ? new Uint8Array(inflateRawSync(body)) : body;
    assert.equal(crc32(data), crc, `crc of ${name}`);
    out[name] = new TextDecoder().decode(data);
    p += 30 + nlen + xlen + size;
  }
  return out;
}

test("a bank statement: Summary, one transaction sheet, Findings", () => {
  const r = parseStatementText(sampleStatement(), { kind: "bank" });
  const sheets = workbookSheets(r);
  assert.deepEqual(sheets.map((s) => s.name), ["Summary", "Transactions", "Findings"]);
  const tx = sheets[1].rows;
  assert.deepEqual(tx[0].slice(0, 8), ["Date", "Description", "Money out", "Money in", "Amount", "Balance (statement)", "Balance (running)", "Check"]);
  assert.equal(tx.length, 10);
  // real dates and real money
  assert.deepEqual(tx[1][0], { date: dateSerial({ y: 2026, m: 1, d: 2 }) });
  assert.equal(dateSerial({ y: 2026, m: 1, d: 2 }), 46024);
  assert.deepEqual(tx[1][3], { money: 142000 });
  // the running balance starts from the opening and is a formula
  assert.equal(tx[1][6].f, "ROUND(4210.55+E2,2)");
  assert.equal(tx[2][6].f, "ROUND(G2+E3,2)");
  assert.equal(tx[1][6].v, 563055);
  assert.ok(tx.slice(1).every((row) => row[7].v === "ok"));
  const sum = sheets[0].rows.find((row) => row[0] === "This statement");
  assert.equal(sum[4].f, "SUM('Transactions'!D2:D10)");
  assert.equal(sum[9].v, "yes");
  assert.equal(sum[10].v, 0);
});

test("a card statement: the balance owed rises with a charge", () => {
  const r = parseStatementText(sampleCard(), { kind: "card" });
  const tx = workbookSheets(r)[1].rows;
  assert.equal(tx[0][1], "Posted");
  assert.equal(tx[1][7].f, "ROUND(812.40-F2,2)");
  assert.equal(tx[1][7].v, 81240 + 12999);
  const sum = workbookSheets(r)[0].rows.find((row) => row[0] === "This statement");
  assert.equal(sum[6].f, "ROUND(D7+F7-E7,2)");
  assert.equal(sum[6].v, 101377);
  assert.equal(sum[9].v, "yes");
});

test("a lost row: the workbook says by how much and where the balance breaks", () => {
  const r = parseStatementText(sampleBroken(), { kind: "bank" });
  const sheets = workbookSheets(r);
  const sum = sheets[0].rows.find((row) => row[0] === "This statement");
  assert.equal(sum[9].v, "no, off by 600.00");
  const checks = sheets[1].rows.slice(1).map((row) => row[7].v);
  assert.deepEqual(checks.slice(0, 3), ["ok", "ok", "off by 600.00"]);
  assert.ok(sheets[2].rows.some((row) => row[0] === "error"));
});

test("joined statements carry a File column and a list of statements", () => {
  const a = parseStatementText(sampleStatement());
  const s = stitch([{ name: "jan.pdf", result: a }]);
  const sheets = workbookSheets(s);
  assert.equal(sheets[1].rows[0].at(-1), "File");
  assert.equal(sheets[1].rows[1].at(-1), "jan.pdf");
  assert.ok(sheets[0].rows.some((row) => row[0] === "Statements joined"));
  assert.ok(sheets[0].rows.some((row) => row[0] === "jan.pdf"));
});

test("several accounts: a sheet each, named safely, with printed totals compared", () => {
  const tx = [
    { account: 0, date: { y: 2024, m: 9, d: 1, ok: true }, description: "Fps payment", amount: -10000, delta: -10000, balance: 90000, line: 3, source: "balance" },
    { account: 0, date: { y: 2024, m: 9, d: 2, ok: true }, description: "Fps received", amount: 5000, delta: 5000, balance: 95000, line: 4, source: "balance" },
    { account: 1, date: { y: 2024, m: 9, d: 3, ok: true }, description: "Fps transfer", amount: -2000, delta: -2000, balance: 500000, line: 8, source: "balance" },
  ];
  const r = { kind: "bank", findings: [], transactions: tx, reconcile: { ok: true, method: "sections", sections: [
    { account: 0, title: "HKD Current: Account [main]", opening: 100000, closing: 95000, totalIn: 5000, totalOut: 10000 },
    { account: 1, title: "HKD Current: Account [main]", opening: 502000, closing: 500000, totalIn: null, totalOut: 2000 },
  ] } };
  const sheets = workbookSheets(r);
  assert.deepEqual(sheets.map((s) => s.name), ["Summary", "HKD Current Account main", "HKD Current Account main (2)", "Findings"]);
  const rows = sheets[0].rows.filter((row) => row[0] === "HKD Current: Account [main]");
  assert.equal(rows.length, 2);
  assert.equal(rows[0][13].v, "yes");
  assert.equal(rows[1][13].v, "yes");
  assert.match(rows[1][4].f, /^SUM\('HKD Current Account main \(2\)'!D2:D2\)$/);
});

test("the .xlsx is a valid zip of SpreadsheetML that recalculates on open", async () => {
  const r = parseStatementText(sampleStatement());
  const bytes = await toXlsx(r);
  assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b);
  const files = unzip(bytes);
  assert.ok(files["[Content_Types].xml"].includes("/xl/worksheets/sheet3.xml"));
  assert.match(files["xl/workbook.xml"], /fullCalcOnLoad="1"/);
  assert.match(files["xl/workbook.xml"], /<sheet name="Summary" sheetId="1"/);
  const s2 = files["xl/worksheets/sheet2.xml"];
  assert.match(s2, /<c r="A2" s="2"><v>46024<\/v><\/c>/);
  assert.match(s2, /<c r="G2" s="3"><f>ROUND\(4210\.55\+E2,2\)<\/f><v>5630\.55<\/v><\/c>/);
  assert.match(s2, /<c r="H2" t="str"><f>IF\(F2="","",IF\(ROUND\(G2-F2,2\)=0,"ok","off by "&amp;TEXT/);
  // the same statement gives the same bytes
  assert.deepEqual(await toXlsx(r), bytes);
  // without cached values, formulas carry no <v>
  const bare = unzip(await toXlsx(r, { cache: false, deflate: null }))["xl/worksheets/sheet2.xml"];
  assert.match(bare, /<c r="G2" s="3"><f>ROUND\(4210\.55\+E2,2\)<\/f><\/c>/);
});

test("markup and control characters in a description cannot break the XML", async () => {
  const r = parseStatementText(sampleStatement());
  r.transactions[0] = { ...r.transactions[0], description: 'A&B <Ltd> "x" \u0001 end' };
  const s2 = unzip(await toXlsx(r))["xl/worksheets/sheet2.xml"];
  assert.ok(s2.includes("A&amp;B &lt;Ltd&gt; \"x\"  end"));
});

test("no rows: refused", async () => {
  await assert.rejects(toXlsx({ transactions: [], findings: [], reconcile: {} }), /No transactions/);
});
