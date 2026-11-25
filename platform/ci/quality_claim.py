#!/usr/bin/env python3
"""Claim a quality-audit subject before fixing its defects, so a parallel fix session skips it.

`quality_audit.py queue` shuffles subjects per session and sinks rows an open PR already
names, but neither sees a twin session that has not opened its PR yet: on 2026-11-25 two
fix sessions took retail-pilot-intel #0 within minutes (PRs #18894 and #18903), and another
pair both rewrote the same marker.mjs within the hour (PR #18905); 2026-11-16 had the same
race (run-record doc_friction on quality_audit.py). A claim is a create-only branch
`claim/quality-fix/<subject-slug>` pushed to origin, so the second session's push fails and
`queue` shows the row as claimed. The claim commit sits on origin/main with main's own
tree, so the push changes no path and no workflow runs on it (none trigger on claim/*).

    python3 platform/ci/quality_audit.py claim research/energy-store-hx --note "defect 0"
    python3 platform/ci/quality_audit.py claim research/energy-store-hx --release

Exit codes: 0 claimed or released, 2 git error, 4 claimed by another session (pick another
row). A claim older than STALE_HOURS is stale: the session that made it has ended, so
`queue` shows the row as free again and a new claim takes the next generation.
"""
from __future__ import annotations

import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import roadmap_claim as rc  # noqa: E402  (create-only claim branches; same mechanism, other namespace)

ROOT = str(Path(__file__).resolve().parents[2])
APP = "quality-fix"
STALE_HOURS = 6.0


def subject_slug(subject: str) -> str:
    return re.sub(r"[^a-z0-9._-]+", "-", subject.lower()).strip("-.")[:80] or "subject"


def live_claims(repo: str = ROOT, now: float | None = None) -> dict[str, tuple[int, str]] | None:
    """{subject slug: (claim time, message)} for claims younger than STALE_HOURS; None if origin is unreadable."""
    ls = rc.git(repo, "ls-remote", "origin", f"refs/heads/{rc.PREFIX}{APP}/*")
    if ls.returncode != 0:
        return None
    claims = rc.parse_claims(ls.stdout, APP)
    info = rc.claim_info(repo, APP, claims)
    now = time.time() if now is None else now
    return {s: v for s, v in info.items() if v[0] and now - v[0] < STALE_HOURS * 3600}


def claim(subject: str, note: str = "", release: bool = False, repo: str = ROOT, now: float | None = None) -> int:
    slug = subject_slug(subject)
    ls = rc.git(repo, "ls-remote", "origin", f"refs/heads/{rc.PREFIX}{APP}/*")
    if ls.returncode != 0:
        print(f"git ls-remote failed: {ls.stderr.strip()}")
        return 2
    claims = rc.parse_claims(ls.stdout, APP)
    if release:
        if slug not in claims:
            print(f"no claim on {subject}")
            return 2
        gen, sha = claims[slug]
        ref = rc.ref_name(APP, slug, gen)
        r = rc.git(repo, "push", "-q", f"--force-with-lease={ref}:{sha}", "origin", f":{ref}")
        print("released" if r.returncode == 0 else f"release failed: {r.stderr.strip()}")
        return 0 if r.returncode == 0 else 2
    now = time.time() if now is None else now
    gen = 1
    if slug in claims:
        ts, msg = rc.claim_info(repo, APP, {slug: claims[slug]}).get(slug, (0, ""))
        if ts and now - ts < STALE_HOURS * 3600:
            print(f"TAKEN: {subject} claimed {rc.age(ts, now)}: {msg}\nPick another row.")
            return 4
        gen = claims[slug][0] + 1
    # Any commit already on main will do as the parent; a stale one is fine.
    if rc.git(repo, "rev-parse", "-q", "--verify", "origin/main").returncode != 0:
        if rc.git(repo, "fetch", "-q", "origin", "main:refs/remotes/origin/main").returncode != 0:
            print("git fetch origin main failed")
            return 2
    ref = rc.ref_name(APP, slug, gen)
    msg = f"claim quality fix {subject}" + (f" [{note}]" if note else "")
    if not rc.push_claim(repo, ref, msg, base="origin/main"):
        print(f"TAKEN: another session pushed {ref.removeprefix('refs/heads/')} first (or the push failed). "
              "Pick another row.")
        return 4
    print(f"CLAIMED {ref.removeprefix('refs/heads/')}: `queue` now shows {subject} as claimed for "
          f"{STALE_HOURS:g} h. `quality_audit.py claim {subject} --release` if you drop it.")
    return 0
