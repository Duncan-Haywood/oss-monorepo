import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, record, prune, summarize, visitorHash, parseUa, isBot, sourceOf, dayKey, toCsv, LIMITS } from "./stats.mjs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const T0 = Date.parse("2026-10-15T10:00:00Z");
const ev = (o) => ({ site: "example.com", name: "pageview", url: "https://example.com/", referrer: "", hash: "aaaa", ua: UA, now: T0, ...o });

test("a pageview counts a visitor, a visit and a view; the second page un-bounces the visit", () => {
  const s = newState();
  record(s, ev());
  let r = summarize(s, "example.com", 1, T0);
  assert.deepEqual([r.totals.visitors, r.totals.visits, r.totals.views, r.totals.bounceRate], [1, 1, 1, 1]);
  record(s, ev({ url: "https://example.com/pricing", now: T0 + 40_000 }));
  r = summarize(s, "example.com", 1, T0 + 40_000);
  assert.deepEqual([r.totals.visitors, r.totals.visits, r.totals.views, r.totals.bounceRate, r.totals.avgVisitSeconds], [1, 1, 2, 0, 40]);
  record(s, ev({ url: "https://example.com/blog", now: T0 + 60_000 }));
  assert.equal(summarize(s, "example.com", 1, T0 + 60_000).totals.bounceRate, 0, "third page must not re-subtract");
});

test("a gap over 30 minutes starts a new visit for the same visitor, still one visitor", () => {
  const s = newState();
  record(s, ev());
  record(s, ev({ now: T0 + 31 * 60_000 }));
  const r = summarize(s, "example.com", 1, T0 + 31 * 60_000);
  assert.deepEqual([r.totals.visitors, r.totals.visits, r.totals.bounceRate], [1, 2, 1]);
});

test("bots, bad urls and empty user agents are dropped", () => {
  const s = newState();
  assert.equal(record(s, ev({ ua: "Googlebot/2.1 (+http://www.google.com/bot.html)" })), "bot");
  assert.equal(record(s, ev({ ua: "" })), "bot");
  assert.equal(record(s, ev({ url: "not a url" })), "bad-url");
  assert.equal(summarize(s, "example.com", 1, T0).hasData, false);
  assert.ok(isBot("curl/8.0.1") && isBot("HeadlessChrome/120 Mozilla") && !isBot(UA));
});

test("visitor hash changes with the day, the secret and the site, and is not reversible to inputs", () => {
  const a = visitorHash("s", "2026-10-15", "x.com", "1.2.3.4", UA);
  assert.notEqual(a, visitorHash("s", "2026-10-16", "x.com", "1.2.3.4", UA));
  assert.notEqual(a, visitorHash("t", "2026-10-15", "x.com", "1.2.3.4", UA));
  assert.notEqual(a, visitorHash("s", "2026-10-15", "y.com", "1.2.3.4", UA));
  assert.match(a, /^[0-9a-f]{16}$/);
  const s = newState(); record(s, ev({ hash: a }));
  assert.ok(!JSON.stringify(s).includes("1.2.3.4") && !JSON.stringify(s).includes("Windows NT"), "no IP or user agent in state");
});

test("sources: utm beats referrer, own-site referrer is direct, medium and campaign are kept", () => {
  const u = (p) => new URL(`https://example.com/${p}`);
  assert.equal(sourceOf(u("?utm_source=Newsletter&utm_medium=email&utm_campaign=Launch"), "https://news.ycombinator.com/", "example.com").source, "newsletter");
  assert.equal(sourceOf(u(""), "https://www.google.com/search?q=x", "example.com").source, "google.com");
  assert.equal(sourceOf(u(""), "https://example.com/other", "example.com").source, "(direct)");
  assert.equal(sourceOf(u(""), "garbage", "example.com").source, "(direct)");
  const s = newState();
  record(s, ev({ url: "https://example.com/?utm_source=hn&utm_medium=social&utm_campaign=show", referrer: "https://news.ycombinator.com/" }));
  const r = summarize(s, "example.com", 1, T0);
  assert.deepEqual([r.sources[0].name, r.mediums[0].name, r.campaigns[0].name], ["hn", "social", "show"]);
});

test("goals count once per visitor, sum value, and credit the source the visitor arrived with", () => {
  const s = newState();
  record(s, ev({ referrer: "https://news.ycombinator.com/" }));
  record(s, ev({ name: "signup", value: 29, now: T0 + 5000 }));
  record(s, ev({ name: "signup", value: 29, now: T0 + 9000 }));
  record(s, ev({ hash: "bbbb", now: T0 + 10_000 }));
  const r = summarize(s, "example.com", 1, T0 + 10_000);
  const g = r.goals[0];
  assert.deepEqual([g.name, g.events, g.visitors, g.value, g.conversionRate], ["signup", 2, 1, 58, 0.5]);
  assert.deepEqual(g.bySource[0], { source: "news.ycombinator.com", conversions: 1, visits: 1, rate: 1 });
  assert.equal(r.totals.views, 2, "a goal is not a pageview");
});

test("a goal from a visitor with no pageview today still counts and does not inflate views", () => {
  const s = newState();
  record(s, ev({ name: "purchase", value: 10 }));
  const r = summarize(s, "example.com", 1, T0);
  assert.equal(r.totals.views, 0);
  assert.equal(r.goals[0].visitors, 1);
});

test("device, browser, os and country are tallied; bad country codes are ignored", () => {
  assert.deepEqual(parseUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"), { browser: "Safari", os: "iOS", device: "Mobile" });
  assert.deepEqual(parseUa("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0"), { browser: "Edge", os: "Windows", device: "Desktop" });
  const s = newState();
  record(s, ev({ country: "de" })); record(s, ev({ hash: "b", country: "XX" })); record(s, ev({ hash: "c", country: "<script>" }));
  const r = summarize(s, "example.com", 1, T0);
  assert.deepEqual(r.countries, [{ name: "DE", count: 1 }]);
  assert.equal(r.browsers[0].name, "Chrome");
});

test("dimension maps are capped so a flood of random paths cannot grow state without bound", () => {
  const s = newState();
  for (let i = 0; i < LIMITS.keysPerDimension + 50; i++) record(s, ev({ hash: `h${i}`, url: `https://example.com/p${i}` }));
  const day = s.sites["example.com"].days[dayKey(T0)];
  assert.ok(Object.keys(day.pages).length <= LIMITS.keysPerDimension + 1);
  assert.ok(day.pages["(other)"].v >= 50);
});

test("periods compare against the previous window and the series has one row per day", () => {
  const s = newState();
  record(s, ev({ now: T0 - 86_400_000 * 8 }));
  record(s, ev({ hash: "b", now: T0 - 86_400_000 * 8 }));
  record(s, ev({ now: T0 }));
  const r = summarize(s, "example.com", 7, T0);
  assert.equal(r.series.length, 7);
  assert.equal(r.totals.visitors, 1);
  assert.equal(r.previous.visitors, 2);
  assert.match(toCsv(r), /^day,visitors,views\n/);
});

test("prune drops visitor scratch older than yesterday and counters past retention", () => {
  const s = newState();
  record(s, ev({ now: T0 - 5 * 86_400_000 })); record(s, ev());
  prune(s, T0, 3);
  assert.deepEqual(Object.keys(s.seen), [dayKey(T0)]);
  assert.deepEqual(Object.keys(s.sites["example.com"].days), [dayKey(T0)]);
});

test("live visitors are those seen in the last five minutes", () => {
  const s = newState();
  record(s, ev()); record(s, ev({ hash: "b", now: T0 + 4 * 60_000 }));
  assert.equal(summarize(s, "example.com", 1, T0 + 6 * 60_000).live, 1);
});
