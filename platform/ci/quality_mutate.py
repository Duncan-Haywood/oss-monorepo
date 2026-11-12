#!/usr/bin/env python3
"""Seed one bug in a private copy of a subject and run its tests there.

    python3 platform/ci/quality_mutate.py ventures/foo/calc.mjs \\
        --old "cap * biz" --new "cap" -- node --test '*.test.mjs'

A quality audit seeds at least two bugs per subject (portfolio/quality/README.md,
"Seed one bug"). Done by hand that means editing the shared working tree, and
a round runs one auditor per subject in parallel: on 2026-11-12 four run
records said the auditors saw each other's live mutants in `git status`,
assumed another session was editing, and raced the lead's fixes, and the stop
hook asks to commit whatever is dirty, so a seeded bug can be committed.

This tool never touches the working tree. It builds a shadow tree in a temp
directory: the subject root (default: the first two path parts, such as
`ventures/foo`) is copied for real; every directory above it is a real
directory whose other entries are symlinks back into the repository, so
`../other-venture/` imports and repo-root lookups still resolve. Directories
too large to copy and never mutated (`node_modules`, `.venv`) are symlinked.
Then it:

1. runs the test command on the unmutated copy (the baseline). A suite that is
   already red cannot catch anything, so that reports `baseline failed` and
   exits 2 instead of a false "caught";
2. replaces `--old` (which must occur exactly once in the file, or name
   `--occurrence`) with `--new` in the copy, and runs the command again;
3. prints a `mutations` row for the audit file and exits 0 when the tests
   caught the bug, 1 when it survived (a timeout counts as caught, and says so).

PYTHONDONTWRITEBYTECODE=1 is set, and the copy starts without `__pycache__`,
so a stale `.pyc` cannot run the mutant or hide it (round 45).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LINKED = {"node_modules", ".venv", "venv"}
SKIPPED = {"__pycache__", ".pytest_cache", ".git"}
TIMEOUT = 900


def default_root(rel: Path) -> Path:
    """The subject a file belongs to: `ventures/<slug>`, `research/<slug>`, `platform/<dir>`."""
    parts = rel.parts
    if len(parts) < 3:
        return rel.parent
    return Path(*parts[:2])


def build_shadow(repo: Path, root: Path, dest: Path) -> Path:
    """Shadow `repo` in `dest` with `root` (repo-relative) copied and everything else linked."""
    dest.mkdir(parents=True, exist_ok=True)
    here_real, here_shadow = repo, dest
    for part in root.parts:
        for entry in here_real.iterdir():
            if entry.name != part:
                os.symlink(entry, here_shadow / entry.name)
        here_real, here_shadow = here_real / part, here_shadow / part
        if part != root.parts[-1]:
            here_shadow.mkdir()
    linked: list[tuple[Path, Path]] = []

    def ignore(directory, names):
        out = set()
        for name in names:
            if name in SKIPPED:
                out.add(name)
            elif name in LINKED and os.path.isdir(os.path.join(directory, name)):
                out.add(name)
                rel = Path(directory, name).relative_to(here_real)
                linked.append((Path(directory, name), here_shadow / rel))
        return out

    shutil.copytree(here_real, here_shadow, symlinks=True, ignore=ignore)
    for src, dst in linked:
        os.symlink(src, dst)
    return here_shadow


def mutate_text(text: str, old: str, new: str, occurrence: int | None) -> tuple[str, int]:
    """Replace one occurrence of `old`; return the new text and its 1-based line."""
    count = text.count(old)
    if count == 0:
        raise ValueError("--old does not occur in the file")
    if occurrence is None:
        if count > 1:
            raise ValueError(f"--old occurs {count} times; widen it or pass --occurrence N")
        occurrence = 1
    if not 1 <= occurrence <= count:
        raise ValueError(f"--occurrence {occurrence} but --old occurs {count} times")
    at = -1
    for _ in range(occurrence):
        at = text.index(old, at + 1)
    return text[:at] + new + text[at + len(old):], text.count("\n", 0, at) + 1


def run(cmd: list[str], cwd: Path, timeout: int) -> tuple[str, float, str]:
    """Run `cmd`; return ('pass'|'fail'|'timeout', seconds, output tail)."""
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    start = time.monotonic()
    try:
        p = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True,
                           timeout=timeout, errors="replace")
    except subprocess.TimeoutExpired as e:
        out = (e.stdout or "") if isinstance(e.stdout, str) else ""
        return "timeout", time.monotonic() - start, out[-1500:]
    out = (p.stdout or "") + (p.stderr or "")
    return ("pass" if p.returncode == 0 else "fail"), time.monotonic() - start, out[-1500:]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else list(argv)
    if "--" not in argv:
        print("usage: quality_mutate.py FILE --old TEXT --new TEXT [options] -- TEST COMMAND...", file=sys.stderr)
        return 2
    split = argv.index("--")
    cmd = argv[split + 1:]
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("file", help="repo-relative (or absolute) path of the file to mutate")
    ap.add_argument("--old", required=True)
    ap.add_argument("--new", required=True)
    ap.add_argument("--occurrence", type=int, default=None, help="which match of --old, 1-based")
    ap.add_argument("--root", default=None, help="directory copied for real (default: first two path parts)")
    ap.add_argument("--cwd", default=None, help="repo-relative directory to run the tests in (default: --root)")
    ap.add_argument("--timeout", type=int, default=TIMEOUT)
    ap.add_argument("--no-baseline", action="store_true", help="skip the unmutated run (only if you just ran it)")
    ap.add_argument("--keep", action="store_true", help="keep the shadow tree and print its path")
    ap.add_argument("--json", action="store_true", help="print only the mutations row")
    args = ap.parse_args(argv[:split])
    if not cmd:
        ap.error("no test command after --")

    target = Path(args.file)
    target = (target if target.is_absolute() else Path.cwd() / target).resolve()
    try:
        rel = target.relative_to(REPO)
    except ValueError:
        ap.error(f"{args.file} is not inside {REPO}")
    if not target.is_file():
        ap.error(f"{args.file} is not a file")
    root = Path(args.root) if args.root else default_root(rel)
    cwd = Path(args.cwd) if args.cwd else root
    if not root.parts or root.parts[0] in ("..", "/"):
        ap.error("--root must name a directory inside the repository, not its top")
    if root.parts != rel.parts[:len(root.parts)]:
        ap.error(f"{rel} is not under --root {root}")
    if not (REPO / cwd).is_dir():
        ap.error(f"--cwd {cwd} is not a directory")

    before = digest(target)
    try:
        mutated, line = mutate_text(target.read_text(encoding="utf-8"), args.old, args.new, args.occurrence)
    except ValueError as e:
        ap.error(str(e))

    tmp = Path(tempfile.mkdtemp(prefix="quality_mutate-"))
    say = (lambda *a: None) if args.json else print
    try:
        build_shadow(REPO, root, tmp / "repo")
        shadow_cwd = tmp / "repo" / cwd
        if not args.no_baseline:
            state, secs, tail = run(cmd, shadow_cwd, args.timeout)
            say(f"baseline (unmutated copy): {state} in {secs:.1f} s")
            if state != "pass":
                print(tail, file=sys.stderr)
                print("baseline failed: the suite is red without the mutant, so it cannot "
                      "grade one. Fix or narrow the test command first.", file=sys.stderr)
                return 2
        (tmp / "repo" / rel).write_text(mutated, encoding="utf-8")
        state, secs, tail = run(cmd, shadow_cwd, args.timeout)
        caught = state != "pass"
        row = {"where": f"{rel.relative_to(root).as_posix()}:{line}",
               "change": f"{args.old} -> {args.new}", "caught": caught,
               "test_cmd": " ".join(cmd)}
        if state == "timeout":
            row["note"] = f"tests timed out after {args.timeout} s on the mutant"
        if not args.json:
            print(f"mutant at {rel}:{line}: tests {state} in {secs:.1f} s -> "
                  f"{'CAUGHT' if caught else 'SURVIVED'}")
            if caught:
                print("  last output:\n    " + "\n    ".join(tail.strip().splitlines()[-8:]))
            print("mutations row:")
        print(json.dumps(row))
        if args.keep:
            say(f"shadow tree kept at {tmp / 'repo'}")
        return 0 if caught else 1
    finally:
        if not args.keep:
            shutil.rmtree(tmp, ignore_errors=True)
        if digest(target) != before:
            print(f"WARNING: {rel} changed in the working tree during the run "
                  "(not by this tool, which edits only its copy).", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
