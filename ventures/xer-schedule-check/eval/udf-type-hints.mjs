// UDF types on the P6 -> Project XML -> P6 round trip, with and without the
// original XER as a type hint (p6XerText's udfTypesFrom, CLI --udf-types-from).
// eval/udf-type-hints-2026-11-22.md says what it found.
//
// node eval/udf-type-hints.mjs <XER files or a dir> [--json out.json]
//
// For each XER: msproject.mjs writes the Project XML, p6xer.mjs writes it back
// to XER twice (no hint, hint = the original), and each result is compared with
// the original's activity UDFs by activity ID, title and value, and then also
// by P6's type (FT_INT, FT_FLOAT_2_DECIMALS, FT_TEXT, ...). Activity code
// assignments are compared too, so a hint that turned a real code into a UDF
// would show. p6Problems must stay at 0.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer, num } from "../xer.mjs";
import { mspdiText } from "../msproject.mjs";
import { p6XerText, p6Problems } from "../p6xer.mjs";

const args = process.argv.slice(2);
const jsonAt = args.indexOf("--json");
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : "";
const inputs = args.filter((a, k) => !a.startsWith("--") && (jsonAt < 0 || k !== jsonAt + 1));
const files = inputs.flatMap((p) => (statSync(p).isDirectory() ? readdirSync(p).filter((f) => /\.xer$/i.test(f)).sort().map((f) => join(p, f)) : [p]));

// a CCA UDF title holds "|", so keys are joined with a control character
const SEP = "\u0001";
const title = (s) => String(s ?? "").replace(/\[/g, "(").replace(/\]/g, ")").replace(/\s+/g, " ").trim().toLowerCase();
// activity|title|value[|type]; the "kind" (number, date, text) is what Project can carry, the type is P6's own
const udfs = (T, keyOf, withType) => {
  const types = new Map((T.UDFTYPE || []).filter((u) => u.table_name === "TASK").map((u) => [u.udf_type_id, u]));
  const out = new Map(); // key -> type
  for (const v of T.UDFVALUE || []) {
    const u = types.get(v.udf_type_id), k = keyOf(v.fk_id);
    if (!u || k === undefined) continue;
    const t = u.logical_data_type;
    const x = /DATE/.test(t) ? v.udf_date : /INT|FLOAT|MONEY/.test(t) ? String(num(v.udf_number)) : String(v.udf_text).replace(/""/g, '"');
    if (x === "" || x === "null") continue;
    out.set([k, title(u.udf_type_label || u.udf_type_name), x].join(SEP), t);
  }
  return out;
};
const codes = (T, keyOf) => {
  const type = new Map((T.ACTVTYPE || []).map((t) => [t.actv_code_type_id, t.actv_code_type]));
  const code = new Map((T.ACTVCODE || []).map((c) => [c.actv_code_id, c.short_name]));
  return new Set((T.TASKACTV || []).filter((r) => keyOf(r.task_id) !== undefined).map((r) => [keyOf(r.task_id), type.get(r.actv_code_type_id), code.get(r.actv_code_id)].join(SEP)));
};

const rows = [];
for (const f of files) {
  const text = decodeXer(readFileSync(f));
  const X = parseXer(text);
  const conv = mspdiText(X);
  const pid = conv.project.id;
  const P6code = new Map(X.tables.TASK.filter((t) => t.proj_id === pid && conv.taskUid.has(t.task_id)).map((t) => [t.task_id, t.task_code.replace(/""/g, '"')]));
  const A = udfs(X.tables, (id) => P6code.get(id));
  const written = new Set((conv.udfFields?.fields || []).map((f) => f.typeId));
  const writtenTitles = new Set((X.tables.UDFTYPE || []).filter((u) => written.has(u.udf_type_id)).map((u) => title(u.udf_type_label || u.udf_type_name)));
  // what Project could carry: values of UDFs msproject.mjs wrote to a field
  const want = new Map([...A].filter(([k]) => writtenTitles.has(k.split(SEP)[1])));
  const codesA = codes(X.tables, (id) => P6code.get(id));
  const row = { file: basename(f), version: X.version, udfValues: A.size, carried: want.size, byType: {} };
  for (const t of want.values()) row.byType[t] = (row.byType[t] || 0) + 1;
  for (const [name, opts] of [["noHint", {}], ["hint", { udfTypesFrom: text }]]) {
    const r = p6XerText(conv.xml, opts);
    const B = parseXer(r.text);
    const codeOf = new Map(B.tables.TASK.map((t) => [t.task_id, t.task_code]));
    const got = udfs(B.tables, (id) => codeOf.get(id));
    let back = 0, typed = 0;
    const wrongType = {};
    for (const [k, t] of want) {
      if (!got.has(k)) continue;
      back++;
      if (got.get(k) === t) typed++;
      else { const w = `${t} -> ${got.get(k)}`; wrongType[w] = (wrongType[w] || 0) + 1; }
    }
    const extra = [...got.keys()].filter((k) => !want.has(k)).length;
    // codes: the original's activity codes that msproject.mjs wrote, back as codes
    const typesWritten = new Set((r.xer.tables.ACTVTYPE || []).map((t) => t.actv_code_type));
    const codesB = codes(B.tables, (id) => codeOf.get(id));
    const realCodes = [...codesA].filter((k) => !writtenTitles.has(title(k.split(SEP)[1])));
    const codesBack = realCodes.filter((k) => codesB.has(k)).length;
    // code assignments that are really text UDF values
    const udfAsCodes = [...codesB].filter((k) => !codesA.has(k)).length;
    row[name] = { back, typed, extra, wrongType, codesBack, realCodes: realCodes.length, codeTypesWritten: typesWritten.size, udfAsCodes, problems: p6Problems(r.xer.tables).length };
  }
  rows.push(row);
  const h = row.hint, n = row.noHint;
  console.log(`${row.file}: ${row.carried} UDF values carried; back ${n.back} -> ${h.back}; with P6's type ${n.typed} -> ${h.typed}; extra ${n.extra} -> ${h.extra}; text UDF values read as codes ${n.udfAsCodes} -> ${h.udfAsCodes}; real codes back ${n.codesBack}/${n.realCodes} -> ${h.codesBack}/${h.realCodes}; problems ${n.problems} -> ${h.problems}${Object.keys(h.wrongType).length ? `; still wrong ${JSON.stringify(h.wrongType)}` : ""}`);
}
const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
console.log(`Total: ${sum((r) => r.carried)} values; back ${sum((r) => r.noHint.back)} -> ${sum((r) => r.hint.back)}; with P6's type ${sum((r) => r.noHint.typed)} -> ${sum((r) => r.hint.typed)}; real codes back ${sum((r) => r.noHint.codesBack)} -> ${sum((r) => r.hint.codesBack)} of ${sum((r) => r.hint.realCodes)}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ date: "2026-11-22", rows }, null, 1) + "\n");
