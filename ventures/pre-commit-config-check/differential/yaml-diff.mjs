// Differential test: does loadYaml build what PyYAML's SafeLoader builds?
// Usage: node differential/yaml-diff.mjs <python-with-pyyaml> <file>...
// Both sides are reduced to a typed canonical form ({"int": "6"} etc.) and
// compared per file.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { loadYaml, PyScalar, pyRepr } from "../yaml11.mjs";

const [python, ...files] = process.argv.slice(2);
function canon(v) {
  if (v === null) return null;
  if (typeof v === "string" || typeof v === "boolean") return v;
  if (v instanceof PyScalar) return { [v.type]: v.type === "int" || v.type === "float" ? pyRepr(v) : v.type === "date" ? v.src : null };
  if (Array.isArray(v)) return v.map(canon);
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [k.startsWith("\u0000") ? k.slice(1) : k, canon(x)]));
  throw new Error("?");
}
const py = `
import json,sys,yaml,datetime
def canon(v):
    if v is None or isinstance(v,(str,bool)): return v
    if isinstance(v,int): return {'int':repr(v)}
    if isinstance(v,float): return {'float':repr(v)}
    if isinstance(v,datetime.datetime): return {'datetime':None}
    if isinstance(v,datetime.date): return {'date':v.isoformat()}
    if isinstance(v,list): return [canon(x) for x in v]
    if isinstance(v,dict): return {(k if isinstance(k,str) else repr(k)):canon(x) for k,x in v.items()}
    return repr(v)
out={}
for f in sys.argv[1:]:
    try: out[f]={'ok':canon(yaml.load(open(f,encoding='utf-8').read(),Loader=yaml.SafeLoader))}
    except Exception as e: out[f]={'err':str(e).splitlines()[0]}
print(json.dumps(out))
`;
const r = spawnSync(python, ["-I", "-c", py, ...files], { maxBuffer: 1 << 28 });
const truth = JSON.parse(String(r.stdout));
let same = 0, bad = 0;
for (const f of files) {
  let ours;
  try { ours = { ok: canon(loadYaml(readFileSync(f, "utf8"))) }; } catch (e) { ours = { err: e.message }; }
  const t = truth[f];
  if (t.ok !== undefined && ours.ok !== undefined) {
    const a = JSON.stringify(ours.ok);
    const b = JSON.stringify(t.ok);
    if (a === b) { same++; continue; }
    bad++;
    // find first differing path
    console.log("DIFF", f, firstDiff(JSON.parse(a), JSON.parse(b), ""));
  } else if (t.err !== undefined && ours.err !== undefined) { same++; }
  else { bad++; console.log("VERDICT", f, "ours:", ours.err || "ok", "| pyyaml:", t.err || "ok"); }
}
function firstDiff(a, b, p) {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[k], b[k], p + "/" + k); if (d) return d; }
  }
  return `${p}: ours=${JSON.stringify(a)?.slice(0, 160)} pyyaml=${JSON.stringify(b)?.slice(0, 160)}`;
}
console.log(JSON.stringify({ files: files.length, same, differ: bad }));
process.exit(bad ? 1 : 0);
