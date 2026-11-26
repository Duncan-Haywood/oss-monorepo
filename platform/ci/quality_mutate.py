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
   caught the bug, 1 when it survived (a timeout counts as caught, and says so;
   the mutant run times out at 4x the baseline's time plus 30 s, so a test
   that hangs on the mutant is not waited out for the full --timeout).

The command runs in the subject root (or `--cwd`). One that starts with
`cd <path> &&`, the shape audit files record as `test_cmd`, runs through bash
from the repository root instead, so a row copied from an audit works as is.
One led by `VAR=value` also runs through bash, so an environment prefix works.

A subject in another checkout (a private-monorepo flagship, `apps/<name>/...`)
takes `--repo-root <that clone>`; its file path is then read from that root.
Two auditors on 2026-11-26 copied a private app into a scratch tree by hand.
When the command runs without a shell, a quoted glob (`"'*.test.mjs'"`) is
unquoted and expanded as a shell would, so it no longer runs 0 tests.

PYTHONDONTWRITEBYTECODE=1 is set, and the copy starts without `__pycache__`,
so a stale `.pyc` cannot run the mutant or hide it (round 45).
"""
from __future__ import annotations

import argparse
import contextlib
import glob
import hashlib
import json
import os
import re
import shutil
import signal
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


ENV_ASSIGN = re.compile(r"[A-Za-z_][A-Za-z0-9_]*=")


def is_shell(cmd: list[str]) -> bool:
    """A command written for a shell: `cd x && ...` (an audit's own `test_cmd` shape), one quoted string,
    or one led by `VAR=value` (`PYTHONPATH=src python3 -m pytest`), which exec without a shell takes for
    the program name (two run records, 2026-11-16, each lost a retry to it)."""
    return (cmd[0] == "cd" or bool(ENV_ASSIGN.match(cmd[0]))
            or (len(cmd) == 1 and any(c in cmd[0] for c in " &|;")))


GLOB_CHARS = re.compile(r"[*?\[]")


def shell_words(cmd: list[str], cwd: Path) -> list[str]:
    """Do for a command run without a shell what the shell would have: drop one pair of
    surrounding quotes left on a word (`"'*.test.mjs'"`) and expand a glob that matches
    files under `cwd`, sorted. An unmatched glob is passed on as is, as bash does, so
    `node --test` can still match it itself. Rounds 62 and 114 of the quality audit both
    lost mutant runs to a quoted glob that reached the runner unexpanded and ran no tests."""
    out = []
    for word in cmd:
        if len(word) >= 2 and word[0] == word[-1] and word[0] in "'\"":
            word = word[1:-1]
        if GLOB_CHARS.search(word) and not word.startswith("-"):
            hits = sorted(glob.glob(word, root_dir=cwd, recursive=True))
            if hits:
                out.extend(hits)
                continue
        out.append(word)
    return out


def starts_with_cd(cmd: list[str]) -> bool:
    return " ".join(cmd).lstrip().startswith("cd ")


def repo_relative_args(cmd: list[str], cwd: Path) -> list[tuple[str, str]]:
    """[(arg, the same path written from `cwd`)] for test-command words that name a
    path under `cwd` from the repository root (`ventures/x/tests` run inside
    `ventures/x`). Such a path does not exist where the command runs, so the
    baseline fails with only "the suite is red" (three run records, 2026-11-13
    and 11-14, each lost a round of mutants to it)."""
    prefix = cwd.as_posix().rstrip("/") + "/"
    out = []
    for word in " ".join(cmd).split():
        bare = word.strip("'\"")
        for opt in ("", "--rootdir=", "--start-directory="):
            if opt and bare.startswith(opt):
                bare = bare[len(opt):]
        if bare.removeprefix("./").rstrip("/") + "/" == prefix:
            out.append((bare, "."))
        elif bare.startswith(prefix) or bare.startswith("./" + prefix):
            out.append((bare, bare.split(prefix, 1)[1] or "."))
    return out


def run(cmd: list[str], cwd: Path, timeout: float) -> tuple[str, float, str]:
    """Run `cmd`; return ('pass'|'fail'|'timeout', seconds, output tail).

    The command gets its own process group and a timeout kills the whole group:
    `subprocess.run` kills only the direct child, so when a `bash -c` wrapper
    (a `cd ... &&` command) timed out, the hung `node --test` under it was
    orphaned and kept running, holding its CPU and any port it had bound."""
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    start = time.monotonic()
    argv = ["bash", "-c", " ".join(cmd)] if is_shell(cmd) else shell_words(cmd, cwd)
    p = subprocess.Popen(argv, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         text=True, errors="replace", start_new_session=True)
    try:
        out, _ = p.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        with contextlib.suppress(ProcessLookupError, PermissionError):
            os.killpg(p.pid, signal.SIGKILL)
        try:
            out, _ = p.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            out = ""
        return "timeout", time.monotonic() - start, (out or "")[-1500:]
    return ("pass" if p.returncode == 0 else "fail"), time.monotonic() - start, (out or "")[-1500:]


def mutant_timeout(baseline_secs: float | None, cap: int) -> float:
    """How long the mutant run may take. A suite that passed in `baseline_secs`
    and runs much longer on the mutant has hung on it (a server test with no
    `t.after` close never exits once an assertion fails), and a hang counts as
    caught, so waiting out the full --timeout only costs time: on 2026-11-17 a
    link-keeper mutant sat out 900 s (run-record doc_friction on
    portfolio/quality/README.md). Allow 4x the baseline plus 30 s, never more
    than `cap`, and `cap` itself when no baseline ran."""
    if baseline_secs is None:
        return cap
    return min(cap, 4 * baseline_secs + 30)


# A runner that found no tests still exits 0 under node (`# tests 0`) and
# unittest (`Ran 0 tests`), so every mutant "survives" an empty suite. Round 62
# lost a set of rows to `node --test "'*.test.mjs'"`: a glob passed with its
# shell quotes intact matched nothing.
NO_TESTS = re.compile(r"^# tests 0\s*$|^Ran 0 tests\b|\bno tests ran\b|\bcollected 0 items\b", re.M)


def ran_no_tests(output: str) -> bool:
    return bool(NO_TESTS.search(output))


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else list(argv)
    if "--" not in argv:
        print("usage: quality_mutate.py FILE --old TEXT --new TEXT [options] -- TEST COMMAND...\n"
              "TEST COMMAND runs in the subject root (ventures/<slug>), so its paths are relative "
              "to it; or start it with `cd <path> &&` to run from the repository root.", file=sys.stderr)
        return 2
    split = argv.index("--")
    cmd = argv[split + 1:]
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("file", help="repo-relative (or absolute) path of the file to mutate")
    ap.add_argument("--old", required=True)
    ap.add_argument("--new", required=True)
    ap.add_argument("--occurrence", type=int, default=None, help="which match of --old, 1-based")
    ap.add_argument("--repo-root", default=None,
                    help="another checkout holding the subject, such as a private-monorepo clone "
                         "(default: this repository); a relative file path is read from it")
    ap.add_argument("--root", default=None, help="directory copied for real (default: first two path parts)")
    ap.add_argument("--cwd", default=None, help="repo-relative directory to run the tests in (default: --root)")
    ap.add_argument("--timeout", type=int, default=TIMEOUT,
                    help="cap in seconds per run; the mutant run gets 4x the baseline + 30 s, "
                         "up to this cap, since a hang there counts as caught")
    ap.add_argument("--no-baseline", action="store_true", help="skip the unmutated run (only if you just ran it)")
    ap.add_argument("--keep", action="store_true", help="keep the shadow tree and print its path")
    ap.add_argument("--json", action="store_true", help="print only the mutations row")
    args = ap.parse_args(argv[:split])
    if not cmd:
        ap.error("no test command after --")

    repo = Path(args.repo_root).resolve() if args.repo_root else REPO
    if not repo.is_dir():
        ap.error(f"--repo-root {args.repo_root} is not a directory")
    target = Path(args.file)
    target = (target if target.is_absolute() else (repo if args.repo_root else Path.cwd()) / target).resolve()
    try:
        rel = target.relative_to(repo)
    except ValueError:
        ap.error(f"{args.file} is not inside {repo}" + ("" if args.repo_root else
                 " (a subject in another checkout, such as private-monorepo, takes --repo-root <clone>)"))
    if not target.is_file():
        ap.error(f"{args.file} is not a file")
    root = Path(args.root) if args.root else default_root(rel)
    cwd = Path(args.cwd) if args.cwd else root
    if not root.parts or root.parts[0] in ("..", "/"):
        ap.error("--root must name a directory inside the repository, not its top")
    if root.parts != rel.parts[:len(root.parts)]:
        ap.error(f"{rel} is not under --root {root}")
    if not (repo / cwd).is_dir():
        ap.error(f"--cwd {cwd} is not a directory")

    before = digest(target)
    try:
        mutated, line = mutate_text(target.read_text(encoding="utf-8"), args.old, args.new, args.occurrence)
    except ValueError as e:
        ap.error(str(e))

    tmp = Path(tempfile.mkdtemp(prefix="quality_mutate-"))
    say = (lambda *a: None) if args.json else print
    try:
        build_shadow(repo, root, tmp / "repo")
        # A command that starts with `cd <subject> &&` (the shape audit files record
        # as test_cmd) is written from the repository root, so run it from there;
        # from the subject folder its `cd` failed and read as a red baseline
        # (run-record doc_friction, 2026-11-12).
        from_top = starts_with_cd(cmd) and not args.cwd
        shadow_cwd = tmp / "repo" if from_top else tmp / "repo" / cwd
        baseline_secs = None
        if not args.no_baseline:
            state, secs, tail = run(cmd, shadow_cwd, args.timeout)
            baseline_secs = secs
            say(f"baseline (unmutated copy): {state} in {secs:.1f} s")
            if state == "pass" and ran_no_tests(tail):
                print(tail, file=sys.stderr)
                print("baseline ran no tests, so no mutant could be caught. Check the test "
                      "command (does the runner find test files in the directory it runs in?).", file=sys.stderr)
                return 2
            if state != "pass":
                print(tail, file=sys.stderr)
                hints = [] if from_top else repo_relative_args(cmd, cwd)
                for arg, local in hints:
                    print(f"hint: the command runs in {cwd.as_posix()}/, so `{arg}` is written from the "
                          f"repository root; write `{local}` (or prefix the command with "
                          f"`cd {cwd.as_posix()} &&`).", file=sys.stderr)
                print("baseline failed: the suite is red without the mutant, so it cannot "
                      "grade one. Fix or narrow the test command first.", file=sys.stderr)
                return 2
        (tmp / "repo" / rel).write_text(mutated, encoding="utf-8")
        limit = mutant_timeout(baseline_secs, args.timeout)
        state, secs, tail = run(cmd, shadow_cwd, limit)
        caught = state != "pass"
        row = {"where": f"{rel.relative_to(root).as_posix()}:{line}",
               "change": f"{args.old} -> {args.new}", "caught": caught,
               "test_cmd": " ".join(cmd)}
        if state == "timeout":
            row["note"] = (f"tests timed out after {limit:.0f} s on the mutant (the unmutated "
                           f"suite took {baseline_secs:.1f} s): a hang, counted as caught"
                           if baseline_secs is not None else
                           f"tests timed out after {limit:.0f} s on the mutant")
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
