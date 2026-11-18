#!/usr/bin/env python3
"""Flag exported time parsers that roll an impossible clock time into a real one.

`Date.UTC(2026, 2, 4, 14, 75)` is 15:15, not an error, and `(h * 60 + m)` does
the same for a bare time of day. A parser that hands the hour and minute
straight to either reads `14:75` (a typo, or a corrupted export line) as a
different time and the tool works from a reading that never happened. The
red-team run of 2026-11-15 found it in service-load-check (a time column of
77:30 put one reading three days later and stretched the year it measures)
and in demand-charge-interval-analyzer's parseTimestamp (14:75 read as 15:15);
16 other exported parsers already refused it.

This check is dynamic, not a lint: it imports every non-test `.mjs` under
ventures/ and platform/ that exports a function named parse...Time...,
parse...Timestamp... or parse...DateTime..., calls it with each impossible
input below and with the time that input rolls over to, and flags the parser
when both give the same usable answer. Comparing against the rolled-over time
keeps a parser that reads `25:10` as 25 minutes 10 seconds (video chapters)
from being flagged: it only fails if it reads 14:75 exactly as 15:15.
A module that cannot be imported under plain node (browser globals) is skipped
and counted. Exit 1 lists each hit.

Usage: python3 platform/ci/check_clock_rollover.py [root ...]
"""
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXPORT = re.compile(r"export\s+(?:async\s+)?function\s+(parse\w*(?:Time|Timestamp|DateTime)\w*)\s*\(|"
                    r"export\s+const\s+(parse\w*(?:Time|Timestamp|DateTime)\w*)\s*=")
SKIP_PARTS = {"node_modules", ".next", "dist", "build", "vendor"}

# (impossible input, the input it would roll over to)
PROBES = [
    ("2026-03-04 14:75", "2026-03-04 15:15"),
    ("2026-03-04T14:75", "2026-03-04T15:15"),
    ("2026-03-04 14:60", "2026-03-04 15:00"),
    ("3/4/2026 14:75", "3/4/2026 15:15"),
    ("3/4/2026 2:75 PM", "3/4/2026 3:15 PM"),
    ("14:75", "15:15"),
    ("2:75 PM", "3:15 PM"),
    ("2026-03-04 25:10", "2026-03-05 01:10"),
]

NODE = r"""
const [files, probes] = JSON.parse(process.argv[1]);
const norm = (v) => {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object") {
    if (v.error || v.invalid) return null;
    const s = JSON.stringify(v);
    return /:-?\d/.test(s) && !/:null\b/.test(s) ? s : null;
  }
  return null; // strings and booleans are echoes or flags, not parsed times
};
const out = { hits: [], skipped: [] };
for (const [file, names] of files) {
  let mod;
  try { mod = await import(file); } catch (e) { out.skipped.push(file); continue; }
  for (const name of names) {
    const f = mod[name];
    if (typeof f !== "function") continue;
    for (const [bad, good] of probes) {
      let a, b;
      try { a = norm(f(bad)); b = norm(f(good)); } catch { continue; }
      if (a !== null && a === b) { out.hits.push([file, name, bad, good]); break; }
    }
  }
}
console.log(JSON.stringify(out));
"""


def candidates(roots):
    found = []
    for root in roots:
        for p in sorted(pathlib.Path(root).rglob("*.mjs")):
            if SKIP_PARTS & set(p.parts) or ".test." in p.name or not p.is_file():
                continue
            try:
                text = p.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            if "export" not in text or "parse" not in text:
                continue
            names = sorted({a or b for a, b in EXPORT.findall(text)})
            if names:
                found.append((str(p.resolve()), names))
    return found


def probe(files, timeout=120):
    if not files:
        return {"hits": [], "skipped": []}
    r = subprocess.run(["node", "--input-type=module", "-e", NODE, json.dumps([files, PROBES])],
                       capture_output=True, text=True, timeout=timeout, cwd=ROOT)
    lines = [ln for ln in r.stdout.splitlines() if ln.startswith('{"hits"')]
    if not lines:
        raise RuntimeError(f"node probe failed (exit {r.returncode}): {r.stderr[-800:]}")
    return json.loads(lines[-1])


def rel(path):
    p = pathlib.Path(path)
    return p.relative_to(ROOT) if p.is_relative_to(ROOT) else p


def main(argv):
    roots = argv or [ROOT / "ventures", ROOT / "platform"]
    files = candidates(roots)
    out = probe(files)
    for file, name, bad, good in out["hits"]:
        print(f"{rel(file)}: {name}({bad!r}) gives the same answer as {name}({good!r}); "
              "refuse minutes over 59 and hours over 23 (or 24:00 only) instead of letting Date.UTC roll them over")
    if out["hits"]:
        return 1
    print(f"check_clock_rollover: {len(files) - len(out['skipped'])} modules with exported time parsers refuse "
          f"impossible clock times ({len(out['skipped'])} not importable under node, skipped)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
