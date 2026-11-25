#!/usr/bin/env python3
"""Guard the control plane: the files that steer every later agent.

Why this exists
---------------
Several agent families push to this repo, and the files that tell them what to
do (CLAUDE.md, prompts/), what to run on their own at session start
(.claude/settings.json hooks, .mcp.json), and what may merge or hold secrets
(.github/workflows/priv-*.yml, the ruleset, platform/ci/agent_review/) live in
the same tree they edit. One merged PR from a misbehaving agent could rewrite
all of it for every session after.

`.github/CODEOWNERS` is the map of those paths. Until 2026-11-24 the `main`
ruleset's "Require review from Code Owners" made each change to them wait for
the owner; the owner replaced that with automated checks (owner, 2026-11-24:
"replace my review with thorough cysec and reliability and liability checks
not my human review"). Control-plane changes are now judged by the
`adversarial-gate` check, which runs from `main` (never from the PR) and loads
this module from `main` to check the PR's files. This script:

  --check-coverage   fail if CODEOWNERS stops mapping a path it must map, or
                     starts mapping the run-data paths agents write every
                     run; and if the ruleset or the security-gate workflow
                     loses an invariant (required checks, no bypass, the gate
                     running from the base branch);
  --pr N             list the control-plane files a PR touches in the job
                     summary, so the reason it gets the stricter review is
                     visible;
  --audit-commit SHA after a push to main, fail if the commit touched
                     control-plane files without a pull request (a direct
                     push or an admin bypass).

Standard library only, plus PyYAML when it is installed (the workflow check
falls back to a text check without it); --pr and --audit-commit read the
GitHub API with GITHUB_TOKEN (read-only) and GITHUB_REPOSITORY. Setup and
reasoning: docs/security/agent-hardening.md.

    python3 platform/ci/control_plane_guard.py --check-coverage
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CODEOWNERS = REPO_ROOT / ".github" / "CODEOWNERS"
API = os.environ.get("GITHUB_API_URL", "https://api.github.com")

# Sample paths, not patterns: each must resolve to an owner (or to none).
MUST_BE_OWNED = [
    "CLAUDE.md",
    "AGENTS.md",
    "prompt.md",
    "ventures/CLAUDE.md",
    "research/CLAUDE.md",
    "prompts/goals.md",
    "prompts/promptctl.py",
    ".claude/settings.json",
    ".claude/hooks/block_pkill_f.py",
    ".cursor/environment.json",
    ".mcp.json",
    "platform/agents/tools.mjs",
    ".github/CODEOWNERS",
    ".github/rulesets/main.json",
    ".github/ci-policy.yaml",
    ".github/FUNDING.yml",
    # Two tiers of CI (docs/security/agent-hardening.md): every priv- workflow
    # is owned, including ones added later.
    ".github/workflows/priv-agent-pr-auto-merge.yml",
    ".github/workflows/priv-portfolio-pages.yml",
    ".github/workflows/priv-control-plane-guard.yml",
    ".github/workflows/priv-ci-policy.yml",
    ".github/workflows/priv-some-future-deploy.yml",
    ".github/prompts/land-your-work.md",
    "platform/ci/agent_review/config.yaml",
    "platform/ci/agent_review/review.py",
    "platform/ci/control_plane_guard.py",
    "platform/ci/test_control_plane_guard.py",
    "platform/ci/ci_policy_check.py",
    "platform/ci/test_ci_policy_check.py",
    "portfolio/router/requirements.txt",
    # Code a privileged job runs (ci_policy_check.py lists the rest).
    "platform/distribution/npm.mjs",
    "platform/ci/check_conflict_markers.py",
    # The automated gate that replaced owner review (2026-11-24), and what it
    # runs: a PR that edits these is judged by the copy on main.
    ".github/workflows/priv-security-gate.yml",
    "platform/ci/adversarial_gate/gate.py",
    "platform/ci/adversarial_gate/config.yaml",
    "platform/ci/adversarial_gate/allowlist.yaml",
    "platform/ci/adversarial_gate/llm_review.py",
    "platform/ci/adversarial_gate/requirements-llm.txt",
    "platform/ci/check_hidden_unicode.py",
    "platform/security/scan.py",
    "platform/security/tools.yaml",
    "platform/security/baseline.yaml",
    "platform/security/locks/semgrep.txt",
    # AWS, applied to production by priv-aws-apply.yml.
    "platform/aws/bootstrap/bootstrap.yaml",
    "platform/aws/stacks/org/scps.tf",
    ".github/workflows/priv-aws-apply.yml",
]

# Required status checks the `main` ruleset must keep. integration_id 15368 is
# GitHub Actions: without it any app able to post a status could satisfy one.
REQUIRED_CHECKS = ["conflict-markers", "control-plane", "ci-policy", "security-scan", "adversarial-gate"]
ACTIONS_INTEGRATION_ID = 15368
RULESET = REPO_ROOT / ".github" / "rulesets" / "main.json"
GATE_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "priv-security-gate.yml"
# Job id -> the script that job must run from the base checkout.
GATE_JOBS = {
    "security-scan": "platform/security/scan.py",
    "adversarial-gate": "platform/ci/adversarial_gate/gate.py",
}
MUST_BE_UNOWNED = [
    # Unprivileged workflows merge without review; ci-policy keeps them
    # read-only and secret-free.
    ".github/workflows/ventures-tests.yml",
    ".github/workflows/new-product-ci.yml",
    "prompts/runs/2026-10-30-session_x.json",
    "prompts/derived/runs.json",
    "docs/posts/2026-10-30-example.md",
    "ventures/example/src/index.mjs",
]


def pattern_regex(pattern: str) -> re.Pattern[str]:
    """CODEOWNERS uses gitignore-style patterns; this covers the subset GitHub
    documents (anchoring, trailing-slash directories, `*`, `**`, `?`)."""
    anchored = pattern.startswith("/") or "/" in pattern.rstrip("/")
    body = pattern.strip("/")
    dir_only = pattern.endswith("/")
    out, i = [], 0
    while i < len(body):
        if body.startswith("**/", i):
            out.append("(?:.*/)?")
            i += 3
        elif body.startswith("/**", i) and i + 3 == len(body):
            out.append("/.*")
            i += 3
        elif body[i] == "*":
            out.append("[^/]*")
            i += 1
        elif body[i] == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(body[i]))
            i += 1
    prefix = "^" if anchored else "^(?:.*/)?"
    suffix = "/.*$" if dir_only else "(?:/.*)?$"
    return re.compile(prefix + "".join(out) + suffix)


def parse_codeowners(text: str) -> list[tuple[re.Pattern[str], list[str]]]:
    rules = []
    for line in text.splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        pattern, *owners = line.split()
        rules.append((pattern_regex(pattern), owners))
    return rules


def owners_for(path: str, rules) -> list[str]:
    """The last matching rule wins, as on GitHub; an owner-less rule unowns."""
    found: list[str] = []
    for regex, owners in rules:
        if regex.match(path):
            found = owners
    return found


def owner_logins(rules) -> set[str]:
    """Individual owners only; team owners (`@org/team`) are not logins."""
    return {
        o.lstrip("@").lower()
        for _, owners in rules
        for o in owners
        if o.startswith("@") and "/" not in o
    }


def check_coverage(rules) -> list[str]:
    problems = [f"{p} has no code owner" for p in MUST_BE_OWNED if not owners_for(p, rules)]
    problems += [
        f"{p} is owned by {' '.join(owners_for(p, rules))}; agents write it every run"
        for p in MUST_BE_UNOWNED
        if owners_for(p, rules)
    ]
    return problems


def ruleset_problems(doc: dict) -> list[str]:
    """What a weakened `main` ruleset would lose. The file is applied by an
    admin (.github/rulesets/README.md); this keeps the copy in the tree honest."""
    if not isinstance(doc, dict):
        return ["ruleset is not a JSON object"]
    problems = []
    if doc.get("enforcement") != "active":
        problems.append("ruleset enforcement is not `active`")
    if doc.get("bypass_actors"):
        problems.append("ruleset has bypass actors; an agent holding an admin token would skip every check")
    include = ((doc.get("conditions") or {}).get("ref_name") or {}).get("include") or []
    if "~DEFAULT_BRANCH" not in include:
        problems.append("ruleset no longer targets the default branch")
    rules = {r.get("type"): r for r in doc.get("rules") or [] if isinstance(r, dict)}
    for kind in ("deletion", "non_fast_forward", "pull_request", "required_status_checks"):
        if kind not in rules:
            problems.append(f"ruleset lost its `{kind}` rule")
    checks = {}
    for c in ((rules.get("required_status_checks") or {}).get("parameters") or {}).get("required_status_checks") or []:
        if isinstance(c, dict):
            checks[c.get("context")] = c.get("integration_id")
    for name in REQUIRED_CHECKS:
        if name not in checks:
            problems.append(f"required status check `{name}` is missing from the ruleset")
        elif checks[name] != ACTIONS_INTEGRATION_ID:
            problems.append(f"required status check `{name}` is not tied to GitHub Actions (integration_id {ACTIONS_INTEGRATION_ID})")
    return problems


def _load_yaml(text: str):
    try:
        import yaml  # noqa: PLC0415 - optional; the coverage check runs without it
    except ImportError:
        return None
    try:
        return yaml.safe_load(text)
    except yaml.YAMLError as exc:
        return exc


def gate_workflow_problems(text: str | None) -> list[str]:
    """The security gate must run from the base branch on every PR, as the
    two required checks, and run the gate scripts from that checkout."""
    if text is None:
        return [".github/workflows/priv-security-gate.yml is missing"]
    problems = []
    if re.search(r"ref:\s*\$\{\{[^}]*(pull_request\.head|head_ref|merge_commit_sha)", text):
        problems.append("the security gate checks out the PR's code; it must judge the PR from the base branch")
    if re.search(r"(?m)^\s*continue-on-error:\s*true", text):
        problems.append("the security gate has `continue-on-error: true`; a crashed check would pass")
    doc = _load_yaml(text)
    if isinstance(doc, Exception):
        return problems + [f"the security gate workflow does not parse: {doc}"]
    if doc is None:  # no PyYAML: text checks only
        for job, script in GATE_JOBS.items():
            if not re.search(rf"(?m)^  {re.escape(job)}:", text):
                problems.append(f"the security gate lost its `{job}` job")
            if script not in text:
                problems.append(f"the security gate no longer runs {script}")
        if "pull_request_target" not in text:
            problems.append("the security gate no longer runs on `pull_request_target` (the base-branch copy)")
        return problems
    on = doc.get("on", doc.get(True)) if isinstance(doc, dict) else None
    events = set(on) if isinstance(on, (dict, list)) else {on}
    if "pull_request_target" not in events:
        problems.append("the security gate no longer runs on `pull_request_target` (the base-branch copy)")
    jobs = (doc.get("jobs") if isinstance(doc, dict) else None) or {}
    for job_id, script in GATE_JOBS.items():
        job = jobs.get(job_id)
        if not isinstance(job, dict):
            problems.append(f"the security gate lost its `{job_id}` job (a required check)")
            continue
        if str(job.get("name", job_id)) != job_id:
            problems.append(f"job `{job_id}` reports under another name, so the required check would never arrive")
        cond = str(job.get("if", ""))
        if cond and re.search(r"\bfalse\b", cond) and "always()" not in cond:
            problems.append(f"job `{job_id}` has `if: {cond}`; a skipped required check reads as passed")
        runs = " ".join(str(s.get("run", "")) for s in job.get("steps") or [] if isinstance(s, dict))
        if script not in runs:
            problems.append(f"job `{job_id}` no longer runs {script}")
    return problems


def check_invariants(root: Path = REPO_ROOT) -> list[str]:
    problems = []
    ruleset = root / ".github" / "rulesets" / "main.json"
    try:
        problems += ruleset_problems(json.loads(ruleset.read_text(encoding="utf-8")))
    except (OSError, ValueError) as exc:
        problems.append(f".github/rulesets/main.json unreadable: {exc}")
    gate = root / ".github" / "workflows" / "priv-security-gate.yml"
    problems += gate_workflow_problems(gate.read_text(encoding="utf-8") if gate.is_file() else None)
    return problems


def gh_get(path: str) -> object:
    req = urllib.request.Request(
        f"{API}{path}",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def gh_pages(path: str, limit: int = 30) -> list:
    items: list = []
    sep = "&" if "?" in path else "?"
    for page in range(1, limit + 1):
        batch = gh_get(f"{path}{sep}per_page=100&page={page}")
        items += batch
        if len(batch) < 100:
            break
    return items


def owned(files: list[str], rules) -> list[str]:
    return [f for f in files if owners_for(f, rules)]


def audit_verdict(touched: list[str], pr: dict | None):
    """Return (exit_code, message) for one commit on main.

    Owner approval is no longer required (2026-11-24): a control-plane change
    that came through a pull request was judged by `adversarial-gate`. One that
    reached main without a pull request skipped every check."""
    if not touched:
        return 0, "no control-plane files touched"
    listing = "\n".join(f"  - {f}" for f in touched)
    if pr is None:
        return 1, f"pushed to main without a pull request, touching:\n{listing}"
    return 0, (
        f"PR #{pr['number']} changed {len(touched)} control-plane file(s); "
        f"`adversarial-gate` judged it from the base branch:\n{listing}"
    )


def summarize(text: str) -> None:
    out = os.environ.get("GITHUB_STEP_SUMMARY")
    if out:
        with open(out, "a", encoding="utf-8") as fh:
            fh.write(text + "\n")
    print(text)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check-coverage", action="store_true")
    mode.add_argument("--pr", type=int)
    mode.add_argument("--audit-commit")
    args = ap.parse_args(argv)

    rules = parse_codeowners(CODEOWNERS.read_text(encoding="utf-8"))

    if args.check_coverage:
        problems = check_coverage(rules)
        for p in problems:
            print(f"::error file=.github/CODEOWNERS::{p}")
        invariants = check_invariants()
        for p in invariants:
            print(f"::error::{p}")
        if not problems:
            print(f"CODEOWNERS covers all {len(MUST_BE_OWNED)} control-plane samples")
        if not invariants:
            print(f"ruleset requires {len(REQUIRED_CHECKS)} checks; the security gate runs from the base branch")
        return 1 if problems or invariants else 0

    repo = os.environ["GITHUB_REPOSITORY"]
    if args.pr:
        files = [f["filename"] for f in gh_pages(f"/repos/{repo}/pulls/{args.pr}/files")]
        touched = owned(files, rules)
        if touched:
            summarize(
                "### Control-plane files in this PR\n\n`adversarial-gate` reviews these at the "
                "control-plane tier, from `main`'s copy of the rules (.github/CODEOWNERS is the "
                "path map; no human review is required):\n\n"
                + "\n".join(f"- `{f}`" for f in touched)
            )
        else:
            print("no control-plane files touched")
        return 0

    sha = args.audit_commit
    files = [f["filename"] for f in gh_get(f"/repos/{repo}/commits/{sha}").get("files", [])]
    prs = [p for p in gh_get(f"/repos/{repo}/commits/{sha}/pulls") if p.get("merged_at")]
    pr = prs[0] if prs else None
    code, message = audit_verdict(owned(files, rules), pr)
    if code:
        print(f"::error::{message.splitlines()[0]}")
    summarize(message)
    return code


if __name__ == "__main__":
    sys.exit(main())
