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
"""
import argparse
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


def run_all(paths, runner=main_health.run, jobs=6, log=print):
    """[(name, rc, output)] sorted by name; timeouts get one solo re-run."""
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        results = [f.result() for f in as_completed([pool.submit(runner, p) for p in paths])]
    return sorted(main_health.rerun_timeouts([(p,) for p in paths], results, runner))


def report(results):
    """The failure text for each red result, or "" when all pass."""
    return "\n".join(
        f"{main_health.status(rc)} {name} (exit {rc}; no workflow runs it, so "
        f"`python3 platform/ci/{name}` reproduces this)\n" + "\n".join(out.splitlines()[-8:])
        for name, rc, out in results if rc != 0)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--list", action="store_true", help="name the unwired checks and exit")
    args = ap.parse_args(argv)
    paths = unwired()
    if args.list:
        for p in paths:
            print(p.name)
        print(f"{len(paths)} check(s) no workflow names")
        return 0
    results = run_all(paths)
    bad = report(results)
    if bad:
        print(bad)
    failed = sum(rc != 0 for _, rc, _ in results)
    print(f"{len(results) - failed}/{len(results)} unwired checks pass")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
