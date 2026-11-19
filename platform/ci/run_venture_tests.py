#!/usr/bin/env python3
"""Run each venture's test suites in parallel and print one line per venture.

This is the venture test step of CI, not a stand-in for it:
`ventures-tests.yml` calls exactly this, so a pass here is the same pass the
runner would report (docs/history/ci-local-first-2026-10-29.md).

    python3 platform/ci/run_venture_tests.py                 # every venture
    python3 platform/ci/run_venture_tests.py slug-a slug-b   # named ventures
    python3 platform/ci/run_venture_tests.py --changed       # vs merge-base with origin/main,
                                                             # uncommitted edits included
    python3 platform/ci/run_venture_tests.py --since BASE    # ventures changed since BASE (CI; locally incl. uncommitted)
    python3 platform/ci/run_venture_tests.py --slowest 30    # also end with the 30 slowest suites
    python3 platform/ci/run_venture_tests.py --write-times   # every venture, saving each suite's time
    python3 platform/ci/run_venture_tests.py --times 30      # the 30 slowest from that file, no run
    python3 platform/ci/run_venture_tests.py --no-page-checks slug  # without the site page checks
    python3 platform/ci/suite_file_times.py <slug>           # then its files, each timed alone

Suite times live in platform/ci/venture_suite_times.json (TIMES_FILE), so a
perf run can pick its target without a full run: perf runs timed suites by
hand, ranked by test bytes, a poor proxy (doc friction 2026-11-14 21:53 and
22:13, prompts/perf/prompt-0.md). `--write-times` with no slugs refreshes the
whole file; with slugs it updates just those rows.

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
tests runs them there. On a local run that names ventures (slugs or
`--changed`), those Python steps run here too, read from that
workflow with its working directory (elsewhere_commands): before 2026-11-12
a named Python-only venture (photo-editing) printed "skip" and a mixed one
(einvoice-preflight) printed "ok" for its Node tests alone, so the local
pass was not the CI pass (run-record doc friction, 2026-11-12).
`--no-elsewhere` turns that off; CI never does it, since those workflows run
there on their own. Those steps are read with PyYAML: when `python3` lacks it
the script reruns itself under a python3 here that has it, and when none does
the venture's line says PART, not ok (2026-11-14: open-tennis-robots printed
"ok" in 0.4 s with its Python and CAD suites never run).
An empty or all-zero `--since` (a new branch, a dispatch) means every venture.
`--since` also runs every argument-free platform/ci/check_*.py that no
workflow names (unwired_checks.py; `--no-unwired` skips them): 30 of 60 ran in
no PR before 2026-11-12, and one let a stray `</head>` reach main (#15195);
since 2026-11-13 also the unwired platform/ci unit tests and `doc_index.py check`
(71 of 121 test files ran in no workflow; test_doc_index.py had been red for days).

Exit 0 when every suite passes (ventures with no tests are skipped), else 1.
"""
import argparse
import functools
import importlib.util
import os
import re
import signal
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import inherited_keys
import suite_file_times

ROOT = Path(__file__).resolve().parents[2]
VENTURES = ROOT / "ventures"
WORKFLOWS = ROOT / ".github" / "workflows"
NULL_SHA = "0" * 40
# A suite that hangs should fail by name, not eat the whole job's 30 minutes.
# The slowest real suites take about 10 minutes on a loaded 4-core container
# (changepoint-detector, 2026-10-29; league-schedule-generator 627 s in the
# 2026-11-15 full run, venture_suite_times.json), so the cap sits well above them.
SUITE_TIMEOUT = 1200
TIMES_FILE = ROOT / "platform" / "ci" / "venture_suite_times.json"
ON_ACTIONS = os.environ.get("GITHUB_ACTIONS") == "true"
# Site-builder checks that read every venture's hand-written HTML. They run in
# portfolio-pages.yml, not in a venture's own suite, so a session checking its
# venture locally never saw them: editing a visible FAQ answer without its
# FAQPage JSON-LD twin passed `run_venture_tests.py <slug>` and went red in CI
# (four run records 2026-11-17/18 name faq-visible.test.mjs as a CI-only
# failure). Together they take about 3 s, so a named local run includes them.
PAGES = ROOT / "platform" / "pages"
PAGE_CHECKS = ("faq-visible.test.mjs", "secondary-schema.test.mjs", "css-lint.test.mjs")


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


def test_commands(slug, wf, steps=None):
    """The pytest/unittest steps of workflow `wf` that run inside the venture.

    All of them for the venture's own `<slug>*.yml`; in a shared workflow only
    a step whose `working-directory` (just above it) is the venture. Naming
    the path is not enough: on 2026-11-10 four ventures (workflow-audit,
    actions-runtime-deprecation-check, local-site-studio, shed-designer) were
    named by a workflow, in a trigger filter or a node step, that never ran
    their Python tests.
    """
    if steps is None:
        steps = _test_steps(wf.read_text())
    if wf.name.startswith((f"{slug}-", f"{slug}.")):
        return [cmd for cmd, _ in steps]
    where = re.compile(rf"working-directory:\s*['\"]?ventures/{re.escape(slug)}\b")
    needle = f"ventures/{slug}"
    return [cmd for cmd, near in steps if needle in near and where.search(near)]


def _test_steps(text):
    """[(command, the lines around it)] for each pytest/unittest step in a workflow."""
    lines = text.splitlines()
    out = []
    for i, line in enumerate(lines):
        m = TEST_RUN.match(line)
        if not m or re.match(r"(pip|uv|python3? -m pip)\b", m.group(1)):
            continue
        out.append((m.group(1).strip(), " ".join(lines[max(0, i - 3):i + 2])))
    return out


@functools.lru_cache(maxsize=None)
def _workflow_steps(workflows):
    """[(workflow file, its test steps)], read once per run, not once per venture.

    Asking every venture (a full run, or a push that creates a branch) used to
    re-read and re-scan all ~130 workflows per venture: 1,348 x 129 parses,
    about 20 s before any suite started (docs/history/ci-perf-2026-11-12-venture-runner-workflow-scan.md).
    """
    return [(wf, steps) for wf in sorted(workflows.glob("*.y*ml"))
            if wf.name != "ventures-tests.yml" and (steps := _test_steps(wf.read_text()))]


@functools.lru_cache(maxsize=None)
def python_run_elsewhere(slug):
    """[(workflow name, command)] for steps that run the venture's Python tests."""
    return [(wf.name, cmds[0]) for wf, steps in _workflow_steps(WORKFLOWS)
            if (cmds := test_commands(slug, wf, steps))]


def elsewhere_commands(slug):
    """[(argv, cwd, env, workflow name)] for the Python test steps a
    venture's own workflows run, so a local run can run them too.

    Steps come from run_workflow_locally.collect, so a step gets the working
    directory and `env:` Actions would give it (step over job over workflow:
    einvoice-preflight's job-level `PYTHONPATH: src`); a step with a `${{ }}`
    expression is left out, as that tool leaves it.
    """
    import run_workflow_locally as rwl  # PyYAML: only local runs get here
    out = []
    for wf, steps in _workflow_steps(WORKFLOWS):
        wanted = {c.strip("'\"") for c in test_commands(slug, wf, steps)}
        if not wanted:
            continue
        found, _ = rwl.collect(rwl.load_workflow(str(wf)))
        for step in found:
            if step.status != "skipped" and step.run.strip() in wanted:
                cwd = ROOT / step.workdir
                if cwd.is_dir():
                    out.append((["bash", "-ec", step.run], cwd,
                                {**editable_path(wf, cwd), **step.env}, wf.name))
    return out


def editable_path(wf, cwd):
    """PYTHONPATH standing in for the workflow's `pip install -e .` of a src
    layout (vendor-change-watch, ig-media-pipeline), so a local run imports the
    package from the tree without installing it."""
    if (cwd / "src").is_dir() and re.search(r"pip install -e \.(\s|$)", wf.read_text(), re.M):
        return {"PYTHONPATH": os.pathsep.join(filter(None, ["src", os.environ.get("PYTHONPATH")]))}
    return {}


def interpreter_with(*modules):
    """A python3 here that already imports every one of `modules`, or None.
    Installs nothing.

    Some session images put a bare python3 first on PATH while pip installs
    go to another (platform/ci/pyenv.py, "Why"), so a workflow's
    `python3 -m pytest` can fail on a machine that has pytest.
    """
    import pyenv
    venv = os.environ.get("PYENV_VENV") or os.path.expanduser("~/.cache/pyenv-venv")
    for py in [*pyenv.candidates(), os.path.join(venv, "bin", "python3")]:
        if os.path.isfile(py) and pyenv.imports(py, list(modules)):
            return py
    return None


def shim_dir(py):
    """A directory whose `python3`, `python` and `pytest` run `py`: put it
    first on PATH. A bare `pytest` (ubuntu-agent-server-ci.yml) can be a uv
    tool with its own interpreter, which lacked PyYAML here.

    Wrapper scripts, not symlinks, so a venv interpreter keeps its venv.
    """
    d = Path(tempfile.mkdtemp(prefix="venture-python-"))
    for name, args in (("python3", ""), ("python", ""), ("pytest", " -m pytest")):
        (d / name).write_text(f'#!/bin/sh\nexec "{py}"{args} "$@"\n')
        (d / name).chmod(0o755)
    return str(d)


def run_elsewhere_step(argv, cwd, env, timeout):
    """Run one workflow test step; when python3 here lacks a module the step
    needs, retry once with an interpreter that has it, else say how to get it."""
    import run_workflow_locally as rwl
    env = env or {}
    ok, out = run_one(argv, cwd, timeout, env)
    lacking, probes, note = [], [], ""
    # Each retry can surface the next missing module (ig-media-pipeline:
    # numpy, then pytest), so ask for all of them at once. `probes` keeps a
    # broken extension's full name (PIL._imaging): `import PIL` passed on the
    # very interpreter whose Pillow would not load (photo-editing, 2026-11-12).
    while not ok and len(lacking) < 4:
        absent = rwl.missing_toolchain(out.splitlines(), str(cwd))
        if not absent or absent.split(".")[0] in lacking:
            break
        lacking.append(absent.split(".")[0])
        probes.append(absent if "._" in absent else absent.split(".")[0])
        py = interpreter_with(*probes)
        if py is None:
            names = " ".join(lacking)
            return False, (f"{note}{out}\n`{names}` not installed for python3 here, so this suite "
                           f"never ran: `python3 platform/ci/pyenv.py {names}` installs it, then run again.")
        path = shim_dir(py) + os.pathsep + env.get("PATH", os.environ.get("PATH", ""))
        ok, out = run_one(argv, cwd, timeout, {**env, "PATH": path})
        note = f"(python3 here lacks {', '.join(lacking)}; ran with {py})\n"
    return ok, note + out


REEXEC_ENV = "RUN_VENTURE_TESTS_REEXEC"


def reexec_with_yaml(argv):
    """Rerun this script under a python3 here that has PyYAML, if there is one.

    Session images can carry several interpreters, and pip often installs into
    one that is not first on PATH (pyenv.py, "Why"), so `python3` lacking
    PyYAML does not mean the machine does. Returns only when none has it.
    """
    if os.environ.get(REEXEC_ENV):
        return
    py = interpreter_with("yaml")
    if py is None:
        return
    print(f"note: python3 here lacks PyYAML; rerunning with {py}", flush=True)
    os.environ[REEXEC_ENV] = "1"
    os.execv(py, [py, os.path.abspath(__file__), *argv])


def clear_workflow_caches():
    """Forget what the workflows said (tests rewrite them between calls)."""
    python_run_elsewhere.cache_clear()
    _workflow_steps.cache_clear()


def python_test_dirs(slug):
    """Directories holding Python test files, for ventures CI runs nowhere else."""
    if python_run_elsewhere(slug):
        return []
    files = _files(slug, "test_*.py") + _files(slug, "*_test.py")
    return sorted({p.parent for p in files})


def has_tests(slug):
    return bool(node_tests(slug) or python_test_dirs(slug))


def suite_weight(slug):
    """Bytes of test code: a cheap stand-in for how long the suite runs.

    venture_suite_times.json would order suites better (bytes rank the four
    ~10-minute suites 4th to 7th), but on a full run the order costs almost
    nothing: 3,639 suite-seconds on 4 workers cannot finish under 910 s, and
    the run took 918 s (2026-11-15, docs/reports/2026-11-15-venture-suite-times.md).
    A faster full run needs a faster suite, not a different order."""
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
    """Ventures changed since `base`, for CI's `--since` mode.

    Against the working tree, not `base..HEAD`: on a CI checkout the two are
    the same, but under `run_workflow_locally.py --for-changes` an
    uncommitted venture edit selected ventures-tests.yml and then ran
    "0 suites run, 0 failed", exit 0 (process run 2026-11-18). Untracked
    files count too, locally only: a CI step's untracked output is not a
    change the PR made.
    """
    paths = git("diff", "--name-only", base, "--", "ventures").splitlines()
    if not ON_ACTIONS:
        paths += git("ls-files", "--others", "--exclude-standard", "--", "ventures").splitlines()
    return with_dependents(slugs_in(paths))


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
            "  Refresh it: python3 platform/ci/fetch_ref.py main\n"
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


# No --test-force-exit. The red-team run of 2026-11-12 added it so a server
# suite whose failing assertion skips its close() ends at once instead of at
# SUITE_TIMEOUT. On Node 22.23, in `node --test` runner mode, it also ends
# files early at random, exit 0, with the missing tests simply unreported:
# changepoint-detector's engine.test.mjs ran 38 to 94 of its 94 tests, and a
# 60-test synthetic file 39 or 54 (docs/history/ci-perf-2026-11-13-changepoint-
# engine-test-split.md). A red suite that waits for the timeout is slow but red;
# a green one missing half its tests is wrong, so the flag stays off.
NODE_TEST = ["node", "--test"]


def command(slug):
    if slug not in own_workflow_slugs():
        return list(NODE_TEST)
    venture = VENTURES / slug
    return [*NODE_TEST, *sorted(
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


# A suite that has already reported a failing test is red whatever else it
# prints. If it then goes quiet this long, an open handle (a server whose
# close() the failing assertion skipped) is keeping it alive: stop it rather
# than wait for SUITE_TIMEOUT. Only a red suite is ever stopped early, so this
# cannot turn a failure green or hide a test, which --test-force-exit did.
FAIL_QUIET = 10
FAILED_LINE = re.compile(r"^\s*not ok \d")


def run_one(argv, cwd, timeout, env=None):
    # Its own process group, so a timeout also stops the per-file children
    # `node --test` spawns rather than leaving them running.
    p = subprocess.Popen(argv, cwd=cwd, env={**os.environ, **(env or {})},
                         stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, text=True, start_new_session=True)
    lines, state = [], {"last": time.monotonic(), "failed": False}

    def read():
        for line in p.stdout:
            lines.append(line)
            state["last"] = time.monotonic()
            if FAILED_LINE.match(line):
                state["failed"] = True

    reader = threading.Thread(target=read, daemon=True)
    reader.start()
    deadline = time.monotonic() + timeout
    note = ""
    while p.poll() is None:
        now = time.monotonic()
        if now >= deadline:
            note = f"\ntimed out after {SUITE_TIMEOUT}s"
        elif state["failed"] and now - state["last"] >= FAIL_QUIET:
            note = (f"\nstopped: a test failed and the suite then printed nothing for "
                    f"{FAIL_QUIET}s (an open handle, such as a server left listening)")
        if note:
            os.killpg(p.pid, signal.SIGKILL)
            p.wait()
            break
        time.sleep(0.2)
    reader.join()
    out = "".join(lines) + note
    if note:
        return False, out
    # unittest exits 5 when it finds no tests: a pytest-style file of bare
    # functions (shed-designer's). Nothing ran, so nothing failed.
    return p.returncode == 0 or (p.returncode == 5 and "unittest" in argv), out


def run(slug, elsewhere=False):
    start = time.monotonic()
    cmds = [(argv, cwd, None, None) for argv, cwd in commands(slug)]
    if elsewhere:
        cmds += elsewhere_commands(slug)
    ok, outs = True, []
    for argv, cwd, env, wf in cmds:
        left = max(1, SUITE_TIMEOUT - (time.monotonic() - start))
        if wf:
            one_ok, out = run_elsewhere_step(argv, cwd, env, left)
            out = f"$ {argv[-1]} (in {Path(cwd).relative_to(ROOT)}, from .github/workflows/{wf})\n{out}"
        else:
            one_ok, out = run_one(argv, cwd, left)
            if len(cmds) > 1:
                name = "node --test" if argv[0] == "node" else "python3 -m unittest"
                out = f"$ {name} (in {Path(cwd).relative_to(VENTURES / slug)})\n{out}"
        if len(cmds) > 1 and not one_ok:
            head, _, rest = out.partition("\n")
            out = f"{head}{STEP_FAILED}\n{rest}"
        ok = ok and one_ok
        outs.append(out)
    return slug, ok, "\n".join(outs), time.monotonic() - start


SKIP_TOTALS = (
    re.compile(r"^(?:OK|FAILED) \(.*?\bskipped=(\d+)", re.M),        # unittest
    re.compile(r"^=+ .*?\b(\d+) skipped\b.* in [\d.]+s", re.M),        # pytest
    re.compile(r"^# skipped (\d+)$", re.M),                              # node --test (TAP)
)
SKIP_REASONS = re.compile(r"\bskipped '([^'\n]+)'|# SKIP\b ?([^\n]*)")


def skipped(out):
    """(tests skipped, most common reason or None) over one venture's output.

    A suite that skips when a package is missing passes here while CI, which
    installs it, runs it: open-tennis-robots' CAD suite printed "ok" with 96
    tests skipped for want of build123d (run-record doc friction, 2026-11-14),
    so a local "ok" read as the CI pass. Saying how many were skipped, and why,
    keeps that visible.
    """
    n = sum(int(m) for rx in SKIP_TOTALS for m in rx.findall(out))
    reasons = {}
    for a, b in SKIP_REASONS.findall(out):
        r = (a or b).strip()
        if r:
            reasons[r] = reasons.get(r, 0) + 1
    return n, (max(reasons, key=lambda r: (reasons[r], r)) if reasons else None)


# How many tests a suite ran, so "ok (15.9s)" says whether the 2,000 node
# tests ran or only a 0.4 s smoke file (run-record doc friction, 2026-11-15:
# einvoice-preflight's single ok line sent a run to rerun node --test by hand).
RAN_TOTALS = (
    re.compile(r"^Ran (\d+) tests? in ", re.M),                          # unittest
    re.compile(r"^=+ .*?\b(\d+) passed\b.* in [\d.]+s", re.M),         # pytest
    re.compile(r"^(?:# |\u2139 )tests (\d+)$", re.M),                    # node --test (TAP, spec)
)


def ran_note(out):
    n = sum(int(m) for rx in RAN_TOTALS for m in rx.findall(out))
    return f", {n} test{'s' if n != 1 else ''}" if n else ""


def skipped_note(out):
    n, why = skipped(out)
    if not n:
        return ""
    return f"; {n} test{'s' if n != 1 else ''} skipped" + (f" (most: {why!r})" if why else "")


def normalize_slug(arg):
    """`ventures/foo/`, `./ventures/foo` or a path inside it -> `foo`."""
    parts = [p for p in Path(arg).parts if p not in (".", "/")]
    if "ventures" in parts and parts.index("ventures") + 1 < len(parts):
        return parts[parts.index("ventures") + 1]
    return parts[0] if parts else arg


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


STEP_FAILED = "  <- this step failed"
UNITTEST_BLOCK = re.compile(r"^(?:FAIL|ERROR): ")


def failures(out, context=30):
    """What a reader needs to see of a red suite: each `not ok` block of the TAP
    output and each unittest `FAIL:`/`ERROR:` block, else the tail of each step
    that failed, else the tail.

    The tail alone can miss the failure entirely: a 198-test suite prints its
    one failing test long before the last 3,000 characters, and a venture with
    two steps printed the second, green one's tail while its first step's
    unittest failure stayed hidden (friction 2026-11-16, test_host).
    """
    lines = out.splitlines()
    keep = set()
    for i, line in enumerate(lines):
        if line.lstrip().startswith("not ok"):
            keep.update(range(i, min(i + context, len(lines))))
        elif UNITTEST_BLOCK.match(line):
            j = i + 1
            while j < len(lines) and j < i + 2 * context and not (
                    lines[j].startswith("=" * 10) or lines[j].startswith("Ran ")):
                j += 1
            keep.update(range(i, j))
    if keep:
        summary = [l for l in lines[-10:] if l.startswith("# ")]
        summary += [l for l in lines if l.startswith("FAILED (")]
        return "\n".join(lines[j] for j in sorted(keep)) + "\n" + "\n".join(summary)
    starts = [i for i, l in enumerate(lines) if l.startswith("$ ")] + [len(lines)]
    red = ["\n".join(lines[a:b])[-3000:] for a, b in zip(starts, starts[1:])
           if lines[a].endswith(STEP_FAILED)]
    return "\n".join(red) if red else out[-3000:]


def page_checks(slugs):
    """Run PAGE_CHECKS once when a named venture ships HTML or CSS.

    Returns (ran, ok, out). They scan the whole portfolio, so a red line can
    name another venture's page; CI would fail on it all the same.
    """
    present = [name for name in PAGE_CHECKS if (PAGES / name).is_file()]
    shipped = any(any((VENTURES / s).rglob(pat)) for s in slugs for pat in ("*.html", "*.css"))
    if not present or not shipped:
        return False, True, ""
    ok, out = run_one(["node", "--test", *present], PAGES, SUITE_TIMEOUT)
    return True, ok, out


def slowest_table(times, n, passes=None):
    """The n slowest suites as a Markdown table. Perf runs re-timed suites by
    hand because no list of suite times existed (doc friction 2026-11-11);
    `--slowest 30` over every venture makes that one command.

    `passes(slug)` (suite_file_times.perf_history) adds how many ci-perf
    write-ups are about each suite (file name or title; a body mention once
    counted every top suite as passed by every run, 2026-11-18): the top four
    had 6 to 10 by 2026-11-18 and most of the 10-20 s tier none, where a run
    found a 7x win in minutes (perf run records 2026-11-16/17)."""
    rows = sorted(times.items(), key=lambda kv: (-kv[1], kv[0]))[:n]
    if passes is None:
        return "\n".join(["| venture | seconds |", "|---|---:|",
                          *(f"| {slug} | {secs:.1f} |" for slug, secs in rows)])
    return "\n".join(["| venture | seconds | perf write-ups | latest |", "|---|---:|---:|---|",
                      *(f"| {slug} | {secs:.1f} | {len(passes(slug))} | {passes(slug)[0][0] if passes(slug) else ''} |"
                        for slug, secs in rows)])


def load_times(path=None):
    import json
    try:
        return json.loads(Path(path or TIMES_FILE).read_text())
    except FileNotFoundError:
        return {"seconds": {}}


def write_times(times, failed, jobs, path=None, full=False):
    """Save suite times (seconds, one decimal) with when and how they were taken.
    A full run replaces every row; a named run updates only its own."""
    import json
    import datetime
    path = Path(path or TIMES_FILE)
    prev = {} if full else load_times(path)
    old = prev.get("seconds", {})
    kept_failed = set(prev.get("failed", [])) - set(times)
    rows = {**old, **{s: round(t, 1) for s, t in times.items()}}
    try:
        commit = git("rev-parse", "--short", "HEAD").strip()
    except subprocess.CalledProcessError:
        commit = None
    data = {
        "about": "Wall seconds per venture test suite, from run_venture_tests.py --write-times. "
                 "Times taken with `jobs` suites in parallel on `cpus` cores, so they are "
                 "relative, not a single-suite benchmark. `seconds` maps slug to wall seconds, slowest first; "
                 "`failed` lists suites that failed in that run. Read it with `run_venture_tests.py --times N`; "
                 "time one suite's files alone with `suite_file_times.py <slug>`.",
        "taken": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "commit": commit, "cpus": os.cpu_count(), "jobs": jobs,
        "failed": sorted(set(failed) | kept_failed),
        "seconds": dict(sorted(rows.items(), key=lambda kv: (-kv[1], kv[0]))),
    }
    path.write_text(json.dumps(data, indent=1) + "\n")
    return path


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("slugs", nargs="*")
    ap.add_argument("--changed", action="store_true")
    ap.add_argument("--since", metavar="BASE")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
    ap.add_argument("--slowest", type=int, default=0, metavar="N",
                    help="end with the N slowest suites, slowest first")
    ap.add_argument("--write-times", action="store_true",
                    help="save each suite's time to platform/ci/venture_suite_times.json")
    ap.add_argument("--times", type=int, default=0, metavar="N",
                    help="print the N slowest suites from that file and exit (no run)")
    ap.add_argument("--no-elsewhere", action="store_true",
                    help="skip the Python test steps a named venture's own workflow runs")
    ap.add_argument("--no-page-checks", action="store_true",
                    help="skip the platform/pages checks that scan venture HTML (PAGE_CHECKS), "
                    "which a named local run otherwise adds")
    ap.add_argument("--no-unwired", action="store_true",
                    help="with --since, skip the check_*.py scripts, unit tests and doc_index check "
                    "no workflow runs (unwired_checks.py)")
    args = ap.parse_args(argv)
    if args.times:
        data = load_times()
        if not data["seconds"]:
            print(f"no times recorded yet: run with --write-times")
            return 1
        print(f"{len(data['seconds'])} suites timed {data.get('taken')} at {data.get('commit')} "
              f"({data.get('jobs')} jobs on {data.get('cpus')} cores)")
        print(slowest_table(data["seconds"], args.times, passes=functools.lru_cache(None)(
            suite_file_times.perf_history)))
        print("\nTimes are relative (suites ran in parallel). Which file is slow, timed alone: "
              "python3 platform/ci/suite_file_times.py <slug>")
        return 0

    if args.since is not None and args.since.strip("0 "):
        slugs = since_slugs(args.since)
    elif args.changed:
        slugs = changed_slugs()
    elif args.slugs:
        # `ventures/<slug>/` (what tab completion types) means `<slug>`: it
        # printed "no such venture" and "0 suites run, 0 failed", exit 0, which
        # read as a pass (doc friction 2026-11-13).
        slugs = [normalize_slug(s) for s in args.slugs]
    else:
        slugs = sorted(d.name for d in VENTURES.iterdir() if d.is_dir())
    # Longest suites first: with a fixed worker pool, starting the biggest
    # suite last leaves one worker running it alone after the others finish.
    named = bool(args.slugs or args.changed or args.since)
    # Named slugs and --changed are how a session checks its own work; --since
    # and a full run are CI's modes, where those workflows run on their own.
    elsewhere = bool(args.slugs or args.changed) and not ON_ACTIONS and not args.no_elsewhere
    # Ventures whose own-workflow Python steps this run cannot run (no PyYAML).
    no_yaml = elsewhere and importlib.util.find_spec("yaml") is None
    if no_yaml:
        reexec_with_yaml(argv)  # returns only when no interpreter here has PyYAML
        # run_workflow_locally reads workflows with PyYAML. Without it a named
        # venture used to print "ok" for its Node suite alone, and the note
        # above scrolled away (doc friction 2026-11-14: open-tennis-robots "ok"
        # in 0.4 s, its Python and CAD suites never run).
        print("note: no python3 here has PyYAML, so own-workflow Python tests are not run "
              "(python3 platform/ci/pyenv.py yaml installs it)", flush=True)
        elsewhere = False
    runs_here = {s for s in slugs if has_tests(s)
                 or (elsewhere and (VENTURES / s).is_dir() and elsewhere_commands(s))}
    if named:
        for slug in slugs:
            if slug not in runs_here:
                print(skip_note(slug), flush=True)
    lint_slugs_named = list(slugs)
    lint_slugs = [s for s in slugs if (VENTURES / s).is_dir()]
    slugs = sorted(runs_here, key=lambda s: (-suite_weight(s), s))

    failed, partial, times = [], [], {}
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        # Printed as each finishes, so one slow suite does not hide the rest.
        for future in as_completed([pool.submit(run, s, elsewhere) for s in slugs]):
            slug, ok, out, secs = future.result()
            times[slug] = secs
            also = sorted({c[-1] for c in elsewhere_commands(slug)}) if elsewhere else []
            unrun = sorted({w for w, _ in python_run_elsewhere(slug)}) if no_yaml else []
            if unrun:
                partial.append(slug)
            print(f"{('PART' if unrun else 'ok  ') if ok else 'FAIL'} {slug} ({secs:.1f}s{ran_note(out)})"
                  + (f" incl. Python steps of {', '.join(also)}" if also else "")
                  + (f"; Python steps of {', '.join(unrun)} NOT run (no PyYAML)" if unrun else "")
                  + skipped_note(out), flush=True)
            if not ok:
                failed.append(slug)
                if ON_ACTIONS:
                    print(f"::group::{slug} output\n{out}\n::endgroup::")
                    print(f"::error title=venture tests failed::ventures/{slug}")
                else:
                    print(failures(out))
    if args.slowest:
        print(slowest_table(times, args.slowest))
    if args.write_times:
        out = write_times(times, failed, args.jobs, full=not named)
        print(f"suite times written to {out}")
    print(f"{len(slugs)} suites run, {len(failed)} failed"
          + (f": {' '.join(sorted(failed))}" if failed else "")
          + (f"; {len(partial)} only partly run (own-workflow Python steps need PyYAML): "
             f"{' '.join(sorted(partial))}" if partial else ""))
    unknown = [s for s in (lint_slugs_named if args.slugs else []) if not (VENTURES / s).is_dir()]
    if unknown:
        print(f"error: no such venture: {' '.join(unknown)} (pass the folder name under ventures/)")
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
    # Local runs that name ventures, including `--since` under
    # run_workflow_locally.py --for-changes (which skipped them on a venture
    # FAQ edit, friction 2026-11-18). On Actions, portfolio-pages.yml runs them.
    page_red = False
    if named and not ON_ACTIONS and not args.no_page_checks:
        ran, ok, out = page_checks(lint_slugs)
        if ran:
            page_red = not ok
            print(f"{'ok  ' if ok else 'FAIL'} site page checks (platform/pages: "
                  f"{', '.join(PAGE_CHECKS)})", flush=True)
            if not ok:
                print(failures(out))
    # `--since` is CI's mode (ventures-tests.yml): also run the tree checks no
    # workflow names, which no PR ran before 2026-11-12 (unwired_checks.py).
    unwired_red = False
    if args.since is not None and not args.no_unwired:
        import unwired_checks
        results = unwired_checks.run_everything()
        bad = unwired_checks.report(results)
        unwired_red = bool(bad)
        if bad:
            print(bad)
            if ON_ACTIONS:
                for name, rc, _ in results:
                    if rc:
                        print(f"::error title=unwired check failed::platform/ci/{name} (exit {rc}; "
                              f"{unwired_checks.reproduce(name)})")
        skips = unwired_checks.skipped(results)
        print(f"{sum(rc == 0 for _, rc, _ in results) - len(skips)}/{len(results)} unwired tree "
              f"checks and tests pass" + (f", {len(skips)} skipped (missing pytest or a package: "
                                          f"{' '.join(n for n, _ in skips)})" if skips else ""))
    elif named and not args.no_unwired:
        # A local named pass is not CI's pass: the changed-ventures job also runs
        # these (friction 2026-11-18: a new platform/ file passed here, failed CI).
        # About 90 s, so they are named rather than run.
        print("note: the unwired tree checks CI also runs were not run (about 90 s): "
              "python3 platform/ci/unwired_checks.py", flush=True)
    return 1 if failed or lint or unwired_red or unknown or page_red else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
