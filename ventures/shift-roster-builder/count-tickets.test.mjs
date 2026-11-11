import { test } from "node:test";
import assert from "node:assert/strict";
import { readSales, hourlySales, demandShifts, backtestSales } from "./demand.mjs";

// Invented rows in the shapes of the real files in eval/tickets-vs-sales.mjs: item lines with a ticket number
// (French bakery), transactions with no price at all (the Bread Basket).
const ITEMS = [
  "date,time,ticket_number,article,Quantity,unit_price",
  "2026-11-02,08:05,1,BAGUETTE,1,\"0,90 €\"",
  "2026-11-02,08:05,1,CROISSANT,2,\"1,10 €\"",
  "2026-11-02,08:20,2,BAGUETTE,1,\"0,90 €\"",
  "2026-11-02,12:10,3,TARTE,1,\"25,00 €\"",
].join("\n");
const NOPRICE = "Date,Time,Transaction,Item\n2026-11-02,09:58:11,1,Bread\n2026-11-02,10:05:34,2,Scandinavian\n2026-11-02,10:05:34,2,Scandinavian\n2026-11-02,10:07:57,3,Hot chocolate\n";

test("--count tickets: each distinct ticket number is one customer, at its first row's hour", () => {
  const r = readSales(ITEMS, { count: "tickets" });
  assert.equal(r.count, "tickets");
  assert.equal(r.rows, 3);
  assert.deepEqual(r.entries.map((e) => [e.hour, e.amount]), [[8, 1], [8, 1], [12, 1]]);
  assert.ok(r.notes.some((n) => /Counting tickets: each distinct "ticket_number"/.test(n)));
  assert.ok(!r.notes.some((n) => /quantity times its unit price/.test(n)));
  // By sales the 12:00 tart outweighs the whole morning; by tickets the morning is twice as busy.
  const s = hourlySales(ITEMS), t = hourlySales(ITEMS, { count: "tickets" });
  assert.ok(s.avg[0][12] > s.avg[0][8]);
  assert.equal(t.avg[0][8], 2); assert.equal(t.avg[0][12], 1);
});

test("no sales column but a transaction number: counted by ticket, with a note", () => {
  const r = readSales(NOPRICE);
  assert.equal(r.count, "tickets");
  assert.equal(r.rows, 3);
  assert.ok(r.notes.some((n) => /No sales column: counting tickets instead/.test(n)));
  const d = demandShifts(NOPRICE, { splh: 1, halfLife: "none" });
  assert.equal(d.count, "tickets");
  assert.ok(d.shiftsText.length > 0);
});

test("ticket numbers that restart each day stay distinct per date; --count rows counts every row", () => {
  const csv = "Date,Time,Receipt No,Total\n2026-11-02,09:00,1,5\n2026-11-02,09:30,1,5\n2026-11-09,09:00,1,5\n";
  assert.equal(readSales(csv, { count: "tickets" }).rows, 2);
  const rows = readSales(csv, { count: "rows" });
  assert.equal(rows.count, "rows"); assert.equal(rows.rows, 3);
  assert.equal(readSales(csv).count, "sales");
});

test("--count tickets without a ticket column says so; a bad count is refused", () => {
  const csv = "Date Time,Net Sales\n2026-11-02 09:00,100\n";
  const r = readSales(csv, { count: "tickets" });
  assert.equal(r.rows, 0);
  assert.match(r.notes.join(" "), /No ticket, order or receipt number column/);
  assert.throws(() => readSales(csv, { count: "people" }), /count must be/);
  // No sales and no ticket column: the old message, now naming --count.
  assert.match(readSales("Date Time,Item\n2026-11-02 09:00,Bread\n").notes.join(" "), /--count rows/);
});

test("the backtest runs on tickets (skip dates still apply)", () => {
  const lines = ["Date,Time,Transaction,Item"];
  let n = 0;
  for (let w = 0; w < 7; w++) for (let d = 0; d < 7; d++) {
    const day = new Date(Date.UTC(2026, 10, 2 + w * 7 + d)).toISOString().slice(0, 10);
    for (let k = 0; k < 6 + d; k++) lines.push(`${day},${9 + (k % 4)}:15:00,${++n},Bread`);
  }
  const csv = lines.join("\n");
  const b = backtestSales(csv, { splh: 2, shifts: true });
  assert.ok(b.weeks >= 2);
  const skipped = readSales(csv, { skipDates: ["2026-11-02"] });
  assert.equal(skipped.rows, n - 6);
});

test("CLI: --count tickets, and the summary names tickets", async () => {
  const { spawnSync } = await import("node:child_process");
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(tmpdir() + "/cnt-");
  writeFileSync(dir + "/s.csv", ITEMS);
  const cli = new URL("./cli.mjs", import.meta.url).pathname;
  const r = spawnSync("node", [cli, "--from-sales", dir + "/s.csv", "--splh", "1", "--count", "tickets", "--half-life", "none"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /average week tickets 3/);
  const bad = spawnSync("node", [cli, "--from-sales", dir + "/s.csv", "--splh", "1", "--count", "people"], { encoding: "utf8" });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /--count needs/);
});

test("sales page: a 'Staff to' choice passes count to the plan and the backtest", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("./shifts-from-sales.html", import.meta.url), "utf8");
  assert.match(html, /<select id="count">/);
  assert.equal((html.match(/count: \$\("#count"\)\.value \|\| undefined/g) || []).length, 2);
});

test("the backtest's note names the unit counted", () => {
  const lines = ["Date,Time,Transaction,Item"];
  let n = 0;
  for (let d = 0; d < 49; d++) { const day = new Date(Date.UTC(2026, 10, 2 + d)).toISOString().slice(0, 10); for (let k = 0; k < 5; k++) lines.push(`${day},10:0${k}:00,${++n},Bread`); }
  assert.match(backtestSales(lines.join("\n"), { splh: 2 }).notes.at(-1), /at 2 tickets per labor hour/);
});
