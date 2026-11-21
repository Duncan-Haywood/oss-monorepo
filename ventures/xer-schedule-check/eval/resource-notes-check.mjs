// P6 resource notes (RSRC.rsrc_notes) <-> Microsoft Project resource Notes
// (msproject.mjs, p6xer.mjs), checked three ways.
//
// --xer <dir>: real P6 files. Every resource the converted project writes
//   (those assigned to one of its activities) whose rsrc_notes reads as text:
//   (1) in the Project XML its <Resource> has <Notes> with memoText's reading;
//   (2) after Project XML -> XER, the resource with the same resource ID
//   (rsrc_short_name, from Initials) has rsrc_notes reading the same.
//
// --plant N: on each file of --xer, up to N of the written resources get a
//   note from eval/memo-plant.mjs (P6 desktop DHTML, P6 Web HTML and plain
//   text, with lists, <BR>, entities, tabs, quotes, accented letters), and the
//   reading is checked against the text the generator meant, both ways.
//
// --mspdi <dir>: every resource note in the MSPDI files under dir (MPXJ's
//   test corpus, saved by Project): written to XER (p6Problems must be empty),
//   then back to Project XML; the note must read the same both times. A cost
//   resource's note is counted apart: cost resources become P6 expenses,
//   which hold no notes.
//
// --write <dir> keeps, for each planted file, the XER read, its Project XML and
//   the XER written back, and for each MSPDI file the XER written (for
//   eval/resource-notes-mpxj.py).
//
//   node eval/resource-notes-check.mjs --xer <dir> [--plant N] [--mspdi <dir>] [--write dir] [--json out.json]
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer, xerText, xerBytes } from "../xer.mjs";
import { mspdiText } from "../msproject.mjs";
import { p6XerText, p6Problems } from "../p6xer.mjs";
import { parseXml } from "../mspdi.mjs";
import { memoText } from "../notebook.mjs";
import { rng, plantEntry, norm } from "./memo-plant.mjs";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const walk = (d, ext) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p, ext) : p.toLowerCase().endsWith(ext) ? [p] : []; });
const writeDir = opt("--write");
const keep = (name, data) => { if (writeDir) { mkdirSync(writeDir, { recursive: true }); writeFileSync(join(writeDir, name), data); } };
const kid = (n, name) => n?.children?.find((c) => c.name === name);
const txt = (n, name) => kid(n, name)?.text?.trim() ?? "";

// the <Resource> elements of a Project XML, by Initials (P6's resource ID)
function xmlResources(xml) {
  const proj = kid(parseXml(xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml), "Project");
  return (kid(proj, "Resources")?.children || []).filter((c) => c.name === "Resource");
}

function xerRoundTrip(T, label, planted = null) {
  const r = mspdiText({ tables: T });
  const pid = r.project.id;
  const inProj = new Set((T.TASK || []).filter((t) => t.proj_id === pid).map((t) => t.task_id));
  const used = new Set((T.TASKRSRC || []).filter((a) => inProj.has(a.task_id)).map((a) => a.rsrc_id));
  const src = (T.RSRC || []).filter((x) => used.has(x.rsrc_id));
  const withShell = src.filter((x) => (x.rsrc_notes || "").trim()).length;
  const notes = src.filter((x) => memoText(x.rsrc_notes)).map((x) => ({ id: x.rsrc_short_name, name: x.rsrc_name, text: norm(memoText(x.rsrc_notes)) }));
  // (1) Project XML: the resource's Notes, by name (the XML's Initials are P6's resource ID)
  const xr = new Map(xmlResources(r.xml).map((x) => [txt(x, "Initials"), norm(txt(x, "Notes"))]));
  const inXml = notes.filter((n) => xr.get(n.id) === n.text).length;
  const xmlNotes = [...xr.values()].filter(Boolean).length;
  // (2) back to XER
  const back = p6XerText(r.xml);
  if (planted) { const stem = label.replace(/\.xer$/i, ""); keep(`${stem}.xer`, xerBytes(xerText({ tables: T, header: null })).bytes); keep(`${stem}.xml`, r.xml); keep(`${stem}-back.xer`, back.bytes); }
  const problems = p6Problems(back.xer.tables);
  const y = parseXer(back.text).tables;
  const yr = new Map((y.RSRC || []).map((x) => [x.rsrc_short_name, norm(memoText(x.rsrc_notes))]));
  const backOk = notes.filter((n) => yr.get(n.id) === n.text).length;
  const backNotes = (y.RSRC || []).filter((x) => memoText(x.rsrc_notes)).length;
  const out = { file: label, project: r.project.name, resourcesWritten: src.length, rsrcNotesNonEmpty: withShell, notesWithText: notes.length, inProjectXml: inXml, projectXmlNotes: xmlNotes, backInXer: backOk, xerNotesBack: backNotes, p6Problems: problems.length };
  if (planted) {
    out.planted = planted.length;
    out.plantedForms = planted.reduce((a, p) => ((a[p.form] = (a[p.form] || 0) + 1), a), {});
    out.plantedReadAsMeant = planted.filter((p) => xr.get(p.id) === p.want).length;
    out.plantedBack = planted.filter((p) => yr.get(p.id) === p.want).length;
    out.miss = planted.filter((p) => yr.get(p.id) !== p.want).slice(0, 3).map((p) => ({ id: p.id, want: p.want, xml: xr.get(p.id), back: yr.get(p.id) }));
  }
  return out;
}

function plant(T, n, seed) {
  const r = rng(seed);
  const pid = mspdiText({ tables: T }).project.id;
  const inProj = new Set((T.TASK || []).filter((t) => t.proj_id === pid).map((t) => t.task_id));
  const used = new Set((T.TASKRSRC || []).filter((a) => inProj.has(a.task_id)).map((a) => a.rsrc_id));
  const rows = (T.RSRC || []).filter((x) => used.has(x.rsrc_id) && !memoText(x.rsrc_notes));
  const planted = [];
  T.RSRC = (T.RSRC || []).map((x) => ({ ...x }));
  const byId = new Map(T.RSRC.map((x) => [x.rsrc_id, x]));
  for (const row of rows.sort(() => r() - 0.5).slice(0, n)) {
    const e = plantEntry(r);
    byId.get(row.rsrc_id).rsrc_notes = e.memo;
    planted.push({ id: row.rsrc_short_name, want: e.want, form: e.form });
  }
  return planted;
}

let out_n = 0;
function mspdiRoundTrip(file) {
  const text = readFileSync(file, "utf8");
  if (!/<Project[\s>][^]*xmlns="http:\/\/schemas\.microsoft\.com\/project"/.test(text.slice(0, 4000))) return null;
  let res;
  try { res = xmlResources(text); } catch { return null; }
  const all = res.filter((x) => txt(x, "UID") !== "0" && txt(x, "IsNull") !== "1" && txt(x, "Name") && txt(x, "Notes"));
  if (!all.length) return null;
  const cost = all.filter((x) => txt(x, "Type") === "2");
  const notes = all.filter((x) => txt(x, "Type") !== "2").map((x) => ({ name: txt(x, "Name"), text: norm(txt(x, "Notes")) }));
  let back;
  try { back = p6XerText(text); } catch (e) { return { file, notes: notes.length, error: e.message }; }
  keep(`mspdi-${basename(file).replace(/\.xml$/i, "")}-${out_n++}.xer`, back.bytes);
  const problems = p6Problems(back.xer.tables);
  const y = parseXer(back.text);
  const yr = new Map((y.tables.RSRC || []).map((x) => [x.rsrc_name, norm(memoText(x.rsrc_notes))]));
  const inXer = notes.filter((n) => yr.get(n.name) === n.text).length;
  // and back to Project XML (only resources with an assignment are written)
  const again = mspdiText(y);
  const xr = new Map(xmlResources(again.xml).map((x) => [txt(x, "Name"), norm(txt(x, "Notes"))]));
  const written = notes.filter((n) => xr.has(n.name));
  const againOk = written.filter((n) => xr.get(n.name) === n.text).length;
  const warned = back.warnings.some((w) => /cost resource note/.test(w));
  return { file, notes: notes.length, costResourceNotes: cost.length, costNotesWarned: cost.length ? warned : null, inXer, assignedBackInProjectXml: written.length, backInProjectXml: againOk, p6Problems: problems.length };
}

const out = { date: new Date().toISOString().slice(0, 10), xer: [], planted: [], mspdi: [] };
const xd = opt("--xer"), nPlant = Number(opt("--plant") || 0), md = opt("--mspdi");
if (xd) for (const f of walk(xd, ".xer").sort()) {
  const T = parseXer(decodeXer(readFileSync(f))).tables;
  if (!(T.TASK || []).length) continue;
  out.xer.push(xerRoundTrip(T, basename(f)));
  if (nPlant) { const planted = plant(T, nPlant, 7 + out.planted.length); if (planted.length) out.planted.push(xerRoundTrip(T, basename(f), planted)); }
}
if (md) for (const f of walk(md, ".xml").sort()) { const r = mspdiRoundTrip(f); if (r) out.mspdi.push({ ...r, file: r.file.slice(md.length + 1) }); }
const sum = (a, k) => a.reduce((s, x) => s + (x[k] || 0), 0);
out.totals = {
  realResourcesWritten: sum(out.xer, "resourcesWritten"), realRsrcNotesNonEmpty: sum(out.xer, "rsrcNotesNonEmpty"), realNotesWithText: sum(out.xer, "notesWithText"),
  realExtraNotesInXml: sum(out.xer, "projectXmlNotes") - sum(out.xer, "notesWithText"),
  planted: sum(out.planted, "planted"), plantedReadAsMeant: sum(out.planted, "plantedReadAsMeant"), plantedBack: sum(out.planted, "plantedBack"),
  plantedExtraNotesBack: sum(out.planted, "xerNotesBack") - sum(out.planted, "notesWithText"),
  mspdiFiles: out.mspdi.length, mspdiNotes: sum(out.mspdi, "notes"), mspdiInXer: sum(out.mspdi, "inXer"), mspdiAssigned: sum(out.mspdi, "assignedBackInProjectXml"), mspdiBack: sum(out.mspdi, "backInProjectXml"), mspdiCostNotes: sum(out.mspdi, "costResourceNotes"),
  p6Problems: sum(out.xer, "p6Problems") + sum(out.planted, "p6Problems") + sum(out.mspdi, "p6Problems"),
};
console.log(JSON.stringify(out.totals, null, 1));
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(out, null, 1) + "\n");
