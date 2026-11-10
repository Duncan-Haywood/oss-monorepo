#!/usr/bin/env python3
"""Fail if a tracked venture .js/.mjs file does not parse (`node --check`).

Inline <script> blocks are covered by check_inline_scripts.py; standalone
files were loaded by nothing that parses them all. JSX (React Native `App.js`
and similar) is skipped: a file whose parse error points at a `<Tag` line is
reported as a note, not a failure. ES-module syntax in a `.js` file is
checked as a module.

    python3 platform/ci/check_js_syntax.py
"""
from __future__ import annotations

import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MODULE_RE = re.compile(r"^\s*(import|export)\s", re.M)
JSX_RE = re.compile(r"^\s*<[A-Za-z][\w.]*[\s>/]", re.M)


def check_text(text: str, suffix: str = ".js") -> str | None:
    """Return None if the source parses, 'jsx' for JSX, else the error text."""
    if suffix == ".js" and MODULE_RE.search(text):
        suffix = ".mjs"
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


def _one(rel: str):
    p = REPO_ROOT / rel
    if not p.is_file():
        return rel, None
    return rel, check_text(p.read_text(encoding="utf-8", errors="replace"), p.suffix)


def main() -> int:
    files = tracked()
    with ThreadPoolExecutor(8) as ex:
        results = list(ex.map(_one, files))
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
