#!/usr/bin/env python3
"""Review open PRs missing this reviewer's approval — run before new work."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow `python3 platform/ci/agent_review/review_pending.py` from repo root.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from review import (
    author_matches_skip,
    fetch_reviews,
    list_open_prs,
    load_config,
    pr_from_same_repo,
    review_pull_request,
    reviewer_already_approved,
    untrusted_reason,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reviewer",
        required=True,
        choices=["gh", "kilo", "cursor", "claude"],
    )
    parser.add_argument(
        "--max",
        type=int,
        default=5,
        help="Maximum PRs to review this session (default 5)",
    )
    args = parser.parse_args(argv)

    config = load_config()
    reviewer = config.reviewers[args.reviewer]
    reviewed = 0

    for pr in list_open_prs():
        if reviewed >= args.max:
            break
        number = pr["number"]
        same_repo, origin_reason = pr_from_same_repo(pr)
        if not same_repo:
            print(f"skip #{number}: {origin_reason}")
            continue
        author = (pr.get("user") or {}).get("login", "")
        untrusted = untrusted_reason(pr)
        if untrusted:
            print(f"skip #{number}: {untrusted}")
            continue
        if author_matches_skip(author, reviewer.author_skip):
            print(f"skip #{number}: authored by {author}")
            continue
        reviews = fetch_reviews(number)
        head_sha = (pr.get("head") or {}).get("sha")
        if reviewer_already_approved(reviews, reviewer.github_login, head_sha):
            print(f"skip #{number}: already reviewed by {reviewer.github_login}")
            continue
        print(review_pull_request(number, args.reviewer))
        reviewed += 1

    if reviewed == 0:
        print(f"No PRs needed a {reviewer.display_name} review.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
