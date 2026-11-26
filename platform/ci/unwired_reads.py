#!/usr/bin/env python3
"""Which repository paths each unwired check reads, so a data-only change runs
only the checks that could see it.

`run_venture_tests.py --since` (the ventures-tests.yml step) runs every unwired
tree check and suite (unwired_checks.py) on every pull request, whatever it
touches: about 290 s of work, 65 to 110 s of wall clock on four cores. Of the
last 150 commits on `main` on 2026-11-26, 72 changed only `docs/reports/` (an
agent doc and a run record), and most of the 278 items never open a file
there. `strace` of every item showed it: a diff with no code in it needs a
median 43% of that work (docs/history/ci-perf-2026-11-26-unwired-reads-map.md).

So `unwired_reads.json` records, per item, the paths it touched under `strace`
(opened, probed or listed), cut to their first two levels: `docs/reports`,
`ventures/<slug>`, `portfolio/ledger`, a root file's name, `ventures/*` for an
item that listed `ventures/` itself, and `*` for one that listed the root or
ran `git` (which sees every tracked path). `needed()` then keeps an item when
any changed path falls inside what it read.

It fails open, toward running more:

- any changed path that is code (`platform/`, `.github/`, a root file,
  `portfolio/**` scripts) runs everything, since the items themselves, their
  helpers and their wiring live there, and a trace says nothing about code
  that changed after it was taken (this file and its map are under
  `platform/ci/`, so a pull request cannot widen its own skip list);
- an item missing from the map (added since the trace) runs;
- an item whose source file's sha256 differs from the traced one runs;
- an empty change list runs everything.

What it cannot see: an unchanged helper module whose behaviour depends on
data in a way the trace's one run did not exercise. The trace records every
path an item touched on the real tree, including failed probes, so this is
narrow; `main` pushes that change code still run everything.

    python3 platform/ci/unwired_reads.py trace     # regenerate (needs strace; ~10 min)
    python3 platform/ci/unwired_reads.py show docs/reports/x.md prompts/runs/y.yaml
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
READS_FILE = HERE / "unwired_reads.json"

# Suffixes that make a file under portfolio/ code rather than data: the
# portfolio suites import their siblings, and a trace taken before such a
# change says nothing about the code after it.
CODE_SUFFIXES = (".py", ".mjs", ".js", ".cjs", ".ts", ".sh", ".toml", ".cfg", ".ini")


def is_code(path):
    """True when a changed repo-relative path could change what an item does,
    not just what it reads."""
    if "/" not in path:
        return True  # root files: pyproject.toml, conftest.py, pytest.ini, ...
    if path.startswith(("platform/", ".github/")):
        return True
    return path.startswith("portfolio/") and (
        path.endswith(CODE_SUFFIXES) or "requirements" in path.rsplit("/", 1)[-1])


def area(path, listing=False, root=ROOT):
    """The map key for one absolute path an item touched, or None outside the repo."""
    rel = os.path.relpath(path, root)
    if rel.startswith(".."):
        return None
    if rel == ".":
        return "*" if listing else None
    parts = rel.split(os.sep)
    if parts[0] == ".git":
        return "*"
    if listing and len(parts) == 1:
        return parts[0] + "/*"
    return "/".join(parts[:2])


def touches(reads, path):
    """Whether a changed repo-relative path falls inside an item's `reads`."""
    if "*" in reads:
        return True
    parts = path.split("/")
    return "/".join(parts[:2]) in reads or (len(parts) > 1 and parts[0] + "/*" in reads)


def sha(path):
    try:
        return hashlib.sha256(Path(path).read_bytes()).hexdigest()
    except OSError:
        return None


def load(path=READS_FILE):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def selector(changed, data=None, root=ROOT):
    """A `needed(name) -> bool` for this change, or None when everything must run."""
    changed = [p for p in (changed or []) if p]
    if not changed or any(is_code(p) for p in changed):
        return None
    data = load() if data is None else data
    if not data or not isinstance(data.get("items"), dict):
        return None
    items = data["items"]

    def needed(name):
        entry = items.get(name)
        if not entry or sha(Path(root) / entry.get("path", "")) != entry.get("sha256"):
            return True
        reads = set(entry.get("reads") or ["*"])
        return any(touches(reads, p) for p in changed)
    return needed


# ---- regenerating the map -------------------------------------------------

_CALL = re.compile(r'^\d+\s+(\w+)\((?:(?:AT_FDCWD|\d+), )?"([^"]*)"(.*)$')


def reads_from_trace(lines, bases, root=ROOT):
    """The map keys for one item's strace output (`-f -e trace=%file,execve`).
    Relative paths are resolved against each of `bases` (the item's working
    directory, the repo root, platform/ci): a child that changed directory
    makes one of them wrong, and keeping all of them only ever adds keys."""
    out = set()
    for line in lines:
        m = _CALL.match(line)
        if not m:
            continue
        call, p, rest = m.groups()
        if call == "execve" and p.rsplit("/", 1)[-1] == "git":
            out.add("*")
            continue
        listing = "O_DIRECTORY" in rest
        cands = [p] if p.startswith("/") else [os.path.normpath(os.path.join(b, p)) for b in bases]
        for c in cands:
            key = area(c, listing, root)
            if key:
                out.add(key)
    return out


def trace(out_path=READS_FILE, jobs=4):
    """Run every unwired item under strace and write the map. Deferred
    COVERED_BY_TREE_TEST checks run too, so each has its own entry."""
    import main_health
    import unwired_checks
    tl = threading.local()
    real = subprocess.run
    lock = threading.Lock()
    seen = {}  # name -> (source path, [trace files])
    tmp = Path(tempfile.mkdtemp(prefix="unwired-reads-"))
    count = [0]

    def traced(argv, *a, **k):
        tag = getattr(tl, "tag", None)
        if tag and isinstance(argv, list) and argv and argv[0] != "strace":
            with lock:
                count[0] += 1
                f = tmp / f"{count[0]}.trace"
                seen.setdefault(tag[0], (tag[1], []))[1].append((f, k.get("cwd")))
            argv = ["strace", "-f", "-qq", "-e", "trace=%file,execve", "-o", str(f), *argv]
        return real(argv, *a, **k)

    def wrap(fn, namer):
        def g(path, *a):
            tl.tag = (namer(path), Path(path).resolve())
            try:
                return fn(path, *a)
            finally:
                tl.tag = None
        return g

    subprocess.run = traced
    unwired_checks.run_node_suite = wrap(unwired_checks.run_node_suite, unwired_checks.node_name)
    unwired_checks.run_suite = wrap(unwired_checks.run_suite, unwired_checks.suite_name)
    main_health.run = wrap(main_health.run, main_health.label)
    unwired_checks.COVERED_BY_TREE_TEST = {}
    try:
        results = unwired_checks.run_everything(jobs=jobs)
    finally:
        subprocess.run = real
    items = {}
    for name, (src, files) in sorted(seen.items()):
        reads = set()
        for f, cwd in files:
            bases = {str(ROOT), str(HERE), str(Path(cwd).resolve()) if cwd else str(ROOT)}
            try:
                with open(f, errors="replace") as fh:
                    reads |= reads_from_trace(fh, bases)
            except OSError:
                reads.add("*")
            f.unlink(missing_ok=True)
        if "*" in reads:
            reads = {"*"}
        else:  # a listed parent already covers its children
            reads = {r for r in reads if not ("/" in r and r.split("/")[0] + "/*" in reads and not r.endswith("/*"))}
        items[name] = {"path": src.relative_to(ROOT).as_posix(), "sha256": sha(src),
                       "reads": sorted(reads)}
    tmp.rmdir()
    head = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True,
                          text=True, cwd=ROOT).stdout.strip()
    data = {"generated_by": "python3 platform/ci/unwired_reads.py trace",
            "taken": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
            "commit": head, "python": sys.version.split()[0],
            "red": sorted(n for n, rc, _ in results if rc), "items": items}
    Path(out_path).write_text(json.dumps(data, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    return data


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("trace", help="run every unwired item under strace and rewrite the map")
    t.add_argument("--jobs", type=int, default=4)
    s = sub.add_parser("show", help="which items a change of these paths would run")
    s.add_argument("paths", nargs="+")
    args = ap.parse_args(argv)
    if args.cmd == "trace":
        data = trace(jobs=args.jobs)
        always = sum(v["reads"] == ["*"] for v in data["items"].values())
        print(f"{len(data['items'])} items traced at {data['commit']}, {always} read everything; "
              f"{len(data['red'])} red during the trace: {' '.join(data['red']) or 'none'}")
        return 0
    needed = selector(args.paths)
    data = load() or {"items": {}}
    if needed is None:
        print("everything runs (a code path changed, or no map)")
        return 0
    run = [n for n in data["items"] if needed(n)]
    print(f"{len(run)} of {len(data['items'])} mapped items run:")
    for n in run:
        print(f"  {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
