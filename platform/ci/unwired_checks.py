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
"""
import argparse
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import main_health

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


def run_suite(path, timeout=main_health.TIMEOUT):
    """(name, rc, output) for one unittest module, run from its own directory
    so its `import <sibling>` lines resolve the way they do under discover."""
    path = Path(path)
    try:
        r = subprocess.run([sys.executable, "-m", "unittest", path.stem], cwd=path.parent,
                           capture_output=True, text=True, timeout=timeout)
        return path.name, r.returncode, (r.stdout + r.stderr).strip()
    except subprocess.TimeoutExpired:
        return path.name, main_health.TIMED_OUT, f"timed out after {timeout} s"


def run_all(paths, runner=main_health.run, jobs=6, log=print):
    """[(name, rc, output)] sorted by name; timeouts get one solo re-run."""
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        results = [f.result() for f in as_completed([pool.submit(runner, p) for p in paths])]
    return sorted(main_health.rerun_timeouts([(p,) for p in paths], results, runner))


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
    if name.startswith("test_"):
        return f"cd platform/ci && python3 -m unittest {name[:-3]}"
    return f"python3 platform/ci/{name}"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--list", action="store_true", help="name the unwired checks and exit")
    args = ap.parse_args(argv)
    paths, suites = unwired(), unwired_tests()
    if args.list:
        for p in paths + suites:
            print(p.name)
        print(f"{len(paths)} check(s) no workflow names, "
              f"{len(suites)} test suite(s) no pull-request workflow names")
        return 0
    results = sorted(run_all(paths) + run_all(suites, runner=run_suite))
    bad = report(results)
    if bad:
        print(bad)
    failed = sum(rc != 0 for _, rc, _ in results)
    print(f"{len(results) - failed}/{len(results)} unwired checks and suites pass")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
