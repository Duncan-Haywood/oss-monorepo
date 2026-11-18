import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSchedule, parseDate } from "./calc.mjs";
import { printPackHtml, safeColor, safeLogo } from "./printpack.mjs";
import { CHECKOUT_URL, VALIDATE_URL } from "./checkout.mjs";
import { buyLink, cleanKey, interpret, checkLicence } from "./licence.mjs";

const mk = (n, extra = {}) => buildSchedule({ teams: Array.from({ length: n }, (_, i) => `Team ${i + 1}`), double: false, start: parseDate("2026-10-06"), weekdays: [2], skipDays: [], blackouts: {}, courts: [], times: [], seed: 1, minutes: 60, ...extra });

test("one page per team, every game appears once per team, odd leagues show the bye", () => {
  const s = mk(5);
  const h = printPackHtml(s, { league: "Rec League", season: "Fall 2026" });
  assert.equal((h.match(/<section class="sheet">/g) || []).length, 5);
  for (const t of s.teams) {
    const sheet = h.split('<section class="sheet">').find((x) => x.startsWith(`<h2>${t}</h2>`));
    assert.ok(sheet, t);
    const games = (sheet.match(/<td>(Home|Away)<\/td>/g) || []).length;
    assert.equal(games, 4);
    assert.equal((sheet.match(/class="bye"/g) || []).length, 1);
  }
});

test("typed text is escaped; colour and logo are restricted", () => {
  const s = mk(4);
  const h = printPackHtml(s, { league: "<img src=x onerror=1>", season: '"><script>', contact: "<b>x</b>", notes: "<i>n</i>", accent: "red;}</style><script>", logo: "data:image/svg+xml;base64,AAAA" });
  assert.ok(!h.includes("<img src=x"));
  assert.ok(!h.includes("<script>"));
  assert.ok(!h.includes("<b>x</b>") && !h.includes("<i>n</i>"));
  assert.ok(!h.replace(/<link rel="icon"[^>]*>/, "").includes("svg+xml")); // the fixed tab icon is allowed; the typed logo is not
  assert.equal(safeColor("#12abEF"), "#12abEF");
  assert.equal(safeColor("red"), "#1f4e5f");
  assert.ok(safeLogo("data:image/png;base64,iVBOR"));
  assert.equal(safeLogo("data:image/png;base64,iVBOR\"onerror=1"), "");
  assert.equal(safeLogo("https://x.test/a.png"), "");
});

test("a valid logo and colour reach the page", () => {
  const h = printPackHtml(mk(4), { logo: "data:image/png;base64,iVBORw0KGgo=", accent: "#aa0000" });
  assert.match(h, /<img class="logo" src="data:image\/png;base64,iVBORw0KGgo="/);
  assert.match(h, /--a:#aa0000/);
});

test("the pack stays dark until a checkout link is set, and unlock never throws", async () => {
  assert.equal(buyLink(CHECKOUT_URL), CHECKOUT_URL || null); // dark when empty, live when golive.py set a link
  assert.equal(buyLink("http://x.test"), null);
  assert.equal(cleanKey("short"), null);
  assert.equal(interpret({ valid: true, license_key: { status: "active" } }).valid, true);
  assert.equal(interpret({ valid: true, license_key: { status: "disabled" } }).valid, false);
  assert.equal((await checkLicence("ABCD-1234-EFGH", { url: VALIDATE_URL, fetch: async () => { throw new Error("offline"); } })).valid, false);
  assert.equal((await checkLicence("ABCD-1234-EFGH", { url: VALIDATE_URL, fetch: async () => ({ json: async () => ({ valid: true, license_key: { status: "active" } }) }) })).valid, true);
});

test("the page wires the pack and keeps the free exports", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /id="pack-open"/);
  assert.match(html, /import \{ printPackHtml \} from "\.\/printpack\.mjs"/);
  assert.match(html, /id="dl-sheets"/);
  assert.match(html, /id="print-page"/);
});
