// P6 resource hierarchy (RSRC.parent_rsrc_id) <-> Project resource Group
// (msproject.mjs writes the parents' IDs as a "/" path; p6xer.mjs reads it
// back into parent resources).
//
// --xer <dir>: real P6 files. For the project mspdiText picks, each written
//   resource's Group must equal its parent path in the XER; then the Project
//   XML goes back to XER (default and allResources) and each resource's parent
//   path, by resource ID, must be the one it started with; no P6 import problem.
// --mspdi <dir>: every MSPDI file under dir with a work/material resource
//   Group: to XER (parents made from Group), then back to Project XML with
//   allResources: does each resource come back with the same Group?
//
//   node eval/resource-hierarchy-check.mjs --xer <dir> --mspdi <dir> [--json out.json]
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer } from "../xer.mjs";
import { mspdiText } from "../msproject.mjs";
import { p6XerText, p6Problems } from "../p6xer.mjs";
import { parseXml } from "../mspdi.mjs";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const walk = (d, ext) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p, ext) : p.toLowerCase().endsWith(ext) ? [p] : []; });
const kid = (n, name) => n?.children?.find((c) => c.name === name);
const txt = (n, name) => kid(n, name)?.text?.trim() ?? "";
const xmlResources = (xml) => (kid(kid(parseXml(xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml), "Project"), "Resources")?.children || []).filter((c) => c.name === "Resource");
function paths(R) {
  const by = new Map(R.map((r) => [r.rsrc_id, r]));
  const out = new Map();
  for (const r of R) { const p = []; const seen = new Set([r.rsrc_id]); for (let c = by.get(r.parent_rsrc_id); c && !seen.has(c.rsrc_id); c = by.get(c.parent_rsrc_id)) { seen.add(c.rsrc_id); p.unshift(c.rsrc_short_name); } out.set(r.rsrc_short_name, p.join("/")); }
  return out;
}

const report = { xer: [], mspdi: { files: 0, withGroups: 0, resources: 0, grouped: 0, groupBack: 0, parentsAdded: 0, extraResources: 0, problems: 0, failures: [] } };
if (opt("--xer")) for (const f of walk(opt("--xer"), ".xer").sort()) {
  const T = parseXer(decodeXer(readFileSync(f))).tables;
  const start = paths(T.RSRC || []);
  const row = { file: basename(f), rsrc: (T.RSRC || []).length, withParent: (T.RSRC || []).filter((r) => r.parent_rsrc_id).length };
  for (const allResources of [false, true]) {
    const m = mspdiText({ tables: T }, { allResources });
    const xr = xmlResources(m.xml).filter((x) => txt(x, "Type") !== "2");
    const groupOk = xr.filter((x) => txt(x, "Group") === (start.get(txt(x, "Initials")) ?? "")).length;
    const back = p6XerText(m.xml);
    const after = paths(back.xer.tables.RSRC || []);
    const written = xr.map((x) => txt(x, "Initials"));
    const pathOk = written.filter((s) => after.get(s) === start.get(s)).length;
    row[allResources ? "all" : "default"] = { written: xr.length, grouped: xr.filter((x) => txt(x, "Group")).length, groupOk, pathBack: pathOk, parentsAdded: back.counts.parentResources, problems: p6Problems(back.xer.tables).length };
  }
  report.xer.push(row);
}
if (opt("--mspdi")) for (const f of walk(opt("--mspdi"), ".xml").sort()) {
  const xml = readFileSync(f, "utf8");
  let xr;
  try { xr = xmlResources(xml).filter((x) => txt(x, "Type") !== "2" && txt(x, "Name") && txt(x, "UID") !== "0"); } catch { continue; }
  if (!xr.length) continue;
  report.mspdi.files++;
  const grouped = xr.filter((x) => txt(x, "Group"));
  if (!grouped.length) continue;
  report.mspdi.withGroups++;
  let back;
  try { back = p6XerText(xml); } catch (e) { report.mspdi.failures.push(`${basename(f)}: ${e.message}`); continue; }
  report.mspdi.resources += xr.length; report.mspdi.grouped += grouped.length;
  report.mspdi.parentsAdded += back.counts.parentResources;
  report.mspdi.problems += p6Problems(back.xer.tables).length;
  // back with every resource (the Project files' resources are mostly
  // unassigned, and the default writes only assigned ones)
  const again = xmlResources(mspdiText(back.xer, { allResources: true }).xml);
  report.mspdi.extraResources += again.filter((x) => txt(x, "Type") !== "2").length - xr.length;
  const byName = new Map(again.map((x) => [txt(x, "Name"), txt(x, "Group")]));
  for (const x of grouped) if (byName.get(txt(x, "Name")) === txt(x, "Group").split("/").map((s) => s.trim()).filter(Boolean).join("/")) report.mspdi.groupBack++;
}
console.log(JSON.stringify(report, null, 1));
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(report, null, 1) + "\n");
