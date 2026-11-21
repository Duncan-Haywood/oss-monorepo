// P6 notebooks <-> Microsoft Project notes (notebook.mjs, msproject.mjs,
// mspdi.mjs, p6xer.mjs), checked three ways.
//
// --xer <dir>: real P6 files. Every notebook entry (TASKMEMO, WBSMEMO) of the
//   converted project: (1) in the Project XML, the task's (or summary task's)
//   notes hold it under its topic with the same text; (2) after Project XML
//   -> XER, it is back on the activity with the same activity ID (the WBS
//   node with the same name), under a topic of the same name, with the same
//   text. Text means memoText's reading (markup dropped, lines kept).
//
// --plant N: on each file of --xer, N activities and N/10 WBS nodes are given
//   one to three notebook entries built from a seeded generator that mixes
//   P6 desktop's DHTML (0x7F line breaks), P6 Web's HTML and plain text, with
//   bold and italics, lists, <BR>, entities, tabs (as &#9;: a raw tab is the
//   XER's field separator), quotes (doubled in the
//   XER), accented letters and body lines that look like a topic heading.
//   The generator also writes the text a reader should see, so memoText is
//   checked against it as well as the round trip.
//
// --mspdi <dir>: every task note in the MSPDI files under dir (MPXJ's test
//   corpus): written to XER as notebook entries (p6Problems must be empty),
//   then back to Project XML; the note must read the same both times.
//
// --write <dir> keeps, for each file with notebooks, the XER read, its Project
//   XML and the XER written back (for eval/notebooks-mpxj.py).
//
//   node eval/notebooks-check.mjs --xer <dir> [--plant N] [--mspdi <dir>] [--write dir] [--json out.json]
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer, xerText, xerBytes } from "../xer.mjs";
import { mspdiText } from "../msproject.mjs";
import { p6XerText, p6Problems } from "../p6xer.mjs";
import { parseMspdi, parseXml } from "../mspdi.mjs";
import { memoText, parseNotes, notesText } from "../notebook.mjs";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const walk = (d, ext) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p, ext) : p.toLowerCase().endsWith(ext) ? [p] : []; });

import { rng, plantEntry, norm } from "./memo-plant.mjs";

const TOPICS = ["Description", "Delays", "Anticipated Problems", "Notes to Owner", "Risk"];
function plant(x, pid, n, seed) {
  const r = rng(seed);
  const T = x.tables;
  const base = 900000;
  T.MEMOTYPE = [...(T.MEMOTYPE || []), ...TOPICS.map((t, i) => ({ memo_type_id: String(base + i), seq_num: String(500 + i * 10), eps_flag: "Y", proj_flag: "Y", wbs_flag: "Y", task_flag: "Y", memo_type: t }))];
  const tasks = (T.TASK || []).filter((t) => t.proj_id === pid);
  const wbs = (T.PROJWBS || []).filter((w) => w.proj_id === pid && w.proj_node_flag !== "Y");
  const used = new Set((T.TASKMEMO || []).map((m) => m.task_id)), usedW = new Set((T.WBSMEMO || []).map((m) => m.wbs_id));
  T.TASKMEMO = [...(T.TASKMEMO || [])]; T.WBSMEMO = [...(T.WBSMEMO || [])];
  const planted = [];
  const pick = (list, k, seen) => { const out = []; for (let g = 0; g < k * 20 && out.length < Math.min(k, list.length - seen.size); g++) { const o = list[Math.floor(r() * list.length)]; const id = o.task_id || o.wbs_id; if (!seen.has(id)) { seen.add(id); out.push(o); } } return out; };
  let mid = base;
  for (const [owner, table] of [...pick(tasks, n, used).map((t) => [t, "TASK"]), ...pick(wbs, Math.max(1, Math.round(n / 10)), usedW).map((w) => [w, "WBS"])]) {
    const k = 1 + Math.floor(r() * 3);
    const topics = [...TOPICS].sort(() => r() - 0.5).slice(0, k);
    for (const topic of topics) {
      const e = plantEntry(r);
      const tid = String(base + TOPICS.indexOf(topic));
      if (table === "TASK") T.TASKMEMO.push({ memo_id: String(++mid), task_id: owner.task_id, memo_type_id: tid, proj_id: pid, task_memo: e.memo });
      else T.WBSMEMO.push({ wbs_memo_id: String(++mid), proj_id: pid, memo_type_id: tid, wbs_id: owner.wbs_id, wbs_memo: e.memo });
      planted.push({ table, owner: table === "TASK" ? owner.task_code : owner.wbs_name, topic, want: e.want, form: e.form });
    }
  }
  return planted;
}

// --- XER -> Project XML -> XER ---------------------------------------------
function xerRoundTrip(x, label, planted = null) {
  const r = mspdiText(x);
  const keep = (name, text) => { if (writeDir) { mkdirSync(writeDir, { recursive: true }); writeFileSync(join(writeDir, name), text); } };
  const pid = r.project.id;
  const T = x.tables;
  const topic = new Map((T.MEMOTYPE || []).map((m) => [m.memo_type_id, m.memo_type.trim()]));
  const code = new Map((T.TASK || []).map((t) => [t.task_id, t.task_code]));
  const wbsRow = new Map((T.PROJWBS || []).map((w) => [w.wbs_id, w]));
  const wbsName = (id) => { const w = wbsRow.get(id); return !w ? null : w.proj_node_flag === "Y" ? "(project)" : w.wbs_name; };
  const src = [];
  for (const m of T.TASKMEMO || []) if (m.proj_id === pid && memoText(m.task_memo)) src.push({ table: "TASK", owner: code.get(m.task_id), topic: topic.get(m.memo_type_id) || `Notebook ${m.memo_type_id}`, text: memoText(m.task_memo), uid: r.taskUid.get(m.task_id) });
  for (const m of T.WBSMEMO || []) if (m.proj_id === pid && memoText(m.wbs_memo)) src.push({ table: "WBS", owner: wbsName(m.wbs_id), topic: topic.get(m.memo_type_id) || `Notebook ${m.memo_type_id}`, text: memoText(m.wbs_memo), uid: wbsRow.get(m.wbs_id)?.proj_node_flag === "Y" ? 0 : r.wbsUid.get(m.wbs_id) });
  // (1) the Project XML notes, by task UID
  const doc = parseXml(r.xml);
  const proj = doc.children.find((c) => c.name === "Project");
  const notesOf = new Map();
  for (const t of proj.children.find((c) => c.name === "Tasks").children) {
    const uid = t.children.find((c) => c.name === "UID")?.text.trim();
    const n = t.children.find((c) => c.name === "Notes");
    if (n) notesOf.set(Number(uid), parseNotes(n.text));
  }
  let inXml = 0;
  for (const e of src) if ((notesOf.get(Number(e.uid)) || []).some((s) => s.topic === e.topic && norm(s.text) === norm(e.text))) inXml++;
  // (2) back to XER
  const back = p6XerText(r.xml);
  const stem = `${planted ? "planted-" : ""}${label.replace(/\.xer$/i, "")}`;
  keep(`${stem}.xer`, xerBytes(xerText(x)).bytes); keep(`${stem}.xml`, r.xml); keep(`${stem}-back.xer`, back.bytes);
  const problems = p6Problems(back.xer.tables);
  const y = parseXer(back.text);
  const yT = y.tables;
  const yTopic = new Map((yT.MEMOTYPE || []).map((m) => [m.memo_type_id, m.memo_type]));
  const yCode = new Map(yT.TASK.map((t) => [t.task_id, t.task_code]));
  const yW = new Map(yT.PROJWBS.map((w) => [w.wbs_id, w.proj_node_flag === "Y" ? "(project)" : w.wbs_name]));
  const got = new Set([
    ...(yT.TASKMEMO || []).map((m) => `TASK|${yCode.get(m.task_id)}|${yTopic.get(m.memo_type_id)}|${norm(memoText(m.task_memo))}`),
    ...(yT.WBSMEMO || []).map((m) => `WBS|${yW.get(m.wbs_id)}|${yTopic.get(m.memo_type_id)}|${norm(memoText(m.wbs_memo))}`),
  ]);
  let backOk = 0;
  const miss = [];
  for (const e of src) { if (got.has(`${e.table}|${e.owner}|${e.topic}|${norm(e.text)}`)) backOk++; else if (miss.length < 5) miss.push(e); }
  const extra = (yT.TASKMEMO || []).length + (yT.WBSMEMO || []).length - src.length;
  // (3) topic order: P6 lists an activity's topics by MEMOTYPE seq_num; for
  // every owner with two or more entries, the order back must be the order before
  const seqOf = (rows) => new Map((rows || []).map((m) => [m.memo_type, Number(m.seq_num) || 0]));
  const s0 = seqOf(T.MEMOTYPE), s1 = seqOf(yT.MEMOTYPE);
  const orders = (list, seq) => { const by = new Map(); for (const e of list) { const k = `${e.table}|${e.owner}`; if (!by.has(k)) by.set(k, []); by.get(k).push(e.topic); } for (const v of by.values()) v.sort((a, b) => (seq.get(a) ?? 1e9) - (seq.get(b) ?? 1e9) || a.localeCompare(b)); return by; };
  const o0 = orders(src, s0);
  const o1 = orders([...(yT.TASKMEMO || []).map((m) => ({ table: "TASK", owner: yCode.get(m.task_id), topic: yTopic.get(m.memo_type_id) })), ...(yT.WBSMEMO || []).map((m) => ({ table: "WBS", owner: yW.get(m.wbs_id), topic: yTopic.get(m.memo_type_id) }))], s1);
  let multi = 0, sameOrder = 0;
  for (const [k, v] of o0) if (v.length > 1) { multi++; if ((o1.get(k) || []).join("|") === v.join("|")) sameOrder++; }
  const out = { file: label, project: r.project.name, entries: src.length, taskEntries: src.filter((e) => e.table === "TASK").length, wbsEntries: src.filter((e) => e.table === "WBS").length, inProjectXml: inXml, backInXer: backOk, extraEntries: extra, multiTopicOwners: multi, topicOrderKept: sameOrder, p6Problems: problems.length, miss };
  if (planted) {
    // memoText against the text the generator meant
    const meant = new Set(planted.map((p) => `${p.table}|${p.owner}|${p.topic}|${p.want}`));
    out.planted = planted.length;
    out.plantedForms = planted.reduce((a, p) => ((a[p.form] = (a[p.form] || 0) + 1), a), {});
    out.plantedReadAsMeant = src.filter((e) => meant.has(`${e.table}|${e.owner}|${e.topic}|${norm(e.text)}`)).length;
    out.plantedBack = planted.filter((p) => got.has(`${p.table}|${p.owner}|${p.topic}|${p.want}`)).length;
  }
  return out;
}

// --- MSPDI -> XER -> MSPDI --------------------------------------------------
function mspdiRoundTrip(file) {
  const text = readFileSync(file, "utf8");
  if (!/<Project[\s>][^]*xmlns="http:\/\/schemas\.microsoft\.com\/project"/.test(text.slice(0, 4000))) return null;
  let parsed;
  try { parsed = parseMspdi(text); } catch { return null; }
  const doc = parseXml(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  const proj = doc.children.find((c) => c.name === "Project");
  const tasks = (proj.children.find((c) => c.name === "Tasks")?.children || []);
  const notes = [];
  for (const t of tasks) {
    const n = t.children.find((c) => c.name === "Notes");
    if (n && n.text.trim()) notes.push({ uid: t.children.find((c) => c.name === "UID")?.text.trim(), name: t.children.find((c) => c.name === "Name")?.text.trim() || "", text: norm(n.text) });
  }
  if (!notes.length) return { file, notes: 0 };
  let back;
  try { back = p6XerText(text); } catch (e) { return { file, notes: notes.length, error: e.message }; }
  const problems = p6Problems(back.xer.tables);
  const yT = parseXer(back.text).tables;
  const memoTexts = [...(yT.TASKMEMO || []).map((m) => norm(memoText(m.task_memo))), ...(yT.WBSMEMO || []).map((m) => norm(memoText(m.wbs_memo)))];
  const inXer = notes.filter((n) => memoTexts.includes(n.text)).length;
  // and back to Project XML: the same note on a task of the same name
  const again = mspdiText(parseXer(back.text));
  const d2 = parseXml(again.xml).children.find((c) => c.name === "Project");
  const byName = new Map();
  for (const t of d2.children.find((c) => c.name === "Tasks").children) {
    const n = t.children.find((c) => c.name === "Notes");
    const uid = t.children.find((c) => c.name === "UID")?.text.trim();
    if (n) byName.set(uid === "0" ? "(project)" : t.children.find((c) => c.name === "Name")?.text.trim(), norm(notesText(parseNotes(n.text))));
  }
  const inProject = notes.filter((n) => byName.get(n.uid === "0" ? "(project)" : n.name) === n.text).length;
  return { file, notes: notes.length, inXer, backInProjectXml: inProject, p6Problems: problems.length };
}

const report = { date: new Date().toISOString().slice(0, 10), xer: [], planted: [], mspdi: [] };
const writeDir = opt("--write");
const xerDir = opt("--xer"), plantN = Number(opt("--plant") || 0), mspdiDir = opt("--mspdi");
if (xerDir) {
  for (const f of walk(xerDir, ".xer").sort()) {
    const x = parseXer(decodeXer(readFileSync(f)));
    const res = xerRoundTrip(x, basename(f));
    if (res.entries) report.xer.push(res);
    if (plantN) {
      const x2 = parseXer(decodeXer(readFileSync(f)));
      const pid = mspdiText(x2).project.id;
      const planted = plant(x2, pid, plantN, [...basename(f)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
      // through the XER writer and reader first, so quotes and 0x7F survive a file
      const x3 = parseXer(xerText(x2));
      report.planted.push(xerRoundTrip(x3, basename(f), planted));
    }
  }
}
if (mspdiDir) for (const f of walk(mspdiDir, ".xml").sort()) { const r = mspdiRoundTrip(f); if (r && r.notes) report.mspdi.push({ ...r, file: f.slice(mspdiDir.length + 1) }); }

const sum = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
for (const [name, rows] of [["real notebooks", report.xer], ["planted notebooks", report.planted]]) {
  if (!rows.length) continue;
  console.log(`\n${name}`);
  for (const r of rows) console.log(`  ${r.file}: ${r.entries} entries (${r.taskEntries} activity, ${r.wbsEntries} WBS); in Project XML ${r.inProjectXml}; back in XER ${r.backInXer}; topic order kept ${r.topicOrderKept}/${r.multiTopicOwners}; extra ${r.extraEntries}; p6Problems ${r.p6Problems}${r.planted ? `; planted ${r.planted}, read as meant ${r.plantedReadAsMeant}, back as meant ${r.plantedBack}` : ""}`);
  console.log(`  total: ${sum(rows, "entries")} entries, in Project XML ${sum(rows, "inProjectXml")}, back in XER ${sum(rows, "backInXer")}${rows[0].planted !== undefined ? `; planted ${sum(rows, "planted")}, read as meant ${sum(rows, "plantedReadAsMeant")}, back as meant ${sum(rows, "plantedBack")}` : ""}`);
}
if (report.mspdi.length) {
  console.log("\nProject task notes");
  for (const r of report.mspdi) console.log(`  ${r.file}: ${r.notes} notes; in XER ${r.inXer}; back in Project XML ${r.backInProjectXml}; p6Problems ${r.p6Problems}${r.error ? `; error ${r.error}` : ""}`);
  console.log(`  total: ${sum(report.mspdi, "notes")} notes in ${report.mspdi.length} files, in XER ${sum(report.mspdi, "inXer")}, back ${sum(report.mspdi, "backInProjectXml")}`);
}
const j = opt("--json");
if (j) writeFileSync(j, JSON.stringify(report, null, 1) + "\n");
