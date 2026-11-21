// Activity codes through Microsoft Project XML and back. For each XER file,
// write the MSPDI with msproject.mjs (codes as Text2..Text30), read it back
// with mspdi.mjs, and check every activity code assignment: same code type
// (by name), same value code and, with --code-names, the same description.
//
//   node eval/msproject-codes.mjs <dir-or-files...> [--code-names] [--json out.json] [--xml-dir D]
//
// --xml-dir D also saves each .xml in D; then, after
// `python eval/msproject-codes-mpxj.py D/<file>.xml D/<file>.mpxj.json` for each,
// `--mpxj D` compares MPXJ's reading of every text field with what was written.
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer } from "../xer.mjs";
import { parseMspdi } from "../mspdi.mjs";
import { mspdiText } from "../msproject.mjs";

const args = process.argv.slice(2);
const codeNames = args.includes("--code-names");
const valOf = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const jsonOut = valOf("--json"), xmlDir = valOf("--xml-dir"), mpxjDir = valOf("--mpxj");
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--json", "--xml-dir", "--mpxj"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}
const nm = (s) => String(s ?? "").replace(/""/g, '"');
const alias = (s) => s.replace(/\[/g, "(").replace(/\]/g, ")");
const out = [];
for (const f of files) {
  const xer = parseXer(decodeXer(readFileSync(f)));
  const t0 = Date.now();
  const conv = mspdiText(xer, { codeNames });
  const back = parseMspdi(conv.xml);
  const ms = Date.now() - t0;
  if (xmlDir) writeFileSync(join(xmlDir, basename(f).replace(/\.xer$/i, ".xml")), conv.xml);
  const T = xer.tables, B = back.tables;
  const types = new Map((T.ACTVTYPE || []).map((r) => [r.actv_code_type_id, nm(r.actv_code_type)]));
  const codes = new Map((T.ACTVCODE || []).map((r) => [r.actv_code_id, r]));
  const bTypes = new Map((B.ACTVTYPE || []).map((r) => [r.actv_code_type_id, r.actv_code_type]));
  const bCodes = new Map((B.ACTVCODE || []).map((r) => [r.actv_code_id, r]));
  const got = new Map(); // `${uid}|${type name}` -> code row
  for (const a of B.TASKACTV || []) got.set(`${a.task_id}|${bTypes.get(a.actv_code_type_id)}`, bCodes.get(a.actv_code_id));
  const aliasOf = new Map(conv.xml.match(/<ExtendedAttribute><FieldID>\d+<\/FieldID><FieldName>Text\d+<\/FieldName><Alias>[^<]*<\/Alias>/g)?.map((x) => x.match(/<Alias>([^<]*)</)[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")).map((a) => [a, a]) || []);
  let n = 0, same = 0, sameDesc = 0, outOfRoom = 0, merged = 0, split = 0;
  const fwd = new Map(), rev = new Map();
  const bad = [];
  const seen = new Set();
  for (const a of T.TASKACTV || []) {
    if (!conv.taskUid.has(a.task_id)) continue;
    const c = codes.get(a.actv_code_id);
    if (!c) continue;
    const key0 = `${a.task_id}|${a.actv_code_type_id}`;
    if (seen.has(key0)) continue;
    seen.add(key0);
    const tname = alias(types.get(a.actv_code_type_id) || `code type ${a.actv_code_type_id}`);
    const al = aliasOf.has(tname) ? tname : aliasOf.has(`${tname} (${a.actv_code_type_id})`) ? `${tname} (${a.actv_code_type_id})` : null;
    if (!al) { outOfRoom++; continue; }
    n++;
    const b = got.get(`${conv.taskUid.get(a.task_id)}|${al}`);
    const leaf = nm(c.short_name || c.actv_code_name || c.actv_code_id);
    // the written code is the leaf, or the whole path for a type whose leaves repeat
    const path = []; for (let x = c, g = 0; x && g < 50; x = codes.get(x.parent_actv_code_id), g++) path.unshift(nm(x.short_name || x.actv_code_name || x.actv_code_id));
    const want = b && b.short_name === path.join(".") ? path.join(".") : leaf;
    if (b && b.short_name === want) same++;
    // no two P6 values may land on one Project value, nor one P6 value on two
    if (b) { const k1 = `${al}|${a.actv_code_id}`, k2 = `${al}|${b.actv_code_id}`; if (fwd.has(k1) && fwd.get(k1) !== k2) split++; if (rev.has(k2) && rev.get(k2) !== k1) merged++; fwd.set(k1, k2); rev.set(k2, k1); }
    else if (bad.length < 5) bad.push({ task: a.task_id, type: tname, want, got: b?.short_name ?? null });
    const wantDesc = nm(c.actv_code_name || "").trim(); // MSPDI values are read trimmed
    if (b && (!codeNames || !wantDesc || wantDesc === want || b.actv_code_name === wantDesc)) sameDesc++;
  }
  const row = { file: basename(f), types: (T.ACTVTYPE || []).length, fieldsWritten: conv.counts.codeTypes, assignments: n, codeSame: same, descSame: codeNames ? sameDesc : null, leftOutPastRoom: outOfRoom, valuesMerged: merged, valuesSplit: split, ms, bad };
  if (mpxjDir && existsSync(join(mpxjDir, basename(f).replace(/\.xer$/i, ".mpxj.json")))) {
    // what msproject.mjs meant to write, by activity ID and alias, against MPXJ's reading
    const m = JSON.parse(readFileSync(join(mpxjDir, basename(f).replace(/\.xer$/i, ".mpxj.json")), "utf8"));
    const fieldsDef = conv.codeFields.fields;
    let cells = 0, agree = 0, aliasOk = 0;
    for (const fd of fieldsDef) if (m.aliases[fd.fieldName.slice(4)] === fd.alias) aliasOk++;
    const byId = new Map(T.TASK.filter((t) => conv.taskUid.has(t.task_id)).map((t) => [t.task_id, t.task_code]));
    for (const fd of fieldsDef) for (const [tid, v] of fd.values) { cells++; if ((m.tasks[byId.get(tid)] || {})[fd.alias] === v.trim()) agree++; }
    let extra = 0; for (const r of Object.values(m.tasks)) extra += Object.keys(r).length;
    row.mpxj = { aliases: `${aliasOk}/${fieldsDef.length}`, cells: `${agree}/${cells}`, cellsMpxjRead: extra };
    console.log(`  MPXJ: aliases ${aliasOk}/${fieldsDef.length}, values ${agree}/${cells}, MPXJ read ${extra} values in all`);
  }
  out.push(row);
  console.log(`${row.file}: ${row.fieldsWritten} text fields, ${same}/${n} codes back${codeNames ? `, ${sameDesc}/${n} descriptions` : ""}${outOfRoom ? `, ${outOfRoom} past the 29 fields` : ""}, ${merged} merged, ${split} split (${ms} ms)${bad.length ? " " + JSON.stringify(bad) : ""}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + "\n");
