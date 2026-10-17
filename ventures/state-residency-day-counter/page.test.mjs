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
  for (const name of ["index.html", "183-day-rule-by-state.html", "remote-work-convenience-of-the-employer-rule.html"]) {
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
  for (const e of ["count_run", "example_loaded", "report_downloaded", "daily_log_downloaded", "audit_packet_downloaded"]) {
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
  for (const name of ["index.html", "183-day-rule-by-state.html", "remote-work-convenience-of-the-employer-rule.html"]) {
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
