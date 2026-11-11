#!/usr/bin/env python3
"""Run each venture's test suites in parallel and print one line per venture.

This is the venture test step of CI, not a stand-in for it:
`ventures-tests.yml` calls exactly this, so a pass here is the same pass the
runner would report (docs/history/ci-local-first-2026-10-29.md).

    python3 platform/ci/run_venture_tests.py                 # every venture
    python3 platform/ci/run_venture_tests.py slug-a slug-b   # named ventures
    python3 platform/ci/run_venture_tests.py --changed       # vs merge-base with origin/main,
                                                             # uncommitted edits included
    python3 platform/ci/run_venture_tests.py --since BASE    # ventures BASE..HEAD touched (CI)

--changed and --since also run each venture whose code reaches into a changed
one as `../<slug>/` (with_dependents), since a change there can break it.

Each suite runs as `node --test` from the venture's own directory, which is
what the 418 per-venture `<slug>-ci.yml` workflows this replaced ran: Node's
default discovery (`**/*.test.mjs`, `test/**`, ..., never `node_modules`). A
venture that keeps a workflow of its own gets its `*.test.mjs` files only
(see own_workflow_slugs).

A venture with no workflow of its own also gets its stdlib Python tests
(`test_*.py`, `*_test.py`) run as `python3 -m unittest discover` from each
directory that holds them: before 2026-11-10 those suites ran nowhere
(stranded-branch-finder's 37, actions-continue-on-error-check's 8, then
workflow-audit's 16, actions-runtime-deprecation-check's 9 and
local-site-studio's 7, whose workflows named the path but ran no Python
test step; see test_commands). A venture whose workflow runs its Python
tests runs them there; when you name one that has no
`*.test.mjs`, this prints which workflow does, instead of "0 suites run".
An empty or all-zero `--since` (a new branch, a dispatch) means every venture.

Exit 0 when every suite passes (ventures with no tests are skipped), else 1.
"""
import argparse
import functools
import os
import re
import signal
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import inherited_keys

ROOT = Path(__file__).resolve().parents[2]
VENTURES = ROOT / "ventures"
WORKFLOWS = ROOT / ".github" / "workflows"
NULL_SHA = "0" * 40
# A suite that hangs should fail by name, not eat the whole job's 30 minutes.
# The slowest real suite, changepoint-detector, took over 10 minutes on a
# loaded 4-core container (2026-10-29), so the cap sits well above it.
SUITE_TIMEOUT = 1200
ON_ACTIONS = os.environ.get("GITHUB_ACTIONS") == "true"


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True,
                          text=True, check=True).stdout


SKIP_DIRS = {"node_modules", ".venv", "venv", "__pycache__", ".git"}


def _files(slug, pattern):
    venture = VENTURES / slug
    if not venture.is_dir():
        return []
    return [p for p in venture.rglob(pattern)
            if not SKIP_DIRS.intersection(p.relative_to(venture).parts)]


def node_tests(slug):
    return _files(slug, "*.test.mjs")


TEST_RUN = re.compile(r"^\s*-?\s*run:\s*(.*\b(?:pytest|unittest)\b.*)$")


def test_commands(slug, wf):
    """The pytest/unittest steps of workflow `wf` that run inside the venture.

    All of them for the venture's own `<slug>*.yml`; in a shared workflow only
    a step whose `working-directory` (just above it) is the venture. Naming
    the path is not enough: on 2026-11-10 four ventures (workflow-audit,
    actions-runtime-deprecation-check, local-site-studio, shed-designer) were
    named by a workflow, in a trigger filter or a node step, that never ran
    their Python tests.
    """
    lines = wf.read_text().splitlines()
    own = wf.name.startswith((f"{slug}-", f"{slug}."))
    cmds = []
    for i, line in enumerate(lines):
        m = TEST_RUN.match(line)
        if not m or re.match(r"(pip|uv|python3? -m pip)\b", m.group(1)):
            continue
        near = " ".join(lines[max(0, i - 3):i + 2])
        if own or re.search(rf"working-directory:\s*['\"]?ventures/{re.escape(slug)}\b", near):
            cmds.append(m.group(1).strip())
    return cmds


@functools.lru_cache(maxsize=None)
def python_run_elsewhere(slug):
    """[(workflow name, command)] for steps that run the venture's Python tests."""
    return [(wf.name, cmds[0]) for wf in sorted(WORKFLOWS.glob("*.y*ml"))
            if wf.name != "ventures-tests.yml" and (cmds := test_commands(slug, wf))]


def python_test_dirs(slug):
    """Directories holding Python test files, for ventures CI runs nowhere else."""
    if python_run_elsewhere(slug):
        return []
    files = _files(slug, "test_*.py") + _files(slug, "*_test.py")
    return sorted({p.parent for p in files})


def has_tests(slug):
    return bool(node_tests(slug) or python_test_dirs(slug))


def suite_weight(slug):
    """Bytes of test code: a cheap stand-in for how long the suite runs."""
    return sum(p.stat().st_size for p in node_tests(slug))


def slugs_in(paths):
    return sorted({p.split("/")[1] for p in paths if p.startswith("ventures/") and p.count("/") >= 2})


CODE_GLOBS = ("ventures/*.mjs", "ventures/*.js", "ventures/*.cjs", "ventures/*.py")


def with_dependents(slugs, root=None):
    """`slugs` plus every venture whose code names one of them as `../<slug>/`.

    A venture that imports or vendors a sibling's code (open-house-plans copies
    wall-framing-takeoff's engine and checks the copy byte for byte) goes red
    when the sibling changes, but only the sibling's own suite used to run, so
    the break reached main unseen (red-team run 2026-11-11). One level only:
    the dependents' own dependents are not followed.
    """
    root = root or ROOT
    out = set(slugs)
    for slug in slugs:
        proc = subprocess.run(["git", "grep", "-l", "-F", f"../{slug}/", "--", *CODE_GLOBS],
                              cwd=root, capture_output=True, text=True)
        out.update(p.split("/")[1] for p in proc.stdout.splitlines()
                   if p.count("/") >= 2 and p.split("/")[1] != slug)
    return sorted(out)


def since_slugs(base):
    return with_dependents(slugs_in(git("diff", "--name-only", base, "HEAD", "--", "ventures").splitlines()))


def changed_slugs(base_ref="origin/main"):
    """Committed, staged, unstaged and untracked changes since the merge base."""
    found = subprocess.run(["git", "merge-base", base_ref, "HEAD"], cwd=ROOT,
                           capture_output=True, text=True)
    if found.returncode != 0 or not found.stdout.strip():
        # A shallow cloud clone often shares no commit with origin/main; this
        # used to die on a CalledProcessError traceback (run record
        # 2026-11-11). Say what to do instead.
        raise SystemExit(
            f"run_venture_tests: no merge base between {base_ref} and HEAD "
            "(shallow clone, or the ref is missing/stale).\n"
            "  Refresh it: git fetch --depth=40 origin main\n"
            "  Still none: git fetch --deepen=500 origin main, until "
            f"`git merge-base {base_ref} HEAD` answers.\n"
            "  Or name the ventures: run_venture_tests.py <slug> [<slug> ...]")
    base = found.stdout.strip()
    paths = git("diff", "--name-only", base, "--", "ventures").splitlines()
    paths += git("ls-files", "--others", "--exclude-standard", "--", "ventures").splitlines()
    return with_dependents(slugs_in(paths))


def own_workflow_slugs():
    """Ventures some other workflow names by path, so it runs their other suites.

    Node's default discovery also finds `*.test.ts`, `test/**` and the like.
    For a venture whose only CI is this runner that is right: it is what its
    removed `<slug>-ci.yml` ran (sponsor-ready's `*.test.js` among them). A
    venture with a workflow of its own (print-atelier, with npm dependencies
    and TypeScript tests) runs those there, so here it gets the `*.test.mjs`
    files only, as `ventures-tests.yml` always gave it.
    """
    return frozenset(workflows_naming())


@functools.lru_cache(maxsize=None)
def workflows_naming():
    """{slug: [workflow file names that name ventures/<slug>/]}."""
    named = {}
    for wf in sorted(WORKFLOWS.glob("*.y*ml")):
        if wf.name != "ventures-tests.yml":
            for slug in set(re.findall(r"ventures/([\w.-]+)/", wf.read_text())):
                named.setdefault(slug, []).append(wf.name)
    return named


def command(slug):
    if slug not in own_workflow_slugs():
        return ["node", "--test"]
    venture = VENTURES / slug
    return ["node", "--test", *sorted(
        str(p.relative_to(venture)) for p in node_tests(slug))]


def commands(slug):
    """[(argv, cwd)] for every suite this runner owns for the venture."""
    cmds = [(command(slug), VENTURES / slug)] if node_tests(slug) else []
    # -t keeps the directory on sys.path, so `import check` next to
    # test_check.py works as it does when run by hand.
    cmds += [([sys.executable, "-m", "unittest", "discover", "-s", ".", "-t", ".",
               "-p", pattern], d)
             for d in python_test_dirs(slug) for pattern in ("test_*.py", "*_test.py")
             if any(d.glob(pattern))]
    return cmds


def run_one(argv, cwd, timeout):
    # Its own process group, so a timeout also stops the per-file children
    # `node --test` spawns rather than leaving them running.
    p = subprocess.Popen(argv, cwd=cwd, stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, text=True, start_new_session=True)
    try:
        out, _ = p.communicate(timeout=timeout)
        # unittest exits 5 when it finds no tests: a pytest-style file of bare
        # functions (shed-designer's). Nothing ran, so nothing failed.
        return p.returncode == 0 or (p.returncode == 5 and "unittest" in argv), out
    except subprocess.TimeoutExpired:
        os.killpg(p.pid, signal.SIGKILL)
        out, _ = p.communicate()
        return False, f"{out}\ntimed out after {SUITE_TIMEOUT}s"


def run(slug):
    start = time.monotonic()
    cmds = commands(slug)
    ok, outs = True, []
    for argv, cwd in cmds:
        left = max(1, SUITE_TIMEOUT - (time.monotonic() - start))
        one_ok, out = run_one(argv, cwd, left)
        ok = ok and one_ok
        if len(cmds) > 1:
            name = "node --test" if argv[0] == "node" else "python3 -m unittest"
            out = f"$ {name} (in {Path(cwd).relative_to(VENTURES / slug)})\n{out}"
        outs.append(out)
    return slug, ok, "\n".join(outs), time.monotonic() - start


def skip_note(slug):
    """Why a venture someone named has no suite here, and where it runs."""
    if not (VENTURES / slug).is_dir():
        return f"skip {slug}: no such venture"
    run_by = python_run_elsewhere(slug)
    if run_by and not node_tests(slug):
        return (f"skip {slug}: no *.test.mjs; its Python tests run in "
                + "; ".join(f".github/workflows/{w}: `{c}`" for w, c in run_by))
    where = workflows_naming().get(slug)
    if where:
        return (f"skip {slug}: no *.test.mjs; its tests run in "
                + ", ".join(f".github/workflows/{w}" for w in where)
                + " (python3 platform/ci/run_workflow_locally.py <that file>)")
    return f"skip {slug}: no tests found"


def failures(out, context=30):
    """Each `not ok` block of the TAP output, or the tail when there is none.

    The tail alone can miss the failure entirely: a 198-test suite prints its
    one failing test long before the last 3,000 characters.
    """
    lines = out.splitlines()
    picked = [i for i, line in enumerate(lines) if line.lstrip().startswith("not ok")]
    if not picked:
        return out[-3000:]
    keep = sorted({j for i in picked for j in range(i, min(i + context, len(lines)))})
    return "\n".join(lines[j] for j in keep) + "\n" + "\n".join(
        l for l in lines[-10:] if l.startswith("# "))


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("slugs", nargs="*")
    ap.add_argument("--changed", action="store_true")
    ap.add_argument("--since", metavar="BASE")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
    args = ap.parse_args(argv)

    if args.since is not None and args.since.strip("0 "):
        slugs = since_slugs(args.since)
    elif args.changed:
        slugs = changed_slugs()
    elif args.slugs:
        slugs = args.slugs
    else:
        slugs = sorted(d.name for d in VENTURES.iterdir() if d.is_dir())
    # Longest suites first: with a fixed worker pool, starting the biggest
    # suite last leaves one worker running it alone after the others finish.
    if args.slugs or args.changed or args.since:
        for slug in slugs:
            if not has_tests(slug):
                print(skip_note(slug), flush=True)
    lint_slugs = [s for s in slugs if (VENTURES / s).is_dir()]
    slugs = sorted((s for s in slugs if has_tests(s)), key=lambda s: (-suite_weight(s), s))

    failed = []
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        # Printed as each finishes, so one slow suite does not hide the rest.
        for future in as_completed([pool.submit(run, s) for s in slugs]):
            slug, ok, out, secs = future.result()
            print(f"{'ok  ' if ok else 'FAIL'} {slug} ({secs:.1f}s)", flush=True)
            if not ok:
                failed.append(slug)
                if ON_ACTIONS:
                    print(f"::group::{slug} output\n{out}\n::endgroup::")
                    print(f"::error title=venture tests failed::ventures/{slug}")
                else:
                    print(failures(out))
    print(f"{len(slugs)} suites run, {len(failed)} failed"
          + (f": {' '.join(sorted(failed))}" if failed else ""))
    # A choice looked up in a plain object map by the user's text: "constructor"
    # finds Object.prototype (inherited_keys.py). Only lookups newer than the
    # baseline fail, so a venture PR is held to it from the day it lands.
    lint = inherited_keys.new_hits(lint_slugs, VENTURES)
    if lint:
        print(inherited_keys.report(lint))
        print(f"{len(lint)} new unguarded object-map lookup(s): see platform/ci/inherited_keys.py")
        if ON_ACTIONS:
            for rel, line, lookup in lint:
                print(f"::error file={rel},line={line},title=inherited key::{lookup} needs Object.hasOwn")
    return 1 if failed or lint else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
