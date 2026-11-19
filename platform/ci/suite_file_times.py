#!/usr/bin/env python3
"""Time each test file of one suite on its own, slowest first.

    python3 platform/ci/suite_file_times.py shed-designer          # a venture's test files
    python3 platform/ci/suite_file_times.py platform/ci            # any directory of tests
    python3 platform/ci/suite_file_times.py shed-designer --top 10 --jobs 2

venture_suite_times.json (`run_venture_tests.py --times N`) says which suite is
slow, not which file, and its times are taken four suites at a time on four
cores. Perf runs filled the gap by hand: a per-file `xargs` timing loop
(2026-11-16), a self-made per-module timer for the platform/ci tests
(2026-11-17), and a 10 s suite that took 3.8 s alone (2026-11-17), all in run
records' doc_friction. This runs each file alone (`--jobs 1`, the default, so
the times are idle-core times) and prints a Markdown table: seconds, tests
ran, and ok/FAIL.

Each `*.test.mjs` runs as `node --test <file>` from the target directory; each
`test_*.py` / `*_test.py` as `python3 -m unittest discover -s <its dir> -t
<its dir> -p <file>` from its own directory, the same form run_venture_tests.py
uses. For a venture the table ends with the earlier perf write-ups about it
(docs/history/ci-perf-*.md whose file name or title names it): a suite with five passes behind it is CPU-bound in
tight loops by now, and the untouched ones are often the cheaper win (two perf
run records, 2026-11-16 and 11-17).

Exit 0 when every file passed, 1 when any failed or timed out, 2 on a bad target.
"""
import argparse
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VENTURES = ROOT / "ventures"
HISTORY = ROOT / "docs" / "history"
SKIP_DIRS = {"node_modules", ".venv", "venv", "__pycache__", ".git"}

RAN_TOTALS = (
    re.compile(r"^Ran (\d+) tests? in ", re.M),                # unittest
    re.compile(r"^(?:# |ℹ )tests (\d+)$", re.M),          # node --test (TAP, spec)
)


def resolve(target, root=ROOT, cwd=None):
    """(directory, venture slug or None) for a slug, `ventures/<slug>/` or a path.

    A relative path means what it means in the shell first: `.` run from inside
    a venture is that venture. It used to resolve against the repository root
    only, so `.` silently timed the whole repository (perf friction 2026-11-18).
    Then the root, then `ventures/<target>`."""
    p = Path(target)
    here = Path(cwd) if cwd is not None else Path.cwd()
    tries = [p] if p.is_absolute() else [here / p, root / p]
    for cand in (*tries, root / "ventures" / target.strip("/")):
        if cand.is_dir():
            cand = cand.resolve()
            slug = cand.name if cand.parent == (root / "ventures").resolve() else None
            return cand, slug
    return None, None


def test_files(d):
    """Every node and Python test file under d, outside vendored/virtualenv dirs."""
    out = []
    for pattern in ("*.test.mjs", "test_*.py", "*_test.py"):
        out += [f for f in d.rglob(pattern)
                if not SKIP_DIRS.intersection(f.relative_to(d).parts)]
    return sorted(set(out))


def command(f, d, py=sys.executable):
    """(argv, cwd) that runs test file f on its own."""
    if f.name.endswith(".test.mjs"):
        return ["node", "--test", str(f.relative_to(d))], d
    return [py, "-m", "unittest", "discover", "-s", ".", "-t", ".", "-p", f.name], f.parent


def ran(out):
    return sum(int(m) for rx in RAN_TOTALS for m in rx.findall(out))


def time_one(f, d, timeout, run=subprocess.run, clock=time.monotonic):
    argv, cwd = command(f, d)
    start = clock()
    try:
        p = run(argv, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        out, status = (p.stdout or "") + (p.stderr or ""), "ok"
        # unittest exits 5 when a file has no unittest-style tests (pytest-style ones)
        if p.returncode not in (0, 5) or (p.returncode == 5 and argv[0] == "node"):
            status = "FAIL"
    except subprocess.TimeoutExpired:
        out, status = "", "TIMEOUT"
    return {"file": str(f.relative_to(d)), "seconds": clock() - start, "tests": ran(out), "status": status}


def perf_history(slug, history=HISTORY):
    """[(date, filename)] of the ci-perf write-ups about the venture, newest first.

    A write-up counts when its file name or its `# ` title names the slug, not
    when the body does: write-ups quote the slowest-suites table and the
    suites they skipped, so a body match counted every top suite as passed
    by every perf run (2026-11-18: all eight slowest showed a pass "latest
    2026-11-18", three of them only from one shift-roster-builder write-up),
    and the column the perf prompt steers by could not tell touched from
    untouched suites."""
    # the slug, or its product name in words ("Shed Designer" titles six shed-designer write-ups)
    names = "|".join(re.escape(n) for n in (slug, slug.replace("-", " ")))
    word = re.compile(rf"(?<![\w-])(?:{names})(?![\w-])", re.I)
    rows = []
    for p in sorted(history.glob("ci-perf-*.md")):
        try:
            text = p.read_text(errors="replace")
        except OSError:
            continue
        title = next((l for l in text.splitlines() if l.startswith("# ")), "")
        if word.search(title) or slug in p.name:
            m = re.match(r"ci-perf-(\d{4}-\d{2}-\d{2})", p.name)
            rows.append((m.group(1) if m else "?", p.name))
    return sorted(rows, reverse=True)


def table(rows, top=0):
    rows = sorted(rows, key=lambda r: (-r["seconds"], r["file"]))
    shown = rows[:top] if top else rows
    lines = ["| file | seconds | tests | status |", "|---|---:|---:|---|"]
    lines += [f"| {r['file']} | {r['seconds']:.1f} | {r['tests'] or ''} | {r['status']} |" for r in shown]
    if len(shown) < len(rows):
        rest = rows[len(shown):]
        lines.append(f"| ({len(rest)} more) | {sum(r['seconds'] for r in rest):.1f} | | |")
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("target", help="venture slug, ventures/<slug>/, or a directory")
    ap.add_argument("--jobs", type=int, default=1, help="files at once (default 1: idle-core times)")
    ap.add_argument("--top", type=int, default=0, help="show only the N slowest files")
    ap.add_argument("--timeout", type=float, default=900.0, help="seconds per file")
    a = ap.parse_args(argv)
    d, slug = resolve(a.target)
    if d is None:
        print(f"suite_file_times: no directory or venture named {a.target!r}", file=sys.stderr)
        return 2
    files = test_files(d)
    if not files:
        print(f"suite_file_times: no *.test.mjs, test_*.py or *_test.py under {d}", file=sys.stderr)
        return 2
    print(f"timing {len(files)} test files under {d.relative_to(ROOT) if d.is_relative_to(ROOT) else d}, "
          f"{a.jobs} at a time on {os.cpu_count()} cores", flush=True)
    start = time.monotonic()
    with ThreadPoolExecutor(max_workers=max(1, a.jobs)) as ex:
        rows = list(ex.map(lambda f: time_one(f, d, a.timeout), files))
    print(table(rows, a.top))
    print(f"\n{sum(r['seconds'] for r in rows):.1f} s summed over files, {time.monotonic() - start:.1f} s wall")
    if slug:
        hist = perf_history(slug)
        if hist:
            print(f"\n{len(hist)} earlier perf write-up(s) name {slug} (newest first): "
                  + ", ".join(f"docs/history/{n}" for _, n in hist[:5]) + (" ..." if len(hist) > 5 else ""))
        else:
            print(f"\nno docs/history/ci-perf-*.md names {slug}: no earlier perf pass on record")
    return 0 if all(r["status"] == "ok" for r in rows) else 1


if __name__ == "__main__":
    sys.exit(main())
