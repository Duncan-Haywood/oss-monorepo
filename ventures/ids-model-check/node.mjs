// Node entry point: loads the schema facts from schema/*.json and checks files.
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { isZip, unzipModel } from "./zip.mjs";
import { checkIds, Schema, Model, parseIds } from "./ids.mjs";

const here = new URL(".", import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL("schema/" + f, here), "utf8"));

let cache = null;
export function resources() {
  if (!cache) {
    cache = {
      schemas: { IFC2X3: new Schema(load("ifc2x3.json")), IFC4: new Schema(load("ifc4.json")), IFC4X3: new Schema(load("ifc4x3.json")) },
      typeMap: load("ifc2x3-type-map.json"),
      psets: { IFC2X3: load("psets-ifc2x3.json"), IFC4: load("psets-ifc4.json"), IFC4X3: load("psets-ifc4x3.json") },
      measureUnits: load("measure-units.json"),
      bsddUnits: load("bsdd-units.json"),
    };
  }
  return cache;
}

export function check(idsText, ifcText, opts = {}) {
  return checkIds(idsText, ifcText, { ...resources(), ...opts });
}

// Parses a model's text once (STEP or ifcXML) so several IDS files can be
// checked against it: check(ids, parseModel(text)) skips the parse and the
// relationship index, which are most of a check's time on a large export.
export function parseModel(text) {
  return new Model(text, resources().schemas);
}
export { parseIds };

// Reads a model file: .ifc (STEP), .ifcxml, or an .ifczip holding either.
// Returns { name, bytes, text } where name is the file inside a zip, else
// the path. Pass `bytes` to parseModel or check: a STEP file is then read
// without ever becoming one string on the heap (219 MB of it on a 219 MB
// export, eval/step-bytes-2026-11-18.md). `text` decodes the file each time
// it is read.
export async function readModel(path) {
  const file = readFileSync(path);
  let name = path, bytes = file;
  if (isZip(file)) ({ name, bytes } = await unzipModel(new Uint8Array(file.buffer, file.byteOffset, file.length), (b) => inflateRawSync(b), { bytes: true }));
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
  return { name, bytes, get text() { return bytes.toString("utf8"); } };
}
