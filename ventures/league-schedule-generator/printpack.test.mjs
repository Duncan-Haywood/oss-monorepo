import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSchedule, readSpec, sampleFields } from "./calc.mjs";
import { seasonPackHtml, cleanLogo, cleanAccent } from "./printpack.mjs";
import { checkLicence, buyLink } from "./licence.mjs";
import { CHECKOUT_URL } from "./checkout.mjs";

const sched = () => { const r = readSpec(sampleFields()); assert.deepEqual(r.errors, []); return buildSchedule(r.spec); };

test("pack has a master page and one page per team, branded", () => {
  const s = sched();
  const h = seasonPackHtml(s, { title: "Fall League", organiser: "Parks & Rec", accent: "#aa0000", contact: "a@b.org" });
  assert.equal((h.match(/class="page"/g) || []).length, s.teams.length);
  assert.match(h, /Parks &amp; Rec/);
  assert.match(h, /#aa0000/);
  for (const t of s.teams) assert.ok(h.includes(t.replace(/&/g, "&amp;")));
});
test("typed text is escaped and bad logo/colour dropped", () => {
  const s = sched();
  const h = seasonPackHtml(s, { organiser: "<script>alert(1)</script>", logo: "javascript:alert(1)", accent: "red;}</style><script>" });
  assert.ok(!h.includes("<script>alert"));
  assert.ok(!h.includes("<img"));
  assert.equal(cleanAccent("red"), "#1f3a5f");
  assert.equal(cleanLogo("data:image/svg+xml;base64,AAAA"), "");
  assert.equal(cleanLogo("https://x.org/l.png"), "https://x.org/l.png");
});
test("dark by default: no checkout link, licence never unlocks offline", async () => {
  assert.equal(buyLink(CHECKOUT_URL), null);
  assert.equal((await checkLicence("ABCD-1234-EFGH", { fetch: async () => { throw new Error("x"); }, url: "https://api.lemonsqueezy.com/v1/licenses/validate" })).valid, false);
  assert.equal((await checkLicence("ABCD-1234-EFGH", { fetch: async () => ({ json: async () => ({ valid: true }) }), url: "https://api.lemonsqueezy.com/v1/licenses/validate" })).valid, true);
});
