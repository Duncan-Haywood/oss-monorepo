// Module worker: checks a model off the page's main thread so a 100 MB model
// does not freeze the tab. Loads only the schema JSON the model needs, from
// this site (the files are part of the page; nothing is uploaded).
import { checkIds, Schema } from "./ids.mjs";
import { ifcXmlSchemaId, looksLikeXml } from "./ifcxml.mjs";

const cache = {};
async function json(name) {
  if (!cache[name]) cache[name] = fetch(new URL("./schema/" + name, import.meta.url)).then((r) => {
    if (!r.ok) throw new Error(`could not load schema/${name}`);
    return r.json();
  });
  return cache[name];
}

function schemaOf(ifcText) {
  if (looksLikeXml(ifcText)) return ifcXmlSchemaId(ifcText);
  const m = ifcText.slice(0, 20000).match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/i);
  const raw = m ? m[1].toUpperCase() : "";
  return raw.startsWith("IFC4X3") ? "IFC4X3" : raw.startsWith("IFC4") ? "IFC4" : raw.startsWith("IFC2X3") ? "IFC2X3" : null;
}

self.onmessage = async (ev) => {
  const { ids, ifc } = ev.data;
  try {
    const t0 = performance.now();
    const id = schemaOf(ifc);
    if (!id) throw new Error("the model's schema (FILE_SCHEMA, or the ifcXML namespace) is not IFC2X3, IFC4 or IFC4X3");
    const [sj, typeMap, measureUnits] = await Promise.all([json(id.toLowerCase() + ".json"), json("ifc2x3-type-map.json"), json("measure-units.json")]);
    const report = checkIds(ids, ifc, { schemas: { [id]: new Schema(sj) }, typeMap, measureUnits });
    report.seconds = (performance.now() - t0) / 1000;
    self.postMessage({ report });
  } catch (e) {
    self.postMessage({ error: e.message });
  }
};
