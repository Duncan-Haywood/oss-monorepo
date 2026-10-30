// The three search guides: clauses, FAQ JSON-LD answered on the page, a link into the
// app, listed in the sitemap, llms.txt and the app header, and every worked example
// computed by the engine rather than typed by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { quote, cancellationFee, referenceRequest, DEFAULT_PROFILE } from "./engine.mjs";

const read = (f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const GUIDES = ["how-to-start-a-babysitting-business.html", "how-much-to-charge-for-babysitting.html", "babysitting-references.html"];
const unescape = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'");

test("each guide carries the no-warranty clause, the sponsor link, a canonical URL and a link into the app", () => {
  for (const g of GUIDES) {
    const html = read(g);
    assert.match(html, /<html lang="en">/, g);
    assert.match(html, /No warranty\./, g);
    assert.match(html, /not legal, tax, or financial advice/, g);
    assert.match(html, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/, g);
    assert.match(html, new RegExp(`<link rel="canonical" href="\\./${g.replace(/\./g, "\\.")}">`), g);
    assert.match(html, /<meta name="description" content="[^"]{120,}"/, g);
    assert.match(html, /<a class="cta" href="\.\/index\.html">Open the app<\/a>/, g);
    assert.doesNotMatch(html, /<script[^>]+src=/, g);
  }
});

test("each guide's FAQ JSON-LD parses and every question and answer appears on the page", () => {
  for (const g of GUIDES) {
    const html = read(g);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    assert.ok(faq && faq.mainEntity.length >= 3, g);
    const text = unescape(html);
    for (const q of faq.mainEntity) {
      assert.ok(text.includes(`<h3>${q.name}</h3>`), `${g}: ${q.name}`);
      assert.ok(text.includes(`<p>${q.acceptedAnswer.text}</p>`), `${g}: answer to ${q.name}`);
    }
  }
});

test("the guides are in the sitemap, llms.txt and the app's header", () => {
  const sitemap = read("sitemap.xml"), llms = read("llms.txt"), index = read("index.html");
  const header = index.slice(index.indexOf("<header>"), index.indexOf("</header>"));
  for (const g of GUIDES) {
    assert.ok(sitemap.includes(`<loc>./${g}</loc>`), g);
    assert.ok(llms.includes(`/babysitting-business-kit/${g}`), g);
    assert.ok(header.includes(`href="${g}"`), g);
  }
});

test("every worked example on the pricing page is what quote() returns for that sit", () => {
  const html = read("how-much-to-charge-for-babysitting.html");
  const rows = [
    [{ date: "2026-11-06", start: "18:00", end: "22:00", kids: 1 }, "Friday 6:00 to 10:00 pm, 1 child"],
    [{ date: "2026-11-06", start: "18:00", end: "22:00", kids: 3 }, "Friday 6:00 to 10:00 pm, 3 children"],
    [{ date: "2026-11-06", start: "19:00", end: "00:30", kids: 2 }, "Friday 7:00 pm to 12:30 am, 2 children"],
    [{ date: "2026-12-31", start: "19:00", end: "01:00", kids: 2 }, "New Year's Eve 7:00 pm to 1:00 am, 2 children"],
    [{ date: "2026-11-06", start: "18:00", end: "19:30", kids: 1 }, "Friday 6:00 to 7:30 pm, 1 child"],
    [{ date: "2026-11-06", start: "18:00", end: "22:00", kids: 1, bookedOn: "2026-11-06" }, "Friday 6:00 to 10:00 pm, 1 child, booked that morning"],
  ];
  const text = unescape(html);
  for (const [sit, label] of rows) {
    const total = quote(sit).total.toFixed(2);
    assert.match(text, new RegExp(`<td>${label}</td><td>[^<]*</td><td class="n">\\$${total.replace(".", "\\.")}</td>`), `${label} should be $${total}`);
  }
  const sit = { date: "2026-11-06", start: "18:00", end: "22:00", kids: 2 };
  assert.equal(quote(sit).total, 92);
  assert.equal(cancellationFee(sit, "2026-11-06"), 46);
  assert.match(text, /<td class="n">\$46\.00<\/td>/);
  // The example rate card on the page is the app's own defaults.
  const r = DEFAULT_PROFILE.rates;
  assert.deepEqual([r.hourly, r.extraChild, r.lateAfter, r.lateExtra, r.holidayMultiplier, r.minimumHours, r.lastMinuteFee, r.lastMinuteHours, r.cancelHours, r.cancelFeePct], [20, 3, "23:00", 5, 1.5, 3, 15, 24, 24, 50]);
  assert.doesNotMatch(text, /national average (is|of) \$/i);
});

test("the reference drafts on the references page are the ones the app writes", () => {
  const text = unescape(read("babysitting-references.html"));
  const profile = { ...DEFAULT_PROFILE, name: "[your name]" };
  assert.ok(text.includes(`<p class="msg" id="draftReference">${referenceRequest({ name: "Dana Rivera" }, profile, "reference")}</p>`));
  assert.ok(text.includes(`<p class="msg" id="draftTestimonial">${referenceRequest({ name: "Dana Rivera" }, profile, "testimonial")}</p>`));
});
