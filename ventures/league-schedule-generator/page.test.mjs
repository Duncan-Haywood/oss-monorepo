import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { buildSchedule, readSpec, teamSchedule } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "how-to-make-a-round-robin-schedule.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any league/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test("JSON-LD blocks parse and every FAQ question is on the page", () => {
  for (const name of ["index.html", GUIDE]) {
    const html = page(name);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    assert.ok(faq && faq.mainEntity.length >= 3, name);
    for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    for (const q of faq.mainEntity) assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const app = JSON.parse(page("index.html").match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(app["@type"], "SoftwareApplication");
  assert.equal(app.offers.price, "0");
});

test("SEO basics", () => {
  const html = page("index.html");
  assert.match(html, /<title>League Schedule Generator/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /round robin schedule generator/i);
});

test("every static input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 15);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label[^>]*for="${id}"`).test(html)), `unlabelled: ${tag}`);
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
  assert.ok(used.length > 25);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
  for (const id of ["teams", "double", "start", "minutes", "seed", "skip", "blackouts", "courts", "times", "playoff", "playoffDouble", "results", "team"]) assert.ok(ids.has(id), id);
  for (let i = 0; i < 7; i++) assert.ok(ids.has(`wd${i}`), `wd${i}`);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["schedule_built", "example_loaded", "csv_downloaded", "ics_downloaded", "text_shared", "link_shared", "link_opened"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
});

test("robots, sitemap, README, LICENSE and VENTURE.yaml exist and carry the screening notes", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("LICENSE"), /MIT License/);
  const y = page("VENTURE.yaml");
  assert.match(y, /^name: league-schedule-generator$/m);
  assert.match(y, /duplicate_check\.py: closest row was shift-cover-optimizer 0\.11/);
  assert.match(y, /r\/pickleball, r\/youthsports and r\/chess/);
  assert.match(y, /No payments, no accounts/);
});

test("related-tool links point at ventures that exist, and the sibling links resolve", () => {
  for (const name of ["index.html", GUIDE]) {
    for (const m of page(name).matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) assert.ok(existsSync(new URL(`../${m[1]}/index.html`, import.meta.url)), m[1]);
  }
  assert.match(page("index.html"), /href="\.\/how-to-make-a-round-robin-schedule\.html"/);
  assert.match(page("sitemap.xml"), /how-to-make-a-round-robin-schedule\.html/);
});

test("the guide's worked example matches the generator", () => {
  const guide = page(GUIDE);
  assert.match(guide, /No warranty/);
  assert.match(guide, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(guide, /<link rel="canonical" href="\.\/how-to-make-a-round-robin-schedule\.html">/);
  assert.match(guide, /href="\.\/"/);
  const { spec } = readSpec({ teams: "Aces\nBolts\nComets\nDinks\nEagles", start: "2026-10-06", weekdays: ["Tue"], courts: "Court 1, Court 2", seed: 1 });
  const s = buildSchedule(spec);
  const short = (d) => `${Number(d.slice(8))} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(d.slice(5, 7)) - 1]}`;
  s.rounds.forEach((r, i) => {
    const cell = (court) => {
      const m = r.matches.find((x) => x.court === court);
      return `${m.homeName} v ${m.awayName}`;
    };
    const iso = new Date(r.day * 86400000).toISOString().slice(0, 10);
    const row = `<tr><td>${i + 1}</td><td>${short(iso)}</td><td>${cell("Court 1")}</td><td>${cell("Court 2")}</td><td>${s.teams[r.bye]}</td></tr>`;
    assert.ok(guide.includes(row), row);
  });
  for (let t = 0; t < 5; t++) {
    const rows = teamSchedule(s, t).filter((r) => !r.bye);
    assert.equal(rows.filter((r) => r.venue === "Home").length, 2);
    assert.equal(new Set(rows.map((r) => r.court)).size, 2);
  }
  assert.equal(s.stats.totalBreaks, 0);
  assert.equal(s.stats.matches, 10);
});

test("shift-cover-optimizer links here", () => {
  assert.match(readFileSync(new URL("../shift-cover-optimizer/index.html", import.meta.url), "utf8"), /href="\.\.\/league-schedule-generator\/"/);
});
