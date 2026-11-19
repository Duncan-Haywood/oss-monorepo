// For each ifcXML file: the streaming read (geometry lazy, nested entities read
// as they close, eval/nested-early-2026-11-18.md) gives every entity the same id, type, arguments and
// order as the eager read, and the same notes; and, with --against
// <dir/ifcxml.mjs>, the same entities and notes as another copy of the reader
// (main's).
// eval/ifc4-layout-scale-2026-11-18.md.
//   node eval/ifcxml-lazy-eager.mjs [--against /path/ifcxml.mjs] file.ifcxml ...
import { readFileSync } from "node:fs";
import { parseIfcXml, ifcXmlSchemaId } from "../ifcxml.mjs";
import { Schema } from "../ids.mjs";

const args = process.argv.slice(2);
let other = null;
if (args[0] === "--against") { other = (await import(args[1])).parseIfcXml; args.splice(0, 2); }
const schemas = {};
const schemaFor = (id) => (schemas[id] ||= new Schema(JSON.parse(readFileSync(new URL(`../schema/${id.toLowerCase()}.json`, import.meta.url)))));
const rows = (m) => [...m.entities.values()].map((e) => JSON.stringify([e.id, e.type, e.xmlId ?? null, e.args]));
let files = 0, entities = 0, lazyRead = 0, bad = 0;
for (const f of args) {
  const text = readFileSync(f, "utf8");
  const id = ifcXmlSchemaId(text);
  if (!id) { console.log(`${f}: not ifcXML`); continue; }
  const S = schemaFor(id);
  const lazy = parseIfcXml(text, S);
  const eager = parseIfcXml(text, S, { eager: true });
  const a = rows(lazy), b = rows(eager);
  let diff = a.length === b.length ? 0 : Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) diff++;
  if (JSON.stringify(lazy.errors) !== JSON.stringify(eager.errors)) diff++;
  let vsOther = null;
  if (other) {
    const om = other(text, S);
    const o = rows(om);
    vsOther = o.length === a.length ? 0 : Math.abs(o.length - a.length);
    for (let i = 0; i < Math.min(a.length, o.length); i++) if (a[i] !== o[i]) vsOther++;
    if (JSON.stringify(om.errors) !== JSON.stringify(lazy.errors)) vsOther++;
  }
  files++; entities += a.length;
  for (const e of lazy.entities.values()) if (e._s !== undefined) lazyRead++;
  if (diff || vsOther) { bad++; console.log(`${f}: ${diff} lazy/eager differences, ${vsOther} against the other reader`); }
}
console.log(JSON.stringify({ files, entities, lazyRead, filesWithDifferences: bad }));
