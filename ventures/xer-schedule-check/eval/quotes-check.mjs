// Doubled quotes: does parseXer read a P6 name the way MPXJ does?
// (eval/quotes-2026-11-21.md)
//
//   python eval/quotes-mpxj.py <dir>/*.xer > mpxj-names.jsonl
//   node eval/quotes-check.mjs <dir> mpxj-names.jsonl [--old ../path/old-xer.mjs]
//
// Matches task names by activity ID, resource names by resource short name and
// WBS names by WBS short name (first one seen; MPXJ's WBS is a dotted path, so
// only the last part is compared). Also counts every value that carries a quote,
// and whether xerText(parseXer(file)) writes each %R line back byte for byte.
// --old reads with another copy of xer.mjs (e.g. the one before the fix) for
// the before/after columns.
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as X from "../xer.mjs";

const args = process.argv.slice(2);
const dir = args[0], jsonl = args[1];
const oi = args.indexOf("--old");
const O = oi > 0 ? await import(pathToFileURL(resolve(args[oi + 1])).href) : null;
const mpxj = new Map();
for (const l of readFileSync(jsonl, "utf8").split("\n")) {
  if (!l.trim()) continue;
  const r = JSON.parse(l);
  const id = r.kind === "wbs" ? r.id.split(".").pop() : r.id;
  const k = `${r.file}|${r.kind}|${id}`;
  if (!mpxj.has(k)) mpxj.set(k, r.name);
}
const tot = { compared: 0, agree: 0, agreeOld: 0, quoted: 0, lines: 0, same: 0 };
for (const f of readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".xer")).sort()) {
  const text = X.decodeXer(readFileSync(join(dir, f)));
  const x = X.parseXer(text), o = O ? O.parseXer(text) : null;
  const rows = [];
  const pick = (xer, table, idF, nameF, kind) => (xer.tables[table] || []).map((r) => [kind, r[idF], r[nameF]]);
  for (const [table, idF, nameF, kind] of [["TASK", "task_code", "task_name", "task"], ["RSRC", "rsrc_short_name", "rsrc_name", "resource"], ["PROJWBS", "wbs_short_name", "wbs_name", "wbs"]]) {
    const a = pick(x, table, idF, nameF, kind), b = o ? pick(o, table, idF, nameF, kind) : a;
    a.forEach((r, i) => rows.push([...r, b[i][2]]));
  }
  let compared = 0, agree = 0, agreeOld = 0, quoted = 0;
  const seen = new Set();
  for (const [kind, id, name, oldName] of rows) {
    const k = `${f}|${kind}|${id}`;
    if (seen.has(k) || !mpxj.has(k)) continue;
    seen.add(k);
    const m = mpxj.get(k).trim();
    compared++;
    if (String(name).trim() === m) agree++;
    if (String(oldName).trim() === m) agreeOld++;
    if (String(name).includes('"')) quoted++;
  }
  const orig = text.split(/\r?\n/).filter((l) => l.startsWith("%R"));
  const back = X.xerText(x).split("\r\n").filter((l) => l.startsWith("%R"));
  const same = orig.filter((l, i) => l === back[i]).length;
  console.log(`${f}: names compared with MPXJ ${compared}, agree ${agree}${O ? ` (before: ${agreeOld})` : ""}, holding a quote ${quoted}; %R lines written back byte for byte ${same} / ${orig.length}`);
  tot.compared += compared; tot.agree += agree; tot.agreeOld += agreeOld; tot.quoted += quoted; tot.lines += orig.length; tot.same += same;
}
console.log(`TOTAL: ${tot.agree} / ${tot.compared} names agree with MPXJ${O ? ` (before: ${tot.agreeOld})` : ""}; ${tot.quoted} hold a quote; ${tot.same} / ${tot.lines} %R lines written back byte for byte`);
