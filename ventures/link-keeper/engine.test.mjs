import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import * as E from "./engine.mjs";

const NOW = Date.UTC(2026, 9, 15, 12);
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const hash = (salt, v) => createHmac("sha256", salt).update(v).digest("hex").slice(0, 16);
const click = (s, l, over = {}, t = NOW) => E.recordClick(s, l, { client: E.parseUA(DESKTOP), visitor: "1.1.1.1|a", hash, newSalt: () => "s", ...over }, t);

test("targets: only http(s) without credentials, optional host allow-list", () => {
  assert.equal(E.checkTarget("https://example.com/a?b=1").ok, true);
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://x.com", "https://user:pw@x.com", "not a url", "", null, "https://x.com/" + "a".repeat(2100)])
    assert.equal(E.checkTarget(bad).ok, false, String(bad).slice(0, 30));
  assert.equal(E.checkTarget("https://shop.example.com/x", { allowHosts: ["example.com"] }).ok, true);
  assert.equal(E.checkTarget("https://evil-example.com/x", { allowHosts: ["example.com"] }).ok, false);
});

test("slugs: reserved and malformed are refused, random ones avoid collisions", () => {
  assert.match(E.checkSlug("admin"), /reserved/);
  assert.match(E.checkSlug("a b"), /1-63/);
  assert.equal(E.checkSlug("spring_sale-24"), null);
  const s = E.newState();
  const first = E.randomSlug(s, seq(0), 3); // "222"
  s.links[first] = {};
  assert.notEqual(E.randomSlug(s, seq(0, 0, 0, 0.5, 0.5, 0.5), 3), first);
});

test("utm tags are added, replaced and never duplicate the query", () => {
  assert.equal(E.addUtm("https://x.com/p?ref=1&utm_source=old", { source: "news", medium: "email", campaign: "oct" }), "https://x.com/p?ref=1&utm_source=news&utm_medium=email&utm_campaign=oct");
  assert.equal(E.addUtm("https://x.com/", { source: "  ", term: "" }), "https://x.com/");
});

test("create: slug uniqueness is case-insensitive; options are validated", () => {
  const s = E.newState();
  const l = E.createLink(s, { url: "https://x.com", slug: "Sale", utm: { source: "ig" }, tags: ["a", " b "], ios: "https://apps.apple.com/app/1" }, NOW);
  assert.equal(l.url, "https://x.com/?utm_source=ig");
  assert.deepEqual(l.tags, ["a", "b"]);
  assert.throws(() => E.createLink(s, { url: "https://y.com", slug: "sale" }, NOW), /taken/);
  assert.throws(() => E.createLink(s, { url: "https://y.com", maxClicks: 0 }, NOW), /maxClicks/);
  assert.throws(() => E.createLink(s, { url: "https://y.com", expiresAt: "soon" }, NOW), /ISO/);
  assert.throws(() => E.createLink(s, { url: "https://y.com", android: "javascript:1" }, NOW), /android/);
});

test("lookup: device targeting, expiry, click limit, archive", () => {
  const s = E.newState();
  const l = E.createLink(s, { url: "https://x.com/web", slug: "app", ios: "https://apps.apple.com/a", android: "https://play.google.com/a", maxClicks: 2, expiresAt: new Date(NOW + 1000).toISOString() }, NOW);
  assert.equal(E.lookup(s, "APP", IPHONE, NOW).location, "https://apps.apple.com/a");
  assert.equal(E.lookup(s, "app", ANDROID, NOW).location, "https://play.google.com/a");
  assert.equal(E.lookup(s, "app", DESKTOP, NOW).location, "https://x.com/web");
  assert.equal(E.lookup(s, "nope", DESKTOP, NOW).status, "missing");
  assert.equal(E.lookup(s, "app", DESKTOP, NOW + 1000).reason, "expired");
  click(s, l); click(s, l, { visitor: "2.2.2.2|a" });
  assert.equal(E.lookup(s, "app", DESKTOP, NOW).reason, "click limit reached");
  l.maxClicks = null; l.archived = true;
  assert.equal(E.lookup(s, "app", DESKTOP, NOW).reason, "archived");
});

test("bots are counted apart and never inflate clicks or limits", () => {
  const s = E.newState();
  const l = E.createLink(s, { url: "https://x.com", slug: "b" }, NOW);
  for (const ua of ["Slackbot-LinkExpanding 1.0", "curl/8.0", "", "facebookexternalhit/1.1"]) assert.equal(E.parseUA(ua).bot, true, ua);
  assert.equal(E.parseUA(DESKTOP).bot, false);
  click(s, l, { client: E.parseUA("Slackbot-LinkExpanding 1.0") });
  assert.equal(l.clicks, 0);
  assert.equal(E.stats(l, NOW).bots, 1);
});

test("unique visitors are counted once a day per link and the salt resets next day", () => {
  const s = E.newState();
  const a = E.createLink(s, { url: "https://x.com", slug: "a" }, NOW), b = E.createLink(s, { url: "https://y.com", slug: "b" }, NOW);
  click(s, a); click(s, a); click(s, b); click(s, a, { visitor: "9.9.9.9|b" });
  assert.equal(E.stats(a, NOW).uniqueVisitorDays, 2);
  assert.equal(E.stats(a, NOW).clicks, 3);
  assert.equal(E.stats(b, NOW).uniqueVisitorDays, 1);
  assert.equal(s.seen.day, "2026-10-15");
  click(s, a, {}, NOW + 86_400_000);
  assert.equal(s.seen.day, "2026-10-16");
  assert.equal(Object.keys(s.seen.ids).length, 1);
  assert.doesNotMatch(JSON.stringify(s), /1\.1\.1\.1/);
});

test("stats group referrers by host only, and ignore bad country codes", () => {
  const s = E.newState();
  const l = E.createLink(s, { url: "https://x.com", slug: "r" }, NOW);
  click(s, l, { referer: "https://www.reddit.com/r/saas/comments/abc?token=secret" });
  click(s, l, { referer: "https://www.reddit.com/other", visitor: "2" });
  click(s, l, { referer: "https://reddit.com/", visitor: "5" });
  click(s, l, { referer: "", visitor: "3", country: "de" });
  click(s, l, { referer: "garbage", visitor: "4", country: "Germany" });
  const st = E.stats(l, NOW);
  assert.deepEqual(st.referrers[0], { name: "reddit.com", clicks: 3 });
  assert.equal(st.referrers.find((r) => r.name === "direct").clicks, 2);
  assert.deepEqual(st.countries, [{ name: "DE", clicks: 1 }]);
  assert.doesNotMatch(JSON.stringify(st), /secret/);
  assert.equal(st.byDay.length, 30);
});

test("prune drops days past the retention window", () => {
  const s = E.newState();
  const l = E.createLink(s, { url: "https://x.com", slug: "p" }, NOW);
  click(s, l, {}, NOW - 401 * 86_400_000); click(s, l, { visitor: "x" });
  E.prune(s, NOW);
  assert.deepEqual(Object.keys(l.daily), ["2026-10-15"]);
});

test("csv neutralises spreadsheet formulas and quotes commas", () => {
  const s = E.newState();
  E.createLink(s, { url: "https://x.com/a,b", slug: "c", title: "=HYPERLINK(\"http://evil\")" }, NOW);
  const csv = E.toCsv(s, NOW);
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /"https:\/\/x\.com\/a,b"/);
});

test("planBatch tags every URL, keeps chosen slugs and reports bad lines", () => {
  const out = E.planBatch("https://x.com/a, promo\nhttps://x.com/b\nnope\nhttps://x.com/c, promo\n\nhttps://x.com/d, admin", { source: "news", campaign: "oct" }, seq(0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7));
  assert.equal(out.length, 5);
  assert.equal(out[0].slug, "promo");
  assert.equal(out[0].url, "https://x.com/a?utm_source=news&utm_campaign=oct");
  assert.match(out[1].slug, /^[2-9a-z]{6}$/);
  assert.match(out[2].error, /absolute URL/);
  assert.match(out[3].error, /used twice/);
  assert.match(out[4].error, /reserved/);
});
