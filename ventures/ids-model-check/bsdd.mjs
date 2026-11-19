// bSDD check: do the `uri` attributes in an IDS agree with the buildingSMART
// Data Dictionary they point at?
//
// IDS 1.0 lets a property, classification or material facet carry a `uri`,
// meant to be the bSDD identifier of what the facet asks for
// (https://identifier.buildingsmart.org/uri/<org>/<dictionary>/<version>/prop|class/<code>).
// Nothing in the IDS schema ties that link to the rest of the facet, so an
// IDS can name one property and link another, ask for an IfcLabel where the
// dictionary says Boolean, or link an entry that does not exist. A model
// authored from the dictionary then fails the IDS for the IDS author's slip.
//
// checkBsdd(idsText, { fetch, api, concurrency }) looks every such link up in
// bSDD's public API and returns
//   { uris, looked, findings: [{ level, code, spec, specName, line, kind, uri, message, suggest? }] }
// level "error": the link does not resolve, points at the wrong kind of entry,
//   or the dictionary's data type cannot hold what the facet asks for;
// level "warning": the facet's name, code, system, value or class differs
//   from the dictionary's, or the entry is no longer active;
// level "note": the link resolves but is written in another form than bSDD's
//   own, its dictionary is not the latest version, or it is not a bSDD link.
// The findings never change the IDS audit's VALID/INVALID verdict: the IDS
// is still a valid IDS, it just disagrees with the dictionary it cites.
//
// This is the one part of ids-model-check that goes on the network, and only
// when asked (`cli.mjs --audit SPEC.ids --bsdd`): each distinct link is one
// GET to api.bsdd.buildingsmart.org, with the URI as the only thing sent.
// `fetch` is injectable so tests run offline (bsdd.test.mjs).

import { parseXml, kid, kids } from "./xml.mjs";
import { IdsValue } from "./ids.mjs";

export const BSDD_API = "https://api.bsdd.buildingsmart.org";
const defaultWait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const BSDD_HOST = /^https?:\/\/identifier\.buildingsmart\.org\/uri\//i;

// The data types bSDD gives a property, and the IFC primitives (Schema.prim)
// a facet's dataType may resolve to and still hold such a value. The
// date/time IFC types are strings (IfcDate) or integers (IfcTimeStamp) in
// EXPRESS, so they are listed by name.
const TIME_TYPES = new Set(["IFCDATE", "IFCDATETIME", "IFCTIME", "IFCDURATION", "IFCTIMESTAMP", "IFCTIMEMEASURE"]);
export function dataTypeFits(bsddType, ifcType, schema) {
  const t = (bsddType || "").toLowerCase();
  const prim = schema ? schema.prim(ifcType) : null;
  if (!prim || prim === "unknown") return null;
  switch (t) {
    case "boolean": return prim === "boolean" || prim === "logical";
    // IFC4's IfcCountMeasure is a NUMBER, which Schema.prim reads as double.
    case "integer": return prim === "integer" || prim === "double";
    case "real": return prim === "double" || prim === "integer";
    case "time": return TIME_TYPES.has(ifcType);
    case "string": case "character": return prim === "string";
    default: return null;
  }
}

// bSDD's own spelling of an IFC dictionary link: identifier.buildingsmart.org
// over https, ifc/4.3 rather than the older ifc-4.3. Used to say what a link
// that fails to resolve should probably have been.
export function ifcCandidate(uri) {
  const m = /^https?:\/\/identifier\.buildingsmart\.org\/uri\/buildingsmart\/ifc[-/][^/]+\/(prop|class)\/([^/?#]+)\/?$/i.exec(uri);
  return m ? `https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/${m[1].toLowerCase()}/${m[2]}` : null;
}

// "Technical note: in IFC this property takes 'IfcBoolean' as value." -- the
// IFC dictionary names the exact IFC type in each property's description.
function ifcTypeOf(entry) {
  const m = /takes '(Ifc\w+)' as value/.exec(entry.description || "");
  return m ? m[1].toUpperCase() : null;
}

const simpleOf = (v) => (v && v.simple !== undefined ? v.simple : null);
const valuesOf = (v) => (!v ? [] : v.simple !== undefined ? [v.simple] : v.r && v.r.enumeration.length ? v.r.enumeration : []);

// Every facet with a uri, with what is needed to compare it: the spec's
// applicability classes and IFC versions, the facet's names and values, and
// the line it is on.
export function bsddLinks(idsText) {
  const root = parseXml(idsText, { spans: true });
  if (root.local !== "ids") throw new Error(`not an IDS file: root element is <${root.name}>`);
  const starts = [0];
  for (let i = idsText.indexOf("\n"); i >= 0; i = idsText.indexOf("\n", i + 1)) starts.push(i + 1);
  const lineOf = (n) => {
    if (n.at === undefined) return null;
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= n.at) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
  const out = [];
  kids(kid(root, "specifications"), "specification").forEach((s, specIndex) => {
    const app = kid(s, "applicability");
    const entities = [];
    for (const e of kids(app, "entity")) entities.push(...valuesOf(new IdsValue(kid(e, "name"))).map((x) => x.toUpperCase()));
    const ifcVersion = (s.attrs.ifcVersion || "").split(/\s+/).filter(Boolean).map((v) => v.toUpperCase());
    for (const [section, node] of [["applicability", app], ["requirements", kid(s, "requirements")]]) {
      for (const f of node ? node.children : []) {
        if (!["property", "classification", "material"].includes(f.local) || f.attrs.uri === undefined) continue;
        const link = { spec: specIndex, specName: s.attrs.name || `specification ${specIndex + 1}`, section, kind: f.local, uri: f.attrs.uri.trim(), line: lineOf(f), entities, ifcVersion };
        if (f.local === "property") {
          link.baseName = simpleOf(new IdsValue(kid(f, "baseName") || kid(f, "name")));
          link.propertySet = simpleOf(new IdsValue(kid(f, "propertySet")));
          link.dataType = (f.attrs.dataType ?? f.attrs.datatype ?? "").toUpperCase() || null;
        }
        if (f.local === "classification") link.system = simpleOf(new IdsValue(kid(f, "system")));
        link.values = valuesOf(new IdsValue(kid(f, "value")));
        out.push(link);
      }
    }
  });
  return out;
}

// One GET, JSON back, or { notFound } / { failed } -- never throws. bSDD
// answers 429 to bursts (68 of 205 lookups on the public corpus, run one), so
// a 429 or 503 is retried after its Retry-After or a doubling wait, 5 times.
async function getJson(fetchFn, url, wait = defaultWait) {
  try {
    let r;
    for (let attempt = 0; ; attempt++) {
      r = await fetchFn(url, { headers: { Accept: "application/json" } });
      if (!(r.status === 429 || r.status === 503) || attempt >= 5) break;
      const after = Number(r.headers && typeof r.headers.get === "function" ? r.headers.get("retry-after") : NaN);
      await wait(Number.isFinite(after) && after > 0 ? Math.min(after, 30) * 1000 : 500 * 2 ** attempt);
    }
    const body = await r.text();
    let json = null;
    try { json = JSON.parse(body); } catch { /* not JSON */ }
    if (r.status === 404 || (json && (json.statusCode === 400 || json.statusCode === 404) && /not found/i.test(json.message || ""))) return { notFound: true };
    if (!r.ok || !json) return { failed: `HTTP ${r.status}` };
    return { json };
  } catch (e) {
    return { failed: e.message || String(e) };
  }
}

// The kind of entry a link names, from its path: .../prop/X or .../class/X.
export function linkKind(uri) {
  const m = /\/(prop|class)\/[^/]+\/?$/i.exec(uri.replace(/[?#].*$/, ""));
  return m ? m[1].toLowerCase() : null;
}

export async function checkBsdd(idsText, opts = {}) {
  const fetchFn = opts.fetch || globalThis.fetch;
  const api = (opts.api || BSDD_API).replace(/\/$/, "");
  const schemas = opts.schemas || null;
  const links = bsddLinks(idsText);
  const findings = [];
  const cache = new Map();
  const lookup = (kind, uri) => {
    const key = kind + " " + uri.toLowerCase();
    if (!cache.has(key)) {
      const path = kind === "prop" ? "/api/Property/v5" : kind === "class" ? "/api/Class/v1" : "/api/Dictionary/v1";
      cache.set(key, getJson(fetchFn, `${api}${path}?Uri=${encodeURIComponent(uri)}`, opts.wait));
    }
    return cache.get(key);
  };
  // Look the distinct links up a few at a time, then compare in file order.
  const distinct = [...new Map(links.filter((l) => BSDD_HOST.test(l.uri) && linkKind(l.uri)).map((l) => [linkKind(l.uri) + " " + l.uri.toLowerCase(), l])).values()];
  const width = opts.concurrency || 4;
  for (let i = 0; i < distinct.length; i += width) await Promise.all(distinct.slice(i, i + width).map((l) => lookup(linkKind(l.uri), l.uri)));

  for (const l of links) {
    const add = (level, code, message, extra = {}) => findings.push({ level, code, spec: l.spec, specName: l.specName, line: l.line, kind: l.kind, uri: l.uri, message, ...extra });
    if (!BSDD_HOST.test(l.uri)) { add("note", "bsdd-not-bsdd", `uri is not a bSDD identifier (identifier.buildingsmart.org/uri/...), so it was not checked`); continue; }
    const kind = linkKind(l.uri);
    if (!kind) { add("error", "bsdd-shape", `uri names no bSDD property or class: a bSDD link ends in /prop/<code> or /class/<code>`); continue; }
    const want = l.kind === "property" ? "prop" : "class";
    if (kind !== want) add("error", "bsdd-kind", `a ${l.kind} facet links a bSDD ${kind === "prop" ? "property" : "class"}; a ${l.kind} facet's uri should name a ${want === "prop" ? "property (/prop/)" : "class (/class/)"}`);
    const r = await lookup(kind, l.uri);
    if (r.failed) { add("note", "bsdd-unreachable", `bSDD did not answer (${r.failed}); not checked`); continue; }
    if (r.notFound) {
      const cand = ifcCandidate(l.uri);
      let suggest = null;
      if (cand && cand.toLowerCase() !== l.uri.toLowerCase()) {
        const c = await lookup(kind, cand);
        if (c.json) suggest = c.json.uri || cand;
      }
      add("error", "bsdd-not-found", `bSDD has no ${kind === "prop" ? "property" : "class"} at this uri${suggest ? `; the IFC 4.3 dictionary has ${suggest}` : ""}`, suggest ? { suggest } : {});
      continue;
    }
    const e = r.json;
    if (e.uri && e.uri !== l.uri) add("note", "bsdd-form", `resolves, but bSDD writes this link as ${e.uri}`, { suggest: e.uri });
    // Only "Inactive" is read: some dictionaries answer a bare number ("3",
    // bs-agri fruitvegs 1.6) that the API documents no meaning for.
    if (e.status === "Inactive") add("warning", "bsdd-status", `the bSDD entry is ${e.status}${(e.replacingObjectCodes || []).length ? `, replaced by ${e.replacingObjectCodes.join(", ")}` : ""}`);
    // The dictionary: latest version, and its name for a classification's system.
    let dict = null;
    if (e.dictionaryUri) {
      const d = await lookup("dict", e.dictionaryUri);
      dict = d.json && d.json.dictionaries && d.json.dictionaries[0];
      if (dict && dict.isLatestVersion === false) add("note", "bsdd-old-version", `${dict.name} ${dict.version} is not the dictionary's latest version in bSDD`);
    }
    if (kind === "prop" && l.kind === "property") await checkProperty(l, e, dict, add, schemas, lookup);
    if (kind === "class" && (l.kind === "classification" || l.kind === "material")) checkClass(l, e, dict, add, schemas);
  }
  return { uris: links.length, looked: distinct.length, findings };
}

// The schema a specification's ifcVersion names (IFC4X3_ADD2 reads as IFC4X3), IFC4X3 when none.
function schemaFor(l, schemas) {
  if (!schemas) return null;
  for (const v of l.ifcVersion) { const k = v.startsWith("IFC4X3") ? "IFC4X3" : v; if (schemas[k]) return schemas[k]; }
  return schemas.IFC4X3 || null;
}

async function checkProperty(l, e, dict, add, schemas, lookup) {
  const code = e.code || "";
  if (l.baseName !== null && l.baseName !== code && l.baseName !== e.name) {
    const lower = l.baseName.toLowerCase();
    if (lower === code.toLowerCase() || lower === (e.name || "").toLowerCase()) {
      add("warning", "bsdd-name", `baseName "${l.baseName}" differs from the bSDD property's ${lower === code.toLowerCase() ? `code "${code}"` : `name "${e.name}"`} only in case; IDS compares names case-sensitively`, { suggest: lower === code.toLowerCase() ? code : e.name });
    } else {
      // Is the baseName itself a property of the same dictionary? Then the
      // uri was probably pasted from the row next to it.
      let other = null;
      if (dict && dict.uri && /^[\w.-]+$/.test(l.baseName)) {
        const o = await lookup("prop", `${dict.uri}/prop/${l.baseName}`);
        if (o.json && o.json.code && o.json.code.toLowerCase() === lower) other = o.json.uri;
      }
      add("warning", "bsdd-name", `baseName "${l.baseName}" is not the linked bSDD property, "${code}"${e.name && e.name !== code ? ` (${e.name})` : ""}${other ? `; ${dict.name} has ${l.baseName} at ${other}` : ""}`, { suggest: other || code });
    }
  }
  if (l.dataType) {
    const ifcType = ifcTypeOf(e);
    if (ifcType === l.dataType) return checkValues(l, e, add);
    const schema = schemaFor(l, schemas);
    const fits = dataTypeFits(e.dataType, l.dataType, schema);
    if (fits === false) add("error", "bsdd-datatype", `dataType ${l.dataType} cannot hold the bSDD property's ${e.dataType} values${ifcType ? `; the IFC dictionary gives ${ifcType}` : ""}, so a model that follows the dictionary fails this facet`, ifcType ? { suggest: ifcType } : {});
    else if (ifcType && ifcType !== l.dataType) add("warning", "bsdd-datatype", `dataType ${l.dataType}, but the IFC dictionary gives ${ifcType} for ${code}`, { suggest: ifcType });
  }
  checkValues(l, e, add);
}

function checkValues(l, e, add) {
  const allowed = (e.allowedValues || []).flatMap((a) => [a.code, a.value]).filter((x) => x !== undefined && x !== null);
  if (allowed.length && l.values.length) {
    const set = new Set(allowed);
    const lower = new Map(allowed.map((a) => [String(a).toLowerCase(), a]));
    const off = l.values.filter((v) => !set.has(v));
    if (off.length) add("warning", "bsdd-value", `value${off.length > 1 ? "s" : ""} ${off.map((v) => `"${v}"${lower.has(v.toLowerCase()) ? ` (bSDD "${lower.get(v.toLowerCase())}")` : ""}`).join(", ")} not among the bSDD property's ${e.allowedValues.length} allowed values`);
  }
}

function checkClass(l, e, dict, add, schemas) {
  if (l.kind === "material" && e.classType && e.classType !== "Material") add("warning", "bsdd-kind", `a material facet links a bSDD ${e.classType}, not a Material`);
  const codes = [e.code, e.referenceCode, e.name].filter(Boolean);
  const off = l.values.filter((v) => !codes.includes(v));
  if (l.values.length && off.length === l.values.length) add("warning", "bsdd-value", `value ${l.values.map((v) => `"${v}"`).join(", ")} is not the linked class's code "${e.referenceCode || e.code}"${e.name && e.name !== e.code ? ` or name "${e.name}"` : ""}`, { suggest: e.referenceCode || e.code });
  if (l.kind === "classification" && l.system !== null && dict && ![dict.name, dict.code, dict.uri].includes(l.system)) {
    add("warning", "bsdd-system", `system "${l.system}" is not the linked class's dictionary, "${dict.name}"`, { suggest: dict.name });
  }
  const related = (e.relatedIfcEntityNames || []).map((x) => x.toUpperCase());
  if (related.length && l.entities.length && l.section === "requirements") {
    const schema = schemaFor(l, schemas);
    const fits = (ent) => related.some((r) => ent === r || (schema && schema.has(ent) && schema.isA(ent, r)));
    const misfit = l.entities.filter((ent) => !fits(ent));
    if (misfit.length) add("warning", "bsdd-entity", `bSDD relates ${e.code} to ${related.join(", ")}, not ${misfit.join(", ")}`);
  }
}

export function bsddReport(r) {
  const n = { error: 0, warning: 0, note: 0 };
  for (const f of r.findings) n[f.level]++;
  const out = [`bSDD links: ${r.uris} uri(s), ${r.looked} distinct looked up; ${n.error} error(s), ${n.warning} warning(s), ${n.note} note(s)`];
  for (const f of r.findings) out.push(`[BSDD ${f.level.toUpperCase()}] ${f.specName}${f.line ? " / line " + f.line : ""}: ${f.message}\n    ${f.uri}`);
  return out.join("\n");
}
