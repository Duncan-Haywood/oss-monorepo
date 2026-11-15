// Structure and value checks for a Hungarian NAV Online Számla 3.0 InvoiceData file, read
// from NAV's own schema (invoiceData.xsd, invoiceBase.xsd and the NTCA common 1.0
// common.xsd it imports) by build-nav-schema.mjs. NAV validates every report against the
// XSD before any business rule (the interface specification's blocking code
// SCHEMA_VIOLATION); a file that fails it is refused outright.
//   HU-027 an element the schema does not allow here, or one too many
//   HU-028 elements out of sequence, or a block that is incomplete
//   HU-029 a required element missing
//   HU-030 a value outside its length / pattern / range / digits / code list
//   HU-031 an element in the wrong namespace (data:, base: or common: swapped)
//   HU-032 a required attribute missing
// The content-model matcher is the one fa3-xsd.mjs uses (a set-of-positions walk). Unlike
// the shared parseXmlTree, the tree here keeps each element's namespace, because a NAV
// file mixes three (OSA/3.0/data, OSA/3.0/base, NTCA/1.0/common) and an element in the
// wrong one is a schema error even when its local name is right.
// Messages name the element and the reason and never echo the value.
import schema from "./nav-xsd-data.mjs";

export const NAV_XSD_SOURCE = schema.source;
const NS = schema.namespaces;
const PREFIX_OF = Object.fromEntries(Object.entries(NS).map(([p, uri]) => [uri, p]));
const finding = (rule, message, fix, path) => ({ rule, message, fix, path });
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeXmlEntities = (s) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : Object.hasOwn(ENT, e) ? ENT[e] : m);

/** A namespace-aware element tree: { name, ns (URI or ""), text, children, attrs }. */
export function parseNsTree(text) {
  const tokens = text.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[^>]+>|[^<]+/g) || [];
  const root = { name: "#root", ns: "", text: "", children: [], attrs: {}, scope: {} };
  const stack = [root];
  for (const token of tokens) {
    const top = stack[stack.length - 1];
    if (token.startsWith("<?") || token.startsWith("<!--")) continue;
    if (token.startsWith("<![CDATA[")) { top.text += token.slice(9, -3); continue; }
    if (token.startsWith("</")) { if (stack.length > 1) stack.pop(); continue; }
    if (token.startsWith("<")) {
      const selfClosing = /\/>$/.test(token);
      const qname = token.slice(1).split(/[\s>/]/, 1)[0];
      const scope = { ...top.scope };
      const attrs = {};
      const re = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      for (let m = re.exec(token); m; m = re.exec(token)) {
        const value = decodeXmlEntities(m[2] ?? m[3]);
        if (m[1] === "xmlns") scope[""] = value;
        else if (m[1].startsWith("xmlns:")) scope[m[1].slice(6)] = value;
        else if (!m[1].includes(":")) attrs[m[1]] = value;
      }
      const colon = qname.indexOf(":");
      const prefix = colon < 0 ? "" : qname.slice(0, colon);
      const node = { name: colon < 0 ? qname : qname.slice(colon + 1), ns: scope[prefix] ?? "", prefixKnown: prefix in scope || prefix === "", text: "", children: [], attrs, scope };
      top.children.push(node);
      if (!selfClosing) stack.push(node);
      continue;
    }
    top.text += decodeXmlEntities(token);
  }
  return root;
}

const regexCache = new Map();
const xsdRegex = (source) => {
  let re = regexCache.get(source);
  if (!re) regexCache.set(source, (re = new RegExp(`^(?:${source})$`, "u")));
  return re;
};

const foldCache = new Map();
function fold(type) {
  if (foldCache.has(type)) return foldCache.get(type);
  const def = schema.simple[type];
  let r;
  if (!def) r = { base: type, patterns: [] };
  else {
    const up = fold(def.base);
    const { pattern, ...own } = def;
    r = { ...up, ...own, base: up.base, patterns: pattern ? [...up.patterns, pattern] : up.patterns };
  }
  foldCache.set(type, r);
  return r;
}

const COLLAPSE = new Set(["token", "decimal", "integer", "nonNegativeInteger", "positiveInteger", "int", "long", "date", "dateTime", "boolean"]);
const realDate = (d) => !Number.isNaN(Date.parse(d)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

/** Why `raw` is not a valid value of simple type `type`, or "". */
export function navValueProblem(type, raw) {
  const t = fold(type);
  const ws = t.whiteSpace ?? (COLLAPSE.has(t.base) ? "collapse" : t.base === "normalizedString" ? "replace" : "preserve");
  const value = ws === "collapse" ? raw.trim().replace(/\s+/g, " ") : ws === "replace" ? raw.replace(/[\t\r\n]/g, " ") : raw;
  const chars = [...value].length;
  if (t.length !== undefined && chars !== t.length) return `must be exactly ${t.length} characters`;
  if (t.minLength !== undefined && chars < t.minLength) return chars ? `must be at least ${t.minLength} characters` : "is empty";
  if (t.maxLength !== undefined && chars > t.maxLength) return `is longer than ${t.maxLength} characters`;
  const whole = ["integer", "nonNegativeInteger", "positiveInteger", "int", "long"].includes(t.base);
  if (whole && !/^[+-]?\d+$/.test(value)) return "is not a whole number";
  if (t.base === "nonNegativeInteger" && /^-0*[1-9]/.test(value)) return "must not be negative";
  if (t.base === "positiveInteger" && !(Number(value) > 0)) return "must be above 0";
  if (t.base === "int" && whole && (Number(value) > 2147483647 || Number(value) < -2147483648)) return "is too large for the schema's int type";
  if (t.base === "decimal" && !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(value)) return "is not a number";
  if (t.base === "date" && !(/^\d{4}-\d{2}-\d{2}(Z|[+-]\d{2}:\d{2})?$/.test(value) && realDate(value.slice(0, 10)))) return "is not a YYYY-MM-DD date";
  if (t.base === "dateTime" && !(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(value) && realDate(value.slice(0, 10)))) return "is not a date and time (YYYY-MM-DDThh:mm:ssZ)";
  if (t.base === "boolean" && !["true", "false", "1", "0"].includes(value)) return "is not true or false";
  if (t.base === "decimal" || whole) {
    const [intRaw, fracRaw = ""] = value.replace(/^[+-]/, "").split(".");
    const int = intRaw.replace(/^0+/, "");
    const frac = fracRaw.replace(/0+$/, "");
    if (t.totalDigits !== undefined && int.length + frac.length > t.totalDigits) return `has more than ${t.totalDigits} digits`;
    if (t.fractionDigits !== undefined && frac.length > t.fractionDigits) return `has more than ${t.fractionDigits} decimal places`;
    const n = Number(value);
    if (typeof t.minInclusive === "number" && n < t.minInclusive) return `is below ${t.minInclusive}`;
    if (typeof t.maxInclusive === "number" && n > t.maxInclusive) return `is above ${t.maxInclusive}`;
    if (typeof t.minExclusive === "number" && n <= t.minExclusive) return `must be above ${t.minExclusive}`;
    if (typeof t.maxExclusive === "number" && n >= t.maxExclusive) return `must be below ${t.maxExclusive}`;
  }
  if (t.base === "date" && typeof t.minInclusive === "string" && value.slice(0, 10) < t.minInclusive) return `is before ${t.minInclusive}`;
  if (t.base === "dateTime" && typeof t.minInclusive === "string" && Date.parse(value) < Date.parse(t.minInclusive)) return `is before ${t.minInclusive.slice(0, 10)}`;
  if (!t.patterns.every((alts) => alts.some((p) => xsdRegex(p).test(value)))) return "does not match the format the schema requires";
  if (t.enum && !t.enum.includes(value)) return t.enum.length <= 16 ? `is not one of ${t.enum.join(", ")}` : "is not in the schema's code list";
  return "";
}

// Content-model matching: ends(p, pos) is the set of child positions reachable after one
// occurrence of particle p; rep() applies its occurrence counts.
function matcher(model, kids) {
  const need = new Map();
  let far = 0;
  const memo = new Map();
  const ids = new Map();
  const ends = (p, pos) => {
    if (p.k === "e") {
      if (kids[pos] && kids[pos].name === p.name) { far = Math.max(far, pos + 1); return new Set([pos + 1]); }
      if (!need.has(pos)) need.set(pos, new Set());
      need.get(pos).add(p.name);
      return new Set();
    }
    if (p.k === "c") return new Set(p.items.flatMap((it) => [...rep(it, pos)]));
    let cur = new Set([pos]);
    for (const it of p.items) {
      const next = new Set();
      for (const q of cur) for (const r of rep(it, q)) next.add(r);
      cur = next;
    }
    return cur;
  };
  const rep = (p, pos) => {
    if (!ids.has(p)) ids.set(p, ids.size);
    const key = `${ids.get(p)}:${pos}`;
    if (memo.has(key)) return memo.get(key);
    const out = new Set();
    let layer = new Set([pos]);
    if (p.min === 0) out.add(pos);
    for (let count = 1; layer.size && (p.max < 0 || count <= p.max) && count <= kids.length + p.min + 1; count++) {
      const next = new Set();
      for (const q of layer) for (const r of ends(p, q)) next.add(r);
      if (count >= p.min) next.forEach((r) => out.add(r));
      layer = next;
    }
    memo.set(key, out);
    return out;
  };
  return { ok: rep(model, 0).has(kids.length), far, need };
}

const infoCache = new Map();
function info(typeName) {
  let i = infoCache.get(typeName);
  if (i) return i;
  const types = new Map();
  const nss = new Map();
  const fixed = new Map();
  const max = new Map();
  const mentions = (p, present) => (p.k === "e" ? present.has(p.name) : p.items.some((it) => mentions(it, present)));
  const required = (p, forced, present, out) => {
    if (!p) return;
    if (p.k === "e") { if (p.min > 0 && forced) out.add(p.name); return; }
    if (p.k === "c") return;
    const wanted = (forced && p.min > 0) || p.items.some((it) => mentions(it, present));
    p.items.forEach((it) => required(it, wanted, present, out));
  };
  const walk = (p, mult) => {
    if (p.k === "e") {
      if (!types.has(p.name)) { types.set(p.name, p.type); nss.set(p.name, p.ns); if (p.fixed !== undefined) fixed.set(p.name, p.fixed); }
      const m = mult < 0 || p.max < 0 ? -1 : mult * p.max;
      const prev = max.get(p.name);
      max.set(p.name, prev === undefined ? m : prev < 0 || m < 0 ? -1 : Math.max(prev, m));
      return;
    }
    p.items.forEach((it) => walk(it, mult < 0 || p.max < 0 ? -1 : mult * p.max));
  };
  const def = schema.complex[typeName];
  if (def.model) walk(def.model, 1);
  i = { types, nss, fixed, max, def, required: (present) => { const out = new Set(); required(def.model, true, present, out); return out; } };
  infoCache.set(typeName, i);
  return i;
}

// Elements from the 2.0 format that 3.0 replaced, as seen in real files: NAV's own manageInvoice
// API sample (2026-11-15) still sends privatePersonIndicator inside 3.0 invoice data.
const REPLACED = {
  privatePersonIndicator: "privatePersonIndicator is the 2.0 field; 3.0 replaced it with customerVatStatus (PRIVATE_PERSON, DOMESTIC or OTHER), which goes first in customerInfo.",
};
const sameBoolean = (a, b) => ({ 1: "true", 0: "false" }[a] ?? a) === ({ 1: "true", 0: "false" }[b] ?? b);

function checkNode(node, typeName, path, out) {
  const { types, nss, fixed, max, def, required } = info(typeName);
  for (const a of def.attrs) {
    const got = node.attrs?.[a.name];
    if (got === undefined) {
      if (a.use === "required") out.push(finding("HU-032", `${node.name} is missing its required attribute ${a.name}.`, `Add ${a.name} to ${node.name}.`, path));
    } else {
      const problem = navValueProblem(a.type, got);
      if (problem) out.push(finding("HU-030", `Attribute ${a.name} of ${node.name} ${problem}.`, `Correct ${a.name} on ${node.name}.`, path));
    }
  }
  if (def.text) {
    const problem = navValueProblem(def.text, node.text);
    if (problem) out.push(finding("HU-030", `${node.name} ${problem}.`, `Correct ${node.name}; NAV refuses a report whose values break the schema (SCHEMA_VIOLATION).`, path));
    return;
  }
  if (!def.model) return;
  const count = new Map();
  const seen = [];
  const before = out.length;
  for (const c of node.children) {
    if (!types.has(c.name)) {
      out.push(finding("HU-027", `${c.name} is not allowed inside ${node.name}.`, (Object.hasOwn(REPLACED, c.name) ? REPLACED[c.name] : null) ?? `Remove ${c.name}, or move it to the block where the schema defines it.`, `${path}/${c.name}`));
      continue;
    }
    const want = NS[nss.get(c.name)];
    if (c.ns !== want) {
      const had = Object.hasOwn(PREFIX_OF, c.ns) ? PREFIX_OF[c.ns] : "";
      out.push(finding("HU-031", `${c.name} is in the ${had ? `${had}: (${c.ns})` : c.ns ? `"${c.ns}"` : "empty"} namespace; NAV's schema declares it in ${nss.get(c.name)}: (${want}).`,
        `Write it as <${nss.get(c.name)}:${c.name}> with xmlns:${nss.get(c.name)}="${want}" declared; the element name alone is not enough.`, `${path}/${c.name}`));
    }
    const n = (count.get(c.name) ?? 0) + 1;
    count.set(c.name, n);
    const limit = max.get(c.name);
    if (limit >= 0 && n > limit) {
      if (n === limit + 1) out.push(finding("HU-027", `${c.name} appears more than ${limit === 1 ? "once" : `${limit} times`} in ${node.name}.`, `Keep at most ${limit} ${c.name}.`, `${path}/${c.name}`));
      continue;
    }
    seen.push(c);
  }
  const present = new Set(seen.map((c) => c.name));
  const placed = out.length;
  for (const name of required(present)) {
    if (!present.has(name)) out.push(finding("HU-029", `${name} is required in ${node.name} and is missing.`, `Add ${name} to ${node.name}.`, `${path}/${name}`));
  }
  if (out.length === placed && !out.slice(before).some((f) => f.rule === "HU-027")) {
    const m = matcher(def.model, seen);
    if (!m.ok) {
      const at = seen[m.far];
      if (at) {
        const prev = seen.slice(0, m.far).reverse().find((k) => k.name !== at.name);
        out.push(finding("HU-028", `${at.name} is out of place in ${node.name}${prev ? `: it cannot follow ${prev.name}` : ""}.`,
          `Put ${at.name} where the schema sequence places it; NAV rejects elements out of order (SCHEMA_VIOLATION).`, `${path}/${at.name}`));
      } else {
        const names = [...(m.need.get(m.far) ?? [])];
        out.push(finding("HU-028", `${node.name} is incomplete${names.length ? `: the schema expects ${names.join(" or ")} next` : ""}.`,
          `Add the missing element${names.length === 1 ? "" : "s"} to ${node.name}.`, path));
      }
    }
  }
  for (const c of seen) {
    const t = types.get(c.name);
    const same = seen.filter((k) => k.name === c.name);
    const where = same.length > 1 ? `${path}/${c.name}[${same.indexOf(c) + 1}]` : `${path}/${c.name}`;
    if (schema.complex[t]) checkNode(c, t, where, out);
    else if (c.children.length) out.push(finding("HU-027", `${c.name} should hold a value, not elements.`, "Check the file's structure.", where));
    else {
      const problem = navValueProblem(t, c.text);
      if (problem) out.push(finding("HU-030", `${c.name} ${problem}.`, `Correct ${c.name}; NAV refuses a report whose values break the schema (SCHEMA_VIOLATION).`, where));
      else if (fixed.has(c.name) && !sameBoolean(c.text.trim(), fixed.get(c.name))) out.push(finding("HU-030", `${c.name} can only be ${fixed.get(c.name)}.`, `Set ${c.name} to ${fixed.get(c.name)}, or leave it out.`, where));
    }
  }
}

/** Schema findings for one InvoiceData document (text). Assumes it is well formed. */
export function checkAgainstNavSchema(text, pathPrefix = "/InvoiceData") {
  const out = [];
  const root = parseNsTree(text).children.find((c) => c.name === "InvoiceData");
  if (!root) return out;
  if (root.ns !== NS.data) {
    out.push(finding("HU-031", `InvoiceData is in ${root.ns ? `the "${root.ns}"` : "no"} namespace; NAV's schema declares it in ${NS.data}.`,
      `Declare xmlns="${NS.data}" (or a prefix bound to it) on InvoiceData.`, pathPrefix));
    return out;
  }
  checkNode(root, schema.root.type, pathPrefix, out);
  return out;
}
