#!/usr/bin/env python3
"""Fetch recent pull requests, their reviews and review comments to a JSON cache.

Usage: python3 fetch.py OUT.json [--pages N] [--reviews-sample M]
Reads the public REST API; in a cloud session the agent proxy supplies auth.
"""
from __future__ import annotations

import json
import os
import ssl
import sys
import urllib.request

REPO = "Duncan-Haywood/oss-monorepo"
API = f"https://api.github.com/repos/{REPO}"


def _ctx() -> ssl.SSLContext:
    bundle = "/root/.ccr/ca-bundle.crt"
    return ssl.create_default_context(cafile=bundle if os.path.exists(bundle) else None)


def get(url: str):
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    tok = os.environ.get("GH_TOKEN")
    if tok and not os.environ.get("HTTPS_PROXY"):
        req.add_header("Authorization", f"Bearer {tok}")
    with urllib.request.urlopen(req, context=_ctx(), timeout=60) as r:
        return json.load(r)


def main() -> int:
    out = sys.argv[1]
    pages = int(sys.argv[sys.argv.index("--pages") + 1]) if "--pages" in sys.argv else 10
    sample = int(sys.argv[sys.argv.index("--reviews-sample") + 1]) if "--reviews-sample" in sys.argv else 300
    keep = ("number", "title", "state", "draft", "created_at", "closed_at", "merged_at", "user", "head")
    prs = []
    for state in ("closed", "open"):
        for page in range(1, pages + 1):
            batch = get(f"{API}/pulls?state={state}&per_page=100&page={page}&sort=created&direction=desc")
            if not batch:
                break
            for p in batch:
                prs.append({
                    **{k: p[k] for k in keep if k not in ("user", "head")},
                    "author": p["user"]["login"],
                    "head_ref": p["head"]["ref"],
                    "fork": bool(p["head"]["repo"]) and p["head"]["repo"]["full_name"].lower() != REPO.lower(),
                })
            if state == "open" and len(batch) < 100:
                break
    # Reviews and inline comments for the newest `sample` merged PRs.
    merged = [p for p in prs if p.get("merged_at")]
    merged.sort(key=lambda p: p["merged_at"], reverse=True)
    for p in merged[:sample]:
        n = p["number"]
        p["reviews"] = [
            {"user": r["user"]["login"] if r.get("user") else None, "state": r["state"],
             "body_len": len(r.get("body") or ""), "submitted_at": r.get("submitted_at")}
            for r in get(f"{API}/pulls/{n}/reviews?per_page=100")
        ]
        p["review_comments"] = [
            {"user": c["user"]["login"] if c.get("user") else None, "body": (c.get("body") or "")[:400]}
            for c in get(f"{API}/pulls/{n}/comments?per_page=100")
        ]
    with open(out, "w") as f:
        json.dump(prs, f)
    print(f"{len(prs)} PRs, {min(sample, len(merged))} with reviews fetched -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
