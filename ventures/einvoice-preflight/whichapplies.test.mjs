import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { answer, render, COUNTRIES } from "./whichapplies.mjs";

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");

test("Germany: 800,000 is the edge, above it 2027, at or under it 2028", () => {
  assert.equal(answer("DE", 800001).date, "2027-01-01");
  assert.equal(answer("DE", 800000).date, "2028-01-01");
  assert.equal(answer("DE", 0).date, "2028-01-01");
});
test("Spain: above 8 million is 6 Oct 2027, else 2028", () => {
  assert.equal(answer("ES", 8000001).date, "2027-10-06");
  assert.equal(answer("ES", 8000000).date, "2028-10-06");
});
test("UAE: 50 million or more is the first wave", () => {
  assert.equal(answer("AE", 50000000).date, "2027-01-01");
  assert.equal(answer("AE", 49999999).date, "2027-07-01");
});
test("Poland: above 200 million is February 2026, else April, smallest wave in the note", () => {
  assert.equal(answer("PL", 200000001).date, "2026-02-01");
  assert.equal(answer("PL", 200000000).date, "2026-04-01");
  assert.match(answer("PL", 1000).note, /1 January 2027/);
});
test("Oman and France", () => {
  assert.equal(answer("OM", 6e6).date, "2027-04-01");
  assert.equal(answer("OM", 5e6).date, "2027-10-01");
  assert.equal(answer("FR", "large").date, "2026-09-01");
  assert.equal(answer("FR", "small").date, "2027-09-01");
});
test("bad input is refused, not guessed", () => {
  for (const bad of [-1, NaN, Infinity, "5", null, undefined]) assert.throws(() => answer("DE", bad));
  assert.throws(() => answer("FR", 5));
  assert.throws(() => answer("XX", 5));
});
test("every wave date agrees with mandate-dates.json and every page exists", () => {
  const ev = JSON.parse(read("mandate-dates.json")).events;
  for (const [k, c] of Object.entries(COUNTRIES)) {
    assert.ok(fs.existsSync(new URL(`./${c.page}`, import.meta.url)), c.page);
    for (const w of c.waves) {
      if (k === "MY") continue; // the hub cell holds only the first date; MY is checked against its page below
      assert.ok(ev.some((e) => e.country === c.name && e.date === w.date), `${c.name} ${w.date} not in mandate-dates.json`);
    }
  }
});
test("the written page is the generated one, carries the disclaimer, is linked", () => {
  assert.equal(read("which-e-invoice-mandate-applies.html"), render());
  assert.match(render(), /<strong>No warranty\.<\/strong>/);
  assert.match(read("e-invoicing-mandates-by-country.html"), /href="which-e-invoice-mandate-applies\.html"/);
  assert.match(read("sitemap.xml"), /which-e-invoice-mandate-applies\.html<\/loc>/);
});
test("Malaysia: five turnover bands, edges per the country page table", () => {
  assert.equal(answer("MY", 100000001).date, "2024-08-01");
  assert.equal(answer("MY", 100000000).date, "2025-01-01");
  assert.equal(answer("MY", 25000000).date, "2025-01-01");
  assert.equal(answer("MY", 24999999).date, "2025-07-01");
  assert.equal(answer("MY", 5000000).date, "2025-07-01");
  assert.equal(answer("MY", 4999999).date, "2026-01-01");
  assert.equal(answer("MY", 1000000).date, "2026-01-01");
  assert.equal(answer("MY", 999999).date, "2026-07-01");
  assert.match(answer("MY", 10).what, /exempt/);
});
test("Malaysia wave dates appear in the phases table on its own page", () => {
  const html = read("malaysia-myinvois-e-invoice-mandate.html");
  const mon = { "01": "Jan", "07": "Jul", "08": "Aug" };
  for (const w of COUNTRIES.MY.waves) {
    const [y, m] = w.date.split("-");
    assert.ok(html.includes(`<td>1 ${mon[m]} ${y}</td>`), w.date);
  }
});

// The command line: `node whichapplies.mjs DE 500000` and `--check`, run as a
// user would (red team 2026-11-26: every CLI line was unguarded).
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
const SELF = new URL("./whichapplies.mjs", import.meta.url);
const cli = (args, script = SELF) => spawnSync(process.execPath, [script instanceof URL ? script.pathname : script, ...args], { encoding: "utf8" });

test("CLI answers a country and a turnover, either side of the edge", () => {
  const lo = cli(["DE", "500000"]), hi = cli(["de", "900000"]);
  assert.equal(lo.status, 0, lo.stderr);
  assert.match(lo.stdout, /^Germany: 2028-01-01\n/);
  assert.equal(hi.status, 0, hi.stderr);
  assert.match(hi.stdout, /^Germany: 2027-01-01\n/);
  const fr = cli(["FR", "LARGE"]);
  assert.equal(fr.status, 0, fr.stderr);
  assert.match(fr.stdout, /^France: 2026-09-01\n/);
});
test("CLI refuses a blank or non-number turnover instead of reading it as 0", () => {
  for (const bad of ["", " ", "500k", "-1"]) {
    const r = cli(["DE", bad]);
    assert.notEqual(r.status, 0, `"${bad}" was answered: ${r.stdout}`);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /turnover must be a number/);
  }
});
test("--check passes on the tree, writes nothing, and fails on a stale page", () => {
  const ok = cli(["--check"]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout, "");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "whichapplies-"));
  try {
    for (const f of ["whichapplies.mjs", "e-invoicing-mandates-by-country.html"]) fs.copyFileSync(new URL(`./${f}`, import.meta.url), path.join(dir, f));
    const page = path.join(dir, "which-e-invoice-mandate-applies.html");
    fs.writeFileSync(page, "stale");
    const stale = cli(["--check"], path.join(dir, "whichapplies.mjs"));
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /is stale/);
    assert.equal(fs.readFileSync(page, "utf8"), "stale", "--check must not rewrite the page");
    fs.rmSync(page);
    assert.equal(cli(["--check"], path.join(dir, "whichapplies.mjs")).status, 1, "a missing page is stale too");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
