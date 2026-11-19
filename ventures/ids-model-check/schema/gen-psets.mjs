#!/usr/bin/env node
// Builds schema/psets-<schema>.json, the standard property and quantity set templates the
// IDS audit checks property facets against, from buildingSMART's PSD XML files.
//
//   git clone --filter=blob:none --no-checkout https://github.com/buildingSMART/IFC4.3.x-development.git
//   (cd IFC4.3.x-development && git sparse-checkout set reference_schemas && git checkout c6928569550b24373bf4c6b4beb14aa303e2b468)
//   for v in IFC2X3 IFC4; do node schema/gen-psets.mjs IFC4.3.x-development/reference_schemas $v > schema/psets-$(echo $v | tr A-Z a-z).json; done
//
// Folders read: psd_IFC2x3 (IFC2X3 TC1) and psd_IFC4_ADD2_TC1 (IFC4). Not
// psd: that folder is the IFC4x3 RC4 draft (IfcSolidStratum, since renamed), so
// IFC4X3 is read from IfcOpenShell's IFC4X3_ADD2 template file instead:
//
//   curl -LO https://raw.githubusercontent.com/IfcOpenShell/IfcOpenShell/7092a6ae22fd351fdabf34524b3ad91d0aae0a0b/src/ifcopenshell-python/ifcopenshell/util/schema/Pset_IFC4X3.ifc
//   node schema/gen-psets.mjs Pset_IFC4X3.ifc IFC4X3 > schema/psets-ifc4x3.json
//
// Kept facts only: per schema, each set's name, the classes it applies to
// (`classes`, upper case), the predefined types a class is limited to (`pt`,
// IFC4 and IFC4X3; IFC2X3's PSD files name classes without them), and (`props`) each property's name and the
// IFC data type a value of it carries, upper case (IFCLABEL), or null where the
// template allows none (reference values, complex properties, time series);
// a table value keeps its defining and defined types as `types`; enumerated
// properties also keep their enumeration items. A
// quantity's type follows its QtoType (Q_LENGTH is IFCLENGTHMEASURE and so on).
// Definitions, aliases and translations are not copied. The PSD files are
// (c) buildingSMART International Limited; their notice allows use in software
// development with full attribution (see README, "Sources").
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseXml } from "../xml.mjs";
import { parseStep } from "../step.mjs";

const FOLDERS = { IFC2X3: "psd_IFC2x3", IFC4: "psd_IFC4_ADD2_TC1", IFC4X3: "psd" };
const QTO = { Q_LENGTH: "IFCLENGTHMEASURE", Q_AREA: "IFCAREAMEASURE", Q_VOLUME: "IFCVOLUMEMEASURE", Q_COUNT: "IFCCOUNTMEASURE", Q_WEIGHT: "IFCMASSMEASURE", Q_TIME: "IFCTIMEMEASURE" };

const kids = (n, local) => n.children.filter((c) => c.local === local);
const kid = (n, local) => n.children.find((c) => c.local === local);
const text = (n) => (n ? n.text.trim() : "");

// The value type of one PropertyType element, or null when no single one.
function propertyType(pt) {
  const t = pt && pt.children.find((c) => c.local);
  if (!t) return { type: null };
  const dt = kid(t, "DataType");
  const dtype = dt && dt.attrs.type ? dt.attrs.type.trim().toUpperCase() : null;
  switch (t.local) {
    case "TypePropertySingleValue":
    case "TypePropertyBoundedValue":
    case "TypePropertyListValue":
      return { type: dtype };
    case "TypeSimpleProperty":
      // IFC2x3 performance-history sets: IfcTimeSeries is not a property value type.
      return { type: dtype && dtype !== "IFCTIMESERIES" ? dtype : null };
    case "TypePropertyEnumeratedValue": {
      const list = kid(t, "EnumList");
      return { type: "IFCLABEL", enum: list ? kids(list, "EnumItem").map(text).filter(Boolean) : [] };
    }
    case "TypePropertyTableValue": {
      const ts = ["DefiningValue", "DefinedValue"].map((k) => kid(t, k)).map((v) => v && kid(v, "DataType")).map((d) => d && d.attrs.type ? d.attrs.type.trim().toUpperCase() : null);
      return ts.every(Boolean) ? { type: null, types: [...new Set(ts)] } : { type: null };
    }
    default:
      return { type: null }; // reference, complex
  }
}

export function readPsd(xmlText) {
  const root = parseXml(xmlText);
  if (root.local !== "PropertySetDef" && root.local !== "QtoSetDef") return null;
  const name = text(kid(root, "Name"));
  const props = {};
  // "IfcSlab/TRACKSLAB" (IFC4.3), "IFCSHAREDBLDGELEMENTS/IfcWall" (IFC2x3).
  const named = kids(kid(root, "ApplicableClasses") || { children: [] }, "ClassName").map((c) => {
    const parts = text(c).split("/").map((x) => x.trim());
    const i = parts.findIndex((x) => /^Ifc[A-Z]/.test(x));
    // A part after the class is its predefined type (IFC4's "IfcActuator/ELECTRICACTUATOR").
    return [(i < 0 ? parts[0] : parts[i]).toUpperCase(), i >= 0 && parts[i + 1] ? parts[i + 1] : null];
  }).filter(([c]) => c);
  const classes = named.map(([c]) => c);
  if (root.local === "QtoSetDef") {
    for (const q of kids(kid(root, "QtoDefs") || { children: [] }, "QtoDef")) {
      const n = text(kid(q, "Name"));
      if (n) props[n] = { type: QTO[text(kid(q, "QtoType"))] || null };
    }
  } else {
    for (const p of kids(kid(root, "PropertyDefs") || { children: [] }, "PropertyDef")) {
      const n = text(kid(p, "Name"));
      if (n) props[n] = propertyType(kid(p, "PropertyType"));
    }
  }
  return name ? { name, classes: [...new Set(classes)], ...predefinedOf(named), ...templateTypeOf(root.attrs.templatetype), props } : null;
}

// `tt`: the template type when it limits where the set may sit (IFC4's
// templatetype attribute, IFC4X3's IfcPropertySetTemplate.TemplateType):
// PSET_OCCURRENCEDRIVEN and QTO_OCCURRENCEDRIVEN (occurrences only, never a
// type object), PSET_PERFORMANCEDRIVEN (an IfcPerformanceHistory),
// PSET_MATERIALDRIVEN, PSET_PROFILEDRIVEN. Omitted for the TYPEDRIVENOVERRIDE
// default (type or occurrence), for no type (IFC2X3; IFC4's QtoSetDef files
// carry none) and for TYPEDRIVENONLY, which IDS reads through the type anyway.
export function templateTypeOf(t) {
  const v = typeof t === "string" ? t.trim().replace(/^\.|\.$/g, "").toUpperCase() : "";
  return /^(PSET|QTO)_(OCCURRENCEDRIVEN|PERFORMANCEDRIVEN|MATERIALDRIVEN|PROFILEDRIVEN)$/.test(v) ? { tt: v } : {};
}

// `pt`: for each class the template names only with a predefined type, those
// types ({ IFCACTUATOR: ["ELECTRICACTUATOR"] }); a class also named bare takes
// any type and gets no entry. Omitted when no class is restricted.
export function predefinedOf(named) {
  const bare = new Set(named.filter(([, t]) => !t).map(([c]) => c));
  const pt = {};
  for (const [c, t] of named) if (t && !bare.has(c)) (pt[c] ||= []).includes(t) || pt[c].push(t);
  return Object.keys(pt).length ? { pt } : {};
}

// Templates written as IFC (IfcPropertySetTemplate and IfcSimplePropertyTemplate
// instances), as IfcOpenShell ships them for IFC4X3_ADD2. Same output shape as
// readPsd, one entry per set.
export function readTemplates(stepText) {
  const { entities } = parseStep(stepText);
  const get = (a) => (a && a.ref !== undefined ? entities.get(a.ref) : null);
  const str = (a) => (typeof a === "string" ? a : a && a.typed ? a.value : null);
  const out = [];
  for (const e of entities.values()) {
    if (e.type !== "IFCPROPERTYSETTEMPLATE") continue;
    const [, , name, , templateType, applicable, children] = e.args;
    if (typeof name !== "string") continue;
    // "IfcActuator/ELECTRICACTUATOR,IfcActuatorType/ELECTRICACTUATOR"
    const named = typeof applicable === "string" ? applicable.split(",").map((x) => x.trim().split("/").map((y) => y.trim())).filter(([c]) => c).map(([c, t]) => [c.toUpperCase(), t || null]) : [];
    const classes = named.map(([c]) => c);
    const props = {};
    for (const c of children || []) {
      const t = get(c);
      if (!t || typeof t.args[2] !== "string") continue;
      const pname = t.args[2];
      if (t.type !== "IFCSIMPLEPROPERTYTEMPLATE") { props[pname] = { type: null }; continue; }
      const kind = t.args[4] && t.args[4].enum;
      const primary = typeof t.args[5] === "string" ? t.args[5].toUpperCase() : null;
      const secondary = typeof t.args[6] === "string" ? t.args[6].toUpperCase() : null;
      if (kind && kind.startsWith("Q_")) props[pname] = { type: QTO[kind] || null };
      else if (kind === "P_SINGLEVALUE" || kind === "P_BOUNDEDVALUE" || kind === "P_LISTVALUE") props[pname] = { type: primary };
      else if (kind === "P_ENUMERATEDVALUE") {
        const en = get(t.args[7]);
        props[pname] = { type: primary && primary.startsWith("IFC") ? primary : "IFCLABEL", enum: en ? (en.args[1] || []).map(str).filter(Boolean) : [] };
      } else if (kind === "P_TABLEVALUE" && primary && secondary) props[pname] = { type: null, types: [...new Set([primary, secondary])] };
      else props[pname] = { type: null };
    }
    out.push({ name, classes: [...new Set(classes)], ...predefinedOf(named), ...templateTypeOf(templateType && templateType.enum), props });
  }
  return out;
}

export function buildPsets(dir) {
  const out = {};
  for (const [id, folder] of Object.entries(FOLDERS)) {
    const sets = {};
    for (const f of readdirSync(join(dir, folder)).filter((f) => f.endsWith(".xml")).sort()) {
      const s = readPsd(readFileSync(join(dir, folder, f), "utf8"));
      if (s && /^(Pset|Qto)_/.test(s.name)) sets[s.name] = { classes: s.classes, ...(s.pt ? { pt: s.pt } : {}), ...(s.tt ? { tt: s.tt } : {}), props: s.props };
    }
    out[id] = Object.fromEntries(Object.entries(sets).sort(([a], [b]) => (a < b ? -1 : 1)));
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [src, id] = process.argv.slice(2);
  if (!src || !FOLDERS[id]) { console.error("usage: node schema/gen-psets.mjs <IFC4.3.x-development/reference_schemas | Pset_IFC4X3.ifc> IFC2X3|IFC4|IFC4X3"); process.exit(2); }
  let sets;
  if (src.toLowerCase().endsWith(".ifc")) {
    sets = {};
    for (const t of readTemplates(readFileSync(src, "utf8")).filter((t) => /^(Pset|Qto)_/.test(t.name)).sort((a, b) => (a.name < b.name ? -1 : 1))) sets[t.name] = { classes: t.classes, ...(t.pt ? { pt: t.pt } : {}), ...(t.tt ? { tt: t.tt } : {}), props: t.props };
  } else sets = buildPsets(src)[id];
  // One set per line keeps diffs readable and the file small.
  process.stdout.write("{\n" + Object.entries(sets).map(([n, p]) => JSON.stringify(n) + ":" + JSON.stringify(p)).join(",\n") + "\n}\n");
}
