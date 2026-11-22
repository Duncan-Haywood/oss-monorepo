// Project interim plans on the way to P6, 2026-11-22
// (eval/interim-plans-2026-11-22.md).
//
// Microsoft Project's Set Baseline > Interim plan copies each task's Start and
// Finish (or a baseline's) into a Start1..10 / Finish1..10 pair. Since
// 2026-11-22 (eval/finish-udfs-2026-11-22.md) mspdi.mjs reads those fields as
// start- and finish-date UDFs, so an interim plan reaches P6 as two date UDFs
// titled Start1 and Finish1. mspdi.mjs now names a pair that looks like one
// (interimPairs) and leaves it out on request (interim: "skip", CLI
// --no-interim). This script measures both on Project's own files:
//
//   1. false alarms: every Project XML file under <mpxj>/junit/data (MPXJ's
//      test data, saved by Project 2002 to 2019 and other tools) read as it
//      is: how many pairs are named;
//   2. planted interim plans on each file with two or more tasks, in a
//      Start/Finish pair the file leaves free:
//        fresh     every task, Start k = Start, Finish k = Finish
//        selected  every other task only (Interim plan > Selected tasks)
//        moved     every task, the copy 5 days before Start and 3 before
//                  Finish (the schedule moved after the plan was set)
//        nodef     fresh, with no ExtendedAttribute definition for the pair
//      each must be named, and with interim "skip" the XER (p6xer.mjs) must
//      hold exactly the UDFs the unplanted file gives, with no p6Problems;
//   3. planted pairs that are not interim plans, which must not be named:
//        aliased   fresh, but the fields carry aliases (Permit Start/Finish)
//        startonly Start k on every task, no Finish k
//        reversed  fresh, but one task's Start k after its Finish k
//      and a planner's own unnamed two-task pair (own2), which the rule
//      cannot tell from an interim plan on two selected tasks: counted, it is
//      the known false alarm.
//
//   node eval/interim-plans.mjs --mpxj <mpxj>/junit/data [--json out.json]

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseMspdi, interimPairs, UDF_FIELD_IDS } from "../mspdi.mjs";
import { p6XerText, p6Problems } from "../p6xer.mjs";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const root = opt("--mpxj");
if (!root) { console.error("usage: node eval/interim-plans.mjs --mpxj <mpxj>/junit/data [--json out.json]"); process.exit(2); }
const files = execFileSync("find", [root, "-name", "*.xml"]).toString().trim().split("\n").sort();

const START = UDF_FIELD_IDS.filter(([, , n]) => /^Start\d/.test(n)).map(([id]) => id);
const FINISH = UDF_FIELD_IDS.filter(([, , n]) => /^Finish\d/.test(n)).map(([id]) => id);
const shift = (iso, days) => { const d = new Date(`${iso.slice(0, 19)}Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 19); };
const ea = (id, v) => `<ExtendedAttribute><FieldID>${id}</FieldID><Value>${v}</Value></ExtendedAttribute>`;
const udfKey = (x) => {
  const t = new Map((x.tables.UDFTYPE || []).map((u) => [u.udf_type_id, `${u.table_name}|${u.udf_type_label}|${u.logical_data_type}`]));
  return (x.tables.UDFVALUE || []).map((v) => `${t.get(v.udf_type_id)}|${v.fk_id}|${v.udf_date}|${v.udf_number}|${v.udf_text}`).sort().join("\n");
};

// plant(xml, k, mode) -> xml with Start k / Finish k set as `mode` says
function plant(xml, k, mode) {
  const sid = START[k - 1], fid = FINISH[k - 1];
  let n = 0;
  let out = xml.replace(/<Task>([\s\S]*?)<\/Task>/g, (whole, body) => {
    const st = /<Start>([^<]+)<\/Start>/.exec(body)?.[1], fi = /<Finish>([^<]+)<\/Finish>/.exec(body)?.[1];
    if (!st || !fi) return whole;
    const i = n++;
    let add = "";
    if (mode === "selected" && i % 2) return whole;
    if (mode === "own2" && i > 1) return whole;
    if (mode === "moved") add = ea(sid, shift(st, -5)) + ea(fid, shift(fi, -3));
    else if (mode === "startonly") add = ea(sid, st);
    else if (mode === "reversed" && i === 0) add = ea(sid, shift(fi, 1)) + ea(fid, st);
    else add = ea(sid, st) + ea(fid, fi);
    return `<Task>${body}${add}</Task>`;
  });
  if (mode !== "nodef") {
    const alias = mode === "aliased" ? ["<Alias>Permit Start</Alias>", "<Alias>Permit Finish</Alias>"] : ["", ""];
    const defs = `<ExtendedAttribute><FieldID>${sid}</FieldID><FieldName>Start${k}</FieldName>${alias[0]}</ExtendedAttribute><ExtendedAttribute><FieldID>${fid}</FieldID><FieldName>Finish${k}</FieldName>${alias[1]}</ExtendedAttribute>`;
    // Project writes an empty <ExtendedAttributes/> when no field is defined
    out = /<ExtendedAttributes>/.test(out) ? out.replace("<ExtendedAttributes>", `<ExtendedAttributes>${defs}`)
      : /<ExtendedAttributes\s*\/>/.test(out) ? out.replace(/<ExtendedAttributes\s*\/>/, `<ExtendedAttributes>${defs}</ExtendedAttributes>`)
      : out.replace(/<Tasks>/, `<ExtendedAttributes>${defs}</ExtendedAttributes><Tasks>`);
  }
  return out;
}

const res = { files: 0, read: 0, asIs: { filesNamed: 0, pairs: 0, named: [] }, planted: {}, skipped: [] };
const MODES = ["fresh", "selected", "moved", "nodef", "aliased", "startonly", "reversed", "own2"];
const SHOULD = new Set(["fresh", "selected", "moved", "nodef", "own2"]);
for (const m of MODES) res.planted[m] = { files: 0, named: 0, skipExact: 0, keepAdds: 0, problems: 0, misses: [] };

for (const f of files) {
  const xml = readFileSync(f, "utf8").replace(/^﻿/, "");
  if (!/<Project[\s>]/.test(xml.slice(0, 4000)) || !/<Tasks>/.test(xml)) continue;
  res.files++;
  let base;
  try { base = parseMspdi(xml); } catch (e) { res.skipped.push(`${f.slice(root.length)}: ${e.message}`); continue; }
  res.read++;
  const named = interimPairs(xml);
  if (named.length) { res.asIs.filesNamed++; res.asIs.pairs += named.length; res.asIs.named.push(`${f.slice(root.length)}: ${named.map((p) => `Start${p.k}/Finish${p.k} on ${p.tasks}`).join(", ")}`); }
  const dated = (xml.match(/<Task>[\s\S]*?<\/Task>/g) || []).filter((t) => /<Start>[^<]+<\/Start>/.test(t) && /<Finish>[^<]+<\/Finish>/.test(t)).length;
  if (dated < 2) continue;
  // a pair the file leaves free
  const used = new Set([...xml.matchAll(/<FieldID>(\d+)<\/FieldID>/g)].map((m) => m[1]));
  const k = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find((j) => !used.has(START[j - 1]) && !used.has(FINISH[j - 1]));
  if (!k) continue;
  let baseXer;
  try { baseXer = p6XerText(xml); } catch (e) { res.skipped.push(`${f.slice(root.length)} (to XER): ${e.message}`); continue; }
  const baseKey = udfKey(baseXer.xer);
  for (const m of MODES) {
    const r = res.planted[m];
    const p = plant(xml, k, m);
    // "selected" on a file with one task besides the project summary task
    // plants one task, which the rule leaves alone by design (two at least)
    if (m === "selected" && Math.ceil(dated / 2) < 2) { r.oneTask = (r.oneTask || 0) + 1; continue; }
    r.files++;
    const name = f.slice(root.length);
    if (interimPairs(p).some((q) => q.k === k)) { r.named++; if (!SHOULD.has(m)) r.misses.push(`${name}: named`); }
    else if (SHOULD.has(m)) r.misses.push(`${name}: not named (${dated} dated task(s), the project summary task among them)`);
    if (!SHOULD.has(m) || m === "own2") continue;
    const skip = p6XerText(p, { interim: "skip" });
    if (udfKey(skip.xer) === baseKey) r.skipExact++;
    if (p6Problems(skip.xer.tables).length) r.problems++;
    const keep = p6XerText(p);
    // keep: the UDFs the unplanted file gives, plus Start k and Finish k (as
    // activity UDFs, and as WBS UDFs too when summary tasks hold the plan)
    const before = new Set((baseXer.xer.tables.UDFTYPE || []).map((u) => `${u.table_name}|${u.udf_type_label}`));
    const added = (keep.xer.tables.UDFTYPE || []).filter((u) => !before.has(`${u.table_name}|${u.udf_type_label}`));
    const labels = new Set(added.map((u) => u.udf_type_label));
    if (added.length && labels.size === 2 && labels.has(`Start${k}`) && labels.has(`Finish${k}`)) r.keepAdds++;
    else r.misses.push(`${name}: keep added ${added.map((u) => `${u.table_name} ${u.udf_type_label}`).join(", ") || "nothing"}`);
  }
}

const lines = [`${res.files} Project XML files, ${res.read} read (${res.skipped.length} skipped)`, `as saved: ${res.asIs.pairs} pair(s) named in ${res.asIs.filesNamed} file(s)`, ...res.asIs.named.map((s) => `  ${s}`)];
for (const m of MODES) {
  const r = res.planted[m];
  lines.push(`${m.padEnd(9)} named ${r.named}/${r.files}${r.oneTask ? ` (+${r.oneTask} file(s) where it would hold one task, left out)` : ""} (${m === "own2" ? "a planner's own pair: the known false alarm" : SHOULD.has(m) ? "should be named" : "should not be named"})${SHOULD.has(m) && m !== "own2" ? `; skip = unplanted UDFs ${r.skipExact}/${r.files}; keep adds the 2 UDFs ${r.keepAdds}/${r.files}; p6Problems ${r.problems}` : ""}`);
}
console.log(lines.join("\n"));
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(res, null, 2) + "\n");
