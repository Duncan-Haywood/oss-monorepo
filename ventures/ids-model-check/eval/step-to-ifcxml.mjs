// Writes a STEP model as ifcXML in xBIM's IFC2X3 layout (every entity at the
// top under <uos>, every attribute a child element, references as
// <IfcX ref="iN" xsi:nil="true"/>, lists as ex:*-wrapper items), so the ifcXML
// reader can be measured on a real export of 40 MB or more: no public ifcXML
// file found is over 0.6 MB (eval/lazy-ifcxml-2026-11-18.md). Eval only; the
// checker does not write ifcXML.
//
//   node eval/step-to-ifcxml.mjs model.ifc out.ifcxml   (IFC2X3 models)
//   node eval/step-to-ifcxml.mjs --check model.ifc      (round trip: every
//     entity's arguments read back from the XML equal the STEP reader's)

import { readFileSync, createWriteStream } from "node:fs";
import { parseStep } from "../step.mjs";
import { parseIfcXml } from "../ifcxml.mjs";
import { Schema } from "../ids.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function* ifcXmlLines(step, schema) {
  const name = (t) => (schema.entities[t] ? schema.entities[t].name : t);
  const typeOf = (id, declared) => {
    const e = step.entities.get(id);
    return name(e ? e.type : declared);
  };
  const scalar = (v) => (typeof v === "boolean" ? String(v) : v && v.enum ? v.enum.toLowerCase() : v && v.unknown ? "unknown" : v && v.binary !== undefined ? v.binary : esc(v));
  // One list item or value as element(s) under its attribute.
  const item = (v, declared, pos) => {
    const p = pos === undefined ? "" : ` pos="${pos}"`;
    if (v && v.ref !== undefined) return `<${typeOf(v.ref, declared)}${p} ref="i${v.ref}" xsi:nil="true"/>`;
    if (v && v.typed) {
      const inner = Array.isArray(v.value) ? v.value.map((x, i) => `<ex:double-wrapper pos="${i}">${scalar(x)}</ex:double-wrapper>`).join("") : scalar(v.value);
      return `<${v.typed}${p}>${inner}</${v.typed}>`;
    }
    if (Array.isArray(v)) return `<Seq-wrapper${p}>${v.map((x, i) => item(x, declared, i)).join("")}</Seq-wrapper>`;
    const prim = typeof v === "number" ? "double" : typeof v === "boolean" ? "boolean" : "string";
    return `<ex:${prim}-wrapper${p}>${scalar(v)}</ex:${prim}-wrapper>`;
  };
  yield `<?xml version="1.0" encoding="utf-8"?>\n<ex:iso_10303_28 version="2.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:ex="urn:iso.org:standard:10303:part(28):version(2):xmlschema:common">\n<uos id="uos_1" configuration="i_ifc2x3" xmlns="http://www.iai-tech.org/ifcXML/IFC2x3/FINAL">\n`;
  for (const e of step.entities.values()) {
    const attrs = schema.attrs(e.type);
    if (!schema.entities[e.type]) continue;
    let out = `<${name(e.type)} id="i${e.id}">`;
    attrs.forEach((a, i) => {
      const v = e.args[i];
      if (v === null || v === undefined || (v && v.derived)) return;
      if (Array.isArray(v)) out += `<${a.name} ex:cType="list">${v.map((x, j) => item(x, a.type, j)).join("")}</${a.name}>`;
      else if (v.ref !== undefined || v.typed) out += `<${a.name}>${item(v, a.type)}</${a.name}>`;
      else out += `<${a.name}>${scalar(v)}</${a.name}>`;
    });
    yield out + `</${name(e.type)}>\n`;
  }
  yield `</uos>\n</ex:iso_10303_28>\n`;
}

// Arguments with references written by STEP number, for comparing two reads.
function norm(v, idOf) {
  if (Array.isArray(v)) return v.map((x) => norm(x, idOf));
  if (v && typeof v === "object") {
    if (v.ref !== undefined) return { ref: idOf(v.ref) };
    if (v.typed) return { typed: v.typed, value: norm(v.value, idOf) };
  }
  return v;
}

const loadSchema = () => new Schema(JSON.parse(readFileSync(new URL("../schema/ifc2x3.json", import.meta.url))));

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const check = args[0] === "--check";
  if (check) args.shift();
  const step = parseStep(readFileSync(args[0], "utf8"), { eager: true });
  if (!/^IFC2X3/i.test(step.schema || "")) throw new Error(`IFC2X3 only (this file: ${step.schema})`);
  const schema = loadSchema();
  if (!check) {
    const out = createWriteStream(args[1]);
    for (const line of ifcXmlLines(step, schema)) if (!out.write(line)) await new Promise((r) => out.once("drain", r));
    out.end();
  } else {
    const xml = [...ifcXmlLines(step, schema)].join("");
    const x = parseIfcXml(xml, schema);
    const byXml = new Map([...x.entities.values()].map((e) => [e.xmlId, e]));
    const stepOf = new Map([...x.entities.values()].map((e) => [e.id, e.xmlId ? Number(e.xmlId.slice(1)) : -e.id]));
    let same = 0, differ = 0, missing = 0, skipped = 0;
    const examples = [];
    for (const e of step.entities.values()) {
      if (!schema.entities[e.type]) { skipped++; continue; }
      const r = byXml.get("i" + e.id);
      if (!r) { missing++; continue; }
      const a = JSON.stringify(norm(e.args.map((v) => (v && v.derived ? { derived: true } : v)), (n) => n));
      const b = JSON.stringify(norm(r.args, (n) => stepOf.get(n)));
      if (a === b && r.type === e.type) same++;
      else { differ++; if (examples.length < 5) examples.push({ id: e.id, type: e.type, step: a.slice(0, 300), xml: b.slice(0, 300) }); }
    }
    console.log(JSON.stringify({ xmlBytes: xml.length, entities: step.entities.size, same, differ, missing, skippedUnknownType: skipped, xmlErrors: x.errors.slice(0, 5), examples }, null, 1));
  }
}
