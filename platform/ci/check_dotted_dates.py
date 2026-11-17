#!/usr/bin/env python3
"""Every venture `detectDmy(values)` must read dotted dates day-first.

`03.06.2026` is the European day.month.year form; no locale writes
month.day.year with dots. Until 2026-11-15, 29 copies of one `detectDmy`
(the restaurant delivery analyzer, the Turo, Airbnb, KDP, Upwork and other
report analyzers) called a file day-first only when some first part was above
12, so a short export whose days were all 12 or under ("03.06.2026",
"05.06.2026") was read as 6 March and 6 May. The red-team run of 2026-11-15
found it in one and fixed all 29.

This check is behavioural, not textual: it imports every `ventures/**/*.mjs`
that exports `function detectDmy(values)` and asks it three questions,

    detectDmy(["03.06.2026", "05.06.2026"])  -> true   (dots mean day-first)
    detectDmy(["03/06/2026"])                -> false  (slashes keep the US default)
    detectDmy(["13/05/2026"])                -> true   (a first part above 12)

so a new copy of the old function fails here before it reaches main. Needs
node. Exit 1 lists each module that answers wrongly.

    python3 platform/ci/check_dotted_dates.py [root ...]
"""
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXPORT = re.compile(r"^export function detectDmy\(values\)", re.M)
CASES = [(["03.06.2026", "05.06.2026"], True), (["03/06/2026"], False), (["13/05/2026"], True)]

PROBE = r"""
import { pathToFileURL } from "node:url";
const [files, cases] = JSON.parse(process.argv[1]);
const out = [];
for (const f of files) {
  try {
    const m = await import(pathToFileURL(f).href);
    out.push([f, cases.map(([v]) => m.detectDmy(v))]);
  } catch (e) { out.push([f, String(e && e.message || e).slice(0, 200)]); }
}
process.stdout.write(JSON.stringify(out));
"""


def candidates(roots):
    for root in roots:
        for p in sorted(pathlib.Path(root).rglob("*.mjs")):
            if "node_modules" in p.parts or p.name.endswith(".test.mjs"):
                continue
            try:
                text = p.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            if EXPORT.search(text):
                yield p


def answers(files, cases=CASES):
    """{path: [answer per case] or an error string}, from one node process."""
    if not files:
        return {}
    arg = json.dumps([[str(f) for f in files], cases])
    r = subprocess.run(["node", "--input-type=module", "-e", PROBE, arg],
                       capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f"node probe failed: {r.stderr.strip()[:500]}")
    return {pathlib.Path(f): a for f, a in json.loads(r.stdout)}


def problems(results, cases=CASES):
    bad = []
    for f, got in sorted(results.items()):
        if isinstance(got, str):
            bad.append((f, f"could not import: {got}"))
            continue
        for (values, want), g in zip(cases, got):
            if g is not want:
                bad.append((f, f"detectDmy({values}) returned {g}, expected {want}"))
    return bad


def main(argv):
    roots = [pathlib.Path(a) for a in argv] or [ROOT / "ventures"]
    files = list(candidates(roots))
    bad = problems(answers(files))
    for f, why in bad:
        try:
            f = f.relative_to(ROOT)
        except ValueError:
            pass
        print(f"{f}: {why}")
    print(f"check_dotted_dates: {len(files)} detectDmy modules, {len({f for f, _ in bad})} wrong")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
