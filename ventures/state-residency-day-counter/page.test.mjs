import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { analyze, sampleSpec } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, financial or construction advice/i);
  assert.match(html, /does not state anyone's tax residency/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any state, tax authority/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test("JSON-LD blocks parse and every FAQ question is on the page", () => {
  for (const name of ["index.html", "183-day-rule-by-state.html", "remote-work-convenience-of-the-employer-rule.html", "snowbird-days-in-new-york.html", "maryland-utah-182-day-limit.html", "nyc-resident-tax-183-day-test.html", "georgia-new-mexico-louisiana-days-only-residency.html"]) {
    const html = page(name);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    assert.ok(faq && faq.mainEntity.length >= 3, name);
    for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
  }
  const app = JSON.parse(page("index.html").match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(app["@type"], "SoftwareApplication");
  assert.equal(app.offers.price, "0");
});

test("SEO basics", () => {
  const html = page("index.html");
  assert.match(html, /<title>State Residency Day Counter/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
});

test("every static input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 8);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label for="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
  assert.doesNotMatch(page("usage.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("the module scripts import only local files, and the inline script parses", () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  assert.doesNotMatch(page("calc.mjs"), /^\s*import\s/m);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
});

test("every name the inline script imports is exported by calc.mjs", async () => {
  const names = page("index.html").match(/import \{([^}]+)\} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim());
  const calc = await import("./calc.mjs");
  for (const name of names) assert.ok(name in calc, name);
});

test("every element the script looks up exists on the page", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/\$\("#([\w-]+)"\)|getElementById\("([\w-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 20);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
  for (const id of ["year", "asof", "home", "wages", "conv", "stays", "abode", "limits"]) assert.ok(ids.has(id), id);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["count_run", "example_loaded", "report_downloaded", "daily_log_downloaded", "audit_packet_downloaded", "deadlines_downloaded", "trip_checked", "remembered_entries_restored", "count_run_new_day"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
});

test("robots, sitemap, README, LICENSE and VENTURE.yaml exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: state-residency-day-counter$/m);
});

test("related-tool links point at ventures that exist", () => {
  for (const name of ["index.html", "183-day-rule-by-state.html", "remote-work-convenience-of-the-employer-rule.html", "snowbird-days-in-new-york.html", "maryland-utah-182-day-limit.html", "nyc-resident-tax-183-day-test.html", "georgia-new-mexico-louisiana-days-only-residency.html"]) {
    for (const m of page(name).matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) assert.ok(existsSync(new URL(`../${m[1]}/index.html`, import.meta.url)), m[1]);
  }
});

test("the guide's worked example matches the counter", () => {
  const guide = page("183-day-rule-by-state.html");
  assert.match(guide, /No warranty/);
  assert.match(guide, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(guide, /<link rel="canonical" href="\.\/183-day-rule-by-state\.html">/);
  assert.match(guide, /href="\.\/"/);
  assert.match(page("index.html"), /href="\.\/183-day-rule-by-state\.html"/);
  assert.match(page("sitemap.xml"), /183-day-rule-by-state\.html/);
  const r = analyze(sampleSpec());
  const row = (c) => r.states.find((s) => s.code === c).days;
  assert.ok(guide.includes(`<td>New York</td><td class="n">${row("NY")}</td>`));
  assert.ok(guide.includes(`<td>Florida</td><td class="n">${row("FL")}</td>`));
  assert.ok(guide.includes(`<td>New Jersey</td><td class="n">${row("NJ")}</td>`));
  assert.ok(guide.includes(`by ${row("NY") - 183}, with an abode`));
  assert.match(guide, /167 New York days/);
  assert.match(guide, /17 October/);
  assert.equal(r.states.find((s) => s.code === "NY").daysToDate, 167);
});

test("footer links back to the quarterly estimated tax calendar, which links here", () => {
  assert.match(page("index.html"), /href="\.\.\/quarterly-estimated-tax-calendar\/"/);
  assert.match(readFileSync(new URL("../quarterly-estimated-tax-calendar/index.html", import.meta.url), "utf8"), /href="\.\.\/state-residency-day-counter\/"/);
});

test("the employer-rule guide's figures match the counter", async () => {
  const { sampleSpec, analyze } = await import("./calc.mjs");
  const spec = sampleSpec();
  spec.employerState = "NY";
  const r = analyze(spec);
  const guide = page("remote-work-convenience-of-the-employer-rule.html");
  const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const ny = r.states.find((s) => s.code === "NY");
  const fl = r.states.find((s) => s.code === "FL");
  assert.ok(guide.includes(`<td class="n">${r.employer.physicalDays}</td><td class="n">${usd(ny.wages)}</td>`));
  assert.ok(guide.includes(`<td class="n">${r.employer.claimableDays}</td><td class="n">${usd(r.employer.claimableWages)}</td>`));
  assert.ok(guide.includes(`${r.employer.remoteDays} Florida workdays carry ${usd(fl.wages)}`));
  assert.match(guide, /<link rel="canonical" href="\.\/remote-work-convenience-of-the-employer-rule\.html">/);
  assert.match(guide, /No warranty/);
  assert.match(page("index.html"), /href="\.\/remote-work-convenience-of-the-employer-rule\.html"/);
  assert.match(page("sitemap.xml"), /remote-work-convenience-of-the-employer-rule\.html/);
});

test("the snowbird guide's figures match the counter", async () => {
  const { analyze, parseStays, toDay } = await import("./calc.mjs");
  const guide = page("snowbird-days-in-new-york.html");
  const ny = (text, convention = "inclusive") => {
    const stays = parseStays(text, 2025);
    return analyze({ year: 2025, stays: stays.stays ?? stays, homeState: "FL", abode: { NY: true, FL: true }, asOf: toDay(2025, 12, 31), convention, wages: 0, overrides: {}, homeWorks: true }).states.find((x) => x.code === "NY");
  };
  const may = ny("2025-05-01 to 2025-10-31 NY");
  assert.equal(may.days, 184);
  assert.ok(guide.includes(`<td class="n">${may.days}</td><td>Over by ${-may.room}</td>`));
  assert.equal(ny("2025-05-01 to 2025-10-31 NY", "nights").days, 183);
  const sep = ny("2025-05-01 to 2025-09-30 NY");
  assert.ok(guide.includes(`<td class="n">${sep.days}</td><td>${sep.room} days of room</td>`));
  const hol = ny("2025-05-15 to 2025-10-10 NY\n2025-12-20 to 2025-12-31 NY");
  const base = ny("2025-05-15 to 2025-10-10 NY");
  assert.ok(guide.includes(`<td class="n">${hol.days}</td><td>${hol.room} days of room</td>`));
  assert.ok(guide.includes(`costs ${hol.days - base.days} days of the ${base.room} the person`));
  assert.match(guide, /<link rel="canonical" href="\.\/snowbird-days-in-new-york\.html">/);
  assert.match(guide, /No warranty/);
  assert.match(page("index.html"), /href="\.\/snowbird-days-in-new-york\.html"/);
  assert.match(page("sitemap.xml"), /snowbird-days-in-new-york\.html/);
});

test("the Maryland/Utah guide's figures match the counter", async () => {
  const { analyze, parseStays, toDay, RULES } = await import("./calc.mjs");
  const guide = page("maryland-utah-182-day-limit.html");
  const md = (text, convention = "inclusive") => {
    const stays = parseStays(text, 2025);
    return analyze({ year: 2025, stays: stays.stays ?? stays, homeState: "FL", abode: { MD: true, FL: true }, asOf: toDay(2025, 12, 31), convention, wages: 0, overrides: {}, homeWorks: true }).states.find((x) => x.code === "MD");
  };
  assert.equal(RULES.MD.limit, 182);
  assert.equal(RULES.UT.limit, 182);
  const a = md("2025-05-01 to 2025-10-28 MD");
  assert.ok(guide.includes(`<td class="n">${a.days}</td><td>${a.room} day of room</td>`));
  const b = md("2025-05-01 to 2025-10-29 MD");
  assert.equal(b.room, 0);
  assert.ok(guide.includes(`<td class="n">${b.days}</td><td>No room left</td>`));
  const c = md("2025-06-01 to 2025-11-30 MD");
  assert.ok(guide.includes(`<td class="n">${c.days}</td><td>Over by ${-c.room}</td>`));
  assert.equal(md("2025-06-01 to 2025-11-30 MD", "nights").days, 182);
  assert.equal(md("2025-05-01 to 2025-10-31 MD").room, -2);
  assert.match(guide, /<link rel="canonical" href="\.\/maryland-utah-182-day-limit\.html">/);
  assert.match(guide, /No warranty/);
  assert.match(page("index.html"), /href="\.\/maryland-utah-182-day-limit\.html"/);
  assert.match(page("sitemap.xml"), /maryland-utah-182-day-limit\.html/);
});

test("the California guide's figures match the counter", async () => {
  const { analyze, parseStays, toDay, RULES } = await import("./calc.mjs");
  const guide = page("california-nine-month-residency-presumption.html");
  const ca = (text, convention = "inclusive") => {
    const stays = parseStays(text, 2025);
    return analyze({ year: 2025, stays: stays.stays ?? stays, homeState: "NV", abode: { NV: true }, asOf: toDay(2025, 12, 31), convention, wages: 0, overrides: {}, homeWorks: true }).states.find((x) => x.code === "CA");
  };
  assert.equal(RULES.CA.limit, 270);
  assert.equal(RULES.CA.kind, "presumption");
  const a = ca("2025-01-01 to 2025-09-26 CA");
  assert.ok(guide.includes(`<td class="n">${a.days}</td><td>${a.room} day of room</td>`));
  const b = ca("2025-01-01 to 2025-09-27 CA");
  assert.equal(b.room, 0);
  assert.ok(guide.includes(`<td class="n">${b.days}</td><td>No room left</td>`));
  const c = ca("2025-01-01 to 2025-09-30 CA");
  assert.ok(guide.includes(`<td class="n">${c.days}</td><td>Over by ${-c.room}</td>`));
  assert.match(guide, /<link rel="canonical" href="\.\/california-nine-month-residency-presumption\.html">/);
  assert.match(guide, /No warranty/);
  assert.match(page("index.html"), /href="\.\/california-nine-month-residency-presumption\.html"/);
  assert.match(page("sitemap.xml"), /california-nine-month-residency-presumption\.html/);
});

test("the days-only residency guide's figures match the counter", async () => {
  const { analyze, parseStays, toDay, RULES } = await import("./calc.mjs");
  const guide = page("georgia-new-mexico-louisiana-days-only-residency.html");
  const run = (text, code) => {
    const stays = parseStays(text, 2025);
    return analyze({ year: 2025, stays: stays.stays ?? stays, homeState: "TX", abode: { TX: true }, asOf: toDay(2025, 12, 31), convention: "inclusive", wages: 0, overrides: {}, homeWorks: true }).states.find((x) => x.code === code);
  };
  assert.equal(RULES.GA.limit, 182);
  assert.equal(RULES.NM.limit, 184);
  assert.equal(RULES.LA.limit, 182);
  for (const code of ["GA", "NM", "LA"]) assert.equal(RULES[code].requiresAbode, false);
  const room = (r) => (r.room > 0 ? `${r.room} day${r.room === 1 ? "" : "s"} of room` : r.room === 0 ? "No room left" : `Over by ${-r.room}`);
  for (const [text, code] of [["2025-01-01 to 2025-06-30 GA", "GA"], ["2025-01-01 to 2025-07-01 GA", "GA"], ["2025-01-01 to 2025-07-02 GA", "GA"], ["2025-01-01 to 2025-07-03 NM", "NM"], ["2025-01-01 to 2025-07-04 NM", "NM"]]) {
    const r = run(text, code);
    assert.ok(guide.includes(`<td class="n">${r.days}</td><td>${room(r)}</td>`), text);
  }
  assert.match(guide, /<link rel="canonical" href="\.\/georgia-new-mexico-louisiana-days-only-residency\.html">/);
  assert.match(guide, /No warranty/);
  assert.match(page("index.html"), /href="\.\/georgia-new-mexico-louisiana-days-only-residency\.html"/);
  assert.match(page("sitemap.xml"), /georgia-new-mexico-louisiana-days-only-residency\.html/);
});

test("the NYC guide's figures match the counter", async () => {
  const { analyze, parseStays, toDay } = await import("./calc.mjs");
  const guide = page("nyc-resident-tax-183-day-test.html");
  const nyc = (text) => analyze({ year: 2025, stays: parseStays(text, 2025).stays, homeState: "NJ", abode: { NYC: true, NY: true, NJ: true }, asOf: toDay(2025, 12, 31), convention: "inclusive", wages: 0, overrides: {}, homeWorks: true }).states.find((x) => x.code === "NYC");
  const a = nyc("2025-01-01 to 2025-07-02 NYC");
  assert.equal(a.room, 0);
  assert.ok(guide.includes(`<td class="n">${a.days}</td><td>No room left</td>`));
  for (const text of ["2025-01-01 to 2025-07-03 NYC", "2025-05-01 to 2025-10-31 NYC"]) {
    const c = nyc(text);
    assert.ok(guide.includes(`<td class="n">${c.days}</td><td>Over by ${-c.room}</td>`), text);
  }
  assert.match(guide, /<link rel="canonical" href="\.\/nyc-resident-tax-183-day-test\.html">/);
  assert.match(page("index.html"), /href="\.\/nyc-resident-tax-183-day-test\.html"/);
  assert.match(page("sitemap.xml"), /nyc-resident-tax-183-day-test\.html/);
});
