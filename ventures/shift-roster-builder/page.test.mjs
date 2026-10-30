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
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./calc.mjs", "./import-shifts.mjs", "./import-staff.mjs", "./usage.mjs"]);
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
  for (const e of ["roster_built", "example_loaded", "file_loaded", "report_downloaded", "share_link_copied", "share_link_opened", "saved_setup_restored", "roster_built_new_week"]) {
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

test("labor-cost page's figures are what the engine returns for the sample cafe", async () => {
  const { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts, laborPercent, dailyLabor } = await import("./calc.mjs");
  const staff = parseStaff(sampleStaff()).staff, slots = parseShifts(sampleShifts()).slots;
  const r = buildRoster(staff, slots, {});
  const html = page("labor-cost-percentage-by-day.html");
  assert.equal(r.cost, 3622);
  assert.equal(laborPercent(r.cost, 14000, 30).pct.toFixed(1), "25.9");
  assert.equal(laborPercent(r.cost, 12000, 30).pct.toFixed(1), "30.2");
  const d = dailyLabor(r, staff, "1500 1600 1700 1900 2600 3200 2400");
  for (const day of d.days) {
    assert.ok(html.includes(`<td class="n">${day.pct.toFixed(1)}%</td>`), day.day);
    assert.ok(html.includes("$" + day.cost.toLocaleString("en-US")), day.day + " cost");
  }
  assert.equal(d.worst.day, "Tue");
  assert.match(page("sitemap.xml"), /labor-cost-percentage-by-day\.html/);
  assert.match(page("index.html"), /labor-cost-percentage-by-day\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("availability form: local only, labelled, imports only calc.mjs, noindex, disclaimer", async () => {
  const html = page("availability.html");
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|<form[^>]+action=/i);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]), ["./calc.mjs"]);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /No warranty/);
  assert.match(html, /never sent anywhere/);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
  const names = html.match(/import \{([^}]+)\} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim());
  const calc = await import("./calc.mjs");
  for (const n of names) assert.ok(n in calc, n);
  for (const tag of [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]).filter((t) => /id="(who|maxh|offs|out)"/.test(t))) {
    const id = tag.match(/\sid="([^"]+)"/)[1];
    assert.ok(html.includes(`<label for="${id}">`), id);
  }
});

test("index links the collect-availability flow to existing elements", () => {
  const html = page("index.html");
  for (const id of ["collect-biz", "collect-name", "collect-link", "replies", "merge-replies", "merge-status", "collect-copy"]) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /availability\.html/);
});

test("links to the meeting-action-items sibling", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /href="\.\.\/meeting-action-items\/"/);
});

test("share link keeps the setup in the URL fragment, never sent anywhere", () => {
  const html = page("index.html");
  assert.match(html, /id="share-link"/);
  assert.match(html, /"#setup=" \+ b64\(/);
  assert.match(html, /\^#setup=/);
  assert.match(html, /wages included/);
});

test("free-alternative page is linked, disclaims affiliation, and states no competitor price", () => {
  const html = page("free-alternative-to-7shifts-when-i-work-homebase.html");
  assert.match(page("sitemap.xml"), /free-alternative-to-7shifts-when-i-work-homebase\.html/);
  assert.match(page("index.html"), /free-alternative-to-7shifts-when-i-work-homebase\.html/);
  assert.ok(html.includes("No warranty"));
  assert.match(html, /Not affiliated with, endorsed by, or sponsored by 7shifts/);
  assert.doesNotMatch(html, /\$\s?\d/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("schedule template page's example grid is what the engine returns for the sample cafe", async () => {
  const { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts, DAYS, fmtClock } = await import("./calc.mjs");
  const staff = parseStaff(sampleStaff()).staff, slots = parseShifts(sampleShifts()).slots;
  const r = buildRoster(staff, slots, {});
  const html = page("employee-schedule-template.html");
  assert.equal(r.hours, 216);
  assert.equal(r.cost, 3622);
  for (const s of staff) {
    const cells = DAYS.map((_, d) => r.assignments.filter((a) => a.person === s.name && a.slot.day === d).map((a) => fmtClock(a.slot.startMin) + "-" + fmtClock(a.slot.endMin)).join(" ") || "off");
    const hours = r.people.find((x) => x.name === s.name).hours;
    const row = `<tr><td>${s.name}</td>${cells.map((c) => `<td>${c}</td>`).join("")}<td class="n">${hours}</td></tr>`;
    assert.ok(html.includes(row), `${s.name} row`);
  }
  assert.match(page("sitemap.xml"), /employee-schedule-template\.html/);
  assert.match(page("index.html"), /employee-schedule-template\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("the open-shift preference select is labelled and feeds buildRoster's openShiftWeight", () => {
  const html = page("index.html");
  assert.match(html, /<label for="openpref">/);
  assert.match(html, /openShiftWeight: \$\("#openpref"\)\.value === "shifts" \? 100 : 0/);
});
