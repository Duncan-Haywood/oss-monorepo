import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze } from "./rrule.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "why-recurring-event-skips-months.html"];
const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

test("every page carries the no-warranty clause, independence line and sponsor link", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /not legal or professional advice/, p);
    assert.match(html, /Not affiliated with or endorsed by the IETF/, p);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, p);
  }
  assert.match(page("index.html"), /Everything runs in your browser/);
});

test("JSON-LD parses and each FAQ answer is visible on the page, word for word", () => {
  for (const p of PAGES) {
    const html = page(p);
    const faq = ld(html).find((b) => b["@type"] === "FAQPage");
    assert.ok(faq && faq.mainEntity.length >= 3, p);
    for (const q of faq.mainEntity) {
      assert.ok(html.includes(`<h3>${esc(q.name)}</h3>`), q.name);
      assert.ok(html.includes(`<p>${esc(q.acceptedAnswer.text)}</p>`), q.name);
    }
    assert.ok(!/AggregateRating|"Review"/.test(html));
  }
  assert.equal(ld(page("index.html"))[0].offers.price, "0");
});

test("SEO basics on every page", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /<title>[^<]{20,}<\/title>/, p);
    assert.match(html, /<meta name="description" content="[^"]{80,320}"/, p);
    assert.match(html, new RegExp(`<link rel="canonical" href="\\./${p.replace(".", "\\.")}">`), p);
    assert.match(html, /<meta property="og:title"/, p);
    assert.equal((html.match(/<h1>/g) || []).length, 1, p);
    assert.match(html, /<html lang="en">/, p);
    assert.match(page("sitemap.xml"), new RegExp(p === "index.html" ? "rrule-explainer/<" : p.replace(".", "\\.")));
  }
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 6);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(id && html.includes(`<label for="${id}">`), `unlabelled: ${tag}`);
  }
  for (const f of [...PAGES, "rrule.mjs", "usage.mjs", "cli.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/, f);
  assert.doesNotMatch(page("rrule.mjs"), /^\s*import\s|import\(|Date\.now|Math\.random/m);
});

test("the inline script imports only exported names and every element it uses exists", async () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./rrule.mjs", "./usage.mjs"]);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "").replace(/await /g, "")));
  const names = html.match(/import \{([^}]+)\} from "\.\/rrule\.mjs"/)[1].split(",").map((s) => s.trim());
  const engine = await import("./rrule.mjs");
  for (const n of names) assert.ok(n in engine, n);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("#([\w-]+)"/g)) assert.ok(ids.has(m[1]), m[1]);
  for (const m of html.matchAll(/for \(const id of \[([^\]]+)\]\)/g)) for (const id of m[1].match(/"([\w-]+)"/g)) assert.ok(ids.has(id.replace(/"/g, "")), id);
});

test("usage events are documented where they are recorded", () => {
  const html = page("index.html");
  for (const e of ["rule_expanded", "example_loaded", "report_downloaded", "dates_copied"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /id="optout"/);
});

test("the common rules on the page and the guide's dates are what the engine says", () => {
  const html = page("index.html");
  for (const m of html.matchAll(/<li>[^<]*: <code>(FREQ=[^<]+)<\/code>/g)) {
    const r = analyze({ text: m[1], dtstart: "2026-01-01 09:00" });
    assert.ok(r.ok, m[1]);
    assert.ok(r.occurrences.length > 3, m[1]);
  }
  const g = page("why-recurring-event-skips-months.html");
  const ds = (text, o = {}) => analyze({ text, ...o }).occurrences.map((x) => x.date.slice(0, 10));
  assert.ok(g.includes(ds("DTSTART:20260131T090000\nRRULE:FREQ=MONTHLY;COUNT=7").slice(0, 6).join(", ")));
  assert.ok(g.includes(ds("DTSTART:20260105T090000\nRRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=3").slice(0, 2).join(", ")));
  assert.ok(g.includes(ds("DTSTART:20260105T090000\nRRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=3", { dtstartMode: "rule" }).slice(0, 2).join(", ")));
  assert.ok(g.includes(ds("DTSTART:20260130T090000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1;COUNT=3").slice(0, 2).join(", ")));
  const gap = analyze({ text: "DTSTART;TZID=America/New_York:20260306T023000\nRRULE:FREQ=DAILY;COUNT=4" }).occurrences[2];
  assert.equal(gap.utc, "2026-03-08T07:30:00Z");
  assert.ok(g.includes("07:30 UTC, or 03:30 on the new clock"));
});

test("the example loads with findings to show", () => {
  const html = page("index.html");
  assert.match(html, /EXAMPLE\.text/);
});

test("links: sibling, guide, robots, sitemap, README, llms.txt, LICENSE and VENTURE.yaml", () => {
  const html = page("index.html");
  assert.match(html, /href="\.\.\/ics-calendar-check\/"/);
  assert.ok(readFileSync(new URL("../ics-calendar-check/index.html", import.meta.url)));
  assert.match(html, /href="why-recurring-event-skips-months\.html"/);
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("llms.txt"), /^# RRULE Explainer/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: rrule-explainer$/m);
});
