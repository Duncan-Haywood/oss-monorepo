#!/usr/bin/env python3
"""Cyber and legal risk review for a pull request's diff.

The owner, 2026-11-24: "i really don't like all this stuff that is blocking
itself on my behalf. not a good practice in general. can we instead have maybe
a review process on cysec and legal risks instead?"

So most changes no longer wait for the owner. Instead every PR gets this
review: the script reads the diff, works out which cyber and legal checks it
triggers, and prints them as a checklist the merging agent answers in the PR
(and, later, an AI reviewer answers in CI). It also says when a change must
go to the owner after all: it never does. The owner, later the same day:
"we want to avoid that generally unless it is really human dependent ... move
to systems that remove human review as much as possible", and "any things
that need human review on a general basis should generally not be the case
... the threats and risks ... identified and ... a thorough assurance system
to avoid those risks."

So the liability-grade threats are blocked by rules, not routed to a person
(threat model: docs/security/risk-review.md, "Threats and controls"):
  - a likely secret in an added line: fails; remove it and rotate;
  - lines removed inside the guardrails and hard limits: fails (append-only);
  - a licence on existing code changed to one outside ALLOWED_LICENCES: fails;
  - the gate weakened (GATE_PATHS): a change to the gate's own files may only
    add to it (owned paths, required checks, secret patterns, checks,
    protected sections); dropping anything fails.
The sensitive core in .github/CODEOWNERS (privileged workflows, session-start
code, the CI guards) is reported as "sensitive" for a harder look, nothing
more. CI runs main's copy of this script on every PR
(.github/workflows/priv-risk-review.yml, pull_request_target), so a PR is
never judged by its own edited reviewer.

Standard library only. Process and reasoning: docs/security/risk-review.md.

    python3 platform/security/risk_review.py                 # this branch vs origin/main
    python3 platform/security/risk_review.py --base <ref>
    python3 platform/security/risk_review.py --json
    python3 platform/security/risk_review.py --strict        # exit 1 on a likely secret
    python3 platform/security/risk_review.py --base B --head H --gate
                                                             # CI: exit 1 on a secret or a block
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field

# The owner-only core is whatever .github/CODEOWNERS owns: one list, read
# here through the control-plane guard's own parser, so the review and the
# gate cannot drift apart. What is in it and why: docs/security/risk-review.md.
from pathlib import Path as _Path
import importlib.util as _ilu

_ROOT = _Path(__file__).resolve().parents[2]
_spec = _ilu.spec_from_file_location("control_plane_guard", _ROOT / "platform" / "ci" / "control_plane_guard.py")
_guard = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(_guard)


def owner_core_rules(text: str | None = None):
    if text is None:
        text = (_ROOT / ".github" / "CODEOWNERS").read_text(encoding="utf-8")
    return _guard.parse_codeowners(text)


def in_owner_core(path: str, rules) -> bool:
    return bool(_guard.owners_for(path, rules))


# The files that define the automated gate. The review cannot vouch for its
# own replacement, so a change here may only add to the gate
# (gate_weakenings); main's copy of this script makes that call.
GATE_PATHS = [
    r"^\.github/workflows/priv-risk-review\.yml$",
    r"^\.github/rulesets/",
    r"^\.github/CODEOWNERS$",
    r"^platform/security/risk_review\.py$",
]


def is_gate_path(path: str) -> bool:
    return any(re.search(p, path) for p in GATE_PATHS)


# Licences existing code may move to. MIT is the historic licence;
# FSL-1.1-MIT is the owner's 2026-11-24 choice for original work (PRs
# 18724/18728). Published versions keep the licence they shipped under.
ALLOWED_LICENCES = [
    ("MIT", r"Permission is hereby granted, free of charge"),
    ("FSL-1.1-MIT", r"Functional Source License, Version 1\.1, MIT Future License"),
]

# Lines that must stay in the risk-review workflow: they are what make it
# run main's reviewer over the PR's diff as a failing gate.
WORKFLOW_ANCHORS = [
    "pull_request_target:",
    "ref: ${{ github.event.pull_request.base.sha }}",
    "python3 -I platform/security/risk_review.py",
    "--gate",
]

# Sections whose deletion or rewrite is blocked: (file, heading regex).
# Additions inside them do not escalate on their own; they still get the
# instruction-change check.
PROTECTED_SECTIONS = [
    ("prompts/goals.md", r"^## Guardrails"),
    ("CLAUDE.md", r"^## Public repository"),
    ("CLAUDE.md", r"^\*\*Judgment first\.\*\*"),
]

SECRET_PATTERNS = [
    ("AWS access key id", r"\bAKIA[0-9A-Z]{16}\b"),
    ("private key block", r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    ("GitHub token", r"\bgh[pousr]_[A-Za-z0-9]{36,}\b"),
    ("GitHub fine-grained token", r"\bgithub_pat_[A-Za-z0-9_]{60,}\b"),
    ("Stripe live key", r"\b[sr]k_live_[A-Za-z0-9]{16,}\b"),
    ("Slack token", r"\bxox[abposr]-[A-Za-z0-9-]{10,}\b"),
    ("Anthropic key", r"\bsk-ant-[A-Za-z0-9_-]{20,}\b"),
    ("OpenAI-style key", r"\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b"),
    ("Google API key", r"\bAIza[0-9A-Za-z_-]{35}\b"),
    ("Paddle live API key", r"\bpdl_live_[A-Za-z0-9_]{20,}\b"),
]


@dataclass
class Check:
    id: str
    lens: str  # "cyber" or "legal"
    title: str
    question: str
    paths: str | None = None  # regex on changed path
    added: str | None = None  # regex on added lines (case-insensitive)
    added_paths: str | None = None  # limit `added` to paths matching this


CHECKS = [
    # --- cyber -------------------------------------------------------------
    Check("C-instructions", "cyber", "Agent instructions changed",
          "Does the change weaken a guardrail, widen what agents may do without the owner, or tell agents to fetch, run or trust outside content? Would a prompt-injected agent want this edit?",
          paths=r"(^|/)(CLAUDE|AGENTS)\.md$|^prompt\.md$|^prompts/(?!runs/|derived/|drift/)|^\.github/prompts/"),
    Check("C-workflows", "cyber", "CI workflow or action changed",
          "Least-privilege `permissions:`; no `pull_request_target` with a checkout of the head; untrusted input never interpolated into `run:`; actions pinned by SHA; secrets only in Environments and only where needed.",
          paths=r"^\.github/(workflows|actions)/"),
    Check("C-autorun", "cyber", "Code agents run on their own changed",
          "Hooks, MCP servers and session-start scripts run before any agent decides anything. What does the new code execute, fetch or send, and with which credentials?",
          paths=r"^\.claude/|^\.cursor/|^\.mcp\.json$|^platform/agents/"),
    Check("C-deps", "cyber", "Dependencies changed",
          "Each new package: real and maintained (no typosquat), licence known, pinned, from the expected registry; install scripts read. Lockfile updated with it.",
          paths=r"(^|/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|uv\.lock|Cargo\.toml|Cargo\.lock|go\.mod|go\.sum|Gemfile(\.lock)?)$"),
    Check("C-iac", "cyber", "Infrastructure as code changed",
          "No public buckets or open ingress, no wildcard IAM actions or resources, encryption on, logs kept, spend guarded; plan reviewed before apply.",
          paths=r"\.(tf|tofu|hcl)$|(^|/)wrangler\.(toml|jsonc?)$|(^|/)Dockerfile$|(^|/)docker-compose[^/]*\.ya?ml$|(^|/)fly\.toml$|(^|/)render\.yaml$|^\.github/rulesets/"),
    Check("C-auth-payments", "cyber", "Auth, session or payment code changed",
          "Webhook signatures verified; secrets read from the runtime, never the repository; no secret reachable from code agents can change in this public repository (docs/reports/2026-10-30-billing-plan.md); authorisation checked server-side.",
          added=r"\b(paddle|stripe|webhook|checkout|password|session|jwt|oauth|api[_-]?key|bearer)\b",
          added_paths=r"\.(m?js|ts|tsx|py|rs|go)$"),
    Check("C-injection", "cyber", "Risky sinks added",
          "Each new eval/exec/innerHTML/shell call: is any part of its input user-controlled? Escape, parameterise or remove.",
          added=r"\beval\s*\(|new Function\s*\(|\.innerHTML\s*=|outerHTML\s*=|document\.write\s*\(|child_process|subprocess\.[a-z_]+\([^)]*shell\s*=\s*True|os\.system\s*\(|dangerouslySetInnerHTML",
          added_paths=r"\.(m?js|ts|tsx|jsx|py|html)$"),
    Check("C-outbound", "cyber", "New outbound hosts",
          "Each new host the code calls: needed, HTTPS, no personal data sent without the privacy line saying so, and listed where the venture lists its external calls.",
          added=r"https?://(?!example\.(com|org|invalid)|localhost|127\.0\.0\.1)[a-z0-9.-]+\.[a-z]{2,}",
          added_paths=r"\.(m?js|ts|tsx|py)$"),
    # --- legal -------------------------------------------------------------
    Check("L-licence", "legal", "Licence text changed",
          "Relicensing existing code is the owner's call (Hard limits, licensing). Published MIT versions stay MIT; request work stays MIT.",
          paths=r"(^|/)(LICEN[CS]E|COPYING|NOTICE)(\.[a-z]+)?$"),
    Check("L-third-party", "legal", "Third-party code or data added",
          "Licence compatible (no GPL/AGPL/unlicensed code in proprietary builds); notice kept; THIRD_PARTY.md updated; data terms allow reuse.",
          paths=r"(^|/)(vendor|third_party|third-party|vendored)/|(^|/)THIRD_PARTY\.md$"),
    Check("L-privacy", "legal", "Personal data, tracking or forms changed",
          "What personal data is collected, why, for how long, and does the privacy line say so? Consent where the law needs it (GDPR, PECR, CCPA); no IPs or raw user agents stored in this public repository.",
          added=r"\b(email|phone|address|date of birth|ssn|social security|ip address|localStorage|cookie|analytics|beacon|tracking|<form\b|type=\"email\"|type=\"tel\")",
          added_paths=r"\.(m?js|ts|tsx|html|py)$"),
    Check("L-claims", "legal", "Marketing or trust claims added",
          "Every claim backed by a file; no fake reviews, testimonials, user counts or ratings; no 'certified', 'SOC 2 compliant', 'guaranteed' or '#1' without evidence (Hard limits, honest marketing).",
          added=r"\b(guarantee[ds]?|#1|number one|best[- ]in[- ]class|certified|soc ?2 (compliant|certified)|hipaa compliant|gdpr compliant|trusted by|testimonial|\d[\d,]* (users|customers|businesses)|5[- ]star|rated)\b",
          added_paths=r"\.(html|md|mjs|json|txt)$"),
    Check("L-email", "legal", "Email sending or outreach changed",
          "CAN-SPAM, GDPR and PECR: sender identified, working one-click unsubscribe honoured everywhere, no deceptive subjects, opt-in for consumer marketing, no bought or scraped lists (goals.md, pivot point 7).",
          added=r"\b(unsubscribe|newsletter|outbound|cold email|sendEmail|send_email|SES|Resend|mailing list|drip|nurture|list-unsubscribe)\b"),
    Check("L-advice", "legal", "Regulated-advice surface changed",
          "Tax, legal, medical, financial or safety output carries the disclaimer from PRODUCT_PLAYBOOK.md §5b and does not present itself as professional advice.",
          paths=r"(tax|legal|lawyer|medical|health|dosage|mortgage|loan|invest|retire|insurance|payroll|lien|contract|osha|safety)[^/]*/.*\.(html|mjs)$"),
    Check("L-money", "legal", "Pricing, checkout or merchant settings changed",
          "Prices honest and complete (taxes, renewals); refund terms stated; nothing switches on live charging, which is the owner's step (Hard limits, owner-only actions).",
          added=r"\b(price_id|pri_[a-z0-9]{6,}|checkout url|live mode|PADDLE_ENV|environment:\s*production|subscription price|\$\d+(\.\d\d)?\s*/\s*(mo|month|yr|year))\b"),
]


@dataclass
class FileDiff:
    path: str
    added: list[str] = field(default_factory=list)
    removed_old_lines: list[int] = field(default_factory=list)  # 1-based, in the base version
    status: str = "M"


def parse_unified_diff(text: str) -> dict[str, FileDiff]:
    """Parse `git diff -U0` output into added lines and removed base line numbers per path."""
    files: dict[str, FileDiff] = {}
    cur: FileDiff | None = None
    old_line = 0
    for line in text.splitlines():
        if line.startswith("diff --git "):
            m = re.match(r"diff --git a/(.+?) b/(.+)$", line)
            path = m.group(2) if m else line.split()[-1]
            cur = files.setdefault(path, FileDiff(path))
            continue
        if cur is None:
            continue
        if line.startswith("new file mode"):
            cur.status = "A"
        elif line.startswith("deleted file mode"):
            cur.status = "D"
        elif line.startswith("@@"):
            m = re.match(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", line)
            old_line = int(m.group(1)) if m else 0
        elif line.startswith("+++") or line.startswith("---"):
            continue
        elif line.startswith("+"):
            cur.added.append(line[1:])
        elif line.startswith("-"):
            cur.removed_old_lines.append(old_line)
            old_line += 1
    return files


def section_range(text: str, heading: str) -> tuple[int, int] | None:
    """1-based inclusive line range of the section starting at `heading` and
    ending before the next heading of the same or higher level."""
    lines = text.splitlines()
    start = None
    level = None
    for i, line in enumerate(lines, 1):
        if start is None and re.match(heading, line):
            start = i
            m = re.match(r"^(#+) ", line)
            level = len(m.group(1)) if m else None
            continue
        if start is not None:
            m = re.match(r"^(#+) ", line)
            if level is None:
                # A bold-paragraph "section" ends at the first blank line.
                if not line.strip():
                    return (start, i - 1)
            elif m and len(m.group(1)) <= level:
                return (start, i - 1)
    return (start, len(lines)) if start is not None else None


def find_secrets(files: dict[str, FileDiff]) -> list[tuple[str, str]]:
    hits = []
    for f in files.values():
        for line in f.added:
            for name, pat in SECRET_PATTERNS:
                if re.search(pat, line):
                    hits.append((f.path, name))
    return hits


def licence_name(text: str) -> str | None:
    for name, pat in ALLOWED_LICENCES:
        if re.search(pat, text):
            return name
    return None


def _owned_patterns(text: str) -> set[str]:
    return {line.split()[0] for line in text.splitlines()
            if line.strip() and not line.lstrip().startswith("#") and len(line.split()) > 1}


def _ruleset_facts(text: str) -> tuple[set, set, str]:
    doc = json.loads(text)
    rules = doc.get("rules", [])
    types = {r.get("type") for r in rules}
    checks = {c.get("context") for r in rules if r.get("type") == "required_status_checks"
              for c in r.get("parameters", {}).get("required_status_checks", [])}
    return types, checks, doc.get("enforcement", "")


def _reviewer_facts(text: str) -> dict[str, set]:
    """Parse (never run) risk_review.py and pull out the lists the gate is made of."""
    import ast
    facts: dict[str, set] = {}
    for node in ast.parse(text).body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
            if name in ("SECRET_PATTERNS", "GATE_PATHS", "PROTECTED_SECTIONS", "WORKFLOW_ANCHORS"):
                facts[name] = {ast.dump(e) for e in getattr(node.value, "elts", [])}
            elif name == "CHECKS":
                facts[name] = {e.args[0].value for e in getattr(node.value, "elts", [])
                               if isinstance(e, ast.Call) and e.args and isinstance(e.args[0], ast.Constant)}
    return facts


def gate_weakenings(path: str, base: str | None, head: str | None) -> list[str]:
    """What a change to one of the gate's own files drops. Adding is fine."""
    if base is None:
        return []  # a new file adds to the gate
    if head is None:
        return ["file deleted"]
    try:
        if path == ".github/CODEOWNERS":
            gone = _owned_patterns(base) - _owned_patterns(head)
            return [f"no longer owned: {', '.join(sorted(gone))}"] if gone else []
        if path.startswith(".github/rulesets/") and path.endswith(".json"):
            bt, bc, be = _ruleset_facts(base)
            ht, hc, he = _ruleset_facts(head)
            out = []
            if bt - ht:
                out.append(f"rules removed: {', '.join(sorted(map(str, bt - ht)))}")
            if bc - hc:
                out.append(f"required checks removed: {', '.join(sorted(map(str, bc - hc)))}")
            if be == "active" and he != "active":
                out.append(f"enforcement {he!r}")
            return out
        if path == "platform/security/risk_review.py":
            bf, hf = _reviewer_facts(base), _reviewer_facts(head)
            return [f"{k}: {len(bf[k] - hf.get(k, set()))} entr(y/ies) removed"
                    for k in sorted(bf) if bf[k] - hf.get(k, set())]
        if path.endswith("priv-risk-review.yml"):
            gone = [a for a in WORKFLOW_ANCHORS if a in base and a not in head]
            return [f"no longer contains {a!r}" for a in gone]
    except (ValueError, SyntaxError) as e:
        return [f"cannot be parsed ({e.__class__.__name__})"]
    return []


def review(files: dict[str, FileDiff], base_text=lambda path: None, rules=None,
           head_text=lambda path: None) -> dict:
    if rules is None:
        rules = owner_core_rules()
    triggered = []
    for c in CHECKS:
        hit_paths = []
        for f in files.values():
            if c.paths and re.search(c.paths, f.path, re.I):
                hit_paths.append(f.path)
            elif c.added and not f.path.startswith("platform/security/") and (
                not c.added_paths or re.search(c.added_paths, f.path, re.I)
            ):
                # platform/security/ holds the patterns themselves.
                if any(re.search(c.added, line, re.I) for line in f.added):
                    hit_paths.append(f.path)
        if hit_paths:
            triggered.append({"id": c.id, "lens": c.lens, "title": c.title,
                              "question": c.question, "paths": sorted(set(hit_paths))})

    escalate = []
    secrets = find_secrets(files)
    for path, name in secrets:
        escalate.append(f"likely secret ({name}) added in {path}: remove it and rotate the credential")
    for path in sorted(p for p in files if is_gate_path(p)):
        for w in gate_weakenings(path, base_text(path), head_text(path)):
            escalate.append(f"gate weakened in {path}: {w}")
    sensitive = sorted(p for p in files if in_owner_core(p, rules) and not is_gate_path(p))
    for path, heading in PROTECTED_SECTIONS:
        f = files.get(path)
        if not f or not f.removed_old_lines:
            continue
        text = base_text(path)
        if not text:
            continue
        rng = section_range(text, heading)
        if rng and any(rng[0] <= n <= rng[1] for n in f.removed_old_lines):
            escalate.append(f"lines removed or rewritten in a protected section of {path} ({heading.strip('^').strip()}); guardrails are append-only")
    for f in files.values():
        if re.search(r"(^|/)(LICEN[CS]E|COPYING)(\.[a-z]+)?$", f.path) and f.status != "A":
            new = head_text(f.path) if f.status != "D" else ""
            if not licence_name(new or ""):
                escalate.append(f"licence of existing code changed to one outside ALLOWED_LICENCES: {f.path}")

    return {"files": len(files), "checks": triggered, "escalate": escalate,
            "sensitive": sensitive,
            "secrets": [{"path": p, "kind": k} for p, k in secrets]}


def gate_exit(result: dict) -> tuple[int, str]:
    """The CI verdict. Anything in `escalate` is blocked outright: there is no
    approval path, because the controls are rules, not a person. Everything
    else passes: the checklist is for the merging agent and the AI reviewer,
    not a reason to wait."""
    if result["escalate"]:
        return 1, "blocked: " + "; ".join(result["escalate"])
    return 0, "nothing blocked; merge when CI is green and the checks are answered"


def render(result: dict) -> str:
    out = ["## Risk review (cyber and legal)", ""]
    if result["escalate"]:
        out.append("**Blocked** (fix these; nobody can approve them through):")
        out += [f"- {e}" for e in result["escalate"]]
    else:
        out.append("**Blocked:** nothing. Answer the checks below in the PR and merge when CI is green.")
    if result.get("sensitive"):
        out.append("")
        out.append("**Sensitive files** (review these hardest): "
                   + ", ".join(f"`{p}`" for p in result["sensitive"]))
    out.append("")
    if not result["checks"]:
        out.append(f"No check triggered by the {result['files']} changed file(s).")
    for lens in ("cyber", "legal"):
        rows = [c for c in result["checks"] if c["lens"] == lens]
        if not rows:
            continue
        out.append(f"### {lens.capitalize()}")
        for c in rows:
            shown = ", ".join(f"`{p}`" for p in c["paths"][:6])
            more = f" and {len(c['paths']) - 6} more" if len(c["paths"]) > 6 else ""
            out.append(f"- [ ] **{c['title']}** ({shown}{more}). {c['question']}")
        out.append("")
    return "\n".join(out).rstrip() + "\n"


def git(*args: str) -> str:
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


def stale_base_warning(base: str, head: str, merge_base: str, nfiles: int) -> str | None:
    """Say so when the diff is likely inflated by a stale --base.

    A branch that merged a newer main than the local `base` ref diffs main's
    own changes too: hundreds of files and false gate blocks (2026-11-25 run
    records). The sign is a merge on the branch whose merged-in parent `base`
    does not contain."""
    merges = git("rev-list", "--merges", f"{merge_base}..{head}").split()
    for m in merges:
        parents = git("rev-list", "--parents", "-n", "1", m).split()[2:]
        for p in parents:
            if subprocess.run(["git", "merge-base", "--is-ancestor", p, base],
                              capture_output=True).returncode != 0:
                return (f"warning: {head} merged {p[:12]} (in {m[:12]}), which {base} does not contain, "
                        f"so these {nfiles} file(s) may include another branch's or a newer main's changes. "
                        f"If it was main: `git fetch --depth=40 origin main` and rerun, or pass --base {p[:12]}.")
    shallow = git("rev-parse", "--is-shallow-repository").strip() == "true"
    if shallow and nfiles > 150:
        return (f"warning: {nfiles} changed files in a shallow clone; if that is more than this branch "
                f"changed, {base} is stale: `git fetch --depth=40 origin main` and rerun, or pass --base HEAD~<n>.")
    return None


def find_merge_base(base: str, head: str, fetch: bool = True) -> str | None:
    """The merge base of base and head, deepening a shallow clone to find it.

    A cloud session's clone is shallow, so the default origin/main often shares
    no commit with HEAD; 13 run records on 2026-11-25 lost a step to it and
    reran with --base HEAD~<n>. When base names a remote branch, fetch deeper
    (as CLAUDE.md suggests by hand) until the two histories meet."""
    def mb():
        try:
            return git("merge-base", base, head).strip()
        except subprocess.CalledProcessError:
            return None
    found = mb()
    if found or not fetch:
        return found
    remote, _, branch = base.partition("/")
    if (not branch or remote not in git("remote").split()
            or git("rev-parse", "--is-shallow-repository").strip() != "true"):
        return None
    for depth in (40, 200, 500):
        print(f"no merge base between {base} and {head} in this shallow clone; "
              f"running `git fetch --deepen={depth} {remote} {branch}`", file=sys.stderr)
        if subprocess.run(["git", "fetch", "--quiet", f"--deepen={depth}", remote, branch]).returncode:
            return None
        found = mb()
        if found:
            return found
    return None


def uncommitted_note(head: str) -> str | None:
    """Work not yet committed is not in the diff (a run reported '0 changed
    file(s)' before committing)."""
    if head != "HEAD":
        return None
    try:
        dirty = [l for l in git("status", "--porcelain").splitlines() if l.strip()]
    except subprocess.CalledProcessError:
        return None
    if not dirty:
        return None
    return (f"note: {len(dirty)} uncommitted path(s) are not in this review, which diffs commits only; "
            f"commit them and rerun.")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--base", default="origin/main")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--head", default="HEAD")
    ap.add_argument("--strict", action="store_true", help="exit 1 when a likely secret is added")
    ap.add_argument("--gate", action="store_true", help="CI verdict: exit 1 on anything blocked")
    ap.add_argument("--no-fetch", action="store_true",
                    help="do not deepen a shallow clone to find the merge base")
    args = ap.parse_args(argv)
    merge_base = find_merge_base(args.base, args.head, fetch=not (args.gate or args.no_fetch))
    if not merge_base:
        print(f"no merge base between {args.base} and {args.head} (a shallow clone?): "
              f"`git fetch --deepen=500 origin main`, or pass --base HEAD~<n>", file=sys.stderr)
        return 2
    diff = git("diff", "-U0", "--no-color", "--no-renames", f"{merge_base}...{args.head}")

    def base_text(path):
        try:
            return git("show", f"{merge_base}:{path}")
        except subprocess.CalledProcessError:
            return None

    def head_text(path):
        try:
            return git("show", f"{args.head}:{path}")
        except subprocess.CalledProcessError:
            return None

    files = parse_unified_diff(diff)
    if not args.gate:
        warning = stale_base_warning(args.base, args.head, merge_base, len(files))
        if warning:
            print(warning, file=sys.stderr)
        note = uncommitted_note(args.head)
        if note:
            print(note, file=sys.stderr)
    result = review(files, base_text, head_text=head_text)
    text = render(result)
    print(json.dumps(result, indent=2) if args.json else text, end="" if not args.json else "\n")
    if args.gate:
        code, verdict = gate_exit(result)
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary:
            with open(summary, "a", encoding="utf-8") as fh:
                fh.write(text + f"\n**Verdict:** {verdict}\n")
        print(("::error::" if code else "") + verdict)
        return code
    return 1 if args.strict and result["secrets"] else 0


if __name__ == "__main__":
    sys.exit(main())
