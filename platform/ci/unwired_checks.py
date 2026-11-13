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

The same gap held for unit tests and one tree check. On 2026-11-13, 71 of the
121 `platform/ci/test_*.py` files appeared in no workflow, and the one of them
that was red, test_doc_index.py, had been red for days: `doc_index.py check`
found 43 untagged or mis-tagged reports under docs/reports/ that no PR saw
(red-team entry 2026-11-06 asked for a workflow step; that is control plane).
So the unwired tests (`python3 -m unittest <module>`, ~49 s serial, ~15 s here
in parallel) and the scripts in EXTRA run too; `--checks-only` skips them.
"""
import argparse
import re
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


def unwired_tests(here=HERE, workflows=WORKFLOWS):
    """The test_*.py files under `here` that no workflow names, by file or module."""
    text = workflow_text(workflows)
    return [p for p in sorted(here.glob("test_*.py"))
            if p.name not in text and not re.search(r"\b%s\b" % re.escape(p.stem), text)]


def unwired_extra(here=HERE, workflows=WORKFLOWS):
    """EXTRA's (path, *args) jobs whose script no workflow names."""
    text = workflow_text(workflows)
    return [(here / name, *args) for name, *args in EXTRA if name not in text]


def jobs(here=HERE, workflows=WORKFLOWS, checks_only=False):
    """Every unwired job as a (path, *args) tuple."""
    out = [(p,) for p in unwired(here, workflows)]
    if not checks_only:
        out += [(p,) for p in unwired_tests(here, workflows)] + unwired_extra(here, workflows)
    return out


def run_job(path, *args, timeout=main_health.TIMEOUT):
    """A test_*.py file runs under unittest (15 of them have no __main__ block);
    anything else runs as a script, the way main_health runs it."""
    path = Path(path)
    if not path.name.startswith("test_"):
        return main_health.run(path, *args, timeout=timeout)
    try:
        r = subprocess.run([sys.executable, "-m", "unittest", "-q", path.stem], cwd=path.parent,
                           capture_output=True, text=True, timeout=timeout)
        return path.name, r.returncode, (r.stdout + r.stderr).strip()
    except subprocess.TimeoutExpired:
        return path.name, main_health.TIMED_OUT, f"timed out after {timeout} s"


def run_all(paths, runner=run_job, jobs=6, log=print):
    """[(name, rc, output)] sorted by name; timeouts get one solo re-run. Each
    item of `paths` is a path or a (path, *args) tuple."""
    work = [p if isinstance(p, tuple) else (p,) for p in paths]
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        results = [f.result() for f in as_completed([pool.submit(runner, *j) for j in work])]
    return sorted(main_health.rerun_timeouts(work, results, runner))


def report(results):
    """The failure text for each red result, or "" when all pass."""
    return "\n".join(
        f"{main_health.status(rc)} {name} (exit {rc}; no workflow runs it, so "
        f"`{rerun_hint(name)}` reproduces this)\n" + "\n".join(out.splitlines()[-8:])
        for name, rc, out in results if rc != 0)


def rerun_hint(name):
    if name.startswith("test_"):
        return f"cd platform/ci && python3 -m unittest {name[:-3]}"
    args = dict((n, a) for n, *a in EXTRA).get(name, [])
    return " ".join(["python3", f"platform/ci/{name}", *args])


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--list", action="store_true", help="name the unwired checks and exit")
    ap.add_argument("--checks-only", action="store_true",
                    help="only the check_*.py scripts, not the unit tests and EXTRA")
    args = ap.parse_args(argv)
    work = jobs(checks_only=args.checks_only)
    if args.list:
        for j in work:
            print(" ".join([j[0].name, *j[1:]]))
        print(f"{len(work)} check(s) and test(s) no workflow names")
        return 0
    results = run_all(work)
    bad = report(results)
    if bad:
        print(bad)
    failed = sum(rc != 0 for _, rc, _ in results)
    print(f"{len(results) - failed}/{len(results)} unwired checks and tests pass")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
