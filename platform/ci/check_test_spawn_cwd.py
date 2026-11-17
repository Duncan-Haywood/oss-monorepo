#!/usr/bin/env python3
"""Fail if a test runs a script by a relative path without saying where to run it.

A test that spawns `node cli.mjs` resolves `cli.mjs` against the process's
working directory, not the test file's folder. It passes when the suite runs
from the venture's folder and fails from anywhere else: the repository root,
`redteam.py` (which runs `node --test ventures/<slug>/**/*.test.mjs` from the
root), or a runner that changes directory differently. On 2026-11-14 the
shift-roster-builder suite was red from the root on exactly this (one test in
import-site-wages.test.mjs ran `cli.mjs` with no `cwd`, while the four other
files that do the same pass `cwd: import.meta.dirname`), and a red-team
campaign refused to start on it.

Flagged: a call to execFileSync, execFile, spawnSync, spawn or fork whose
program is `process.execPath` or `"node"` and whose first non-flag argument is
a relative script path (`"cli.mjs"`, `"./cli.mjs"`, `"bin/x.js"`), or
execSync/exec with a command string starting `node <relative path>`, when the
call names no `cwd`. Fix: add `cwd: import.meta.dirname` to the options, or
pass `new URL("./cli.mjs", import.meta.url).pathname` / a joined absolute path.

    python3 platform/ci/check_test_spawn_cwd.py [--root DIR] [paths...]   # exit 1 on any finding
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCAN = ("ventures", "platform", "research", "portfolio")
SKIP_DIRS = {"node_modules", ".git", "dist", "_site"}
TEST_FILE = re.compile(r"\.test\.(?:mjs|cjs|js)$")

SCRIPT = r"(?:\./)?[A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:mjs|cjs|js)"
# fn(process.execPath | "node", ["--flag", ..., "rel/script.mjs"
ARGV_CALL = re.compile(
    r"\b(?:execFileSync|execFile|spawnSync|spawn)\(\s*(?:process\.execPath|[\"']node[\"'])\s*,\s*\[\s*"
    r"(?:[\"'`]--?[A-Za-z][\w-]*(?:=[^\"'`]*)?[\"'`]\s*,\s*)*"
    r"[\"'`](" + SCRIPT + r")[\"'`]"
)
# fork("rel/script.mjs"
FORK_CALL = re.compile(r"\bfork\(\s*[\"'`](" + SCRIPT + r")[\"'`]")
# execSync("node rel/script.mjs ..." / exec(`node cli.mjs ...`
SHELL_CALL = re.compile(r"\b(?:execSync|exec)\(\s*[\"'`]node\s+(?:--?[A-Za-z][\w-]*\s+)*(" + SCRIPT + r")\b")


def call_text(src, start):
    """The text of the call opening at the first '(' at or after start, by paren depth (strings not parsed)."""
    i = src.index("(", start)
    depth = 0
    for j in range(i, min(len(src), i + 4000)):
        c = src[j]
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return src[start:j + 1]
    return src[start:i + 4000]


def findings_in(text):
    out = []
    for rx in (ARGV_CALL, FORK_CALL, SHELL_CALL):
        for m in rx.finditer(text):
            if re.search(r"\bcwd\b", call_text(text, m.start())):
                continue
            line = text.count("\n", 0, m.start()) + 1
            out.append((line, m.group(1)))
    return sorted(out)


def iter_tests(root, paths=None):
    if paths:
        for p in paths:
            p = Path(p)
            if p.is_file() and TEST_FILE.search(p.name):
                yield p
        return
    for top in SCAN:
        base = root / top
        if not base.is_dir():
            continue
        for p in base.rglob("*"):
            if p.is_file() and TEST_FILE.search(p.name) and not SKIP_DIRS.intersection(p.relative_to(root).parts):
                yield p


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("paths", nargs="*")
    a = ap.parse_args(argv)
    root = Path(a.root).resolve()
    bad = 0
    for p in sorted(iter_tests(root, a.paths)):
        try:
            text = p.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for line, script in findings_in(text):
            try:
                rel = p.resolve().relative_to(root)
            except ValueError:
                rel = p
            print(f"{rel}:{line}: runs {script!r} by a relative path with no cwd: it resolves against wherever the "
                  f"suite is started; add cwd: import.meta.dirname")
            bad += 1
    if bad:
        print(f"{bad} test spawn{'s' if bad != 1 else ''} depend on the working directory", file=sys.stderr)
        return 1
    print("test spawns: every relative script path has a cwd")
    return 0


if __name__ == "__main__":
    sys.exit(main())
