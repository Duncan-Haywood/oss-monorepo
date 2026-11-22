// Differential test: does checkPythonRegex agree with CPython's re.compile?
// Usage: node differential/regex-fuzz.mjs [count] [seed] [python]
// Generates patterns from a token alphabet weighted toward the constructs
// where Python and JavaScript disagree, asks CPython about each one, and
// prints every disagreement. Needs a python3 on PATH (no packages).
import { spawnSync } from "node:child_process";
import { checkPythonRegex } from "../pyregex.mjs";

const count = Number(process.argv[2] || 20000);
let seed = Number(process.argv[3] || 1);
const python = process.argv[4] || "python3";
const rand = () => { // mulberry32
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (a) => a[Math.floor(rand() * a.length)];

const TOKENS = [
  "a", "b", "x", ".", "/", "-", "_", " ", "#", "\n", "0", "1", "9", ",", "}", "]", "=", ":", "!", "<", ">",
  "*", "+", "?", "*?", "+?", "*+", "{2}", "{1,3}", "{,2}", "{3,1}", "{}", "{", "{2,", "{,}",
  "^", "$", "|", "(", ")", "(?:", "(?P<n>", "(?P<m>", "(?P=n)", "(?<n>", "(?=", "(?!", "(?<=", "(?<!",
  "(?#c)", "(?i)", "(?x)", "(?s)", "(?a)", "(?u)", "(?L)", "(?t)", "(?i:", "(?-i:", "(?x-x:", "(?i-i:", "(?ai:", "(?>", "(?)", "(?q)",
  "(?(1)", "(?(n)", "(?(0)", "(?(x)",
  "[", "[^", "[a-z]", "[z-a]", "[\\d-z]", "[a-\\w]", "[]a]", "[-a]", "[a-]", "[\\b]", "[\\q]",
  "\\d", "\\w", "\\s", "\\b", "\\B", "\\A", "\\Z", "\\z", "\\q", "\\.", "\\-", "\\/", "\\\\", "\\1", "\\2", "\\0", "\\07", "\\400", "\\177", "\\8", "\\12",
  "\\x4", "\\x41", "\\u004", "\\u0041", "\\U0010ffff", "\\U00110000", "\\N{EM DASH}", "\\n", "\\t", "\\e", "\\G", "\\",
];

const pats = [];
for (let i = 0; i < count; i++) {
  const n = 1 + Math.floor(rand() * 7);
  let p = "";
  for (let k = 0; k < n; k++) p += pick(TOKENS);
  pats.push(p);
}
const py = `
import json,sys,re,warnings
warnings.simplefilter('ignore')
out=[]
for p in json.load(sys.stdin):
    try:
        re.compile(p); out.append(None)
    except re.error as e: out.append(e.msg)
    except Exception as e: out.append(type(e).__name__+': '+str(e))
print(json.dumps(out))
`;
const r = spawnSync(python, ["-I", "-c", py], { input: JSON.stringify(pats), maxBuffer: 1 << 28 });
if (r.status !== 0) { console.error(String(r.stderr)); process.exit(2); }
const truth = JSON.parse(String(r.stdout));
let agree = 0, okBoth = 0, msgSame = 0, bad = [];
pats.forEach((p, i) => {
  const ours = checkPythonRegex(p);
  const theirs = truth[i];
  if (ours.ok === (theirs === null)) {
    agree++;
    if (ours.ok) okBoth++;
    else if (theirs === ours.message || theirs.endsWith(ours.message)) msgSame++;
  } else bad.push({ p, ours: ours.ok ? "ok" : ours.message, python: theirs ?? "ok" });
});
const pyVer = spawnSync(python, ["-c", "import sys;print(sys.version.split()[0])"]).stdout.toString().trim();
console.log(JSON.stringify({ python: pyVer, patterns: count, seed: Number(process.argv[3] || 1), verdictAgree: agree, bothAccept: okBoth, sameMessageWhenBothReject: msgSame, disagreements: bad.length }));
for (const b of bad.slice(0, 40)) console.log(JSON.stringify(b));
process.exit(bad.length ? 1 : 0);
