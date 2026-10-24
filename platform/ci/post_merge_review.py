#!/usr/bin/env python3
"""Which merged pull requests should a reviewer read next?

## Why this exists

Nothing reviews a pull request here before it merges, and the systems that
were meant to do not run. Measured 2026-10-24 over the 300 newest merged PRs
(`docs/reports/2026-10-24-pr-review-without-dead-branches.md`):

  * every one carries a Copilot review, and every one of those says Copilot
    "was unable to review this pull request because the user who requested the
    review has insufficient remaining quota";
  * the four cross-review App jobs (`agent-cross-review.yml`) skip, because the
    App secrets were never set, and they start minutes after the PR merged;
  * a PR merges a median 22 seconds after it opens.

A blocking review cannot fit that loop. Agent sessions are short, and a
reviewer that arrives after the author left can only approve or strand the
branch. The model in the report puts numbers on it: blocking async review
orphans ~40 PRs a day at today's volume even with spare reviewer capacity.

So review moves after the merge. Work lands as it does now; a session with
spare budget reads this queue, reviews the riskiest unaudited merged PRs, and
fixes what it finds in its own fix-forward PR, which it lands like any other.
Nobody waits, and no branch is held open for a reviewer.

## What it reads and writes

Reads merged PRs and their changed files from the GitHub REST API (public; in
a cloud session the agent proxy authenticates). Writes nothing remote.
Each audit is one file, `platform/ci/post_merge_reviews/<pr>.json`, so two
sessions recording different audits never conflict on a shared ledger line.

## Use

    python3 platform/ci/post_merge_review.py queue --hours 48 --k 5
    python3 platform/ci/post_merge_review.py record 9867 --findings 1 \\
        --severity high --fix-pr 9970 --note "1099-K threshold"
    python3 platform/ci/post_merge_review.py coverage --hours 168
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import ssl
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO = "Duncan-Haywood/oss-monorepo"
API = f"https://api.github.com/repos/{REPO}"
AUDIT_DIR = Path(__file__).resolve().parent / "post_merge_reviews"

# Paths whose mistakes cost the most: CI and trust boundaries, and pages that
# state money, tax or legal facts to the public.
HIGH_RISK = [
    re.compile(p)
    for p in (
        r"^\.github/workflows/",
        r"^platform/ci/agent_review/",
        r"^platform/edge/",
    )
]
# Money, tax and legal facts stated to the public; matched on name parts, and
# only in code or pages (a run record named `...w2wsi.json` is not a W-2 page).
HIGH_RISK_WORDS = re.compile(
    r"(?i)(1099|payroll|legal|disclaim|payment|sepa|invoice|secret|token|(^|[/_.-])(tax|irs|w-?2|bank|auth))"
)
CODE = re.compile(r"\.(py|mjs|js|ts|tsx|html|sh|yml|yaml)$")
LOW_RISK = [
    re.compile(p)
    for p in (
        r"^docs/",
        r"(^|/)run-records?/",
        r"^portfolio/ledger/",
        r"\.md$",
        r"\.(json|csv|txt|svg|png)$",
    )
]


def file_tier(path: str) -> int:
    """3 = high, 2 = code, 1 = docs/data."""
    if any(p.search(path) for p in HIGH_RISK):
        return 3
    if not CODE.search(path) or any(p.search(path) for p in LOW_RISK):
        return 1
    return 3 if HIGH_RISK_WORDS.search(path) else 2


def risk_score(files: list[dict]) -> tuple[float, int, list[str]]:
    """Score a PR from its changed files: max tier dominates, size breaks ties.

    `files` are REST `pulls/<n>/files` items (filename, changes).
    Returns (score, tier, reasons).
    """
    if not files:
        return 0.0, 1, []
    tiers = [(file_tier(f["filename"]), f) for f in files]
    tier = max(t for t, _ in tiers)
    lines = sum(f.get("changes", 0) for t, f in tiers if t == tier)
    reasons = sorted({f["filename"] for t, f in tiers if t == tier})[:3]
    return tier * 10 + math.log10(1 + lines), tier, reasons


def load_audited(audit_dir: Path = AUDIT_DIR) -> dict[int, dict]:
    out = {}
    if audit_dir.is_dir():
        for p in audit_dir.glob("*.json"):
            try:
                rec = json.loads(p.read_text())
                out[int(rec["pr"])] = rec
            except (ValueError, KeyError):
                continue
    return out


def select(candidates: list[dict], audited: dict[int, dict], k: int) -> list[dict]:
    """Highest score first, then oldest merge first; skip audited PRs."""
    todo = [c for c in candidates if c["number"] not in audited]
    todo.sort(key=lambda c: (-round(c["score"], 3), c["merged_at"]))
    return todo[:k]


def _ctx() -> ssl.SSLContext:
    bundle = "/root/.ccr/ca-bundle.crt"
    return ssl.create_default_context(cafile=bundle if os.path.exists(bundle) else None)


def _get(url: str):
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    tok = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if tok and not os.environ.get("HTTPS_PROXY"):
        req.add_header("Authorization", f"Bearer {tok}")
    with urllib.request.urlopen(req, context=_ctx(), timeout=60) as r:
        return json.load(r)


def merged_since(hours: float) -> list[dict]:
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    out = []
    for page in range(1, 30):
        batch = _get(f"{API}/pulls?state=closed&per_page=100&page={page}&sort=updated&direction=desc")
        if not batch:
            break
        stop = True
        for p in batch:
            upd = datetime.fromisoformat(p["updated_at"].replace("Z", "+00:00"))
            if upd >= since:
                stop = False
            if p.get("merged_at") and datetime.fromisoformat(p["merged_at"].replace("Z", "+00:00")) >= since:
                out.append({"number": p["number"], "title": p["title"], "merged_at": p["merged_at"]})
        if stop:
            break
    return out


def score_prs(prs: list[dict]) -> list[dict]:
    for p in prs:
        files = []
        for page in range(1, 31):  # the API lists at most 3,000 files
            batch = _get(f"{API}/pulls/{p['number']}/files?per_page=100&page={page}")
            files += batch
            if len(batch) < 100:
                break
        p["score"], p["tier"], p["reasons"] = risk_score(files)
    return prs


def cmd_queue(a) -> int:
    audited = load_audited()
    prs = [p for p in merged_since(a.hours) if p["number"] not in audited]
    # Score only what could make the cut: scoring costs one API call per PR.
    picked = select(score_prs(prs[: a.scan]), audited, a.k)
    for p in picked:
        tier = {3: "high", 2: "code", 1: "docs"}[p["tier"]]
        print(f"#{p['number']}  {tier:<4}  {p['merged_at'][:16]}  {p['title'][:70]}")
        print(f"        diff: curl -sS -H 'Accept: application/vnd.github.diff' {API}/pulls/{p['number']}")
        for r in p["reasons"]:
            print(f"        - {r}")
    if not picked:
        print("nothing unaudited in the window")
    return 0


def cmd_record(a) -> int:
    AUDIT_DIR.mkdir(exist_ok=True)
    rec = {
        "pr": a.pr,
        "reviewed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "findings": a.findings,
        "severity": a.severity,
        "fix_pr": a.fix_pr,
        "note": a.note,
    }
    path = AUDIT_DIR / f"{a.pr}.json"
    path.write_text(json.dumps(rec, indent=1) + "\n")
    print(f"wrote {path.relative_to(AUDIT_DIR.parents[2])}")
    return 0


def cmd_coverage(a) -> int:
    audited = load_audited()
    prs = merged_since(a.hours)
    n = len(prs)
    hit = [p for p in prs if p["number"] in audited]
    found = sum(1 for p in hit if audited[p["number"]].get("findings", 0) > 0)
    print(f"merged in last {a.hours:g}h: {n}; audited: {len(hit)}"
          f" ({100 * len(hit) / n if n else 0:.1f}%); audits with findings: {found}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    q = sub.add_parser("queue", help="riskiest unaudited merged PRs")
    q.add_argument("--hours", type=float, default=48)
    q.add_argument("--k", type=int, default=5)
    q.add_argument("--scan", type=int, default=150, help="PRs to score (one API call each)")
    r = sub.add_parser("record", help="write an audit file")
    r.add_argument("pr", type=int)
    r.add_argument("--findings", type=int, required=True)
    r.add_argument("--severity", choices=["none", "low", "medium", "high"], default="none")
    r.add_argument("--fix-pr", type=int)
    r.add_argument("--note", default="")
    c = sub.add_parser("coverage", help="share of merged PRs audited")
    c.add_argument("--hours", type=float, default=168)
    a = ap.parse_args(argv)
    return {"queue": cmd_queue, "record": cmd_record, "coverage": cmd_coverage}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
