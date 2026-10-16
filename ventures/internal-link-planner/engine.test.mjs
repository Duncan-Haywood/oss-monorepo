import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl, parsePage, pageRank, analyze, keyphrases, renderMarkdown } from "./engine.mjs";
import { SITE, HOME } from "./fixture.mjs";

test("normalizeUrl folds index.html, trailing slashes, hashes and tracking params", () => {
  const b = "https://Example.test/a/b";
  assert.equal(normalizeUrl("/x/index.html#top", b), "https://example.test/x");
  assert.equal(normalizeUrl("../c/?utm_source=a&q=1", b), "https://example.test/c?q=1");
  assert.equal(normalizeUrl("/", b), "https://example.test/");
  assert.equal(normalizeUrl("mailto:a@b.c", b), null);
  assert.equal(normalizeUrl("javascript:void(0)", b), null);
});

test("parsePage separates body links from menu/footer links and ignores script text", () => {
  const p = parsePage(`<title>T &amp; U</title><meta name="robots" content="noindex,follow"><link rel="canonical" href="/c"><nav><a href="/m">Menu</a></nav><main><h1>Head</h1><script>var x="<a href='/no'>";</script><p>Hi <a href="/b" rel="nofollow">bee</a> and <a href='/c'>cee <b>bold</b></a>.</p></main><footer><a href="/f">F</a></footer>`, "https://e.test/");
  assert.equal(p.title, "T & U"); assert.equal(p.noindex, true); assert.equal(p.canonical, "/c"); assert.equal(p.h1, "Head");
  assert.deepEqual(p.links.map((l) => [l.href, l.body, l.nofollow, l.text]), [["/m", false, false, "Menu"], ["/b", true, true, "bee"], ["/c", true, false, "cee bold"], ["/f", false, false, "F"]]);
  assert.match(p.text, /Hi bee and cee bold\./); assert.doesNotMatch(p.text, /Menu|var x/);
});

test("pageRank sums to 1 and favours the page everything links to", () => {
  const ids = ["a", "b", "c", "d"];
  const w = new Map([["a", new Map([["d", 1]])], ["b", new Map([["d", 1]])], ["c", new Map([["d", 1]])], ["d", new Map()]]);
  const r = pageRank(ids, w);
  assert.ok(Math.abs([...r.values()].reduce((s, x) => s + x, 0) - 1) < 1e-9);
  assert.ok(r.get("d") > 2 * r.get("a"));
});

test("audit of the example site finds its orphan, weak page, dead ends and broken link", () => {
  const r = analyze(SITE, { home: HOME });
  assert.equal(r.summary.pages, 9); assert.equal(r.summary.noindex, 1);
  assert.ok(r.orphans.includes("https://example.test/blog/patient-payment-plans"));
  assert.ok(r.orphans.includes("https://example.test/blog/fee-schedule-review"));
  assert.ok(!r.orphans.includes("https://example.test/old-draft"), "noindex pages are not audited as orphans");
  assert.ok(r.bodyOrphans.includes("https://example.test/pricing"), "linked from the menu only");
  assert.deepEqual(r.broken.map((b) => b.to), ["https://example.test/missing-page"]);
  assert.ok(r.deadEnds.includes("https://example.test/pricing"));
  assert.equal(r.pages.find((p) => p.url === HOME.replace(/\/$/, "/")).depth, 0);
});

test("suggestions put the target's own words as anchor text in a page that does not yet link", () => {
  const r = analyze(SITE, { home: HOME, priority: ["/blog/patient-payment-plans"] });
  const s = r.suggestions.filter((x) => x.to.endsWith("/patient-payment-plans"));
  assert.ok(s.length >= 1);
  for (const x of s) { assert.match(x.anchor, /payment plan/i); assert.ok(x.context.toLowerCase().includes(x.anchor.toLowerCase())); }
  assert.ok(s.some((x) => x.from.endsWith("/blog/fee-schedule-review") || x.from.endsWith("/dental-billing-guide")));
  // Never suggests a link that exists or a self link.
  for (const x of r.suggestions) assert.notEqual(x.from, x.to);
  assert.ok(!r.suggestions.some((x) => x.from.endsWith("/dental-billing-guide") && x.to.endsWith("/insurance-claim-denials")));
});

test("applying the plan raises the targets' link equity and the effect table says so", () => {
  const r = analyze(SITE, { home: HOME, priority: ["/blog/patient-payment-plans"] });
  const e = r.effect.find((t) => t.to.endsWith("/patient-payment-plans"));
  assert.ok(e.rankAfter > e.rankBefore);
  const md = renderMarkdown(r);
  assert.match(md, /Suggested links/); assert.match(md, /not a ranking or traffic forecast/); assert.match(md, /Orphan pages/);
});

test("limits: at most maxPerSource suggestions per source page", () => {
  const r = analyze(SITE, { home: HOME, maxPerSource: 1 });
  const c = new Map(); for (const x of r.suggestions) c.set(x.from, (c.get(x.from) || 0) + 1);
  assert.ok([...c.values()].every((n) => n <= 1));
});

test("keyphrases drop the shared site-name tail and include the slug", () => {
  const p = { url: "https://e.test/blog/fee-schedule-review", title: "Fee schedule review | Acme", h1: "" };
  const k = keyphrases(p, "Acme");
  assert.equal(k[0], "fee schedule review");
});

test("a site of one or two pages does not crash", () => {
  assert.deepEqual(analyze([], {}).pages, []);
  const r = analyze(SITE.slice(0, 2), { home: HOME });
  assert.deepEqual(r.suggestions, []);
});

test("a 2,000-page synthetic site analyzes in a few seconds", () => {
  const pages = [];
  for (let i = 0; i < 2000; i++) {
    const links = [1, 7, 13].map((k) => `<a href="/p/${(i * k + 1) % 2000}">topic ${(i * k + 1) % 2000} widget</a>`).join(" ");
    pages.push({ url: `https://big.test/p/${i}`, html: `<title>Topic ${i} widget</title><h1>Topic ${i} widget</h1><main>${links} ${"lorem ipsum dolor sit amet ".repeat(60)} topic ${(i + 5) % 2000} widget</main>` });
  }
  const t = Date.now(); const r = analyze(pages, { home: "https://big.test/p/0" });
  assert.equal(r.summary.pages, 2000); assert.ok(Date.now() - t < 20000, `took ${Date.now() - t}ms`);
});
