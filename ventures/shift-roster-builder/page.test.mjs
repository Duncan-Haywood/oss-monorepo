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

test("clopening page's rest-gap table is what the engine returns for the sample cafe", async () => {
  const { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts } = await import("./calc.mjs");
  const staff = parseStaff(sampleStaff()).staff, slots = parseShifts(sampleShifts()).slots;
  const html = page("how-to-avoid-clopening.html");
  for (const [h, open, covered, pay] of [[0, 2, 219, 3671], [8, 3, 216, 3620], [10, 3, 216, 3622], [12, 3, 216, 3630], [14, 4, 218, 3662]]) {
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

test("overtime page's table is what the engine returns for the sample cafe", async () => {
  const { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts } = await import("./calc.mjs");
  const staff = parseStaff(sampleStaff()).staff, slots = parseShifts(sampleShifts()).slots;
  const html = page("how-to-reduce-overtime-in-a-schedule.html");
  for (const [line, ot, covered, pay] of [[30, 30, 216, 3890], [35, 13, 216, 3739], [40, 0, 216, 3622]]) {
    const r = buildRoster(staff, slots, { otAfter: line });
    assert.equal(r.otHours, ot, `${line}h overtime hours`);
    assert.equal(r.hours, covered, `${line}h covered`);
    assert.equal(Math.round(r.cost), pay, `${line}h payroll`);
    assert.ok(html.includes("$" + pay.toLocaleString("en-US")), `${line}h row on page`);
  }
  assert.match(page("sitemap.xml"), /how-to-reduce-overtime-in-a-schedule\.html/);
  assert.match(page("index.html"), /how-to-reduce-overtime-in-a-schedule\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
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

test("call-out page's table is what the engine returns for the sample cafe, with and without a spare part-timer", async () => {
  const { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts, absencePlan, DAYS } = await import("./calc.mjs");
  const slots = parseShifts(sampleShifts()).slots;
  const groups = (ow) => { const m = new Map(); ow.forEach((x, i) => { const k = `${slots[i].day}|${slots[i].start}|${slots[i].label}`; (m.get(k) || m.set(k, []).get(k)).push(x); }); return m; };
  const moved = (a, b) => { const B = groups(b); let n = 0; for (const [k, v] of groups(a)) { const w = [...B.get(k)]; for (const x of v) { const j = w.indexOf(x); if (j >= 0) w.splice(j, 1); } n += w.length; } return n; };
  const study = (text) => {
    const staff = parseStaff(text).staff, r = buildRoster(staff, slots, {});
    const o = { cases: 0, patched: 0, covered: 0, moves: [] };
    for (let p = 0; p < staff.length; p++) for (let d = 0; d < 7; d++) {
      if (!r.owner.some((x, i) => x === p && slots[i].day === d)) continue;
      o.cases++;
      if (!absencePlan(staff, slots, r, staff[p].name, [d]).open.length) o.patched++;
      const off = text.split("\n").map((l) => (l.startsWith(staff[p].name + ",") ? `${l}, off: ${DAYS[d]}` : l)).join("\n").replace("min hours, availability", "min hours, availability, off");
      const r2 = buildRoster(parseStaff(off).staff, slots, {});
      if (r2.unfilledHours <= r.unfilledHours) { o.covered++; o.moves.push(moved(r.owner, r2.owner)); }
    }
    return o;
  };
  const a = study(sampleStaff());
  assert.deepEqual([a.cases, a.patched, a.covered, Math.min(...a.moves), Math.max(...a.moves)], [29, 0, 24, 2, 19]);
  const b = study(sampleStaff() + "\nHal, 15, 24, 0, any");
  assert.deepEqual([b.cases, b.patched, b.covered, Math.min(...b.moves), Math.max(...b.moves)], [32, 1, 18, 13, 24]);
  const html = page("how-to-cover-a-shift-when-someone-calls-out.html");
  for (const t of ["29", "32", "2 to 19", "13 to 24", "24 of 29", "18 of 32", "No warranty", "not legal, tax or financial advice"]) assert.ok(html.includes(t), t);
  assert.match(page("sitemap.xml"), /how-to-cover-a-shift-when-someone-calls-out\.html/);
  assert.match(page("index.html"), /how-to-cover-a-shift-when-someone-calls-out\.html/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("share link keeps the setup in the URL fragment, never sent anywhere", () => {
  const html = page("index.html");
  assert.match(html, /id="share-link"/);
  assert.match(html, /"#setup=" \+ b64\(/);
  assert.match(html, /\^#setup=/);
  assert.match(html, /wages included/);
});

test("14-15 year old page's table is what the engine returns for the sample cafe", async () => {
  const { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts } = await import("./calc.mjs");
  const slots = parseShifts(sampleShifts()).slots;
  const html = page("scheduling-14-and-15-year-olds.html");
  const cleo = "Cleo, 15, 30, 12, Mon-Fri 15-23; Sat-Sun 8-23", eli = "Eli, 14, 24, 8, Mon/Wed/Fri 16-23; Sat-Sun 8-23";
  const withAges = (c, e) => sampleStaff().replace(cleo, cleo + (c ? `, age: ${c}` : "")).replace(eli, eli + (e ? `, age: ${e}` : ""));
  for (const [c, e, open, covered, pay, hrs] of [[0, 0, 3, 216, 3622, 36], ["15", 0, 5, 200, 3382, 18], ["15", "14", 7, 184, 3168, 0], ["15 summer", "14 summer", 3, 216, 3632, 32]]) {
    const p = parseStaff(withAges(c, e));
    assert.deepEqual(p.errors, []);
    const r = buildRoster(p.staff, slots, {});
    assert.equal(r.unfilled.length, open, "open");
    assert.equal(r.hours, covered, "covered");
    assert.equal(r.cost, pay, "payroll");
    assert.equal(r.people.filter((x) => x.name === "Cleo" || x.name === "Eli").reduce((a, x) => a + x.hours, 0), hrs, "teen hours");
    assert.ok(html.includes("$" + pay.toLocaleString("en-US")), `${pay} on page`);
  }
  assert.match(page("sitemap.xml"), /scheduling-14-and-15-year-olds\.html/);
  assert.match(page("index.html"), /scheduling-14-and-15-year-olds\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
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

test("rotation page's eight-week table is what the engine returns for six identical staff", async () => {
  const { sampleShifts, planWeeks, planFairness } = await import("./calc.mjs");
  const staff = ["name, wage, max hours, min hours, availability", ..."Ana Ben Cleo Dev Eli Fay".split(" ").map((n) => `${n}, 15, 40, 0, any`)].join("\n");
  const html = page("how-to-rotate-closing-and-weekend-shifts-fairly.html");
  for (const [t, most, least, gap] of [[0, 37, 34, 3], [10, 37, 35, 2], [30, 37, 35, 2]]) {
    const p = planWeeks(staff, sampleShifts(), { weeks: 8, weekStart: "2026-11-02", toughBalance: t });
    const f = planFairness(p);
    assert.equal(f.rows[0].tough, most, `${t} most`);
    assert.equal(f.rows[f.rows.length - 1].tough, least, `${t} least`);
    assert.equal(f.spread, gap, `${t} gap`);
    assert.equal(p.totalCost, 28200, `${t} payroll`);
    assert.equal(p.totalOpenHours, 0, `${t} open hours`);
  }
  assert.ok(html.includes("$28,200"));
  assert.match(page("sitemap.xml"), /how-to-rotate-closing-and-weekend-shifts-fairly\.html/);
  assert.match(page("index.html"), /how-to-rotate-closing-and-weekend-shifts-fairly\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("time-off page's table is what the engine returns for the sample cafe as weekends are granted one by one", async () => {
  const { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts } = await import("./calc.mjs");
  const slots = parseShifts(sampleShifts()).slots;
  const html = page("how-to-handle-time-off-requests.html");
  const who = ["Ana", "Gus", "Dev", "Cleo", "Eli"];
  const rows = [[3, 216, 3622], [3, 216, 3624], [4, 218, 3656], [5, 210, 3522], [7, 192, 3252], [9, 174, 3001]];
  rows.forEach(([open, covered, pay], n) => {
    const text = sampleStaff().split("\n").map((l) => (who.slice(0, n).some((w) => l.startsWith(w + ",")) ? l + ", off: Sat-Sun" : l)).join("\n").replace("min hours, availability", "min hours, availability, off");
    const p = parseStaff(text);
    assert.deepEqual(p.errors, []);
    const r = buildRoster(p.staff, slots, { minRestHours: 10 });
    assert.equal(r.unfilled.length, open, `${n} open`);
    assert.equal(r.hours, covered, `${n} covered`);
    assert.equal(r.cost, pay, `${n} payroll`);
    // Not asserted: that more requests never cover more hours. The default search is a heuristic and sometimes leaves hours the exact
    // search finds (the base week covers 216 here, 220 under exact:true), so a smaller week can cover more than a larger one.
    assert.ok(html.includes("$" + pay.toLocaleString("en-US")), `${pay} on page`);
  });
  assert.match(page("sitemap.xml"), /how-to-handle-time-off-requests\.html/);
  assert.match(page("index.html"), /how-to-handle-time-off-requests\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("widening page's table is what the engine returns for the sample cafe with one person freed or lifted to 40 h", async () => {
  const { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts } = await import("./calc.mjs");
  const slots = parseShifts(sampleShifts()).slots;
  const html = page("whose-availability-is-worth-widening.html");
  const base = sampleStaff().split("\n");
  const run = (lines) => {
    const p = parseStaff(lines.join("\n"));
    assert.deepEqual(p.errors, []);
    const r = buildRoster(p.staff, slots, { minRestHours: 10 });
    return [r.unfilled.length, r.hours, r.cost];
  };
  const any = { Ana: [3, 216, 3622], Ben: [3, 216, 3622], Cleo: [1, 232, 3870], Dev: [3, 216, 3620], Eli: [2, 224, 3736], Fay: [3, 216, 3622], Gus: [3, 216, 3622] };
  const cap = { Ana: [3, 216, 3622], Ben: [2, 224, 3750], Cleo: [3, 216, 3622], Dev: [3, 216, 3622], Eli: [3, 216, 3622], Fay: [2, 224, 3746], Gus: [3, 216, 3622] };
  for (let i = 1; i < base.length; i++) {
    const parts = base[i].split(", ");
    const name = parts[0];
    const a = base.slice(); a[i] = parts.slice(0, 4).join(", ") + ", any";
    const c = base.slice(); c[i] = [parts[0], parts[1], "40", parts[3], parts.slice(4).join(", ")].join(", ");
    assert.deepEqual(run(a), any[name], `${name} any`);
    assert.deepEqual(run(c), cap[name], `${name} cap`);
    assert.ok(html.includes("$" + any[name][2].toLocaleString("en-US")), `${name} on page`);
    assert.ok(html.includes("$" + cap[name][2].toLocaleString("en-US")), `${name} cap on page`);
  }
  assert.match(page("sitemap.xml"), /whose-availability-is-worth-widening\.html/);
  assert.match(page("index.html"), /whose-availability-is-worth-widening\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("the open-shift preference select is labelled and feeds buildRoster's openShiftWeight", () => {
  const html = page("index.html");
  assert.match(html, /<label for="openpref">/);
  assert.match(html, /openShiftWeight: \$\("#openpref"\)\.value === "shifts" \? 100 : 0/);
});

test("posted-schedule page's table is what eval/callout-churn-bench.mjs returns for the sample cafe", async () => {
  const { run } = await import("./eval/callout-churn-bench.mjs");
  const html = page("schedule-change-after-posting.html");
  const r = run();
  assert.equal(r.postedCost, 3622);
  assert.equal(r.postedOpen, 3);
  assert.deepEqual(r.rows.map((x) => [x.person, x.rebuild.others, x.rebuild.people, x.rebuild.owed, x.rebuild.open]),
    [["Ana", 4, 2, 73, 4], ["Ben", 5, 2, 93, 4], ["Dev", 10, 4, 174, 4], ["Fay", 7, 3, 118, 3], ["Gus", 4, 2, 68, 3]]);
  for (const x of r.rows) { assert.equal(x.patch.others, 0); assert.ok(html.includes(`<td>${x.person}</td><td class="n">${x.rebuild.others}</td><td class="n">${x.rebuild.people}</td><td class="n">$${x.rebuild.owed}</td><td class="n">${x.rebuild.open}</td>`), x.person); }
  assert.match(page("sitemap.xml"), /schedule-change-after-posting\.html/);
  assert.match(page("index.html"), /schedule-change-after-posting\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("salon page numbers come from the builder", async () => {
  const { parseStaff, parseShifts, buildRoster } = await import("./calc.mjs");
  const staff = parseStaff("Mia, 22, 32, 16, Tue-Sat 9-19\nJo, 20, 40, 24, Mon-Fri 9-18; Sat off\nPriya, 24, 30, 0, Wed-Sun 10-20\nLeo, 18, 20, 0, Thu-Sat 12-20; Sun 10-16").staff;
  const slots = parseShifts("Tue-Fri, 9, 14, 1, Morning chair\nTue-Fri, 14, 19, 2, Afternoon chairs\nSat, 9, 18, 3, Saturday full\nSun, 10, 16, 1, Sunday").slots;
  const r = buildRoster(staff, slots, {});
  const html = page("salon-staff-schedule.html");
  assert.equal(r.cost, 1466);
  assert.ok(html.includes("13 of 16 chair-shifts are covered for $1,466"));
  assert.match(page("sitemap.xml"), /salon-staff-schedule\.html/);
  assert.match(page("index.html"), /salon-staff-schedule\.html/);
  assert.ok(html.includes("No warranty"));
});

test("daycare page numbers come from the builder", async () => {
  const { parseStaff, parseShifts, buildRoster } = await import("./calc.mjs");
  const staff = parseStaff("Dana, 19, 40, 30, Mon-Fri 7-18\nEli, 17, 35, 20, Mon-Fri 7-18\nFran, 18, 30, 0, Mon-Thu 7-18\nGabe, 16, 25, 0, Mon-Fri 12-18\nHana, 17, 20, 0, Tue-Fri 7-13").staff;
  const slots = parseShifts("Mon-Fri, 7, 9, 1, Early open\nMon-Fri, 9, 15, 3, Core hours\nMon-Fri, 15, 18, 2, Close and pickup").slots;
  const html = page("daycare-staff-schedule.html");
  const r = buildRoster(staff, slots, {});
  assert.equal(r.cost, 1888);
  assert.ok(html.includes("23 of 30 adult-shifts are covered for $1,888"));
  const r0 = buildRoster(staff, slots, { minRestHours: 0 });
  assert.equal(r0.cost, 2195);
  assert.ok(html.includes("covers 29 of 30 for $2,195"));
  assert.match(page("sitemap.xml"), /daycare-staff-schedule\.html/);
  assert.match(page("index.html"), /daycare-staff-schedule\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("14-day notice page: 3-days-out column repeats the posted-schedule table, FAQ matches, linked", () => {
  const html = page("predictive-scheduling-14-day-notice.html");
  const posted = page("schedule-change-after-posting.html");
  for (const [p, others, owed] of [["Ana", 4, 73], ["Ben", 5, 93], ["Dev", 10, 174], ["Fay", 7, 118], ["Gus", 4, 68]]) {
    assert.ok(posted.includes(`<td>${p}</td><td class="n">${others}</td>`));
    assert.match(html, new RegExp(`<td>${p}</td><td class="n">${others}</td><td class="n">\\$0</td><td class="n">\\$\\d+</td><td class="n">\\$${owed}</td>`));
  }
  assert.match(page("sitemap.xml"), /predictive-scheduling-14-day-notice\.html/);
  assert.match(page("index.html"), /predictive-scheduling-14-day-notice\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("limits page's tables are what the engine returns for the sample cafe, FAQ matches, linked", async () => {
  const { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts } = await import("./calc.mjs");
  const staff = parseStaff(sampleStaff()).staff, slots = parseShifts(sampleShifts()).slots;
  const html = page("days-in-a-row-and-daily-hour-limits.html");
  const cases = [[{}, 3, 216, 3622], [{ maxDailyHours: 12 }, 3, 216, 3622], [{ maxDailyHours: 10 }, 3, 216, 3622], [{ maxDailyHours: 9 }, 4, 209, 3505],
    [{ maxDailyHours: 8 }, 4, 209, 3505], [{ maxDailyHours: 6 }, 27, 15, 261], [{ maxConsecDays: 5 }, 4, 218, 3658], [{ maxConsecDays: 4 }, 5, 220, 3690], [{ maxConsecDays: 3 }, 7, 204, 3402]];
  for (const [o, open, covered, pay] of cases) {
    const r = buildRoster(staff, slots, o);
    assert.equal(r.unfilled.length, open, JSON.stringify(o));
    assert.equal(r.hours, covered, JSON.stringify(o));
    assert.equal(r.cost, pay, JSON.stringify(o));
    assert.match(html, new RegExp(`<td class="n">${open}</td><td class="n">${covered}</td><td class="n">\\$${pay.toLocaleString("en-US")}</td>`));
  }
  assert.match(page("sitemap.xml"), /days-in-a-row-and-daily-hour-limits\.html/);
  assert.match(page("index.html"), /days-in-a-row-and-daily-hour-limits\.html/);
  assert.match(page("llms.txt"), /days-in-a-row-and-daily-hour-limits\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});
