// STEP (ISO 10303-21) writer: a parsed model of any format the checker reads
// (ifcXML, ifcJSON, IFC5 .ifcx, or STEP itself) written out as a .ifc file.
//
// toStep(model, {name, timestamp}) -> {text, entities, notes}
//   model: a Model (ids.mjs). Its entities are written in id order, each
//   argument in the schema's attribute order, so the file reads back to the
//   same entities: eval/to-step-twins.mjs reads every written file again and
//   compares it with the model it came from and with the exporter's own STEP
//   twin (eval/to-step-2026-11-22.md).
//   notes: what could not be written exactly (a reference to an entity the
//   model does not hold, a class the schema does not know), and required
//   attributes the source left unset, counted by class and attribute.
//
// Why: model-fill.mjs edits a STEP file's text line by line, so a model that
// arrives as ifcXML, ifcJSON or IFC5 was refused. Written as STEP first, it
// can be filled, and opened by every IFC tool that reads only .ifc.
//
// Numbers: the schema says whether a value is an INTEGER or a REAL (ifcXML,
// ifcJSON and IFC5 do not keep "1" and "1." apart), so a REAL is always
// written with a point; it is written as the shortest text that reads back as
// the same double. Strings are written as model-fill.mjs's stepString writes
// them (\X2\ for anything outside printable ASCII).

import { stepString } from "./model-fill.mjs";

// The shortest text that reads back as the same double, with the point
// STEP needs to tell a REAL from an INTEGER.
export function stepRealExact(x) {
  if (!Number.isFinite(x)) throw new Error(`a REAL that is not finite (${x}) has no STEP form`);
  let s = String(x).replace("e", "E").replace("E+", "E");
  if (!s.includes(".")) s = s.includes("E") ? s.replace("E", ".E") : s + ".";
  return s;
}

// The base type a value of declared type t takes inside a list: an
// aggregate defined type (IfcComplexNumber, IfcCompoundPlaneAngleMeasure)
// lists its own element type.
function elementType(S, t) {
  for (let g = 0; g < 20 && t; g++) {
    const d = S.types[t];
    if (!d) return t;
    if (d.kind === "aggregate") return d.of;
    if (d.kind !== "defined") return t;
    t = d.of;
  }
  return t;
}

const schemaName = (m) => {
  const raw = m.schemaRaw || "";
  if (m.schemaId === "IFC4X3") return /^IFC4X3_(ADD\d|TC\d|RC\d)$/.test(raw) ? raw : "IFC4X3_ADD2";
  return m.schemaId;
};

export function toStep(model, opts = {}) {
  const S = model.schema;
  const notes = [];
  const noted = new Set();
  const note = (k, msg) => { if (!noted.has(k)) { noted.add(k); notes.push(msg); } };
  const has = (id) => model.entities.has(id);
  // BINARY: a STEP file's own value keeps its leading digit (the unused bits
  // before the first hex digit) and is written back as read; ifcXML and
  // ifcJSON write xs:hexBinary, whole bytes, so "0" goes in front of an
  // even count of hex digits.
  const binary = (b) => {
    const h = b.replace(/\s+/g, "").toUpperCase();
    if (!/^[0-9A-F]*$/.test(h)) { note("bin", `a BINARY value that is not hex (${b.slice(0, 20)}), written as $`); return "$"; }
    // An odd count of hex digits already starts with that digit (the IFC.JAVA
    // ifcJSON samples write the STEP form).
    return '"' + (model.format === "STEP" || h.length % 2 ? h : "0" + h) + '"';
  };

  const fmt = (v, type) => {
    if (v === null || v === undefined) return "$";
    if (typeof v === "boolean") return v ? ".T." : ".F.";
    if (typeof v === "string") return stepString(v);
    if (typeof v === "number") {
      const p = type ? S.prim(type) : "unknown";
      if (p === "integer" && Number.isInteger(v)) return String(v);
      if (p === "integer") note("int:" + type, `a non-integer value ${v} where ${type} is an INTEGER, written as a REAL`);
      return stepRealExact(v);
    }
    if (Array.isArray(v)) {
      const et = type ? elementType(S, type) : null;
      return "(" + v.map((x) => fmt(x, et)).join(",") + ")";
    }
    if (typeof v === "object") {
      if (v.derived) return "*";
      if (v.unknown) return ".U.";
      if (v.enum !== undefined) return "." + String(v.enum).toUpperCase() + ".";
      if ("ref" in v) {
        if (!has(v.ref)) note("ref:" + v.ref, `a reference to #${v.ref}, which the model does not hold`);
        return "#" + v.ref;
      }
      if ("typed" in v) return v.typed + "(" + fmt(v.value, v.typed) + ")";
      if (typeof v.binary === "string") return binary(v.binary);
      // ifcJSON writers that wrap list items as {"type": "IfcPositiveInteger",
      // "value": 28} (buildingSMART's IFC.JAVA samples): the bare value where
      // the schema fixes the type, a typed value where it is a select.
      if (typeof v.type === "string" && "value" in v) {
        const t = v.type.toUpperCase();
        if (S.types[t] || S.prim(t) !== "unknown") return type && S.prim(type) === "select" ? t + "(" + fmt(v.value, t) + ")" : fmt(v.value, t);
      }
    }
    note("val:" + JSON.stringify(v).slice(0, 40), `a value with no STEP form (${JSON.stringify(v).slice(0, 80)}), written as $`);
    return "$";
  };

  const ids = [...model.entities.keys()].filter((k) => Number.isInteger(k)).sort((a, b) => a - b);
  const lines = [];
  const required = new Map();
  for (const id of ids) {
    const e = model.entities.get(id);
    const known = S.has(e.type);
    if (!known) note("cls:" + e.type, `${e.type} is not a class of ${model.schemaId}; its arguments are written untyped`);
    const attrs = known ? S.attrs(e.type) : [];
    const args = e.args || [];
    const n = Math.max(attrs.length, args.length);
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = attrs[i];
      const v = args[i];
      if (a && a.derived && (v === null || v === undefined)) out[i] = "*";
      else out[i] = fmt(v, a ? a.type : null);
    }
    lines.push(`#${id}=${e.type}(${out.join(",")});`);
    // A required attribute the source left unset is written $, as read:
    // nothing is made up for it, but a schema validator will flag it, so it
    // is counted (an ifcJSON converter that drops IfcFaceOuterBound's
    // Orientation, eval/to-step-2026-11-22.md).
    for (let i = 0; i < attrs.length; i++) if (out[i] === "$" && !attrs[i].optional && !attrs[i].derived) {
      const k = `${e.type}.${attrs[i].name}`;
      required.set(k, (required.get(k) || 0) + 1);
    }
  }
  for (const [k, n] of required) notes.push(`${k} is required and the source left it unset on ${n} entit${n === 1 ? "y" : "ies"} (written $)`);

  const ts = opts.timestamp || new Date().toISOString().slice(0, 19);
  const name = opts.name || "model.ifc";
  const text = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    `FILE_NAME(${stepString(name)},${stepString(ts)},(''),(''),'ids-model-check step-writer.mjs','ids-model-check',${stepString(`written from ${model.format}`)});`,
    `FILE_SCHEMA(('${schemaName(model)}'));`,
    "ENDSEC;",
    "DATA;",
    ...lines,
    "ENDSEC;",
    "END-ISO-10303-21;",
    "",
  ].join("\n");
  return { text, entities: lines.length, notes };
}
