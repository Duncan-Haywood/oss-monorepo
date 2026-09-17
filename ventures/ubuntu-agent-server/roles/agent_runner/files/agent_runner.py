#!/usr/bin/env python3
"""
Polls configured GitHub repos for issues labeled for agent work, runs the
configured CLI (Claude Code / Codex / Antigravity / opencode) against a
fresh clone in headless mode, and opens a PR if it made changes. Never
pushes to a base branch directly, never merges.

Invoked on a timer by the agent-runner systemd service — see
/etc/systemd/system/agent-runner.{service,timer}. Safe to run concurrently
with itself in the sense that issues are claimed (labeled in-progress)
before work starts, so a second overlapping run skips them; it is NOT
safe to run two instances against the exact same repo+issue at the same
instant (there's a small race between the "list issues" and "claim" calls).
A 10-minute default schedule makes that window irrelevant in practice.

Kill switch: if AGENTS_ROOT/DISABLED exists, this exits immediately without
touching anything. touch/rm that file to pause/resume everything at once.

Self-directed work: if a repo has `self_directed: true` and no labeled
issues are waiting, and its cooldown has elapsed, this creates a new GitHub
issue itself (visible, auditable — not a hidden internal task) with a
broad "use your judgment" prompt, then processes it exactly like any
human-filed issue. Same guardrails apply: dry_run, PR-only, kill switch.
A repo entry may set `self_directed_prompt` to replace the default prompt
text (e.g. to point a portfolio repo at its own product conventions)
without touching this file.

Secret scanning: if `gitleaks` is on PATH, every diff is scanned before
push; a match blocks the push and fails the run rather than silently
"trusting" the model not to have leaked something.

Docker sandboxing: if AGENT_RUNNER_USE_DOCKER=true in the environment
(set by the systemd service when use_docker_sandbox: true in
group_vars/all.yml), each tool invocation runs inside the agent-runner
Docker image instead of directly on the host — real OS-level isolation
uniformly across all four tools. Off by default and less battle-tested
than the direct-exec path; see docker/agent-runner/Dockerfile.
"""

import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml

# Overridable via env for testing (see tests/) — production default is
# unaffected since the systemd service doesn't set this var.
AGENTS_ROOT = Path(os.environ.get("AGENTS_ROOT", "/srv/agents"))
CONFIG_FILE = AGENTS_ROOT / "config" / "repos.yml"
WORKSPACES_DIR = AGENTS_ROOT / "workspaces"
LOGS_DIR = AGENTS_ROOT / "logs"
STATE_DIR = AGENTS_ROOT / "state"
RUNNERS_DIR = AGENTS_ROOT / "bin" / "runners"
DISABLED_FILE = AGENTS_ROOT / "DISABLED"

LABEL_IN_PROGRESS = "agent:in-progress"
LABEL_PR_OPENED = "agent:pr-opened"
LABEL_FAILED = "agent:failed"
LABEL_SELF_DIRECTED = "agent:self-directed"
DONE_LABELS = {LABEL_IN_PROGRESS, LABEL_PR_OPENED, LABEL_FAILED}

TOOL_RUNNERS = {
    "claude": RUNNERS_DIR / "claude.sh",
    "codex": RUNNERS_DIR / "codex.sh",
    "antigravity": RUNNERS_DIR / "antigravity.sh",
    "opencode": RUNNERS_DIR / "opencode.sh",
}

# Git author identity per tool, so history honestly shows what did the
# work rather than attributing everything to whoever ran `ansible-playbook`.
# Update the domain to something you actually control if you want these
# addresses to be reachable; they don't need to be for git/GitHub to accept
# them as commit authors.
GIT_IDENTITY = {
    "claude": ("Claude Code Agent", "agent-claude@agents.local"),
    "codex": ("Codex Agent", "agent-codex@agents.local"),
    "antigravity": ("Antigravity Agent", "agent-antigravity@agents.local"),
    "opencode": ("opencode Agent", "agent-opencode@agents.local"),
}

# Model-tier routing: only implemented for the two tools with confidently-
# documented --model flags (see README's per-tool table). The runner
# scripts read these via env var (AGENT_MODEL) if set, so the actual model
# IDs live here, in one place, not scattered across shell scripts.
#
# Claude's entries are stable *aliases* ("haiku"/"sonnet"), which resolve to
# whatever that tier currently is — they do not go stale.
#
# Codex has no such aliases: --model takes a concrete ID. The IDs that used
# to sit here ("gpt-5-mini"/"gpt-5") were written down as an admitted guess
# and never checked against a live account. A wrong ID fails the whole run,
# and it fails on every poll cycle, so the guess was strictly worse than not
# routing at all. Codex now defaults to no override: `codex exec` without
# --model uses the model the signed-in plan actually serves, which is both
# correct-by-construction and what keeps runs on the plan's included quota.
#
# To opt back in, set CODEX_MODEL_LOW / CODEX_MODEL_HIGH to IDs you have
# confirmed with `codex exec --model <id>` on the box. Both must be set;
# a half-configured pair would route one tier and not the other.
_CODEX_MODEL_LOW = os.environ.get("CODEX_MODEL_LOW")
_CODEX_MODEL_HIGH = os.environ.get("CODEX_MODEL_HIGH")

MODEL_BY_TIER: dict[str, dict[str, str]] = {
    "claude": {"low": "haiku", "high": "sonnet"},
}
if _CODEX_MODEL_LOW and _CODEX_MODEL_HIGH:
    MODEL_BY_TIER["codex"] = {"low": _CODEX_MODEL_LOW, "high": _CODEX_MODEL_HIGH}

USE_DOCKER = os.environ.get("AGENT_RUNNER_USE_DOCKER", "false").lower() == "true"
DOCKER_IMAGE = os.environ.get("AGENT_RUNNER_DOCKER_IMAGE", "agent-runner:latest")

# Host paths to each tool's cached credentials (from the one-time
# interactive login), mounted read-only into the container so a
# containerized run can reuse the same session instead of needing its own
# login. UNVERIFIED for antigravity specifically — its docs describe OS
# keyring-based storage (Secret Service/dbus) rather than a flat file,
# which may not survive being mounted into a container at all. If
# antigravity runs fail only in Docker mode, this is the first thing to
# suspect.
CREDENTIAL_MOUNTS = {
    "claude": [("~/.claude", "/root/.claude")],
    "codex": [("~/.codex", "/root/.codex")],
    "antigravity": [("~/.config/antigravity", "/root/.config/antigravity")],
    "opencode": [("~/.local/share/opencode", "/root/.local/share/opencode"),
                 ("~/.config/opencode", "/root/.config/opencode")],
}


def run_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


class RunLog:
    """Writes to both a per-run log file and stdout (which journald captures)."""

    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self.fh = path.open("a")

    def write(self, msg: str) -> None:
        line = f"{datetime.now(timezone.utc).isoformat()} {msg}"
        print(line, flush=True)
        self.fh.write(line + "\n")
        self.fh.flush()

    def close(self) -> None:
        self.fh.close()


def gh(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["gh", *args], capture_output=True, text=True, check=check
    )


def git(*args: str, cwd: Path, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, check=check
    )


def load_config() -> list[dict]:
    if not CONFIG_FILE.exists():
        raise SystemExit(
            f"No config at {CONFIG_FILE}. This should have been deployed by "
            "Ansible from repos.yml in the ubuntu-agent-server repo — check "
            "the agent_runner role ran cleanly."
        )
    data = yaml.safe_load(CONFIG_FILE.read_text()) or {}
    return data.get("repos", [])


def list_candidate_issues(repo: str, trigger_label: str, log: RunLog) -> list[dict]:
    result = gh(
        "issue", "list",
        "--repo", repo,
        "--label", trigger_label,
        "--state", "open",
        "--json", "number,title,body,labels",
        check=False,
    )
    if result.returncode != 0:
        log.write(f"[{repo}] gh issue list failed: {result.stderr.strip()}")
        return []
    issues = json.loads(result.stdout)
    candidates = []
    for issue in issues:
        labels = {label["name"] for label in issue.get("labels", [])}
        if labels & DONE_LABELS:
            continue  # already claimed, already has a PR, or already failed — skip
        candidates.append(issue)
    return candidates


def claim_issue(repo: str, number: int) -> bool:
    """Add the in-progress label. Returns False if that failed (treat as lost the race)."""
    result = gh("issue", "edit", str(number), "--repo", repo, "--add-label", LABEL_IN_PROGRESS, check=False)
    return result.returncode == 0


def unclaim_issue(repo: str, number: int) -> None:
    gh("issue", "edit", str(number), "--repo", repo, "--remove-label", LABEL_IN_PROGRESS, check=False)


def comment(repo: str, number: int, body: str) -> None:
    gh("issue", "comment", str(number), "--repo", repo, "--body", body, check=False)


def label(repo: str, number: int, name: str) -> None:
    gh("issue", "edit", str(number), "--repo", repo, "--add-label", name, check=False)


# --- self-directed work -----------------------------------------------

# The brief an unattended agent works from when no issue is waiting.
#
# This used to be a generic "find a bug or a docs gap" prompt whose
# boundaries ruled out deployment/infra configuration and marketing copy.
# The owner has since directed that deployment, CI/CD, and marketing
# material are priority work rather than off-limits, so those two carve-outs
# are gone. The boundaries that remain are the ones that protect someone
# other than us: money, legally binding claims, real people's data, and
# secrets. Those are not style preferences and do not relax.
#
# Keep this prompt in sync with the product-first direction in the target
# repo's own CLAUDE.md / DIRECTION.md — this is the fallback for repos that
# do not carry one, not a competing policy.
SELF_DIRECTED_PROMPT = """\
There is no specific issue assigned — you're finding your own next task.

Read this repository's own contributor docs first (CLAUDE.md, AGENTS.md,
README, any DIRECTION/PLAYBOOK file) and follow them. They outrank this
prompt wherever they are more specific; this is the fallback brief, not a
competing policy.

The objective is to create real value for the people who use what this
repository ships. Pick ONE high-value piece of work and finish it, in
roughly this order of preference:

1. Repair something users touch that is broken, unreachable, or half-built.
2. Carry finished work the last mile: get it deployed, reachable, and
   verified through the route a real user would actually take.
3. Make an existing product materially more useful — a missing step in a
   core workflow, a failure state that strands people, time-to-first-value.
4. Make it discoverable and understandable: landing copy, onboarding, docs,
   SEO and machine-readable descriptions, honest launch material.
5. A well-scoped new capability that existing code and docs clearly imply.

Prefer work a user could notice over internal tidying, unless the internal
work is what unblocks the rest. Finish one thing completely — including
tests and a manual pass over the primary path — rather than starting three.
Scaffolding, placeholder pages, and mock-only interfaces do not count as
done. Do not claim something is deployed, verified, or working unless you
checked it yourself.

Boundaries, same as any unattended run. Prefer leaving the repo unchanged
over guessing at something ambiguous. Do not:

- take, move, or collect money, or wire up billing, pricing, or payout rails;
- make legal, tax, medical, or compliance claims on the project's behalf, or
  weaken a liability disclaimer that is already there;
- publish under the project's public name — a store listing, a package
  publish, a production domain cutover. Building the artifact privately is
  fine; shipping it under the owner's name is theirs to decide;
- touch secrets, credentials, or tokens, or commit anything secret-adjacent;
- collect personal data, scrape people, or add a third-party analytics
  vendor. Usage measurement counts events, never people;
- fabricate traction, testimonials, benchmarks, endorsements, or user
  numbers in any marketing material you write. Claim only what is true and
  that you have verified;
- perform destructive or irreversible operations outside the task, including
  rewriting shared history or deleting another contributor's work.

Deployment, CI/CD, infrastructure-as-code, and marketing material ARE in
scope — the owner asked for them specifically. Treat production changes with
the care they deserve: preserve unrelated running services, keep changes
reversible, and verify health after the fact.

A human reviews the PR this produces. Explain your reasoning there — what
you picked, why it was the highest-value thing available, what you verified
and how — so they can evaluate the judgment call, not just the diff.
"""


def self_directed_cooldown_path(repo: str) -> Path:
    return STATE_DIR / f"{repo.replace('/', '_')}-self-directed-last.txt"


def self_directed_ready(repo: str, cooldown_hours: float) -> bool:
    path = self_directed_cooldown_path(repo)
    if not path.exists():
        return True
    last = datetime.fromisoformat(path.read_text().strip())
    return datetime.now(timezone.utc) - last >= timedelta(hours=cooldown_hours)


def mark_self_directed_run(repo: str, when: datetime | None = None) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    stamp = when or datetime.now(timezone.utc)
    self_directed_cooldown_path(repo).write_text(stamp.isoformat())


def github_last_self_directed_created_at(repo: str, log: RunLog) -> datetime | None:
    """Ask GitHub itself when the most recent self-directed issue was filed.

    The local cooldown file in STATE_DIR is the fast path, but it lives on
    whatever box happens to run this poll — a reboot that lost /srv/agents
    (not everyone partitions that as persistent), a redeploy that reset
    AGENTS_ROOT, or a second box pointed at the same repo all make it read
    as "no prior run" even though GitHub's issue history says otherwise.
    Measured in production: with self_directed_cooldown_hours: 24 configured,
    a repo self-directed on effectively every ~10-minute poll instead — the
    signature of a box whose local state never survives between runs. GitHub
    itself cannot lose this the same way, so it is the authoritative check
    right before actually filing a new issue (not on every poll — that would
    spend an extra API call for nothing on the common case where the local
    file already says "not ready").
    """
    result = gh(
        "issue", "list", "--repo", repo,
        "--label", LABEL_SELF_DIRECTED, "--state", "all", "--limit", "1",
        "--json", "createdAt",
        check=False,
    )
    if result.returncode != 0:
        log.write(f"[{repo}] gh issue list (self-directed history check) failed: {result.stderr.strip()}")
        return None
    try:
        rows = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None
    if not rows or not rows[0].get("createdAt"):
        return None
    return datetime.fromisoformat(rows[0]["createdAt"].replace("Z", "+00:00"))


def create_self_directed_issue(
    repo: str, trigger_label: str, log: RunLog, prompt: str = SELF_DIRECTED_PROMPT
) -> dict | None:
    result = gh(
        "issue", "create", "--repo", repo,
        "--title", "[agent] find something worth doing",
        "--body", prompt,
        "--label", trigger_label,
        "--label", LABEL_SELF_DIRECTED,
        check=False,
    )
    if result.returncode != 0:
        log.write(f"[{repo}] failed to create self-directed issue: {result.stderr.strip()}")
        return None
    issue_url = result.stdout.strip()
    number = int(issue_url.rstrip("/").rsplit("/", 1)[-1])
    log.write(f"[{repo}] created self-directed issue #{number}: {issue_url}")
    # labels populated to match what `gh issue list --json ...labels` would
    # return — matters because choose_model_tier() checks for
    # LABEL_SELF_DIRECTED here; leaving this empty silently meant a
    # self-directed issue processed in the same poll cycle it was created
    # in would never get bumped to the "high" model tier as intended.
    return {
        "number": number,
        "title": "[agent] find something worth doing",
        "body": prompt,
        "labels": [{"name": trigger_label}, {"name": LABEL_SELF_DIRECTED}],
    }


def maybe_self_direct(cfg: dict, repo: str, trigger_label: str, log: RunLog) -> list[dict]:
    """Called when a repo has self_directed: true and no labeled issues are
    waiting. Returns [] or a single-element list containing the freshly
    filed issue.

    The cooldown timestamp is only written on a *successful* issue creation.
    It must not be written when `create_self_directed_issue()` fails (e.g. a
    transient `gh issue create` error) — otherwise one flaky API call
    silently disables self-direction for the full cooldown window (24h by
    default) with nothing to show for it: no issue was filed, so there's
    nothing on GitHub to indicate anything happened at all, just a line in
    a server log nobody's watching. The cooldown is meant to track "since
    the last one [issue actually filed]", per the README, not "since the
    last attempt".
    """
    cooldown = cfg.get("self_directed_cooldown_hours", 24)
    if not self_directed_ready(repo, cooldown):
        log.write(f"[{repo}] self_directed cooldown not elapsed, skipping")
        return []
    last_remote = github_last_self_directed_created_at(repo, log)
    if last_remote is not None:
        elapsed = datetime.now(timezone.utc) - last_remote
        if elapsed < timedelta(hours=cooldown):
            log.write(
                f"[{repo}] local cooldown state said ready but GitHub's own "
                f"self-directed issue history says only {elapsed} has passed "
                "(local state was missing or stale) — skipping and "
                "resyncing local state to match GitHub"
            )
            mark_self_directed_run(repo, when=last_remote)
            return []
    prompt = cfg.get("self_directed_prompt") or SELF_DIRECTED_PROMPT
    new_issue = create_self_directed_issue(repo, trigger_label, log, prompt)
    if not new_issue:
        return []
    mark_self_directed_run(repo)
    return [new_issue]


# --- model tier ----------------------------------------------------------

def choose_model_tier(cfg: dict, issue: dict) -> str:
    override = cfg.get("model_tier")
    if override in ("low", "high"):
        return override
    if LABEL_SELF_DIRECTED in {label.get("name") if isinstance(label, dict) else label for label in issue.get("labels", [])}:
        return "high"  # open-ended judgment calls get the stronger model
    if any((label.get("name") if isinstance(label, dict) else label) == "agent:deep" for label in issue.get("labels", [])):
        return "high"
    body_len = len(issue.get("body") or "")
    return "high" if body_len > 800 else "low"


def model_env_for(tool: str, tier: str) -> dict:
    models = MODEL_BY_TIER.get(tool)
    if not models:
        return {}
    return {"AGENT_MODEL": models[tier]}


# --- docker sandboxing -----------------------------------------------------

def _docker_command(tool: str, workspace: Path, run_env: dict) -> list[str]:
    cmd = [
        "docker", "run", "--rm",
        "-v", f"{workspace}:/workspace",
        "-w", "/workspace",
    ]
    for host_path, container_path in CREDENTIAL_MOUNTS.get(tool, []):
        resolved = Path(host_path).expanduser()
        if resolved.exists():
            cmd += ["-v", f"{resolved}:{container_path}:ro"]
    if "AGENT_MODEL" in run_env:
        cmd += ["-e", f"AGENT_MODEL={run_env['AGENT_MODEL']}"]
    cmd += [DOCKER_IMAGE, f"/runners/{tool}.sh", "/workspace/.agent-prompt"]
    return cmd


# --- secret scanning -------------------------------------------------------

def gitleaks_available() -> bool:
    return shutil.which("gitleaks") is not None


def scan_for_secrets(workspace: Path, run_log: RunLog) -> bool:
    """Returns True if the STAGED diff looks clean (or gitleaks isn't installed — see README).

    Deliberately scans only what's staged (`gitleaks protect --staged`), not
    `gitleaks detect` against the whole tree: this repo may have existed for
    years before an agent ever touched it, and `detect` would flag any
    secret-shaped string anywhere in the checked-out tree — test fixtures,
    example .env files, dummy keys in docs — none of which the agent
    introduced. That would either block every PR from an otherwise-normal
    repo forever, or (worse) train you to ignore this check. Scanning only
    the staged changes means a hit is actually about what this run did.
    Caller is responsible for `git add -A` before calling this.
    """
    if not gitleaks_available():
        run_log.write("gitleaks not installed — skipping secret scan (see README, worth adding)")
        return True
    result = subprocess.run(
        ["gitleaks", "protect", "--source", str(workspace), "--staged"],
        capture_output=True, text=True,
    )
    run_log.write(f"--- gitleaks ---\n{result.stdout}\n{result.stderr}")
    return result.returncode == 0


def sync_branch_to_latest(workspace: Path, base_branch: str, run_log: RunLog) -> bool:
    """Bring the local `base_branch` ref up to `origin`'s current tip and
    merge it into the checked-out branch, before `fold_changes_into_staged()`
    diffs against it.

    The workspace is a fresh clone taken *before* the tool runs, and the
    tool can run for up to 30 minutes (see `_process_issue_inner`). In a
    repo that regularly sees several merges to `base_branch` in that window,
    `fold_changes_into_staged()`'s `git reset --soft base_branch` was
    resetting against that clone-time tip, not the real one — so any file
    that changed upstream during the run looked, from this branch's
    perspective, like it still had its old (now stale) content. Folded into
    one commit and opened as a PR, that reads as this branch *deleting* or
    *reverting* whatever changed upstream in the meantime, even though the
    tool never touched those files. Confirmed against two real cases the
    same session this was fixed: PRs #4064 and #4078 each accidentally
    deleted a venture that had merged to `main` minutes into the run.

    Returns True if the branch is now current with `origin/base_branch`
    (whether or not there was anything new to bring in). Returns False only
    if merging produced a real conflict — the merge is aborted immediately
    so the workspace is left clean, and the caller should treat the run as
    failed rather than fold and push a half-merged tree. A fetch failure
    (network hiccup) is logged and treated as non-fatal: this falls back to
    folding against the clone-time tip, which is the pre-existing behavior
    rather than a new failure mode.
    """
    fetch = subprocess.run(
        ["git", "fetch", "origin", f"{base_branch}:{base_branch}"],
        cwd=workspace, capture_output=True, text=True,
    )
    run_log.write(fetch.stdout)
    run_log.write(fetch.stderr)
    if fetch.returncode != 0:
        run_log.write(
            f"fetching latest {base_branch} failed; folding against the "
            f"clone-time tip instead"
        )
        return True

    merge = subprocess.run(
        ["git", "merge", "--no-edit", base_branch],
        cwd=workspace, capture_output=True, text=True,
    )
    run_log.write(merge.stdout)
    run_log.write(merge.stderr)
    if merge.returncode != 0:
        abort = subprocess.run(
            ["git", "merge", "--abort"], cwd=workspace, capture_output=True, text=True,
        )
        run_log.write(abort.stdout)
        run_log.write(abort.stderr)
        return False
    return True


def fold_changes_into_staged(workspace: Path, base_branch: str) -> str:
    """Stage any uncommitted edits, then fold them together with any
    commits the tool made on its own directly onto base_branch's tip, so
    the result is one staged diff representing the branch's full
    contribution relative to base_branch. Returns `git status --porcelain`
    after folding — an empty string means the tool genuinely made no
    changes at all.

    Agentic CLIs running in a permissive mode may commit their own work
    as part of "normal dev work" instead of leaving it as uncommitted
    edits (see claude.sh's `auto` permission-mode comment: it explicitly
    allows commits). Right after the tool exits, `git status --porcelain`
    alone can't tell "the tool committed real work" apart from "the tool
    made no changes" — both leave a clean working tree. Soft-resetting
    onto base_branch turns any such commits back into staged changes, so
    both this check and the secret scan that follows it see everything
    the branch actually did, not just its uncommitted tail.
    """
    git("add", "-A", cwd=workspace)
    git("reset", "--soft", base_branch, cwd=workspace)
    return git("status", "--porcelain", cwd=workspace).stdout.strip()


def build_prompt(issue: dict) -> str:
    return (
        f"You are working autonomously and unattended — there is no human "
        f"available to answer questions mid-task. Make the smallest correct "
        f"change that addresses this issue. Do not push to the base branch "
        f"directly and do not merge anything; the branch you're already on "
        f"will become a pull request that a human reviews afterward. If the "
        f"task is ambiguous or you're not confident in an approach, prefer "
        f"leaving the repo unchanged over guessing.\n\n"
        f"Issue #{issue['number']}: {issue['title']}\n\n"
        f"{issue.get('body') or '(no description provided)'}"
    )


def process_issue(cfg: dict, issue: dict, log: RunLog) -> None:
    repo = cfg["repo"]
    tool = cfg["tool"]
    base_branch = cfg.get("base_branch", "main")
    dry_run = cfg.get("dry_run", True)
    number = issue["number"]

    if not claim_issue(repo, number):
        log.write(f"[{repo}#{number}] could not claim (already claimed?), skipping")
        return

    workspace = WORKSPACES_DIR / f"{repo.replace('/', '_')}-{number}-{run_id()}"
    log_path = LOGS_DIR / f"{repo.replace('/', '_')}-{number}-{run_id()}.log"
    run_log = RunLog(log_path)
    tier = choose_model_tier(cfg, issue)
    run_log.write(f"[{repo}#{number}] tool={tool} model_tier={tier} dry_run={dry_run} workspace={workspace}")

    try:
        _process_issue_inner(repo, tool, tier, base_branch, dry_run, issue, workspace, run_log)
    except Exception as exc:  # noqa: BLE001 — deliberately broad: any failure here must not crash the whole poll loop
        run_log.write(f"[{repo}#{number}] UNEXPECTED ERROR: {exc!r}")
        label(repo, number, LABEL_FAILED)
        unclaim_issue(repo, number)
        comment(
            repo, number,
            f"Agent run hit an unexpected error and stopped: `{exc!r}`. "
            f"See server log `{log_path}` for details. The in-progress label "
            f"was already cleared; fix the underlying issue and remove the "
            f"`{LABEL_FAILED}` label to retry.",
        )
    finally:
        run_log.close()
        if workspace.exists():
            shutil.rmtree(workspace, ignore_errors=True)


def _process_issue_inner(
    repo: str, tool: str, tier: str, base_branch: str, dry_run: bool,
    issue: dict, workspace: Path, run_log: RunLog,
) -> None:
    number = issue["number"]
    branch = f"agent/{tool}/issue-{number}"

    run_log.write(f"[{repo}#{number}] cloning")
    clone = subprocess.run(
        ["gh", "repo", "clone", repo, str(workspace), "--", "--branch", base_branch],
        capture_output=True, text=True,
    )
    run_log.write(clone.stdout)
    run_log.write(clone.stderr)
    if clone.returncode != 0:
        raise RuntimeError(f"clone failed: {clone.stderr.strip()}")

    git("checkout", "-b", branch, cwd=workspace)

    author_name, author_email = GIT_IDENTITY.get(tool, ("Agent", "agent@agents.local"))
    git("config", "user.name", author_name, cwd=workspace)
    git("config", "user.email", author_email, cwd=workspace)

    prompt = build_prompt(issue)
    # Written inside the workspace (not system tempdir) so it's visible to
    # a container too when USE_DOCKER — the workspace is what gets mounted.
    # Deleted before the diff check either way so it never shows up as a
    # phantom "change" or risks being committed.
    prompt_file = workspace / ".agent-prompt"
    prompt_file.write_text(prompt)

    run_env = {**os.environ, **model_env_for(tool, tier)}
    if USE_DOCKER:
        cmd = _docker_command(tool, workspace, run_env)
    else:
        cmd = [str(TOOL_RUNNERS[tool]), str(prompt_file)]
    run_log.write(f"[{repo}#{number}] invoking ({'docker' if USE_DOCKER else 'host'}) tool={tool} model_tier={tier}")
    result = subprocess.run(
        cmd, cwd=workspace, capture_output=True, text=True, timeout=60 * 30, env=run_env,
    )
    if USE_DOCKER:
        # The container runs as root, so anything it wrote into the
        # bind-mounted workspace is root-owned on the host — which would
        # break every git/shutil operation below, all run as agent_user.
        # Standard fix: a throwaway container just to chown it back.
        subprocess.run(
            [
                "docker", "run", "--rm", "-v", f"{workspace}:/workspace",
                DOCKER_IMAGE, "chown", "-R", f"{os.getuid()}:{os.getgid()}", "/workspace",
            ],
            capture_output=True, text=True,
        )
    run_log.write(f"--- {tool} stdout ---\n{result.stdout}")
    run_log.write(f"--- {tool} stderr ---\n{result.stderr}")
    prompt_file.unlink(missing_ok=True)

    if result.returncode != 0:
        run_log.write(f"[{repo}#{number}] tool exited {result.returncode}")
        label(repo, number, LABEL_FAILED)
        unclaim_issue(repo, number)
        comment(
            repo, number,
            f"Agent run (`{tool}`) failed (exit {result.returncode}) and made "
            f"no changes it's willing to submit. See server log for the "
            f"transcript. Remove the `{LABEL_FAILED}` label to retry.",
        )
        return

    # The clone is up to 30 minutes stale by now (the tool just ran) — bring
    # base_branch up to origin's real tip before folding, or a file that
    # changed upstream mid-run reads as this branch reverting it. See
    # sync_branch_to_latest()'s docstring.
    if not sync_branch_to_latest(workspace, base_branch, run_log):
        run_log.write(
            f"[{repo}#{number}] merging latest {base_branch} produced a "
            f"conflict; leaving for a human rather than folding a half-merge"
        )
        label(repo, number, LABEL_FAILED)
        unclaim_issue(repo, number)
        comment(
            repo, number,
            f"Agent run (`{tool}`) made changes, but `{base_branch}` moved "
            f"during the run and merging it back in produced a conflict this "
            f"runner can't resolve unattended. Nothing was pushed. Retry "
            f"after `{base_branch}` settles, or resolve by hand and remove "
            f"the `{LABEL_FAILED}` label.",
        )
        return

    # Folds in any commits the tool made on its own, not just uncommitted
    # edits — see fold_changes_into_staged()'s docstring. Also leaves
    # everything staged, which is what gitleaks --staged scans below.
    diff = fold_changes_into_staged(workspace, base_branch)

    if not diff:
        run_log.write(f"[{repo}#{number}] tool ran but made no changes")
        label(repo, number, LABEL_FAILED)
        unclaim_issue(repo, number)
        comment(
            repo, number,
            f"Agent run (`{tool}`) completed but made no changes to the repo "
            f"— nothing to open a PR for. This usually means the task was "
            f"ambiguous, already done, or the agent declined. See server log "
            f"for its reasoning.",
        )
        return

    if not scan_for_secrets(workspace, run_log):
        run_log.write(f"[{repo}#{number}] gitleaks found a likely secret in the diff — blocking push")
        git("reset", cwd=workspace, check=False)  # unstage; workspace gets deleted regardless, but stay tidy
        label(repo, number, LABEL_FAILED)
        unclaim_issue(repo, number)
        comment(
            repo, number,
            f"Agent run (`{tool}`) made changes but a secret-scan (`gitleaks`) "
            f"flagged something in the diff, so nothing was pushed. See "
            f"server log for the finding. This needs a human to look at the "
            f"actual diff in the (deleted) workspace's log before retrying.",
        )
        return

    if dry_run:
        run_log.write(f"[{repo}#{number}] DRY RUN — would commit/push/PR now. Diff:\n{diff}")
        git("reset", cwd=workspace, check=False)
        unclaim_issue(repo, number)
        comment(
            repo, number,
            f"[dry run] Agent (`{tool}`) would have made changes here but "
            f"`dry_run: true` is set for this repo in `config/repos.yml`, so "
            f"nothing was committed or pushed. Flip `dry_run` to `false` once "
            f"you've reviewed a few of these and trust the behavior.",
        )
        return

    git("commit", "-m", f"Agent ({tool}): {issue['title']}\n\nCloses #{number}", cwd=workspace)
    push = subprocess.run(
        ["git", "push", "-u", "origin", branch], cwd=workspace, capture_output=True, text=True,
    )
    run_log.write(push.stdout)
    run_log.write(push.stderr)
    if push.returncode != 0:
        raise RuntimeError(f"push failed: {push.stderr.strip()}")

    pr = subprocess.run(
        [
            "gh", "pr", "create", "--repo", repo,
            "--base", base_branch, "--head", branch,
            "--title", f"Agent ({tool}): {issue['title']}",
            "--body", f"Closes #{number}\n\nOpened automatically by `{tool}` (model tier: {tier}) running unattended. Review before merging.",
        ],
        capture_output=True, text=True,
    )
    run_log.write(pr.stdout)
    run_log.write(pr.stderr)
    if pr.returncode != 0:
        label(repo, number, LABEL_FAILED)
        unclaim_issue(repo, number)
        raise RuntimeError(f"pr create failed: {pr.stderr.strip()}")

    pr_url = pr.stdout.strip()
    label(repo, number, LABEL_PR_OPENED)
    unclaim_issue(repo, number)
    comment(repo, number, f"Agent (`{tool}`) opened {pr_url} for review.")
    run_log.write(f"[{repo}#{number}] opened {pr_url}")


def main() -> int:
    if DISABLED_FILE.exists():
        print(f"{DISABLED_FILE} exists — agent runner disabled, doing nothing.")
        return 0

    WORKSPACES_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)

    top_log = RunLog(LOGS_DIR / f"poll-{run_id()}.log")
    try:
        repos = load_config()
        if not repos:
            top_log.write("config/repos.yml has no repos configured — nothing to do")
            return 0

        for cfg in repos:
            repo = cfg["repo"]
            tool = cfg.get("tool")
            if tool not in TOOL_RUNNERS:
                top_log.write(f"[{repo}] unknown tool {tool!r}, skipping repo entirely")
                continue
            trigger_label = cfg.get("trigger_label", "agent")
            issues = list_candidate_issues(repo, trigger_label, top_log)

            if not issues and cfg.get("self_directed"):
                issues = maybe_self_direct(cfg, repo, trigger_label, top_log)

            top_log.write(f"[{repo}] {len(issues)} candidate issue(s) labeled '{trigger_label}'")
            for issue in issues:
                process_issue(cfg, issue, top_log)
    finally:
        top_log.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
