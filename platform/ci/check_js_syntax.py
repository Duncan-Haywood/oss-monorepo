#!/usr/bin/env python3
"""Fail if a tracked venture .js/.mjs file does not parse (`node --check`).

Inline <script> blocks are covered by check_inline_scripts.py; standalone
files were loaded by nothing that parses them all. JSX (React Native `App.js`
and similar) is skipped: a file whose parse error points at a `<Tag` line is
reported as a note, not a failure. ES-module syntax in a `.js` file is
checked as a module.

Every file is first parsed in one Node process (`js_parse_batch.mjs`); only
the files that fail there go through `check_text` (one `node --check` each),
so the printed result is the per-file check's (58 s to about 3 s,
docs/history/ci-perf-2026-11-12-js-syntax-one-process.md).

    python3 platform/ci/check_js_syntax.py
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MODULE_RE = re.compile(r"^\s*(import|export)\s", re.M)
JSX_RE = re.compile(r"^\s*<[A-Za-z][\w.]*[\s>/]", re.M)


BATCH = Path(__file__).resolve().with_name("js_parse_batch.mjs")
# Sources per Node process: big enough that start-up (~40 ms) is noise, small
# enough that the runner's cores share the work.
BATCH_SIZE = 1500


def parse_suffix(text: str, suffix: str) -> str:
    """The suffix `node --check` sees: ES-module syntax in a .js file is a module."""
    return ".mjs" if suffix == ".js" and MODULE_RE.search(text) else suffix


def check_text(text: str, suffix: str = ".js") -> str | None:
    """Return None if the source parses, 'jsx' for JSX, else the error text."""
    suffix = parse_suffix(text, suffix)
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / f"f{suffix}"
        p.write_text(text, encoding="utf-8")
        r = subprocess.run(["node", "--check", str(p)], capture_output=True, text=True)
    if r.returncode == 0:
        return None
    if JSX_RE.search(text) and re.search(r"^\s*<", r.stderr.split("\n", 4)[1] if r.stderr.count("\n") > 1 else ""):
        return "jsx"
    return r.stderr.strip().splitlines()[0][:160] if r.stderr.strip() else "error"


def tracked() -> list[str]:
    out = subprocess.check_output(
        ["git", "ls-files", "ventures/*.js", "ventures/*.mjs"], cwd=REPO_ROOT, text=True)
    return [x for x in out.splitlines() if x and "node_modules/" not in x]


def batch_parses(items: list[tuple[str, str]]) -> list[bool]:
    """For each (suffix, text), True if it surely parses (one Node process).

    False means "not sure": the caller runs check_text on it. If the batch
    process itself fails, everything is "not sure" and the slow path decides."""
    try:
        r = subprocess.run(
            ["node", "--experimental-vm-modules", "--no-warnings", str(BATCH)],
            input=json.dumps(items), capture_output=True, text=True, encoding="utf-8")
        out = json.loads(r.stdout) if r.returncode == 0 else None
    except (OSError, ValueError):
        out = None
    if not isinstance(out, list) or len(out) != len(items):
        return [False] * len(items)
    return [v is True for v in out]


def check_all(sources: list[tuple[str, str] | None]) -> list[str | None]:
    """check_text for each (text, suffix), same answers, mostly in-process.

    None entries (missing files) stay None."""
    present = [i for i, s in enumerate(sources) if s is not None]
    items = [(parse_suffix(t, suf), t) for t, suf in (sources[i] for i in present)]
    batches = [items[k:k + BATCH_SIZE] for k in range(0, len(items), BATCH_SIZE)]
    with ThreadPoolExecutor(8) as ex:
        sure = [v for part in ex.map(batch_parses, batches) for v in part]
        unsure = [present[j] for j, ok in enumerate(sure) if not ok]
        slow = dict(zip(unsure, ex.map(lambda i: check_text(*sources[i]), unsure)))
    return [slow.get(i) for i in range(len(sources))]


def _read(rel: str) -> tuple[str, str] | None:
    p = REPO_ROOT / rel
    if not p.is_file():
        return None
    return p.read_text(encoding="utf-8", errors="replace"), p.suffix


def main() -> int:
    files = tracked()
    results = list(zip(files, check_all([_read(rel) for rel in files])))
    jsx = [r for r, v in results if v == "jsx"]
    bad = [(r, v) for r, v in results if v and v != "jsx"]
    for r in jsx:
        print(f"note: {r} contains JSX, skipped")
    for r, v in bad:
        print(f"FAIL {r}: {v}")
    print(f"{len(files)} files, {len(bad)} failing, {len(jsx)} JSX skipped")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
