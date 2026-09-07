#!/usr/bin/env python3
"""Run a GitHub Actions workflow's own commands on this machine.

Why this exists. From 2026-08-26 to 2026-09-01 no runner picked up a job in
this repository: every workflow completed in 3-6 seconds with `runner_id: 0`,
an empty check-run output and a 404 on log download (`actions-runners-
unavailable` in `portfolio/ledger/asks.yaml`). Checks therefore arrived
*red* without a single step having executed, which reads very differently
from the blank check list a `GITHUB_TOKEN` bot PR produces, and is the
easier mistake to make. `CLAUDE.md` tells a session to verify locally and
say exactly what it ran before merging, and every merge in that window did
that -- by improvising a different set of commands each time.

Runners came back on 2026-09-01, so CI is no longer the reason to run this.
Two better ones remain, and they are why it is not deprecated. A local run
is still the *fastest* way to know a diff is sound before you spend a CI
cycle on it, and PRs opened with `GITHUB_TOKEN` still trigger no Actions at
all, so for those this is the only verification there is. The account-level
ceiling also looks like it cycles rather than being gone, so the original
reason may well return.

Improvising is the problem. On 2026-08-29 `main` was failing two
`Portfolio validate` steps and had been for days, because the sessions
merging in between each ran a *subset* of that workflow, and none of the
subsets happened to include `check_ask_hosts.py`. A red `main` nobody can
see is only caught by running the same list the workflow would.

So this reads the workflow file and runs its `run:` steps in order, in
each step's `working-directory`, and reports which passed.

    python3 platform/ci/run_workflow_locally.py --for-changes
    python3 platform/ci/run_workflow_locally.py --tree
    python3 platform/ci/run_workflow_locally.py portfolio-validate.yml
    python3 platform/ci/run_workflow_locally.py --list portfolio-pages.yml

`--for-changes` and `--tree` ask different questions and the difference
matters. The first is "is my diff sound?" and on a clean checkout it
correctly reports nothing to verify. The second is "is this checkout
green?", which nothing here could answer until 2026-09-07 -- so a validator
that went red on `main` stayed red until a session improvised the list by
hand, which is the very thing the paragraph below says this tool replaced.
`score_ventures.py --check` was red across five merges that way.

Choosing the workflow is the other half. Running the right steps of the
wrong workflow verifies nothing, and `AGENTS.md` named only
`portfolio-validate.yml` -- so on 2026-08-30 a `FAQPage` whose JSON-LD did
not match its own visible copy reached `main`. The guard that catches it
(`faq-visible.test.mjs`) runs in `portfolio-pages.yml`, on any
`ventures/**` change. `--for-changes` reads the `paths:` filters and works
that out from the diff instead of asking a session to remember, then runs
the jobs that cannot write anything and names the ones it held back.

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

# A `${{ vars.X }}` in an `env:` block is the one expression this tool *can*
# evaluate honestly, because the repository state it stands for is knowable:
# an unset repository variable is the empty string, and every workflow here is
# written around that. `gitops/ci/README.md` says so outright for `CI_RUNNER`
# ("Unset, `vars.CI_RUNNER` is the empty string, which is falsy, so the
# expression falls back to `ubuntu-latest`"), and `portfolio-pages.yml`'s
# `PAGES_BASE_URL` is the same shape -- `build.mjs` reads it as
# `process.env.PAGES_BASE_URL || DEFAULT_BASE_URL`.
#
# Skipping those steps was not conservative, it was wrong twice over: it did
# not run the site build, and then "Check the built artifact" ran against a
# `dist` nothing had created and was reported as FAIL. A verification tool
# reporting a red deploy path that is actually green is the same failure mode
# SHELL above exists to prevent, one step further along.
#
# `${{ secrets.X }}` and `${{ steps.X.outputs.Y }}` keep the skip. A secret
# blanked here would run the step without the credential it exists to use, and
# a step output has no unset-state meaning at all -- the post-deploy
# `PAGE_URL` check is exactly that, and must stay skipped.
VARS_EXPRESSION = re.compile(r"\$\{\{\s*vars\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")

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
        # env: entries to add for this step. Populated only from `vars.`
        # expressions resolved to their unset value; see VARS_EXPRESSION.
        self.env = {}
        # Names of those variables, so the report can say the step ran with
        # them unset rather than leaving the reader to assume they were set.
        self.unset_vars = []

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


def collect(workflow: dict, only: set | None = None) -> tuple[list[Step], list[str]]:
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
        if only is not None and job_id not in only:
            continue
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
            raw_env = {str(k): str(v) for k, v in (raw.get("env") or {}).items()}
            # Resolve `${{ vars.X }}` to the empty string an unset repository
            # variable actually has, and record which ones. What is left after
            # that is an expression this tool genuinely cannot evaluate.
            for key, value in raw_env.items():
                resolved, hits = VARS_EXPRESSION.subn("", value)
                if hits:
                    step.env[key] = resolved
                    step.unset_vars.extend(
                        m.group(1) for m in VARS_EXPRESSION.finditer(value))
            env_text = " ".join(step.env.get(k, v) for k, v in raw_env.items())
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


# --- Choosing which workflows to run -------------------------------------
#
# Running the right *steps* of a workflow is only half of standing in for a
# dead CI; the other half is knowing which workflows would have run at all.
# `AGENTS.md` names `portfolio-validate.yml` and nothing else, so a session
# changing a venture page verifies that one and stops -- but the guard that
# would have caught it often lives elsewhere. On 2026-08-30 a `FAQPage`
# whose JSON-LD did not match its own visible copy reached `main` that way:
# `faq-visible.test.mjs` catches it, `portfolio-pages.yml` runs it on any
# `ventures/**` change, and no session ran that workflow.
#
# The workflow files already say which paths they answer to. This reads them
# instead of asking a session to remember.


def triggers(workflow: dict) -> list[dict]:
    """The `push` and `pull_request` trigger blocks, if any.

    YAML 1.1 resolves a bare `on` key to the boolean `True`, so a workflow's
    trigger block arrives under `True` rather than `"on"` -- reading only
    `"on"` finds nothing and would silently select no workflows at all.
    """
    on = workflow.get("on", workflow.get(True)) or {}
    if not isinstance(on, dict):
        # `on: push` or `on: [push, pull_request]` -- no path filter, so the
        # workflow answers to every change.
        names = [on] if isinstance(on, str) else list(on or [])
        return [{} for n in names if n in ("push", "pull_request")]
    return [on[key] or {} for key in ("push", "pull_request") if key in on]


def glob_to_regex(pattern: str) -> re.Pattern:
    """A GitHub path-filter glob as a regex matching a repo-relative path.

    `**` crosses directory separators, `*` and `?` do not -- the distinction
    that makes `ventures/*` and `ventures/**` different filters.
    """
    out, i = [], 0
    while i < len(pattern):
        char = pattern[i]
        if pattern.startswith("**", i):
            out.append(".*")
            i += 2
        elif char == "*":
            out.append("[^/]*")
            i += 1
        elif char == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(char))
            i += 1
    return re.compile("".join(out) + r"\Z")


def _any_match(patterns, paths) -> bool:
    globs = [glob_to_regex(p) for p in patterns]
    return any(glob.match(path) for glob in globs for path in paths)


def selects(workflow: dict, changed: list[str]) -> bool:
    """Would a push or pull_request touching `changed` start this workflow?

    Mirrors the filter Actions applies: with `paths`, at least one changed
    file must match; with `paths-ignore`, at least one must *not* match; with
    neither, any change starts it.
    """
    for block in triggers(workflow):
        include = block.get("paths")
        exclude = block.get("paths-ignore")
        if include and not _any_match(include, changed):
            continue
        if exclude:
            ignored = [glob_to_regex(p) for p in exclude]
            if all(any(g.match(path) for g in ignored) for path in changed):
                continue
        return True
    return False


def _grants_write(node) -> bool:
    """True when a `permissions:` block hands out anything but read."""
    perms = (node or {}).get("permissions")
    if perms is None:
        # Absent means "inherit the repository default", which on this
        # repository's own settings may well be read/write. Every one of the
        # 218 workflows here declares a block (the agent-permission-harness
        # requires it), so an absent one is unusual enough to hold back.
        return True
    if isinstance(perms, str):
        return perms != "read-all"
    return any(value == "write" for value in perms.values())


def _mentions_secret(node) -> bool:
    return "secrets." in yaml.safe_dump(node, default_flow_style=False)


def read_only_jobs(workflow: dict) -> tuple[set, list[tuple[str, str]]]:
    """Split a workflow's jobs into those safe to run here, and why not.

    The gate is what a job is *allowed* to do, not what its commands look
    like. `branch-cleanup.yml` is why: it deletes refs from inside
    `branch_cleanup.py`, so every shell command in it is an innocent
    `python3 ...` and the mutation screen passes it clean. What it cannot
    hide is the capability -- deleting a remote ref needs `contents: write`
    and a token, and both are declared in the file.

    Per job rather than per workflow, because the two usually sit in one
    file. `portfolio-pages.yml` is the case that matters: its `build` job is
    six read-only verification steps, including the FAQPage guard, and its
    `deploy` job holds `pages: write`. Judging the file as a whole would hold
    back the very steps this tool exists to run.

    `VERIFICATION_ONLY` stays the gate for a workflow named on the command
    line, where a session chose it deliberately. This is for selection by
    changed paths, which chooses on the session's behalf.
    """
    allowed, held = set(), []
    # A top-level secret or write grant reaches every job in the file.
    outer = {k: v for k, v in workflow.items() if k not in ("jobs",)}
    workflow_wide = None
    if _grants_write(workflow):
        workflow_wide = ("grants write at the workflow level"
                         if workflow.get("permissions") is not None
                         else "declares no permissions block, so it inherits "
                              "the repository default")
    elif _mentions_secret(outer):
        workflow_wide = "reads a secret at the workflow level"

    for job_id, job in (workflow.get("jobs") or {}).items():
        job = job or {}
        if workflow_wide:
            held.append((job_id, workflow_wide))
            continue
        # A job without its own block inherits the workflow's, checked above;
        # only a job that declares one can widen it.
        if job.get("permissions") is not None and _grants_write(job):
            held.append((job_id, "grants write"))
            continue
        if _mentions_secret(job):
            held.append((job_id, "reads a secret"))
            continue
        steps, _ = collect(workflow, only={job_id})
        if not steps:
            held.append((job_id, "has no run: steps to verify"))
            continue
        tripped = next((screen(s) for s in steps if screen(s)), None)
        if tripped:
            held.append((job_id, f"has a step that would {tripped}"))
            continue
        allowed.add(job_id)
    return allowed, held


def changed_paths(base: str) -> list[str]:
    """Repo-relative paths differing from `base`, uncommitted work included.

    Deliberately a working-tree diff rather than `base...HEAD`: the session
    that most needs this is about to commit, and the files it is verifying
    are the ones it has not committed yet.
    """
    done = subprocess.run(
        ["git", "diff", "--name-only", base],
        cwd=REPO, capture_output=True, text=True,
    )
    if done.returncode != 0:
        raise SystemExit(f"run_workflow_locally: git diff against {base} failed:\n"
                         f"{done.stderr.strip()}")
    return [line for line in done.stdout.splitlines() if line.strip()]


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

    # A resolved `vars.` entry must win over anything of the same name already
    # in this shell's environment: the point is to reproduce the repository's
    # unset state, and inheriting a developer's stray export would verify a
    # configuration CI does not have.
    env = {**os.environ, **step.env} if step.env else None

    start = time.monotonic()
    try:
        done = subprocess.run(
            step.run, shell=True, cwd=cwd, capture_output=True,
            text=True, timeout=timeout, executable=SHELL, env=env,
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
    # Never silent: a step that ran with a repository variable resolved to its
    # unset value verified the unset configuration, which is what CI has today
    # but not necessarily what it will have after an owner sets one.
    for step in steps:
        if step.unset_vars and step.status in ("ok", "failed"):
            print(f"UNSET   {step.label}: ran with "
                  + ", ".join(f"vars.{v}" for v in sorted(set(step.unset_vars)))
                  + " empty, as an unset repository variable is")
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


def pick_workflows(wanted) -> tuple[list, list]:
    """Every workflow `wanted` accepts, split into runnable jobs and held ones.

    `wanted(name, workflow) -> bool` is the only difference between selecting
    by diff and sweeping the whole tree, so it is the only thing the two
    callers below supply. Keeping one selector means a workflow that becomes
    invisible to one mode cannot stay visible to the other.
    """
    selected, held = [], []
    for name in sorted(os.listdir(WORKFLOWS)):
        if not name.endswith((".yml", ".yaml")):
            continue
        try:
            workflow = load_workflow(os.path.join(WORKFLOWS, name))
        except yaml.YAMLError:
            # An unparseable workflow is `validate_workflows.py`'s finding to
            # report, not this tool's to fail on.
            continue
        if not isinstance(workflow, dict) or not wanted(name, workflow):
            continue
        allowed, blocked = read_only_jobs(workflow)
        held.extend((name, job_id, why) for job_id, why in blocked)
        if allowed:
            selected.append((name, workflow, allowed))
    return selected, held


def run_tree(args) -> int:
    """Run every verification-only workflow against the tree as it stands.

    `--for-changes` answers "is my diff sound?", and on a clean checkout of
    `main` it correctly answers "nothing to verify" -- which is why nothing
    in this repository could answer the *other* question, "is `main` itself
    green?", without a session improvising the list by hand. That is the
    same improvising the module docstring above says this tool exists to
    replace; it had simply been left in place for one caller.

    It is not hypothetical. `portfolio/scoring/score_ventures.py --check`
    went red on `main` when #3615 merged a venture without a score row, and
    stayed red across four further merges, because Actions has been starved
    since 2026-09-04 (`ci_starvation.py --run 34089278449`: `runner_id: 0`)
    and no local run asks this question. The same shape as 2026-08-29's two
    red steps and 2026-09-07's `validate_doc_consistency.py`, all three
    caught late by a session that happened to look.

    Selection is `VERIFICATION_ONLY` rather than "every workflow": a sweep
    is the mode most likely to be run unattended, so widening it to the
    whole directory is exactly where a deploying or branch-deleting step
    would arrive unnoticed. `read_only_jobs` still screens what is left.
    """
    selected, held = pick_workflows(lambda name, _wf: name in VERIFICATION_ONLY)
    missing = sorted(VERIFICATION_ONLY - {name for name, *_ in selected}
                     - {name for name, *_ in held})
    print(f"Whole-tree sweep: {len(selected)} verification-only workflow(s) "
          "selected, regardless of the diff.")
    for name in missing:
        print(f"  [absent] {name}: named in VERIFICATION_ONLY but not in "
              f"{os.path.relpath(WORKFLOWS, REPO)}")
    return _run_selected(args, selected, held, absent=missing)


def run_for_changes(args) -> int:
    """Select workflows by the current diff, then run the read-only ones."""
    changed = changed_paths(args.for_changes)
    if not changed:
        print(f"No files differ from {args.for_changes}; nothing to verify.")
        print("  That answers 'is my diff sound?'. To ask whether the tree "
              "itself is green, run --tree.")
        return 0

    selected, held = pick_workflows(lambda _n, wf: selects(wf, changed))

    workflows = {name for name, *_ in selected} | {name for name, *_ in held}
    print(f"{len(changed)} changed file(s) against {args.for_changes} select "
          f"{len(workflows)} workflow(s).")
    return _run_selected(args, selected, held)


def _run_selected(args, selected, held, absent=()) -> int:
    """Execute the chosen workflows' read-only steps and report."""
    for name, job_id, why in held:
        print(f"  [held  ] {name} / {job_id}: {why}; run it by name with "
              "--force if you have read it")
    if args.list:
        for name, _, allowed in selected:
            print(f"  [run   ] {name} ({', '.join(sorted(allowed))})")
        return 0

    failures = []
    for name, workflow, allowed in selected:
        steps, uses_skipped = collect(workflow, only=allowed)
        print(f"\nRunning {name} locally "
              f"({len(steps)} run: step(s), {len(uses_skipped)} uses: step(s) skipped)")
        for step in steps:
            execute(step, args.timeout)
            mark = {"ok": "ok", "failed": "FAIL", "skipped": "skip",
                    "refused": "refuse", "setup-failed": "setup"}[step.status]
            print(f"  [{mark:6}] {step.label} ({step.seconds:.1f}s)")
        if report(name, steps, uses_skipped, False) != 0:
            failures.append(name)

    print(f"\n{len(selected) - len(failures)}/{len(selected)} selected "
          f"workflow(s) passed.")
    if held:
        print("  Not a clean sweep: " + ", ".join(
            f"{name}/{job_id}" for name, job_id, _ in held)
            + " were selected and not run. Say so in the pull request.")
    # An empty selection must never read as a pass. A sweep that matched no
    # workflow at all verified nothing, which is the outcome this repository
    # is worst at noticing -- the same reason `report()` above fails on a run
    # with no executed steps.
    if not selected:
        print("  Nothing was selected, so nothing was verified.")
        return 1
    if absent:
        print("  Not a clean sweep: " + ", ".join(absent)
              + " named in VERIFICATION_ONLY but absent from the tree.")
        return 1
    return 1 if failures else 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("workflow", nargs="?",
                    help="file name under .github/workflows/")
    ap.add_argument("--for-changes", metavar="BASE", nargs="?", const="origin/main",
                    help="run every workflow the current diff against BASE "
                         "would start (default base origin/main)")
    ap.add_argument("--tree", action="store_true",
                    help="run every verification-only workflow against the "
                         "tree as it stands, ignoring the diff -- answers "
                         "'is this checkout green?' where --for-changes "
                         "answers 'is my diff sound?'")
    ap.add_argument("--list", action="store_true",
                    help="print the steps that would run, and run nothing")
    ap.add_argument("--force", action="store_true",
                    help="allow a workflow that is not verification-only")
    ap.add_argument("--timeout", type=int, default=900,
                    help="per-step timeout in seconds (default 900)")
    args = ap.parse_args(argv)

    if args.tree:
        if args.workflow or args.for_changes:
            print("pass --tree on its own, not with a workflow name or "
                  "--for-changes", file=sys.stderr)
            return 2
        return run_tree(args)

    if args.for_changes:
        if args.workflow:
            print("pass a workflow name or --for-changes, not both", file=sys.stderr)
            return 2
        return run_for_changes(args)

    if not args.workflow:
        print("name a workflow, --for-changes to select by diff, or --tree "
              "to sweep the whole checkout", file=sys.stderr)
        return 2

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
