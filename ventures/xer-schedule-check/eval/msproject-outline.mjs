// Activity codes as Microsoft Project outline codes, and back. For each XER,
// write the MSPDI with msproject.mjs { outlineCodes: true }, read it back with
// mspdi.mjs, and check, for every code type written as an outline code:
//  - the dictionary: every P6 value of the type is a lookup value with the
//    same code, the same parent and the same description;
//  - every activity's assignment: same code type (by alias), same value,
//    and so the same path up the tree.
// Each task form is checked on its own as well: the XML with only Project
// 2003's <OutlineCode><ValueID>, and with only Project 2007's
// <ExtendedAttribute> (value path and ValueGUID). The text-field code types
// beside them are counted back as in eval/msproject-codes.mjs.
//
//   node eval/msproject-outline.mjs <dir-or-files...> [--json out.json] [--xml-dir D] [--mpxj D]
//
// --xml-dir D saves each .xml; after
// `python eval/msproject-outline-mpxj.py D/<file>.xml D/<file>.outline.json`
// for each, --mpxj D compares MPXJ's reading (aliases, lookup tables, every
// task's value) with what was written.
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer } from "../xer.mjs";
import { parseMspdi } from "../mspdi.mjs";
import { mspdiText } from "../msproject.mjs";

const args = process.argv.slice(2);
const valOf = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const jsonOut = valOf("--json"), xmlDir = valOf("--xml-dir"), mpxjDir = valOf("--mpxj");
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--json", "--xml-dir", "--mpxj"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}
const nm = (s) => String(s ?? "").replace(/""/g, '"');
const leaf = (c) => nm(c.short_name || c.actv_code_name || c.actv_code_id).trim();

// the tables a reading gives, keyed by type name: { codes: Map(id -> row), byTask: Map(uid -> code id) }
function byName(B) {
  const types = new Map((B.ACTVTYPE || []).map((r) => [r.actv_code_type_id, r.actv_code_type]));
  const out = new Map();
  for (const [id, name] of types) out.set(name, { id, codes: new Map(), byTask: new Map() });
  const typeOfCode = new Map();
  for (const c of B.ACTVCODE || []) { const o = out.get(types.get(c.actv_code_type_id)); if (o) { o.codes.set(c.actv_code_id, c); typeOfCode.set(c.actv_code_id, o); } }
  for (const a of B.TASKACTV || []) { const o = out.get(types.get(a.actv_code_type_id)); if (o) o.byTask.set(a.task_id, a.actv_code_id); }
  return out;
}
const chain = (codes, id) => { const p = []; for (let x = codes.get(id), n = 0; x && n < 50; x = codes.get(x.parent_actv_code_id), n++) p.unshift(leaf(x)); return p.join(" > "); };

function check(conv, xml, xer) {
  const back = parseMspdi(xml);
  const got = byName(back.tables);
  const T = xer.tables;
  const codeRows = new Map((T.ACTVCODE || []).map((r) => [r.actv_code_id, r]));
  const r = { dict: 0, dictSame: 0, assign: 0, assignSame: 0, pathSame: 0, p6PathSame: 0, descSame: 0, bad: [] };
  for (const f of conv.outlineFields.fields) {
    const g = got.get(f.alias);
    // dictionary
    const gItems = g ? [...g.codes.values()] : [];
    for (const it of f.items) {
      r.dict++;
      const pathWant = (() => { const p = []; for (let x = it, n = 0; x && n < 50; x = f.items[x.parentVid - 1], n++) p.unshift(x.code.trim()); return p.join(" > "); })();
      const m = gItems[it.vid - 1];
      const ok = m && leaf(m) === it.code.trim() && chain(g.codes, m.actv_code_id) === pathWant && (m.actv_code_name || "").trim() === (it.desc.trim() || it.code.trim());
      if (ok) r.dictSame++;
      else if (r.bad.length < 5) r.bad.push(`dict ${f.alias} ${pathWant}: got ${m ? `${chain(g.codes, m.actv_code_id)} / ${m.actv_code_name}` : "nothing"}`);
    }
    for (const [taskId, it] of f.task) {
      r.assign++;
      const uid = String(conv.taskUid.get(taskId));
      const cid = g?.byTask.get(uid);
      const m = cid && g.codes.get(cid);
      const pWant = chain(codeRows, it.row.actv_code_id);
      // the P6 path, from ACTVCODE's own parents (a parent outside the type is cut in the table)
      const pWritten = (() => { const p = []; for (let x = it, n = 0; x && n < 50; x = f.items[x.parentVid - 1], n++) p.unshift(x.code.trim()); return p.join(" > "); })();
      if (m && leaf(m) === leaf(it.row)) r.assignSame++;
      if (m && chain(g.codes, cid) === pWant) r.p6PathSame++;
      if (m && chain(g.codes, cid) === pWritten) r.pathSame++;
      else if (r.bad.length < 5) r.bad.push(`task ${taskId} ${f.alias}: want ${pWant}, got ${m ? chain(g.codes, cid) : "nothing"}`);
      if (m && (m.actv_code_name || "").trim() === (nm(it.row.actv_code_name).trim() || leaf(it.row))) r.descSame++;
    }
  }
  // the text-field code types beside them
  let textAssign = 0, textSame = 0;
  for (const f of conv.codeFields.fields) {
    const g = got.get(f.alias);
    for (const [taskId, v] of f.values) {
      textAssign++;
      const cid = g?.byTask.get(String(conv.taskUid.get(taskId)));
      if (cid && g.codes.get(cid)?.short_name === v.trim()) textSame++;
    }
  }
  return { ...r, textAssign, textSame, warnings: back.warnings.filter((w) => /outline/.test(w)) };
}

const out = [];
for (const f of files) {
  const xer = parseXer(decodeXer(readFileSync(f)));
  const t0 = Date.now();
  const conv = mspdiText(xer, { outlineCodes: true });
  const ms = Date.now() - t0;
  if (xmlDir) writeFileSync(join(xmlDir, basename(f).replace(/\.xer$/i, ".xml")), conv.xml);
  const both = check(conv, conv.xml, xer);
  const only2003 = check(conv, conv.xml.replace(/<ExtendedAttribute><FieldID>1887441\d\d<\/FieldID><Value>[^<]*<\/Value><ValueGUID>[^<]*<\/ValueGUID><\/ExtendedAttribute>/g, ""), xer);
  const only2007 = check(conv, conv.xml.replace(/<OutlineCode><FieldID>\d+<\/FieldID><ValueID>\d+<\/ValueID><\/OutlineCode>/g, ""), xer);
  // the 2007 form by path alone (a writer that leaves out ValueGUID)
  const byPath = check(conv, conv.xml.replace(/<OutlineCode><FieldID>\d+<\/FieldID><ValueID>\d+<\/ValueID><\/OutlineCode>/g, "").replace(/<ValueGUID>[^<]*<\/ValueGUID>/g, ""), xer);
  const row = {
    file: basename(f), ms,
    outlineFields: conv.outlineFields.fields.map((x) => ({ field: x.fieldName, alias: x.alias, values: x.items.length, depth: x.depth, sep: x.sep, tasks: x.task.size })),
    textFields: conv.codeFields.fields.length,
    both, only2003: { assignSame: only2003.assignSame, pathSame: only2003.pathSame }, only2007: { assignSame: only2007.assignSame, pathSame: only2007.pathSame }, byPath: { assignSame: byPath.assignSame, pathSame: byPath.pathSame },
    notCarried: conv.warnings.filter((w) => /^not carried/.test(w)),
  };
  if (mpxjDir) {
    const p = join(mpxjDir, basename(f).replace(/\.xer$/i, ".outline.json"));
    if (existsSync(p)) {
      const m = JSON.parse(readFileSync(p, "utf8"));
      let aliases = 0, dict = 0, dictSame = 0, tasks = 0, tasksSame = 0;
      const actId = new Map((xer.tables.TASK || []).map((t) => [t.task_id, nm(t.task_code)]));
      for (const x of conv.outlineFields.fields) {
        const n = x.fieldName.replace("Outline Code", "");
        const mf = m.fields[n];
        if (mf && mf.alias === x.alias) aliases++;
        for (const it of x.items) {
          dict++;
          const mv = mf?.values[it.vid - 1];
          const parentCode = it.parentVid ? x.items[it.parentVid - 1].code : null;
          if (mv && mv.value === it.code && (mv.description || "") === it.desc && (mv.parent ?? null) === parentCode) dictSame++;
        }
        for (const [taskId, it] of x.task) {
          tasks++;
          if (m.tasks[actId.get(taskId)]?.[n] === it.path) tasksSame++;
        }
      }
      row.mpxj = { aliases: `${aliases}/${conv.outlineFields.fields.length}`, dict: `${dictSame}/${dict}`, tasks: `${tasksSame}/${tasks}` };
    }
  }
  out.push(row);
  console.log(`${row.file}: ${row.outlineFields.length} outline codes (${both.dict} lookup values, ${both.dictSame} back the same), ${both.assign} assignments: ${both.assignSame} same code, ${both.pathSame} same path (${both.p6PathSame} = P6's tree), ${both.descSame} same description; 2003 form alone ${only2003.pathSame}, 2007 form alone ${only2007.pathSame}, by path alone ${byPath.pathSame}; text fields ${both.textSame}/${both.textAssign}${row.mpxj ? `; MPXJ aliases ${row.mpxj.aliases}, lookup ${row.mpxj.dict}, tasks ${row.mpxj.tasks}` : ""} (${ms} ms)`);
  for (const b of both.bad) console.log("   ", b);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + "\n");
