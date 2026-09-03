#!/usr/bin/env python3
"""Cross-agent pull request review and auto-merge eligibility checks.

Reviewers are four GitHub App identities (GH, Kilo, Cursor, Claude). Each
reviews PRs it did not author. Reviews are substantive but deterministic:
required CI must be green, mergeable, and path-scoped validators must pass.

Usage:
    # Review one PR as a given reviewer (GH_TOKEN = reviewer App token):
    python3 review.py --reviewer gh --pr 818

    # Review open PRs missing this reviewer's approval (session start):
    python3 review_pending.py --reviewer claude --max 5

    # Check whether a PR is eligible for auto-merge:
    python3 review.py --check-merge-eligible --pr 818

TRUST BOUNDARY: this script must always run from a trusted checkout (the
default branch, not the PR under review) whenever it is invoked with a
credential that can write to the repo (a reviewer App token that can post
reviews, or a merge-capable GITHUB_TOKEN). evaluate_pr()'s three
run_portfolio_validate/run_decision_queue_check/run_publish_surface() helpers
shell out to validator scripts read from the *working tree*, so if this
file's own working tree were ever a PR's own checkout, a PR could edit this
file (or those validators) to force its own approval or merge regardless of
its actual content. The CI workflows that call this script pin their
checkout to the base branch for exactly this reason — see the SECURITY
comments in .github/workflows/agent-cross-review.yml and
.github/workflows/agent-pr-auto-merge.yml. A local, human-directed run
against a manually checked-out PR (to validate that PR's own files) is fine;
an unattended, write-capable CI job must not do that.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

CONFIG_PATH = Path(__file__).resolve().parent / "config.yaml"
REPO_ROOT = Path(__file__).resolve().parents[3]

# Check runs created by this reviewer / auto-merge workflow. They must not
# gate approval: the four review jobs run in parallel on the same head SHA
# and would otherwise see each other (and themselves) as pending, and a
# missing App secret would leave a failed check that blocks every reviewer.
SELF_CHECK_RUN_NAMES = frozenset(
    {
        "resolve-pr",
        "review-gh",
        "review-kilo",
        "review-cursor",
        "review-claude",
        "auto-merge",
    }
)

_DECISIVE_REVIEW_STATES = frozenset({"APPROVED", "CHANGES_REQUESTED", "DISMISSED"})


@dataclass(frozen=True)
class ReviewerConfig:
    key: str
    display_name: str
    github_login: str
    author_skip: tuple[str, ...]


@dataclass(frozen=True)
class AgentReviewConfig:
    required_approvals: int
    reviewers: dict[str, ReviewerConfig]
    allowed_approvers: frozenset[str]


def load_config(path: Path = CONFIG_PATH) -> AgentReviewConfig:
    raw = yaml.safe_load(path.read_text())
    reviewers: dict[str, ReviewerConfig] = {}
    for key, value in raw["reviewers"].items():
        reviewers[key] = ReviewerConfig(
            key=key,
            display_name=value["display_name"],
            github_login=value["github_login"],
            author_skip=tuple(value["author_skip"]),
        )
    return AgentReviewConfig(
        required_approvals=int(raw["required_approvals"]),
        reviewers=reviewers,
        allowed_approvers=frozenset(raw["allowed_approvers"]),
    )


def _normalize_login(login: str) -> str:
    return login.strip().lower()


def _login_stem(login: str) -> str:
    login = _normalize_login(login)
    if login.endswith("[bot]"):
        login = login.removesuffix("[bot]")
    if login.startswith("app/"):
        login = login.removeprefix("app/")
    return login


def author_matches_skip(author_login: str, skip: tuple[str, ...]) -> bool:
    author_stem = _login_stem(author_login)
    for pattern in skip:
        if _login_stem(pattern) == author_stem:
            return True
        if _normalize_login(pattern) == _normalize_login(author_login):
            return True
    return False


def gh_api(path: str, *, method: str = "GET", data: dict[str, Any] | None = None) -> Any:
    cmd = ["gh", "api", path, "--method", method]
    if data is not None:
        for key, value in data.items():
            cmd.extend(["-f", f"{key}={value}"])
    result = subprocess.run(
        cmd,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"gh api {path} failed ({result.returncode}): {result.stderr.strip()}"
        )
    if not result.stdout.strip():
        return None
    return json.loads(result.stdout)


def repo_slug() -> str:
    result = subprocess.run(
        ["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def fetch_pull_request(pr_number: int) -> dict[str, Any]:
    slug = repo_slug()
    return gh_api(f"repos/{slug}/pulls/{pr_number}")


def fetch_reviews(pr_number: int) -> list[dict[str, Any]]:
    slug = repo_slug()
    reviews: list[dict[str, Any]] = []
    page = 1
    while True:
        batch = gh_api(
            f"repos/{slug}/pulls/{pr_number}/reviews?per_page=100&page={page}"
        )
        if not batch:
            break
        reviews.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    return reviews


def fetch_check_runs(pr_number: int) -> list[dict[str, Any]]:
    slug = repo_slug()
    pr = fetch_pull_request(pr_number)
    head_sha = pr["head"]["sha"]
    runs: list[dict[str, Any]] = []
    page = 1
    while True:
        payload = gh_api(
            f"repos/{slug}/commits/{head_sha}/check-runs?per_page=100&page={page}"
        )
        batch = (payload or {}).get("check_runs", [])
        runs.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    return runs


def _is_self_check_run(name: str) -> bool:
    bare = name.rsplit(" / ", 1)[-1].strip()
    return bare in SELF_CHECK_RUN_NAMES


def latest_decisive_reviews(
    reviews: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Latest APPROVED / CHANGES_REQUESTED / DISMISSED review per login."""
    latest: dict[str, dict[str, Any]] = {}
    ordered = sorted(reviews, key=lambda r: str(r.get("submitted_at") or ""))
    for review in ordered:
        if review.get("state") not in _DECISIVE_REVIEW_STATES:
            continue
        user = review.get("user") or {}
        login = _normalize_login(user.get("login", ""))
        if not login:
            continue
        latest[login] = review
    return latest


def _approval_matches_head(review: dict[str, Any], head_sha: str | None) -> bool:
    if not head_sha:
        return True
    return review.get("commit_id") == head_sha


def reviewer_already_approved(
    reviews: list[dict[str, Any]],
    reviewer_login: str,
    head_sha: str | None = None,
) -> bool:
    login = _normalize_login(reviewer_login)
    latest = latest_decisive_reviews(reviews).get(login)
    if latest is None or latest.get("state") != "APPROVED":
        return False
    return _approval_matches_head(latest, head_sha)


def count_allowed_approvals(
    reviews: list[dict[str, Any]],
    allowed: frozenset[str],
    head_sha: str | None = None,
) -> set[str]:
    allowed_norm = {_normalize_login(a) for a in allowed}
    approvers: set[str] = set()
    for login, review in latest_decisive_reviews(reviews).items():
        if review.get("state") != "APPROVED":
            continue
        if login not in allowed_norm:
            continue
        if not _approval_matches_head(review, head_sha):
            continue
        approvers.add(login)
    return approvers


def checks_all_success(check_runs: list[dict[str, Any]]) -> tuple[bool, list[str]]:
    """Return (ok, reasons). Pending or failed required checks block approval."""
    if not check_runs:
        return False, ["no check runs on head commit yet"]

    relevant = [
        run for run in check_runs if not _is_self_check_run(run.get("name", "unknown"))
    ]
    if not relevant:
        return True, [
            "only agent review/auto-merge checks on head commit; those do not gate approval"
        ]

    reasons: list[str] = []
    blocking: list[str] = []
    for run in relevant:
        name = run.get("name", "unknown")
        status = run.get("status")
        conclusion = run.get("conclusion")
        if status != "completed":
            blocking.append(f"{name}: status={status}")
            continue
        if conclusion not in ("success", "skipped", "neutral"):
            blocking.append(f"{name}: conclusion={conclusion}")

    if blocking:
        reasons.extend(blocking)
        return False, reasons
    return True, ["all completed check runs passed or were skipped/neutral"]


def changed_files(pr_number: int) -> list[str]:
    slug = repo_slug()
    files: list[str] = []
    page = 1
    while True:
        batch = gh_api(
            f"repos/{slug}/pulls/{pr_number}/files?per_page=100&page={page}"
        )
        if not batch:
            break
        files.extend(item["filename"] for item in batch)
        if len(batch) < 100:
            break
        page += 1
    return files


def run_portfolio_validate() -> tuple[bool, str]:
    result = subprocess.run(
        [sys.executable, str(REPO_ROOT / "platform/ci/validate_workflows.py")],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return False, result.stdout + result.stderr
    return True, "validate_workflows.py passed"


def run_decision_queue_check() -> tuple[bool, str]:
    result = subprocess.run(
        [
            sys.executable,
            str(REPO_ROOT / "portfolio/ledger/decision_queue.py"),
            "--check",
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return False, result.stdout + result.stderr
    return True, "decision_queue.py --check passed"


def run_publish_surface() -> tuple[bool, str]:
    result = subprocess.run(
        [
            sys.executable,
            str(REPO_ROOT / "platform/ci/publish_surface.py"),
            "--check",
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return False, result.stdout + result.stderr
    return True, "publish_surface.py --check passed"


def path_touches_ventures(files: list[str]) -> bool:
    return any(f.startswith("ventures/") for f in files)


def evaluate_pr(pr_number: int) -> tuple[bool, list[str]]:
    """Run deterministic checks a reviewer App should enforce before APPROVE."""
    reasons: list[str] = []
    pr = fetch_pull_request(pr_number)

    if pr.get("draft"):
        return False, ["PR is still a draft"]

    if pr.get("mergeable") is False:
        return False, ["PR is not mergeable (conflicts or checks pending)"]

    ok_checks, check_reasons = checks_all_success(fetch_check_runs(pr_number))
    reasons.extend(check_reasons)
    if not ok_checks:
        return False, reasons

    files = changed_files(pr_number)
    reasons.append(f"changed {len(files)} file(s)")

    if any(f.endswith((".yml", ".yaml")) and ".github/workflows" in f for f in files):
        ok, msg = run_portfolio_validate()
        reasons.append(msg)
        if not ok:
            return False, reasons

    if any(f.startswith("portfolio/ledger/") for f in files):
        ok, msg = run_decision_queue_check()
        reasons.append(msg)
        if not ok:
            return False, reasons

    if any(f.startswith("platform/ci/") for f in files):
        ok, msg = run_publish_surface()
        reasons.append(msg)
        if not ok:
            return False, reasons

    if path_touches_ventures(files):
        reasons.append(
            "touches ventures/* — venture path-filtered CI must be green on the PR"
        )

    return True, reasons


def format_review_body(
    reviewer: ReviewerConfig, pr_number: int, ok: bool, reasons: list[str]
) -> str:
    verdict = "APPROVE" if ok else "REQUEST_CHANGES"
    lines = [
        f"## {reviewer.display_name} review",
        "",
        f"Automated cross-agent review for PR #{pr_number}.",
        "",
        f"**Verdict:** {verdict}",
        "",
        "### Checks",
        "",
    ]
    lines.extend(f"- {reason}" for reason in reasons)
    lines.extend(
        [
            "",
            "This review is posted by a dedicated reviewer GitHub App, not the PR author.",
            "Auto-merge runs when two allowed agent reviewers approve and CI stays green.",
        ]
    )
    return "\n".join(lines)


def submit_review(
    pr_number: int, reviewer: ReviewerConfig, ok: bool, reasons: list[str]
) -> None:
    slug = repo_slug()
    event = "APPROVE" if ok else "REQUEST_CHANGES"
    body = format_review_body(reviewer, pr_number, ok, reasons)
    gh_api(
        f"repos/{slug}/pulls/{pr_number}/reviews",
        method="POST",
        data={"event": event, "body": body},
    )


def review_pull_request(pr_number: int, reviewer_key: str) -> str:
    config = load_config()
    reviewer = config.reviewers[reviewer_key]
    pr = fetch_pull_request(pr_number)
    author = (pr.get("user") or {}).get("login", "")

    if author_matches_skip(author, reviewer.author_skip):
        return f"skip: PR #{pr_number} authored by {author} (self-review)"

    reviews = fetch_reviews(pr_number)
    head_sha = (pr.get("head") or {}).get("sha")
    if reviewer_already_approved(reviews, reviewer.github_login, head_sha):
        return f"skip: {reviewer.github_login} already approved PR #{pr_number}"

    ok, reasons = evaluate_pr(pr_number)
    submit_review(pr_number, reviewer, ok, reasons)
    verdict = "APPROVED" if ok else "REQUEST_CHANGES"
    return f"{verdict}: PR #{pr_number} as {reviewer.github_login}"


def merge_eligible(pr_number: int) -> tuple[bool, list[str]]:
    config = load_config()
    pr = fetch_pull_request(pr_number)
    reasons: list[str] = []

    if pr.get("draft"):
        return False, ["draft PR"]
    if pr.get("merged"):
        return False, ["already merged"]
    if pr.get("state") != "open":
        return False, [f"state={pr.get('state')}"]

    ok_checks, check_reasons = checks_all_success(fetch_check_runs(pr_number))
    reasons.extend(check_reasons)
    if not ok_checks:
        return False, reasons

    reviews = fetch_reviews(pr_number)
    head_sha = (pr.get("head") or {}).get("sha")
    approvers = count_allowed_approvals(
        reviews, config.allowed_approvers, head_sha
    )
    reasons.append(
        f"{len(approvers)} allowed approver(s): {', '.join(sorted(approvers)) or '(none)'}"
    )
    if len(approvers) < config.required_approvals:
        return False, reasons + [
            f"need {config.required_approvals} allowed approvals, have {len(approvers)}"
        ]

    files = changed_files(pr_number)
    if path_touches_ventures(files):
        return False, reasons + [
            "touches ventures/* — human-gated; owner must merge"
        ]

    ok, eval_reasons = evaluate_pr(pr_number)
    reasons.extend(eval_reasons)
    if not ok:
        return False, reasons

    return True, reasons


def try_auto_merge(pr_number: int) -> str:
    eligible, reasons = merge_eligible(pr_number)
    if not eligible:
        return "skip merge: " + "; ".join(reasons)

    slug = repo_slug()
    gh_api(
        f"repos/{slug}/pulls/{pr_number}/merge",
        method="PUT",
        data={"merge_method": "squash"},
    )
    return f"merged PR #{pr_number}: " + "; ".join(reasons)


def list_open_prs() -> list[dict[str, Any]]:
    slug = repo_slug()
    return gh_api(f"repos/{slug}/pulls?state=open&per_page=100")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reviewer", choices=["gh", "kilo", "cursor", "claude"])
    parser.add_argument("--pr", type=int)
    parser.add_argument("--check-merge-eligible", action="store_true")
    parser.add_argument("--auto-merge", action="store_true")
    args = parser.parse_args(argv)

    if args.check_merge_eligible:
        if args.pr is None:
            parser.error("--pr is required with --check-merge-eligible")
        ok, reasons = merge_eligible(args.pr)
        print(json.dumps({"eligible": ok, "reasons": reasons}, indent=2))
        return 0 if ok else 1

    if args.auto_merge:
        if args.pr is None:
            parser.error("--pr is required with --auto-merge")
        print(try_auto_merge(args.pr))
        return 0

    if args.reviewer is None or args.pr is None:
        parser.error("--reviewer and --pr are required")
    print(review_pull_request(args.pr, args.reviewer))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
