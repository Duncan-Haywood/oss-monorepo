import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { parseHub, splitClauses, toIcs, build } from "./mandate-calendar.mjs";

const hub = fs.readFileSync(new URL("./e-invoicing-mandates-by-country.html", import.meta.url), "utf8");

test("splitClauses keeps brackets whole and gives each date its own words", () => {
  assert.deepEqual(splitClauses("Rule A (vendor guides; draft); rule B"), ["Rule A (vendor guides; draft)", "rule B"]);
  assert.deepEqual(splitClauses("KSeF: 1 Feb 2026 big, 1 Apr 2026 most"), ["KSeF: 1 Feb 2026 big", "KSeF: 1 Apr 2026 most"]);
});

test("parses ISO dates, ignores month-only text", () => {
  const rows = '<tbody><tr><th scope="row"><a href="x-e-invoice-mandate.html">X</a></th><td>From 5 Mar 2027 for all; late 2028</td><td>Planned</td></tr></tbody>';
  const ev = parseHub(rows);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].date, "2027-03-05");
  assert.equal(ev[0].page, "x-e-invoice-mandate.html");
});

test("hub yields France's 1 Sep 2026 and 1 Sep 2027 and Germany's 2025 receive date", () => {
  const ev = parseHub(hub);
  const has = (c, d) => ev.some((e) => e.country === c && e.date === d);
  assert.ok(has("France", "2026-09-01"));
  assert.ok(has("France", "2027-09-01"));
  assert.ok(has("Germany", "2025-01-01"));
  assert.ok(ev.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && fs.existsSync(new URL(`./${e.page}`, import.meta.url))));
});

test("ICS is well-formed: CRLF, folded at 75 bytes, escaped, one UID per event", () => {
  const ics = toIcs([{ date: "2027-01-01", country: "A", page: "a.html", status: "Planned", note: "x, y; z" }]);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
  assert.match(ics, /SUMMARY:A: x\\, y\\; z/);
  const full = build().ics;
  for (const l of full.split("\r\n")) assert.ok(Buffer.byteLength(l) <= 75, l);
  const uids = full.match(/^UID:.*$/gm);
  assert.equal(new Set(uids).size, uids.length);
  assert.equal(uids.length, build().events.length);
});

test("written files match the hub (run node mandate-calendar.mjs)", () => {
  const { json, ics } = build();
  assert.equal(fs.readFileSync(new URL("./mandate-dates.json", import.meta.url), "utf8"), json);
  assert.equal(fs.readFileSync(new URL("./mandate-calendar.ics", import.meta.url), "utf8"), ics);
});
