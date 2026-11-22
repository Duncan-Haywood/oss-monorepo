// P6's resource hierarchy (RSRC.parent_rsrc_id) <-> Microsoft Project's
// resource Group, a "/" path of parent resource IDs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { mspdiText } from "./msproject.mjs";
import { p6XerText, p6Problems } from "./p6xer.mjs";
import { EXAMPLE_XER } from "./example.mjs";

// the example's two resources, filed under LAB > TRADES (neither parent assigned)
function tree() {
  const x = parseXer(EXAMPLE_XER);
  const R = x.tables.RSRC;
  const base = R[0];
  const mk = (id, short, name, parent) => ({ ...base, rsrc_id: id, rsrc_short_name: short, rsrc_name: name, parent_rsrc_id: parent, rsrc_notes: "" });
  R.unshift(mk("900", "LAB", "Labour", ""), mk("901", "TRADES", "Trades", "900"));
  for (const r of R.slice(2)) r.parent_rsrc_id = "901";
  return x;
}
const groups = (xml) => (xml.match(/<Resource>[^]*?<\/Resource>/g) || [])
  .map((s) => [/<Initials>([^<]*)/.exec(s)?.[1], /<Group>([^<]*)/.exec(s)?.[1] ?? ""]);

test("XER resource tree -> Project Group paths; unassigned parents are not written by default", () => {
  const x = tree();
  const r = mspdiText(x);
  const g = groups(r.xml);
  assert.deepEqual(g, x.tables.RSRC.slice(2).map((q) => [q.rsrc_short_name, "LAB/TRADES"]));
  assert.equal(r.counts.rsrcGroups, 2);
  assert.ok(r.warnings.some((w) => /2 resource\(s\) carry P6's resource hierarchy as their Group/.test(w)));
  // Group sits after Initials and before CalendarUID (Project's schema order)
  const res = r.xml.slice(r.xml.indexOf("<Resource>"), r.xml.indexOf("</Resource>"));
  assert.ok(res.indexOf("<Initials>") < res.indexOf("<Group>"));
  if (res.includes("<CalendarUID>")) assert.ok(res.indexOf("<Group>") < res.indexOf("<CalendarUID>"));
});

test("Project Group -> XER parent resources, and the tree survives XER -> Project -> XER", () => {
  for (const allResources of [false, true]) {
    const x = tree();
    const back = p6XerText(mspdiText(x, { allResources }).xml);
    assert.deepEqual(p6Problems(back.xer.tables), []);
    const R = parseXer(back.text).tables.RSRC;
    const by = new Map(R.map((q) => [q.rsrc_id, q]));
    const path = (q) => { const p = []; for (let c = by.get(q.parent_rsrc_id); c; c = by.get(c.parent_rsrc_id)) p.unshift(c.rsrc_short_name); return p.join("/"); };
    for (const q of x.tables.RSRC.slice(2)) assert.equal(path(R.find((y) => y.rsrc_short_name === q.rsrc_short_name)), "LAB/TRADES");
    assert.equal(R.filter((q) => q.rsrc_short_name === "LAB").length, 1);
    // with every resource written the parents keep their names; by default
    // they come back named by their IDs
    assert.equal(R.find((q) => q.rsrc_short_name === "LAB").rsrc_name, allResources ? "Labour" : "LAB");
    assert.equal(back.counts.parentResources, allResources ? 0 : 2);
    // parents come before their children
    const at = new Map(R.map((q, i) => [q.rsrc_id, i]));
    for (const q of R) if (q.parent_rsrc_id) assert.ok(at.get(q.parent_rsrc_id) < at.get(q.rsrc_id));
  }
});

const WEEK = [1, 7].map((d) => `<WeekDay><DayType>${d}</DayType><DayWorking>0</DayWorking></WeekDay>`).join("") +
  [2, 3, 4, 5, 6].map((d) => `<WeekDay><DayType>${d}</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>`).join("");
const projectXml = (resources) => `<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project"><Name>N</Name><StartDate>2026-03-02T08:00:00</StartDate><CalendarUID>1</CalendarUID><Calendars><Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${WEEK}</WeekDays></Calendar></Calendars><Tasks><Task><UID>0</UID><ID>0</ID><Name>N</Name><OutlineLevel>0</OutlineLevel><Summary>1</Summary></Task><Task><UID>1</UID><ID>1</ID><Name>Dig</Name><OutlineLevel>1</OutlineLevel><Start>2026-03-02T08:00:00</Start><Duration>PT16H0M0S</Duration></Task></Tasks><Resources>${resources}</Resources><Assignments><Assignment><UID>1</UID><TaskUID>1</TaskUID><ResourceUID>1</ResourceUID><Units>1</Units></Assignment></Assignments></Project>`;

test("a plain Project Group becomes one parent resource shared by its members; cost resources keep Group as the cost category", () => {
  const out = p6XerText(projectXml(
    `<Resource><UID>1</UID><ID>1</ID><Name>Electrician</Name><Type>1</Type><Initials>EL</Initials><Group>Electrical</Group></Resource>` +
    `<Resource><UID>2</UID><ID>2</ID><Name>Apprentice</Name><Type>1</Type><Initials>AP</Initials><Group> Electrical </Group></Resource>` +
    `<Resource><UID>3</UID><ID>3</ID><Name>Cable</Name><Type>0</Type><Initials>CB</Initials></Resource>` +
    `<Resource><UID>4</UID><ID>4</ID><Name>Skip hire</Name><Type>2</Type><Group>Plant</Group></Resource>`));
  assert.deepEqual(p6Problems(out.xer.tables), []);
  const R = out.xer.tables.RSRC;
  const parent = R.find((q) => q.rsrc_short_name === "Electrical");
  assert.ok(parent && parent.rsrc_type === "RT_Labor" && parent.rsrc_name === "Electrical");
  assert.equal(R.find((q) => q.rsrc_short_name === "EL").parent_rsrc_id, parent.rsrc_id);
  assert.equal(R.find((q) => q.rsrc_short_name === "AP").parent_rsrc_id, parent.rsrc_id);
  assert.equal(R.find((q) => q.rsrc_short_name === "CB").parent_rsrc_id, "");
  assert.ok(!R.some((q) => q.rsrc_short_name === "Plant"));
  assert.equal(out.counts.rsrcGroups, 2);
  assert.ok(out.warnings.some((w) => /2 resource\(s\) filed under parent resources.*1 parent resource\(s\) added/.test(w)));
});

test("Groups that would make a loop are not linked, and the import check catches a looped tree", () => {
  const out = p6XerText(projectXml(
    `<Resource><UID>1</UID><ID>1</ID><Name>A</Name><Type>1</Type><Initials>A</Initials><Group>B</Group></Resource>` +
    `<Resource><UID>2</UID><ID>2</ID><Name>B</Name><Type>1</Type><Initials>B</Initials><Group>A</Group></Resource>` +
    `<Resource><UID>3</UID><ID>3</ID><Name>C</Name><Type>1</Type><Initials>C</Initials><Group>C</Group></Resource>`));
  assert.deepEqual(p6Problems(out.xer.tables), []);
  assert.equal(out.counts.parentResources, 0);
  const R = out.xer.tables.RSRC;
  assert.equal(R.find((q) => q.rsrc_short_name === "C").parent_rsrc_id, "");
  assert.equal(R.filter((q) => q.parent_rsrc_id).length, 1);
  assert.ok(out.warnings.some((w) => /1 link\(s\) left out that would have made a loop/.test(w)));
  const T = structuredClone(out.xer.tables);
  const [a, b] = T.RSRC;
  a.parent_rsrc_id = b.rsrc_id; b.parent_rsrc_id = a.rsrc_id;
  assert.ok(p6Problems(T).some((p) => /resource hierarchy loops/.test(p)));
});

test("a file with no hierarchy writes no Group and the XER back has no parents", () => {
  const r = mspdiText(parseXer(EXAMPLE_XER));
  assert.ok(!r.xml.includes("<Group>"));
  assert.equal(r.counts.rsrcGroups, 0);
  const back = p6XerText(r.xml);
  assert.ok(back.xer.tables.RSRC.every((q) => q.parent_rsrc_id === ""));
  assert.ok(!back.warnings.some((w) => /parent resources/.test(w)));
});
