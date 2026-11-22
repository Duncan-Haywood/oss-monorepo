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
    python3 platform/ci/run_workflow_locally.py doc-refs-ci prompts-ci   # several, in turn
    python3 platform/ci/run_workflow_locally.py --list portfolio-pages.yml

Under an agent harness a run still going after 100 s detaches and prints
its log path and a `wait_for.py` line (exit 3); `--foreground` stays attached.
A sweep exits 0 when every selected workflow passed, 1 when a step failed
(or the checkout moved, or nothing was selected), and 5 (NO_VERDICT) when
nothing failed but a workflow ran out of budget or stopped after a skipped
step: not a pass, and not a failure either. On a prose-only (.md/.txt) diff
it leaves portfolio-pages and portfolio-validate (~13 min here, ~4 on CI) to
the pull request's CI and exits 5; `--full` runs them (when CI is starved).

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
The diff starts at the merge base with the base ref, so commits that
landed on `main` after the branch left it do not count as this branch's
changes; with no merge base (a shallow clone, a stale `origin/main`) it
stops and prints the fetch that gives it one.

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
runs by name only through the per-job read-only screen `--for-changes`
uses (`read_only_jobs`), or with `--force`. Neither check is a security
boundary -- it is a guard against an obvious accident, and the refusal
names what tripped it so a real verification step is not silently dropped.
"""

from __future__ import annotations

import argparse
import copy
import functools
import hashlib
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import typing

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
    "ventures-tests.yml",
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
    # Added 2026-10-12 with the research fold-in and the prompt system. Both
    # are `contents: read` with no secrets: one builds the research homepage
    # into a gitignored directory, the other validates prompts/ and runs its
    # unit tests. Both guard committed data that must agree with itself (every
    # research project listed; every routed prompt version and run record
    # valid), which is the question `--tree` exists to ask.
    "research-ci.yml",
    "prompts-ci.yml",
    # Added 2026-11-15. `--for-changes` already runs it on every `ventures/**`
    # diff (its one job is `contents: read`, no secrets: build into the
    # gitignored `_site/`, then check links); naming it to re-run it was the
    # one place it asked for --force (doc friction, 2026-11-13).
    "pages.yml",
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

# The progress line is written in two halves -- the step's label before it
# runs, flushed, and the verdict after -- and that is a fix rather than a
# style. It used to print one whole line *after* `execute()` returned, which
# combined with Python's block buffering on a pipe to make this tool look
# hung: a session running the documented `--tree` sweep and piping it
# anywhere sees no output at all, for as long as the slowest step takes,
# while the parent process sits at ~0% CPU because its children are doing
# the work. Every one of those signals reads as a wedged process.
#
# It was read that way. Measured 2026-09-09: the sweep over this tree takes
# ~13 minutes and emitted nothing until it exited, and the session that
# merged #4326 that morning recorded killing it -- "hung indefinitely
# (near-zero CPU for 10+ minutes)" -- and falling back to running CLAUDE.md's
# hand-copied command list instead. That is precisely the substitution
# CLAUDE.md tells sessions to make in the other direction, on the grounds
# that a hand-copied list goes stale and this tool cannot. Actions has been
# starved since 2026-09-04, so during that window this *is* the CI, and a CI
# that looks broken gets killed rather than read.
#
# The cheap guard against that is not a faster sweep, it is saying which step
# is running while it runs. Note the failure it protects against is the one
# this file already fails toward everywhere else: a check that did not
# actually run must never be mistaken for one that did.

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


# The GitHub context values that have an honest local answer, added
# 2026-10-29 (docs/history/ci-local-first-2026-10-29.md). Every diff-scoped
# step here reads its base as `github.event.pull_request.base.sha ||
# github.event.before`, and skipping those steps meant `ventures-tests.yml` --
# the venture test suites, the no-warranty clause check and `tsc` -- verified
# nothing locally. On a pull request that expression is the base branch's
# commit, and the local equivalent is the merge base with the branch
# `--for-changes` compares against, so it is substituted rather than skipped.
# `github.sha` is HEAD, `github.workspace` the checkout, `runner.temp` a
# scratch directory. Anything else (step outputs, `inputs.*`) still has no
# local meaning and keeps the skip, apart from the two noted below.
#
# One difference stays: a step that runs `git diff "$BASE" HEAD` sees
# committed work only. `--for-changes` selects workflows from the working
# tree, so commit before relying on such a step's verdict (uncommitted_note
# says so at the start of a run).
LOCAL_BASE = {"ref": "origin/main"}
# A lone `}` may sit inside one (format's `{0}`); only `}}` closes it.
CONTEXT_EXPRESSION = re.compile(r"\$\{\{\s*((?:[^}]|\}(?!\}))*?)\s*\}\}")
BASE_EXPRESSIONS = {
    "github.event.pull_request.base.sha || github.event.before",
    "github.event.pull_request.base.sha || github.sha",
    "github.event.pull_request.base.sha",
}


# Two more, added 2026-11-15, because without them portfolio-pages could never
# reach a verdict here: its `Build the site` step reads both in `env:`, was
# skipped, and `Check the built artifact` then failed for want of dist/, so
# every docs/posts or venture diff ended NO VERDICT however long it ran
# (measured this run: 8/8 run steps passed, exit 4). A local run already
# models a pull request (an `if:` false on a pull request is skipped), so
# `github.event_name` is `pull_request`, and the one compound form workflows
# here use, `github.event_name != 'x' && 'a' || 'b'`, is evaluated on it.
# `needs.gate.outputs.base` is portfolio-pages' gate job choosing the origin;
# with Cloudflare configured (live since 2026-10-30) it is
# https://marisstella.app/, build.mjs's DEFAULT_BASE_URL (CLAUDE.md, "Hosting").
EVENT_NAME = "pull_request"
EVENT_TERNARY = re.compile(
    r"^github\.event_name\s*(==|!=)\s*'([^']*)'\s*&&\s*'([^']*)'\s*\|\|\s*'([^']*)'$")
LOCAL_NEEDS = {"needs.gate.outputs.base": "https://marisstella.app/"}


def _git_out(*args) -> str:
    done = subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True)
    return done.stdout.strip() if done.returncode == 0 else ""


@functools.lru_cache(maxsize=None)
def local_context(expression: str) -> str | None:
    """The local value of one `${{ }}` expression, or None if it has none."""
    expression = " ".join(expression.split())
    if expression in BASE_EXPRESSIONS:
        return _git_out("merge-base", LOCAL_BASE["ref"], "HEAD") or None
    if expression == "github.sha":
        return _git_out("rev-parse", "HEAD") or None
    if expression == "github.workspace":
        return REPO
    if expression == "runner.temp":
        return tempfile.mkdtemp(prefix="runner-temp-")
    if expression == "github.event_name":
        return EVENT_NAME
    ternary = EVENT_TERNARY.match(expression)
    if ternary:
        op, name, when, otherwise = ternary.groups()
        return when if (EVENT_NAME == name) == (op == "==") else otherwise
    if expression in LOCAL_NEEDS:
        return LOCAL_NEEDS[expression]
    if expression in REPOSITORY_EXPRESSIONS:
        return repository_parts().get(expression)
    fallback = UNSET_VAR_FALLBACK.match(expression)
    if fallback:
        return local_context(fallback.group(2))
    return format_call(expression)


# pages.yml's `Build the site` reads `vars.PAGES_BASE_URL || format(
# 'https://{0}.github.io/{1}', github.repository_owner,
# github.event.repository.name)`. Unevaluated, the step was skipped and the two
# link checks after it read UNRUN, so pages.yml (selected by every `ventures/**`
# diff) ended every --for-changes sweep with no verdict (measured 2026-11-15 on
# a one-venture diff: 16 min sweep, exit 5). An unset repository variable is
# the empty string, which `||` passes over, exactly as `${{ vars.X }}` alone is
# handled above; the repository names come from the origin remote.
REPOSITORY_EXPRESSIONS = ("github.repository", "github.repository_owner",
                          "github.event.repository.name")
UNSET_VAR_FALLBACK = re.compile(r"^vars\.([A-Za-z_][A-Za-z0-9_]*)\s*\|\|\s*(.+)$")
FORMAT_CALL = re.compile(r"^format\(\s*'((?:[^']|'')*)'\s*((?:,.*)?)\)$")
REMOTE_REPO = re.compile(r"github\.com[:/]+([^/\s]+)/([^/\s]+?)(?:\.git)?/?$")


@functools.lru_cache(maxsize=None)
def repository_parts() -> dict:
    """{expression: value} for the repository contexts, from the origin remote ({} if none)."""
    match = REMOTE_REPO.search(_git_out("remote", "get-url", "origin"))
    if not match:
        return {}
    owner, name = match.groups()
    return {"github.repository": f"{owner}/{name}",
            "github.repository_owner": owner,
            "github.event.repository.name": name}


def _split_args(text: str) -> list[str]:
    """Top-level comma-separated arguments (quotes and parentheses respected)."""
    args, depth, quoted, current = [], 0, False, ""
    for ch in text:
        if ch == "'":
            quoted = not quoted
        elif not quoted and ch in "(":
            depth += 1
        elif not quoted and ch in ")":
            depth -= 1
        if ch == "," and not quoted and depth == 0:
            args.append(current.strip())
            current = ""
            continue
        current += ch
    if current.strip():
        args.append(current.strip())
    return args


def format_call(expression: str) -> str | None:
    """`format('{0}...', a, ...)` when every argument has a local value, else None."""
    match = FORMAT_CALL.match(expression)
    if not match:
        return None
    template = match.group(1).replace("''", "'")
    values = []
    for arg in _split_args(match.group(2).lstrip(",")):
        if len(arg) >= 2 and arg[0] == arg[-1] == "'":
            values.append(arg[1:-1].replace("''", "'"))
            continue
        value = local_context(arg)
        if value is None:
            return None
        values.append(value)
    try:
        return re.sub(r"\{(\d+)\}", lambda m: values[int(m.group(1))], template)
    except IndexError:
        return None


def resolve_context(text: str) -> tuple[str, list[str]]:
    """`text` with every locally answerable expression substituted."""
    resolved = []

    def sub(match):
        value = local_context(match.group(1))
        if value is None:
            return match.group(0)
        resolved.append(" ".join(match.group(1).split()))
        return value

    return CONTEXT_EXPRESSION.sub(sub, text), resolved


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
    # A compiled extension that will not load: PATH's python3 3.11 found a
    # Pillow built for 3.13, so `from PIL import Image` raised this while
    # /usr/bin/python3 imported it (photo-editing, run record 2026-11-12).
    # Only `_private` names, the C-extension convention; `pkg._ext` is what a
    # working interpreter must import.
    re.compile(r"cannot import name '(?P<ext>_\w+)' from '(?P<pkg>[\w.]+)'"),
)
# Python's own header for a broken `.pth` line at startup (see missing_toolchain).
PTH_ERROR_START = re.compile(r"^Error processing line \d+ of .+\.pth:$")

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

    Lines inside a `.pth` startup error are skipped. After a `pip install`
    into /usr/bin/python3.13, its distutils-precedence.pth imports a
    `_distutils_hack` that interpreter cannot find, so every Python start
    prints "Error processing line 1 of ...pth: ... No module named
    '_distutils_hack' ... Remainder of file ignored" and carries on. That
    module is not what the step needed: reading it as one marked homepage,
    post-frontmatter and site-build steps UNRUN and hid their real result
    (run record 2026-11-15-session_01E5sJKo9N2JfJyia7MwKy7o).
    """
    in_pth_error = False
    for line in output:
        text = line.strip()
        if PTH_ERROR_START.match(text):
            in_pth_error = True
            continue
        if in_pth_error:
            if text == "Remainder of file ignored":
                in_pth_error = False
            continue
        for pattern in TOOLCHAIN_MISSING:
            found = pattern.search(line.strip())
            if not found:
                continue
            name = (f"{found['pkg']}.{found['ext']}" if "pkg" in pattern.groupindex
                    else found.group(1))
            if not _provided_by_repo(name, cwd):
                return name
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


def declared_unrun(output) -> str | None:
    """What a step said when it reported itself unable to run, or None.

    The same "did not run" class as the two above, reached from a third
    direction: not a tool this sandbox lacks and not a credential it lacks,
    but a check that ran, discovered it could not answer its own question,
    and said so in as many words.

    Added 2026-09-16 for `check_venture_regression.py`, which is the only
    check here that already makes this distinction internally and the one
    where getting it wrong is most expensive. It compares the tree against a
    base ref, and a removal it spots means a live product vanished from the
    served catalogue -- so when it *cannot prove* the removal is real (your
    checkout is an ancestor of the base, or a shallow clone leaves ancestry
    unanswerable) it deliberately refuses to pass, exits `EXIT_UNRUN` = 2,
    and prints `UNRUN: ...` followed by "This check did not run, which is not
    the same as passing."

    The sweep read that as an ordinary `FAILED`, which is the costume problem
    the two blocks above were written about, wearing a third costume. It
    matters most in exactly the situation `--tree` creates by construction: a
    sweep takes ~20 minutes, this repository lands merges from up to 4
    sessions inside 15, so `main` moving *during* the sweep is the ordinary
    case rather than an edge one. The reader then sees `main` reported red,
    with a step name -- "Check no live venture disappears from the served
    catalogue" -- that reads like live product going dark. Measured that day:
    that is precisely what happened, and the checker's own diagnostic was the
    only thing that kept it from being reported as a red `main`.

    The discrimination that keeps this honest is the same one `missing_toolchain`
    and `missing_credential` use, and it is the whole reason this matches a
    marker rather than an exit code. A **real** regression -- the venture
    genuinely gone, ancestry proven -- exits 1 and prints no `UNRUN:` line, so
    it stays `failed` and stays loud. Only a check that explicitly disclaims
    its own result is reclassified, and it is still never counted as green:
    an `unrun` step is named, counted as not run, and owed an answer.
    """
    for line in output:
        if line.strip().startswith("UNRUN:"):
            return line.strip()[len("UNRUN:"):].strip() or (
                "the step reported that it did not run"
            )
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
        # Pinned tools this step was pointed at, and a pin no local copy
        # matched (tool, pinned version, local --version line); see PIN.
        self.pinned = []
        self.pin_miss = None
        self.seconds = 0.0
        self.tail = []
        # (count, message) for each distinct error a failed step printed; see
        # failure_causes.
        self.causes = []
        # {cause: first test that failed with it}; see failure_sites.
        self.sites = {}
        # Repository paths a failed step's output names; see named_paths.
        self.paths = set()
        # env: entries to add for this step. Populated only from `vars.`
        # expressions resolved to their unset value; see VARS_EXPRESSION.
        self.env = {}
        # Names of those variables, so the report can say the step ran with
        # them unset rather than leaving the reader to assume they were set.
        self.unset_vars = []
        # `${{ }}` expressions given their local value; see local_context.
        self.resolved = []

    @property
    def label(self):
        return f"{self.job} / {self.name}"


@functools.lru_cache(maxsize=None)
def _parse_workflow(text: str):
    return yaml.safe_load(text)


def load_workflow(path: str) -> dict:
    # Keyed by the file's text, not its path, so an edited file is re-read.
    # Callers get their own copy: collect() and the tests may mutate it.
    with open(path) as fh:
        return copy.deepcopy(_parse_workflow(fh.read()))


def _default_dir(node, inherited: str) -> str:
    """`defaults.run.working-directory` off a workflow or a job, or inherited."""
    run = ((node or {}).get("defaults") or {}).get("run") or {}
    return run.get("working-directory", inherited)


# A local sweep stands in for a pull request's CI, so a step or job whose
# `if:` is false on a pull request is one CI would not run either. Running it
# anyway was not harmless: portfolio-pages' "Add the development dashboard"
# polls ten minutes for a file its (skipped) background step never writes.
# Only `&&` chains are judged, and only by their `github.event_name` terms;
# anything else (`||`, step outputs, `needs.`) still runs as before.
EVENT_TERM = re.compile(
    r"^github\.event_name\s*(==|!=)\s*'([a-z_]+)'$")


# Why `&&` is split only outside parentheses. Until 2026-11-14 any `||` in an
# `if:` made the whole condition unknown, so portfolio-pages.yml's `deploy`
# job -- `... && (needs.gate.outputs.cloudflare != 'true' || ...) && ... &&
# github.event_name != 'pull_request' && ...` -- ran locally, and its
# "Announce the deployed site to IndexNow" step reached `indexnow.mjs
# --submit`; it failed only because the artifact it unpacks was missing. A
# `||` inside a parenthesised group cannot rescue a false top-level term.
def top_level_terms(text: str) -> list[str] | None:
    """`text` split at `&&` outside parentheses and quotes, or None if a
    top-level `||` (or unbalanced brackets) means no single term decides it."""
    terms, depth, quote, start, i = [], 0, None, 0, 0
    while i < len(text):
        ch = text[i]
        if quote:
            quote = None if ch == quote else quote
        elif ch in "'\"":
            quote = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth < 0:
                return None
        elif depth == 0 and text.startswith("||", i):
            return None
        elif depth == 0 and text.startswith("&&", i):
            terms.append(text[start:i])
            start = i + 2
            i += 1
        i += 1
    if depth or quote:
        return None
    return terms + [text[start:]]


def false_on_pull_request(condition) -> bool:
    """True when an `if:` cannot hold on a `pull_request` event."""
    if not isinstance(condition, str):
        return False
    text = condition.strip()
    if text.startswith("${{") and text.endswith("}}"):
        text = text[3:-2].strip()
    terms = top_level_terms(text)
    if terms is None:
        return False
    for term in terms:
        hit = EVENT_TERM.match(term.strip())
        if hit and (hit.group(1) == "==") != (hit.group(2) == "pull_request"):
            return True
    return False


# Actions' own cap for a job that declares no `timeout-minutes`.
DEFAULT_JOB_MINUTES = 360


def job_order(jobs: dict) -> list[str]:
    """Job ids in an order that honours `needs:`, cheapest declared job first.

    File order put portfolio-pages' `test` job (a 300+ s site-builder suite)
    ahead of `build`, whose second step is the seconds-long blog front-matter
    check. The sweep's per-workflow budget ran out inside `test`, so the one
    check a post-only diff could fail came back UNRUN and sessions found it
    in the YAML by hand (five doc-friction reports, 2026-11-12). Jobs with no
    `needs:` between them are independent in CI too, so running the one its
    author capped lowest first loses nothing and reaches cheap gates sooner.
    Ties keep file order; a `needs:` cycle or unknown name falls back to it.
    """
    ids = list(jobs)
    def minutes(job_id):
        try:
            return float((jobs[job_id] or {}).get("timeout-minutes",
                                                   DEFAULT_JOB_MINUTES))
        except (TypeError, ValueError):  # an expression: unknown cost
            return float(DEFAULT_JOB_MINUTES)
    def needs(job_id):
        raw = (jobs[job_id] or {}).get("needs") or []
        return {raw} if isinstance(raw, str) else set(raw)
    done, order = set(), []
    while len(order) < len(ids):
        ready = [j for j in ids if j not in done and needs(j) <= done]
        if not ready:
            return ids
        pick = min(ready, key=lambda j: (minutes(j), ids.index(j)))
        done.add(pick)
        order.append(pick)
    return order


# Why an `actions/cache` restore gets a local stand-in. `runner.temp` resolves
# to a fresh temp directory per process, so the share-card cache that
# portfolio-pages.yml restores into `${{ runner.temp }}/share-cards` was empty
# on every local run: each of the site-builder suite's four full builds drew
# all ~7,300 cards again. Cold, that step took 330 s here, past the sweep's
# 300 s per-workflow budget, so every venture or post diff ended NO_VERDICT
# for portfolio-pages (12 sessions' doc friction, 2026-11-10..14), and each
# run also left ~350 MB of cards in /tmp. A restored path under `runner.temp`
# is now a link to one directory under PIN_CACHE that outlives the process.
# That is as safe as the cache it stands in for: a workflow that restores a
# cache must already accept stale contents (restore-keys hand back an older
# entry), and the share cards are keyed by what they are drawn from.
# Measured: one site build 111 s cold, 47 s warm (process run 2026-11-14,
# docs/history/run-workflow-locally-card-cache-2026-11-14.md).
CACHE_ACTION = re.compile(r"^actions/cache(/restore)?@")
RUNNER_TEMP_PATH = re.compile(r"^\$\{\{\s*runner\.temp\s*\}\}/(.+)$")


def local_cache_dirs(raw: dict, root: str | None = None,
                     temp: str | None = None) -> list[str]:
    """Link each `runner.temp` path an `actions/cache` restore names to a kept directory.

    Returns the relative paths it linked (for the skip note); other `uses:`
    steps, and cache paths outside `runner.temp` (which persist on this
    machine anyway), return [].
    """
    if not CACHE_ACTION.match(str(raw.get("uses") or "")):
        return []
    root = root or os.path.join(PIN_CACHE, "actions-cache")
    linked = []
    for line in str((raw.get("with") or {}).get("path") or "").splitlines():
        match = RUNNER_TEMP_PATH.match(line.strip())
        if not match:
            continue
        rel = os.path.normpath(match.group(1))
        if rel.startswith("..") or os.path.isabs(rel):
            continue
        kept = os.path.join(root, rel)
        target = os.path.join(temp or local_context("runner.temp"), rel)
        try:
            os.makedirs(kept, exist_ok=True)
            if not os.path.lexists(target):
                os.makedirs(os.path.dirname(target), exist_ok=True)
                os.symlink(kept, target)
        except OSError:
            continue  # no stand-in: the step reads an empty cache, as before
        linked.append(f"{rel} kept in {kept}")
    return linked


def collect(workflow: dict, only: set | None = None) -> tuple[list[Step], list[str]]:
    """Every `run:` step in job order (`job_order`), plus a note for each skipped step.

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
    jobs = workflow.get("jobs") or {}
    for job_id in job_order(jobs):
        job = jobs[job_id] or {}
        if only is not None and job_id not in only:
            continue
        if false_on_pull_request(job.get("if")):
            skipped.append(f"{job_id}: job's if: is false on a pull request")
            continue
        job_dir = _default_dir(job, top_dir)
        for raw in job.get("steps") or []:
            name = raw.get("name") or raw.get("uses") or "(unnamed)"
            if "run" not in raw:
                kept = local_cache_dirs(raw)
                skipped.append(f"{job_id} / {name}: uses: step, not run:"
                               + (f" (local stand-in: {', '.join(kept)})" if kept else ""))
                continue
            if false_on_pull_request(raw.get("if")):
                skipped.append(f"{job_id} / {name}: if: is false on a pull request")
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
            # Workflow and job `env:` apply too, step entries winning. Until
            # 2026-11-12 only resolved expressions were set at all, so plain
            # values were dropped at every level: einvoice-preflight's job-level
            # `PYTHONPATH: src` never reached its step, and its 22 Python tests
            # failed locally on an import that is green in CI. An inherited
            # entry this tool cannot evaluate (a secret) is left unset rather
            # than skipping every step under it, which is what it did before.
            inherited = {str(k): str(v) for node in (workflow, job)
                         for k, v in ((node or {}).get("env") or {}).items()
                         if str(k) not in raw_env}
            # Resolve `${{ vars.X }}` to the empty string an unset repository
            # variable actually has, and record which ones. What is left after
            # that is an expression this tool genuinely cannot evaluate.
            for key, value in {**inherited, **raw_env}.items():
                resolved, hits = VARS_EXPRESSION.subn("", value)
                if hits:
                    step.unset_vars.extend(
                        m.group(1) for m in VARS_EXPRESSION.finditer(value))
                # See GITHUB_TOKEN_EXPRESSION: substitute the ambient token, or
                # leave it empty and let the step say so for itself.
                resolved, token_hits = GITHUB_TOKEN_EXPRESSION.subn(
                    ambient_github_token(), resolved)
                resolved, context_hits = resolve_context(resolved)
                step.resolved.extend(context_hits)
                if not EXPRESSION.search(resolved):
                    step.env[key] = resolved
            command, context_hits = resolve_context(command)
            step.run = command
            step.resolved.extend(context_hits)
            workdir, context_hits = resolve_context(str(workdir))
            step.workdir = workdir
            step.resolved.extend(context_hits)
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
    """Would the pull request carrying `changed` start this workflow?

    Mirrors the filter Actions applies: with `paths`, at least one changed
    file must match; with `paths-ignore`, at least one must *not* match; with
    neither, any change starts it.

    A workflow with a `pull_request` trigger is judged by that block alone:
    it is what the PR's CI runs. Its `push` block (here always `branches:
    [main]`) fires after the merge, not on the diff under review. Reading it
    too made `portfolio-pages.yml`, whose `push` has no path filter, answer to
    every diff, so a research-only change sat through the site build and the
    site-builder suite that its PR never runs (15 doc-friction reports,
    2026-11-10..16). A push-only workflow still counts its `push` block.
    """
    on = workflow.get("on", workflow.get(True))
    blocks = triggers(workflow)
    if isinstance(on, dict) and "pull_request" in on:
        blocks = [on["pull_request"] or {}]
    for block in blocks:
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


# A secret is read through an Actions *expression*, so that is what this
# looks for -- not the loose text `secrets.`, which is also how a filename
# reads.
#
# The `${{ }}` wrapper is matched separately from the reference inside it
# rather than in one pattern, because the two can be far apart
# (`${{ inputs.x && secrets.Y || '' }}`) and a single adjacency-based regex
# would miss that. `secrets[...]` index syntax has no readable name, so it
# holds the job unconditionally: failing closed is the only safe direction
# for a screen that decides what may execute locally.
EXPRESSION_BLOCK = re.compile(r"\$\{\{(.*?)\}\}", re.S)
SECRET_REFERENCE = re.compile(
    r"\bsecrets\s*(?:\.\s*([A-Za-z_][A-Za-z0-9_-]*)|\[)")


def _iter_strings(node):
    """Every string scalar in a parsed workflow fragment, keys included.

    Deliberately walks the structure instead of re-serialising it.
    `yaml.safe_dump` line-wraps long scalars -- a shellcheck invocation
    spanning 24 paths comes back full of `\\` continuations and escaped
    newlines -- so a `${{ ... secrets.X ... }}` in a long command can be
    split across two dumped lines. A screen that decides what is safe to run
    must not be able to miss a secret because the dumper chose a line break.
    """
    if isinstance(node, dict):
        for key, value in node.items():
            yield from _iter_strings(key)
            yield from _iter_strings(value)
    elif isinstance(node, (list, tuple)):
        for value in node:
            yield from _iter_strings(value)
    elif isinstance(node, str):
        yield node


def _mentions_secret(node) -> bool:
    """Whether this node reads a secret this tool has no honest stand-in for.

    `secrets.GITHUB_TOKEN` is excluded, for the reason GITHUB_TOKEN_EXPRESSION
    gives at length: it is minted per run rather than held by the owner, every
    session here already has the same token in `GH_TOKEN`, and the capability
    question it used to stand in for is answered directly and better by
    `_grants_write` on the declared `permissions` block. A job that reads it
    under `contents: read` can do nothing this tool should hold back.

    Every other `secrets.X` still holds the job: a job reading one would run
    here against a credential this tool cannot supply, and guessing is worse
    than not running.

    **This used to ask whether the literal text `secrets.` appeared anywhere
    in the job, and a filename is text.** Measured 2026-09-10 across all 283
    workflows, exactly one job was held on that reading and nothing else:
    `hetzner-gitops-ci.yml`'s `scripts`, which declares no `permissions`
    beyond the workflow's `contents: read`, reads no secret at all, and does
    one thing -- `shellcheck` over the 24 shell scripts that install and run
    every runner-free route this repository has. It was classified "reads a
    secret" because two of the paths it lints are `bootstrap/scripts/
    load-secrets.sh` and `bootstrap/scripts/seal-owner-secrets.sh`, and
    `load-secrets.sh` contains the substring `secrets.`.

    The cost was not theoretical and is not on the sweep. `--for-changes` is
    the documented pre-merge check and `hetzner-gitops-ci.yml`'s `paths:`
    filter selects it on any `bootstrap/**` or `gitops/**` diff -- so every
    session that edited a deploy script got a report with the shell-bug gate
    silently held back. #4435 (2026-09-10) is the record of it: it changed
    `bootstrap/restore-cluster.sh`, reported `--for-changes 13/15`, and its
    author separately ran "shellcheck-py 0.11.0.1 clean on restore-cluster.sh
    (reproducing the starved scripts job by hand)". Improvising a guard the
    tool held back is exactly what this module's docstring says it exists to
    stop -- and `test_shellcheck_coverage.py` records `enable-codex-governor.sh`
    shipping with two real SC2015 findings the one time that job did not run.

    The fix narrows the screen and cannot widen it: a filename is not an
    expression, and every genuine `${{ secrets.X }}` still holds its job.
    """
    if isinstance(node, dict) and "secrets" in node:
        # A reusable-workflow call passes credentials through a `secrets:`
        # key (`secrets: inherit`, or an explicit mapping) with no `${{ }}`
        # anywhere. Nothing here uses one today; holding on the key keeps
        # that from becoming a hole the day something does.
        return True
    for text in _iter_strings(node):
        for block in EXPRESSION_BLOCK.findall(text):
            for name in SECRET_REFERENCE.findall(block):
                if name != "GITHUB_TOKEN":
                    return True
    return False


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

    It is also the gate for a workflow named on the command line that is
    not in `VERIFICATION_ONLY`: a name the sweep would run unasked runs by
    name too, and only the held jobs need `--force`.
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


# A branch this many commits past the merge base is unusual for one session's
# work; past it, the likelier story is a base ref that was never refreshed.
STALE_BASE_COMMITS = 30


# The fetches `changed_paths` tries, in order, when `origin/<branch>` and HEAD
# share no commit: fetch_ref.py (a day of history, never cutting what the clone
# already holds), then deeper history. Runs kept hitting the error on a fresh
# shallow clone and typing the first one by hand (friction 2026-11-12: "that
# step could be automatic"). The first step was `--depth=40` until 2026-11-17,
# which also cut a deepened main back to 40 commits (fetch_ref.py, "Why").
FETCH_STEPS = (("fetch_ref",), ("--deepen=500",))
FETCH_HINT = "python3 platform/ci/fetch_ref.py main"


def _fetch_merge_base(base, git, repo=None):
    """Fetch history until `base` and HEAD share a commit, for a remote ref.

    Returns the last `git merge-base` result. A local base (`main`) is left
    alone: there is nothing to fetch, and the caller's error says why."""
    remote, _, branch = base.partition("/")
    nothing = subprocess.CompletedProcess([], 1, "", "")
    if not branch or git("remote", "get-url", remote).returncode != 0:
        return nothing
    found = nothing
    for step in FETCH_STEPS:
        how = (f"python3 platform/ci/fetch_ref.py {branch}" if step == ("fetch_ref",)
               else f"git fetch {' '.join(step)} {remote} {branch}")
        print(f"run_workflow_locally: {base} and HEAD share no commit here; {how}", file=sys.stderr)
        if step == ("fetch_ref",):
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            import fetch_ref
            if fetch_ref.fetch_ref(branch, remote, cwd=repo or REPO, out=sys.stderr) == 1:
                break
        elif git("fetch", "-q", *step, remote, branch).returncode != 0:
            break
        found = git("merge-base", base, "HEAD")
        if found.returncode == 0 and found.stdout.strip():
            break
    return found


def changed_paths(base: str, repo: str = REPO) -> list[str]:
    """Repo-relative paths this branch changed since it left `base`.

    Deliberately a working-tree diff rather than `base...HEAD`: the session
    that most needs this is about to commit, and the files it is verifying
    are the ones it has not committed yet.

    The diff starts at the merge base, not at `base`'s tip. Against the tip,
    every commit that landed on main after the branch left it reads as a
    change of this branch (a stale or newer `origin/main` in a cloud clone
    turned a one-post diff into 4,165 files and dozens of unrelated
    workflows; several 2026-11-11 run records report it). With no merge base, as
    in a shallow clone whose `origin/main` is older than the clone's
    boundary, it first fetches (FETCH_STEPS) for a remote base, and if that
    still finds none, stops and says how to fetch one, since the diff would
    mean nothing.
    """
    def git(*args):
        return subprocess.run(["git", *args], cwd=repo,
                              capture_output=True, text=True)

    found = git("merge-base", base, "HEAD")
    if found.returncode != 0 or not found.stdout.strip():
        found = _fetch_merge_base(base, git, repo)
    if found.returncode != 0 or not found.stdout.strip():
        if git("rev-parse", "--verify", "--quiet", base).returncode != 0:
            raise SystemExit(f"run_workflow_locally: no ref {base!r}; "
                             f"fetch it: {FETCH_HINT}")
        raise SystemExit(
            f"run_workflow_locally: {base} and HEAD share no commit in this "
            f"clone (shallow, or {base} is stale), so a diff would count every "
            f"change on both sides.\n"
            f"  Refresh it: {FETCH_HINT}\n"
            f"  Still none: git fetch --deepen=500 origin main, until "
            f"`git merge-base {base} HEAD` answers.")
    merge_base = found.stdout.strip()
    ahead = git("rev-list", "--count", f"{merge_base}..HEAD").stdout.strip()
    if ahead.isdigit() and int(ahead) > STALE_BASE_COMMITS:
        print(f"note: HEAD is {ahead} commits past its merge base with {base}; "
              f"if this branch is not that long, {base} is stale "
              f"({FETCH_HINT}).", file=sys.stderr)
    done = git("diff", "--name-only", merge_base)
    if done.returncode != 0:
        raise SystemExit(f"run_workflow_locally: git diff against {base} failed:\n"
                         f"{done.stderr.strip()}")
    paths = [line for line in done.stdout.splitlines() if line.strip()]
    # New files the session has not yet `git add`ed. `git diff` never lists
    # them, so a new, uncommitted post was missing from the diff: it selected
    # no workflow of its own and could not be the COMMON CAUSE. On a polish
    # run (2026-11-17) the post's 169-character description failed four
    # Pages steps while COMMON CAUSE named the run's one-line index.html
    # edit; seeded again here, same result, until this line.
    new = git("ls-files", "--others", "--exclude-standard")
    if new.returncode == 0:
        seen = set(paths)
        paths += [p for p in new.stdout.splitlines()
                  if p.strip() and p not in seen]
    return paths


_RUNNER_FILES: dict[str, str] = {}


def runner_files() -> dict[str, str]:
    """Scratch stand-ins for the files Actions hands every step.

    A step that writes `>> "$GITHUB_OUTPUT"` fails here with an unset
    variable (bash: ambiguous redirect), whatever the diff: every
    `--for-changes` run selects portfolio-pages.yml, and its first step does
    exactly that, so each run reported FAILED rows it did not cause (run
    record 2026-11-11, session_01E5sJKmNy2). What a step writes lands in one
    temp directory per process; values a later `${{ steps.x.outputs.y }}`
    would read are still not resolved (those steps stay skipped as
    unevaluable expressions). An export already in this shell wins.
    """
    if not _RUNNER_FILES:
        tmp = tempfile.mkdtemp(prefix="run_workflow_locally-")
        for name in ("GITHUB_OUTPUT", "GITHUB_ENV", "GITHUB_STEP_SUMMARY",
                     "GITHUB_PATH", "GITHUB_STATE"):
            path = os.path.join(tmp, name.lower())
            open(path, "a").close()
            _RUNNER_FILES[name] = path
        _RUNNER_FILES["RUNNER_TEMP"] = tmp
    files = {k: v for k, v in _RUNNER_FILES.items() if k not in os.environ}
    # A CI runner owns its checkout; a cloud session shares platform/pages/dist
    # with any other local build, and build.mjs refused the second one (exit
    # 75, reported FAIL: doc friction 2026-11-21). Queue behind it instead
    # (platform/pages/build-lock.mjs). An export already in this shell wins.
    if "PAGES_BUILD_LOCK_WAIT" not in os.environ:
        files["PAGES_BUILD_LOCK_WAIT"] = str(PAGES_BUILD_LOCK_WAIT_S)
    files["GIT_CONFIG_GLOBAL"] = isolated_git_global(tmp=_RUNNER_FILES["RUNNER_TEMP"])
    return files


# A whole other site build (150-300 s) fits, leaving our own build room inside
# the 900 s default --timeout per step.
PAGES_BUILD_LOCK_WAIT_S = 480


def global_git_config_paths(environ=os.environ) -> list[str]:
    """The files `git config --global` reads, in git's order (later wins)."""
    if environ.get("GIT_CONFIG_GLOBAL"):
        return [environ["GIT_CONFIG_GLOBAL"]]
    home = environ.get("HOME") or os.path.expanduser("~")
    xdg = environ.get("XDG_CONFIG_HOME") or os.path.join(home, ".config")
    return [os.path.join(xdg, "git", "config"), os.path.join(home, ".gitconfig")]


def isolated_git_global(tmp: str, environ=os.environ) -> str:
    """A per-run copy of the global git config that steps read and write.

    CI steps write `git config --global`: portfolio-validate's supersede-check
    step sets user.email ci@example.com and user.name CI, which a fresh
    runner throws away. Run here, it overwrote the session's own ~/.gitconfig,
    so the session's next commit went out as "CI <ci@example.com>",
    Unverified, until amended (doc friction, run record 2026-11-17,
    session_01XpHqye3mm8o2YXnvRwxsJV). Steps now see a copy, made once per
    process: reads behave as before, writes land in RUNNER_TEMP.
    """
    path = os.path.join(tmp, "gitconfig-global")
    if not os.path.exists(path):
        with open(path, "w") as out:
            for source in global_git_config_paths(environ):
                try:
                    with open(source) as f:
                        out.write(f.read().rstrip("\n") + "\n")
                except OSError:
                    continue
    return path


# Why a failed step names its distinct errors, not only its last lines. A node
# test run ends with a TAP summary, so the 12-line tail of portfolio-pages'
# site-builder suite read "# fail 172" and nothing else. Four sessions on
# 2026-11-12 reported that count as environmental, "unrelated to the diff",
# and fell back to CI; it was their own post: loadPosts throws on an
# over-long description, and 172 tests failed on that one error (measured by
# seeding the fault, process run 2026-11-12). Grouped, the cause is one line.
TAP_ERROR = re.compile(r"^\s+error:\s*(.*)$")
PYTEST_FAILED = re.compile(r"^(?:FAILED|ERROR) (\S+) - (.+)$")
CAUSES_SHOWN = 3
# Why each cause names the first test that hit it. A cause alone read
# "1 x Expected values to be strictly equal", which says what but not where:
# finding the test meant rerunning the 211 s platform/pages suite (doc
# friction, run record 2026-11-17, session_01XpHqyfctr). Node's TAP gives the
# test's name on its `not ok` line and its file:line in `location:`; pytest's
# summary line starts with the test id. A parent test's own error, "1
# subtest failed", repeats its child's and is not a cause.
TAP_NOT_OK = re.compile(r"^\s*not ok \d+ - (.*)$")
TAP_LOCATION = re.compile(r"^\s+location:\s*'?(.*?)'?$")
SUBTESTS_FAILED = re.compile(r"^\d+ subtests? failed$")


def _clean_cause(text: str) -> str:
    text = text.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "'\"":
        text = text[1:-1]
    return re.sub(r"^(?:\w*Error|Error): ", "", text).strip()


def _scan_failures(lines, root: str = REPO):
    """({cause: count}, {cause: first test that hit it}) for failure_causes
    and failure_sites; insertion order is first appearance."""
    counts: dict[str, int] = {}
    sites: dict[str, str] = {}
    test = where = ""
    prefix = root.rstrip("/") + "/"
    for i, line in enumerate(lines):
        m = TAP_NOT_OK.match(line)
        if m:
            test, where = m.group(1).strip(), ""
            continue
        m = TAP_LOCATION.match(line)
        if m and test:
            where = m.group(1)
            where = where[len(prefix):] if where.startswith(prefix) else where
            continue
        m = TAP_ERROR.match(line)
        if m:
            value = m.group(1).strip()
            if value in ("|", "|-", ">", ">-", ""):
                value = next((n for n in lines[i + 1:i + 3] if n.strip()), "")
            site = f"{test} ({where})" if test and where else test
        else:
            m = PYTEST_FAILED.match(line)
            if not m:
                continue
            site, value = m.group(1), m.group(2)
        cause = _clean_cause(value)[:240]
        if cause and not SUBTESTS_FAILED.match(cause):
            counts[cause] = counts.get(cause, 0) + 1
            if site:
                sites.setdefault(cause, site[:200])
    return counts, sites


def failure_causes(lines) -> list[tuple[int, str]]:
    """Distinct error messages in a step's output, most frequent first.

    Reads node's TAP `error:` fields (a `|-` block's first line stands for the
    block) and pytest's `FAILED test - message` summary lines. Empty when the
    output has neither, so other tools' reports are unchanged.
    """
    counts, _ = _scan_failures(lines)
    # Stable sort: ties keep the order the errors first appeared in.
    return [(n, c) for c, n in sorted(counts.items(), key=lambda kv: -kv[1])]


def failure_sites(lines) -> dict[str, str]:
    """{cause: the first test that failed with it, as "name (file:line)"}."""
    return _scan_failures(lines)[1]


# Why a sweep names the changed file several failed steps share. One post
# with a 167-character description failed check_post_frontmatter, then the
# site-builder suite (173 tests), three more Pages steps and
# platform/distribution/shorts.test.mjs, in different workflows; each step's
# own cause list was right, but read one workflow at a time the five failures
# looked like unrelated breakage (three doc-friction reports, 2026-11-15 and
# 2026-11-16). The diff is the link: a changed path named by two or more
# failed steps is printed once, after the pass line, as the one to fix first.
# A bare file name counts too: check_post_frontmatter prints the post's name
# without docs/posts/. It is matched only when no other changed file shares it.
PATH_TOKEN = re.compile(r"(?<![\w./-])((?:/?[\w.-]+/)*[\w.-]+\.\w+)")


def named_paths(lines, root: str = REPO) -> set:
    """File paths and bare file names a step's output mentions (absolute paths
    under root made relative). Matched against the diff later, so loose is
    fine."""
    found = set()
    prefix = root.rstrip("/") + "/"
    for line in lines:
        for token in PATH_TOKEN.findall(line):
            if token.startswith(prefix):
                token = token[len(prefix):]
            found.add(token[2:] if token.startswith("./") else token)
    return found


def tree_basename_counts(repo: str = REPO) -> dict[str, int]:
    """{file name: how many tracked files carry it}, or {} if git cannot say."""
    done = subprocess.run(["git", "ls-files", "-z"], cwd=repo,
                          capture_output=True, text=True)
    counts: dict[str, int] = {}
    if done.returncode == 0:
        for path in done.stdout.split("\0"):
            if path:
                base = os.path.basename(path)
                counts[base] = counts.get(base, 0) + 1
    return counts


def shared_changed_paths(failed, changed, tree_counts=None) -> list:
    """[(path, [labels])] for each changed path named by two or more failed
    steps, most-named first. `failed` holds (workflow, step) pairs.

    A bare file name stands for a changed path only when no other file in the
    diff or the tracked tree has that name. `index.html` is the name of
    hundreds of pages, so a step that printed it said nothing about which one;
    counted, it put a polish run's one-line index.html edit next to the real
    cause, an over-long post description (seeded 2026-11-17: 2 of 4 failed
    steps 'named' it, neither about that page). `tree_counts` is
    tree_basename_counts(), passed in by tests."""
    if tree_counts is None:
        tree_counts = tree_basename_counts() if failed else {}
    names: dict[str, list[str]] = {}
    for path in set(changed):
        names.setdefault(os.path.basename(path), []).append(path)
    names = {base: ps for base, ps in names.items()
             if tree_counts.get(base, 0) <= 1}
    seen: dict[str, list[str]] = {}
    for name, step in failed:
        hits = {p for p in changed if p in step.paths}
        hits |= {ps[0] for base, ps in names.items()
                 if len(ps) == 1 and base in step.paths}
        for path in sorted(hits):
            seen.setdefault(path, []).append(f"{name} / {step.label}")
    shared = [(p, labels) for p, labels in seen.items() if len(labels) >= 2]
    return sorted(shared, key=lambda kv: -len(kv[1]))


def _decode(data) -> str:
    return data.decode("utf-8", "replace") if isinstance(data, bytes) else data


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
    env = {**os.environ, **runner_files(), **step.env}

    start = time.monotonic()
    try:
        done = subprocess.run(
            step.run, shell=True, cwd=cwd, capture_output=True,
            text=True, timeout=timeout, executable=SHELL, env=env,
        )
    except subprocess.TimeoutExpired as e:
        step.status = "failed"
        step.reason = f"timed out after {timeout}s"
        step.seconds = time.monotonic() - start
        # Keep what the step printed before the cut. It was dropped, so a
        # timed-out build read as FAIL (or UNRUN) with no output at all and
        # the reader could not tell a slow step from a broken one, nor which
        # test it was on (two doc-friction reports, 2026-11-16, portfolio-pages
        # 'Build the site'). TimeoutExpired carries bytes even with text=True.
        output = "\n".join(_decode(x) for x in (e.stdout, e.stderr)
                           if x).strip().splitlines()
        step.tail = output[-12:]
        step.causes = failure_causes(output)
        step.sites = failure_sites(output)
        step.paths = named_paths(output)
        return
    step.seconds = time.monotonic() - start
    output = (done.stdout + done.stderr).strip().splitlines()
    step.tail = output[-12:]
    step.causes = failure_causes(output) if done.returncode else []
    step.sites = failure_sites(output) if done.returncode else {}
    step.paths = named_paths(output) if done.returncode else set()
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
    elif (said_so := declared_unrun(output)) is not None:
        step.status = "unrun"
        step.missing_kind = "self-reported"
        step.reason = said_so
    else:
        step.status = "failed"
        step.reason = f"exit {done.returncode}"


# A `run:` that is exactly one argument-free platform/ci/check_*.py, the set
# main_health.py runs on a bare checkout, minus the ones that need a built site.
STANDALONE = re.compile(r"python3 (?:platform/ci/)?(check_\w+\.py)")
NEEDS_BUILT_SITE = {"check_pages_links.py", "check_built_site.py"}


# Pinned tools. `photo-editing-ci.yml` runs `pip install ruff==0.15.8
# mypy==1.19.1` and then `ruff check .` and `mypy`. Here the container's own
# ruff 0.16.9 sits earlier on PATH than anything pip installs, and its newer
# rules reported 165 errors on code the pinned version passes: a FAIL on a
# clean `main` (doc friction, 2026-11-12). Putting the pinned binary first was
# not enough either: pinned mypy then read the container's numpy stubs, which
# CI's lint job never installs, and failed on them. So a step that calls a
# pinned tool gets it from a venv of that job's `pip install` arguments (cached under
# PIN_CACHE, built once), as CI's fresh runner would; only those tools are
# shimmed, so `python3` and `pip` in the step are untouched. If the venv cannot
# be built (no network), a failure under a tool at another version is no
# verdict (UNRUN, version), since it came from a tool CI does not run.
PIN = re.compile(r"(?<![\w.-])([A-Za-z][\w.-]*)==([\w.+-]+)")
PIN_CACHE = os.path.join(os.path.expanduser("~"), ".cache", "run_workflow_locally")


def install_args(step) -> list:
    """The package arguments of a step's `pip install` lines, `-r` files made absolute."""
    out = []
    for line in step.run.splitlines():
        try:
            words = shlex.split(line, comments=True)
        except ValueError:
            continue
        for i, w in enumerate(words[:-1]):
            if w == "install" and words[i - 1:i] and words[i - 1].startswith("pip"):
                rest = words[i + 1:]
                break
        else:
            continue
        j = 0
        while j < len(rest) and rest[j] not in ("&&", "||", ";", "|"):
            w = rest[j]
            if w in ("-r", "--requirement", "-c", "--constraint") and j + 1 < len(rest):
                out += [w, os.path.join(REPO, step.workdir, rest[j + 1])]
                j += 1
            elif not w.startswith("-"):
                out.append(w)
            j += 1
    return out


def job_pins(steps) -> dict:
    """{step: (pins, install)}: the `pip install` arguments before each step in its
    job, and the `x==v` pins among them."""
    seen, out = {}, {}
    for step in steps:
        pins, install = seen.setdefault(step.job, ({}, []))
        out[step] = (dict(pins), list(install))
        if SETUP.match(step.run) and "pip" in step.run:
            args = install_args(step)
            install.extend(args)
            pins.update((n.lower(), v) for a in args for n, v in PIN.findall(a))
    return out


def called_tools(run: str, pins: dict) -> list:
    """The pinned names `run` invokes as a command (first word of a command)."""
    return [n for n in pins
            if re.search(rf"(?:^|[;&|(]|\$\()\s*(?:\w+=\S*\s+)*{re.escape(n)}(?=\s|$)", run, re.M)]


def pin_venv(install: list, cache: str = PIN_CACHE, timeout: int = 300) -> str | None:
    """bin/ of a cached venv with the job's `pip install` arguments, or None."""
    h = hashlib.sha256(" ".join(install).encode())
    for i, a in enumerate(install[:-1]):
        if a in ("-r", "--requirement", "-c", "--constraint"):
            try:
                with open(install[i + 1], "rb") as f:
                    h.update(f.read())
            except OSError:
                return None
    venv = os.path.join(cache, f"pins-{h.hexdigest()[:12]}")
    bindir = os.path.join(venv, "bin")
    stamp = os.path.join(venv, ".complete")
    if os.path.exists(stamp):
        return bindir
    try:
        subprocess.run([sys.executable, "-m", "venv", "--clear", venv], check=True,
                       capture_output=True, timeout=timeout)
        subprocess.run([os.path.join(bindir, "python"), "-m", "pip", "install", "-q",
                        "--disable-pip-version-check", *install], check=True,
                       capture_output=True, timeout=timeout)
    except (OSError, subprocess.SubprocessError):
        return None
    with open(stamp, "w") as f:
        f.write(" ".join(install) + "\n")
    return bindir


def _tool_version(path: str) -> str:
    try:
        done = subprocess.run([path, "--version"], capture_output=True,
                              text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return ""
    lines = (done.stdout + done.stderr).strip().splitlines()
    return lines[0] if lines else ""


def _has_version(text: str, version: str) -> bool:
    return re.search(rf"(?<![\w.]){re.escape(version)}(?![\w.])", text) is not None


def pin_tools(step: Step, setup: tuple, venv_for=pin_venv, version_of=_tool_version,
              path_env: str | None = None) -> None:
    """Run each pinned tool the step calls from a venv of the job's pins.

    Sets `step.env["PATH"]` (a one-directory shim first) and `step.pinned`, or,
    when no venv can be built and the tool on PATH is another version,
    `step.pin_miss` = (tool, pinned version, local --version line).
    """
    pins, install = setup
    tools = called_tools(step.run, pins)
    if not tools:
        return
    path_env = os.environ.get("PATH", "") if path_env is None else path_env
    bindir = venv_for(install)
    found = [t for t in tools if bindir and os.access(os.path.join(bindir, t), os.X_OK)]
    if found:
        shim = tempfile.mkdtemp(prefix="pinned-")
        for t in found:
            os.symlink(os.path.join(bindir, t), os.path.join(shim, t))
        step.env["PATH"] = shim + os.pathsep + step.env.get("PATH", path_env)
        step.pinned.append(", ".join(f"{t} {pins[t]}" for t in found)
                           + " from a venv of this job's pip install")
    for t in tools:
        if t in found:
            continue
        exe = shutil.which(t, path=path_env)
        here = version_of(exe) if exe else ""
        if exe and not _has_version(here, pins[t]):
            step.pin_miss = (t, pins[t], here)


def standalone(step: Step) -> bool:
    """True for a step that depends on no earlier step (see run_steps)."""
    m = STANDALONE.fullmatch(step.run.strip())
    if not m or step.status == "skipped" or m.group(1) in NEEDS_BUILT_SITE:
        return False
    prefixed = step.run.strip().startswith("python3 platform/ci/")
    return step.workdir == ("." if prefixed else "platform/ci")


def run_steps(steps, timeout, budget: int | None = None) -> None:
    """Execute steps, printing the live progress line for each.

    One definition, called by both the single-workflow path and the sweep,
    because there were two and they had already drifted once: the note above
    `STATUS_MARK` records the `KeyError: 'unrun'` that cost. The progress fix
    below landed in the sweep first and reached the by-name path only because
    running it turned up the old output -- the same defect, caught the same
    way, in the same eleven lines.
    """
    deadline = time.monotonic() + budget if budget else None
    skipped_in_job = {}  # job -> label of the first run: step skipped in it
    pins = job_pins(steps)

    def run_one(step):
            # Name the step BEFORE running it, and flush. Both halves are
            # load-bearing; see the note above `STATUS_MARK`.
            print(f"  {step.label} ... ", end="", flush=True)
            # Seconds left as a float: int() rounded 0.9 s down to 0, so a
            # 1 s budget (--workflow-timeout 1) read as spent before its
            # first step started and nothing ran.
            left = deadline - time.monotonic() if deadline else None
            # A step the sweep's budget stopped is UNRUN, not FAILED: it never
            # reached a verdict. Reported as FAILED (0.0s), every step after
            # portfolio-pages' 300+ s site-builder suite read as a real defect
            # until the reader found the TIMEOUT reason (three doc-friction
            # reports, 2026-11-11). It still keeps the sweep from reading green.
            if left is not None and left <= 0 and step.status != "skipped":
                step.status = "unrun"
                step.missing_kind = "budget"
                step.reason = f"TIMEOUT: workflow budget of {budget}s spent before this step"
                step.seconds = 0.0
            else:
                step_timeout = min(timeout, left) if left is not None else timeout
                if pins[step][0] and step.status != "skipped" and not SETUP.match(step.run):
                    pin_tools(step, pins[step])
                execute(step, step_timeout)
                # A failure from a tool at a version CI does not run is no
                # verdict on the repository; see PIN.
                if step.status == "failed" and step.pin_miss:
                    tool, version, here = step.pin_miss
                    step.status = "unrun"
                    step.missing_kind = "version"
                    step.missing = f"{tool}=={version}"
                    step.reason = (f"CI pins {tool} {version}; here it is "
                                   f"{here or 'unknown'}, so this step did not run "
                                   f"the check CI runs ({step.reason})")
                if step.reason.startswith("timed out after") and step_timeout < timeout:
                    step.status = "unrun"
                    step.missing_kind = "budget"
                    step.reason = f"TIMEOUT: workflow budget of {budget}s spent in this step"
            # A step that fails after an earlier run: step of its job was skipped
            # may only be missing that step's output (pages.yml's two `_site`
            # checks after its `${{ }}` build step). Reported as FAILED, it read
            # as a real defect (two doc-friction reports, 2026-11-11); it is no
            # verdict either way, so UNRUN, with its output kept for the reader.
            if step.status == "failed" and step.job in skipped_in_job:
                step.status = "unrun"
                step.missing_kind = "after-skip"
                step.reason = (f"failed after '{skipped_in_job[step.job]}' was skipped; "
                               f"it may only lack that step's output ({step.reason})")
            if step.status == "skipped":
                skipped_in_job.setdefault(step.job, step.name)
            print(f"[{STATUS_MARK[step.status]:6}] ({step.seconds:.1f}s)",
                  flush=True)

    # In a budgeted sweep, argument-free platform/ci checks go first. Jobs run
    # in parallel on CI but in file order here, so portfolio-pages' 300 s
    # site-builder suite (job `test`) spent the whole budget before job
    # `build` reached its 1 s post front-matter check: a research+post diff
    # whose only real fault was that check saw it as UNRUN and found it by
    # hand (doc friction, 2026-11-12). These checks need no setup step or
    # build output (main_health.py runs them all on a bare checkout), so
    # moving them up changes no verdict.
    early = [s for s in steps if budget and standalone(s)]
    if early:
        print(f"  ({len(early)} standalone check(s) first, so a long step "
              "cannot spend the budget before them)", flush=True)
    for step in early + [s for s in steps if s not in early]:
        run_one(step)


# report()'s exit when the sweep budget, not a check, stopped the workflow.
BUDGET_SPENT = 3
# report()'s exit when steps failed only after a step of their job was skipped.
AFTER_SKIP = 4
# report()'s exit when every step was skipped and none ran. A by-name run maps
# it to 1, as before; a sweep counts it as no verdict, not a failure. Every
# diff selects agent-cross-review.yml, whose one runnable step reads
# `github.event.pull_request.number` and so always skips: as a failure it made
# every --for-changes sweep exit 1 with nothing failed (three run records,
# 2026-11-14, had to read the log to say so).
NOTHING_RAN = 6
# The sweep's exit (`--for-changes`, `--tree`) when no step failed but some
# workflow reached no verdict (BUDGET_SPENT or AFTER_SKIP). Still not a pass,
# but not 1 either: through 2026-11-14 a text-only diff ended `DONE exit 1`
# because portfolio-pages.yml's site-builder suite outran the 300 s budget,
# and some twenty run records in two days had to read the log to learn that
# nothing had failed ("an exit code that separates 'failed' from
# 'unverifiable here' would save a reading pass"). 5, not 2 or 3: 2 is a
# usage error and 3 is HANDED_OFF.
NO_VERDICT = 5


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
        if step.causes:
            total = sum(n for n, _ in step.causes)
            print(f"        {total} error(s), {len(step.causes)} distinct; "
                  "the most frequent:")
            for n, cause in step.causes[:CAUSES_SHOWN]:
                print(f"          {n} x {cause}")
                if cause in step.sites:
                    print(f"              first in: {step.sites[cause]}")
            print("        A count this size is often one cause in your diff "
                  "that many tests share, not the environment.")
        for line in step.tail:
            print(f"        {line}")
        print()

    for step in unrun:
        print(f"UNRUN   {step.label}: {step.reason}")
        print(f"        $ {step.run.splitlines()[0]}")
        # A budget cut mid-step keeps its partial output (see execute): the
        # last lines say whether it was slow or stuck, and on what.
        if step.missing_kind in ("after-skip", "budget"):
            if step.missing_kind == "budget" and step.tail:
                print("        last output before the cut:")
            for line in step.tail:
                print(f"        {line}")
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
        # A self-reported one names its own remedy, and that remedy is
        # specific to the check (`check_venture_regression.py` asks for a
        # fetch and a merge, not an install). Point at it rather than
        # inventing a generic instruction that would be wrong for the next
        # check to join this class.
        pinned = sorted({s.missing for s in unrun if s.missing_kind == "version"})
        if pinned:
            print("        Install the pinned version(s) so they come first on "
                  "PATH (or in a venv) and re-run:")
            print("          python3 -m pip install " + " ".join(pinned))
        if any(s.missing_kind == "budget" for s in unrun):
            print("        The sweep's per-workflow budget ran out, so these "
                  "steps reached no verdict.")
            print(f"        Re-run by name, which has no budget: python3 "
                  f"platform/ci/run_workflow_locally.py {name}")
            print("        (or pass --workflow-timeout 0; run it in the "
                  "background, it can pass 10 min).")
        if any(s.missing_kind == "after-skip" for s in unrun):
            print("        A step before these was skipped, so their failure may "
                  "only be its missing output.")
            print("        Run the skipped step by hand with its expression "
                  "filled in, then these, before reading them as verified.")
        if any(s.missing_kind == "self-reported" for s in unrun):
            print("        A step above reported itself unable to run. Its own "
                  "output says what it needs;")
            print("        re-run it directly and satisfy that before reading "
                  "this tree as verified.")

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
        if step.resolved and step.status in ("ok", "failed"):
            print(f"LOCAL   {step.label}: ran with "
                  + ", ".join(sorted(set(step.resolved)))
                  + f" given its local value (base: merge base with {LOCAL_BASE['ref']})")
    for step in steps:
        if step.pinned and step.status in ("ok", "failed"):
            print(f"PINNED  {step.label}: ran " + "; ".join(step.pinned))
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
    if any(s.missing_kind == "budget" for s in unrun):
        print("  Not a verdict: the budget stopped this workflow before its "
              "steps finished.")
        return BUDGET_SPENT
    if any(s.missing_kind == "after-skip" for s in unrun):
        print("  Not a verdict: steps failed after a step they may need was "
              "skipped.")
        return AFTER_SKIP
    if not total:
        print("  Nothing was executed, so nothing was verified.")
        return NOTHING_RAN
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

    if not args.list and not getattr(args, "no_post_check", False):
        failed, output = post_precheck(changed)
        if failed:
            print(output)
            print(POST_PRECHECK_STOP, flush=True)
            return 1

    if not args.list and not getattr(args, "no_browser_sweeps", False):
        code, output = browser_sweep_precheck(changed)
        if output:
            print(output, flush=True)
        if code == 1:
            print(BROWSER_SWEEP_STOP, flush=True)
            return 1

    selected, held = pick_workflows(lambda _n, wf: selects(wf, changed))

    workflows = {name for name, *_ in selected} | {name for name, *_ in held}
    print(f"{len(changed)} changed file(s) against {args.for_changes} select "
          f"{len(workflows)} workflow(s).")
    hint = budget_hint(len(selected), getattr(args, "workflow_timeout", 0),
                       args.list)
    if hint:
        print(hint, flush=True)
    selected, deferred = defer_heavy(selected, changed, args)
    if deferred:
        print(DEFER_NOTE.format(names=", ".join(deferred)), flush=True)
    cost = local_cost_hint([name for name, *_ in selected], args.list)
    if cost:
        print(cost, flush=True)
    note = uncommitted_note(changed)
    if note:
        print(note, flush=True)
    if deferred and not selected:
        rc = 0  # nothing cheap was selected; the deferral below is the verdict
    else:
        rc = _run_selected(args, selected, held, changed=changed)
    if deferred and not args.list:
        print(f"  Not a clean sweep: {', '.join(deferred)} deferred to the pull "
              "request's CI (prose-only diff). Its green check runs are their "
              "verdict; if CI is starved, re-run with --full.", flush=True)
        if rc == 0:
            rc = NO_VERDICT
    if not args.list and not getattr(args, "no_research_tests", False):
        rc = research_tests(changed) or rc
    return rc


# No workflow runs a research project's own tests (research-ci.yml builds the
# homepage and checks programmes), so a research PR was green whatever its
# suite did. A sweep runs the suites of the projects the diff touches, with an
# interpreter pyenv.py finds (run_research_tests.py's docstring has the why).
def research_tests(changed, repo: str = REPO) -> int:
    """Run run_research_tests.py on the diff's research projects; its exit code, 0 if none."""
    script = os.path.join(repo, "platform", "ci", "run_research_tests.py")
    projects = sorted({"/".join(p.split("/")[:2]) for p in changed
                       if p.startswith("research/") and p.count("/") >= 2
                       and not p.split("/")[1].startswith(("_", "."))
                       and os.path.isdir(os.path.join(repo, *p.split("/")[:2], "tests"))})
    if not projects or not os.path.isfile(script):
        return 0
    print(f"research project tests ({len(projects)}; no CI workflow runs them; "
          "--no-research-tests skips):", flush=True)
    return subprocess.run([sys.executable, script, *projects], cwd=repo).returncode


# Workflows are picked from the working tree, but a step that diffs
# `"$BASE" HEAD` sees commits only. run_venture_tests.py --since and
# clauses.mjs --changed-since read the working tree locally since
# 2026-11-18 (an uncommitted venture edit ran "0 suites run, 0 failed",
# exit 0); ventures-tests.yml's tsc step and browser_state.py still diff
# HEAD, so an uncommitted change is named before the sweep, not after a pass.
def uncommitted_note(changed, repo: str = REPO) -> str | None:
    """One line naming the diff's files not yet committed, else None."""
    done = subprocess.run(["git", "status", "--porcelain", "--untracked-files=all"],
                          cwd=repo, capture_output=True, text=True)
    if done.returncode != 0:
        return None
    dirty = {line[3:].split(" -> ")[-1].strip('"') for line in done.stdout.splitlines() if line[3:]}
    loose = sorted(p for p in changed if p in dirty)
    if not loose:
        return None
    shown = ", ".join(loose[:3]) + (f" and {len(loose) - 3} more" if len(loose) > 3 else "")
    return (f"note: {len(loose)} changed file(s) are not committed ({shown}); steps that "
            f"diff \"$BASE\" HEAD (the tsc step in ventures-tests.yml) will not see them. "
            f"Commit first for a full verdict.")


# A new post over a front-matter cap (description 160, seo_title 70) fails
# check_post_frontmatter, the site-builder suite (~175 tests through one
# shared fixture), three more Pages steps and shorts.test.mjs, so the run
# shortens it and sweeps again: a second multi-minute sweep for a one-line
# fix. Run records on 2026-11-16 and 11-17 report it in 33 of 714 runs, 23%
# of polish runs and ~11% of redteam/perf/explore/creative ones (their start
# tools do not print the caps; allocate.py and pick_track.py do, and
# ventures/research sit at 1.7%). The check takes a quarter of a second, so
# a sweep runs it on the diff's posts first and stops on a failure.
POST_PRECHECK_STOP = (
    "Stopped before the sweep: the post(s) above fail check_post_frontmatter, "
    "which would fail several Pages and site steps too. Fix them and run "
    "again (--no-post-check sweeps anyway).")


def changed_posts(changed, repo: str = REPO) -> list[str]:
    """The diff's posts that still exist: docs/posts/*.md, not nested."""
    return [p for p in changed
            if p.startswith("docs/posts/") and p.endswith(".md")
            and p.count("/") == 2 and os.path.isfile(os.path.join(repo, p))]


def post_precheck(changed, repo: str = REPO) -> tuple[bool, str]:
    """(failed, output) of check_post_frontmatter on the diff's posts.

    (False, "") when there are none or the checker cannot run: the sweep
    runs it again in its own step, so a skipped precheck loses nothing."""
    posts = changed_posts(changed, repo)
    checker = os.path.join(repo, "platform", "ci", "check_post_frontmatter.py")
    if not posts or not os.path.isfile(checker):
        return False, ""
    try:
        done = subprocess.run([sys.executable, checker, *posts], cwd=repo,
                              capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return False, ""
    if done.returncode == 0:
        return False, ""
    return True, (done.stdout + done.stderr).rstrip()


# Seven browser sweeps (platform/ci/check_*.js) found 40-odd live venture bugs
# on 2026-11-18/19 ($Infinity, NaN, dead buttons, 13 pages rendering visitor
# text as HTML) and nothing ran them again: no workflow, test or runner named
# them. CI runners have no Playwright, cloud sessions do, so the place they can
# run is here, on the ventures the diff touches (~12 s for one venture).
BROWSER_SWEEP_STOP = (
    "Stopped before the sweep: a browser sweep above found a defect on a venture "
    "page this diff touches. Fix it, or run again with --no-browser-sweeps if the "
    "hit is a false positive (say which in the run record).")
BROWSER_SWEEP_MAX = 10


def browser_sweep_precheck(changed, repo: str = REPO, timeout: int = 420) -> tuple[int, str]:
    """(exit code, output) of venture_sweeps.py on the diff's ventures.

    (0, "") when the diff touches no venture page; (2, note) when the sweeps
    cannot run here (no Playwright: CI runners), which never stops the sweep."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try:
        import venture_sweeps
    except ImportError:
        return 0, ""
    finally:
        sys.path.pop(0)
    slugs = venture_sweeps.touched_ventures(changed, repo)
    if not slugs:
        return 0, ""
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "venture_sweeps.py")
    try:
        done = subprocess.run([sys.executable, script, "--max", str(BROWSER_SWEEP_MAX), *slugs],
                              cwd=repo, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return 2, f"venture_sweeps: timed out after {timeout} s; not swept."
    except OSError as e:
        return 2, f"venture_sweeps: could not start ({e}); not swept."
    return done.returncode, (done.stdout + done.stderr).rstrip()


# A foreground tool call in a cloud session is cut off at 600 s. Runs kept
# starting --for-changes in the foreground and losing the whole result when a
# docs+venture diff selected 13 to 17 workflows (four doc-friction reports,
# 2026-11-11). Saying so before the first step costs one line.
TOOL_CAP_S = 600


def budget_hint(n_selected: int, per_workflow_s: int, listing: bool) -> str | None:
    """A warning when the selection can outrun a foreground tool call, else None."""
    if listing or n_selected < 2 or not per_workflow_s:
        return None
    worst = n_selected * per_workflow_s
    if worst <= TOOL_CAP_S:
        return None
    return (f"  {n_selected} workflow(s) x {per_workflow_s} s budget = up to "
            f"{worst // 60} min, past a {TOOL_CAP_S} s foreground tool call: "
            "run this in the background (log to a file), or --list first and "
            "run the workflows you need by name.")


# What a sweep costs here, measured, so a run can choose before it starts.
# The budget hint above gives the worst case ("up to 65 min"), which says
# nothing about the usual one. Three doc-friction reports (2026-11-19/20) ran
# --for-changes on text-only diffs (an episode, a story, a post) for 10+
# minutes while the PR's CI, with runners, went green in about 4. Measured
# 2026-11-20 on the 4-core cloud container, sweeping commit 1544fcef2 (an
# episode + post, 8 files, 13 workflows): 918 s of steps in all. The sweep is
# CPU-bound, so running workflows side by side would not save it: portfolio-
# pages' site-builder suite alone used 1,045 CPU-s in 334 s of wall time (3.1
# of 4 cores) and builds the full site twice; its `build` job builds it again.
# CI runs those jobs on separate runners at once. Seconds per workflow, from
# that sweep; a workflow not listed counts as nothing.
MEASURED_LOCAL_S = {
    "portfolio-pages.yml": 525,
    "portfolio-validate.yml": 235,
    "ventures-tests.yml": 83,
    "prompts-ci.yml": 29,
    "page-integrity-ci.yml": 15,
    "pages.yml": 14,
}
COST_HINT_MIN_S = 300


def local_cost_hint(names, listing: bool) -> str | None:
    """A line on what the selected workflows measured here, when it is long."""
    if listing:
        return None
    known = sorted(((MEASURED_LOCAL_S[n], n) for n in set(names)
                    if n in MEASURED_LOCAL_S), reverse=True)
    total = sum(s for s, _ in known)
    if total < COST_HINT_MIN_S:
        return None
    top = ", ".join(f"{n} ~{s // 60 or 1} min" for s, n in known[:2])
    return (f"  measured here: about {total // 60} min for this selection ({top}; "
            "2026-11-20, CPU-bound, so it does not parallelise), where CI runs the "
            "same jobs on separate runners in about 4-5 min. If the PR's CI got "
            "runners (ci_starvation.py --run <id> exits 0), its verdict comes first "
            "and this sweep adds nothing: wait for CI, or run only the workflow "
            "your change is about, by name.")


# The hint above did not change behaviour: five sessions in the two days to
# 2026-11-22 (friction_rank.py --live, run_workflow_locally.py first) still ran
# the 13-minute sweep on a story, episode or post diff and stopped it once the
# PR's CI went green in about 4. So a diff of prose alone (.md/.txt) leaves the
# measured-heavy workflows to that CI by default, and says so; the cheap ones,
# the post precheck and the research suites still run. It is never a pass: the
# exit is NO_VERDICT until the PR's checks are read. `--full` (or naming them
# with --only, or by name) runs them, which is the route when CI is starved.
DEFER_MIN_S = 200
PROSE_SUFFIXES = (".md", ".txt")
DEFER_NOTE = ("  prose-only diff: deferring {names} to the pull request's CI "
              "(~4-5 min there, ~13 min here); --full runs them here.")


def defer_heavy(selected, changed, args):
    """(selected without the heavy workflows, their names) for a prose-only diff."""
    if (getattr(args, "full", False) or getattr(args, "only", None) or args.list
            or not changed or not all(p.endswith(PROSE_SUFFIXES) for p in changed)):
        return selected, []
    heavy = [s for s in selected if MEASURED_LOCAL_S.get(s[0], 0) >= DEFER_MIN_S]
    if not heavy:
        return selected, []
    return [s for s in selected if s not in heavy], [s[0] for s in heavy]


GONE = "-"  # a tracked path deleted from the worktree
DRIFT_PATHS_SHOWN = 5


def tracked_content(cwd: str = REPO, chunk: int = 200) -> dict[str, str] | None:
    """{tracked path: git blob id of the bytes the worktree holds}.

    Blob ids come from the index for a path the worktree matches, and from
    `git hash-object` (which applies the same filters) for one it does not,
    so the same bytes give the same id whether or not they are committed yet.
    That is the point: a `git commit` moves content from the worktree side of
    the index to the committed side without changing a byte any step reads,
    and must not read as the tree moving. `-` marks a tracked path deleted
    from the worktree.

    None when git cannot answer, so "could not measure" stays distinguishable
    from "nothing changed" (see `checkout_fingerprint`).
    """
    try:
        ls = subprocess.run(["git", "ls-files", "-s", "-z"], cwd=cwd,
                            capture_output=True, text=True, timeout=120)
        dirty = subprocess.run(["git", "diff-files", "--name-only", "-z"], cwd=cwd,
                               capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.SubprocessError):
        return None
    if ls.returncode != 0 or dirty.returncode != 0:
        return None
    content = {}
    for entry in ls.stdout.split("\0"):
        meta, tab, path = entry.partition("\t")
        if not tab:
            continue
        fields = meta.split()
        if len(fields) >= 2:
            content[path] = fields[1]
    changed = [p for p in dirty.stdout.split("\0") if p]
    for i in range(0, len(changed), chunk):
        batch = changed[i:i + chunk]
        here = [p for p in batch if os.path.exists(os.path.join(cwd, p))]
        for p in batch:
            if p not in here:
                content[p] = GONE
        if not here:
            continue
        try:
            hashed = subprocess.run(["git", "hash-object", "--"] + here, cwd=cwd,
                                    capture_output=True, text=True, timeout=300)
        except (OSError, subprocess.SubprocessError):
            return None
        ids = hashed.stdout.split()
        if hashed.returncode != 0 or len(ids) != len(here):
            return None
        content.update(zip(here, ids))
    return content


class Fingerprint(typing.NamedTuple):
    """What a sweep's verdict is a reading of: HEAD, and the tracked content."""
    head: str
    content: str  # digest of `tracked_content`, so two equal trees compare equal
    paths: typing.Mapping[str, str] = {}  # for naming what moved; never mutated
    # Untracked, non-ignored files and their blob ids, read only for the
    # fingerprint taken before a sweep: a file the run writes and then commits
    # (a new post, the run record) joins the tracked set with bytes the sweep
    # already read, so it must not count as the tree moving. Never in `content`.
    untracked: typing.Mapping[str, str] = {}


UNTRACKED_CAP = 2000  # past this, skip the lookup (a build tree left unignored)


def untracked_content(cwd: str = REPO, chunk: int = 200) -> dict[str, str]:
    """{untracked, non-ignored path: blob id}, or {} when git cannot answer.

    {} only loses the allowance for committing a new file; it never hides a
    change, so failure degrades to the stricter old behaviour.
    """
    try:
        ls = subprocess.run(["git", "ls-files", "-o", "--exclude-standard", "-z"],
                            cwd=cwd, capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.SubprocessError):
        return {}
    if ls.returncode != 0:
        return {}
    paths = [p for p in ls.stdout.split("\0")
             if p and os.path.isfile(os.path.join(cwd, p))]
    if len(paths) > UNTRACKED_CAP:
        return {}
    out = {}
    for i in range(0, len(paths), chunk):
        batch = paths[i:i + chunk]
        try:
            hashed = subprocess.run(["git", "hash-object", "--"] + batch, cwd=cwd,
                                    capture_output=True, text=True, timeout=300)
        except (OSError, subprocess.SubprocessError):
            return {}
        ids = hashed.stdout.split()
        if hashed.returncode != 0 or len(ids) != len(batch):
            return {}
        out.update(zip(batch, ids))
    return out


def checkout_fingerprint(with_untracked: bool = False) -> Fingerprint | None:
    """HEAD and a digest of every tracked path's content, as the worktree holds it.

    Deliberately reads **tracked content only**. Untracked files are excluded
    on purpose: several steps here legitimately write temp artifacts, a build
    directory or a node_modules tree, and a fingerprint that moved on those
    would cry wolf on every clean run and be switched off within a day -- the
    same fate this file's own comments predict for any check that fails on
    correct input. For the same reason the digest is commit-invariant: see
    `tracked_content`.

    Returns None when git cannot answer (not a repository, no git binary), so
    a missing fingerprint can be told apart from an unchanged one: the caller
    treats "could not measure" as no finding rather than as a finding.
    """
    try:
        head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO,
                              capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return None
    content = tracked_content()
    if head.returncode != 0 or content is None:
        return None
    digest = hashlib.sha256(
        "\0".join(f"{p}\0{content[p]}" for p in sorted(content)).encode()
    ).hexdigest()
    untracked = untracked_content() if with_untracked else {}
    return Fingerprint(head.stdout.strip(), digest, content, untracked)


def moved_paths(before: Fingerprint, after: Fingerprint, shown=DRIFT_PATHS_SHOWN) -> str:
    """"a, b (+3 more)" over the tracked paths whose content differs, or ""."""
    old, new = dict(getattr(before, "paths", {})), dict(getattr(after, "paths", {}))
    # A path tracked now but not before is unmoved if the worktree already
    # held the same bytes untracked: a commit of a file the run wrote.
    loose = getattr(before, "untracked", {}) or {}
    names = sorted(p for p in set(old) | set(new)
                   if (old[p] if p in old else loose.get(p)) != new.get(p))
    if not names:
        return ""
    more = f" (+{len(names) - shown} more)" if len(names) > shown else ""
    return ", ".join(names[:shown]) + more


def checkout_drift(before, after) -> str | None:
    """Describe how the checkout moved under a sweep, or None if it held still.

    WHY THIS EXISTS
    ---------------
    `--tree` reads the checkout as it stands, and takes 40+ minutes to do it.
    That is long enough that the obvious way to run it -- in the background,
    while getting on with something else -- is also the way to make it lie,
    because "something else" in this repository means checking out a PR
    branch, merging `main`, or running `regen.mjs`.

    Measured 2026-09-11: a sweep started on `main` reported
    `FAILED validate / Check the apex tool mirror is not stale`. The mirror
    was not stale. The session had checked out another PR's branch while the
    sweep ran, and the step read that branch's tree. Re-run on an untouched
    worktree at the same commit, the identical step passed 260/260.

    A false red costs a session chasing a defect that does not exist. A false
    *green* is worse and is equally available -- a sweep that reads a fixed
    tree for the half of its run covering the broken file reports the tree
    green. Neither is a reading, so this fails the sweep rather than warning
    inside it: a warning in the middle of 40 minutes of scrollback is a
    warning nobody sees, which is the argument `pages_state.py
    --require-current` and `guard_state.py --require-runnable` already make
    here for an exit code over a reminder.

    It cannot distinguish "another session wrote to this checkout" from "a
    step under test rewrote a tracked file", and does not try: both mean the
    verdict covers more than one tree, and both want the same answer.

    WHAT IS NOT DRIFT
    -----------------
    Committing. A sweep reads the worktree, so `git commit` of files already
    written there changes no byte any step reads -- only which side of the
    index holds them. Eleven run records to 2026-11-13 lost a sweep to
    UNSTABLE CHECKOUT, and three of the four 2026-11-12/13 reports name
    committing the run record (the one thing a run is told to do while a long
    sweep runs) as the cause: 40 minutes of verdicts thrown away for a commit
    that moved nothing. So the finding is a change in tracked *content*
    (`tracked_content`), and a HEAD that moved over identical content is a
    note from the caller, not a void verdict. A branch checkout or a merge
    changes content, so the 2026-09-11 shape above is still caught.
    """
    if before is None or after is None or before == after:
        return None
    if before.content == after.content:
        return None  # same tree, new commit: the caller notes the HEAD move
    moved = moved_paths(before, after)
    if not moved and getattr(before, "untracked", None) and getattr(after, "paths", None):
        # Content differs only by newly tracked files whose bytes the worktree
        # already held untracked (2026-11-14 reports: committing a new post
        # voided five workflows). Same bytes read, so the same tree.
        return None
    where = f": {moved}" if moved else ""
    same_head = "" if before.head != after.head else " (HEAD did not move)"
    return f"tracked files changed while the sweep ran{same_head}{where}" + born_hint(before, after)


def born_hint(before, after) -> str:
    """A sentence when every moved path was created after the sweep started.

    The hand-off note says committing written files is fine, and runs read
    that as covering a run record they wrote *during* the sweep (2026-11-18:
    three workflows voided). Such a file was neither tracked nor untracked at
    the start, so steps before it and after it read different trees; the
    drift stands, and naming the case says what to do next time.
    """
    old = dict(getattr(before, "paths", {}) or {})
    loose = getattr(before, "untracked", {}) or {}
    new = dict(getattr(after, "paths", {}) or {})
    moved = [p for p in set(old) | set(new)
             if (old[p] if p in old else loose.get(p)) != new.get(p)]
    if moved and all(p not in old and p not in loose for p in moved):
        return ("; every one is new since the sweep started: if you wrote it (the"
                " run record, a post), write such files before starting a sweep or"
                " commit them after it ends")
    return ""


# Why a sweep's budget is pooled. Each workflow had its own 300 s, so a
# research or venture diff plus a blog post selected two to four workflows
# whose own checks finished in seconds, and portfolio-pages' site-builder
# suite (cold in a fresh container: the share-card cache is empty) still ran
# out of its 300 s alone: NO VERDICT on every post diff, and re-running by name
# cost another ~10 min (seven doc-friction reports, 2026-11-14..15). Now the
# workflows run cheapest-declared first (`declared_minutes`) and each one gets
# what the earlier ones left, less the full share every later one keeps, so the
# sweep's worst case (n x budget) is unchanged and no workflow gets less than
# it did before.
def declared_minutes(workflow: dict, allowed) -> float:
    """Sum of the `timeout-minutes` of the jobs a sweep runs (unset: 360)."""
    total = 0.0
    for job_id in allowed:
        try:
            total += float(((workflow.get("jobs") or {}).get(job_id) or {})
                           .get("timeout-minutes", DEFAULT_JOB_MINUTES))
        except (TypeError, ValueError):
            total += DEFAULT_JOB_MINUTES
    return total


def pooled_budget(per: int, n: int, index: int, elapsed: float) -> int:
    """Seconds for workflow `index` of `n` when each was given `per` (0 = none)."""
    if not per:
        return 0
    return max(per, int(per * n - elapsed) - per * (n - index - 1))


def only_names(spec) -> set | None:
    """`--only a,b.yml` as {"a.yml", "b.yml"}, or None when not given."""
    if not spec:
        return None
    names = set()
    for part in spec.split(","):
        part = os.path.basename(part.strip())
        if part:
            names.add(part if part.endswith((".yml", ".yaml")) else part + ".yml")
    return names


def narrow(args, selected, held):
    """Keep only the `--only` workflows; print the ones it names but missed."""
    names = only_names(getattr(args, "only", None))
    if names is None:
        return selected, held
    seen = {n for n, *_ in selected} | {n for n, *_ in held}
    for name in sorted(names - seen):
        print(f"  [absent] {name}: named by --only but not selected here "
              "(run it by name to ignore the selection)")
    return ([s for s in selected if s[0] in names],
            [h for h in held if h[0] in names])


def _run_selected(args, selected, held, absent=(), changed=()) -> int:
    """Execute the chosen workflows' read-only steps and report."""
    selected, held = narrow(args, selected, held)
    for name, job_id, why in held:
        print(f"  [held  ] {name} / {job_id}: {why}; run it by name with "
              "--force if you have read it")
    if args.list:
        # Step counts say which workflow is the long one (on a platform/ci
        # diff, portfolio-validate.yml holds 107 of 136 steps), so a run can
        # pick the few to run by name.
        total = 0
        for name, workflow, allowed in selected:
            n = len(collect(workflow, only=allowed)[0])
            total += n
            print(f"  [run   ] {name} ({', '.join(sorted(allowed))}; {n} step(s))")
        if selected:
            print(f"  {total} run: step(s) in {len(selected)} workflow(s).")
        return 0

    before = checkout_fingerprint(with_untracked=True)

    failures, out_of_budget, after_skip, ci_only = [], [], [], []
    failed_steps = []
    # Workflows that finished before the checkout first moved: their verdicts
    # still read one tree. Eleven run records to 2026-11-13 lost a whole sweep
    # to UNSTABLE CHECKOUT after editing the run record or committing while
    # it ran, and re-ran every workflow when only the later ones were void.
    stable, drift, latest = [], None, before
    per = getattr(args, "workflow_timeout", 0)
    selected = sorted(selected, key=lambda s: declared_minutes(s[1], s[2]))
    started = time.monotonic()
    for i, (name, workflow, allowed) in enumerate(selected):
        steps, uses_skipped = collect(workflow, only=allowed)
        budget = pooled_budget(per, len(selected), i, time.monotonic() - started)
        print(f"\nRunning {name} locally "
              f"({len(steps)} run: step(s), {len(uses_skipped)} uses: or non-PR step(s) skipped"
              + (f"; budget {budget} s" if budget and budget != per else "") + ")",
              flush=True)
        run_steps(steps, args.timeout, budget)
        failed_steps += [(name, s) for s in steps if s.status == "failed"]
        code = report(name, steps, uses_skipped, False)
        if code == BUDGET_SPENT:
            out_of_budget.append(name)
        elif code == AFTER_SKIP:
            after_skip.append(name)
        elif code == NOTHING_RAN:
            ci_only.append(name)
        elif code != 0:
            failures.append(name)
        if drift is None:
            latest = checkout_fingerprint() or latest
            drift = checkout_drift(before, latest)
            if drift is None:
                stable.append(name)

    # A workflow with no step this machine can run (agent-cross-review.yml's
    # one runnable step reads the PR number, and every diff selects it) is a
    # held job by another name: CI is its only verdict. Counted as no verdict,
    # it made every sweep exit 5, a clean one included (measured 2026-11-15:
    # a one-venture diff, 10/10 workflows passed, exit 5), so the exit code
    # could never say "pass". Named like the held jobs below; a sweep where
    # nothing ran anywhere still has no verdict.
    if ci_only and len(ci_only) == len(selected):
        after_skip, ci_only = after_skip + ci_only, []
    finished = len(selected) - len(out_of_budget) - len(after_skip) - len(ci_only)
    print(f"\n{finished - len(failures)}/{finished} selected "
          f"workflow(s) passed"
          + (f"; {len(out_of_budget)} ran out of budget with no verdict"
             if out_of_budget else "")
          + (f"; {len(after_skip)} with no verdict after a skipped step "
             f"({', '.join(after_skip)})" if after_skip else "") + ".")
    for path, labels in shared_changed_paths(failed_steps, changed)[:CAUSES_SHOWN]:
        print(f"  COMMON CAUSE: {path}, in your diff, is named by {len(labels)} "
              f"of {len(failed_steps)} failed step(s): " + "; ".join(labels[:4])
              + ("; ..." if len(labels) > 4 else "") + ".")
        print("    Fix it first and re-run; the other failures may only be "
              "downstream of it.")
    if out_of_budget:
        print("  Re-run each by name (no budget), in the background: "
              + "; ".join(f"python3 platform/ci/run_workflow_locally.py {n}"
                          for n in out_of_budget))
    if ci_only:
        print("  Not a clean sweep: " + ", ".join(ci_only) + " had no step that "
              "can run outside a pull request's CI. Say so in the pull request.")
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
    # A commit over an unchanged tree: worth saying, because the reader has
    # been told for months that a moved HEAD voids the sweep, and is owed the
    # reason it does not here (`checkout_drift`, "WHAT IS NOT DRIFT").
    if (drift is None and before is not None and latest is not None
            and before.head != latest.head):
        print(f"  note: HEAD moved from {before.head[:9]} to {latest.head[:9]} "
              "while the sweep ran, over identical tracked content (a commit of "
              "files already in the worktree): the verdicts above stand.")
    # Reported last, and after the pass/fail line, because it invalidates that
    # line in *both* directions -- see `checkout_drift`.
    if drift:
        print("\n  UNSTABLE CHECKOUT: " + drift)
        void = [name for name, *_ in selected if name not in stable]
        if stable:
            print("  Read on one tree before it moved (these verdicts stand): "
                  + ", ".join(stable) + ".")
            print("  Void, the tree moved while or before they ran: "
                  + ", ".join(void) + ". Re-run just those, with nothing "
                  "writing to the checkout: "
                  + "; ".join(f"python3 platform/ci/run_workflow_locally.py {n}"
                              for n in void))
        else:
            print("  The verdict above was not taken against one tree, so it is "
                  "not a reading of anything. Re-run on a checkout nothing else "
                  "is writing to, and do not report either result.")
        return 1
    if failures:
        return 1
    if out_of_budget or after_skip:
        unverified = out_of_budget + after_skip
        print(f"\n  NO VERDICT (exit {NO_VERDICT}): no step failed, but "
              + ", ".join(unverified) + " reached no verdict here. Not a pass:"
              "\n  the pull request's CI is the verdict for "
              + ("it" if len(unverified) == 1 else "them")
              + "; say so in the PR, or re-run by name (above) to get one.")
        return NO_VERDICT
    return 0


# Handing a long run to the background. The 120 s default of a foreground
# tool call was the most reported cost of this tool: nine doc-friction entries
# in the twelve hours to 2026-11-12T08:00 said --for-changes "outlasted the
# 120 s foreground timeout" on research, docs or venture diffs, each losing the
# run and starting again with run_in_background. Instead of one more line in
# the always-read guides, the tool does it: under an agent harness (CLAUDECODE
# set, stdout not a terminal) it runs itself as a detached child writing a log,
# relays that log for HANDOFF_S seconds and, if the child is still running,
# says where the log is and exits HANDED_OFF. A run that ends inside the window
# reads exactly as before, exit code included. --foreground turns it off.
HANDOFF_S = 100
HANDED_OFF = 3
CHILD_ENV = "RUN_WORKFLOW_LOCALLY_CHILD"
DONE_PREFIX = "DONE exit "


def wants_handoff(argv, environ=None, isatty=None) -> bool:
    """True when this invocation should run as a detached child (see above)."""
    environ = os.environ if environ is None else environ
    isatty = sys.stdout.isatty if isatty is None else isatty
    if environ.get(CHILD_ENV) or not environ.get("CLAUDECODE"):
        return False
    if "--foreground" in argv or "--list" in argv or "--dry-run" in argv or "-h" in argv or "--help" in argv:
        return False
    try:
        return not isatty()
    except (AttributeError, ValueError):
        return False


def handoff(argv, window=HANDOFF_S, out=None, clock=time.monotonic,
            nap=time.sleep, cmd=None) -> int:
    """Run this script on `argv` as a detached child and relay its log.

    Returns the child's exit code when it ends inside `window` seconds, else
    HANDED_OFF after printing the log path and how to wait for it."""
    out = sys.stdout if out is None else out
    fd, log = tempfile.mkstemp(prefix="run_workflow_locally-", suffix=".log")
    env = dict(os.environ, **{CHILD_ENV: "1", "PYTHONUNBUFFERED": "1"})
    with os.fdopen(fd, "w") as fh:
        child = subprocess.Popen(
            cmd or [sys.executable, os.path.abspath(__file__), *argv],
            stdout=fh, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
            env=env, start_new_session=True)
    pos, end = 0, clock() + window

    def relay():
        nonlocal pos
        with open(log, encoding="utf-8", errors="replace") as fh:
            fh.seek(pos)
            text = fh.read()
            pos = fh.tell()
        lines = [ln for ln in text.splitlines(keepends=True)
                 if not ln.startswith(DONE_PREFIX)]
        out.write("".join(lines))
        out.flush()

    while True:
        code = child.poll()
        relay()
        if code is not None:
            return code
        if clock() >= end:
            out.write(
                f"\n[handed off] Still running after {window} s, detached so a "
                f"foreground tool call cannot cut it off (pid {child.pid}).\n"
                f"  Log: {log}\n"
                f"  Wait: python3 platform/ci/wait_for.py {log} --timeout 110 "
                "(repeat until it exits 0, or start it with run_in_background "
                "--timeout 3600); the last line reads 'DONE exit <code>'.\n"
                "  Until then, do not change tracked files here: an edit voids "
                "every workflow still to finish. Committing files that were "
                "already written when this started is fine (it changes no byte "
                "a step reads); committing one created since, such as a new run "
                "record, is an edit.\n"
                "  Pass --foreground to run attached instead.\n")
            out.flush()
            return HANDED_OFF
        nap(1)


def cli(argv=None) -> int:
    """The command-line entry: hands a long run off (see HANDOFF_S), then main."""
    argv = sys.argv[1:] if argv is None else list(argv)
    if wants_handoff(argv):
        return handoff(argv)
    return main(argv)


def main(argv=None) -> int:
    code = _main(argv)
    if os.environ.get(CHILD_ENV):
        sys.stdout.flush()
        print(f"{DONE_PREFIX}{code}", flush=True)
    return code


def _main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    # Several names run one after another (friction 2026-11-16/17: "Takes one
    # workflow per call", and a re-run of three voided workflows needed three
    # invocations because --only was refused without a sweep).
    ap.add_argument("workflow", nargs="*",
                    help="file name(s) under .github/workflows/ (.yml "
                         "optional); several run in turn, one verdict each")
    ap.add_argument("--for-changes", metavar="BASE", nargs="?", const="origin/main",
                    help="run every workflow the current diff against BASE "
                         "would start (default base origin/main)")
    ap.add_argument("--tree", action="store_true",
                    help="run every verification-only workflow against the "
                         "tree as it stands, ignoring the diff -- answers "
                         "'is this checkout green?' where --for-changes "
                         "answers 'is my diff sound?'")
    # --dry-run is the spelling a run reached for and did not find (friction
    # 2026-11-13: "No --dry-run to list what --for-changes would run").
    ap.add_argument("--list", "--dry-run", dest="list", action="store_true",
                    help="print the steps (or, with no workflow named, the "
                         "workflows --for-changes would select) and run nothing")
    ap.add_argument("--only", metavar="NAMES",
                    help="with --for-changes or --tree: run only these of the "
                         "selected workflows (comma-separated file names, "
                         ".yml optional), e.g. --only doc-refs-ci,prompts-ci; "
                         "on its own: run these workflows by name")
    # Friction 2026-11-17 (session_01XpHqybgdy): checking one supersede-check
    # step meant a full portfolio-validate run past the 100 s handoff (~5 min).
    ap.add_argument("--step", metavar="TEXT",
                    help="with one named workflow: run only the steps whose "
                         "'job / step name' contains TEXT (case-insensitive). "
                         "Setup steps it skips (npm ci, pip install) are not "
                         "run either, so include them in TEXT if it needs them")
    ap.add_argument("--force", action="store_true",
                    help="allow a workflow that is not verification-only")
    ap.add_argument("--no-research-tests", action="store_true",
                    help="with --for-changes, skip the diff's research projects' own test suites")
    ap.add_argument("--no-post-check", action="store_true",
                    help="with --for-changes: sweep even when a changed post "
                         "fails check_post_frontmatter (by default the sweep "
                         "stops first; see POST_PRECHECK_STOP)")
    ap.add_argument("--full", action="store_true",
                    help="with --for-changes on a prose-only (.md/.txt) diff: "
                         "run the heavy workflows too (portfolio-pages, "
                         "portfolio-validate) instead of deferring them to "
                         "the PR's CI; use it when CI is starved")
    ap.add_argument("--no-browser-sweeps", action="store_true",
                    help="with --for-changes: skip the venture browser sweeps "
                         "(venture_sweeps.py) run on the ventures the diff touches")
    ap.add_argument("--timeout", type=int, default=900,
                    help="per-step timeout in seconds (default 900)")
    ap.add_argument("--workflow-timeout", type=int, default=300,
                    help="wall-clock budget per workflow in --tree and "
                         "--for-changes runs, in seconds (default 300, 0 = "
                         "none); steps past it report TIMEOUT instead of "
                         "hanging the sweep. Pooled: time a workflow leaves "
                         "unused goes to the later ones (pooled_budget)")
    ap.add_argument("--foreground", action="store_true",
                    help="never hand a long run to the background (see "
                         "HANDOFF_S); the default under an agent harness is "
                         "to detach after 100 s and print the log path")
    args = ap.parse_args(argv)

    if args.step and (args.tree or args.for_changes or args.only
                      or len(args.workflow) != 1):
        print("--step needs exactly one workflow named, e.g. "
              "portfolio-validate --step supersede", file=sys.stderr)
        return 2

    if args.tree:
        if args.workflow or args.for_changes:
            print("pass --tree on its own, not with a workflow name or "
                  "--for-changes", file=sys.stderr)
            return 2
        return run_tree(args)

    if args.for_changes:
        LOCAL_BASE["ref"] = args.for_changes
    if args.for_changes:
        if args.workflow:
            print("pass a workflow name or --for-changes, not both", file=sys.stderr)
            return 2
        return run_for_changes(args)

    if not args.workflow and args.list:
        # `--list` alone used to fail with "name a workflow"; the question a
        # run asks with it is "what would --for-changes run?", so answer that.
        args.for_changes = LOCAL_BASE["ref"] = "origin/main"
        return run_for_changes(args)

    if args.only and args.workflow:
        print("name workflows or pass --only, not both (--only alone runs "
              "the named workflows; with --for-changes or --tree it narrows "
              "the sweep)", file=sys.stderr)
        return 2
    names = sorted(only_names(args.only)) if args.only else list(args.workflow)

    if not names:
        print("name a workflow, --for-changes to select by diff, or --tree "
              "to sweep the whole checkout", file=sys.stderr)
        return 2

    names = [workflow_file(n) for n in names]
    missing = [n for n in names if not os.path.isfile(os.path.join(WORKFLOWS, n))]
    if missing:
        for n in missing:
            print(f"no such workflow: .github/workflows/{n}", file=sys.stderr)
        return 2
    if len(names) == 1:
        return _run_one(names[0], args)
    codes = []
    for name in names:
        codes.append((name, _run_one(name, args)))
        print(flush=True)
    return combine_named(codes)


def pick_steps(steps, text: str):
    """(steps whose label contains text, labels of the rest), case-insensitive.

    The rest are reported as skipped, so a one-step run never reads as the
    whole workflow passing."""
    want = text.casefold()
    picked = [s for s in steps if want in s.label.casefold()]
    return picked, [s.label for s in steps if s not in picked]


def workflow_file(name: str) -> str:
    """`doc-refs-ci` or `.github/workflows/doc-refs-ci.yml` as `doc-refs-ci.yml`."""
    name = os.path.basename(name.strip())
    return name if name.endswith((".yml", ".yaml")) else name + ".yml"


def combine_named(codes) -> int:
    """One exit for several by-name runs: 0 only when every one passed.

    A usage refusal (2) wins, then a failure (1), then the largest other
    code; a summary line per workflow saves scrolling back for verdicts."""
    print("Summary of the named workflows:")
    for name, code in codes:
        print(f"  exit {code}  {name}")
    values = [c for _, c in codes]
    for worst in (2, 1):
        if worst in values:
            return worst
    return max(values)


def _run_one(name: str, args) -> int:
    """Run one workflow by name: the single-workflow path of `_main`."""
    path = os.path.join(WORKFLOWS, name)
    workflow = load_workflow(path)
    only = None
    if name not in VERIFICATION_ONLY and not args.force:
        # The same per-job screen `--for-changes` applies when it picks this
        # workflow on the session's behalf. Refusing by name what a sweep
        # already runs unasked made the cheap single checks (doc-refs-ci,
        # control-plane-guard) the only ones that needed --force (seven
        # doc-friction reports, 2026-11-13 to 11-16).
        only, held = read_only_jobs(workflow if isinstance(workflow, dict) else {})
        if not only:
            reasons = "; ".join(f"{job} {why}" for job, why in held) or "no jobs"
            print(f"{name} is not on the verification-only list and no job in it\n"
                  f"passes the read-only screen ({reasons}). Re-run with --force "
                  "if you have read it.", file=sys.stderr)
            return 2
        for job, why in held:
            print(f"  [held  ] {name} / {job}: {why}; --force runs it too")

    steps, uses_skipped = collect(workflow, only=only)
    if getattr(args, "step", None):
        steps, unpicked = pick_steps(steps, args.step)
        if not steps:
            print(f"no step of {name} matches --step {args.step!r}; its steps:",
                  file=sys.stderr)
            for label in unpicked:
                print(f"  {label}", file=sys.stderr)
            return 2
        uses_skipped += [f"{label}: not selected by --step" for label in unpicked]

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
          f"({len(steps)} run: step(s), {len(uses_skipped)} uses: or non-PR step(s) skipped)",
          flush=True)
    run_steps(steps, args.timeout)

    code = report(name, steps, uses_skipped, args.force)
    return 1 if code == NOTHING_RAN else code


if __name__ == "__main__":
    raise SystemExit(cli())
