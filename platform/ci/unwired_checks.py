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
NODE_SLOW names the ones too slow for every pull request.
"""
import argparse
import glob
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


SKIPPED = "SKIP:"


def has_module(name, python=sys.executable):
    return subprocess.run([python, "-c", f"import {name}"], capture_output=True).returncode == 0


def missing_module(out, here=HERE):
    """The third-party module a run failed to import, or None. A module the
    repository holds (a sibling .py file) is a real break, not a missing package."""
    m = re.search(r"ModuleNotFoundError: No module named '([\w.]+)'", out)
    if not m:
        return None
    top = m.group(1).split(".")[0]
    return None if (here / f"{top}.py").exists() or (here / top).is_dir() else top


def run_suite(path, timeout=main_health.TIMEOUT):
    """(name, rc, output) for one test module, run from its own directory so its
    `import <sibling>` lines resolve the way they do under discover. unittest
    for a TestCase module, pytest for plain test functions; a missing pytest or
    third-party package is a SKIPPED result with rc 0."""
    path = Path(path)
    plain = "TestCase" not in path.read_text(encoding="utf-8", errors="replace")
    if plain and not has_module("pytest"):
        return path.name, 0, f"{SKIPPED} pytest-style suite and no pytest here"
    cmd = ["-m", "pytest", "-q", "-p", "no:cacheprovider", path.name] if plain \
        else ["-m", "unittest", path.stem]
    try:
        r = subprocess.run([sys.executable, *cmd], cwd=path.parent,
                           capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return path.name, main_health.TIMED_OUT, f"timed out after {timeout} s"
    out = (r.stdout + r.stderr).strip()
    if r.returncode != 0 and (mod := missing_module(out, path.parent)):
        return path.name, 0, f"{SKIPPED} needs {mod}, not installed here"
    return path.name, r.returncode, out


def skipped(results):
    return [(n, out) for n, rc, out in results if rc == 0 and out.startswith(SKIPPED)]


# Node suites under platform/ that no workflow runs (2026-11-14). Every
# `platform/ci` suite above was covered, but 35 `*.test.mjs` suites elsewhere in
# platform/ ran nowhere: platform/proposal/term-ids.test.mjs had been red on main
# since PR #15774 wrapped localStorage, and platform/devlog's suite let half of
# a red-team campaign's mutants through unseen. Coverage counts any workflow,
# not only pull-request ones: the platform/pages suites gate every deploy, so a
# red one shows within hours, while a suite no workflow names is never run.
ROOT = HERE.parents[1]
NODE_TIMEOUT = 120
# Suites too slow for every pull request: named skips, never passes.
NODE_SLOW = {
    "platform/distribution/ios.test.mjs": "its catalogue-wide plan test takes over 120 s",
}

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


def unwired_node_suites(root=ROOT, workflows=WORKFLOWS):
    """platform/**/*.test.mjs (outside node_modules) that no workflow runs."""
    ran = set()
    for p in sorted(workflows.glob("*.y*ml")):
        ran |= node_tests_run(p.read_text(encoding="utf-8", errors="replace"), root)
    return [p for p in sorted((root / "platform").rglob("*.test.mjs"))
            if "node_modules" not in p.parts and p.resolve() not in ran]


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
    return name, r.returncode, (r.stdout + r.stderr).strip()


def unwired_extra(here=HERE, workflows=WORKFLOWS):
    """EXTRA's (path, *args) jobs whose script no workflow names."""
    text = workflow_text(workflows)
    return [(here / name, *args) for name, *args in EXTRA if name not in text]


def run_everything(checks_only=False):
    """Checks, then (unless checks_only) suites and EXTRA: one sorted result list."""
    results = run_all(unwired())
    if not checks_only:
        results += run_all(unwired_tests(), runner=run_suite)
        results += run_all(unwired_node_suites(), runner=run_node_suite)
        results += run_all(unwired_extra(), runner=lambda p, *a: main_health.run(p, *a))
    return sorted(results)


def run_all(paths, runner=main_health.run, jobs=6, log=print):
    """[(name, rc, output)] sorted by name; timeouts get one solo re-run. An
    item of `paths` is a path or a (path, *args) tuple."""
    work = [p if isinstance(p, tuple) else (p,) for p in paths]
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        results = [f.result() for f in as_completed([pool.submit(runner, *j) for j in work])]
    return sorted(main_health.rerun_timeouts(work, results, runner))


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
    if name.endswith(".test.mjs"):
        d, _, f = name.rpartition("/")
        return f"cd {d} && node --test {f}"
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
        for p in paths + suites:
            print(p.name)
        for p in nodes:
            print(node_name(p))
        for p, *a in extra:
            print(" ".join([p.name, *a]))
        print(f"{len(paths)} check(s) no workflow names, "
              f"{len(suites)} test suite(s) no pull-request workflow names, "
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
