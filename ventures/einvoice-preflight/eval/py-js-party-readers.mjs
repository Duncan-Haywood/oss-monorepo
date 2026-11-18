// Do the Python readers (ubl.py, formats.py) map a party's identifiers the way
// the page's readers (ubl.mjs, cii.mjs) do? endpoint.py's INV-041 and INV-062
// read legal_id, party_ids and endpoint, so a field one reader fills and the
// other drops is a check the CLI and the page disagree on.
//
// Runs every UBL and CII XML file under this venture (and any paths given)
// through both and compares those three fields per party. No network.
//   node eval/py-js-party-readers.mjs [more.xml ...]
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseUblInvoice } from "../ubl.mjs";
import { parseCiiInvoice, looksLikeCii } from "../cii.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (name === "node_modules" || name.startsWith(".")) return [];
  return statSync(path).isDirectory() ? walk(path) : name.endsWith(".xml") ? [path] : [];
});
const files = [...walk(ROOT), ...process.argv.slice(2)];
const FIELDS = ["legal_id", "party_ids", "endpoint"];
const pick = (invoice) => Object.fromEntries(["supplier", "customer"].map((p) => [p,
  Object.fromEntries(FIELDS.map((f) => [f, (invoice[p] || {})[f] ?? null]))]));

const py = `
import json, sys
sys.path.insert(0, sys.argv[1])
from einvoice_preflight.formats import detect_syntax, parse_cii_invoice
from einvoice_preflight.ubl import parse_ubl_invoice
out = {}
for path in sys.argv[2:]:
    raw = open(path, "rb").read()
    try:
        syntax = detect_syntax(raw)
        inv = parse_cii_invoice(raw) if syntax == "cii" else parse_ubl_invoice(raw)
        out[path] = {p: {f: (inv.get(p) or {}).get(f) for f in ("legal_id", "party_ids", "endpoint")} for p in ("supplier", "customer")}
    except Exception as error:
        out[path] = {"error": type(error).__name__}
print(json.dumps(out))
`;

const js = {};
const candidates = [];
for (const path of files) {
  const source = readFileSync(path, "utf8");
  const cii = looksLikeCii(source);
  const ubl = !cii && /<(\w+:)?(Invoice|CreditNote)\b[^>]*urn:oasis:names:specification:ubl/.test(source);
  if (!cii && !ubl) continue;
  try {
    js[path] = pick(cii ? parseCiiInvoice(source) : parseUblInvoice(source));
    candidates.push(path);
  } catch { /* the page refuses it too; not a reader comparison */ }
}
const pyOut = JSON.parse(execFileSync("python3", ["-c", py, join(ROOT, "src"), ...candidates], { maxBuffer: 1 << 26 }).toString());
let same = 0, filled = 0;
const diffs = [];
for (const path of candidates) {
  const a = JSON.stringify(js[path]);
  const b = JSON.stringify(pyOut[path]);
  if (pyOut[path].error) { diffs.push(`${relative(ROOT, path)}: Python refused it (${pyOut[path].error})`); continue; }
  if (a === b) same += 1; else diffs.push(`${relative(ROOT, path)}:\n  js ${a}\n  py ${b}`);
  if (/"(legal_id|party_ids|endpoint)":\{|"party_ids":\[/.test(a)) filled += 1;
}
console.log(`${candidates.length} UBL/CII files both readers parse; ${same} map legal_id, party_ids and endpoint the same (${filled} carry at least one); ${diffs.length} differ.`);
for (const line of diffs) console.log(line);
process.exitCode = diffs.length ? 1 : 0;
