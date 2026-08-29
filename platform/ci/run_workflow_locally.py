#!/usr/bin/env python3
"""Run a GitHub Actions workflow's own commands on this machine.

Why this exists. Since 2026-08-26 no runner has picked up a job in this
repository: every workflow completes in 3-6 seconds with `runner_id: 0`,
an empty check-run output and a 404 on log download (`actions-runners-
unavailable` in `portfolio/ledger/asks.yaml`). Checks therefore arrive
*red* without a single step having executed, which reads very differently
from the blank check list a `GITHUB_TOKEN` bot PR produces, and is the
easier mistake to make. `CLAUDE.md` tells a session to verify locally and
say exactly what it ran before merging, and every merge in this window has
been doing that -- by improvising a different set of commands each time.

Improvising is the problem. On 2026-08-29 `main` was failing two
`Portfolio validate` steps and had been for days, because the sessions
merging in between each ran a *subset* of that workflow, and none of the
subsets happened to include `check_ask_hosts.py`. A red `main` nobody can
see is only caught by running the same list the workflow would.

So this reads the workflow file and runs its `run:` steps in order, in
each step's `working-directory`, and reports which passed.

    python3 platform/ci/run_workflow_locally.py portfolio-validate.yml
    python3 platform/ci/run_workflow_locally.py --list portfolio-pages.yml

What it does not do. It is not a GitHub Actions emulator and does not try
to be one:

  * `uses:` steps are skipped and named in the report. Those are
    `actions/checkout`, `actions/setup-python` and friends -- environment
    setup a local checkout already has. If a workflow's real work happens
    inside a `uses:` step, this tool cannot verify it and says so rather
    than reporting a pass.
  * `${{ }}` expressions are not evaluated. A step whose command contains
    one is skipped and named, because running it with the literal text
    would either fail confusingly or, worse, succeed against the wrong
    thing.
  * Matrices, `if:` conditions, services and containers are ignored.

Safety. Workflow steps are not all verification: this repository also has
workflows that delete branches and could grow ones that deploy. A local
run must never be the thing that pushes. Steps are screened against
`MUTATING` below and refused, and a workflow not in `VERIFICATION_ONLY`
needs `--force` before anything runs at all. Neither check is a security
boundary -- it is a guard against an obvious accident, and the refusal
names what tripped it so a real verification step is not silently dropped.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import time

try:
    import yaml
except ImportError:  # pragma: no cover - CI installs it
    print("run_workflow_locally: pyyaml not installed", file=sys.stderr)
    raise SystemExit(2)

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
WORKFLOWS = os.path.join(REPO, ".github", "workflows")

# Workflows whose steps only read and assert. Anything else needs --force.
VERIFICATION_ONLY = {
    "portfolio-validate.yml",
    "portfolio-pages.yml",
    "agent-permission-harness-ci.yml",
    "conflict-markers-ci.yml",
    "duplicate-symbols-ci.yml",
}

# Commands that change something outside this working tree. A verification
# run has no business doing any of them, and the one workflow in this repo
# that legitimately does (branch-cleanup.yml) is exactly what this catches.
MUTATING = [
    (re.compile(r"\bgit\s+push\b"), "git push"),
    (re.compile(r"\bgit\s+push\b.*--force|\bgit\s+push\s+-f\b"), "force push"),
    (re.compile(r"\bgh\s+pr\s+(merge|close|create)\b"), "gh pr write"),
    (re.compile(r"\bgh\s+(release|repo)\s+(create|delete|edit)\b"), "gh write"),
    (re.compile(r"\bgh\s+api\b.*-X\s*(POST|PUT|PATCH|DELETE)"), "gh api write"),
    (re.compile(r"\bgit\s+(branch|push)\s+.*(-D|--delete|:refs/)"), "branch delete"),
    (re.compile(r"\bkubectl\s+(apply|delete|patch|rollout)\b"), "kubectl write"),
    (re.compile(r"\b(tofu|terraform)\s+(apply|destroy)\b"), "infra apply"),
    (re.compile(r"\bnpm\s+publish\b"), "npm publish"),
    (re.compile(r"\bdocker\s+push\b"), "docker push"),
    (re.compile(r"\brm\s+-rf\s+/(?!tmp)"), "rm -rf outside /tmp"),
]

EXPRESSION = re.compile(r"\$\{\{")

# GitHub Actions runs a Linux `run:` step under bash, and workflows here rely
# on that: `portfolio-pages.yml` opens a step with `set -euo pipefail`, which
# is a syntax error in dash. Python's `shell=True` is `/bin/sh`, so without
# this the tool reports a false failure on any step using a bash-ism -- the
# one thing a verification tool must never do, since the reader's next move
# is to "fix" working code.
SHELL = "/bin/bash"

# Dependency installs. A fresh runner starts empty and these succeed; a
# developer machine or a sandbox often already has the packages, from a
# different installer, and the step fails on that rather than on anything
# in the repository -- `pip install pyyaml` cannot replace a PyYAML that
# Debian's apt owns, and reports an error doing it.
#
# Reporting that as a workflow failure trains a reader to ignore the
# result, which is worse than not running it. It is also not needed as a
# signal: if a dependency really is missing, the step that imports it
# fails on its own, with a message that names the import. So a failing
# install is reported as setup that did not complete, and the verdict is
# left to the steps that use it.
SETUP = re.compile(
    r"^\s*(pip3?\s+install|python3?\s+-m\s+pip\s+install|npm\s+(ci|install)"
    r"|apt-get\s+install|sudo\s+apt-get)\b")


class Step:
    """One `run:` step, with where and how it should be executed."""

    def __init__(self, job, name, run, workdir):
        self.job = job
        self.name = name
        self.run = run
        self.workdir = workdir
        self.status = "pending"   # ok | failed | skipped | refused
        self.reason = ""
        self.seconds = 0.0
        self.tail = []

    @property
    def label(self):
        return f"{self.job} / {self.name}"


def load_workflow(path: str) -> dict:
    with open(path) as fh:
        return yaml.safe_load(fh)


def _default_dir(node, inherited: str) -> str:
    """`defaults.run.working-directory` off a workflow or a job, or inherited."""
    run = ((node or {}).get("defaults") or {}).get("run") or {}
    return run.get("working-directory", inherited)


def collect(workflow: dict) -> tuple[list[Step], list[str]]:
    """Every `run:` step in file order, plus a note for each skipped step.

    Returned separately because a skipped step is not a passing step, and a
    report that quietly omits them would overstate what was verified.
    """
    steps: list[Step] = []
    skipped: list[str] = []
    # Precedence, as Actions applies it: step > job defaults > workflow
    # defaults. Missing the workflow level is not a cosmetic bug -- it runs
    # every step one or more directories too high, where a relative path
    # either fails loudly (`can't open file 'harness.py'`) or, worse, quietly
    # succeeds against the wrong thing: `unittest discover` finds a different
    # set of tests from the repository root and reports them green.
    top_dir = _default_dir(workflow, ".")
    for job_id, job in (workflow.get("jobs") or {}).items():
        job_dir = _default_dir(job, top_dir)
        for raw in job.get("steps") or []:
            name = raw.get("name") or raw.get("uses") or "(unnamed)"
            if "run" not in raw:
                skipped.append(f"{job_id} / {name}: uses: step, not run:")
                continue
            command = raw["run"].strip()
            workdir = raw.get("working-directory", job_dir)
            step = Step(job_id, name, command, workdir)
            # A step can carry the expression in its `env:` rather than in the
            # command. `portfolio-pages.yml`'s post-deploy check is the case:
            # the command is plain bash, but `PAGE_URL` comes from the
            # deploy-pages action's output, so locally it runs with the
            # variable unset and dies on `set -u`. That is not a repository
            # failure -- it is a step that cannot mean anything until a real
            # deploy has happened -- so it is skipped and named, like any
            # other step this tool cannot honestly evaluate.
            env_text = " ".join(str(v) for v in (raw.get("env") or {}).values())
            if (EXPRESSION.search(command) or EXPRESSION.search(str(workdir))
                    or EXPRESSION.search(env_text)):
                step.status = "skipped"
                step.reason = "contains a ${{ }} expression this cannot evaluate"
            steps.append(step)
    return steps, skipped


def screen(step: Step) -> str | None:
    for pattern, what in MUTATING:
        if pattern.search(step.run):
            return what
    return None


def execute(step: Step, timeout: int) -> None:
    if step.status == "skipped":
        return
    mutation = screen(step)
    if mutation:
        step.status = "refused"
        step.reason = f"looks like it would {mutation}"
        return

    cwd = os.path.join(REPO, step.workdir) if step.workdir != "." else REPO
    if not os.path.isdir(cwd):
        step.status = "failed"
        step.reason = f"working-directory {step.workdir} does not exist"
        return

    start = time.monotonic()
    try:
        done = subprocess.run(
            step.run, shell=True, cwd=cwd, capture_output=True,
            text=True, timeout=timeout, executable=SHELL,
        )
    except subprocess.TimeoutExpired:
        step.status = "failed"
        step.reason = f"timed out after {timeout}s"
        step.seconds = time.monotonic() - start
        return
    step.seconds = time.monotonic() - start
    output = (done.stdout + done.stderr).strip().splitlines()
    step.tail = output[-12:]
    if done.returncode == 0:
        step.status = "ok"
    elif SETUP.match(step.run):
        step.status = "setup-failed"
        step.reason = (f"exit {done.returncode} installing dependencies; "
                       "the steps that need them will say so")
    else:
        step.status = "failed"
        step.reason = f"exit {done.returncode}"


def report(name, steps, uses_skipped, forced) -> int:
    ran = [s for s in steps if s.status in ("ok", "failed")]
    failed = [s for s in steps if s.status == "failed"]
    skipped = [s for s in steps if s.status == "skipped"]
    refused = [s for s in steps if s.status == "refused"]
    setup_failed = [s for s in steps if s.status == "setup-failed"]

    print()
    for step in failed:
        print(f"FAILED  {step.label}  ({step.reason})")
        print(f"        $ {step.run.splitlines()[0]}")
        for line in step.tail:
            print(f"        {line}")
        print()

    for step in setup_failed:
        print(f"SETUP   {step.label}: {step.reason}")
    for step in skipped + refused:
        print(f"SKIPPED {step.label}: {step.reason}")
    for note in uses_skipped:
        print(f"SKIPPED {note}")
    if skipped or refused or uses_skipped or setup_failed:
        print()

    total = len(ran)
    not_run = len(skipped) + len(refused) + len(uses_skipped) + len(setup_failed)
    print(f"{name}: {total - len(failed)}/{total} run: step(s) passed"
          + (f", {len(failed)} failed" if failed else "")
          + f" ({not_run} not run)")

    if failed:
        return 1
    if not total:
        print("  Nothing was executed, so nothing was verified.")
        return 1
    if skipped or refused or uses_skipped or setup_failed:
        print("  Not a green check: the steps listed above did not run. Say so\n"
              "  in the pull request rather than reporting the workflow passed.")
    if forced:
        print("  Ran with --force; this workflow is not on the "
              "verification-only list.")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("workflow", help="file name under .github/workflows/")
    ap.add_argument("--list", action="store_true",
                    help="print the steps that would run, and run nothing")
    ap.add_argument("--force", action="store_true",
                    help="allow a workflow that is not verification-only")
    ap.add_argument("--timeout", type=int, default=900,
                    help="per-step timeout in seconds (default 900)")
    args = ap.parse_args(argv)

    name = os.path.basename(args.workflow)
    path = os.path.join(WORKFLOWS, name)
    if not os.path.isfile(path):
        print(f"no such workflow: .github/workflows/{name}", file=sys.stderr)
        return 2

    if name not in VERIFICATION_ONLY and not args.force:
        print(f"{name} is not on the verification-only list, so its steps are\n"
              "not assumed to be read-only. Re-run with --force if you have "
              "read them.", file=sys.stderr)
        return 2

    steps, uses_skipped = collect(load_workflow(path))

    if args.list:
        for step in steps:
            mark = "skip" if step.status == "skipped" else (
                "refuse" if screen(step) else "run")
            first = step.run.splitlines()[0]
            print(f"  [{mark:6}] {step.label}\n           $ {first}")
        for note in uses_skipped:
            print(f"  [skip  ] {note}")
        return 0

    print(f"Running {name} locally "
          f"({len(steps)} run: step(s), {len(uses_skipped)} uses: step(s) skipped)")
    for step in steps:
        execute(step, args.timeout)
        mark = {"ok": "ok", "failed": "FAIL", "skipped": "skip",
                "refused": "refuse", "setup-failed": "setup"}[step.status]
        print(f"  [{mark:6}] {step.label} ({step.seconds:.1f}s)")

    return report(name, steps, uses_skipped, args.force)


if __name__ == "__main__":
    raise SystemExit(main())
