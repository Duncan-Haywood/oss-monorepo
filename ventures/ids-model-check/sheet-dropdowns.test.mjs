// The downloaded workbook's dropdown lists (sheet.mjs rowsToXlsx, sheetLists).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { idsToRows, rowsToXlsx, xlsxToRows, rowsToIds, canonicalIds, sheetLists, sheetVersions } from "./sheet.mjs";
import { zipEntries, readEntry } from "./zip.mjs";

const inflate = (b) => inflateRawSync(b);
const load = (f) => JSON.parse(readFileSync(new URL("./schema/" + f, import.meta.url), "utf8"));
const ids = readFileSync(new URL("./samples/coordination-basics.ids.xml", import.meta.url), "utf8");
const part = async (bytes, name) => new TextDecoder().decode(await readEntry(bytes, zipEntries(bytes).find((e) => e.name === name), inflate));

test("sheetLists: concrete classes, set names, non-select data types", () => {
  const l = sheetLists({ schemas: [load("ifc4.json")], psets: [load("psets-ifc4.json")] });
  assert.ok(l.entity.includes("IFCWALL"));
  assert.ok(!l.entity.includes("IFCBUILDINGELEMENT"), "abstract classes left out");
  assert.ok(l.propertySet.includes("Pset_WallCommon"));
  assert.ok(l.dataType.includes("IFCLABEL") && l.dataType.includes("IFCLENGTHMEASURE"));
  assert.ok(!l.dataType.includes("IFCVALUE"), "selects left out");
  assert.deepEqual(l.entity, [...new Set(l.entity)].sort());
});

test("sheetVersions: the versions the rows name, all three when none", () => {
  const h = ["spec", "section", "ifcVersion"];
  assert.deepEqual(sheetVersions([h, ["1", "specification", "IFC4 IFC4X3_ADD2"]]), ["IFC4", "IFC4X3"]);
  assert.deepEqual(sheetVersions([h, ["1", "specification", ""]]), ["IFC2X3", "IFC4", "IFC4X3"]);
});

test("rowsToXlsx: dropdowns on the IDS sheet, a hidden Lists sheet, names for each list", async () => {
  const rows = idsToRows(ids);
  const x = rowsToXlsx(rows, { lists: sheetLists({ schemas: [load("ifc4.json")], psets: [load("psets-ifc4.json")] }) });
  const wb = await part(x, "xl/workbook.xml");
  assert.match(wb, /<sheet name="Lists" sheetId="3" state="hidden"/);
  for (const n of ["section", "facet", "cardinality", "relation", "ifcVersion", "entity", "propertySet", "dataType"]) assert.match(wb, new RegExp(`<definedName name="ids_${n}">Lists!`));
  const s1 = await part(x, "xl/worksheets/sheet1.xml");
  const dv = [...s1.matchAll(/<dataValidation [^>]*>/g)].map((m) => m[0]);
  assert.equal(dv.length, 8);
  const by = (col) => dv.find((d) => d.includes(`promptTitle="${col}`));
  assert.ok(!/errorStyle/.test(by("section")) && /showErrorMessage="1"/.test(by("section")), "section refuses another word");
  assert.match(by("cardinality"), /errorStyle="warning"/);
  assert.match(by("entity"), /showErrorMessage="0"/, "entity only suggests: restrictions stay possible");
  assert.match(by("section"), /sqref="B2:B1048576"/);
  // dataValidations sits after sheetData, as the schema orders it.
  assert.ok(s1.indexOf("<dataValidations") > s1.indexOf("</sheetData>"));
});

test("the IDS still comes back the same from a workbook with dropdowns", async () => {
  const rows = idsToRows(ids);
  const back = rowsToIds(await xlsxToRows(rowsToXlsx(rows, { lists: sheetLists({ schemas: [load("ifc4x3.json")], psets: [load("psets-ifc4x3.json")] }) }), inflate));
  assert.equal(canonicalIds(back.text), canonicalIds(ids));
  // Without schema lists, the fixed IDS words still get theirs.
  const s1 = await part(rowsToXlsx(rows), "xl/worksheets/sheet1.xml");
  assert.equal([...s1.matchAll(/<dataValidation /g)].length, 5);
});

test("Excel's limits: prompt titles <= 32 and texts <= 255 characters", async () => {
  const s1 = await part(rowsToXlsx(idsToRows(ids)), "xl/worksheets/sheet1.xml");
  const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  for (const [, k, v] of s1.matchAll(/ (promptTitle|errorTitle|prompt|error)="([^"]*)"/g)) assert.ok(unesc(v).length <= (/Title/.test(k) ? 32 : 255), `${k}: ${v}`);
});
