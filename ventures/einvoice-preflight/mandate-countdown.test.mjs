import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { daysUntil, upcoming, label } = require("./mandate-countdown.js");
const here = (f) => new URL(`./${f}`, import.meta.url);
const events = JSON.parse(fs.readFileSync(here("mandate-dates.json"), "utf8")).events;

test("daysUntil counts calendar days, not 24-hour blocks (DST safe)", () => {
  assert.equal(daysUntil("2026-11-02", new Date(2026, 10, 2, 23, 59)), 0);
  assert.equal(daysUntil("2027-01-01", new Date(2026, 11, 31, 0, 1)), 1);
  assert.equal(daysUntil("2026-03-30", new Date(2026, 2, 28, 12)), 2); // across EU clock change
  assert.equal(daysUntil("2026-10-31", new Date(2026, 10, 2)), -2);
});

test("upcoming drops past dates, sorts, filters and limits", () => {
  const today = new Date(2026, 10, 2);
  const all = upcoming(events, today, "", 0);
  assert.ok(all.length > 20 && all.every((r) => r.days >= 0));
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].days <= all[i].days);
  assert.equal(upcoming(events, today, "", 8).length, 8);
  const pl = upcoming(events, today, "Poland", 0);
  assert.ok(pl.length > 0 && pl.every((r) => r.e.country === "Poland"));
  assert.equal(upcoming(events, new Date(2100, 0, 1), "", 8).length, 0);
});

test("label wording", () => {
  assert.equal(label(0), "today");
  assert.equal(label(1), "tomorrow");
  assert.equal(label(40), "in 40 days");
});

test("the hub page loads the script and every event page link exists", () => {
  const html = fs.readFileSync(here("e-invoicing-mandates-by-country.html"), "utf8");
  assert.match(html, /<script src="mandate-countdown\.js" defer><\/script>/);
  assert.match(html, /id="countdown-list"/);
  for (const e of events) assert.ok(fs.existsSync(here(e.page)), e.page);
});
