import { test } from "node:test";
import assert from "node:assert/strict";
import { SEVERITIES, SYSTEMS, LIBRARY, esc, num, money, newFinding, normalise, summarize, toText, toHtml, exportJson, parseImport } from "./calc.mjs";

test("library entries are complete, unique and use known systems and severities", () => {
  const ids = new Set();
  for (const l of LIBRARY) {
    assert.ok(!ids.has(l.id), l.id); ids.add(l.id);
    assert.ok(SYSTEMS.includes(l.system), l.id);
    assert.ok(SEVERITIES.some((s) => s.id === l.severity), l.id);
    assert.ok(l.title && l.text && l.recommend, l.id);
  }
  assert.ok(LIBRARY.length >= 25);
  for (const s of SYSTEMS) assert.ok(LIBRARY.some((l) => l.system === s), s);
});

test("library wording does not cite codes, standards or guarantee anything", () => {
  for (const l of LIBRARY) assert.doesNotMatch(l.text + l.recommend, /\b(NEC|IRC|IBC|NFPA|ASHI|InterNACHI|code violation|guarantee)\b/i, l.id);
});

test("esc and num and money", () => {
  assert.equal(esc(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  assert.equal(num("$1,200"), 1200);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.6), "-$1,235");
});

test("newFinding copies the library entry; custom starts blank", () => {
  const f = newFinding("elec-gfci");
  assert.equal(f.system, "Electrical");
  assert.equal(f.severity, "safety");
  const c = newFinding(null);
  assert.equal(c.title, "");
  assert.notEqual(newFinding("elec-gfci").id, f.id);
});

test("normalise fixes severity, negative and reversed costs", () => {
  const n = normalise({ title: " X ", severity: "bogus", costLow: "900", costHigh: "-5" });
  assert.equal(n.severity, "info");
  assert.equal(n.title, "X");
  // A negative high figure is unusable, so the one good figure stands for both ends.
  assert.equal(n.costLow, 900);
  assert.equal(n.costHigh, 900);
  const m = normalise({ title: "Y", severity: "major", costLow: 500, costHigh: 200 });
  assert.equal(m.costLow, 200); assert.equal(m.costHigh, 500);
});

test("summarize counts, orders by severity and totals the entered costs", () => {
  const fs = [
    newFinding("roof-debris", { costLow: 100, costHigh: 200 }),
    newFinding("elec-gfci", { costLow: 300, costHigh: 600 }),
    newFinding("roof-worn", { costLow: 8000, costHigh: 12000 }),
    newFinding(null, { title: "", severity: "major" }),
  ];
  const s = summarize(fs);
  assert.equal(s.total, 3);
  assert.deepEqual(s.counts, { safety: 1, major: 1, minor: 1, info: 0 });
  assert.equal(s.priorityCount, 2);
  assert.deepEqual(s.sorted.map((f) => f.libId), ["elec-gfci", "roof-worn", "roof-debris"]);
  assert.equal(s.costLow, 8400);
  assert.equal(s.costHigh, 12800);
  assert.deepEqual(s.bySystem.map((g) => g.system), ["Roof", "Electrical"]);
  assert.deepEqual(s.bySystem[0].items.map((f) => f.libId), ["roof-worn", "roof-debris"]);
});

test("an empty report summarizes to zeros and no cost line", () => {
  const s = summarize([]);
  assert.equal(s.total, 0);
  assert.equal(s.hasCosts, false);
  assert.doesNotMatch(toText({}, []), /cost range/);
});

test("custom system lands in Other", () => {
  const s = summarize([newFinding(null, { title: "Pool", system: "Pool", severity: "info" })]);
  assert.equal(s.bySystem[0].system, "Other");
});

test("html output escapes user text; text output carries the disclaimer", () => {
  const f = newFinding(null, { title: "<img src=x onerror=alert(1)>", note: "</p><script>x</script>", system: "Roof" });
  const h = toHtml({ property: "<b>1 Main</b>" }, [f]);
  assert.doesNotMatch(h, /<img|<script|<b>/i);
  assert.match(h, /&lt;img/);
  assert.match(toText({}, [f]), /inspector is responsible/);
});

test("export then import round-trips; bad files are refused", () => {
  const header = { property: "1 Main St", client: "A", date: "2026-10-08", inspector: "B", license: "123" };
  const fs = [newFinding("roof-worn", { costLow: 1, costHigh: 2, note: "n" })];
  const back = parseImport(exportJson(header, fs));
  assert.deepEqual(back.header, { ...header, scope: "", notInspected: "" });
  assert.equal(back.findings[0].title, fs[0].title);
  assert.equal(back.findings[0].costHigh, 2);
  assert.ok(parseImport("nope").error);
  assert.ok(parseImport('{"app":"other","findings":[]}').error);
  assert.deepEqual(parseImport(JSON.stringify({ app: "home-inspection-report-builder", findings: [1, null, { title: "t", severity: "zzz" }] })).findings.map((f) => f.severity), ["info"]);
});

// Quality audit 2026-11-07 (portfolio/quality/audits/2026-11-07-home-inspection-report-builder.json, defect 0):
// the page promised a report with safety and major items first, but both renderers only grouped by system.
test("both reports open with every safety and major item, safety first, before the system sections", () => {
  const fs = [
    newFinding("roof-debris"),
    newFinding("roof-worn"),
    newFinding("elec-gfci"),
    newFinding(null, { title: "Loose pool fence", system: "Pool", severity: "safety" }),
  ];
  const s = summarize(fs);
  assert.deepEqual(s.priority.map((f) => f.severity), ["safety", "safety", "major"]);
  const t = toText({}, fs);
  const head = t.indexOf("SAFETY AND MAJOR ITEMS");
  assert.ok(head > 0 && head < t.indexOf("\nROOF"));
  const block = t.slice(head, t.indexOf("\nROOF")).trim().split("\n").slice(1);
  assert.equal(block.length, 3);
  assert.match(block[0], /^- \[Safety/);
  assert.match(block[2], /^- \[Major/);
  assert.ok(block.some((l) => /Loose pool fence \(Pool\)$/.test(l)));
  assert.ok(!block.some((l) => l.includes(fs[0].title)));
  const h = toHtml({}, fs);
  assert.ok(h.indexOf("Safety and major items") < h.indexOf("<h3>Roof</h3>"));
  assert.equal((h.match(/<ul class="priority">(.*?)<\/ul>/)[1].match(/<li>/g) || []).length, 3);
  assert.doesNotMatch(toText({}, [newFinding("roof-debris")]), /SAFETY AND MAJOR/);
});

// Quality audit 2026-11-07 (portfolio/quality/audits/2026-11-07-home-inspection-report-builder.json, defects 1, 2, 4).
test("a bad cost never becomes a plausible range, and every repair is reported", () => {
  const issues = [];
  const n = normalise({ title: "Roof", severity: "major", costLow: 300, costHigh: "abc" }, issues);
  assert.equal(n.costLow, 300); assert.equal(n.costHigh, 300);
  assert.equal(issues.length, 1); assert.match(issues[0], /"Roof": high cost "abc"/);
  assert.doesNotMatch(toText({}, [n]), /\$0 to \$300/);
  const blank = [];
  const b = normalise({ title: "Info", severity: "info", costLow: "", costHigh: 0 }, blank);
  assert.equal(b.costHigh, 0); assert.deepEqual(blank, [], "blank and zero costs are not problems");
});

test("severity is read by id or label in any case; an unknown one is flagged, not silently downgraded", () => {
  assert.equal(normalise({ title: "A", severity: "Safety" }).severity, "safety");
  assert.equal(normalise({ title: "A", severity: "safety hazard" }).severity, "safety");
  assert.equal(normalise({ title: "A", severity: " MAJOR " }).severity, "major");
  const issues = [];
  assert.equal(normalise({ title: "GFCI", severity: "urgent" }, issues).severity, "info");
  assert.equal(issues.length, 1); assert.match(issues[0], /"GFCI": severity "urgent"/);
});

test("num reads plain decimals only", () => {
  assert.ok(Number.isNaN(num("0x10")));
  assert.ok(Number.isNaN(num("1e3")));
  assert.equal(num("$1,200.50"), 1200.5);
  assert.equal(num(".5"), 0.5);
  assert.equal(num("-20"), -20);
});

test("parseImport returns warnings for repaired findings and for the 500 cap", () => {
  const f = (i, extra = {}) => ({ title: "T" + i, severity: "minor", ...extra });
  const ok = parseImport(JSON.stringify({ app: "home-inspection-report-builder", findings: [f(1)] }));
  assert.deepEqual(ok.warnings, []);
  const bad = parseImport(JSON.stringify({ app: "home-inspection-report-builder", findings: [f(1, { severity: "SAFTEY", costHigh: "x" })] }));
  assert.equal(bad.warnings.length, 2);
  const many = parseImport(JSON.stringify({ app: "home-inspection-report-builder", findings: Array.from({ length: 501 }, (_, i) => f(i)) }));
  assert.equal(many.findings.length, 500);
  assert.match(many.warnings[0], /501 findings; only the first 500/);
  const five = parseImport(JSON.stringify({ app: "home-inspection-report-builder", findings: Array.from({ length: 6 }, (_, i) => f(i)) }));
  assert.equal(five.findings.length, 6);
});

test("both reports carry a not-inspected record and the inspector's scope; saved files keep them", () => {
  const fs = [newFinding("elec-gfci")];
  const t = toText({}, fs);
  assert.match(t, /NOT INSPECTED OR RESTRICTED\nNone recorded by the inspector\./);
  assert.doesNotMatch(t, /SCOPE AND LIMITATIONS/);
  const hdr = { notInspected: "Roof: viewed from ground, wet.\nCrawlspace: not entered.", scope: "Visual, non-invasive, per <agreement>." };
  const t2 = toText(hdr, fs);
  assert.ok(t2.indexOf("NOT INSPECTED") < t2.indexOf("SAFETY AND MAJOR"), "the record comes before the findings");
  assert.match(t2, /SCOPE AND LIMITATIONS\nVisual, non-invasive/);
  const h = toHtml(hdr, fs);
  assert.match(h, /<h3>Not inspected or restricted<\/h3><p>Roof: viewed from ground, wet\.<br>Crawlspace: not entered\.<\/p>/);
  assert.match(h, /per &lt;agreement&gt;/);
  assert.match(h, /Limitations are set by the inspector&#39;s agreement/);
  const back = parseImport(exportJson(hdr, fs));
  assert.equal(back.header.notInspected, hdr.notInspected);
  assert.equal(back.header.scope, hdr.scope);
});

// Red team 2026-11-16: findings.map(normalise) handed normalise the array index as `issues`, so a
// bad cost on the second or later finding threw "issues.push is not a function" from summarize,
// toText and toHtml (the page's "Download text" button), and the first finding's was dropped silently.
test("a bad cost on any finding never crashes a report", () => {
  const fs = [
    { title: "GFCI", severity: "safety" },
    { title: "Gutter", severity: "minor", costLow: "-5", costHigh: "abc" },
    { title: "Flashing", severity: "urgent", costHigh: 400 },
  ];
  assert.equal(summarize(fs).total, 3);
  assert.match(toText({}, fs), /Gutter/);
  assert.match(toHtml({}, fs), /Flashing/);
  assert.doesNotThrow(() => normalise(fs[1], 1), "a non-array issues argument is ignored");
  const issues = [];
  normalise(fs[1], issues);
  assert.equal(issues.length, 2);
});

test("a single cost is used for both ends, whichever end it was entered in", () => {
  const hiOnly = normalise({ title: "Roof", severity: "major", costHigh: 300 });
  assert.equal(hiOnly.costLow, 300); assert.equal(hiOnly.costHigh, 300);
  assert.doesNotMatch(toText({}, [hiOnly]), /\$0 to \$300/);
  const loOnly = normalise({ title: "Roof", severity: "major", costLow: "250" });
  assert.equal(loOnly.costLow, 250); assert.equal(loOnly.costHigh, 250);
});

test("saved files carry format version 1; exactly 500 findings load with no cap warning", () => {
  assert.equal(JSON.parse(exportJson({}, [])).version, 1);
  const r = parseImport(JSON.stringify({ app: "home-inspection-report-builder", findings: Array.from({ length: 500 }, (_, i) => ({ title: "T" + i, severity: "minor" })) }));
  assert.equal(r.findings.length, 500);
  assert.deepEqual(r.warnings, []);
});
