#!/usr/bin/env python3
"""Cyber and legal risk review for a pull request's diff.

The owner, 2026-11-24: "i really don't like all this stuff that is blocking
itself on my behalf. not a good practice in general. can we instead have maybe
a review process on cysec and legal risks instead?"

So most changes no longer wait for the owner. Instead every PR gets this
review: the script reads the diff, works out which cyber and legal checks it
triggers, and prints them as a checklist the merging agent answers in the PR
(and, later, an AI reviewer answers in CI). It also says when a change must
go to the owner after all. That happens only for real liability:
  - a likely secret in an added line;
  - an edit to the owner-only core (the files that define this review, the
    code-owners gate, workflows that hold secrets, code agents run at session
    start);
  - a deletion or rewrite inside the guardrails and hard limits;
  - a licence change on existing code;
  - live payment settings.

Standard library only. Process and reasoning: docs/security/risk-review.md.

    python3 platform/security/risk_review.py                 # this branch vs origin/main
    python3 platform/security/risk_review.py --base <ref>
    python3 platform/security/risk_review.py --json
    python3 platform/security/risk_review.py --strict        # exit 1 on a likely secret
"""
from __future__ import annotations

import argparse
import json
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


# Sections whose deletion or rewrite goes to the owner: (file, heading regex).
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


def review(files: dict[str, FileDiff], base_text=lambda path: None, rules=None) -> dict:
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
    core = sorted(p for p in files if in_owner_core(p, rules))
    if core:
        escalate.append("owner-only core changed: " + ", ".join(core))
    for path, heading in PROTECTED_SECTIONS:
        f = files.get(path)
        if not f or not f.removed_old_lines:
            continue
        text = base_text(path)
        if not text:
            continue
        rng = section_range(text, heading)
        if rng and any(rng[0] <= n <= rng[1] for n in f.removed_old_lines):
            escalate.append(f"lines removed or rewritten in a protected section of {path} ({heading.strip('^').strip()})")
    for f in files.values():
        if re.search(r"(^|/)(LICEN[CS]E|COPYING)(\.[a-z]+)?$", f.path) and f.status != "A":
            escalate.append(f"licence of existing code changed: {f.path}")

    return {"files": len(files), "checks": triggered, "escalate": escalate,
            "secrets": [{"path": p, "kind": k} for p, k in secrets]}


def render(result: dict) -> str:
    out = ["## Risk review (cyber and legal)", ""]
    if result["escalate"]:
        out.append("**Owner review needed:**")
        out += [f"- {e}" for e in result["escalate"]]
    else:
        out.append("**Owner review needed:** no. Answer the checks below in the PR and merge when CI is green.")
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


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--base", default="origin/main")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--strict", action="store_true", help="exit 1 when a likely secret is added")
    args = ap.parse_args(argv)
    merge_base = git("merge-base", args.base, "HEAD").strip()
    diff = git("diff", "-U0", "--no-color", "--no-renames", f"{merge_base}...HEAD")

    def base_text(path):
        try:
            return git("show", f"{merge_base}:{path}")
        except subprocess.CalledProcessError:
            return None

    result = review(parse_unified_diff(diff), base_text)
    print(json.dumps(result, indent=2) if args.json else render(result), end="" if not args.json else "\n")
    return 1 if args.strict and result["secrets"] else 0


if __name__ == "__main__":
    sys.exit(main())
