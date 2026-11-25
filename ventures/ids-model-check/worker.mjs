// Module worker: checks a model off the page's main thread so a 100 MB model
// does not freeze the tab. Loads only the schema JSON the model needs, from
// this site (the files are part of the page; nothing is uploaded).
import { checkIds, parseIds, Schema, Model } from "./ids.mjs";
import { auditIds } from "./audit.mjs";
import { ifcXmlSchemaId, looksLikeXml } from "./ifcxml.mjs";
import { ifcJsonSchemaId, looksLikeJson } from "./ifcjson.mjs";
import { looksLikeIfcx } from "./ifcx.mjs";
import { modelInventory } from "./inventory.mjs";
import { fillModel, fillReport, toFillCsv, readValues } from "./model-fill.mjs";
import { measureModel, geometryLookup } from "./geometry-quantities.mjs";
import { toStep } from "./step-writer.mjs";
import { writeIfcXml, ifcXmlSchemaFor, makeIfcXmlTarget } from "./ifcxml-writer.mjs";
import { conformance, conformanceSummary, markModelRules } from "./conformance.mjs";
import { cobieFromModel, cobieToXlsx, cobieQc, qcText, numberRows, placementFromTakeoff, SHEETS } from "./cobie.mjs";

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
  // An ifcJSON file with no schemaIdentifier header is read in whichever
  // schema knows its class names (ifcjson.mjs), so all three are loaded.
  // An IFC5 model is composed into IFC4X3 entities (ifcx.mjs).
  if (looksLikeIfcx(ifcText)) return "IFC4X3";
  if (looksLikeJson(ifcText)) return ifcJsonSchemaId(ifcText) || ANY;
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

const ANY = "ANY";
const ALL = ["IFC2X3", "IFC4", "IFC4X3"];
const modelSchemas = (id, schemas) => (id === ANY ? Object.fromEntries(ALL.map((k) => [k, schemas[k]])) : { [id]: schemas[id] });

async function loadSchemas(ids) {
  if ([...ids].includes(ANY)) ids = ALL;
  const entries = await Promise.all([...ids].map(async (id) => [id, new Schema(await json(id.toLowerCase() + ".json"))]));
  return Object.fromEntries(entries);
}

self.onmessage = async (ev) => {
  const { ids, ifc, auditOnly, inventory, fill, values, geometry: measure, densities, req, asStep, asIfcXml, cobie } = ev.data;
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
      const ifc5 = looksLikeIfcx(ifc instanceof Uint8Array ? new TextDecoder().decode(ifc.subarray(0, 16000)) : ifc);
      const model = new Model(ifc, modelSchemas(id, schemas), ifc5 ? { psets: { IFC4X3: await json("psets-ifc4x3.json") } } : {});
      const inv = modelInventory(model, measureUnits);
      inv.parseErrors = model.parseErrors.length;
      inv.seconds = (performance.now() - t0) / 1000;
      postMessage({ inventory: inv });
      return;
    }
    // cobie.html: a COBie 2.4 workbook from the model and its QC (cobie.mjs);
    // cobie.geometry puts components the file leaves on a storey in the room
    // they stand in, read by ifc-quantity-takeoff (served beside this page).
    if (cobie) {
      const id = schemaOf(ifc);
      if (!id) throw new Error("the model's schema (FILE_SCHEMA, or the ifcXML namespace) is not IFC2X3, IFC4 or IFC4X3");
      const schemas = await loadSchemas(id === ANY ? ALL : [id]);
      const ifc5 = looksLikeIfcx(ifc instanceof Uint8Array ? new TextDecoder().decode(ifc.subarray(0, 16000)) : ifc);
      const model = new Model(ifc, modelSchemas(id, schemas), ifc5 ? { psets: { IFC4X3: await json("psets-ifc4x3.json") } } : {});
      let placement = null;
      if (cobie.geometry) {
        const src = model.format === "STEP" ? (ifc instanceof Uint8Array ? new TextDecoder().decode(ifc) : ifc) : toStep(model).text;
        const [{ parseStep }, { takeoff }] = await Promise.all([import(new URL("../ifc-quantity-takeoff/step.mjs", import.meta.url).href), import(new URL("../ifc-quantity-takeoff/qto.mjs", import.meta.url).href)]);
        // A model written as STEP first numbers its entities anew, so the
        // rooms are matched to this model's spaces by GlobalId.
        const tk = takeoff(parseStep(src));
        if (model.format !== "STEP") {
          const byGid = new Map();
          for (const e of model.entities.values()) { const g = model.attr(e, "GlobalId"); if (typeof g === "string") byGid.set(g, e.id); }
          for (const r of tk.rows) r.id = byGid.get(r.globalId) ?? -1;
          for (const r of tk.rooms) r.id = byGid.get(r.globalId) ?? -1;
        }
        placement = placementFromTakeoff(tk);
      }
      const c = numberRows(cobieFromModel(model, { placement, contact: cobie.contact || null, createdOn: cobie.createdOn || null, na: !!cobie.na }));
      const qc = cobieQc(c.sheets, { stage: cobie.stage });
      postMessage({ cobie: { xlsx: cobieToXlsx(c), notes: c.notes, rows: Object.fromEntries(SHEETS.map((s) => [s, c.sheets[s].length])), qc: { ...qc, issues: qc.issues.slice(0, 20000) }, text: qcText(qc, { examples: 5 }), seconds: (performance.now() - t0) / 1000 } });
      return;
    }
    // "Download as STEP (.ifc)": an ifcXML, ifcJSON or IFC5 model written
    // as a .ifc file (step-writer.mjs).
    if (asStep) {
      const id = schemaOf(ifc);
      if (!id) throw new Error("the model's schema is not IFC2X3, IFC4 or IFC4X3");
      const schemas = await loadSchemas(id === ANY ? ALL : [id]);
      const ifc5 = looksLikeIfcx(ifc instanceof Uint8Array ? new TextDecoder().decode(ifc.subarray(0, 16000)) : ifc);
      const model = new Model(ifc, modelSchemas(id, schemas), ifc5 ? { psets: { IFC4X3: await json("psets-ifc4x3.json") } } : {});
      const w = toStep(model, { name: asStep });
      postMessage({ step: { text: w.text, entities: w.entities, notes: w.notes, format: model.format } });
      return;
    }
    // "Download as ifcXML (.ifcxml)": an IFC4 or IFC4X3 STEP model written as
    // ifcXML laid out by buildingSMART's XSD (ifcxml-writer.mjs, the same
    // writer as cli.mjs --to-ifcxml; its layout is fetched like the schemas).
    // asIfcXml is the source file name, written in the header as the CLI does.
    if (asIfcXml) {
      const id = schemaOf(ifc);
      if (id !== "IFC4" && id !== "IFC4X3") throw new Error("ifcXML is written for IFC4 and IFC4X3 STEP models");
      const schemas = await loadSchemas([id]);
      const model = new Model(ifc, { [id]: schemas[id] });
      if (model.format !== "STEP") throw new Error(`ifcXML is written from STEP models (this one is ${model.format})`);
      const target = ifcXmlSchemaFor(model.schemaRaw);
      if (!target) throw new Error(`ifcXML is written for IFC4 and IFC4X3 models (this one is ${model.schemaRaw})`);
      const layout = await json(`ifcxml-layout-${target.toLowerCase()}.json`);
      const pieces = [];
      const st = writeIfcXml(model, makeIfcXmlTarget(target, schemas[target] || await json(target.toLowerCase() + ".json"), layout), (p) => pieces.push(p), { name: asIfcXml });
      postMessage({ ifcxml: { text: pieces.join(""), schemaRaw: model.schemaRaw, target, stats: st, seconds: (performance.now() - t0) / 1000 } });
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
    for (const k of id === ANY ? ALL : [id]) want.add(k);
    const [schemas, typeMap, measureUnits, loaded] = await Promise.all([loadSchemas(want), json("ifc2x3-type-map.json"), json("measure-units.json"), loadPsets(ids, want)]);
    // An IFC5 model's properties are grouped into sets by the IFC4X3
    // templates (ifcx.mjs), so they are loaded whatever the IDS names.
    const ifc5 = looksLikeIfcx(ifc instanceof Uint8Array ? new TextDecoder().decode(ifc.subarray(0, 16000)) : ifc);
    const psets = ifc5 && !(loaded && loaded.IFC4X3) ? { ...(loaded || {}), IFC4X3: await json("psets-ifc4x3.json") } : loaded;
    if (fill) {
      // "Write the missing values into the model" (model-fill.mjs): any
      // format in, a .ifc out; the standard templates give a value's type where the IDS
      // names none.
      const tpl = loaded && loaded[id] ? loaded : { ...(loaded || {}), [id]: await json("psets-" + id.toLowerCase() + ".json") };
      // Qto_ quantities no set holds, measured from each element's body by
      // ifc-quantity-takeoff (served beside this page; geometry-quantities.mjs).
      // An ifcXML, ifcJSON or IFC5 model is written as STEP here (fillModel
      // would do it too) so the takeoff engine, which reads STEP, can measure it.
      let src = ifc;
      if (measure) {
        const m = new Model(ifc, modelSchemas(id, schemas), { psets: tpl });
        if (m.format !== "STEP") src = toStep(m).text;
      }
      const geometry = measure ? geometryLookup(await measureModel(src, { densities })) : undefined;
      const r = fillModel(ids, src, { schemas: modelSchemas(id, schemas), auditSchemas: schemas, typeMap, measureUnits, psets: tpl, values: values ? readValues(values) : [], geometry });
      const { text, unfilled, writtenList, ...rest } = r;
      void writtenList;
      postMessage({ fill: { ...rest, text: r.written ? text : null, summary: fillReport(r), toFill: unfilled.length ? toFillCsv(unfilled) : null, unfilledCount: unfilled.length, seconds: (performance.now() - t0) / 1000 } });
      return;
    }
    const report = checkIds(ids, ifc, { schemas: modelSchemas(id, schemas), auditSchemas: schemas, typeMap, measureUnits, psets });
    // Schema faults the check reads past (conformance.mjs): STEP files up to
    // 40 MB, where a second, full read costs a few seconds at most.
    if (report.format === "STEP" && ifc.length <= 40e6) {
      try {
        // The WHERE rules of the model's own schema (where-rules.mjs, 80-180 kB).
        const sid = (schemaOf(ifc) || "").toUpperCase();
        const key = sid.startsWith("IFC4X3") ? "IFC4X3" : sid.startsWith("IFC4") ? "IFC4" : sid.startsWith("IFC2X3") ? "IFC2X3" : null;
        const rules = key ? { [key]: await json(`rules-${key.toLowerCase()}.json`).catch(() => null) } : null;
        const conf = conformance(ifc, modelSchemas(id, schemas), { rules });
        markModelRules(report, conf);
        report.conformance = conformanceSummary(conf);
      }
      catch (e) { report.conformance = { error: e.message }; }
    }
    report.seconds = (performance.now() - t0) / 1000;
    postMessage({ report });
  } catch (e) {
    postMessage({ error: e.message });
  }
};
