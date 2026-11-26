#!/usr/bin/env python3
"""Run every argument-free platform/ci/check_*.py that no workflow names.

On 2026-11-12, 30 of the 60 `check_*.py` scripts appeared in no file under
`.github/workflows/`, so no pull request ever ran them; only a session running
`main_health.py` by hand saw one go red. That is how PR #15195 put a stray
`</head>` on main (check_tag_balance.py). Adding a workflow step per check is a
control-plane edit and needs a new one for every new check, so this script
finds the unwired set itself: `run_venture_tests.py --since` (the
ventures-tests.yml step) runs it, and a check that is added and never wired is
covered from the PR that adds it.

    python3 platform/ci/unwired_checks.py          # run them, exit 1 if any fails
    python3 platform/ci/unwired_checks.py --list   # just name them

Checks that need a built site (main_health.NEEDS_SITE) are left out. A check
wired into a workflow later drops out of this set by itself.

It also runs every `platform/ci/test_*.py` suite that no pull-request
workflow names. On 2026-11-13, 71 of 121 suites were named by no workflow and
one more (test_browser_checks.py) only by a nightly; two were red on main
unseen (test_doc_index.py: 44 untagged reports; test_browser_checks.py: four
browser checks added without registering). Together they take about 15 s at
six at a time.

Two more fixes (2026-11-13, PR #15548). Until then run_venture_tests.py, the
CI caller, still ran only the checks, so no pull request ran the suites. On
the CI runner's Python 3.12 the 15 plain pytest-function suites run 0 tests
under unittest and exit 5; Python 3.11, in cloud sessions, calls that OK. A
suite with no TestCase now runs under pytest, and a suite that needs pytest or
a package the interpreter lacks (yaml on the runner) is a named skip, never a
pass. `doc_index.py check` (EXTRA) runs too, while no workflow names it.

And (2026-11-14) every `platform/**/*.test.mjs` node suite no workflow runs at
all, resolved from each `node --test` line's globs and working directory: 34
suites in platform/devlog, platform/distribution and platform/proposal, one of
them red on main (term-ids.test.mjs). About 30 s more at six at a time;
NODE_SLOW names the ones too slow for every pull request. Since 2026-11-17
`test_*.mjs` suites count too: six in platform/ci ran nowhere (under 3 s).

And (2026-11-19) every `portfolio/**/test_*.py` no pull-request workflow runs:
14 of 90, among them test_no_duplicate_yaml_keys.py, red on main unseen until
PR #17649, and router/test_validate.py, which the stem rule above would have
called wired because test_validate_usage is named. A portfolio suite counts as
wired only when a step names its path, names it from its own folder, or runs
pytest/discover over a folder holding it. About 13 s serial.
"""
import argparse
import functools
import glob
import json
import re
import shlex
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import main_health

# Tree checks outside check_*.py that no workflow runs: (script, args).
EXTRA = [("doc_index.py", "check")]

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
WORKFLOWS = HERE.parents[1] / ".github" / "workflows"


def workflow_text(workflows=WORKFLOWS):
    return "\n".join(p.read_text(encoding="utf-8", errors="replace")
                     for p in sorted(workflows.glob("*.y*ml")))


def unwired(here=HERE, workflows=WORKFLOWS):
    """The check_*.py scripts under `here` that no workflow file names."""
    text = workflow_text(workflows)
    return [p for p in sorted(here.glob("check_*.py"))
            if p.name not in main_health.NEEDS_SITE and p.name not in text]


def pr_workflow_text(workflows=WORKFLOWS):
    """The text of the workflows a pull request can trigger. A suite named only
    by a nightly or a dispatch-only workflow is as unseen at merge as one named
    by none (test_browser_checks.py, 2026-11-13)."""
    return "\n".join(t for t in (p.read_text(encoding="utf-8", errors="replace")
                                 for p in sorted(workflows.glob("*.y*ml")))
                     if triggers_on_pull_request(t))


_ON = re.compile(r'^(?:on|"on"|\'on\'|true):(.*)$')
_PR = re.compile(r"\bpull_request(?:_target)?\b")


def triggers_on_pull_request(text):
    """Whether a workflow's top-level `on:` names pull_request(_target).

    Reads only the `on:` block, so the word in a comment or in a
    `github.event.pull_request` expression does not count
    (browser-checks-ci.yml has both and runs nightly only)."""
    lines = text.splitlines()
    for i, line in enumerate(lines):
        m = _ON.match(line)
        if not m:
            continue
        inline = m.group(1).split("#", 1)[0]
        if _PR.search(inline):
            return True
        for body in lines[i + 1:]:
            if body.strip() and not body[0].isspace() and not body.startswith("#"):
                break
            if _PR.search(body.split("#", 1)[0]):
                return True
        return False
    return False


def unwired_tests(here=HERE, workflows=WORKFLOWS):
    """The test_*.py suites under `here` that no pull-request workflow names,
    by file name or by module name (`python3 -m unittest test_x`)."""
    text = pr_workflow_text(workflows)
    return [p for p in sorted(here.glob("test_*.py")) if p.stem not in text]


# Python suites under portfolio/ that no pull-request workflow runs (2026-11-19).
# Those workflows name their suites by module (`python3 -m unittest test_x`) from a
# working-directory, or run a whole folder (`pytest`, `unittest discover`), so the
# platform/ci rule above (the stem anywhere in the text) would count
# portfolio/router/test_validate.py as wired because test_validate_usage is named.
# portfolio/ledger/test_no_duplicate_yaml_keys.py ran nowhere and was red on main
# (three repeated `basis` keys in venture-scores.yaml) until PR #17649 found it by
# hand; main_health.py printed 279/279 meanwhile (run record 2026-11-19T07).
_FOLDER_RUN = re.compile(r"unittest\s+discover|pytest(?:\s+-\S+)*\s*(?:$|[;&|#]|tests?\b)", re.M)
_RUN_WD = re.compile(r"\bcd\s+(\S+)\s*&&")


def _steps(text):
    """[(working-directory, step text)] for each step of one workflow; a step with no
    working-directory of its own gets the workflow's (or job's) `defaults` one."""
    lines = text.splitlines()
    wds = [w.group(1).rstrip("/") for w in map(_WD.match, lines) if w]
    default = wds[0] if wds and not any(_STEP.match(l) and "working-directory" in l
                                        for l in lines) else "."
    out, seen = [], set()
    for i, line in enumerate(lines):
        if not _STEP.match(line):
            continue
        bounds = _step_bounds(lines, i)
        if bounds in seen:
            continue
        seen.add(bounds)
        body = "\n".join(lines[bounds[0]:bounds[1]])
        wd = next((w.group(1).rstrip("/") for w in map(_WD.match, lines[bounds[0]:bounds[1]])
                   if w), default)
        out.append((wd, body))
        out += [(m.group(1).rstrip("/"), body) for m in _RUN_WD.finditer(body)]
    return out


def suite_is_wired(rel, steps):
    """Whether a step runs the repo-relative suite `rel`: by path, by name or module
    from its own folder, or as part of a pytest/discover run of an enclosing folder."""
    rel = Path(rel)
    folder = rel.parent.as_posix()
    for wd, body in steps:
        if rel.as_posix() in body:
            return True
        if wd == folder and re.search(rf"\b{re.escape(rel.stem)}(?:\.py)?\b(?!_)", body):
            return True
        if wd not in (".", "") and (folder == wd or folder.startswith(wd + "/")) \
                and _FOLDER_RUN.search(body):
            return True
    return False


def unwired_portfolio_tests(root=ROOT, workflows=WORKFLOWS):
    """portfolio/**/test_*.py that no pull-request workflow runs."""
    steps = [s for p in sorted(workflows.glob("*.y*ml"))
             for t in [p.read_text(encoding="utf-8", errors="replace")]
             if triggers_on_pull_request(t) for s in _steps(t)]
    found = sorted(p for p in (root / "portfolio").rglob("test_*.py")
                   if "node_modules" not in p.parts)
    return [p for p in found if not suite_is_wired(p.relative_to(root), steps)]


SKIPPED = "SKIP:"


def has_module(name, python=sys.executable):
    return subprocess.run([python, "-c", f"import {name}"], capture_output=True).returncode == 0


@functools.lru_cache(maxsize=None)
def pytest_python():
    """An interpreter that imports pytest, or None: this one first, then the
    other python3s pyenv.py knows (no install). Cloud images often run this
    script under a python3 without pytest while /usr/bin/python3.x has it, and
    every plain suite then showed as a skip (doc friction 2026-11-17)."""
    if has_module("pytest"):
        return sys.executable
    try:
        import pyenv
        cands = pyenv.candidates()
    except Exception:
        return None
    return next((py for py in cands if has_module("pytest", py)), None)


def missing_module(out, here=HERE):
    """The third-party module a run failed to import, or None. A module the
    repository holds (a sibling .py file) is a real break, not a missing package."""
    m = re.search(r"ModuleNotFoundError: No module named '([\w.]+)'", out)
    if not m:
        return None
    top = m.group(1).split(".")[0]
    return None if (here / f"{top}.py").exists() or (here / top).is_dir() else top


def suite_name(path, root=ROOT):
    """A platform/ci suite's bare file name (as before); a repo-relative path for
    the others, so two portfolio/**/test_measure.py stay apart."""
    path, root = Path(path).resolve(), Path(root).resolve()
    if path.parent == HERE or not path.is_relative_to(root):
        return path.name
    return path.relative_to(root).as_posix()


def run_suite(path, timeout=main_health.TIMEOUT):
    """(name, rc, output) for one test module, run from its own directory so its
    `import <sibling>` lines resolve the way they do under discover. unittest
    for a TestCase module, pytest for plain test functions; a missing pytest or
    third-party package is a SKIPPED result with rc 0."""
    path = Path(path)
    name = suite_name(path)
    plain = "TestCase" not in path.read_text(encoding="utf-8", errors="replace")
    python = pytest_python() if plain else sys.executable
    if python is None:
        return name, 0, f"{SKIPPED} pytest-style suite and no python3 here has pytest"
    cmd = ["-m", "pytest", "-q", "-p", "no:cacheprovider", path.name] if plain \
        else ["-m", "unittest", path.stem]
    try:
        r = subprocess.run([python, *cmd], cwd=path.parent,
                           capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return name, main_health.TIMED_OUT, f"timed out after {timeout} s"
    out = (r.stdout + r.stderr).strip()
    if r.returncode != 0 and (mod := missing_module(out, path.parent)):
        return name, 0, f"{SKIPPED} needs {mod}, not installed here"
    return name, r.returncode, out


def skipped(results):
    return [(n, out) for n, rc, out in results if rc == 0 and out.startswith(SKIPPED)]


# Node suites under platform/ that no workflow runs (2026-11-14). Every
# `platform/ci` suite above was covered, but 35 `*.test.mjs` suites elsewhere in
# platform/ ran nowhere: platform/proposal/term-ids.test.mjs had been red on main
# since PR #15774 wrapped localStorage, and platform/devlog's suite let half of
# a red-team campaign's mutants through unseen. Coverage counts any workflow,
# not only pull-request ones: the platform/pages suites gate every deploy, so a
# red one shows within hours, while a suite no workflow names is never run.
NODE_TIMEOUT = 120
# Suites too slow for every pull request: named skips, never passes. Empty
# since 2026-11-14: ios.test.mjs took over 120 s because its catalogue-wide plan
# drew the 1024 px app icon once per venture; offline.mjs's renderIcon now draws
# each variant once per process, and the suite takes about 6 s.
NODE_SLOW = {}

_NODE_TEST = re.compile(r"node\s+--test\b([^\n;&|]*)")
_CD = re.compile(r"\bcd\s+(\S+)\s*&&\s*node\s+--test\b")
_STEP = re.compile(r"^(\s*)- ")
_WD = re.compile(r"^\s*(?:-\s+)?working-directory:\s*['\"]?([^'\"\s#]+)")


def _step_bounds(lines, i):
    """(start, end) line indices of the workflow step holding line i."""
    start = i
    while start > 0 and not _STEP.match(lines[start]):
        start -= 1
    m = _STEP.match(lines[start])
    indent = len(m.group(1)) if m else 0
    end = i + 1
    while end < len(lines):
        n = _STEP.match(lines[end])
        if n and len(n.group(1)) <= indent:
            break
        if lines[end].strip() and len(lines[end]) - len(lines[end].lstrip()) < indent:
            break
        end += 1
    return start, end


def node_tests_run(text, root=ROOT):
    """Resolved paths of the files a workflow's `node --test` lines run: each
    argument globbed from the step's working-directory (written before or after
    `run:`) or from a `cd <dir> &&` in front of it."""
    lines = text.splitlines()
    out = set()
    for i, line in enumerate(lines):
        for m in _NODE_TEST.finditer(line):
            start, end = _step_bounds(lines, i)
            wd = next((w.group(1) for w in map(_WD.match, lines[start:end]) if w), ".")
            cd = _CD.search(line[:m.end()])
            base = root / wd / (cd.group(1) if cd else "")
            try:
                args = shlex.split(m.group(1))
            except ValueError:
                args = m.group(1).split()
            for a in args:
                if a.startswith("-") or "$" in a:
                    continue
                out.update(Path(f).resolve() for f in glob.glob(str(base / a)))
    return out


# Node suite file names. `test_*.mjs` too (2026-11-17): the six browser-sweep
# unit suites in platform/ci (test_check_enter_reload.mjs and its siblings) are
# named that way, matched no workflow and not the `*.test.mjs` glob either, so
# nothing ran them while their checkers grew.
NODE_SUITE_GLOBS = ("*.test.mjs", "test_*.mjs")


def unwired_node_suites(root=ROOT, workflows=WORKFLOWS):
    """platform/**/{*.test.mjs,test_*.mjs} (outside node_modules) that no workflow runs."""
    ran = set()
    for p in sorted(workflows.glob("*.y*ml")):
        ran |= node_tests_run(p.read_text(encoding="utf-8", errors="replace"), root)
    found = {p for g in NODE_SUITE_GLOBS for p in (root / "platform").rglob(g)}
    return [p for p in sorted(found)
            if "node_modules" not in p.parts and p.resolve() not in ran]



# The workflow whose `run_venture_tests.py --since` step runs this script, and so
# every suite below (2026-11-25). A suite it runs only on a pull request that
# starts it: ventures-tests.yml's `paths` filter named ventures/**, platform/ci/**
# and a few more, so a change to platform/billing/server.mjs alone (the Paddle
# webhook and licence signing) ran billing.test.mjs nowhere, and neither did one
# to 15 other folders with suites in this set (platform/proposal, platform/devlog,
# portfolio/ledger, ...). A suite counts as covered when a file beside it matches
# one of that workflow's pull_request `paths` globs.
RUNNER_WORKFLOW = "ventures-tests.yml"


def pr_path_globs(text):
    """The `paths` globs under a workflow's `on: pull_request:` (none: [])."""
    lines = text.splitlines()
    out, in_pr, pr_indent, in_paths, paths_indent = [], False, 0, False, 0
    for line in lines:
        bare = line.split("#", 1)[0].rstrip()
        if not bare.strip():
            continue
        indent = len(bare) - len(bare.lstrip())
        if in_paths:
            m = re.match(r"\s*-\s*['\"]?([^'\"]+?)['\"]?\s*$", bare)
            if m and indent >= paths_indent:
                out.append(m.group(1))
                continue
            in_paths = False
        if in_pr and indent <= pr_indent:
            in_pr = False
        if re.match(r"\s*pull_request:\s*$", bare):
            in_pr, pr_indent = True, indent
        elif in_pr and re.match(r"\s*paths:\s*$", bare):
            in_paths, paths_indent = True, indent
    return out


def path_glob_re(glob_):
    """GitHub's path-filter glob as a regex: `**` crosses `/`, `*` does not."""
    out, i = "", 0
    while i < len(glob_):
        if glob_.startswith("**", i):
            out, i = out + ".*", i + 2
        elif glob_[i] == "*":
            out, i = out + "[^/]*", i + 1
        else:
            out, i = out + re.escape(glob_[i]), i + 1
    return re.compile(out + r"\Z")


def untriggered(paths, globs, root=ROOT):
    """Repo-relative suites in `paths` whose folder no glob in `globs` covers:
    a change beside the suite does not start the workflow that runs it."""
    res = [path_glob_re(g) for g in globs if not g.startswith("!")]
    out = []
    for p in paths:
        rel = Path(p).resolve().relative_to(Path(root).resolve())
        probe = (rel.parent / "any.mjs").as_posix()
        if not any(r.match(probe) for r in res):
            out.append(rel.as_posix())
    return out


def untriggered_suites(root=ROOT, workflows=WORKFLOWS):
    """The node and portfolio suites this script runs that a change to their own
    folder would not start RUNNER_WORKFLOW for."""
    globs = pr_path_globs((workflows / RUNNER_WORKFLOW).read_text(encoding="utf-8"))
    return untriggered(unwired_node_suites(root, workflows)
                       + unwired_portfolio_tests(root, workflows), globs, root)

def node_name(path, root=ROOT):
    return Path(path).resolve().relative_to(root.resolve()).as_posix()


def run_node_suite(path, timeout=NODE_TIMEOUT, root=ROOT):
    """(repo-relative name, rc, output) for one `node --test` file, run from its
    own directory the way the workflows run them."""
    path = Path(path)
    name = node_name(path, root)
    if name in NODE_SLOW:
        return name, 0, f"{SKIPPED} {NODE_SLOW[name]}"
    try:
        r = subprocess.run(["node", "--test", path.name], cwd=path.parent,
                           capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return name, main_health.TIMED_OUT, f"timed out after {timeout} s"
    except FileNotFoundError:
        return name, 0, f"{SKIPPED} no node on this machine"
    out = (r.stdout + r.stderr).strip()
    if r.returncode != 0 and (pkg := missing_npm_package(out, path.parent, root)):
        return name, 0, f"{SKIPPED} needs npm package {pkg} (declared in its package.json, not installed here)"
    return name, r.returncode, out


def missing_npm_package(out, here, root=ROOT):
    """The npm package a node suite failed to import, or None. Like
    missing_module: only a package the suite's nearest package.json declares
    and node_modules lacks counts as "not installed"; an undeclared import
    is a real break (2026-11-25: saas-starter's @aws-sdk/client-s3)."""
    m = re.search(r"Cannot find package '((?:@[\w.-]+/)?[\w.-]+)'", out)
    if not m:
        return None
    pkg, here, root = m.group(1), Path(here).resolve(), Path(root).resolve()
    for d in [here, *here.parents]:
        manifest = d / "package.json"
        if manifest.is_file():
            try:
                data = json.loads(manifest.read_text(encoding="utf-8"))
            except ValueError:
                return None
            declared = {k for f in ("dependencies", "devDependencies", "optionalDependencies")
                        for k in (data.get(f) or {})}
            return pkg if pkg in declared and not (d / "node_modules" / pkg).exists() else None
        if d == root:
            break
    return None


def unwired_extra(here=HERE, workflows=WORKFLOWS):
    """EXTRA's (path, *args) jobs whose script no workflow names."""
    text = workflow_text(workflows)
    return [(here / name, *args) for name, *args in EXTRA if name not in text]


# Checks whose own test suite already runs them on the whole tree, mapped to that
# test (2026-11-26). Each named test asserts `check.main([]) == 0` (or `main()`
# for a main that takes no argument, or runs the script with no arguments and
# asserts exit 0), which is what running `check_X.py` here asserts, so the pool
# ran the same scan twice: about 23 s of its 243 s serial on a 4-core container
# (docs/history/ci-perf-2026-11-26-unwired-tree-scan-once.md). A listed check
# runs alone only when its suite is not green (red, timed out or skipped), so a
# skipped suite never hides it. Every entry was checked to give the same exit
# code and output from platform/ci (where its suite runs) and from the root
# (where the check runs); test_unwired_checks pins that each named test still
# holds its tree assertion. A check left out of this map just runs twice.
COVERED_BY_TREE_TEST = {
    "check_agent_text_on_pages.py": "test_repository_pages_are_clean",
    "check_clock_rollover.py": "test_tree_is_clean",
    "check_column_shift.py": "test_repository_is_green",
    "check_decimal_comma.py": "test_the_tree_is_clean",
    "check_decimal_format.py": "test_the_tree_is_clean",
    "check_docker_copy.py": "test_repo_is_clean",
    "check_dotted_dates.py": "test_the_tree_is_clean",
    "check_dst_day_step.py": "test_repository_ventures_are_clean",
    "check_finite_thresholds.py": "test_tree_is_clean",
    "check_money_pence.py": "test_the_tree_is_clean",
    "check_month_overflow.py": "test_ventures_tree_is_clean",
    "check_negative_zero_money.py": "test_tree_is_clean",
    "check_noindex_sitemap.py": "test_default_root_is_repo_ventures_and_help",
    "check_open_range_messages.py": "test_venture_tree_is_clean",
    "check_parse_sign.py": "test_the_tree_is_clean",
    "check_playwright_import.py": "test_repository_is_clean",
    "check_row_spread.py": "test_the_repository_is_green",
    "check_se_tax_floor.py": "test_tree_is_clean",
    "check_shallow_refspec.py": "test_main_fails_on_a_bad_tree_and_the_real_tree_is_clean",
    "check_test_spawn_cwd.py": "test_repository_is_clean",
    "check_trailing_flag_value.py": "test_repository_is_green",
}


def run_everything(checks_only=False, jobs=6):
    """Checks, then (unless checks_only) suites and EXTRA: one sorted result list.

    One pool for all four kinds (2026-11-14). Four pools in a row each waited
    for their slowest item while the other workers sat idle: on a 4-core
    container the checks took 20 s, the suites 21 s and the node suites 29 s,
    each set by one item, 70 s in all for 305 s of work. The suites and node
    suites go in first, since the long items are among them
    (docs/history/ci-perf-2026-11-14-icon-memo-unwired-pool.md).

    A check in COVERED_BY_TREE_TEST whose suite is in the pool waits for that
    suite: green, and the check is reported covered without a second scan;
    anything else, and the check runs after the pool."""
    groups = []
    checks, suites = unwired(), [] if checks_only else unwired_tests()
    suite_names = {Path(s).name for s in suites}
    deferred = [c for c in checks if Path(c).name in COVERED_BY_TREE_TEST
                and f"test_{Path(c).name}" in suite_names]
    if not checks_only:
        groups += [(run_node_suite, unwired_node_suites()), (run_suite, suites),
                   (run_suite, unwired_portfolio_tests())]
    groups.append((main_health.run, [c for c in checks if c not in deferred]))
    if not checks_only:
        groups.append((lambda p, *a: main_health.run(p, *a), unwired_extra()))
    work = [(runner, p if isinstance(p, tuple) else (p,)) for runner, paths in groups for p in paths]
    results = run_mixed(work, jobs=jobs)
    return sorted(results + covered_or_run(deferred, results, jobs))


def covered_or_run(deferred, results, jobs=6):
    """Results for the deferred checks: "covered" where the suite that runs the
    check on the tree came back green, a real run where it did not."""
    by_name = {name: (rc, out) for name, rc, out in results}
    out, rerun = [], []
    for c in deferred:
        name = Path(c).name
        suite = f"test_{name}"
        rc, text = by_name.get(suite, (None, ""))
        if rc == 0 and not text.startswith(SKIPPED):
            out.append((main_health.label(c), 0,
                        f"covered by {suite} ({COVERED_BY_TREE_TEST[name]} runs this check "
                        "on the tree), so not run a second time"))
        else:
            rerun.append((main_health.run, (c,)))
    return out + (run_mixed(rerun, jobs=jobs) if rerun else [])


def run_mixed(work, jobs=6):
    """[(name, rc, output)] for (runner, args) pairs run in one pool; a timeout
    gets one solo re-run with its own runner."""
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        futures = {pool.submit(runner, *args): (runner, args) for runner, args in work}
        done = [(futures[f], f.result()) for f in as_completed(futures)]
    out = []
    for (runner, args), result in done:
        out += main_health.rerun_timeouts([args], [result], runner)
    return out


def report(results):
    """The failure text for each red result, or "" when all pass."""
    return "\n".join(
        f"{main_health.status(rc)} {name} (exit {rc}; no pull-request workflow runs it, so "
        f"`{reproduce(name)}` reproduces this)\n" + "\n".join(out.splitlines()[-TAIL:])
        for name, rc, out in results if rc != 0)


# Lines of a red check's output the report keeps: enough for a unittest
# traceback's assertion line and summary, short enough to read in a CI log.
TAIL = 8


def reproduce(name):
    if name.endswith(".mjs"):
        d, _, f = name.rpartition("/")
        return f"cd {d} && node --test {f}"
    if name.startswith("portfolio/"):
        d, _, f = name.rpartition("/")
        return f"cd {d} && python3 -m pytest -q {f}"
    if name.startswith("test_"):
        return f"cd platform/ci && python3 -m unittest {name[:-3]}  (or pytest {name})"
    args = dict((n, a) for n, *a in EXTRA).get(name, [])
    return " ".join(["python3", f"platform/ci/{name}", *args])


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--list", action="store_true", help="name the unwired checks and exit")
    ap.add_argument("--checks-only", action="store_true",
                    help="only the check_*.py scripts, not the suites and EXTRA")
    args = ap.parse_args(argv)
    if args.list:
        paths, suites, extra = unwired(), unwired_tests(), unwired_extra()
        nodes = unwired_node_suites()
        folio = unwired_portfolio_tests()
        for p in paths + suites:
            print(p.name)
        for p in folio:
            print(suite_name(p))
        for p in nodes:
            print(node_name(p))
        for p, *a in extra:
            print(" ".join([p.name, *a]))
        print(f"{len(paths)} check(s) no workflow names, "
              f"{len(suites)} test suite(s) no pull-request workflow names, "
              f"{len(folio)} portfolio suite(s) no pull-request workflow runs, "
              f"{len(extra)} other check(s), "
              f"{len(nodes)} platform node suite(s) no workflow runs")
        return 0
    results = run_everything(args.checks_only)
    bad = report(results)
    if bad:
        print(bad)
    failed = sum(rc != 0 for _, rc, _ in results)
    skips = skipped(results)
    for name, why in skips:
        print(f"skip {name}: {why[len(SKIPPED):].strip()}")
    print(f"{len(results) - failed - len(skips)}/{len(results)} unwired checks and suites pass"
          + (f", {len(skips)} skipped" if skips else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
