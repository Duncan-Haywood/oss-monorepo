import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStaff, parseShifts, buildRoster } from "./calc.mjs";
import { staffPackHtml, safeColor, safeLogo } from "./staffpack.mjs";
import { PADDLE } from "./checkout.mjs";
import * as licence from "./licence.mjs";
import { assertPackLicence } from "../../platform/billing/testkit.mjs";

const roster = () => {
  const st = parseStaff("Ana, 18, 40, 30, Mon-Sat 6-22\nBen, 16, 32, 20, Mon-Fri 6-22\nCleo <b>, 15, 24, 12, any");
  const sh = parseShifts("Mon-Fri, 6, 14, 1, open\nSat, 12, 22, 1, close\nSun, 8, 12, 5, brunch");
  return buildRoster(st.staff, sh.slots, {});
};

test("one page per person, no pay anywhere, open shifts listed", () => {
  const r = roster();
  const h = staffPackHtml(r, { business: "Corner Cafe", weekStart: "2026-10-05" });
  assert.equal((h.match(/<section class="sheet">/g) || []).length, r.people.length);
  assert.match(h, /Week of Mon 5 Oct/);
  assert.ok(!/\$\d|wage|payroll|overtime/i.test(h.replace(/<footer>[\s\S]*<\/footer>/, "")));
  assert.match(h, /Still open/);
  assert.match(h, /No warranty/);
});

test("typed text is escaped; colour and logo are restricted", () => {
  const h = staffPackHtml(roster(), { business: "<img src=x onerror=1>", contact: "<b>x</b>", notes: "<i>n</i>", accent: "red;}</style><script>", logo: "data:image/svg+xml;base64,AAAA" });
  assert.ok(!h.includes("<img src=x") && !h.includes("<script>") && !h.includes("<b>x</b>") && !h.includes("<i>n</i>") && !h.includes("<b>,"));
  assert.ok(!h.includes("svg+xml"));
  assert.equal(safeColor("#12abEF"), "#12abEF");
  assert.equal(safeColor("red"), "#1f4e5f");
  assert.equal(safeLogo("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
  assert.equal(safeLogo("https://x/y.png"), "");
});

test("licence: dark until the catalogue is set; only a key signed for this pack unlocks; never throws", async () => {
  await assertPackLicence(licence, PADDLE, "shift-roster-builder");
});

import { samplePack } from "./build-sample-pack.mjs";
test("the committed sample pack is what the real staff pack produces", () => {
  assert.equal(readFileSync(new URL("./sample-staff-pack.html", import.meta.url), "utf8"), samplePack());
});
test("marketing page links the sample, says it is not on sale, and is in the sitemap", () => {
  const p = readFileSync(new URL("./staff-schedule-pack-for-small-businesses.html", import.meta.url), "utf8");
  assert.match(p, /sample-staff-pack\.html/);
  assert.match(p, /not on sale yet/);
  assert.match(p, /No warranty/);
  assert.match(readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /staff-schedule-pack-for-small-businesses/);
});
