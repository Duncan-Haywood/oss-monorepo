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
  assert.equal(n.costLow, 0);
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
  assert.doesNotMatch(h, /<img|<script|<b>/);
  assert.match(h, /&lt;img/);
  assert.match(toText({}, [f]), /inspector is responsible/);
});

test("export then import round-trips; bad files are refused", () => {
  const header = { property: "1 Main St", client: "A", date: "2026-10-08", inspector: "B", license: "123" };
  const fs = [newFinding("roof-worn", { costLow: 1, costHigh: 2, note: "n" })];
  const back = parseImport(exportJson(header, fs));
  assert.deepEqual(back.header, header);
  assert.equal(back.findings[0].title, fs[0].title);
  assert.equal(back.findings[0].costHigh, 2);
  assert.ok(parseImport("nope").error);
  assert.ok(parseImport('{"app":"other","findings":[]}').error);
  assert.deepEqual(parseImport(JSON.stringify({ app: "home-inspection-report-builder", findings: [1, null, { title: "t", severity: "zzz" }] })).findings.map((f) => f.severity), ["info"]);
});
