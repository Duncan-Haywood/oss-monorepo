// Module worker: checks a model off the page's main thread so a 100 MB model
// does not freeze the tab. Loads only the schema JSON the model needs, from
// this site (the files are part of the page; nothing is uploaded).
import { checkIds, parseIds, Schema } from "./ids.mjs";
import { auditIds } from "./audit.mjs";

const cache = {};
async function json(name) {
  if (!cache[name]) cache[name] = fetch(new URL("./schema/" + name, import.meta.url)).then((r) => {
    if (!r.ok) throw new Error(`could not load schema/${name}`);
    return r.json();
  });
  return cache[name];
}

function schemaOf(ifcText) {
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

async function loadSchemas(ids) {
  const entries = await Promise.all([...ids].map(async (id) => [id, new Schema(await json(id.toLowerCase() + ".json"))]));
  return Object.fromEntries(entries);
}

self.onmessage = async (ev) => {
  const { ids, ifc, auditOnly } = ev.data;
  try {
    const t0 = performance.now();
    if (auditOnly) {
      const parsed = parseIds(ids);
      const named = idsSchemas(ids);
      const [schemas, typeMap] = await Promise.all([loadSchemas(named.size ? named : new Set(["IFC2X3", "IFC4", "IFC4X3"])), json("ifc2x3-type-map.json")]);
      const audit = auditIds(parsed, { schemas, typeMap });
      self.postMessage({ audit: { title: parsed.title, specs: parsed.specs.map((s) => ({ name: s.name, ifcVersion: s.ifcVersion })), issues: audit, seconds: (performance.now() - t0) / 1000 } });
      return;
    }
    const id = schemaOf(ifc);
    if (!id) throw new Error("the model's FILE_SCHEMA is not IFC2X3, IFC4 or IFC4X3");
    const want = idsSchemas(ids);
    want.add(id);
    const [schemas, typeMap, measureUnits] = await Promise.all([loadSchemas(want), json("ifc2x3-type-map.json"), json("measure-units.json")]);
    const report = checkIds(ids, ifc, { schemas: { [id]: schemas[id] }, auditSchemas: schemas, typeMap, measureUnits });
    report.seconds = (performance.now() - t0) / 1000;
    self.postMessage({ report });
  } catch (e) {
    self.postMessage({ error: e.message });
  }
};
