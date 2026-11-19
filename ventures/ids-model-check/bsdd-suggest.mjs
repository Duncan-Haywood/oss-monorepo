// Suggested bSDD links: the `uri` an IDS property facet could carry, worked
// out offline from the IFC 4.3 property set templates.
//
// bsdd.mjs checks the links an IDS already has. Most IDS files have none:
// of 2,153 requirement property facets in 123 public IDS files only 237 carry
// a `uri` (eval/bsdd-suggest-2026-11-19.md). Yet for a standard IFC property
// the link is not a lookup at all: buildingSMART's IFC 4.3 dictionary in bSDD
// codes every template property by its own name, so FireRating in
// Pset_WallCommon is
//   https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/prop/FireRating
// Every IFC 4.3 property link in the public corpus that names a property of
// the facet's own set has that form (eval, "Does the rule match the links
// people wrote").
//
// suggestBsddLinks(idsText, { psets }) lists, for each requirement property
// facet with no `uri` whose propertySet and baseName are plain names of an
// IFC 4.3 template property (psets = resources().psets), the link to add:
//   [{ spec, specName, line, at, propertySet, baseName, uri, dataType, ifcType }]
// ifcType is the template's own type when the facet asks for another one
// (the bsdd-datatype warning bsdd.mjs would give once the link is there).
// Facets in applicability are skipped: ids.xsd allows `uri` on requirement
// facets only. Qto_ quantities are included: the dictionary codes them the
// same way, and the 11 distinct quantity links in the public corpus
// (prop/GrossFloorArea, prop/NetVolume, ...) all resolved in bSDD on
// 2026-11-19 (eval/bsdd-corpus.txt has no finding on any of them). Patterns,
// enumerations and non-standard sets get nothing; a name that is not the template's exact spelling gets nothing
// (IDS names are case-sensitive, and a guessed link would hide that slip).
//
// addBsddLinks(idsText, suggestions) writes them in: ` uri="..."` after the
// element name in each facet's start tag, every other byte unchanged.
//
// No network: this is why the page can offer it (bSDD's API sends no CORS
// header, so the page cannot run bsdd.mjs).

import { parseXml, kid, kids } from "./xml.mjs";
import { IdsValue } from "./ids.mjs";

export const IFC43_DICTIONARY = "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3";

const simpleOf = (v) => (v && v.simple !== undefined && typeof v.simple === "string" ? v.simple : null);

// Template property names whose rule link bSDD does not resolve: bSDD's IFC
// 4.3 dictionary leaves them out of every set (eval/bsdd-template-sweep.mjs
// asks bSDD for all 760 template sets and fails when this list is out of
// date; eval/bsdd-suggest-live-2026-11-19.md). No link is better than one
// that the bSDD check then reports as not found.
export const BSDD_UNLINKED = new Set([
  "Reference",
]);

export function ifc43PropUri(name) {
  return `${IFC43_DICTIONARY}/prop/${name}`;
}

export function suggestBsddLinks(idsText, { psets } = {}) {
  const table = psets && (psets.IFC4X3 || psets);
  if (!table) throw new Error("suggestBsddLinks needs the IFC 4.3 property set templates (resources().psets)");
  const root = parseXml(idsText, { spans: true });
  if (root.local !== "ids") throw new Error(`not an IDS file: root element is <${root.name}>`);
  const starts = [0];
  for (let i = idsText.indexOf("\n"); i >= 0; i = idsText.indexOf("\n", i + 1)) starts.push(i + 1);
  const lineOf = (at) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= at) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
  const out = [];
  kids(kid(root, "specifications"), "specification").forEach((s, specIndex) => {
    const req = kid(s, "requirements");
    for (const f of req ? req.children : []) {
      if (f.local !== "property" || f.attrs.uri !== undefined || f.at === undefined) continue;
      const propertySet = simpleOf(new IdsValue(kid(f, "propertySet")));
      const baseName = simpleOf(new IdsValue(kid(f, "baseName") || kid(f, "name")));
      if (!propertySet || !baseName) continue;
      const tpl = Object.prototype.hasOwnProperty.call(table, propertySet) ? table[propertySet] : null;
      if (!tpl || !Object.prototype.hasOwnProperty.call(tpl.props, baseName) || BSDD_UNLINKED.has(baseName)) continue;
      const dataType = (f.attrs.dataType ?? f.attrs.datatype ?? "").toUpperCase() || null;
      const ifcType = tpl.props[baseName].type || null;
      out.push({
        spec: specIndex, specName: s.attrs.name || `specification ${specIndex + 1}`,
        line: lineOf(f.at), at: f.at, propertySet, baseName, uri: ifc43PropUri(baseName),
        dataType, ifcType: ifcType && dataType && ifcType !== dataType ? ifcType : null,
      });
    }
  });
  return out;
}

const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function addBsddLinks(idsText, suggestions) {
  let text = idsText;
  // From the end, so earlier offsets stay right.
  for (const s of [...suggestions].sort((a, b) => b.at - a.at)) {
    const m = /^<[^\s/>]+/.exec(text.slice(s.at, s.at + 200));
    if (!m) throw new Error(`no start tag at character ${s.at}`);
    const at = s.at + m[0].length;
    text = text.slice(0, at) + ` uri="${escAttr(s.uri)}"` + text.slice(at);
  }
  return text;
}

export function suggestReport(list) {
  if (!list.length) return "no bSDD links to suggest: every requirement property facet on a standard IFC 4.3 property already has a uri, or none asks for one";
  const lines = list.map((s) => `line ${s.line}: ${s.propertySet}.${s.baseName} -> ${s.uri}${s.ifcType ? `  (the IFC dictionary gives ${s.ifcType}; this facet asks ${s.dataType})` : ""}`);
  return `${list.length} bSDD link(s) to add:\n` + lines.join("\n");
}
