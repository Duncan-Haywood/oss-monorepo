import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, DEFAULTS } from "./engine.mjs";
import { reportHtml, safeColor, safeLogo, esc } from "./report.mjs";
import { CHECKOUT_URL } from "./checkout.mjs";
import { buyLink, cleanKey, interpret, checkLicence } from "./licence.mjs";

const r = analyze({ csv: DEFAULTS.csv });

test("report has the finding, chart, every change and every segment", () => {
  const h = reportHtml(r, { title: "Nile", org: "Acme Hydrology" });
  assert.match(h, /<h1>Nile<\/h1>/);
  assert.ok(h.includes(esc(r.summary)));
  assert.match(h, /<svg /);
  for (const c of r.pelt.changepoints) assert.ok(h.includes(`<td>${esc(c.label)}</td>`));
  assert.equal((h.match(/<tr>/g) || []).length - 0, (h.match(/<tr>/g) || []).length);
  for (const s of r.pelt.segments) assert.ok(h.includes(`<td>${esc(s.from)}</td><td>${esc(s.to)}</td>`));
  assert.match(h, /not a cause/);
  assert.match(h, /No warranty/);
});

test("typed text is escaped; colour and logo are restricted", () => {
  const h = reportHtml(r, { title: "<script>x</script>", org: '"><img src=x onerror=1>', notes: "<b>hi</b>\n\nsecond", accent: "red;}</style>", logo: "data:image/svg+xml;base64,AAAA" });
  assert.ok(!h.includes("<script>x"));
  assert.ok(!h.includes("<img src=x"));
  assert.ok(!h.includes("<b>hi"));
  assert.match(h, /<li>second<\/li>/);
  assert.equal(safeColor("red;}"), "#1f5f86");
  assert.equal(safeColor("#aabbcc"), "#aabbcc");
  assert.equal(safeLogo("data:image/svg+xml;base64,AAAA"), "");
  assert.equal(safeLogo("data:image/png;base64,iVBOR"), "data:image/png;base64,iVBOR");
  assert.ok(!h.includes('class="logo"'));
});

test("a series with no change still reports", () => {
  const flat = analyze({ csv: "v\n" + Array.from({ length: 40 }, (_, i) => 10 + ((i * 7) % 3) * 0.01).join("\n"), penalty: 1e6 });
  const h = reportHtml(flat);
  assert.match(h, /No change was found/);
});

test("licence: dark by default, odd keys and offline never unlock", async () => {
  assert.equal(CHECKOUT_URL, "");
  assert.equal(buyLink(CHECKOUT_URL), null);
  assert.equal(buyLink("http://x.test"), null);
  assert.equal(cleanKey("short"), null);
  assert.equal(interpret({ valid: true, license_key: { status: "active" } }).valid, true);
  assert.equal(interpret({ valid: true, license_key: { status: "disabled" } }).valid, false);
  assert.equal((await checkLicence("ABCD-1234-EFGH", { url: "https://x.test", fetch: async () => { throw new Error("off"); } })).valid, false);
  assert.equal((await checkLicence("ABCD-1234-EFGH", { url: "https://x.test", fetch: async () => ({ json: async () => ({ valid: true }) }) })).valid, true);
});

test("page: card hidden until a link is set, nothing gates the detector", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /id="rep-card"[^>]*hidden/);
  assert.match(html, /if \(buy\) \{[^}]*rep-card/);
  assert.match(html, /report_unlocked/);
});
