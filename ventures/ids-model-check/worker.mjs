// Module worker: checks a model off the page's main thread so a 100 MB model
// does not freeze the tab. Loads only the schema JSON the model needs, from
// this site (the files are part of the page; nothing is uploaded).
import { checkIds, parseIds, Schema, Model } from "./ids.mjs";
import { auditIds } from "./audit.mjs";
import { ifcXmlSchemaId, looksLikeXml } from "./ifcxml.mjs";
import { modelInventory } from "./inventory.mjs";

const cache = {};
async function json(name) {
  if (!cache[name]) cache[name] = fetch(new URL("./schema/" + name, import.meta.url)).then((r) => {
    if (!r.ok) throw new Error(`could not load schema/${name}`);
    return r.json();
  });
  return cache[name];
}

// ifc is the model's bytes (a Uint8Array, read without becoming one string
// on the heap: eval/step-bytes-2026-11-18.md) or its text.
function schemaOf(ifc) {
  const ifcText = ifc instanceof Uint8Array ? new TextDecoder().decode(ifc.subarray(0, 20000)) : ifc;
  if (looksLikeXml(ifcText)) return ifcXmlSchemaId(ifcText);
  const m = ifcText.slice(0, 20000).match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/i);
  const raw = m ? m[1].toUpperCase() : "";
  return raw.startsWith("IFC4X3") ? "IFC4X3" : raw.startsWith("IFC4") ? "IFC4" : raw.startsWith("IFC2X3") ? "IFC2X3" : null;
}

// Schemas an IDS names in ifcVersion, so the audit checks a specification
// against the versions it was written for.
function idsSchemas(idsText) {
  const out = new Set();
  for (const m of idsText.matchAll(/ifcVersion\s*=\s*"([^"]*)"/g)) {
    for (const v of m[1].toUpperCase().split(/\s+/)) {
      const id = v.startsWith("IFC4X3") ? "IFC4X3" : v === "IFC4" ? "IFC4" : v === "IFC2X3" ? "IFC2X3" : null;
      if (id) out.add(id);
    }
  }
  return out;
}

// Standard property set templates (schema/psets-*.json), only when the IDS
// names a Pset_ or Qto_ set: the audit checks names and data types against them.
async function loadPsets(idsText, ids) {
  if (!/(Pset|Qto)_/.test(idsText)) return null;
  const entries = await Promise.all([...ids].map(async (id) => [id, await json("psets-" + id.toLowerCase() + ".json")]));
  return Object.fromEntries(entries);
}

async function loadSchemas(ids) {
  const entries = await Promise.all([...ids].map(async (id) => [id, new Schema(await json(id.toLowerCase() + ".json"))]));
  return Object.fromEntries(entries);
}

self.onmessage = async (ev) => {
  const { ids, ifc, auditOnly, inventory, req } = ev.data;
  // Echo the caller's request number (index.html drops stale replies).
  const postMessage = (m) => self.postMessage({ ...m, req });
  try {
    const t0 = performance.now();
    // The IDS editor's "Open a model": what the model carries, so the editor
    // can offer its classes and sets (inventory.mjs).
    if (inventory) {
      const id = schemaOf(ifc);
      if (!id) throw new Error("the model's schema (FILE_SCHEMA, or the ifcXML namespace) is not IFC2X3, IFC4 or IFC4X3");
      const [schemas, measureUnits] = await Promise.all([loadSchemas([id]), json("measure-units.json")]);
      const model = new Model(ifc, schemas);
      const inv = modelInventory(model, measureUnits);
      inv.parseErrors = model.parseErrors.length;
      inv.seconds = (performance.now() - t0) / 1000;
      postMessage({ inventory: inv });
      return;
    }
    if (auditOnly) {
      const parsed = parseIds(ids);
      const named = idsSchemas(ids);
      const which = named.size ? named : new Set(["IFC2X3", "IFC4", "IFC4X3"]);
      const [schemas, typeMap, psets] = await Promise.all([loadSchemas(which), json("ifc2x3-type-map.json"), loadPsets(ids, which)]);
      const audit = auditIds(parsed, { schemas, typeMap, psets });
      postMessage({ audit: { title: parsed.title, specs: parsed.specs.map((s) => ({ name: s.name, ifcVersion: s.ifcVersion })), issues: audit, seconds: (performance.now() - t0) / 1000 } });
      return;
    }
    const id = schemaOf(ifc);
    if (!id) throw new Error("the model's schema (FILE_SCHEMA, or the ifcXML namespace) is not IFC2X3, IFC4 or IFC4X3");
    const want = idsSchemas(ids);
    want.add(id);
    const [schemas, typeMap, measureUnits, psets] = await Promise.all([loadSchemas(want), json("ifc2x3-type-map.json"), json("measure-units.json"), loadPsets(ids, want)]);
    const report = checkIds(ids, ifc, { schemas: { [id]: schemas[id] }, auditSchemas: schemas, typeMap, measureUnits, psets });
    report.seconds = (performance.now() - t0) / 1000;
    postMessage({ report });
  } catch (e) {
    postMessage({ error: e.message });
  }
};
