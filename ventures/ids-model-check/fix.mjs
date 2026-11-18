// Repairs the ids.xsd faults that have exactly one right answer, as small
// edits to the file's own text: everything else in the file (comments,
// indentation, attribute order, prefixes) stays as written, and the checker
// reads the same specifications before and after (eval/fix-structure-2026-11-18.md).
//
// fixStructure(text, { wordClass }) -> { text, fixes: [{ code, line, message }], remaining: [structure findings] }
//   text: the repaired file (the input unchanged when nothing applied);
//   fixes: what was changed, with the line in the input it was on;
//   remaining: structureIssues() on the repaired file, the faults that need
//   a person (an author that is not an e-mail address, an unknown element).
//
// What it changes, each a fault real IDS files show (eval/ids-structure-2026-11-18.md):
//   - a bare "&" (not well-formed XML) -> &amp;
//   - the root namespace given as the schema's URL, or none -> the IDS 1.0 namespace;
//     an xs: prefix used but never declared -> declared on the root; a <restriction>
//     with no prefix -> <xs:restriction>
//   - ifcVersion "IFC4X3" (and _TC1, _ADD1, lower case) -> "IFC4X3_ADD2", the one IDS 1.0 names
//   - minOccurs/maxOccurs on <specification> (IDS 0.9) -> on <applicability>
//   - minOccurs/maxOccurs on a requirement facet (IDS 0.9) -> cardinality, read the way
//     the checker already reads it
//   - IDS 0.9 names: a property facet's <name> -> <baseName>, datatype -> dataType;
//     a cardinality, relation or dataType in the wrong case
//   - a value written as bare text -> wrapped in <simpleValue>
//   - children out of the order ids.xsd fixes (info fields, applicability facets,
//     a facet's own parts, applicability before requirements) -> reordered, when
//     nothing but whitespace sits between them
//   - an info <date> written with a time -> the date
//   - an xs:pattern in another regex dialect ("(?:", "^...$", "\\/", "{,n}") -> the XSD
//     spelling of the same pattern (eval/xsd-regex-2026-11-18.md)
//   - only when asked (`wordClass` "xsd" or "letters", a person's choice): a bare
//     \w, \W, \s or \S in a pattern -> a class every checker reads alike (xsdregex.mjs
//     spellWordClass, eval/word-class-2026-11-18.md)
// Not changed (no single right answer): an author that is not an e-mail
// address, an element ids.xsd does not have, a missing required element.

import { parseXml } from "./xml.mjs";
import { structureIssues, IDS_NS, XS_NS } from "./structure.mjs";
import { parseXsdRegex, repairXsdRegex, spellWordClass } from "./xsdregex.mjs";

const VERSIONS = ["IFC2X3", "IFC4", "IFC4X3_ADD2"];
const RELATIONS = ["IFCRELAGGREGATES", "IFCRELASSIGNSTOGROUP", "IFCRELCONTAINEDINSPATIALSTRUCTURE", "IFCRELNESTS"];
const XS_FACETS = new Set(["minExclusive", "minInclusive", "maxExclusive", "maxInclusive", "totalDigits", "fractionDigits", "length", "minLength", "maxLength", "enumeration", "whiteSpace", "pattern"]);
const VALUE_PARTS = new Set(["name", "predefinedType", "value", "system", "propertySet", "baseName"]);
const FACETS = new Set(["entity", "partOf", "classification", "attribute", "property", "material"]);
// Child order ids.xsd fixes, per parent (requirements takes its facets in any order).
const ORDER = {
  ids: ["info", "specifications"],
  info: ["title", "copyright", "version", "description", "author", "date", "purpose", "milestone"],
  specification: ["applicability", "requirements"],
  applicability: ["entity", "partOf", "classification", "attribute", "property", "material"],
  entity: ["name", "predefinedType"],
  partOf: ["entity"],
  classification: ["value", "system"],
  attribute: ["name", "value"],
  property: ["propertySet", "baseName", "value"],
  material: ["value"],
};
const CARD = { partOf: ["required", "prohibited"], classification: ["required", "prohibited", "optional"], attribute: ["required", "prohibited", "optional"], property: ["required", "prohibited", "optional"], material: ["required", "prohibited", "optional"] };

// The start tag of an element that begins at `at`: its end offset and each
// attribute's [name, from, to] span (from the space before it to after its value).
function startTag(text, at) {
  const tm = /<([^\s/>]+)/y;
  tm.lastIndex = at;
  const m = tm.exec(text);
  let q = tm.lastIndex;
  const attrs = [];
  const attr = /(\s*)([^\s=/>]+)\s*=\s*("[^"]*"|'[^']*')/y;
  for (;;) {
    attr.lastIndex = q;
    const am = attr.exec(text);
    if (!am) break;
    attrs.push({ name: am[2], from: q, to: attr.lastIndex, quote: am[3][0] });
    q = attr.lastIndex;
  }
  const close = text.indexOf(">", q);
  return { name: m[1], nameEnd: at + 1 + m[1].length, end: close + 1, selfClosing: text[close - 1] === "/", attrs };
}

const esc = (v) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

function lineAt(text) {
  const nl = [];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) nl.push(i);
  return (at) => { let lo = 0, hi = nl.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (nl[mid] < at) lo = mid + 1; else hi = mid; } return lo + 1; };
}

// Bare "&" outside comments and CDATA.
function fixAmpersands(text, fixes) {
  const line = lineAt(text);
  let n = 0, first = null;
  const out = text.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|&(?!(?:#\d+|#x[0-9a-fA-F]+|[A-Za-z_][\w.-]*);)/g, (m, off) => {
    if (m !== "&") return m;
    n++; first ??= off;
    return "&amp;";
  });
  if (n) fixes.push({ code: "xml-ampersand", line: line(first), message: `${n} bare "&" written as &amp; (an XML parser refuses a bare one)` });
  return out;
}

// One pass over the parsed file: start-tag rewrites and content edits, none overlapping.
function onePass(text, fixes, opts = {}) {
  const root = parseXml(text, { spans: true });
  const line = lineAt(text);
  const edits = []; // { from, to, text }
  // Attribute edits per start tag, applied together as one replacement of the tag.
  const tagEdits = new Map(); // at -> { tag, set: Map(name -> value|null), rename: Map(old -> new), add: [[k, v]] }
  const tagOf = (n) => {
    let t = tagEdits.get(n.at);
    if (!t) { t = { n, tag: startTag(text, n.at), set: new Map(), rename: new Map(), add: [] }; tagEdits.set(n.at, t); }
    return t;
  };
  // Each note is kept only if the edit it describes is applied this pass
  // (an edit inside a reordered block waits for the next pass).
  const notes = [];
  const note = (n, code, message, anchor = n.at) => notes.push({ anchor, fix: { code, line: line(n.at), message } });
  const elems = (n) => n.children.filter((c) => c.local);

  // Namespaces: which prefix the IDS elements use and whether xs: is declared.
  const rootPrefix = root.name.includes(":") ? root.name.slice(0, root.name.indexOf(":")) : "";
  const nsAttr = rootPrefix ? "xmlns:" + rootPrefix : "xmlns";
  const wrongIds = (v) => v !== IDS_NS && /buildingsmart\.org\/ids/i.test(v);
  let usesXs = false;
  const walkNs = (n, declared) => {
    let d = declared;
    for (const k in n.attrs) {
      if (k === "xmlns" || k.startsWith("xmlns:")) {
        if (wrongIds(n.attrs[k])) { tagOf(n).set.set(k, IDS_NS); note(n, "xsd-root", `${k}="${n.attrs[k]}" is the schema's address, not the IDS 1.0 namespace; now ${IDS_NS}`); }
        if (k === "xmlns:xs") d = true;
      }
    }
    if (n.name.startsWith("xs:") && !d) usesXs = true;
    for (const c of elems(n)) walkNs(c, d);
  };
  walkNs(root, false);
  if (root.local === "ids" && root.attrs[nsAttr] === undefined) {
    tagOf(root).add.push([nsAttr, IDS_NS]);
    note(root, "xsd-root", `the root <${root.name}> had no namespace; added ${nsAttr}="${IDS_NS}"`);
  }

  // Elements, by local name and place.
  const walk = (n, parent, inReq) => {
    const kidsOf = elems(n);
    // Children out of the order ids.xsd fixes.
    const order = Object.hasOwn(ORDER, n.local) ? ORDER[n.local] : null;
    if (order) {
      const idx = kidsOf.map((c) => order.indexOf(c.local));
      const sorted = idx.every((i) => i >= 0) && idx.every((v, i) => i === 0 || idx[i - 1] <= v);
      if (!sorted && idx.every((i) => i >= 0)) {
        const gaps = kidsOf.slice(1).map((c, i) => text.slice(kidsOf[i].end, c.at));
        if (gaps.every((g) => !/[^\t\n\r ]/.test(g))) {
          const pieces = kidsOf.map((c) => text.slice(c.at, c.end));
          const perm = kidsOf.map((_, i) => i).sort((a, b) => idx[a] - idx[b] || a - b);
          let out = pieces[perm[0]];
          for (let i = 1; i < perm.length; i++) out += gaps[i - 1] + pieces[perm[i]];
          edits.push({ from: kidsOf[0].at, to: kidsOf[kidsOf.length - 1].end, text: out, order: true });
          note(n, "xsd-order", `children of <${n.local}> put in the order ids.xsd fixes: ${perm.map((i) => "<" + kidsOf[i].local + ">").join(", ")}`, kidsOf[0].at);
          return; // it and its subtree wait for the next pass
        }
      }
    }
    if (n.local === "specification") {
      const v = n.attrs.ifcVersion;
      if (v !== undefined) {
        const map = (x) => { const u = x.toUpperCase(); return /^IFC4X3(_\w+)?$/.test(u) ? "IFC4X3_ADD2" : u; };
        const list = [...new Set(v.split(/[\t\n\r ]+/).filter(Boolean).map(map))];
        const fixed = list.join(" ");
        if (fixed !== v && list.length && list.every((x) => VERSIONS.includes(x))) { tagOf(n).set.set("ifcVersion", fixed); note(n, "xsd-attribute-value", `ifcVersion="${v}" is now "${fixed}" (the names IDS 1.0 has)`); }
      }
      const occ = ["minOccurs", "maxOccurs"].filter((k) => n.attrs[k] !== undefined);
      const app = kidsOf.find((c) => c.local === "applicability");
      if (occ.length && app) {
        for (const k of occ) {
          tagOf(n).set.set(k, null);
          if (app.attrs[k] === undefined) tagOf(app).add.push([k, n.attrs[k]]);
        }
        note(n, "xsd-attribute", `${occ.join(" and ")} moved from <specification> to <applicability> (IDS 0.9 put ${occ.length > 1 ? "them" : "it"} on the specification)`);
      }
    }
    if (FACETS.has(n.local) && parent && (parent.local === "requirements" || parent.local === "applicability")) {
      const t = () => tagOf(n);
      if (n.attrs.datatype !== undefined && n.attrs.dataType === undefined && n.local === "property") { t().rename.set("datatype", "dataType"); note(n, "xsd-attribute", "datatype is spelt dataType"); }
      const dt = n.attrs.dataType ?? (n.local === "property" ? n.attrs.datatype : undefined);
      if (dt !== undefined && /^[A-Za-z]+$/.test(dt.trim()) && dt !== dt.trim().toUpperCase()) {
        t().set.set(n.attrs.dataType !== undefined ? "dataType" : "datatype", dt.trim().toUpperCase());
        note(n, "xsd-attribute-value", `dataType="${dt}" is now "${dt.trim().toUpperCase()}" (ids.xsd takes IFC type names in capitals)`);
      }
      if (n.attrs.relation !== undefined && n.attrs.relation !== n.attrs.relation.toUpperCase()) {
        const r = n.attrs.relation.trim().toUpperCase();
        if (RELATIONS.includes(r)) { t().set.set("relation", r); note(n, "xsd-attribute-value", `relation="${n.attrs.relation}" is now "${r}"`); }
      }
      if (inReq) {
        const c = n.attrs.cardinality;
        if (c !== undefined && c !== c.trim().toLowerCase() && (Object.hasOwn(CARD, n.local) ? CARD[n.local] : []).includes(c.trim().toLowerCase())) {
          t().set.set("cardinality", c.trim().toLowerCase()); note(n, "xsd-attribute-value", `cardinality="${c}" is now "${c.trim().toLowerCase()}"`);
        }
        const occ = ["minOccurs", "maxOccurs"].filter((k) => n.attrs[k] !== undefined);
        if (occ.length && c === undefined) {
          // ids.mjs readFacets reads IDS 0.9 occurs this way; write what it reads.
          const card = n.attrs.maxOccurs === "0" ? "prohibited" : n.attrs.minOccurs === "0" ? "optional" : "required";
          if ((Object.hasOwn(CARD, n.local) ? CARD[n.local] : []).includes(card)) {
            for (const k of occ) t().set.set(k, null);
            if (card !== "required" || n.local !== "entity") t().add.push(["cardinality", card]);
            note(n, "xsd-attribute", `${occ.map((k) => `${k}="${n.attrs[k]}"`).join(" ")} on <${n.local}> (IDS 0.9) is now cardinality="${card}"`);
          } else if (n.local === "entity" && card === "required") {
            for (const k of occ) t().set.set(k, null);
            note(n, "xsd-attribute", `${occ.join(" and ")} on a required <entity> facet dropped (IDS 1.0 entity requirements carry no cardinality)`);
          }
        }
      }
    }
    // IDS 0.9 named a property facet's property <name>; 1.0 calls it <baseName>.
    if (n.local === "name" && parent?.local === "property" && !elems(parent).some((c) => c.local === "baseName")) {
      const pre = n.name.slice(0, n.name.length - 4);
      edits.push({ from: n.at + 1, to: n.at + 1 + n.name.length, text: pre + "baseName" });
      const tag = startTag(text, n.at);
      if (!tag.selfClosing) { const c = text.lastIndexOf("</", n.end - 1); edits.push({ from: c + 2, to: c + 2 + n.name.length, text: pre + "baseName" }); }
      note(n, "xsd-element", "<name> in a property facet is now <baseName> (IDS 0.9 called it name)", n.at + 1);
    }
    // A <restriction> written without the xs: prefix (in the IDS namespace):
    // it and its facets become xs: elements, the names IDS 1.0 reads.
    if (VALUE_PARTS.has(n.local) && parent && FACETS.has(parent.local) && (root.attrs["xmlns:xs"] === undefined || root.attrs["xmlns:xs"] === XS_NS)) {
      const r = kidsOf.find((c) => c.name === "restriction");
      if (r) {
        const rename = (e) => {
          edits.push({ from: e.at + 1, to: e.at + 1 + e.name.length, text: "xs:" + e.name });
          if (!startTag(text, e.at).selfClosing) { const c = text.lastIndexOf("</", e.end - 1); edits.push({ from: c + 2, to: c + 2 + e.name.length, text: "xs:" + e.name }); }
        };
        rename(r);
        for (const f of elems(r)) if (!f.name.includes(":") && (XS_FACETS.has(f.name) || f.name === "annotation")) rename(f);
        usesXs = true;
        note(r, "xsd-element", "<restriction> is now <xs:restriction>, with its facets (ids.xsd takes them in the XML Schema namespace)", r.at + 1);
      }
    }
    // A value part holding bare text: wrap it in <simpleValue>.
    if (VALUE_PARTS.has(n.local) && parent && (FACETS.has(parent.local)) && !kidsOf.length && /[^\t\n\r ]/.test(n.text)) {
      const tag = startTag(text, n.at);
      if (!tag.selfClosing) {
        const inner0 = tag.end, inner1 = text.lastIndexOf("<", n.end - 1);
        const raw = text.slice(inner0, inner1);
        const prefix = n.name.includes(":") ? n.name.slice(0, n.name.indexOf(":") + 1) : "";
        edits.push({ from: inner0, to: inner1, text: `<${prefix}simpleValue>${raw.trim()}</${prefix}simpleValue>` });
        note(n, "xsd-text", `<${n.local}>${raw.trim().slice(0, 40)}</${n.local}> is now <${n.local}><simpleValue>${raw.trim().slice(0, 40)}</simpleValue></${n.local}>`, inner0);
      }
    }
    // An xs:pattern written in another regex dialect: "(?:" groups, anchors,
    // needless backslashes, "{,n}" (xsdregex.mjs repairXsdRegex). Anchors are
    // dropped too: in XSD "^" and "$" are characters, and a pattern already
    // spans the whole value, so the author's meaning is the pattern without them.
    if (n.local === "pattern" && typeof n.attrs.value === "string") {
      const p = n.attrs.value;
      const r = parseXsdRegex(p);
      const cut = (x) => x.length > 60 ? x.slice(0, 57) + "..." : x;
      let fixed = repairXsdRegex(p);
      if (fixed !== null && !(!r.ok || r.notes.some((x) => x.fix))) fixed = null;
      if (fixed !== null) note(n, "pattern-xsd", `pattern /${cut(p)}/ is now /${cut(fixed)}/ (${r.ok ? r.notes.filter((x) => x.fix).map((x) => x.fix).join(", ") : r.error.split(";")[0]})`);
      const word = opts.wordClass ? spellWordClass(fixed ?? p, opts.wordClass) : null;
      if (word !== null) note(n, "pattern-word-class", `pattern /${cut(fixed ?? p)}/ is now /${cut(word)}/ (a bare \\w or \\s spelled ${opts.wordClass === "xsd" ? "as the IDS standard reads it" : "as IfcTester reads it: \\w letters, digits and underscore, \\s any space"}, so every checker reads it alike)`);
      if (word !== null || fixed !== null) tagOf(n).set.set("value", word ?? fixed);
    }
    // A date with a time: keep the date.
    if (n.local === "date" && parent?.local === "info" && !kidsOf.length) {
      const m = /^\s*(-?\d{4,}-\d\d-\d\d)T[\d:.]+(Z|[+-]\d\d:\d\d)?\s*$/.exec(n.text);
      if (m) {
        const tag = startTag(text, n.at);
        edits.push({ from: tag.end, to: text.lastIndexOf("<", n.end - 1), text: m[1] });
        note(n, "xsd-text", `<date>${n.text.trim()}</date> is now <date>${m[1]}</date> (xs:date takes no time)`, tag.end);
      }
    }
    for (const c of kidsOf) walk(c, n, inReq || n.local === "requirements");
  };
  if (root.local === "ids") walk(root, null, false);
  if (usesXs && root.attrs["xmlns:xs"] === undefined) {
    tagOf(root).add.push(["xmlns:xs", XS_NS]);
    note(root, "xsd-element", `xs: elements are used but the xs: prefix was never declared; added xmlns:xs="${XS_NS}" on the root`);
  }

  for (const { n, tag, set, rename, add } of tagEdits.values()) {
    let s = text.slice(n.at, tag.end);
    const off = n.at;
    // Rebuild attribute by attribute from the end, so earlier offsets hold.
    for (const a of [...tag.attrs].reverse()) {
      const a0 = a.from - off, a1 = a.to - off;
      let piece = s.slice(a0, a1);
      if (set.has(a.name)) { const v = set.get(a.name); piece = v === null ? "" : piece.replace(/(["'])[^"']*\1$/, `${a.quote}${esc(v)}${a.quote}`); }
      if (piece && rename.has(a.name)) piece = piece.replace(a.name, rename.get(a.name));
      s = s.slice(0, a0) + piece + s.slice(a1);
    }
    const nameEnd = tag.nameEnd - off;
    const added = add.map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
    s = s.slice(0, nameEnd) + added + s.slice(nameEnd);
    edits.push({ from: n.at, to: tag.end, text: s });
  }
  // Drop edits that fall inside a reordered block (they run on the next pass).
  const blocks = edits.filter((e) => e.order);
  const keep = edits.filter((e) => e.order || !blocks.some((b) => e.from >= b.from && e.to <= b.to));
  keep.sort((a, b) => b.from - a.from);
  let out = text;
  let last = Infinity;
  const applied = new Set();
  for (const e of keep) {
    if (e.to > last) continue; // overlapping: next pass
    out = out.slice(0, e.from) + e.text + out.slice(e.to);
    last = e.from;
    applied.add(e.from);
  }
  for (const x of notes) if (applied.has(x.anchor)) fixes.push(x.fix);
  return out;
}

export function fixStructure(text, opts = {}) {
  const fixes = [];
  let cur = fixAmpersands(text, fixes);
  try {
    for (let pass = 0; pass < 4; pass++) {
      const next = onePass(cur, fixes, opts);
      if (next === cur) break;
      cur = next;
    }
  } catch (e) {
    return { text, fixes: [], remaining: [], error: String(e.message || e) };
  }
  // Lines refer to the input; a later pass's lines refer to its own text, close enough
  // for a list of what changed, and identical when one pass did it all.
  let remaining = [];
  try { remaining = structureIssues(parseXml(cur, { spans: true }), cur); } catch (e) { return { text: cur, fixes, remaining: [], error: String(e.message || e) }; }
  return { text: cur, fixes, remaining };
}
