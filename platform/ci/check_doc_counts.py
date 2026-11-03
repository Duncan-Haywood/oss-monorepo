#!/usr/bin/env python3
"""Flag numbers in docs that no longer match the tree they describe.

Reports kept quoting counts that went stale within days ("16 ventures lack
llms.txt" when 5 did; "~91 headlines over budget" when the script said 33),
and the next run planned against the stale number. A doc can instead wrap
the number in a marker naming a count from platform/ci/doc_counts.json:

    <!-- count:ventures-missing-llms-txt -->5<!-- /count --> ventures ship no llms.txt

This re-computes every marked count and prints the ones that drifted.

    python3 platform/ci/check_doc_counts.py            # report drift, exit 1 if any
    python3 platform/ci/check_doc_counts.py --fix      # rewrite the numbers in place
    python3 platform/ci/check_doc_counts.py --list     # print every count's current value
    python3 platform/ci/check_doc_counts.py --tolerance 0.1   # allow 10% drift

Markers name a registry entry rather than holding a command, so editing a doc
can never make this run arbitrary code. Unknown names are errors.
Dated records (docs/history/, docs/posts/, run records) describe a moment and
are not scanned: a post that said "5" on its date was right.
"""
import argparse
import glob
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "platform" / "ci" / "doc_counts.json"
MARK = re.compile(r"<!--\s*count:([a-z0-9][a-z0-9-]*)\s*-->\s*([~≈]?)([\d,]+)\s*<!--\s*/count\s*-->")
SKIP_DIRS = ("docs/history/", "docs/posts/", "docs/agent-posts/", "prompts/runs/", "node_modules/", ".git/")
SCAN = ("*.md",)  # a git pathspec: matches at every depth, the root included


def load_registry(path=REGISTRY):
    return json.loads(Path(path).read_text())["counts"]


def compute(name, spec, root=ROOT, timeout=300):
    if "glob" in spec:
        return len(glob.glob(str(Path(root) / spec["glob"])))
    out = subprocess.run(spec["cmd"], cwd=root, capture_output=True, text=True, timeout=timeout)
    m = re.search(spec["regex"], out.stdout, re.M)
    if not m:
        raise ValueError(f"count {name}: {spec['regex']!r} not in output of {' '.join(spec['cmd'])}")
    return int(m.group(1))


def docs(root=ROOT):
    root = Path(root)
    try:  # git ls-files is ~25x faster than walking node_modules and build output
        out = subprocess.run(["git", "ls-files", "-z", "--", *SCAN], cwd=root, capture_output=True, text=True, check=True)
        rels = [r for r in out.stdout.split("\0") if r]
    except (OSError, subprocess.CalledProcessError):
        rels = [p.relative_to(root).as_posix() for pat in SCAN for p in root.rglob(pat)]
    for rel in rels:
        if not any(rel.startswith(s) or f"/{s}" in f"/{rel}" for s in SKIP_DIRS):
            yield root / rel


def scan(root=ROOT, paths=None):
    """Return [(path, line, name, quoted_int, start, end, had_commas)] for every marker."""
    found = []
    for p in (paths or docs(root)):
        try:
            text = Path(p).read_text()
        except (OSError, UnicodeDecodeError):
            continue
        if "count:" not in text:
            continue
        for m in MARK.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            found.append((Path(p), line, m.group(1), int(m.group(3).replace(",", "")), m.start(3), m.end(3),
                          "," in m.group(3) or None))
    return found


def drifted(quoted, actual, tolerance):
    if quoted == actual:
        return False
    return abs(quoted - actual) > tolerance * max(actual, 1)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("--registry", default=None)
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--tolerance", type=float, default=0.0, help="fraction of drift allowed")
    ap.add_argument("paths", nargs="*", help="docs to check (default: every .md outside dated records)")
    a = ap.parse_args(argv)
    root = Path(a.root)
    reg = load_registry(a.registry or root / "platform/ci/doc_counts.json")
    cache = {}

    def value(name):
        if name not in cache:
            cache[name] = compute(name, reg[name], root)
        return cache[name]

    if a.list:
        for name, spec in reg.items():
            print(f"{name:32} {value(name):>7}  {spec.get('what', '')}")
        return 0

    marks = scan(root, [Path(p) for p in a.paths] or None)
    problems, edits = [], {}
    for path, line, name, quoted, s, e, commas in marks:
        rel = path.relative_to(root) if path.is_absolute() else path
        if name not in reg:
            problems.append(f"{rel}:{line}: unknown count '{name}' (add it to platform/ci/doc_counts.json)")
            continue
        actual = value(name)
        if drifted(quoted, actual, a.tolerance):
            problems.append(f"{rel}:{line}: says {quoted} for {name}, the tree says {actual}")
            edits.setdefault(path, []).append((s, e, f"{actual:,}" if commas or actual >= 10000 else str(actual)))
    if a.fix:
        for path, spans in edits.items():
            text = path.read_text()
            for s, e, new in sorted(spans, reverse=True):
                text = text[:s] + new + text[e:]
            path.write_text(text)
        print(f"rewrote {sum(len(v) for v in edits.values())} number(s) in {len(edits)} file(s)")
        unknown = [p for p in problems if "unknown count" in p]
        for p in unknown:
            print(p)
        return 1 if unknown else 0
    for p in problems:
        print(p)
    print(f"{len(marks)} marked count(s), {len(problems)} drifted or unknown")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
