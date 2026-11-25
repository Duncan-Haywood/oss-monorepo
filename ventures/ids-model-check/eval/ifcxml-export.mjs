// Checks ifcxml-writer.mjs (cli.mjs --to-ifcxml) on real STEP files: each is
// written as ifcXML, validated with xmllint against buildingSMART's XSD for
// its schema (when --xsd-dir is given), and read back by ifcxml.mjs; every
// entity's arguments are compared with the STEP reader's. Sets (a
// relationship's RelatedObjects, rebuilt from the objects it sits under) are
// compared as sets; binary values as their bytes. eval/ifcxml-export-2026-11-24.md.
//
//   sh eval/fetch-ifcxml-xsd.sh            # the two XSDs, not committed
//   node eval/ifcxml-export.mjs --xsd-dir eval/xsd FILE.ifc ... [--json]
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { parseStep } from "../step.mjs";
import { parseIfcXml } from "../ifcxml.mjs";
import { writeIfcXml, ifcXmlSchemaFor, ifcXmlTarget } from "../ifcxml-writer.mjs";

const XSD = { IFC4: "IFC4_ADD2.xsd", IFC4X3: "IFC4X3_ADD2.xsd" };

function norm(v, idOf, set) {
  if (Array.isArray(v)) {
    const l = v.map((x) => norm(x, idOf, false));
    return set ? l.map((x) => JSON.stringify(x)).sort() : l;
  }
  if (v && typeof v === "object") {
    if (v.ref !== undefined) return { ref: idOf(v.ref) };
    if (v.typed) return { typed: v.typed, value: norm(v.value, idOf, false) };
    if (v.derived) return { derived: true };
    // STEP's BINARY carries a leading unused-bits digit, xs:hexBinary not:
    // compared as the bytes.
    if (v.binary !== undefined) { const h = String(v.binary).toUpperCase(); return { binary: /^[0-3]/.test(h) && h.length % 2 ? h.slice(1) : h }; }
  }
  return v;
}

export function compare(step, schema, xml) {
  const x = parseIfcXml(xml, schema, { eager: true });
  const byXml = new Map();
  for (const e of x.entities.values()) if (e.xmlId) byXml.set(e.xmlId, e);
  const stepOf = new Map();
  for (const e of x.entities.values()) stepOf.set(e.id, e.xmlId ? Number(e.xmlId.slice(1)) : -e.id);
  let same = 0, differ = 0, missing = 0;
  const differByType = {};
  const examples = [];
  for (const e of step.entities.values()) {
    if (!schema.entities[e.type]) continue;
    const r = byXml.get("i" + e.id);
    if (!r) { missing++; continue; }
    const attrs = schema.attrs(e.type);
    const isSet = (i) => attrs[i] && attrs[i].aggregate && !attrs[i].inner && /^Related|^Relating/.test(attrs[i].name);
    const a = JSON.stringify(e.args.map((v, i) => norm(v, (n) => n, isSet(i))));
    const b = JSON.stringify(r.args.map((v, i) => norm(v, (n) => stepOf.get(n), isSet(i))));
    if (a === b && r.type === e.type) same++;
    else {
      differ++;
      differByType[e.type] = (differByType[e.type] || 0) + 1;
      if (examples.length < 3) examples.push({ id: e.id, type: e.type, step: a.slice(0, 240), xml: b.slice(0, 240) });
    }
  }
  return { same, differ, missing, differByType, readErrors: x.errors.slice(0, 3), examples };
}

function validate(xsd, xml) {
  const dir = mkdtempSync(join(tmpdir(), "ifcxml-export-"));
  const f = join(dir, "m.ifcxml");
  writeFileSync(f, xml);
  try {
    execFileSync("xmllint", ["--noout", "--huge", "--stream", "--schema", xsd, f], { stdio: ["ignore", "ignore", "pipe"], maxBuffer: 1 << 28 });
    return { valid: true, errors: 0 };
  } catch (err) {
    const text = String(err.stderr || "");
    const lines = text.split("\n").filter((l) => /validity error/.test(l));
    return { valid: false, errors: lines.length, first: lines.slice(0, 3).map((l) => l.replace(/^.*?: element /, "element ").slice(0, 300)) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && process.argv[1].endsWith("ifcxml-export.mjs")) {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const xi = args.indexOf("--xsd-dir");
  const xsdDir = xi >= 0 ? args[xi + 1] : null;
  const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--xsd-dir");
  const rows = [];
  for (const f of files) {
    const step = parseStep(readFileSync(f, "utf8"), { eager: true });
    const id = ifcXmlSchemaFor(step.schema);
    if (!id) { rows.push({ file: basename(f), schema: step.schema, skipped: "not IFC4 or IFC4X3" }); continue; }
    const parts = [];
    const t0 = Date.now();
    const stats = writeIfcXml(step, id, (s) => parts.push(s), { name: basename(f), timeStamp: "2026-11-24T00:00:00" });
    const ms = Date.now() - t0;
    const xml = parts.join("");
    const row = { file: basename(f), schema: id, stepBytes: readFileSync(f).length, xmlBytes: Buffer.byteLength(xml), entities: step.entities.size, writeMs: ms, ...stats };
    if (xsdDir) row.xsd = validate(join(xsdDir, XSD[id]), xml);
    Object.assign(row, compare(step, ifcXmlTarget(id).schema, xml));
    rows.push(row);
    if (!json) console.log(`${row.file}: ${row.schema} ${row.entities} entities, ${row.same} same, ${row.differ} differ, ${row.missing} missing; kept pointers ${row.keptPointers}; xsd ${row.xsd ? (row.xsd.valid ? "valid" : row.xsd.errors + " errors: " + row.xsd.first[0]) : "-"}`);
  }
  if (json) console.log(JSON.stringify(rows, null, 1));
}
