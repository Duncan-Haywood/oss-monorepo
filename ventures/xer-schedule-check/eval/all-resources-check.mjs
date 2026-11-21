// Resources with no assignment, XER -> Project XML (msproject.mjs, by default
// and with { allResources: true }) and Project XML -> XER -> Project XML.
//
// --xer <dir>: real P6 files. For the project mspdiText picks: the file's
//   RSRC rows, how many the default writes (those the project's activities
//   use) and how many allResources writes; then the allResources Project XML
//   goes back to XER (p6xer.mjs) and every written resource must come back
//   under its resource ID (rsrc_short_name, from Initials) with the same name,
//   type and note, with no P6 import problem (p6Problems).
//
// --mspdi <dir>: every MSPDI file under dir (MPXJ's test corpus, saved by
//   Project) with work or material resources: to XER, then back to Project
//   XML both ways; counts the resources (and resource notes) that come back by
//   name. Cost resources become P6 expenses and are counted apart.
//
//   node eval/all-resources-check.mjs --xer <dir> --mspdi <dir> [--json out.json]
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer } from "../xer.mjs";
import { mspdiText } from "../msproject.mjs";
import { p6XerText, p6Problems } from "../p6xer.mjs";
import { parseXml } from "../mspdi.mjs";
import { memoText } from "../notebook.mjs";
import { norm } from "./memo-plant.mjs"; // the resource-notes check's reading of "same text"

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const walk = (d, ext) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p, ext) : p.toLowerCase().endsWith(ext) ? [p] : []; });
const kid = (n, name) => n?.children?.find((c) => c.name === name);
const txt = (n, name) => kid(n, name)?.text?.trim() ?? "";
function xmlResources(xml) {
  const proj = kid(parseXml(xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml), "Project");
  return (kid(proj, "Resources")?.children || []).filter((c) => c.name === "Resource");
}

function xerCheck(T, label) {
  const used = mspdiText({ tables: T });
  const all = mspdiText({ tables: T }, { allResources: true });
  const xr = xmlResources(all.xml).filter((x) => txt(x, "Type") !== "2");
  const back = p6XerText(all.xml);
  const y = new Map((parseXer(back.text).tables.RSRC || []).map((r) => [r.rsrc_short_name, r]));
  const src = new Map((T.RSRC || []).map((r) => [r.rsrc_short_name, r]));
  let same = 0, noteSame = 0, notes = 0;
  const miss = [];
  for (const x of xr) {
    const id = txt(x, "Initials"), b = y.get(id), s = src.get(id);
    const want = norm(memoText(s?.rsrc_notes));
    if (want) notes++;
    if (b && b.rsrc_name === txt(x, "Name") && (b.rsrc_type === "RT_Mat") === (txt(x, "Type") === "0")) same++;
    else if (miss.length < 3) miss.push({ id, name: txt(x, "Name"), back: b ? b.rsrc_name : null });
    if (want && b && norm(memoText(b.rsrc_notes)) === want) noteSame++;
  }
  return {
    file: label, project: all.project.name, rsrcRows: (T.RSRC || []).length,
    writtenDefault: used.counts.resources - (used.counts.costResources || 0), leftOutDefault: used.counts.resourcesLeftOut,
    writtenAll: all.counts.resources - (all.counts.costResources || 0), unassignedWritten: all.counts.unassignedResources,
    calendarsDefault: used.counts.calendars, calendarsAll: all.counts.calendars,
    assignmentsSame: used.counts.assignments === all.counts.assignments,
    backInXerSameNameAndType: same, notes, notesBack: noteSame, miss, p6Problems: p6Problems(back.xer.tables).length,
  };
}

function mspdiCheck(file) {
  const text = readFileSync(file, "utf8");
  if (!/<Project[\s>][^]*xmlns="http:\/\/schemas\.microsoft\.com\/project"/.test(text.slice(0, 4000))) return null;
  let res;
  try { res = xmlResources(text); } catch { return null; }
  const named = res.filter((x) => txt(x, "UID") !== "0" && txt(x, "IsNull") !== "1" && txt(x, "Name"));
  const work = named.filter((x) => txt(x, "Type") !== "2");
  if (!work.length) return null;
  let back;
  try { back = p6XerText(text); } catch (e) { return { file, resources: work.length, error: e.message }; }
  const y = parseXer(back.text);
  const names = (xml) => new Map(xmlResources(xml).map((x) => [txt(x, "Name"), norm(txt(x, "Notes"))]));
  const d = names(mspdiText(y).xml), a = names(mspdiText(y, { allResources: true }).xml);
  const noted = work.filter((x) => txt(x, "Notes")).map((x) => ({ name: txt(x, "Name"), text: norm(txt(x, "Notes")) }));
  const inXer = new Set((y.tables.RSRC || []).map((r) => r.rsrc_name));
  return {
    file, resources: work.length, costResources: named.length - work.length,
    inXer: work.filter((x) => inXer.has(txt(x, "Name"))).length,
    backDefault: work.filter((x) => d.has(txt(x, "Name"))).length, backAll: work.filter((x) => a.has(txt(x, "Name"))).length,
    notes: noted.length, notesBackDefault: noted.filter((n) => d.get(n.name) === n.text).length, notesBackAll: noted.filter((n) => a.get(n.name) === n.text).length,
    p6Problems: p6Problems(back.xer.tables).length,
  };
}

const out = { date: new Date().toISOString().slice(0, 10), xer: [], mspdi: [] };
const xd = opt("--xer"), md = opt("--mspdi");
if (xd) for (const f of walk(xd, ".xer").sort()) {
  const T = parseXer(decodeXer(readFileSync(f))).tables;
  if ((T.TASK || []).length) out.xer.push(xerCheck(T, basename(f)));
}
if (md) for (const f of walk(md, ".xml").sort()) { const r = mspdiCheck(f); if (r) out.mspdi.push({ ...r, file: r.file.slice(md.length + 1) }); }
const sum = (a, k) => a.reduce((s, x) => s + (typeof x[k] === "number" ? x[k] : 0), 0);
out.totals = {
  xerFiles: out.xer.length, rsrcRows: sum(out.xer, "rsrcRows"), writtenDefault: sum(out.xer, "writtenDefault"), leftOutDefault: sum(out.xer, "leftOutDefault"),
  writtenAll: sum(out.xer, "writtenAll"), unassignedWritten: sum(out.xer, "unassignedWritten"), backInXerSameNameAndType: sum(out.xer, "backInXerSameNameAndType"),
  xerNotes: sum(out.xer, "notes"), xerNotesBack: sum(out.xer, "notesBack"), assignmentsChanged: out.xer.filter((x) => !x.assignmentsSame).length,
  mspdiFiles: out.mspdi.length, mspdiErrors: out.mspdi.filter((x) => x.error).length, mspdiResources: sum(out.mspdi, "resources"), mspdiInXer: sum(out.mspdi, "inXer"),
  mspdiBackDefault: sum(out.mspdi, "backDefault"), mspdiBackAll: sum(out.mspdi, "backAll"),
  mspdiNotes: sum(out.mspdi, "notes"), mspdiNotesBackDefault: sum(out.mspdi, "notesBackDefault"), mspdiNotesBackAll: sum(out.mspdi, "notesBackAll"),
  p6Problems: sum(out.xer, "p6Problems") + sum(out.mspdi, "p6Problems"),
};
console.log(JSON.stringify(out.totals, null, 1));
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(out, null, 1) + "\n");
