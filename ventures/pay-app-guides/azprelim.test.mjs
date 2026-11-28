import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { azNoticeDates } from "./azprelim.mjs";

// Dates counted by hand on a calendar.
test("twenty calendar days after first furnishing, not moved for a weekend", () => {
  const r = azNoticeDates({ firstFurnished: "2026-03-02", today: "2026-03-10" });
  assert.equal(r.lastDay, "2026-03-22"); // a Sunday: stays put
  assert.equal(r.daysLeft, 12);
  assert.equal(r.state, "open");
  assert.equal(azNoticeDates({ firstFurnished: "2028-02-15" }).lastDay, "2028-03-06");
  assert.equal(azNoticeDates({ firstFurnished: "2026-12-20" }).lastDay, "2027-01-09");
  assert.equal(azNoticeDates({ firstFurnished: "2026-03-02", today: "2026-03-22" }).state, "today");
  assert.equal(azNoticeDates({ firstFurnished: "2026-03-02", today: "2026-03-18" }).state, "soon");
  assert.equal(azNoticeDates({ firstFurnished: "2026-03-02", today: "2026-03-23" }).state, "past");
});

test("mailed on time covers everything; mailed late covers only the 20 days before mailing (§ 33-992.01(E))", () => {
  assert.deepEqual(azNoticeDates({ firstFurnished: "2026-03-02", mailed: "2026-03-22" }).mailed, { onTime: true, coversFrom: "2026-03-02" });
  assert.deepEqual(azNoticeDates({ firstFurnished: "2026-03-02", mailed: "2026-04-15" }).mailed, { onTime: false, coversFrom: "2026-03-26" });
});

test("bad input is named, never guessed", () => {
  assert.match(azNoticeDates({ firstFurnished: "2026-02-30" }).error, /first day/);
  assert.match(azNoticeDates({}).error, /first day/);
  assert.match(azNoticeDates({ firstFurnished: "2026-03-02", mailed: "03/05/2026" }).error, /mailing day/);
  assert.match(azNoticeDates({ firstFurnished: "2026-03-02", mailed: "2026-02-20" }).error, /before the first day/);
});

test("every statute phrase the page quotes is in the Arizona snapshot PayApps checks against", () => {
  const src = readFileSync(new URL("../payapps/packages/lien-waivers/sources/az-33-992.txt", import.meta.url), "utf8")
    .split("\n").filter((l) => !l.startsWith("#")).join(" ").replace(/\s+/g, " ");
  const html = readFileSync(new URL("./arizona-preliminary-notice.html", import.meta.url), "utf8");
  const quotes = [...html.matchAll(/<q>([^<]+)<\/q>/g)].map((m) => m[1].replace(/&#39;/g, "'").replace(/&amp;/g, "&"));
  assert.ok(quotes.length >= 5, "the page quotes the statute");
  for (const q of quotes) assert.ok(src.includes(q), `not in the statute: ${q}`);
  // The boldface statement, word for word.
  const stmt = /<div class="statement" id="owner-notice">([\s\S]*?)<\/div>/.exec(html)[1]
    .replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
  const from = src.indexOf("D. ");
  assert.ok(src.slice(from).includes(stmt.replace(/^Notice to Property Owner /, "Notice to Property Owner ")), "owner notice drifted from § 33-992.01(D)");
});
