import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { diffIds, compareValues, revisionImpact, revisionReport } from "./revision.mjs";
import { IdsValue, parseIds } from "./ids.mjs";
import { check, parseModel } from "./node.mjs";

const NS = "http://standards.buildingsmart.org/IDS";
const wrap = (specs, title = "t") =>
  `<?xml version="1.0"?>\n<ids xmlns="${NS}" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>${title}</title></info><specifications>\n${specs}\n</specifications></ids>\n`;
const ent = (cls) => `<entity><name><simpleValue>${cls}</simpleValue></name></entity>`;
const spec = (name, app, req, attrs = `ifcVersion="IFC4"`) =>
  `<specification name="${name}" ${attrs}><applicability minOccurs="1" maxOccurs="unbounded">${app}</applicability><requirements>${req}</requirements></specification>`;
const prop = (pset, name, value = "", attrs = "") =>
  `<property ${attrs}><propertySet><simpleValue>${pset}</simpleValue></propertySet><baseName><simpleValue>${name}</simpleValue></baseName>${value ? `<value>${value}</value>` : ""}</property>`;
const enumv = (...vs) => `<xs:restriction base="xs:string">${vs.map((v) => `<xs:enumeration value="${v}"/>`).join("")}</xs:restriction>`;
const range = (lo, hi) => `<xs:restriction base="xs:double"><xs:minInclusive value="${lo}"/><xs:maxInclusive value="${hi}"/></xs:restriction>`;

// A restriction value from its inner XML, through the real parser.
const val = (inner) => parseIds(wrap(spec("v", ent("IFCWALL"), `<attribute><name><simpleValue>Name</simpleValue></name><value>${inner}</value></attribute>`))).specs[0].requirements[0].value;

test("the same file twice: nothing changed", () => {
  const t = readFileSync(new URL("./samples/coordination-basics.ids.xml", import.meta.url), "utf8");
  const d = diffIds(t, t);
  assert.equal(d.summary.same, d.summary.oldSpecs);
  assert.equal(d.summary.changed + d.summary.added + d.summary.removed, 0);
  assert.deepEqual(d.info, []);
});

test("restrictions compare as sets where that is exact", () => {
  assert.equal(compareValues(val(enumv("EI30", "EI60")), val(enumv("EI60"))), "tighter");
  assert.equal(compareValues(val(enumv("EI60")), val(enumv("EI30", "EI60"))), "looser");
  assert.equal(compareValues(val(enumv("EI30", "EI60")), val(enumv("EI60", "EI30"))), "same");
  assert.equal(compareValues(val(enumv("A", "B")), val(enumv("B", "C"))), "changed");
  assert.equal(compareValues(val("<simpleValue>EI60</simpleValue>"), val(enumv("EI60", "EI90"))), "looser");
  assert.equal(compareValues(val(range(0, 10)), val(range(2, 8))), "tighter");
  assert.equal(compareValues(val(range(2, 8)), val(range(0, 10))), "looser");
  assert.equal(compareValues(val(range(0, 10)), val(range(5, 20))), "changed");
  assert.equal(compareValues(new IdsValue(null), val(enumv("A"))), "tighter");
  assert.equal(compareValues(val(enumv("A")), new IdsValue(null)), "looser");
  // Patterns compare as languages (pattern-lang.mjs): a narrower pattern asks more.
  const p = (x) => val(`<xs:restriction base="xs:string"><xs:pattern value="${x}"/></xs:restriction>`);
  assert.equal(compareValues(p("D-[0-9]+"), p("D-[0-9]{2}")), "tighter");
  assert.equal(compareValues(p("[0-9]{2}"), p("[0-9][0-9]")), "same");
  assert.equal(compareValues(p("EI[0-9]+"), p("REI[0-9]+")), "changed");
  assert.equal(compareValues(val(enumv("EI30", "EI60")), p("EI[0-9]{2}")), "looser");
  // A pattern on a numeric base is not a string language: still "changed".
  assert.equal(compareValues(val(`<xs:restriction base="xs:integer"><xs:pattern value="[0-9]+"/></xs:restriction>`), val(`<xs:restriction base="xs:integer"><xs:pattern value="[0-9]{2}"/></xs:restriction>`)), "changed");
  // A finite numeric list inside a range: the range lets more through.
  assert.equal(compareValues(val(enumv("30", "60")), val(range(0, 120))), "looser");
});

test("requirements: added, removed, cardinality and value, each with its effect", () => {
  const a = wrap(spec("Walls", ent("IFCWALL"), prop("Pset_WallCommon", "FireRating", enumv("EI30", "EI60"), `cardinality="optional"`) + prop("Pset_WallCommon", "AcousticRating")));
  const b = wrap(spec("Walls", ent("IFCWALL"), prop("Pset_WallCommon", "FireRating", enumv("EI60")) + prop("Pset_WallCommon", "IsExternal", "", `dataType="IFCBOOLEAN"`)));
  const d = diffIds(a, b);
  const s = d.specs[0];
  assert.equal(s.status, "changed");
  const by = (kind, key) => s.changes.find((c) => c.kind === kind && (!key || c.key.includes(key)));
  assert.equal(by("cardinality").effect, "tighter");
  assert.equal(by("value", "FireRating").effect, "tighter");
  assert.equal(by("removed", "AcousticRating").effect, "looser");
  assert.equal(by("added", "IsExternal").effect, "tighter");
  assert.equal(s.effect, "mixed");
  assert.equal(d.summary.mixed, 1);
});

test("applicability: a new condition selects fewer elements (looser), a removed one more (tighter)", () => {
  const cond = prop("Pset_WallCommon", "LoadBearing", "<simpleValue>TRUE</simpleValue>", `dataType="IFCBOOLEAN"`);
  const req = prop("Pset_WallCommon", "FireRating");
  const plain = wrap(spec("Fire", ent("IFCWALL"), req));
  const narrow = wrap(spec("Fire", ent("IFCWALL") + cond, req));
  assert.equal(diffIds(plain, narrow).specs[0].effect, "looser");
  assert.equal(diffIds(narrow, plain).specs[0].effect, "tighter");
  // More classes selected asks more of the model.
  const two = wrap(spec("Fire", `<entity><name>${enumv("IFCWALL", "IFCSLAB")}</name></entity>`, req));
  assert.equal(diffIds(plain, two).specs[0].effect, "tighter");
  // Another class altogether.
  const slab = wrap(spec("Fire", ent("IFCSLAB"), req));
  assert.equal(diffIds(plain, slab).specs[0].changes.find((c) => c.kind === "name").effect, "changed");
});

test("a prohibited facet listing fewer values forbids less", () => {
  const p = (...vs) => wrap(spec("No proxies", ent("IFCWALL"), `<attribute cardinality="prohibited"><name><simpleValue>Name</simpleValue></name><value>${enumv(...vs)}</value></attribute>`));
  assert.equal(diffIds(p("X", "Y"), p("X")).specs[0].effect, "looser");
  assert.equal(diffIds(p("X"), p("X", "Y")).specs[0].effect, "tighter");
});

test("specifications pair by name, then by identical applicability (a rename), then by section number", () => {
  const req = prop("Pset_WallCommon", "IsExternal");
  const a = wrap(spec("Old wall name", ent("IFCWALL"), req) + spec("(3.3) Storeys", ent("IFCBUILDINGSTOREY"), `<attribute><name><simpleValue>Name</simpleValue></name></attribute>`) + spec("Gone", ent("IFCROOF"), req));
  const b = wrap(spec("New wall name", ent("IFCWALL"), req) + spec("3.3 Storey names", ent("IFCBUILDINGSTOREY"), `<attribute><name><simpleValue>LongName</simpleValue></name></attribute>`) + spec("Fresh", ent("IFCSLAB"), req));
  const d = diffIds(a, b);
  const st = (n) => d.specs.find((s) => s.name === n);
  assert.equal(st("New wall name").oldName, "Old wall name");
  assert.equal(st("New wall name").effect, "metadata");
  assert.equal(st("3.3 Storey names").oldName, "(3.3) Storeys");
  assert.equal(st("Fresh").status, "added");
  assert.equal(st("Gone").status, "removed");
  assert.equal(d.summary.renamed, 2);
  assert.match(revisionReport(d), /\+ Fresh[\s\S]*- Gone[\s\S]*~ New wall name \(was "Old wall name"\)/);
});

test("optionality and data type changes", () => {
  const a = wrap(spec("S", ent("IFCWALL"), prop("Pset_WallCommon", "IsExternal")).replace('minOccurs="1"', 'minOccurs="0"'));
  const b = wrap(spec("S", ent("IFCWALL"), prop("Pset_WallCommon", "IsExternal", "", `dataType="IFCBOOLEAN"`)));
  const s = diffIds(a, b).specs[0];
  assert.equal(s.changes.find((c) => c.kind === "optionality").effect, "tighter");
  assert.equal(s.changes.find((c) => c.kind === "dataType").effect, "tighter");
  assert.equal(s.effect, "tighter");
});

test("on a model: newly failing elements, more to fix, fixed, and invalid sides not compared", () => {
  const model = parseModel(readFileSync(new URL("./samples/tiny-house.ifc", import.meta.url)));
  const name = (v) => `<attribute><name><simpleValue>Name</simpleValue></name><value>${v}</value></attribute>`;
  const pat = (p) => `<xs:restriction base="xs:string"><xs:pattern value="${p}"/></xs:restriction>`;
  const oldT = wrap(spec("Doors named", ent("IFCDOOR"), name(pat("D-.*"))) + spec("Walls external", ent("IFCWALL"), prop("Pset_WallCommon", "IsExternal")));
  // The door D-01 now fails a stricter pattern; walls now also need LoadBearing (W-02 lacks it).
  const newT = wrap(spec("Doors named", ent("IFCDOOR"), name(pat("D-[0-9]{3}"))) + spec("Walls external", ent("IFCWALL"), prop("Pset_WallCommon", "IsExternal") + prop("Pset_WallCommon", "LoadBearing")));
  const d = diffIds(oldT, newT);
  // The pattern edit is graded, with a value that used to pass.
  const pc = d.specs.find((x) => x.name === "Doors named").changes.find((c) => c.kind === "value");
  assert.equal(pc.effect, "tighter");
  assert.equal(pc.nowFails, "D-");
  assert.match(pc.what, /"D-" matched before, not now/);
  const imp = revisionImpact(check(parseIds(oldT), model), check(parseIds(newT), model), d);
  const door = imp.specs.find((r) => r.name === "Doors named");
  assert.deepEqual(door.newlyFailing.map((e) => e.name), ["D-01"]);
  const walls = imp.specs.find((r) => r.name === "Walls external");
  assert.deepEqual(walls.newlyFailing.map((e) => e.name), ["W-02"]);
  assert.equal(imp.newlyFailing, 2);
  assert.equal(imp.passBefore, true);
  assert.equal(imp.passAfter, false);
  // Reversed: the same elements are fixed.
  const back = revisionImpact(check(parseIds(newT), model), check(parseIds(oldT), model), diffIds(newT, oldT));
  assert.equal(back.fixed, 2);
  // Already failing, one more reason: more to fix, not newly failing.
  const t3 = wrap(spec("Doors named", ent("IFCDOOR"), name(pat("D-[0-9]{3}")) + `<attribute><name><simpleValue>Description</simpleValue></name></attribute>`) + spec("Walls external", ent("IFCWALL"), prop("Pset_WallCommon", "IsExternal") + prop("Pset_WallCommon", "LoadBearing")));
  const more = revisionImpact(check(parseIds(newT), model), check(parseIds(t3), model), diffIds(newT, t3));
  assert.equal(more.newlyFailing, 0);
  assert.equal(more.moreToFix, 1);
  // A new side that is invalid IDS (a non-XSD pattern) is not run: nothing counted as fixed.
  const bad = wrap(spec("Doors named", ent("IFCDOOR"), name(pat("(?:D)-[0-9]{3}"))) + spec("Walls external", ent("IFCWALL"), prop("Pset_WallCommon", "IsExternal") + prop("Pset_WallCommon", "LoadBearing")));
  const inv = revisionImpact(check(parseIds(newT), model), check(parseIds(bad), model), diffIds(newT, bad));
  assert.equal(inv.fixed, 0);
  assert.equal(inv.notCompared, 1);
  assert.match(revisionReport(diffIds(newT, bad), inv), /invalid, so elements are not compared/);
});
