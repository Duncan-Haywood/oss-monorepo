import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any scheduling, payroll or point-of-sale vendor/);
});

test("JSON-LD blocks parse and describe a free application and a FAQ", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 6);
  for (const q of blocks[1].mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("SEO basics", () => {
  const html = page("index.html");
  assert.match(html, /<title>Shift Roster Builder/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 4);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && html.includes(`<label for="${id}">`)), `unlabelled: ${tag}`);
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
  assert.ok(used.length > 6);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("page documents the rules and what it leaves out", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Unverified/);
  assert.match(html, /simulated annealing/);
  assert.match(html, /exhaustive search/);
  assert.match(html, /predictive-scheduling/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["roster_built", "example_loaded", "file_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
});

test("robots, sitemap, README, LICENSE and VENTURE.yaml exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("sitemap.xml"), /how-to-make-an-employee-schedule\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: shift-roster-builder$/m);
});

test("the guide page carries a disclaimer, FAQ JSON-LD and links back", () => {
  const html = page("how-to-make-an-employee-schedule.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax or financial advice/);
  assert.match(html, /href="\.\/"/);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks[0]["@type"], "FAQPage");
  for (const q of blocks[0].mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("setup is remembered on-device only, with save/load/forget controls", () => {
  const html = page("index.html");
  assert.match(html, /localStorage\.setItem\(KEY/);
  assert.match(html, /id="save-setup"/);
  assert.match(html, /id="setup-file"/);
  assert.match(html, /id="forget"/);
  assert.match(html, /this device only/);
});

test("hire-test guide: every figure in the worked example is what the engine returns", async () => {
  const { parseStaff, parseShifts, buildRoster } = await import("./calc.mjs");
  const staffT = "name, wage, max hours, min hours, availability\nMaya, 24, 40, 32, Tue-Sat 9-19\nJo, 20, 36, 24, Mon-Fri 9-19\nPriya, 18, 24, 12, Thu-Sun 10-20\nSam, 15, 20, 8, Mon-Sat 9-19";
  const shiftT = "day, start, end, people needed, label\nMon-Fri, 9, 14, 2, am\nMon-Fri, 14, 19, 2, pm\nSat, 10, 18, 3, saturday\nSun, 10, 16, 1, sunday";
  const slots = parseShifts(shiftT).slots;
  const r = buildRoster(parseStaff(staffT).staff, slots);
  assert.equal(r.totalHours, 130);
  assert.equal(r.unfilledSlots, 6);
  assert.equal(r.unfilledHours, 33);
  assert.equal(r.cost, 1904);
  assert.equal(r.hireTest.coveredHours, 28);
  assert.equal(r.hireTest.stillUnfilledHours, 5);
  assert.equal(Math.round(r.hireTest.extraCost), 545);
  const r2 = buildRoster(parseStaff(staffT + "\nNew hire, 17, 30, 0, any").staff, slots);
  assert.equal(r2.unfilledSlots, 1);
  assert.equal(r2.unfilledHours, 5);
  assert.equal(r2.cost, 2380);
  const html = page("do-i-need-to-hire-another-employee.html");
  for (const t of ["130 hours", "120 hours", "33 hours", "$1,904", "$2,380", "No warranty", "not legal, tax or financial advice"]) assert.ok(html.includes(t), t);
  assert.match(page("sitemap.xml"), /do-i-need-to-hire-another-employee\.html/);
  assert.match(page("index.html"), /do-i-need-to-hire-another-employee\.html/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("wall-copy print view exists, prints the grid only, and never carries pay", () => {
  const html = page("index.html");
  assert.match(html, /id="print-wall"/);
  assert.match(html, /body\.print-wall > :not\(#wall\)/);
  const handler = html.slice(html.indexOf('$("#print-wall")'), html.indexOf('$("#download")'));
  assert.match(handler, /#grid thead/);
  assert.doesNotMatch(handler, /payroll|wage|money/i);
});

test("clopening page's rest-gap table is what the engine returns for the sample cafe", async () => {
  const { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts } = await import("./calc.mjs");
  const staff = parseStaff(sampleStaff()).staff, slots = parseShifts(sampleShifts()).slots;
  const html = page("how-to-avoid-clopening.html");
  for (const [h, open, covered, pay] of [[0, 3, 211, 3525], [8, 3, 216, 3620], [10, 3, 216, 3622], [12, 3, 216, 3630], [14, 6, 212, 3578]]) {
    const r = buildRoster(staff, slots, { minRestHours: h });
    assert.equal(r.unfilled.length, open, `${h}h open`);
    assert.equal(r.hours, covered, `${h}h covered`);
    assert.equal(r.cost, pay, `${h}h payroll`);
    assert.ok(html.includes("$" + pay.toLocaleString("en-US")), `${h}h row on page`);
  }
  assert.match(page("sitemap.xml"), /how-to-avoid-clopening\.html/);
  assert.match(page("index.html"), /how-to-avoid-clopening\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});
