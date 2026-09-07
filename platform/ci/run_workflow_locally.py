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
    # Added 2026-09-07 with the workflow itself. `--tree` is the mode that
    # answers "is `main` green right now?", and a gate that only runs when a
    # diff selects it cannot answer that -- which is the same "correct,
    # current, and shouting into an empty room" shape CLAUDE.md records
    # against `validate_doc_consistency.py` and `score_ventures.py --check`.
    # It reads the venture tree and asserts a count; it writes nothing.
    "sibling-links-ci.yml",
    # Added 2026-09-07 with the workflow itself, and `--tree` is the whole
    # point of it: the question "is the live site serving what `main`
    # contains?" is a question about the tree, not about a diff, and while
    # Actions is starved no runner asks it at all. It reads the repository
    # object and a compare over the API and writes nothing -- in particular it
    # never publishes, which is why it is a check and not a fixer.
    "pages-freshness-ci.yml",
    # Added 2026-09-07, and unlike the two above these were NOT added with the
    # workflow that needed them -- they had been outside this set since they
    # were written. Both sweep the whole catalogue (754 and 807 pages) and both
    # write nothing: `contents: read`, no secrets, checkout plus `node --test`
    # plus a read-only sweep. They are the same shape as `sibling-links-ci.yml`
    # above and belong here for the same reason.
    #
    # Measured, which is why they are here now. PR #3895 added a visible link
    # to twelve product pages. All 25 of its checks came back red, every one
    # classified `runner_id: 0` by `ci_starvation.py` -- so `link-contrast` and
    # `page-integrity` never ran on a runner, and `--tree` did not run them
    # either, because of this list. A change that adds twelve `<a>` elements is
    # precisely what those two guards exist to check, and nothing at all
    # checked them. Run by hand afterwards they were green (no link contrast
    # violation over 659 link colours; 807 pages sound), so this cost nothing
    # that day -- but "we got away with it" is not the same as "it was
    # verified", and CLAUDE.md already records the day `contrast.mjs` first ran
    # and found 48 critical `label` violations that had been live for the whole
    # life of the catalogue.
    #
    # This is the `checklist_coverage.py` lesson one level up: that tool fails
    # when a new *test directory* outruns CLAUDE.md's list, and nothing plays
    # the same role for this list. A whole-catalogue guard can still be written
    # tomorrow, left out of here, and go unrun for as long as Actions stays
    # starved.
    "link-contrast-ci.yml",
    "page-integrity-ci.yml",
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

# How each step status prints in the live progress line. One definition rather
# than one per call site: it was two, and the second was not updated when
# `unrun` was added on 2026-09-07, so running a single workflow by name -- the
# documented way to check one thing -- died with `KeyError: 'unrun'` the first
# time a step hit that status. Found 2026-09-07 by the first workflow here
# whose step can legitimately be `unrun` on a developer's machine. Same
# restate-instead-of-import defect CLAUDE.md records twice against the
# front-door mirror, in eleven lines of dictionary literal.
STATUS_MARK = {
    "ok": "ok",
    "failed": "FAIL",
    "skipped": "skip",
    "refused": "refuse",
    "setup-failed": "setup",
    "unrun": "UNRUN",
}

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

# `${{ secrets.GITHUB_TOKEN }}` is the one exception to the paragraph above,
# added 2026-09-07 with `pages-freshness-ci.yml`, and it is an exception on a
# narrow and checkable ground: it is not an owner-held secret. Actions mints it
# per run, and every session here already holds the same thing in `GH_TOKEN` --
# so unlike `secrets.HETZNERSSHKEY`, this one has a real local equivalent that
# can be substituted rather than blanked.
#
# Blanking it would still be wrong, for exactly the reason the block above
# gives, so this does not blank. It substitutes the ambient token when there is
# one, and when there is not it leaves the variable empty and lets the step
# fail on its own terms -- which `CREDENTIAL_MISSING` then classifies as
# `unrun` rather than as a red `main`. Both outcomes are honest; neither
# reports a check as passed that did not run.
#
# It stays keyed to this one literal name. Any other `secrets.X` keeps the
# skip: substituting a value this tool cannot know would run the step against
# the wrong credential, which is worse than not running it.
GITHUB_TOKEN_EXPRESSION = re.compile(r"\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}")


def ambient_github_token() -> str:
    """The repository token this environment already holds, or "".

    Read in the same order `platform/ci/pages_state.py` and
    `platform/ci/ci_starvation.py` read it, so a workflow step verified here
    sees exactly what those tools would see if run by hand.
    """
    return os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""

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

# The other half of that reasoning, and the half this tool was missing until
# 2026-09-07. The comment above says a real missing dependency "fails on its
# own, with a message that names the import" -- true, and the report then
# rendered that failure identically to an assertion failure in the repository.
# So the install step was carefully exempted from the verdict and the five
# steps downstream of it were not.
#
# Measured the day this was added, twice on the same clean checkout of `main`
# minutes apart, with nothing between the runs but `pip install pytest`:
#
#     portfolio-validate.yml: 55/60 run: step(s) passed, 5 failed
#     portfolio-validate.yml: 60/60 run: step(s) passed
#
# Every one of the five said `No module named pytest`. `main` was green both
# times. A session running the first reads "`main` is red on five steps" --
# which is the exact question `--tree` was added to answer, answered wrong,
# in the environment (a web session, where the image ships Python without
# pytest) where sessions here actually run. CLAUDE.md warns about this in
# prose; this file's own history says a reminder competes with everything
# else in a long file and an exit code does not.
#
# A step that could not find its interpreter, module, or binary did not run
# the check it exists to make. That is not a pass and not a failure: it is
# the same "did not run" class as a skipped step, and it is reported that
# way -- named, counted as not run, and never left reading as green.
TOOLCHAIN_MISSING = (
    re.compile(r"No module named '?([\w.]+)'?"),          # python -m / import
    re.compile(r"Cannot find module '([^']+)'"),          # node require
    re.compile(r"Error \[ERR_MODULE_NOT_FOUND\][^\n]*'([^']+)'"),
    re.compile(r"^(?:.*: )?([\w.@/+-]+): command not found"),
    re.compile(r"command not found: ([\w.@/+-]+)"),
)

# The same "did not run" class, reached from the other direction: a step whose
# check needs a credential this environment does not have.
#
# Added 2026-09-07 with `pages-freshness-ci.yml`, which is the first
# verification-only workflow here whose check cannot run without one --
# `pages_state.py` reads the repository object and the managed Pages builder's
# run history, and exits 2 saying so when neither `GH_TOKEN` nor
# `GITHUB_TOKEN` is set. Left in the `failed` class it would have reported
# `main` as red in every sandbox without a token, which is precisely the
# costume-of-a-real-failure problem the block above was written about. Adding
# a check that lies when it cannot authenticate would have cost more than the
# check is worth.
#
# The discrimination that keeps this honest is the same one that keeps
# `_provided_by_repo` honest: match only a tool's *explicit* statement that a
# named credential is absent, never a generic authorization failure. A 401
# from GitHub stays `failed` -- a token that is present and rejected is a real
# result, and burying it here would hide the thing a session most needs to
# see. So both patterns require the line to name an env var in credential
# shape AND to say it is unset.
CREDENTIAL_MISSING = (
    # "neither GH_TOKEN nor GITHUB_TOKEN is set"
    re.compile(
        r"neither (\$?[A-Z][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD|CREDENTIALS))\b"
        r"[^\n]*? nor \$?[A-Z][A-Z0-9_]*\b[^\n]*? is (?:set|present|available)"
    ),
    # "GH_TOKEN is not set", "$ARGOCD_REPO_TOKEN is unset/empty/missing/required"
    re.compile(
        r"\$?\b([A-Z][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD|CREDENTIALS))\b"
        r" is (?:not set|unset|empty|missing|required)"
    ),
)


_REPO_MODULES: set | None = None


def repo_modules() -> set:
    """Every module name this repository itself supplies, from the tracked tree.

    Computed once, from `git ls-files`, because the alternative is a walk of a
    tree with 2,000+ published pages in it. Names are what a bare `import`
    could resolve to: a `<name>.py` at any depth, and any directory that is on
    a tracked path.
    """
    global _REPO_MODULES
    if _REPO_MODULES is not None:
        return _REPO_MODULES

    names: set = set()
    try:
        listed = subprocess.run(
            ["git", "ls-files"], cwd=REPO, capture_output=True, text=True,
            timeout=60, check=True).stdout.splitlines()
    except (subprocess.SubprocessError, OSError):
        # No git, or not a checkout. An empty set means every missing name
        # reads as a missing tool, which is the wrong way to be wrong -- so
        # fall back to the two directories a bare import could resolve from.
        listed = []
        for base in (REPO,):
            with os.scandir(base) as entries:
                listed = [e.name for e in entries]

    for path in listed:
        parts = path.split("/")
        names.update(parts[:-1])                     # directories on the path
        leaf = parts[-1]
        if leaf.endswith(".py"):
            names.add(leaf[:-3])
    _REPO_MODULES = names
    return names


def _provided_by_repo(name: str, cwd: str) -> bool:
    """True when `name` is something this repository itself supplies.

    The discrimination this whole classification turns on. `pytest` is absent
    from the tree, so a step that cannot import it never ran. `pages_state` is
    `platform/ci/pages_state.py`, so a step that cannot import *that* found a
    real defect -- and it is a defect this repository has already had:
    CLAUDE.md records that `platform/ci`'s suites resolve their imports by
    bare name and only with `platform/ci` as the working directory, so
    `python3 -m pytest platform/ci` from the root fails collection. Calling
    that "toolchain missing" would bury exactly the bug the check exists to
    surface, so the tree is searched before the verdict is given.

    Deliberately biased towards "this is ours": a name that exists in the tree
    and is also a third-party package reads as a real failure, which costs a
    session one look at the output. The opposite error hides a defect.
    """
    head = name.split(".")[0].lstrip("@").split("/")[0]
    if not head:
        return False
    if head in repo_modules():
        return True
    # A relative path in the message (`./x`, `platform/ci/y`) is this tree's.
    for base in (cwd, REPO):
        if os.path.exists(os.path.join(base, head + ".py")):
            return True
        if os.path.isdir(os.path.join(base, head)):
            return True
    return False


def missing_toolchain(output, cwd: str) -> str | None:
    """The tool a failing step could not find, or None if it found them all.

    `output` is the step's combined stdout/stderr, already split into lines.
    """
    for line in output:
        for pattern in TOOLCHAIN_MISSING:
            found = pattern.search(line.strip())
            if found and not _provided_by_repo(found.group(1), cwd):
                return found.group(1)
    return None


def missing_credential(output) -> str | None:
    """The credential a failing step said was absent, or None.

    Kept separate from `missing_toolchain` rather than folded into it because
    the two classes need different advice -- one is `pip install`, the other is
    `export`, and a report that told a reader to install `GH_TOKEN` would be
    worse than one that said nothing. Both land in the same `unrun` status:
    what they have in common is that the check never executed.
    """
    for line in output:
        for pattern in CREDENTIAL_MISSING:
            found = pattern.search(line.strip())
            if found:
                return found.group(1).lstrip("$")
    return None


class Step:
    """One `run:` step, with where and how it should be executed."""

    def __init__(self, job, name, run, workdir):
        self.job = job
        self.name = name
        self.run = run
        self.workdir = workdir
        self.status = "pending"   # ok | failed | unrun | skipped | refused
        self.reason = ""
        # Set on an `unrun` step: the module, binary or credential that was not
        # found, so the report can name what to supply rather than only that it
        # failed. `missing_kind` decides whether the advice is "install" or
        # "set" -- telling a reader to install `GH_TOKEN` would be worse than
        # saying nothing at all.
        self.missing = ""
        self.missing_kind = "tool"
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
                    step.unset_vars.extend(
                        m.group(1) for m in VARS_EXPRESSION.finditer(value))
                # See GITHUB_TOKEN_EXPRESSION: substitute the ambient token, or
                # leave it empty and let the step say so for itself.
                resolved, token_hits = GITHUB_TOKEN_EXPRESSION.subn(
                    ambient_github_token(), resolved)
                if hits or token_hits:
                    step.env[key] = resolved
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
    """Whether this node reads a secret this tool has no honest stand-in for.

    `secrets.GITHUB_TOKEN` is excluded, for the reason GITHUB_TOKEN_EXPRESSION
    gives at length: it is minted per run rather than held by the owner, every
    session here already has the same token in `GH_TOKEN`, and the capability
    question it used to stand in for is answered directly and better by
    `_grants_write` on the declared `permissions` block. A job that reads it
    under `contents: read` can do nothing this tool should hold back.

    Every other `secrets.X` still holds the job. The substitution above knows
    one literal name; a job reading any other secret would run here against a
    credential this tool cannot supply, and guessing is worse than not running.
    """
    dumped = yaml.safe_dump(node, default_flow_style=False)
    dumped = re.sub(r"\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}", "", dumped)
    return "secrets." in dumped


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
    elif (absent := missing_toolchain(output, cwd)) is not None:
        step.status = "unrun"
        step.missing = absent
        step.reason = (f"`{absent}` is not installed here, so this step never "
                       "ran the check it exists to make")
    elif (uncredentialed := missing_credential(output)) is not None:
        step.status = "unrun"
        step.missing = uncredentialed
        step.missing_kind = "credential"
        step.reason = (f"`{uncredentialed}` is not set here, so this step "
                       "never ran the check it exists to make")
    else:
        step.status = "failed"
        step.reason = f"exit {done.returncode}"


def report(name, steps, uses_skipped, forced) -> int:
    ran = [s for s in steps if s.status in ("ok", "failed")]
    failed = [s for s in steps if s.status == "failed"]
    skipped = [s for s in steps if s.status == "skipped"]
    refused = [s for s in steps if s.status == "refused"]
    setup_failed = [s for s in steps if s.status == "setup-failed"]
    unrun = [s for s in steps if s.status == "unrun"]

    print()
    for step in failed:
        print(f"FAILED  {step.label}  ({step.reason})")
        print(f"        $ {step.run.splitlines()[0]}")
        for line in step.tail:
            print(f"        {line}")
        print()

    for step in unrun:
        print(f"UNRUN   {step.label}: {step.reason}")
        print(f"        $ {step.run.splitlines()[0]}")
    if unrun:
        # Name the fix rather than leaving the reader to derive it. The whole
        # point of the class is that these steps still owe an answer.
        tools = sorted({s.missing for s in unrun if s.missing_kind == "tool"})
        creds = sorted({s.missing for s in unrun
                        if s.missing_kind == "credential"})
        if tools:
            print("        Install the missing tool(s) and re-run; until then "
                  "these steps have verified nothing:")
            print("          " + ", ".join(tools))
        if creds:
            print("        Set the missing credential(s) and re-run; until "
                  "then these steps have verified nothing:")
            print("          " + ", ".join(creds))

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
    if skipped or refused or uses_skipped or setup_failed or unrun:
        print()

    total = len(ran)
    not_run = (len(skipped) + len(refused) + len(uses_skipped)
               + len(setup_failed) + len(unrun))
    print(f"{name}: {total - len(failed)}/{total} run: step(s) passed"
          + (f", {len(failed)} failed" if failed else "")
          + f" ({not_run} not run)")

    if failed:
        return 1
    if not total:
        print("  Nothing was executed, so nothing was verified.")
        return 1
    if skipped or refused or uses_skipped or setup_failed or unrun:
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
            print(f"  [{STATUS_MARK[step.status]:6}] {step.label} "
                  f"({step.seconds:.1f}s)")
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
        print(f"  [{STATUS_MARK[step.status]:6}] {step.label} "
              f"({step.seconds:.1f}s)")

    return report(name, steps, uses_skipped, args.force)


if __name__ == "__main__":
    raise SystemExit(main())
