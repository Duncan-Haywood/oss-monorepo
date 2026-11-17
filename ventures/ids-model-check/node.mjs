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
// Returns { name, text } where name is the file inside a zip, else the path.
export async function readModel(path) {
  const bytes = readFileSync(path);
  if (isZip(bytes)) return unzipModel(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length), (b) => inflateRawSync(b));
  return { name: path, text: bytes.toString("utf8") };
}
