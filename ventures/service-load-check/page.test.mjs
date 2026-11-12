import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_HOUSE, EXAMPLE_HOUSE, EXAMPLE_LOADS, EXAMPLE_NEW_HOUSE, EXAMPLE_NEW_LOADS, calc22082, calc22083, calc22087, roomForOther } from "./calc.mjs";
import { parseUsage, measuredDemand, exampleCsv } from "./interval.mjs";
import { largestCharger } from "./report.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "ev-charger-without-panel-upgrade.html", "what-size-electrical-service.html"];

test("pages carry the disclaimer and sponsor link; the tool page the privacy line", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /not legal, tax, accounting, compliance, engineering, or financial advice/, p);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, p);
    assert.match(html, /<script type="application\/ld\+json">/, p);
  }
  assert.match(page("index.html"), /Everything runs in your browser/);
});

test("every static input has a label and nothing can send data anywhere", () => {
  const html = page("index.html");
  for (const id of [...Object.keys(DEFAULT_HOUSE), "data", "file", "unit", "solar"]) assert.match(html, new RegExp(`<label (class="sr" )?for="${id}">`), id);
  for (const f of ["index.html", "calc.mjs", "interval.mjs", "report.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/, f);
});

test("the module script imports only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./interval.mjs", "./report.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("pages state what they do not decide and that the example is a placeholder", () => {
  for (const p of PAGES) assert.match(page(p), /Not decided/, p);
  assert.match(page("index.html"), /synthetic placeholder/i);
  assert.match(page("ev-charger-without-panel-upgrade.html"), /placeholder/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  const named = [...html.matchAll(/<code>([a-z_]+)<\/code>/g)].map((m) => m[1]).sort();
  const recorded = [...html.matchAll(/record\("([a-z_]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(named, [...new Set(recorded)].sort());
});

test("the guide's worked example matches the engine", () => {
  const html = page("ev-charger-without-panel-upgrade.html");
  const before = calc22083(EXAMPLE_HOUSE, EXAMPLE_LOADS.filter((l) => !l.isNew));
  const withEv = calc22083(EXAMPLE_HOUSE, EXAMPLE_LOADS);
  const room = roomForOther(before, 100, 240);
  const m = measuredDemand(parseUsage(exampleCsv()));
  const c0 = calc22087(m.peakKw, 0, 100, 240);
  const c48 = calc22087(m.peakKw, 11520, 100, 240);
  const fmt = (x) => Math.round(x).toLocaleString("en-US");
  for (const s of [
    `= ${fmt(before.other)} VA`,
    `${fmt(before.totalVa)} VA, or ${(before.totalVa / 240).toFixed(1)} A`,
    `${fmt(room)} VA of new nameplate`,
    `set to ${largestCharger(room, 240)} A, not 40 A`,
    `${m.peakKw.toFixed(2)} kW`,
    `${fmt(c0.existingVa)} VA, or ${(c0.existingVa / 240).toFixed(1)} A, leaving ${fmt(c0.roomVa)} VA`,
    `set to ${largestCharger(c0.roomVa, 240)} A, not 48 A`,
    `${(withEv.totalVa / 240).toFixed(1)} A by 220.83 and ${c48.totalA.toFixed(1)} A by 220.87`,
  ]) assert.ok(html.includes(s), s);
  assert.equal(new Date(m.peakAt).getUTCMonth(), 7); // "an August evening"
  assert.ok(new Date(m.peakAt).getUTCHours() >= 17);
});

test("sitemap lists every page", () => {
  const sm = page("sitemap.xml");
  for (const p of PAGES) assert.match(sm, new RegExp(`<loc>./${p}</loc>`));
});

test("the 220.82 guide's worked example matches the engine", () => {
  const html = page("what-size-electrical-service.html");
  const fmt = (x) => Math.round(x).toLocaleString("en-US");
  const r = calc22082(EXAMPLE_NEW_HOUSE, EXAMPLE_NEW_LOADS);
  const lock = calc22082({ ...EXAMPLE_NEW_HOUSE, lockout: "yes" }, EXAMPLE_NEW_LOADS);
  const bare = calc22082(EXAMPLE_NEW_HOUSE, EXAMPLE_NEW_LOADS.filter((l) => l.kind !== "heating"));
  const sel = (n) => r.selections.find((x) => x.n === n).va;
  for (const s of [
    `= ${fmt(r.general)} VA`,
    `${fmt(r.generalDemand)} VA.`,
    `(1) cooling ${fmt(sel(1))} VA`,
    `= ${fmt(sel(3))} VA`,
    `65%, ${fmt(sel(4))} VA`,
    `${fmt(r.totalVa)} VA, or ${r.amps.toFixed(1)} A. The smallest standard rating that covers it is ${r.minService} A`,
    `${fmt(lock.totalVa)} VA, or ${lock.amps.toFixed(1)} A, and ${lock.minService} A covers it`,
    `${fmt(bare.totalVa)} VA, or ${bare.amps.toFixed(1)} A, and ${bare.minService} A covers it`,
  ]) assert.ok(html.includes(s), s);
  assert.equal(r.chosen, 3);
});
