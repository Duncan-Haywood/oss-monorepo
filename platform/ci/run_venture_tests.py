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
    python3 platform/ci/run_venture_tests.py --slowest 30    # also end with the 30 slowest suites

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
there on their own.
An empty or all-zero `--since` (a new branch, a dispatch) means every venture.
`--since` also runs every argument-free platform/ci/check_*.py that no
workflow names (unwired_checks.py; `--no-unwired` skips them): 30 of 60 ran in
no PR before 2026-11-12, and one let a stray `</head>` reach main (#15195).

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


# --test-force-exit: about 40 venture server suites close their server as a
# test's last line, so a failing assertion skipped the close and the open handle
# kept `node --test` alive until SUITE_TIMEOUT; the failure now ends the file as
# soon as its tests finish (red-team run 2026-11-12). On Node 22.23 it reports the
# same tests as without it (einvoice-preflight: 1580 of 1580 either way).
NODE_TEST = ["node", "--test", "--test-force-exit"]


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


def run_one(argv, cwd, timeout, env=None):
    # Its own process group, so a timeout also stops the per-file children
    # `node --test` spawns rather than leaving them running.
    p = subprocess.Popen(argv, cwd=cwd, env={**os.environ, **(env or {})},
                         stdout=subprocess.PIPE,
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
        ok = ok and one_ok
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


def slowest_table(times, n):
    """The n slowest suites as a Markdown table. Perf runs re-timed suites by
    hand because no list of suite times existed (doc friction 2026-11-11);
    `--slowest 30` over every venture makes that one command."""
    rows = sorted(times.items(), key=lambda kv: (-kv[1], kv[0]))[:n]
    return "\n".join(["| venture | seconds |", "|---|---:|",
                      *(f"| {slug} | {secs:.1f} |" for slug, secs in rows)])


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("slugs", nargs="*")
    ap.add_argument("--changed", action="store_true")
    ap.add_argument("--since", metavar="BASE")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
    ap.add_argument("--slowest", type=int, default=0, metavar="N",
                    help="end with the N slowest suites, slowest first")
    ap.add_argument("--no-elsewhere", action="store_true",
                    help="skip the Python test steps a named venture's own workflow runs")
    ap.add_argument("--no-unwired", action="store_true",
                    help="with --since, skip the check_*.py scripts no workflow runs (unwired_checks.py)")
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
    named = bool(args.slugs or args.changed or args.since)
    # Named slugs and --changed are how a session checks its own work; --since
    # and a full run are CI's modes, where those workflows run on their own.
    elsewhere = bool(args.slugs or args.changed) and not ON_ACTIONS and not args.no_elsewhere
    if elsewhere and importlib.util.find_spec("yaml") is None:
        # run_workflow_locally reads workflows with PyYAML.
        print("note: PyYAML is not installed, so own-workflow Python tests are not run here "
              "(pip install pyyaml)", flush=True)
        elsewhere = False
    runs_here = {s for s in slugs if has_tests(s)
                 or (elsewhere and (VENTURES / s).is_dir() and elsewhere_commands(s))}
    if named:
        for slug in slugs:
            if slug not in runs_here:
                print(skip_note(slug), flush=True)
    lint_slugs = [s for s in slugs if (VENTURES / s).is_dir()]
    slugs = sorted(runs_here, key=lambda s: (-suite_weight(s), s))

    failed, times = [], {}
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        # Printed as each finishes, so one slow suite does not hide the rest.
        for future in as_completed([pool.submit(run, s, elsewhere) for s in slugs]):
            slug, ok, out, secs = future.result()
            times[slug] = secs
            also = sorted({c[-1] for c in elsewhere_commands(slug)}) if elsewhere else []
            print(f"{'ok  ' if ok else 'FAIL'} {slug} ({secs:.1f}s)"
                  + (f" incl. Python steps of {', '.join(also)}" if also else ""), flush=True)
            if not ok:
                failed.append(slug)
                if ON_ACTIONS:
                    print(f"::group::{slug} output\n{out}\n::endgroup::")
                    print(f"::error title=venture tests failed::ventures/{slug}")
                else:
                    print(failures(out))
    if args.slowest:
        print(slowest_table(times, args.slowest))
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
    # `--since` is CI's mode (ventures-tests.yml): also run the tree checks no
    # workflow names, which no PR ran before 2026-11-12 (unwired_checks.py).
    unwired_red = False
    if args.since is not None and not args.no_unwired:
        import unwired_checks
        results = unwired_checks.run_all(unwired_checks.unwired())
        bad = unwired_checks.report(results)
        unwired_red = bool(bad)
        if bad:
            print(bad)
            if ON_ACTIONS:
                for name, rc, _ in results:
                    if rc:
                        print(f"::error title=unwired check failed::platform/ci/{name} (exit {rc})")
        print(f"{sum(rc == 0 for _, rc, _ in results)}/{len(results)} unwired tree checks pass")
    return 1 if failed or lint or unwired_red else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
