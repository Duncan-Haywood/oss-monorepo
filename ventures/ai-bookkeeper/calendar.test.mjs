import test from "node:test";
import assert from "node:assert/strict";
import { taxCalendar, toIcs } from "./calendar.mjs";
import { salesTaxDueDates } from "./salestaxreturn.mjs";

test("federal dates for 2026 match the estimate plan and filing day", () => {
  const ev = taxCalendar(2026);
  assert.deepEqual(ev.filter((e) => /estimated/.test(e.title)).map((e) => e.date), ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"]);
  assert.ok(ev.some((e) => e.date === "2027-04-15" && /federal return/.test(e.title)));
});

test("payroll and contractor dates roll off weekends (2027-01-31 is a Sunday)", () => {
  const ev = taxCalendar(2026, { payroll: true });
  assert.ok(ev.some((e) => e.date === "2027-02-01" && /W-2/.test(e.title)));
  assert.equal(ev.filter((e) => /941/.test(e.title)).length, 4);
  assert.equal(taxCalendar(2026).filter((e) => /1099/.test(e.title)).length, 0);
  assert.equal(taxCalendar(2026, { contractors: true }).filter((e) => /1099/.test(e.title)).length, 1);
});

test("sales tax dates follow the worksheet's rules (CA quarterly: last day of month after quarter)", () => {
  // returns DUE in 2026: last year's Q4 (Jan 31 2026 is a Saturday) and Q1 to Q3
  const d = salesTaxDueDates(2026, { state: "CA", frequency: "quarterly" });
  assert.deepEqual(d.map((x) => [x.period, x.due]), [["2025-Q4", "2026-02-02"], ["2026-Q1", "2026-04-30"], ["2026-Q2", "2026-07-31"], ["2026-Q3", "2026-11-02"]]);
});

test("monthly filers get twelve returns in the year, all dated in it", () => {
  const d = salesTaxDueDates(2026, { state: "TX", frequency: "monthly" });
  assert.equal(d.length, 12);
  assert.ok(d.every((x) => x.due.startsWith("2026")));
});

test("ics is RFC 5545 shaped: CRLF, folded lines, all-day dates, planned amounts", () => {
  const ics = toIcs(taxCalendar(2026, { state: "CA", estimates: [123456, 123456, 123456, 123456] }), { name: "2026, taxes" });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20260415\r\nDTEND;VALUE=DATE:20260416"));
  assert.ok(ics.includes("X-WR-CALNAME:2026\\, taxes"));
  assert.ok(ics.includes("Planned payment 1234.56"));
  for (const l of ics.split("\r\n")) assert.ok(Buffer.byteLength(l) <= 75, l);
  const uids = ics.match(/^UID:.*$/gm);
  assert.equal(new Set(uids).size, uids.length);
});

test("semicolons in ics text are escaped as \\; (RFC 5545 TEXT)", () => {
  const ics = toIcs([{ date: "2026-04-15", title: "Pay\; then file", notes: "a;b" }]);
  assert.ok(ics.includes("SUMMARY:Pay\\; then file"));
  assert.ok(ics.includes("DESCRIPTION:a\\;b"));
});

test("cli --planned puts the four amounts in the events and rejects a bad list", async () => {
  const { execFileSync, spawnSync } = await import("node:child_process");
  const cli = new URL("./cli.mjs", import.meta.url).pathname;
  const out = JSON.parse(execFileSync("node", [cli, "calendar", "--year", "2026", "--planned", "1200,1200,1200,1500.50", "--json"], { encoding: "utf8" }));
  assert.deepEqual(out.filter((e) => /estimated/.test(e.title)).map((e) => e.notes), ["Planned payment 1200.00", "Planned payment 1200.00", "Planned payment 1200.00", "Planned payment 1500.50"]);
  const bad = spawnSync("node", [cli, "calendar", "--planned", "1,2,3"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
});

test("toIcs does not need Node's Buffer, so the browser page can call it", () => {
  const B = globalThis.Buffer;
  try {
    delete globalThis.Buffer;
    const ics = toIcs([{ date: "2026-04-15", title: "Zahlung für die Steuer ".repeat(6), notes: "ü" }]);
    assert.match(ics, /BEGIN:VCALENDAR/);
    assert.ok(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75));
  } finally { globalThis.Buffer = B; }
});
