// IDS 1.0 file structure, as buildingSMART's ids.xsd fixes it: which elements
// may appear where and in what order, which attributes each may carry, and the
// values a fixed-list attribute (cardinality, relation, ifcVersion, dataType)
// may take. audit.mjs checks what the file means (IFC classes, property set
// templates); this checks what a schema validator checks, so a file this
// passes is not refused by IfcTester, the IDS-Audit-tool or an authoring tool
// that validates first (eval/ids-structure-2026-11-18.md: same verdict as
// IfcTester's own ids.xsd validation on 145 of 145 public files).
//
// structureIssues(root, text?) -> [{ spec, level: "error", code, path, line, message }]
//   root: the element parseXml returned (with spans: true for line numbers);
//   spec: the specification's index in the file, or null for the file itself.

export const IDS_NS = "http://standards.buildingsmart.org/IDS";
export const XS_NS = "http://www.w3.org/2001/XMLSchema";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const XSI_NS = "http://www.w3.org/2001/XMLSchema-instance";

const VERSIONS = ["IFC2X3", "IFC4", "IFC4X3_ADD2"];
const RELATIONS = ["IFCRELAGGREGATES", "IFCRELASSIGNSTOGROUP", "IFCRELCONTAINEDINSPATIALSTRUCTURE", "IFCRELNESTS", "IFCRELVOIDSELEMENT IFCRELFILLSELEMENT"];
const SIMPLE_CARD = ["required", "prohibited"];
const COND_CARD = ["required", "prohibited", "optional"];
// XSD 1.0 constraining facets (ids.xsd is validated as XSD 1.0, so xs:assertion
// and xs:explicitTimezone are refused, as IfcTester refuses them).
const XS_FACETS = ["minExclusive", "minInclusive", "maxExclusive", "maxInclusive", "totalDigits", "fractionDigits", "length", "minLength", "maxLength", "enumeration", "whiteSpace", "pattern"];

const collapse = (s) => s.replace(/[\t\n\r ]+/g, " ").trim();
const isDate = (s) => {
  const m = /^-?(\d{4,})-(\d\d)-(\d\d)(Z|[+-](\d\d):(\d\d))?$/.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  if (d > [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]) return false;
  return !m[4] || m[4] === "Z" || (+m[5] < 14 || (m[5] === "14" && m[6] === "00")) && +m[6] < 60;
};
const NNI = /^\+?\d+$/;

// Attribute rules: name -> null (any string) | array (one of) | function (value -> problem or null).
const occurs = {
  minOccurs: (v) => (NNI.test(collapse(v)) ? null : "must be a whole number, 0 or more"),
  maxOccurs: (v) => (NNI.test(collapse(v)) || collapse(v) === "unbounded" ? null : 'must be a whole number or "unbounded"'),
};
const dataType = (v) => (/^[A-Z]+$/.test(v.replace(/[\t\n\r]/g, " ")) ? null : "must be an IFC defined type in capitals, such as IFCLABEL");
const reqExtra = (card) => ({ cardinality: card, instructions: null });

// Element models. A model's `seq` is a list of [local name, min, max, child model];
// `any: true` (requirements) lets the listed children repeat in any order, which is
// what ids.xsd's <xs:sequence maxOccurs="unbounded"> of all-optional elements means.
const VALUE = { value: true };
const entity = (attrs) => ({ attrs, seq: [["name", 1, 1, VALUE], ["predefinedType", 0, 1, VALUE]] });
const partOf = (attrs) => ({ attrs: { relation: RELATIONS, ...attrs }, seq: [["entity", 1, 1, entity({})]] });
const classification = (attrs) => ({ attrs, seq: [["value", 0, 1, VALUE], ["system", 1, 1, VALUE]] });
const attribute = (attrs) => ({ attrs, seq: [["name", 1, 1, VALUE], ["value", 0, 1, VALUE]] });
const property = (attrs) => ({ attrs: { dataType, ...attrs }, seq: [["propertySet", 1, 1, VALUE], ["baseName", 1, 1, VALUE], ["value", 0, 1, VALUE]] });
const material = (attrs) => ({ attrs, seq: [["value", 0, 1, VALUE]] });
const U = Infinity;
const APPLICABILITY = {
  attrs: { ...occurs },
  seq: [["entity", 0, 1, entity({})], ["partOf", 0, U, partOf({})], ["classification", 0, U, classification({})], ["attribute", 0, U, attribute({})], ["property", 0, U, property({})], ["material", 0, U, material({})]],
};
const REQUIREMENTS = {
  attrs: { description: null },
  any: true,
  seq: [
    ["entity", 0, U, entity({ instructions: null })],
    ["partOf", 0, U, partOf(reqExtra(SIMPLE_CARD))],
    ["classification", 0, U, classification({ uri: null, ...reqExtra(COND_CARD) })],
    ["attribute", 0, U, attribute(reqExtra(COND_CARD))],
    ["property", 0, U, property({ uri: null, ...reqExtra(COND_CARD) })],
    ["material", 0, U, material({ uri: null, ...reqExtra(COND_CARD) })],
  ],
};
const ifcVersion = (v) => {
  const list = collapse(v).split(" ").filter(Boolean);
  // ids.xsd's minLength sits on the list's items, not the list, so an empty
  // ifcVersion="" is valid to it (eval/fix-structure-2026-11-18.md); the
  // checker reads it as every version.
  if (!list.length) return null;
  const bad = list.filter((x) => !VERSIONS.includes(x));
  return bad.length ? `${bad.map((x) => JSON.stringify(x)).join(", ")} is not one of IFC2X3, IFC4, IFC4X3_ADD2${bad.includes("IFC4X3") ? ' (IDS 1.0 names IFC 4.3 "IFC4X3_ADD2")' : ""}` : null;
};
const SPECIFICATION = {
  attrs: { name: null, ifcVersion, identifier: null, description: null, instructions: null },
  required: ["name", "ifcVersion"],
  seq: [["applicability", 1, 1, APPLICABILITY], ["requirements", 0, 1, REQUIREMENTS]],
};
const TEXT = { text: true };
const INFO = {
  attrs: {},
  seq: [
    ["title", 1, 1, TEXT], ["copyright", 0, 1, TEXT], ["version", 0, 1, TEXT], ["description", 0, 1, TEXT],
    ["author", 0, 1, { text: (s) => (/^[^@]+@[^.]+\..+$/s.test(s) ? null : "must be an e-mail address (name@domain.tld)") }],
    ["date", 0, 1, { text: (s) => (isDate(collapse(s)) ? null : "must be a date written YYYY-MM-DD") }],
    ["purpose", 0, 1, TEXT], ["milestone", 0, 1, TEXT],
  ],
};
const IDS = { attrs: {}, seq: [["info", 1, 1, INFO], ["specifications", 1, 1, { attrs: {}, seq: [["specification", 1, U, SPECIFICATION]] }]] };

export function structureIssues(root, text) {
  const out = [];
  let nl = null; // newline offsets, built on the first finding
  const lineOf = (n) => {
    if (!text || n.at === undefined) return null;
    if (!nl) { nl = []; for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) nl.push(i); }
    const at = n.at - (n.base || 0);
    let lo = 0, hi = nl.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (nl[mid] < at) lo = mid + 1; else hi = mid; }
    return lo + 1;
  };
  // Namespace of each element, from the xmlns declarations in scope.
  const nsOf = (n, scope) => {
    const i = n.name.indexOf(":");
    const prefix = i < 0 ? "" : n.name.slice(0, i);
    return prefix === "xml" ? XML_NS : scope[prefix === "" ? "xmlns" : "xmlns:" + prefix] ?? (prefix ? undefined : "");
  };
  const scopeFor = (n, parent) => {
    let s = parent;
    for (const k in n.attrs) if (k === "xmlns" || k.startsWith("xmlns:")) { if (s === parent) s = { ...parent }; s[k] = n.attrs[k]; }
    return s;
  };
  let spec = null;
  // topic names a finding audit.mjs also makes in its own words (relation,
  // ifcVersion, classification-system), so the audit can keep one of the two.
  const add = (n, path, code, message, topic = null) => out.push({ spec, level: "error", code, path, line: lineOf(n), message: `${message} (ids.xsd)`, ...(topic ? { topic } : {}) });
  const elems = (n) => n.children.filter((c) => c.local);
  const hasText = (n) => /[^\t\n\r ]/.test(n.text);

  // Attributes: only those the element declares, plus xmlns, xml:* and xsi:*
  // (xsi:schemaLocation on the root is common and allowed).
  function checkAttrs(n, path, model, scope) {
    const rules = model.attrs || {};
    for (const k in n.attrs) {
      if (k === "xmlns" || k.startsWith("xmlns:")) continue;
      const i = k.indexOf(":");
      if (i >= 0) {
        const ns = k.startsWith("xml:") ? XML_NS : scope["xmlns:" + k.slice(0, i)];
        if (ns === XSI_NS || ns === XML_NS || (model.otherAttrs && ns && ns !== model.ownNs)) continue;
        add(n, path, "xsd-attribute", `<${n.local}> may not carry the attribute ${k}`);
        continue;
      }
      if (!Object.hasOwn(rules, k)) {
        const hint = k === "minOccurs" || k === "maxOccurs" ? (n.local === "specification" ? "; in IDS 1.0 it goes on <applicability>, not <specification> (IDS 0.9 put it here)" : n.local === "applicability" ? "" : '; write cardinality="required|optional|prohibited" on a requirement facet')
          : k === "datatype" ? '; the name is spelt dataType' : "";
        add(n, path, "xsd-attribute", `<${n.local}> may not carry the attribute ${k}${hint}`);
        continue;
      }
      const r = rules[k];
      const v = n.attrs[k];
      const problem = Array.isArray(r) ? (r.includes(v) ? null : `must be one of ${r.map((x) => JSON.stringify(x)).join(", ")}`) : typeof r === "function" ? r(v) : null;
      if (problem) add(n, path, "xsd-attribute-value", `${k}=${JSON.stringify(v)} on <${n.local}>: ${problem}`, k === "relation" || k === "ifcVersion" ? k : null);
    }
    for (const k of model.required || []) if (!Object.hasOwn(n.attrs, k)) add(n, path, "xsd-attribute-missing", `<${n.local}> needs the attribute ${k}`);
  }

  // An IDS value: exactly one <simpleValue> or one <xs:restriction>.
  function checkValue(n, path, scope) {
    const kids = elems(n);
    if (hasText(n)) add(n, path, "xsd-text", `<${n.local}> holds text directly; write it as <simpleValue>${collapse(n.text).slice(0, 40)}</simpleValue>`);
    if (!kids.length) { add(n, path, "xsd-missing", `<${n.local}> is empty; it needs a <simpleValue> or an <xs:restriction>`); return; }
    for (const [i, c] of kids.entries()) {
      const cs = scopeFor(c, scope);
      const ns = nsOf(c, cs);
      const p = `${path}/${c.name}`;
      if (i > 0) { add(c, p, "xsd-order", `<${n.local}> takes one <simpleValue> or one <xs:restriction>, not a second element <${c.name}>`); continue; }
      if (ns === IDS_NS && c.local === "simpleValue") {
        for (const k in c.attrs) if (!(k === "xmlns" || k.startsWith("xmlns:") || k.startsWith("xml:"))) add(c, p, "xsd-attribute", `<simpleValue> may not carry the attribute ${k}`);
        if (elems(c).length) add(c, p, "xsd-element", "<simpleValue> holds text only, not elements");
      } else if (ns === XS_NS && c.local === "restriction") checkRestriction(c, p, cs);
      else add(c, p, "xsd-element", `<${n.local}> takes <simpleValue> or <xs:restriction>, not <${c.name}>${ns !== IDS_NS && ns !== XS_NS ? " (an element outside the IDS and XML Schema namespaces)" : ""}`);
    }
  }

  function xsAttrs(c, p, cs, allowed) {
    for (const k in c.attrs) {
      if (k === "xmlns" || k.startsWith("xmlns:")) continue;
      const i = k.indexOf(":");
      if (i >= 0) { const ns = k.startsWith("xml:") ? XML_NS : cs["xmlns:" + k.slice(0, i)]; if (ns && ns !== XS_NS) continue; }
      if (!allowed.includes(k)) add(c, p, "xsd-attribute", `<${c.name}> may not carry the attribute ${k}`);
    }
  }

  // <xs:annotation>: <xs:appinfo> and <xs:documentation> only (their content is free).
  function checkAnnotation(n, path, scope) {
    xsAttrs(n, path, scope, ["id"]);
    if (hasText(n)) add(n, path, "xsd-text", "<xs:annotation> holds text directly; put it in <xs:documentation>");
    for (const c of elems(n)) if (!(nsOf(c, scopeFor(c, scope)) === XS_NS && (c.local === "appinfo" || c.local === "documentation"))) add(c, path + "/" + c.name, "xsd-element", `<xs:annotation> may hold <xs:documentation> or <xs:appinfo>, not <${c.name}>`);
  }

  // <xs:restriction base?>: annotation?, simpleType?, then XSD 1.0 facets in any order.
  function checkRestriction(n, path, scope) {
    xsAttrs(n, path, scope, ["base", "id"]);
    if (Object.hasOwn(n.attrs, "base") && !/^([A-Za-z_][\w.-]*:)?[A-Za-z_][\w.-]*$/.test(collapse(n.attrs.base))) add(n, path, "xsd-attribute-value", `base=${JSON.stringify(n.attrs.base)} on <xs:restriction> must be a type name such as xs:string`);
    if (hasText(n)) add(n, path, "xsd-text", "<xs:restriction> holds text directly; values go in a facet's value attribute, such as <xs:enumeration value=\"...\"/>");
    let stage = 0; // 0 annotation, 1 simpleType, 2 facets
    for (const c of elems(n)) {
      const cs = scopeFor(c, scope);
      const ns = nsOf(c, cs);
      const p = `${path}/${c.name}`;
      if (ns !== XS_NS) { if (ns && ns !== IDS_NS) continue; add(c, p, "xsd-element", `<xs:restriction> may not hold <${c.name}>`); continue; }
      if (c.local === "annotation" && stage === 0) { stage = 1; checkAnnotation(c, p, cs); continue; }
      if (c.local === "simpleType" && stage <= 1) { stage = 2; continue; }
      if (XS_FACETS.includes(c.local)) {
        stage = 2;
        xsAttrs(c, p, cs, ["value", "id", ...(c.local === "enumeration" || c.local === "pattern" ? [] : ["fixed"])]);
        if (hasText(c)) add(c, p, "xsd-text", `<${c.name}> holds text; its value goes in the value attribute: <${c.name} value="${collapse(c.text).slice(0, 40)}"/>`);
        for (const g of elems(c)) if (nsOf(g, scopeFor(g, cs)) === XS_NS && g.local === "annotation") checkAnnotation(g, p + "/" + g.name, scopeFor(g, cs)); else add(g, p + "/" + g.name, "xsd-element", `<${c.name}> may hold only an <xs:annotation>, not <${g.name}>`);
        if (!Object.hasOwn(c.attrs, "value")) add(c, p, "xsd-attribute-missing", `<${c.name}> needs a value attribute`);
        else {
          const v = collapse(c.attrs.value);
          if (["length", "minLength", "maxLength", "fractionDigits"].includes(c.local) && !NNI.test(v)) add(c, p, "xsd-attribute-value", `<${c.name}> value ${JSON.stringify(c.attrs.value)} must be a whole number, 0 or more`);
          if (c.local === "totalDigits" && !(NNI.test(v) && +v > 0)) add(c, p, "xsd-attribute-value", `<${c.name}> value ${JSON.stringify(c.attrs.value)} must be a whole number, 1 or more`);
          if (c.local === "whiteSpace" && !["preserve", "replace", "collapse"].includes(v)) add(c, p, "xsd-attribute-value", `<${c.name}> value must be preserve, replace or collapse`);
        }
        continue;
      }
      add(c, p, "xsd-element", `<xs:restriction> may not hold <${c.name}>${c.local === "assertion" || c.local === "explicitTimezone" ? " (an XSD 1.1 facet; IDS 1.0 is validated as XSD 1.0)" : ""}`);
    }
  }

  function check(n, path, model, scope) {
    if (model.value) { checkAttrsValue(n, path, scope); checkValue(n, path, scope); return; }
    checkAttrs(n, path, model, scope);
    if (model.text) {
      if (elems(n).length) add(n, path, "xsd-element", `<${n.local}> holds text only, not elements`);
      else if (typeof model.text === "function") { const pr = model.text(n.text); if (pr) add(n, path, "xsd-text", `<${n.local}> ${JSON.stringify(n.text.trim().slice(0, 60))}: ${pr}`); }
      return;
    }
    if (hasText(n)) add(n, path, "xsd-text", `<${n.local}> holds text outside its child elements: ${JSON.stringify(collapse(n.text).slice(0, 40))}`);
    const kids = elems(n);
    const counts = new Map();
    let at = 0; // position in model.seq (ordered models)
    const index = new Map(model.seq.map((s, i) => [s[0], i]));
    for (const [ci, c] of kids.entries()) {
      const cs = scopeFor(c, scope);
      const ns = nsOf(c, cs);
      const k = counts.get(c.local) || 0;
      const p = `${path}/${c.name}${k ? `[${k + 1}]` : ""}`;
      const i = ns === IDS_NS ? index.get(c.local) : undefined;
      if (i === undefined) {
        const expected = model.seq.map((s) => s[0]);
        add(c, p, "xsd-element", `<${n.local}> may not hold <${c.name}>${ns !== IDS_NS && index.has(c.local) ? " (it is outside the IDS namespace " + IDS_NS + ")" : ""}; it takes ${expected.map((x) => "<" + x + ">").join(", ")}`);
        continue;
      }
      if (!model.any && i < at) {
        add(c, p, "xsd-order", `<${c.local}> comes after <${model.seq[at][0]}> in <${n.local}>; ids.xsd fixes the order ${model.seq.map((s) => "<" + s[0] + ">").join(", ")}`);
        counts.set(c.local, k + 1);
        continue;
      }
      // Missing required elements before this one.
      if (!model.any) for (let j = at; j < i; j++) { const [name, min] = model.seq[j]; if (min > (counts.get(name) || 0) && !kids.slice(ci + 1).some((x) => x.local === name)) add(c, p, "xsd-missing", `<${n.local}> needs <${name}> before <${c.local}>`, n.local === "classification" && name === "system" ? "classification-system" : null); }
      if (!model.any) at = i;
      if (k + 1 > model.seq[i][2]) { add(c, p, "xsd-count", `<${n.local}> takes at most ${model.seq[i][2]} <${c.local}>`); counts.set(c.local, k + 1); continue; }
      counts.set(c.local, k + 1);
      const prevSpec = spec;
      if (model === SPECS_MODEL) spec = k;
      check(c, p, model.seq[i][3], cs);
      spec = prevSpec;
    }
    for (const [name, min] of model.seq.slice(model.any ? 0 : at)) if (min > (counts.get(name) || 0) && !(model.any && min === 0)) {
      add(n, path, "xsd-missing", `<${n.local}> needs <${name}>${name === "specification" ? "; an IDS file must hold at least one specification" : ""}`, n.local === "classification" && name === "system" ? "classification-system" : null);
    }
  }
  // Facets that are idsValues carry no attributes.
  function checkAttrsValue(n, path, scope) {
    for (const k in n.attrs) {
      if (k === "xmlns" || k.startsWith("xmlns:")) continue;
      const i = k.indexOf(":");
      if (i >= 0) { const ns = k.startsWith("xml:") ? XML_NS : scope["xmlns:" + k.slice(0, i)]; if (ns === XSI_NS || ns === XML_NS) continue; }
      add(n, path, "xsd-attribute", `<${n.local}> may not carry the attribute ${k}`);
    }
  }

  // xml.mjs reads a bare "&" as text; an XML parser (and so every validator)
  // refuses the file. Comments and CDATA may hold one.
  if (text) {
    const bare = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|&(?!(?:#\d+|#x[0-9a-fA-F]+|[A-Za-z_][\w.-]*);)/g;
    for (let m; (m = bare.exec(text));) {
      if (m[0] !== "&") continue;
      const line = text.slice(0, m.index).split("\n").length;
      out.push({ spec: null, level: "error", code: "xml-ampersand", path: null, line, message: `line ${line}: a bare "&" is not well-formed XML, so validators refuse the whole file; write &amp;amp; (${JSON.stringify(text.slice(Math.max(0, m.index - 20), m.index + 20).replace(/\s+/g, " "))})` });
      break;
    }
  }
  const scope = scopeFor(root, {});
  const ns = nsOf(root, scope);
  if (root.local !== "ids" || ns !== IDS_NS) {
    add(root, "/" + root.name, "xsd-root", root.local === "ids"
      ? `the root <${root.name}> is in the namespace ${JSON.stringify(ns || "(none)")}; IDS 1.0 files use xmlns="${IDS_NS}" (the schema's location goes in xsi:schemaLocation, not the namespace)`
      : `the root element is <${root.name}>, not <ids>`);
    return out;
  }
  check(root, "/" + root.name, IDS, scope);
  return out;
}
const SPECS_MODEL = IDS.seq[1][3];
