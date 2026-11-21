// Activity codes as Microsoft Project outline codes (msproject.mjs
// { outlineCodes: true }), read back by mspdi.mjs and written to XER by p6xer.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { parseMspdi, parseXml } from "./mspdi.mjs";
import { mspdiText, outlineCodeFields, guidOf, TASK_OUTLINE_IDS } from "./msproject.mjs";
import { p6XerText } from "./p6xer.mjs";
import { EXAMPLE_XER } from "./example.mjs";

function withCodes(types) {
  const x = parseXer(EXAMPLE_XER);
  const T = x.tables;
  T.ACTVTYPE = []; T.ACTVCODE = []; T.TASKACTV = [];
  types.forEach((ty, k) => {
    const tid = `T${k + 1}`;
    T.ACTVTYPE.push({ actv_code_type_id: tid, actv_code_type: ty.name, actv_code_type_scope: "AS_Global", seq_num: String(k), proj_id: "" });
    ty.codes.forEach((c, j) => T.ACTVCODE.push({ actv_code_id: `${tid}-${c.id}`, actv_code_type_id: tid, short_name: c.code, actv_code_name: c.name || "", parent_actv_code_id: c.parent ? `${tid}-${c.parent}` : "", seq_num: String(c.seq ?? j) }));
    T.TASK.forEach((t, i) => { const c = ty.pick(i); if (c) T.TASKACTV.push({ task_id: t.task_id, actv_code_type_id: tid, actv_code_id: `${tid}-${c}`, proj_id: t.proj_id }); });
  });
  return x;
}
const AREA = { name: "Area", codes: [{ id: "a", code: "A", name: "Area A" }, { id: "b", code: "B", name: "Area B" }, { id: "a1", code: "001", name: "Room 1", parent: "a" }, { id: "b1", code: "001", name: "Room 1 east", parent: "b" }, { id: "u", code: "UNUSED", name: "Never assigned" }], pick: (i) => (i % 3 === 0 ? "a1" : i % 3 === 1 ? "b1" : "a") };
const chain = (B, id) => { const m = new Map(B.ACTVCODE.map((c) => [c.actv_code_id, c])); const p = []; for (let x = m.get(id); x; x = m.get(x.parent_actv_code_id)) p.unshift(x.short_name); return p.join(">"); };

test("Project's outline code field IDs and fixed GUIDs", () => {
  assert.deepEqual(TASK_OUTLINE_IDS.slice(0, 3), ["188744096", "188744098", "188744100"]);
  assert.equal(TASK_OUTLINE_IDS[9], "188744114");
  assert.match(guidOf("a", 1), /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/);
  assert.equal(guidOf("a", 1), guidOf("a", 1));
  assert.notEqual(guidOf("a", 1), guidOf("a", 2));
});

test("a code tree becomes an outline code with its lookup table, and reads back as the tree", () => {
  const x = withCodes([AREA]);
  const r = mspdiText(x, { outlineCodes: true });
  assert.equal(r.counts.outlineCodeTypes, 1);
  assert.equal(r.counts.codeTypes, 0);
  assert.equal(r.counts.outlineCodeValues, 5); // the whole dictionary, the unused value too
  const doc = parseXml(r.xml);
  assert.ok(doc, "well formed");
  assert.match(r.xml, /<ExtendedAttribute><FieldID>188744096<\/FieldID><FieldName>Outline Code1<\/FieldName><Alias>Area<\/Alias><Ltuid>[0-9A-F-]{36}<\/Ltuid>/);
  assert.match(r.xml, /<Masks><Mask><Level>1<\/Level><Type>3<\/Type><Length>0<\/Length><Separator>\.<\/Separator><\/Mask><Mask><Level>2<\/Level>/);
  // both task forms, and the OutlineCode after the Baseline
  const t0 = r.taskUid.get(x.tables.TASK[0].task_id);
  const task = r.xml.match(new RegExp(`<Task><UID>${t0}</UID>[\\s\\S]*?</Task>`))[0];
  assert.match(task, /<ExtendedAttribute><FieldID>188744096<\/FieldID><Value>A\.001<\/Value><ValueGUID>/);
  assert.match(task, /<OutlineCode><FieldID>188744096<\/FieldID><ValueID>\d+<\/ValueID><\/OutlineCode><\/Task>$/);
  const B = parseMspdi(r.xml).tables;
  assert.deepEqual(B.ACTVTYPE.map((t) => t.actv_code_type), ["Area"]);
  assert.equal(B.ACTVCODE.length, 5);
  const desc = Object.fromEntries(B.ACTVCODE.map((c) => [chain(B, c.actv_code_id), c.actv_code_name]));
  assert.deepEqual(desc, { A: "Area A", "A>001": "Room 1", B: "Area B", "B>001": "Room 1 east", UNUSED: "Never assigned" });
  const byTask = new Map(B.TASKACTV.map((a) => [a.task_id, chain(B, a.actv_code_id)]));
  x.tables.TASK.forEach((t, i) => assert.equal(byTask.get(String(r.taskUid.get(t.task_id))), ["A>001", "B>001", "A"][i % 3]));
});

test("each task form reads back on its own, and by path when there is no GUID", () => {
  const x = withCodes([AREA]);
  const r = mspdiText(x, { outlineCodes: true });
  const forms = {
    only2003: r.xml.replace(/<ExtendedAttribute><FieldID>188744096<\/FieldID><Value>[^<]*<\/Value><ValueGUID>[^<]*<\/ValueGUID><\/ExtendedAttribute>/g, ""),
    only2007: r.xml.replace(/<OutlineCode><FieldID>\d+<\/FieldID><ValueID>\d+<\/ValueID><\/OutlineCode>/g, ""),
    pathOnly: r.xml.replace(/<OutlineCode><FieldID>\d+<\/FieldID><ValueID>\d+<\/ValueID><\/OutlineCode>/g, "").replace(/<ValueGUID>[^<]*<\/ValueGUID>/g, ""),
  };
  for (const [k, xml] of Object.entries(forms)) {
    const B = parseMspdi(xml).tables;
    const byTask = new Map(B.TASKACTV.map((a) => [a.task_id, chain(B, a.actv_code_id)]));
    x.tables.TASK.forEach((t, i) => assert.equal(byTask.get(String(r.taskUid.get(t.task_id))), ["A>001", "B>001", "A"][i % 3], k));
  }
});

test("a value not in the lookup table reads as a flat code, and is named", () => {
  const x = withCodes([AREA]);
  const r = mspdiText(x, { outlineCodes: true });
  const xml = r.xml.replace(/<OutlineCode><FieldID>\d+<\/FieldID><ValueID>\d+<\/ValueID><\/OutlineCode>/g, "").replace(/<ValueGUID>[^<]*<\/ValueGUID>/g, "").replace(/<Value>A\.001<\/Value>/g, "<Value>C.9</Value>");
  const back = parseMspdi(xml);
  assert.ok(back.tables.ACTVCODE.some((c) => c.short_name === "C.9" && !c.parent_actv_code_id));
  assert.ok(back.warnings.some((w) => /not in their field's lookup table/.test(w)));
});

test("a separator inside a code moves the type to the next separator Project offers", () => {
  const x = withCodes([{ name: "Zone", codes: [{ id: "p", code: "L1.2" }, { id: "c", code: "N", parent: "p" }], pick: () => "c" }]);
  const r = mspdiText(x, { outlineCodes: true });
  assert.equal(r.outlineFields.fields[0].sep, "-");
  assert.match(r.xml, /<Value>L1\.2-N<\/Value>/);
  const B = parseMspdi(r.xml.replace(/<OutlineCode><FieldID>\d+<\/FieldID><ValueID>\d+<\/ValueID><\/OutlineCode>/g, "").replace(/<ValueGUID>[^<]*<\/ValueGUID>/g, "")).tables;
  assert.deepEqual([...new Set(B.TASKACTV.map((a) => chain(B, a.actv_code_id)))], ["L1.2>N"]);
});

test("a parent loop is cut, not followed for ever", () => {
  const x = withCodes([{ name: "Loop", codes: [{ id: "a", code: "A", parent: "b" }, { id: "b", code: "B", parent: "a" }, { id: "c", code: "C", parent: "c" }], pick: (i) => ["a", "b", "c"][i % 3] }]);
  const f = outlineCodeFields(x.tables, new Map(x.tables.TASK.map((t) => [t.task_id, t])));
  assert.equal(f.fields[0].items.length, 3);
  assert.ok(f.warnings.some((w) => /loops back/.test(w)));
  const r = mspdiText(x, { outlineCodes: true });
  assert.equal(parseMspdi(r.xml).tables.ACTVCODE.length, 3);
});

test("past 10 code types the most assigned are outline codes and the rest text fields", () => {
  const types = Array.from({ length: 12 }, (_, k) => ({ name: `Code ${k + 1}`, codes: [{ id: "v", code: "V" }], pick: (i) => (k < 2 ? (i === 0 ? "v" : null) : "v") }));
  const x = withCodes(types);
  const r = mspdiText(x, { outlineCodes: true });
  assert.equal(r.counts.outlineCodeTypes, 10);
  assert.equal(r.counts.codeTypes, 2);
  assert.deepEqual(r.codeFields.fields.map((f) => f.alias), ["Code 1", "Code 2"]);
  assert.ok(r.warnings.some((w) => /the 10 most assigned are outline codes/.test(w)));
  const back = parseMspdi(r.xml).tables;
  assert.equal(back.ACTVTYPE.length, 12);
  assert.equal(new Set(back.ACTVTYPE.map((t) => t.actv_code_type)).size, 12);
});

test("a name shared by an outline code and a text field stays apart", () => {
  const types = Array.from({ length: 11 }, (_, k) => ({ name: k === 10 || k === 9 ? "Phase" : `Code ${k + 1}`, codes: [{ id: "v", code: "V" }], pick: (i) => (k === 10 ? (i === 0 ? "v" : null) : "v") }));
  const r = mspdiText(withCodes(types), { outlineCodes: true });
  const aliases = [...r.xml.matchAll(/<Alias>([^<]*)<\/Alias>/g)].map((m) => m[1]);
  assert.ok(aliases.includes("Phase"));
  assert.ok(aliases.includes("Phase (T11)"));
});

test("without the option the codes stay text fields, as before", () => {
  const r = mspdiText(withCodes([AREA]));
  assert.equal(r.counts.outlineCodeTypes, 0);
  assert.ok(!/<OutlineCodes>/.test(r.xml));
  assert.equal(r.counts.codeTypes, 1);
});

test("Project XML to XER keeps the outline code's tree", () => {
  const x = withCodes([AREA]);
  const r = mspdiText(x, { outlineCodes: true });
  const back = p6XerText(r.xml);
  const y = parseXer(back.text).tables;
  const byName = new Map(y.ACTVCODE.map((c) => [chain(y, c.actv_code_id), c]));
  assert.deepEqual([...byName.keys()].sort(), ["A", "A>001", "B", "B>001", "UNUSED"]);
  assert.equal(byName.get("B>001").actv_code_name, "Room 1 east");
  assert.ok(back.warnings.some((w) => /keep the hierarchy of their outline code/.test(w)));
  const n = (p) => y.TASKACTV.filter((a) => chain(y, a.actv_code_id) === p).length;
  assert.equal(n("A>001") + n("B>001") + n("A"), x.tables.TASK.length);
});
