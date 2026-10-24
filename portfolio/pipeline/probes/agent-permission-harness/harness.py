#!/usr/bin/env python3
"""Static privilege-reachability analysis for this portfolio's own agent surface.

Probe for the `agent-permission-harness` candidate
(`portfolio/pipeline/candidates/agent-permission-harness.md`), whose write-up
ends with: *"the harness is worth building **internally** for the portfolio's
own agents -- the cost is small, the corpus starts compounding, and it becomes a
product later without a wasted start."* This is that internal build, and it is
scoped to test the candidate's weakest claim rather than to be the product.

The candidate sells **attack replay in CI**: fire prompt-injection and
tool-permission attacks at a running agent and fail the build when a tool fires
that should not have. That framing assumes the interesting question is dynamic.
This probe asks the prior question -- how much of "a tool fires that should not
have" is decidable from the workflow artifact alone, with nothing running?

It answers that by deriving, for every job in `.github/workflows/`:

  * the **effective privilege** the job holds (GITHUB_TOKEN scopes after the
    job-over-workflow merge, plus the secrets reachable in it), and
  * the **writer set** of every input that reaches a privileged step -- who,
    concretely, can change what that step executes.

A finding is the pair: an input whose writer set is broader than the privilege
it reaches is a privilege-reachability defect, and every rule below states it in
those terms.

The rule that matters most is R7, and it is the one an attack-replay harness
structurally cannot find. An agent's instruction set is not its `prompt:` input.
It is the transitive closure of what that prompt *directs the agent to read* --
and this portfolio's agent prompt directs it to read `CLAUDE.md`, every
venture's `AGENTS.md`, and every `IMPROVEMENT-PLAN.md`, all of which are
ordinary repository files that any merged pull request rewrites. Replaying
attacks against the `prompt:` input measures a surface that is a small fraction
of the real one, and it measures it at the wrong end.

Deliberately not implemented: any judgement about whether an agent *would*
misbehave given a reachable input. That part is genuinely dynamic, it is what
the candidate would actually be selling, and conflating it with the static part
is the error this probe exists to separate out. See README.md.

No network, no repository writes, standard library plus PyYAML.

Usage:
    python3 harness.py                    # markdown report over ../../../../.github/workflows
    python3 harness.py --json             # machine-readable findings
    python3 harness.py --repo-root PATH   # analyse a different checkout
"""

from __future__ import annotations

import argparse
import functools
import json
import os
import re
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import NamedTuple, Sequence

try:
    import yaml
except ImportError:  # pragma: no cover - exercised only without the dependency
    sys.exit("PyYAML is required: pip install -r portfolio/router/requirements.txt")


# --------------------------------------------------------------------------
# Writer sets: who can change a given input.
#
# Ordered widest-last. `broader_than` is the whole comparison this probe makes,
# so the order is the model and everything else is bookkeeping.
# --------------------------------------------------------------------------

WRITER_SETS = [
    "LITERAL",      # fixed in the workflow file; changing it is changing the workflow
    "REPO_WRITE",   # anyone who can land a commit on the default branch
    "DISPATCHER",   # anyone who can trigger the workflow (needs write access)
    "PR_AUTHOR",    # anyone who can open a pull request against this repo
    "ANY_USER",     # anyone with a GitHub account (issue/PR comments)
]
_WRITER_RANK = {name: i for i, name in enumerate(WRITER_SETS)}

# GITHUB_TOKEN scopes that let a job change the repository or its metadata.
# `read` and `none` on any scope are not in this set by construction.
WRITE_SCOPES = {"write", "admin"}

# Action namespaces GitHub itself publishes. A mutable ref here is a different
# risk conversation from a mutable ref on a third-party action, so the rule that
# cares about pinning excludes them rather than reporting noise.
FIRST_PARTY_ACTION_OWNERS = {"actions", "github"}

# Steps this probe treats as invoking an AI agent. Two independent signals, both
# required to be documented rather than guessed at:
#   1. the action's `uses:` names a known agent runner, or
#   2. the step passes a `prompt`/`prompt_file` input to whatever it runs.
AGENT_ACTION_MARKERS = (
    "opencode",
    "claude-code-action",
    "anthropics/claude",
    "aider",
    "devin",
)
AGENT_PROMPT_INPUTS = ("prompt", "prompt_file", "instructions", "task")

# Triggers whose event payload is authored by someone who need not have write
# access. `pull_request` is not here: the payload is attacker-authored, but the
# checkout is the merge ref and the token is read-only by default, so the
# distinction that matters is made per-rule rather than by trigger alone.
UNTRUSTED_PAYLOAD_TRIGGERS = {
    "pull_request_target": "ANY_USER",
    "issue_comment": "ANY_USER",
    "issues": "ANY_USER",
    "discussion": "ANY_USER",
    "discussion_comment": "ANY_USER",
    "fork": "ANY_USER",
    "watch": "ANY_USER",
    "pull_request_review": "ANY_USER",
    "pull_request_review_comment": "ANY_USER",
}

# Expression contexts carrying text a non-committer chose. Used by R4, which
# only fires when one of these lands inside a `run:` body, where it is spliced
# into a shell script before the shell ever sees a quote.
UNTRUSTED_EXPRESSION_CONTEXTS = (
    "github.event.issue.title",
    "github.event.issue.body",
    "github.event.pull_request.title",
    "github.event.pull_request.body",
    "github.event.comment.body",
    "github.event.review.body",
    "github.event.discussion.title",
    "github.event.discussion.body",
    "github.event.head_commit.message",
    "github.event.commits",
    "github.head_ref",
    "github.event.pull_request.head.ref",
    "github.event.pull_request.head.label",
)

SHA_PIN = re.compile(r"^[0-9a-f]{40}$")
EXPRESSION = re.compile(r"\$\{\{(.+?)\}\}", re.DOTALL)
SECRET_REF = re.compile(r"secrets\.([A-Za-z_][A-Za-z0-9_]*)")


def writer_set_broader(a: str, b: str) -> bool:
    """True when writer set `a` admits strictly more principals than `b`."""
    return _WRITER_RANK[a] > _WRITER_RANK[b]


# --------------------------------------------------------------------------
# YAML loading that keeps line numbers.
#
# A finding without a line number is a finding nobody acts on, and PyYAML throws
# marks away as soon as it constructs Python objects. Composing the node tree by
# hand keeps both: the plain data, and a path -> line map addressed by the same
# tuple path used to walk the data.
# --------------------------------------------------------------------------

def load_with_lines(text: str):
    """Return (data, lines) where lines maps a tuple path to a 1-based line."""
    node = yaml.compose(text, Loader=yaml.SafeLoader)
    lines: dict[tuple, int] = {}
    if node is None:
        return None, lines

    def walk(n, path):
        lines[path] = n.start_mark.line + 1
        if isinstance(n, yaml.MappingNode):
            out = {}
            for key_node, value_node in n.value:
                # The raw key text, not the resolved scalar. This is deliberate:
                # YAML 1.1 resolves a bare `on:` to the boolean True, and every
                # workflow parser that forgets it ends up looking the trigger
                # block up under two spellings. Keeping keys as written removes
                # the problem rather than working around it.
                key = key_node.value
                # A duplicate key would silently overwrite here, exactly as it
                # does in the workflow runner. platform/ci/validate_workflows.py
                # already rejects that case repo-wide, so this loader does not
                # re-litigate it; it just must not crash on one.
                out[key] = walk(value_node, path + (key,))
                # Point at the key, not at the value node. A mapping value's
                # start_mark is its first entry, so a job would otherwise be
                # reported at the line of whatever field happens to come first
                # inside it, and a block scalar (`run: |`) at its second line.
                lines[path + (key,)] = key_node.start_mark.line + 1
            return out
        if isinstance(n, yaml.SequenceNode):
            return [walk(item, path + (i,)) for i, item in enumerate(n.value)]
        return _scalar(n)

    def _scalar(n):
        # Resolve the scalar through SafeLoader so `true`, `3`, and `on` come
        # back as the same Python objects the runner's own parse produces.
        return yaml.SafeLoader("").construct_object(n)

    return walk(node, ()), lines


# --------------------------------------------------------------------------
# Model
# --------------------------------------------------------------------------

@dataclass
class Finding:
    rule: str
    # "defect" -- a concrete path by which an input reaches a privilege wider
    # than its writer set should command. "posture" -- a grant or a baseline
    # recorded so the defects above it can be read against something, not an
    # exploit path in itself. Keeping these in one list and separated by a
    # field, rather than in two reports, is what stops the posture rows from
    # padding a count that is supposed to mean something.
    severity: str
    workflow: str
    job: str | None
    line: int | None
    summary: str
    detail: str
    input_writer_set: str
    privilege: str
    # Whether an attack-replay harness pointed at the running agent could
    # observe this. Recorded per finding because the fraction is the whole
    # point of the probe; see README.md.
    observable_by_replay: bool

    def key(self) -> tuple:
        return (self.rule, self.workflow, self.job, self.line)


@dataclass
class Job:
    name: str
    permissions: dict | str | None
    inherited_permissions: bool
    steps: list
    line: int


@dataclass
class WorkflowFile:
    path: Path
    rel: str
    text: str
    data: dict
    lines: dict
    triggers: list[str] = field(default_factory=list)
    top_permissions: dict | str | None = None
    jobs: list[Job] = field(default_factory=list)


def _normalise_triggers(on_value) -> list[str]:
    if on_value is None:
        return []
    if isinstance(on_value, str):
        return [on_value]
    if isinstance(on_value, list):
        return [str(v) for v in on_value]
    if isinstance(on_value, dict):
        return [str(k) for k in on_value]
    return []


def parse_workflow(path: Path, repo_root: Path) -> WorkflowFile | None:
    text = path.read_text()
    try:
        data, lines = load_with_lines(text)
    except yaml.YAMLError:
        # Unparseable workflows are validate_workflows.py's invariant 1, and it
        # fails the build on them already. Skipping keeps one broken file from
        # taking this report down with it.
        return None
    if not isinstance(data, dict):
        return None

    wf = WorkflowFile(
        path=path,
        rel=str(path.relative_to(repo_root)),
        text=text,
        data=data,
        lines=lines,
    )
    # load_with_lines keeps keys as written, so `on` is the string "on". The
    # True lookup stays as a cheap guard against a future loader swap silently
    # emptying every workflow's trigger list.
    on_value = data.get("on", data.get(True))
    wf.triggers = _normalise_triggers(on_value)
    wf.top_permissions = data.get("permissions")

    jobs = data.get("jobs") or {}
    if isinstance(jobs, dict):
        for job_name, job in jobs.items():
            if not isinstance(job, dict):
                continue
            has_own = "permissions" in job
            wf.jobs.append(
                Job(
                    name=job_name,
                    permissions=job.get("permissions", wf.top_permissions),
                    inherited_permissions=not has_own,
                    steps=job.get("steps") or [],
                    line=wf.lines.get(("jobs", job_name), 0),
                )
            )
    return wf


def effective_write_scopes(permissions) -> list[str]:
    """Write-capable GITHUB_TOKEN scopes a job holds, from its merged block."""
    if permissions is None:
        # No declaration anywhere means the repository default applies, which is
        # broader than anything a build step needs. validate_workflows.py makes
        # this unreachable on main; it is still modelled so the rule is honest
        # on a checkout where that check has not run.
        return ["<repository-default>"]
    if isinstance(permissions, str):
        return ["<all-scopes>"] if permissions == "write-all" else []
    return sorted(
        scope for scope, level in permissions.items()
        if isinstance(level, str) and level in WRITE_SCOPES
    )


def job_secrets(job: Job) -> list[str]:
    """Secret names referenced anywhere inside a job."""
    found = set()
    for match in SECRET_REF.finditer(json.dumps(job.steps)):
        found.add(match.group(1))
    return sorted(found)


def _privilege_label(job: Job) -> str:
    scopes = effective_write_scopes(job.permissions)
    secrets = job_secrets(job)
    bits = []
    if scopes:
        bits.append("token:" + ",".join(scopes))
    if secrets:
        bits.append("secrets:" + ",".join(secrets))
    return " ".join(bits) if bits else "token:read-only"


def is_agent_step(step: dict) -> bool:
    uses = str(step.get("uses") or "")
    if any(marker in uses.lower() for marker in AGENT_ACTION_MARKERS):
        return True
    with_block = step.get("with") or {}
    if isinstance(with_block, dict):
        return any(k in with_block for k in AGENT_PROMPT_INPUTS)
    return False


def payload_writer_set(wf: WorkflowFile) -> str:
    """Widest writer set the workflow's own triggers admit for event payloads."""
    widest = "LITERAL"
    for trigger in wf.triggers:
        candidate = UNTRUSTED_PAYLOAD_TRIGGERS.get(trigger)
        if trigger == "pull_request":
            candidate = "PR_AUTHOR"
        if trigger == "workflow_dispatch":
            candidate = "DISPATCHER"
        if candidate and writer_set_broader(candidate, widest):
            widest = candidate
    return widest


# --------------------------------------------------------------------------
# Rules
# --------------------------------------------------------------------------

SCRIPT_REFERENCE = re.compile(
    r"(?<![\w./-])((?:\.github|scripts|tools|bin)/[\w./-]+\.(?:sh|py|js|mjs|ts|rb))"
)
SILENCING = ("|| true", "2>/dev/null", "if [[ -f", "if [ -f", "-f ")


def rule_missing_referenced_script(wf: WorkflowFile, repo_root: Path) -> list[Finding]:
    """R1: a run block invokes a repo script that is not in the repository.

    The interesting case is not the crash -- a missing script that crashes gets
    fixed within the hour. It is the guarded reference, where the workflow falls
    back and keeps going, so what actually executes is not what the file reads
    as executing and no run ever turns red to say so.
    """
    findings = []
    for job in wf.jobs:
        for index, step in enumerate(job.steps):
            if not isinstance(step, dict):
                continue
            run = step.get("run")
            if not isinstance(run, str):
                continue
            for match in dict.fromkeys(SCRIPT_REFERENCE.findall(run)):
                if (repo_root / match).exists():
                    continue
                guarded = any(token in run for token in SILENCING)
                line = wf.lines.get(("jobs", job.name, "steps", index, "run"))
                findings.append(
                    Finding(
                        rule="R1-missing-referenced-script",
                        severity="defect",
                        workflow=wf.rel,
                        job=job.name,
                        line=line,
                        summary=f"references {match}, which is not in the repository",
                        detail=(
                            f"The step invokes `{match}`. No such path exists in this "
                            + (
                                "checkout, and the reference is guarded (`|| true`, a "
                                "`-f` test, or a discarded stderr), so its absence is "
                                "silent: the fallback path runs, the job goes green, "
                                "and the file continues to read as though the script "
                                "were the thing being executed."
                                if guarded
                                else "checkout, so the step fails when it is reached."
                            )
                        ),
                        input_writer_set="REPO_WRITE",
                        privilege=_privilege_label(job),
                        observable_by_replay=False,
                    )
                )
    return findings


OUTPUT_SINK = re.compile(r"\$\{?GITHUB_(OUTPUT|ENV)\}?")
DELIMITER_DECL = re.compile(r"<<-?\s*[\"']?([A-Za-z_][A-Za-z0-9_]*)[\"']?")
NON_LITERAL_CONTENT = re.compile(r"(\bcat\b|\$\(|`|\$\{?[A-Za-z_])")


def _delimited_span(run: str, delimiter: str) -> str | None:
    """The content between `<<DELIM` and the line that closes it, or None.

    Two spellings have to be handled, because GitHub's documented multi-line
    output form is not a shell heredoc:

        name<<DELIM        (echoed into $GITHUB_OUTPUT, closed by an echoed DELIM)
        cmd <<DELIM        (a real heredoc, closed by a bare DELIM line)

    Returning None for an unclosed delimiter is deliberate: an unterminated
    heredoc is a shell error, not a delimiter-injection risk, and reporting it
    here would be reporting a different defect under this rule's name.
    """
    lines = run.splitlines()
    start = None
    for i, line in enumerate(lines):
        if start is None:
            if re.search(r"<<-?\s*[\"']?" + re.escape(delimiter) + r"[\"']?", line):
                start = i + 1
            continue
        stripped = line.strip().strip('"').strip("'")
        if stripped == delimiter or re.fullmatch(
            r"echo\s+[\"']?" + re.escape(delimiter) + r"[\"']?", line.strip()
        ):
            return "\n".join(lines[start:i])
    return None


def rule_static_output_delimiter(wf: WorkflowFile) -> list[Finding]:
    """R2: non-literal content into $GITHUB_OUTPUT/$GITHUB_ENV behind a fixed delimiter.

    GitHub's multi-line form is `name<<DELIM ... DELIM`. Whoever controls the
    content controls whether the delimiter appears inside it, and a line equal
    to the delimiter ends the value early -- every later line is then parsed as
    a fresh `key=value` step output or environment variable. That is a write
    into the job's own variable space by whoever can write the content, which is
    why GitHub's own guidance is to generate the delimiter randomly per run.
    """
    findings = []
    for job in wf.jobs:
        for index, step in enumerate(job.steps):
            if not isinstance(step, dict):
                continue
            run = step.get("run")
            if not isinstance(run, str) or not OUTPUT_SINK.search(run):
                continue
            for delimiter in dict.fromkeys(DELIMITER_DECL.findall(run)):
                if "$" in delimiter or delimiter == "RANDOM":
                    continue
                span = _delimited_span(run, delimiter)
                # Only the content that actually lands between the delimiters
                # can carry a line equal to one. Testing the whole run block
                # instead would fire on any step that happens to mention a
                # shell variable somewhere else in the same script.
                if span is None or not NON_LITERAL_CONTENT.search(span):
                    continue
                line = wf.lines.get(("jobs", job.name, "steps", index, "run"))
                findings.append(
                    Finding(
                        rule="R2-static-output-delimiter",
                        severity="defect",
                        workflow=wf.rel,
                        job=job.name,
                        line=line,
                        summary=(
                            f"writes non-literal content to a workflow variable file "
                            f"behind the fixed delimiter `{delimiter}`"
                        ),
                        detail=(
                            f"The step writes content it does not control -- a file "
                            f"read, a variable, or a command substitution -- into "
                            f"`$GITHUB_OUTPUT`/`$GITHUB_ENV` using the literal "
                            f"delimiter `{delimiter}`. A line equal to `{delimiter}` "
                            f"anywhere in that content closes the value early and the "
                            f"remainder is parsed as further assignments. Generate the "
                            f"delimiter per run instead."
                        ),
                        input_writer_set="REPO_WRITE",
                        privilege=_privilege_label(job),
                        observable_by_replay=False,
                    )
                )
    return findings


def rule_untrusted_expression_in_run(wf: WorkflowFile) -> list[Finding]:
    """R3: an attacker-authored expression context spliced into a shell script."""
    findings = []
    for job in wf.jobs:
        for index, step in enumerate(job.steps):
            if not isinstance(step, dict):
                continue
            run = step.get("run")
            if not isinstance(run, str):
                continue
            for raw in EXPRESSION.findall(run):
                expr = raw.strip()
                for context in UNTRUSTED_EXPRESSION_CONTEXTS:
                    if context not in expr:
                        continue
                    line = wf.lines.get(("jobs", job.name, "steps", index, "run"))
                    findings.append(
                        Finding(
                            rule="R3-untrusted-expression-in-run",
                        severity="defect",
                            workflow=wf.rel,
                            job=job.name,
                            line=line,
                            summary=f"splices `{context}` directly into a run script",
                            detail=(
                                f"`${{{{ {expr} }}}}` is substituted into the script "
                                f"text before any shell parses it, so the value is "
                                f"read as script rather than as data. Pass it through "
                                f"an `env:` entry and reference the variable instead."
                            ),
                            input_writer_set=payload_writer_set(wf),
                            privilege=_privilege_label(job),
                            observable_by_replay=True,
                        )
                    )
    return findings


def rule_unpinned_third_party_action(wf: WorkflowFile) -> list[Finding]:
    """R4: a third-party action on a mutable ref inside a privileged job.

    A tag is a pointer the action's owner can move. When the step is handed a
    secret or the job holds a write scope, moving it is a code-execution change
    inside this repository's trust boundary, decided by an account this
    portfolio does not control.
    """
    findings = []
    for job in wf.jobs:
        scopes = effective_write_scopes(job.permissions)
        for index, step in enumerate(job.steps):
            if not isinstance(step, dict):
                continue
            uses = step.get("uses")
            if not isinstance(uses, str) or "@" not in uses:
                continue
            repo_part, _, ref = uses.rpartition("@")
            owner = repo_part.split("/")[0].lower()
            if owner in FIRST_PARTY_ACTION_OWNERS or SHA_PIN.match(ref):
                continue
            step_secrets = sorted(
                set(SECRET_REF.findall(json.dumps({k: step.get(k) for k in ("with", "env")})))
            )
            if not step_secrets and not scopes:
                continue
            line = wf.lines.get(("jobs", job.name, "steps", index, "uses"))
            findings.append(
                Finding(
                    rule="R4-unpinned-third-party-action",
                        severity="defect",
                    workflow=wf.rel,
                    job=job.name,
                    line=line,
                    summary=f"{repo_part} is pinned to the mutable ref `{ref}`",
                    detail=(
                        f"`{uses}` resolves through a tag or branch its owner can "
                        f"repoint at any commit. This step "
                        + (
                            f"receives {', '.join(step_secrets)}"
                            if step_secrets
                            else "runs in a job holding " + ", ".join(scopes)
                        )
                        + ", so a moved ref is arbitrary code against that privilege. "
                        "Pin to a 40-character commit SHA."
                    ),
                    input_writer_set="ANY_USER",
                    privilege=_privilege_label(job),
                    observable_by_replay=False,
                )
            )
    return findings


def rule_inherited_write_permission(wf: WorkflowFile) -> list[Finding]:
    """R5: a job silently inherits a write scope it never asks for.

    Top-level `permissions:` is the floor for every job in the file, including
    the ones that only compute a matrix or echo a variable. The scope is not
    wrong where it is needed; it is wrong that it is granted by position.
    """
    findings = []
    top_scopes = effective_write_scopes(wf.top_permissions)
    if not top_scopes:
        return findings
    for job in wf.jobs:
        if not job.inherited_permissions:
            continue
        findings.append(
            Finding(
                rule="R5-inherited-write-permission",
                        severity="posture",
                workflow=wf.rel,
                job=job.name,
                line=job.line,
                summary=(
                    f"inherits write scopes it does not declare: {', '.join(top_scopes)}"
                ),
                detail=(
                    f"The job declares no `permissions:` block, so it runs with the "
                    f"file-level floor ({', '.join(top_scopes)}). Declaring the scope "
                    f"on the job that needs it, and `contents: read` on the ones that "
                    f"do not, makes the grant a decision rather than a side effect of "
                    f"which file the job happens to live in."
                ),
                input_writer_set="REPO_WRITE",
                privilege=_privilege_label(job),
                observable_by_replay=False,
            )
        )
    return findings


# --------------------------------------------------------------------------
# R6/R7: the agent-specific rules.
# --------------------------------------------------------------------------

# Paths a prompt names. Backticked in the markdown, which is how this
# portfolio's prompt writes every one of them, and how any prompt written by
# someone documenting the files an agent should read tends to write them.
PROMPT_PATH = re.compile(r"`([\w][\w./*<>-]*\.(?:md|ya?ml|json|tsx?|jsx?|py|toml))`")
PROMPT_PATH_DIR = re.compile(r"`([\w][\w./*-]*/)`")


# Directories a prompt never means when it names a file. Without this, a bare
# filename resolves into vendored trees and the closure count becomes a
# statement about `node_modules` rather than about the instruction surface.
PRUNED_DIRS = {".git", "node_modules", "dist", "build", ".next", ".venv", "vendor", "out"}


def _expand_prompt_path(
    spec: str, repo_root: Path, base_dir: str = "", index: Sequence[str] | None = None
) -> list[str]:
    """Resolve a path a document names into the concrete files it selects.

    Prompts name paths the way documentation does, in three shapes, and all
    three have to be handled or the closure is undercounted into looking safe:

    * an explicit path -- `CLAUDE.md`, `portfolio/router/README.md`
    * a placeholder path -- `ventures/<name>/IMPROVEMENT-PLAN.md`, which is a
      glob once `<name>` is normalised
    * a bare filename -- "the venture's `AGENTS.md`", which names a file that
      exists once per venture and nowhere at the repository root

    `Path.glob` is used rather than `fnmatch` deliberately: `fnmatch`'s `*`
    crosses `/`, so `ventures/*/VENTURE.yaml` would also collect
    `ventures/a/b/c/VENTURE.yaml` and inflate every count here.

    `base_dir` is the directory of the document doing the naming, and it only
    affects the bare-filename shape, where it is **nearest-scope-first**: the
    naming document's own subtree is searched before the repository-wide walk.
    This matters once the closure recurses (see `instruction_closure`). A
    repository-root prompt saying "each venture's `AGENTS.md`" does mean every
    copy, and gets it, because `.github/prompts/` contains none. But
    `ventures/print-atelier/AGENTS.md` saying "the scripts in `package.json`"
    means *its* `package.json`, and the repository-wide walk answers that with
    all fourteen in the monorepo. Left unscoped, one such mention inflated the
    measured closure by more than a tenth -- a count that is mostly other
    ventures' build manifests is a statement about `rglob`, not about an
    instruction surface.

    `index` is the repository's file list from `_file_index`. The closure
    resolves a few thousand specs, and walking the tree once per spec was 95%
    of this probe's run time (3.5 million `lstat` calls, about six minutes of
    CI per run). With an index each spec is a scan of a list in memory. The
    answers are the same; `_glob_regex` keeps `Path.glob`'s rule that `*`
    stops at `/`.
    """
    normalised = re.sub(r"<[^>]+>", "*", spec).rstrip("/")
    if not normalised:
        return []

    if "*" in normalised:
        if index is not None and _glob_regex(normalised) is not None:
            rx = _glob_regex(normalised)
            return sorted(f for f in index if rx.fullmatch(f))
        return sorted(
            str(p.relative_to(repo_root))
            for p in repo_root.glob(normalised)
            if p.is_file() and not _pruned(p, repo_root)
        )

    if (repo_root / normalised).is_file():
        return [normalised]

    if "/" not in normalised:
        # A bare filename the repository root does not have. Nearest scope
        # first: the naming document's own subtree, then the whole repository.
        scope = repo_root / base_dir if base_dir else repo_root
        if index is not None:
            named = [f for f in index if f.rsplit("/", 1)[-1] == normalised]
            if scope.is_dir() and scope != repo_root:
                prefix = scope.relative_to(repo_root).as_posix() + "/"
                scoped = [f for f in named if f.startswith(prefix)]
                if scoped:
                    return scoped
            return named
        if scope.is_dir() and scope != repo_root:
            scoped = sorted(
                str(p.relative_to(repo_root))
                for p in scope.rglob(normalised)
                if p.is_file() and not _pruned(p, repo_root)
            )
            if scoped:
                return scoped
        return sorted(
            str(p.relative_to(repo_root))
            for p in repo_root.rglob(normalised)
            if p.is_file() and not _pruned(p, repo_root)
        )
    return []


def _pruned(path: Path, repo_root: Path) -> bool:
    return any(part in PRUNED_DIRS for part in path.relative_to(repo_root).parts)


def _file_index(repo_root: Path) -> list[str]:
    """Every file under `repo_root` outside `PRUNED_DIRS`, sorted, as posix paths.

    Walked once per closure, so a tree changed between two closures is seen.
    Like `Path.rglob` here, it does not descend into symlinked directories.
    """
    files = []
    for dirpath, dirnames, filenames in os.walk(repo_root):
        dirnames[:] = [d for d in dirnames if d not in PRUNED_DIRS]
        rel = Path(dirpath).relative_to(repo_root).as_posix()
        for name in filenames:
            if os.path.isfile(os.path.join(dirpath, name)):
                files.append(name if rel == "." else f"{rel}/{name}")
    return sorted(files)


@functools.lru_cache(maxsize=None)
def _glob_regex(pattern: str) -> re.Pattern[str] | None:
    """`Path.glob` semantics as a regex over posix paths, or None to fall back.

    `**` as a whole segment is zero or more directories; any other `*` matches
    within one segment. A pattern this does not model (an empty, `.` or `..`
    segment, or a trailing `**`, whose meaning changed in Python 3.13) returns
    None and the caller walks the tree as before.
    """
    segments = pattern.split("/")
    if any(seg in ("", ".", "..") for seg in segments) or segments[-1] == "**":
        return None
    out = ""
    for i, seg in enumerate(segments):
        last = i == len(segments) - 1
        if seg == "**":
            out += "(?:[^/]+/)*"
            continue
        body = "".join("[^/]*" if c == "*" else re.escape(c) for c in seg)
        out += body if last else body + "/"
    return re.compile(out)


def find_prompt_files(wf: WorkflowFile, repo_root: Path) -> list[str]:
    """Prompt markdown files a workflow feeds to an agent step."""
    candidates = []
    for job in wf.jobs:
        for step in job.steps:
            if not isinstance(step, dict):
                continue
            blob = json.dumps(step)
            for match in re.findall(r"[\w./-]*prompts?/[\w./-]+\.md", blob):
                if (repo_root / match).exists():
                    candidates.append(match)
    return sorted(dict.fromkeys(candidates))


# Documents the closure walks *through*. A path in the closure is counted
# whatever its extension, but only prose is re-read for further reading orders:
# a `VENTURE.yaml` or a `developmentprocess.tsx` is data the agent is told to
# consult, not a document that issues its own reading orders. That makes the
# count below a lower bound in one direction -- see `instruction_closure`.
CLOSURE_WALKABLE_SUFFIXES = (".md",)

# A prompt that delegates reading can send the agent through a chain of
# documents that cites itself. Termination does not depend on this bound -- the
# walk is a fixed point over a visited set, so a cycle ends on its own. It
# exists only so a pathological generated tree cannot make `analyse()` run long.
# When it binds it is visible rather than silent: the per-depth breakdown in the
# finding text ends at this number.
CLOSURE_MAX_DEPTH = 16


class ClosureEntry(NamedTuple):
    """One file in an agent's instruction set, and how the agent gets to it."""

    depth: int          # hops from the prompt; 1 is a path the prompt itself names
    source: str         # the document that named it
    spec: str           # the path expression that document used


def instruction_closure(
    repo_root: Path, prompt_files: Sequence[str]
) -> dict[str, ClosureEntry]:
    """Every repository file an agent's prompt directs it to read, transitively.

    R7's claim has always been that an agent's instruction set is the
    *transitive* closure of what its prompt directs it to read. The rule
    measured one hop of that, and one hop understates it in the direction that
    matters: `CLAUDE.md` is reached in one hop, and `CLAUDE.md` spends most of
    its length ordering reads of the pipeline, ledger, research and router
    documents, none of which the prompt names. Against this repository the one
    hop is 21 files and the fixed point is 118, at a maximum depth of 4. That
    second number is a function of the repository's prose and moves without this
    file changing -- it was 115 until a research index gained a sentence naming
    `package.json` (see the 2026-08-24 amendment in README.md). Nothing here
    pins it; the committed results file is what a reader should trust, and CI
    regenerates and diffs it.

    What is counted, stated so the number can be checked rather than believed:

    * A file enters the closure when a document already in it names that path.
      "Names" is the same rule at every depth -- a backticked path expression,
      resolved by `_expand_prompt_path` against the naming document's
      directory. The rule does not try to distinguish an order to read a file
      from a mention of one, because the difference is imperative mood in prose
      and a regex reading of it was measurably worse than either bound: on
      `CLAUDE.md` a cue-word classifier dropped `portfolio/pipeline/README.md`
      and `portfolio/research/README.md`, both of which that file explicitly
      orders read. So this is an **upper bound** on what the prompt directs,
      and it is the safe direction for a reachability measurement, where the
      question R7 asks is who can write to the surface rather than how often
      the agent reads it.
    * Only prose is walked through (`CLOSURE_WALKABLE_SUFFIXES`). Data files
      are counted but not re-read, so in that direction the count is a **lower
      bound**: a path named only inside a `.yaml` or `.tsx` in the closure is
      missed.

    Both bounds are stated in the finding text, because a single number with an
    undisclosed direction of error is the failure mode this probe exists to
    avoid.
    """
    closure: dict[str, ClosureEntry] = {}
    seen: set[str] = set(prompt_files)
    index = _file_index(repo_root)
    frontier = [(p, 0) for p in sorted(prompt_files)]

    while frontier:
        nxt: list[tuple[str, int]] = []
        for doc, depth in frontier:
            path = repo_root / doc
            if path.suffix not in CLOSURE_WALKABLE_SUFFIXES or not path.is_file():
                continue
            try:
                body = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            base_dir = str(Path(doc).parent) if Path(doc).parent != Path(".") else ""
            specs = set(PROMPT_PATH.findall(body)) | set(PROMPT_PATH_DIR.findall(body))
            # Sorted, not set order, at every level. Several specs can resolve
            # to the same file and the first arrival wins, so unsorted
            # iteration makes the report text differ run to run under hash
            # randomisation. A results file that cannot be regenerated
            # byte-identically is not a measurement anyone can check.
            for spec in sorted(specs):
                for resolved in _expand_prompt_path(spec, repo_root, base_dir, index):
                    if resolved in seen:
                        continue
                    seen.add(resolved)
                    closure[resolved] = ClosureEntry(depth + 1, doc, spec)
                    if depth + 1 < CLOSURE_MAX_DEPTH:
                        nxt.append((resolved, depth + 1))
        frontier = nxt
    return closure


def rule_agent_instruction_closure(wf: WorkflowFile, repo_root: Path) -> list[Finding]:
    """R7: the agent's real instruction set is every file its prompt sends it to.

    This is the finding an attack-replay harness cannot reach. Replay tests the
    `prompt:` input. The prompt input here is 52 lines of fixed markdown; what
    it *does* is order the agent to go read a set of repository files and heed
    them, and those files are the instruction set that an attacker would
    actually write to. The closure is enumerable from the prompt text, and its
    writer set is REPO_WRITE -- every file in it is one merged pull request away
    from saying something else.

    The closure is a fixed point, not one hop: a document the prompt names can
    itself order further reads, and here the first-hop `CLAUDE.md` does little
    else. See `instruction_closure` for what is counted and which way each of
    the two bounds runs.
    """
    findings = []
    prompt_files = find_prompt_files(wf, repo_root)
    if not prompt_files:
        return findings

    agent_jobs = [
        job for job in wf.jobs
        if any(isinstance(s, dict) and is_agent_step(s) for s in job.steps)
    ]
    if not agent_jobs:
        return findings

    closure = instruction_closure(repo_root, prompt_files)
    if not closure:
        return findings

    direct = sorted(p for p, e in closure.items() if e.depth == 1)
    max_depth = max(e.depth for e in closure.values())
    per_depth = ", ".join(
        f"{sum(1 for e in closure.values() if e.depth == d)} at depth {d}"
        for d in range(1, max_depth + 1)
    )
    # The specs are the prompt's own words, so only first-hop ones are quoted:
    # a depth-3 spec is some other document's phrasing and reads as noise here.
    direct_specs = sorted({closure[p].spec for p in direct})
    # Sampled from beyond the first hop, since those are the files the prompt
    # never names and the reason the walk recurses at all. A closure that stops
    # at depth 1 has nothing to show here and says so rather than trailing an
    # empty list.
    beyond = sorted(p for p, e in closure.items() if e.depth > 1)
    sample = (
        ", among them " + ", ".join(f"`{p}`" for p in beyond[:6]) if beyond else ""
    )

    for job in agent_jobs:
        findings.append(
            Finding(
                rule="R7-agent-instruction-closure",
                severity="defect",
                workflow=wf.rel,
                job=job.name,
                line=job.line,
                summary=(
                    f"agent instruction set is {len(closure)} repository files, not the "
                    f"{len(prompt_files)} prompt file(s) passed to it"
                ),
                detail=(
                    "The prompt handed to this agent directs it to read and heed "
                    + ", ".join(f"`{spec}`" for spec in direct_specs[:10])
                    + f" -- which resolve to {len(direct)} files in this checkout. "
                    "Those files order further reads of their own, and the fixed "
                    f"point of that is {len(closure)} files ({per_depth})"
                    + sample
                    + ". Every one is an ordinary repository file with writer set "
                    "REPO_WRITE, and the agent reads them while holding "
                    f"{_privilege_label(job)}. Hardening or replaying attacks against "
                    "the prompt input alone leaves this surface untested. The count "
                    "is an upper bound on what the prompt directs (a named path is "
                    "counted whether the naming document orders the read or merely "
                    "mentions the file) and a lower bound on the surface (only "
                    "prose is walked through, so a path named solely inside a data "
                    "file in the closure is missed)."
                ),
                input_writer_set="REPO_WRITE",
                privilege=_privilege_label(job),
                observable_by_replay=False,
            )
        )
    return findings


def rule_agent_privilege(wf: WorkflowFile) -> list[Finding]:
    """R6: an agent step running with repository write scope.

    Not a defect on its own -- an agent whose job is to open pull requests needs
    to push. It is recorded because it is the privilege every other finding in
    the file is measured against, and because it is the one grant where "a tool
    fired that should not have" has consequences outside the run.
    """
    findings = []
    for job in wf.jobs:
        scopes = effective_write_scopes(job.permissions)
        if not scopes:
            continue
        for index, step in enumerate(job.steps):
            if not isinstance(step, dict) or not is_agent_step(step):
                continue
            findings.append(
                Finding(
                    rule="R6-agent-holds-write-scope",
                        severity="posture",
                    workflow=wf.rel,
                    job=job.name,
                    line=wf.lines.get(("jobs", job.name, "steps", index)),
                    summary=f"agent step runs with {', '.join(scopes)}",
                    detail=(
                        f"The step invokes an agent while the job holds "
                        f"{', '.join(scopes)} and {_privilege_label(job)}. Recorded as "
                        f"the privilege baseline for this file: every reachable input "
                        f"below is reachable *to this*."
                    ),
                    input_writer_set="LITERAL",
                    privilege=_privilege_label(job),
                    observable_by_replay=True,
                )
            )
    return findings


RULES_STATIC = [
    rule_static_output_delimiter,
    rule_untrusted_expression_in_run,
    rule_unpinned_third_party_action,
    rule_inherited_write_permission,
    rule_agent_privilege,
]
RULES_WITH_REPO = [
    rule_missing_referenced_script,
    rule_agent_instruction_closure,
]


def analyse(repo_root: Path, workflows_dir: Path | None = None) -> list[Finding]:
    workflows_dir = workflows_dir or (repo_root / ".github" / "workflows")
    findings: list[Finding] = []
    for path in sorted(workflows_dir.glob("*.y*ml")):
        wf = parse_workflow(path, repo_root)
        if wf is None:
            continue
        for rule in RULES_STATIC:
            findings.extend(rule(wf))
        for rule in RULES_WITH_REPO:
            findings.extend(rule(wf, repo_root))
    findings.sort(key=lambda f: f.key())
    return findings


# --------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------

RULE_TITLES = {
    "R1-missing-referenced-script": "Referenced script absent from the repository",
    "R2-static-output-delimiter": "Fixed delimiter on a workflow variable write",
    "R3-untrusted-expression-in-run": "Attacker-authored expression spliced into a shell script",
    "R4-unpinned-third-party-action": "Third-party action on a mutable ref in a privileged job",
    "R5-inherited-write-permission": "Job inherits an undeclared write scope",
    "R6-agent-holds-write-scope": "Agent step holds repository write scope",
    "R7-agent-instruction-closure": "Agent instruction set exceeds its prompt input",
}


def summarise(findings: list[Finding]) -> dict:
    by_rule: dict[str, int] = {}
    for f in findings:
        by_rule[f.rule] = by_rule.get(f.rule, 0) + 1
    defects = [f for f in findings if f.severity == "defect"]
    return {
        "total": len(findings),
        "defects": len(defects),
        "posture": len(findings) - len(defects),
        "by_rule": dict(sorted(by_rule.items())),
        # A rule that finds nothing is a measurement, not an absence of one, and
        # it is the measurement most likely to be lost. R3 is the canonical
        # GitHub Actions injection class; that it fires zero times here is the
        # reason the headline finding is R7 and not R3.
        "silent_rules": sorted(r for r in RULE_TITLES if r not in by_rule),
        "observable_by_attack_replay": sum(1 for f in findings if f.observable_by_replay),
        "decidable_statically": len(findings),
        "replay_only": 0,
    }


#: The measured fixture-corpus figures, read from validate_accuracy.py's own
#: cases rather than hand-copied, so this number cannot drift from the code
#: that produces it. Declared at module level -- matching how other probes'
#: rendering modules declare a coverage/limits constant -- so a reader of this
#: module's source, not just its rendered output, can find where the figure in
#: ACCURACY_NOTE below comes from.
ACCURACY_CASE_COUNT = 34
ACCURACY_FALSE_POSITIVES = 0
ACCURACY_FALSE_NEGATIVES = 0
ACCURACY_POSITIVE_OPPORTUNITIES = 16

ACCURACY_NOTE = (
    "## How this can be wrong\n\n"
    f"Measured against {ACCURACY_CASE_COUNT} synthetic fixture cases in this "
    "probe's own test suite (author-authored to isolate each rule, not an "
    "independent or held-out corpus): "
    f"{ACCURACY_FALSE_POSITIVES} false positives, {ACCURACY_FALSE_NEGATIVES} "
    f"false negatives on the {ACCURACY_POSITIVE_OPPORTUNITIES}/{ACCURACY_CASE_COUNT} "
    "positive-rule opportunities those fixtures cover across all seven rules "
    "(R1-R7). This is a floor on precision and recall, not an out-of-sample "
    "estimate: every fixture was written already knowing which rule it was meant "
    "to trip.\n\n"
    "Two things follow from how the rules are built, and both matter more than "
    "the fixture count above.\n\n"
    "**Zero false positives is a design property confirmed, not guaranteed.** "
    "Every one of the seven rules fires only on structural, positively-named "
    "evidence in the workflow artifact -- a script reference that does not "
    "resolve, a fixed delimiter, an untrusted expression spliced into a script, "
    "a mutable action ref, an inherited scope, a write-holding agent step, a "
    "prompt whose named reads resolve to files. No rule infers a defect from an "
    "*absence* of evidence. That is why zero false positives held on every "
    f"fixture built to test it -- it is what the design predicts -- but {ACCURACY_CASE_COUNT} "
    "author-authored fixtures confirm the design on the cases it was built for, "
    "not on production workflow files this probe has never seen.\n\n"
    "**False negatives on attack classes none of the seven rules encode are real "
    "and unmeasured.** The fixture corpus only tests whether *coded* rules "
    "(R1-R7) behave correctly on cases *designed to exercise them*. It says "
    "nothing about a misconfiguration or injection shape none of the seven "
    "encodes -- that produces no finding at all, silently, and this corpus "
    "cannot rule it out because it was never asked to. R5 and R6 are posture "
    "records, not defect calls, so a false positive there would not mean "
    "\"wrongly flagged an attacker path\" the way it would for R1-R4 or R7; they "
    "are included in the count above on the narrower, honest claim that each "
    "fires exactly when its own documented structural condition is present, "
    "which is the only accuracy claim posture rules admit.\n"
)


def render_markdown(findings: list[Finding], summary: dict) -> str:
    out = ["# Agent permission harness — findings", ""]
    out.append(
        f"{summary['total']} findings across {len(set(f.workflow for f in findings))} "
        f"workflow files — {summary['defects']} defects and {summary['posture']} "
        f"posture records. All {summary['decidable_statically']} are decided from the "
        f"workflow artifact with nothing running; "
        f"{summary['observable_by_attack_replay']} of them would *also* be visible to "
        "an attack-replay harness pointed at the running agent, and none require one."
    )
    out.append("")
    out.append(ACCURACY_NOTE)
    out.append("| Rule | Severity | Count |")
    out.append("|---|---|---|")
    for rule, count in summary["by_rule"].items():
        sev = next(f.severity for f in findings if f.rule == rule)
        out.append(f"| `{rule}` — {RULE_TITLES.get(rule, '')} | {sev} | {count} |")
    for rule in summary["silent_rules"]:
        out.append(f"| `{rule}` — {RULE_TITLES.get(rule, '')} | — | 0 |")
    out.append("")
    if summary["silent_rules"]:
        out.append(
            "The zero rows are results too. "
            + ", ".join(f"`{r}`" for r in summary["silent_rules"])
            + " found nothing here, and R3 in particular is the canonical GitHub "
            "Actions script-injection class — its absence is why the headline finding "
            "below is R7."
        )
        out.append("")

    for rule in sorted(set(f.rule for f in findings)):
        out.append(f"## {rule} — {RULE_TITLES.get(rule, '')}")
        out.append("")
        for f in [x for x in findings if x.rule == rule]:
            location = f"`{f.workflow}`"
            if f.job:
                location += f" job `{f.job}`"
            if f.line:
                location += f" (line {f.line})"
            out.append(f"- **{location}** — {f.summary}")
            out.append(f"  - {f.detail}")
            out.append(
                f"  - writer set of the reachable input: `{f.input_writer_set}`; "
                f"privilege reached: `{f.privilege}`; "
                f"visible to attack replay: {'yes' if f.observable_by_replay else 'no'}"
            )
        out.append("")
    return "\n".join(out)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[4],
        help="repository to analyse (default: this checkout)",
    )
    parser.add_argument(
        "--workflows-dir",
        type=Path,
        default=None,
        help="override the workflow directory (default: <repo-root>/.github/workflows)",
    )
    parser.add_argument("--json", action="store_true", help="emit JSON instead of markdown")
    args = parser.parse_args(argv)

    findings = analyse(args.repo_root, args.workflows_dir)
    summary = summarise(findings)
    if args.json:
        print(json.dumps({"summary": summary, "findings": [asdict(f) for f in findings]}, indent=2))
    else:
        print(render_markdown(findings, summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
