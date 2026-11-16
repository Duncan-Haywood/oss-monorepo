// ifcXML reader: turns an ifcXML model (ISO 10303-28) into the same
// { schema, entities, errors } shape parseStep gives for a STEP file, so the
// checker runs on it unchanged.
//
// ifcXMLSchemaId(text) -> "IFC2X3" | "IFC4" | "IFC4X3" | null
// parseIfcXml(text, schema) -> { schema, entities: Map<id, {id, type, args}>, errors }
//   schema: a Schema (ids.mjs) for that version; it gives each attribute's
//   position and type, which ifcXML does not carry.
//
// Two layouts are read, both seen in real files:
// - IFC2X3 (ifcXML2, <iso_10303_28><uos>): every entity at the top, every
//   attribute a child element (<Name>Wall</Name>), references written
//   <IfcOwnerHistory ref="i2" xsi:nil="true"/>, select values as
//   <IfcBoolean>true</IfcBoolean>, lists as <ex:double-wrapper> items.
// - IFC4 and later (<ifcXML>): simple attributes as XML attributes
//   (Name="Wall", PredefinedType="notdefined"), entities nested where they are
//   used, an attribute element that is itself the value (<RelatingObject
//   xsi:type="IfcProject" ref="p1"/>, or with no xsi:type at all, the
//   attribute's own class), select values as <IfcLabel-wrapper>, and
//   relationships nested under an inverse attribute (<IsDefinedBy>) with their
//   pointer back to the parent left out; that pointer is put back.
// ids may be any string; they are numbered in the order first seen. Derived
// attributes are marked {derived:true} as a STEP file's * would be.

import { parseXml } from "./xml.mjs";

export function ifcXmlSchemaId(text) {
  const head = text.slice(0, 4000);
  if (!/^\s*(﻿)?\s*</.test(head)) return null;
  if (/IFC4X3|IFC4_3|IFC4x3/i.test(head)) return "IFC4X3";
  if (/IFC2X3/i.test(head)) return "IFC2X3";
  if (/IFC4/i.test(head)) return "IFC4";
  return null;
}

export function looksLikeXml(text) {
  return /^\s*(﻿)?\s*<[?!a-zA-Z]/.test(text.slice(0, 200));
}

const local = (n) => (n.includes(":") ? n.slice(n.indexOf(":") + 1) : n);
const isMeta = (k) => k === "id" || k === "ref" || k === "pos" || k.includes(":") || k === "xmlns";

export function parseIfcXml(text, schema) {
  const root = parseXml(text);
  const entities = new Map();
  const errors = [];
  const ids = new Map();
  let next = 1;
  const num = (s) => {
    let n = ids.get(s);
    if (n === undefined) ids.set(s, (n = next++));
    return n;
  };
  const backrefs = []; // [relationship id, attribute, parent id]

  const U = (s) => s.toUpperCase();
  const entityName = (n) => {
    const u = U(local(n));
    return schema.entities[u] ? u : null;
  };
  const definedName = (n) => {
    const u = U(local(n)).replace(/-WRAPPER$/, "");
    return schema.types[u] ? u : null;
  };
  const xsiType = (el) => {
    for (const [k, v] of Object.entries(el.attrs)) if (local(k) === "type" && k.includes(":")) return v;
    return null;
  };
  const hasOwnValueAttrs = (el) => Object.keys(el.attrs).some((k) => !isMeta(k));

  // A text value read as the given type name.
  function cast(raw, typeName) {
    const s = raw.trim();
    const prim = schema.prim(typeName);
    switch (prim) {
      case "double":
      case "integer": {
        const n = Number(s);
        return Number.isNaN(n) && s !== "NaN" ? s : n;
      }
      case "boolean":
        return /^(true|t|1)$/i.test(s) ? true : /^(false|f|0)$/i.test(s) ? false : s;
      case "logical":
        return /^(true|t)$/i.test(s) ? true : /^(false|f)$/i.test(s) ? false : { unknown: true };
      case "enum":
        return { enum: U(s) };
      case "binary":
        return { binary: s };
      case "aggregate": {
        let t = typeName;
        for (let g = 0; g < 20 && schema.types[t] && schema.types[t].kind !== "aggregate"; g++) t = schema.types[t].of;
        const of = schema.types[t] ? schema.types[t].of : "STRING";
        return s ? s.split(/\s+/).map((x) => cast(x, of)) : [];
      }
      default:
        return s;
    }
  }

  // A defined-type value, as STEP writes it inside a select: IFCLABEL('x').
  function typed(name, el) {
    const kind = schema.prim(name);
    if (kind === "aggregate" && el.children.length) {
      let t = name;
      for (let g = 0; g < 20 && schema.types[t] && schema.types[t].kind !== "aggregate"; g++) t = schema.types[t].of;
      return { typed: name, value: el.children.map((c) => cast(c.text, schema.types[t].of)) };
    }
    return { typed: name, value: cast(el.text, name) };
  }

  // One item: an entity (inline or a reference), a select's defined-type value,
  // or a plain value read as `declared`.
  function item(el, declared) {
    const xt = xsiType(el);
    const ent = entityName(xt || el.local);
    if (ent || (el.attrs.ref !== undefined && !definedName(el.local))) {
      if (el.attrs.ref !== undefined) return { ref: num(el.attrs.ref) };
      return { ref: entity(el, ent || declared) };
    }
    const def = definedName(xt || el.local);
    if (def && schema.prim(declared) === "select") return typed(def, el);
    if (def && !el.children.length) return cast(el.text, declared && schema.prim(declared) !== "unknown" ? declared : def);
    if (el.children.length) return el.children.map((c) => item(c, itemType(declared)));
    return cast(el.text, declared);
  }

  const itemType = (t) => {
    for (let g = 0; g < 20 && t && schema.types[t]; g++) {
      if (schema.types[t].kind === "aggregate") return schema.types[t].of;
      t = schema.types[t].of;
    }
    return t;
  };

  // The value of an attribute written as a child element.
  function attrValue(el, def, ownerType) {
    const declared = def.type;
    const xt = xsiType(el);
    // The element is itself the value: <RelatingObject xsi:type="IfcProject" ref="p1"/>.
    if (xt || el.attrs.ref !== undefined || el.attrs.id !== undefined || hasOwnValueAttrs(el)) {
      // With no xsi:type the element is an instance of the attribute's own class.
      const v = !xt && el.attrs.ref === undefined && entityName(declared) ? { ref: entity(el, declared) } : item(el, xt ? U(local(xt)) : declared);
      return def.aggregate ? [v] : v;
    }
    const kidsEls = el.children;
    if (kidsEls.length) {
      const first = kidsEls[0];
      const isItem = (c) => entityName(xsiType(c) || c.local) || definedName(xsiType(c) || c.local) || c.attrs.ref !== undefined || /-wrapper$/.test(c.local);
      if (!isItem(first) && entityName(declared)) {
        // <UnitsInContext><Units>..</Units></UnitsInContext>: an IfcUnitAssignment
        // written without its own element.
        const v = { ref: entity(el, declared) };
        return def.aggregate ? [v] : v;
      }
      if (def.aggregate || schema.prim(declared) === "aggregate") {
        const of = def.aggregate ? declared : itemType(declared);
        return kidsEls.map((c) => item(c, of));
      }
      return item(first, declared);
    }
    if (def.aggregate) return el.text.trim() ? el.text.trim().split(/\s+/).map((x) => cast(x, declared)) : [];
    if (!el.text.trim() && schema.prim(declared) === "string") return "";
    return el.text.trim() === "" ? null : cast(el.text, declared);
  }

  function inverseOf(type, name) {
    for (let t = type; t && schema.entities[t]; t = schema.entities[t].super) {
      const f = schema.entities[t].inverseFor;
      if (f && f[name]) return f[name];
    }
    return null;
  }

  // Builds an entity from an element; returns its id.
  function entity(el, type) {
    const id = el.attrs.id !== undefined ? num(el.attrs.id) : next++;
    if (entities.has(id)) return id;
    const attrs = schema.attrs(type);
    const args = attrs.map((a) => (a.derived ? { derived: true } : null));
    entities.set(id, el.attrs.id !== undefined ? { id, type, args, xmlId: el.attrs.id } : { id, type, args });
    for (const [k, v] of Object.entries(el.attrs)) {
      if (isMeta(k)) continue;
      const i = attrs.index.get(k);
      if (i === undefined) continue;
      const a = attrs[i];
      args[i] = a.aggregate ? (v.trim() ? v.trim().split(/\s+/).map((x) => cast(x, a.type)) : []) : cast(v, a.type);
    }
    for (const c of el.children) {
      const name = c.local;
      const i = attrs.index.get(name);
      if (i !== undefined) {
        args[i] = attrValue(c, attrs[i], type);
        continue;
      }
      const inv = inverseOf(type, name);
      if (inv) {
        for (const r of c.children) {
          const v = item(r, inv[0]);
          if (v && v.ref) backrefs.push([v.ref, inv[1], id]);
        }
      }
    }
    return id;
  }

  // Top-level entities may sit under the root (IFC4) or under <uos> (IFC2X3).
  const walk = (node) => {
    for (const c of node.children) {
      const ent = entityName(xsiType(c) || c.local);
      if (ent) {
        if (c.attrs.ref === undefined) entity(c, ent);
      } else if (!/header$/i.test(c.local)) walk(c);
    }
  };
  walk(root);

  for (const [rid, attr, pid] of backrefs) {
    const r = entities.get(rid);
    if (!r) continue;
    const i = schema.attrs(r.type).index.get(attr);
    if (i === undefined) continue;
    const a = schema.attrs(r.type)[i];
    if (a.aggregate) {
      const list = Array.isArray(r.args[i]) ? r.args[i] : (r.args[i] = []);
      if (!list.some((x) => x && x.ref === pid)) list.push({ ref: pid });
    } else if (!r.args[i] || !r.args[i].ref) r.args[i] = { ref: pid };
  }
  for (const s of ids.keys()) if (!entities.has(ids.get(s))) errors.push(`ref="${s}" points at no element`);
  return { schema: null, entities, errors };
}
