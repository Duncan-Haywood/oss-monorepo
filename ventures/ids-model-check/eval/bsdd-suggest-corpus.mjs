#!/usr/bin/env node
// Measures bsdd-suggest.mjs on public IDS files written by others:
// eval/corpus/real (sh eval/fetch-audit-corpus.sh, 65 files) and
// eval/corpus/bsdd (sh eval/fetch-bsdd-ids.sh, 88 files), byte-identical
// copies counted once. Prints
//  1. how many requirement property facets there are, how many carry a uri,
//     and how many of the rest get a suggested link;
//  2. for every facet that already links the IFC dictionary (ifc/4.3 or the
//     older ifc-4.3 / ifc-2x3 forms), whether the rule gives the same link
//     (compared case-insensitively, in bSDD's own form), and each one it does not;
//  3. that addBsddLinks changes nothing but the inserted attributes, and the
//     result still parses with the same specifications.
//   node eval/bsdd-suggest-corpus.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { parseXml, kid, kids } from "../xml.mjs";
import { IdsValue, parseIds } from "../ids.mjs";
import { suggestBsddLinks, addBsddLinks, ifc43PropUri } from "../bsdd-suggest.mjs";
import { ifcCandidate } from "../bsdd.mjs";
import { resources } from "../node.mjs";

const here = new URL(".", import.meta.url).pathname;
const dirs = ["corpus/real", "corpus/bsdd"].map((d) => join(here, d));
if (!dirs.every(existsSync)) { console.error("run eval/fetch-audit-corpus.sh and eval/fetch-bsdd-ids.sh first"); process.exit(2); }
const { psets } = resources();
const seen = new Set();
let qtoSuggested = 0;
let files = 0, unread = 0, facets = 0, withUri = 0, suggested = 0, typeDiffers = 0, filesWith = 0, roundtripOk = 0;
const why = { pattern: 0, nonStandardSet: 0, notInSet: 0 };
let ifcLinked = 0, qtoLinked = 0, ruleSame = 0, ruleNone = 0;
const differ = [], noRule = [];
const simple = (n) => { const v = new IdsValue(n); return v.simple !== undefined && typeof v.simple === "string" ? v.simple : null; };
for (const dir of dirs) for (const f of readdirSync(dir).filter((f) => f.endsWith(".ids")).sort()) {
  const text = readFileSync(join(dir, f), "utf8");
  const h = createHash("sha1").update(text).digest("hex");
  if (seen.has(h)) continue;
  seen.add(h);
  let root;
  try { root = parseXml(text); if (root.local !== "ids") throw new Error("not ids"); } catch { unread++; continue; }
  files++;
  for (const s of kids(kid(root, "specifications"), "specification")) {
    const req = kid(s, "requirements");
    for (const p of req ? req.children : []) {
      if (p.local !== "property") continue;
      facets++;
      const ps = simple(kid(p, "propertySet")), bn = simple(kid(p, "baseName") || kid(p, "name"));
      const rule = ps && bn && psets.IFC4X3[ps] && Object.hasOwn(psets.IFC4X3[ps].props, bn) ? ifc43PropUri(bn) : null;
      if (p.attrs.uri !== undefined) {
        withUri++;
        const u = p.attrs.uri.trim();
        const canon = ifcCandidate(u);
        if (!canon) continue;
        ifcLinked++;
        if (!rule) { ruleNone++; noRule.push(`${f}: ${ps}.${bn} links ${u}`); }
        else if (rule.toLowerCase() === canon.toLowerCase()) { ruleSame++; if (ps.startsWith("Qto_")) qtoLinked++; }
        else differ.push(`${f}: ${ps}.${bn} links ${u}; rule gives ${rule}`);
        continue;
      }
      if (!ps || !bn) why.pattern++;
      else if (!psets.IFC4X3[ps]) why.nonStandardSet++;
      else if (!Object.hasOwn(psets.IFC4X3[ps].props, bn)) why.notInSet++;
    }
  }
  const list = suggestBsddLinks(text, { psets });
  suggested += list.length;
  qtoSuggested += list.filter((x) => x.propertySet.startsWith("Qto_")).length;
  typeDiffers += list.filter((x) => x.ifcType).length;
  if (!list.length) continue;
  filesWith++;
  const out = addBsddLinks(text, list);
  // Remove each inserted attribute at the place it went in (ascending, so
  // each earlier one shifts the next by its own length) and compare bytes.
  let stripped = "", from = 0, shift = 0;
  for (const x of [...list].sort((a, b) => a.at - b.at)) {
    const attr = ` uri="${x.uri}"`;
    const tag = /^<[^\s/>]+/.exec(text.slice(x.at))[0].length;
    const pos = x.at + tag + shift;
    if (out.slice(pos, pos + attr.length) !== attr) { stripped = null; break; }
    stripped += out.slice(from, pos);
    from = pos + attr.length;
    shift += attr.length;
  }
  if (stripped !== null) stripped += out.slice(from);
  const again = suggestBsddLinks(out, { psets });
  const a = parseIds(text), b = parseIds(out);
  if (stripped === text && again.length === 0 && a.specs.length === b.specs.length) roundtripOk++;
  else console.log(`ROUNDTRIP FAILED: ${f}`);
}
console.log(`${files} distinct IDS files read (${unread} not readable as IDS)`);
console.log(`requirement property facets: ${facets}; with a uri: ${withUri}; without: ${facets - withUri}`);
console.log(`suggested links: ${suggested} (${qtoSuggested} Qto_ quantities) in ${filesWith} files (${typeDiffers} where the facet's dataType is not the template's)`);
console.log(`no suggestion, by reason: name or set is a pattern/enumeration/missing ${why.pattern}; set is not an IFC 4.3 template ${why.nonStandardSet}; name not in that template ${why.notInSet}`);
console.log(`facets already linking the IFC dictionary: ${ifcLinked}; rule gives the same link: ${ruleSame} (${qtoLinked} of them Qto_ quantities); rule gives another: ${differ.length}; rule gives none: ${ruleNone}`);
for (const d of differ) console.log(`  differs  ${d}`);
for (const d of noRule) console.log(`  no rule  ${d}`);
console.log(`addBsddLinks: ${roundtripOk} of ${filesWith} files change only by the inserted uri attributes, parse to the same specifications, and need no further link`);
