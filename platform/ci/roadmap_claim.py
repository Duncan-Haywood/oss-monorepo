#!/usr/bin/env python3
"""Claim a private-monorepo ROADMAP "Next" item before building it (backlog P079).

Parallel ventures runs read the same app ROADMAP and pick the same top item within
minutes; the open-PR check at the start cannot see a PR opened ten minutes later
(2026-11-25: private-monorepo PRs 106, 107 and 108 all built one slice; 107 and 108
closed). A claim is a create-only branch `claim/<app>/<slug>` pushed to the clone's
origin, holding one parentless empty commit whose message names the item, so the
second run's push fails and it picks another item. No files, so no CI runs on it.

    python3 platform/ci/roadmap_claim.py payapps               # Next items, claimed or free
    python3 platform/ci/roadmap_claim.py payapps --claim 3     # claim item 3 (exit 4 if taken)
    python3 platform/ci/roadmap_claim.py payapps --claim 3 --slug backup-packets-part-2-heic \\
        --note "HEIC and WebP photos only"                     # claim one part of an item
    python3 platform/ci/roadmap_claim.py payapps --release <slug>   # give up your own claim

--repo defaults to /home/user/private-monorepo. A claim older than --stale-hours (6) is
shown as stale, and --claim on it takes a fresh generation (`<slug>--2`), since the run
that made it has ended. Exit codes: 0 ok, 2 usage or git error, 4 the item is already
claimed (pick another).
"""
from __future__ import annotations

import argparse
import os
import re
import secrets
import subprocess
import sys
import time
from pathlib import Path

PREFIX = "claim/"
DEFAULT_REPO = "/home/user/private-monorepo"
CACHE = "refs/roadmap-claims/"
GEN = re.compile(r"^(?P<base>.+?)--(?P<n>\d+)$")


def git(repo: str, *args: str, check: bool = False, env: dict | None = None) -> subprocess.CompletedProcess:
    # input="": `git mktree` reads stdin and would otherwise wait on a terminal forever.
    return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True, check=check,
                          input="", env={**os.environ, **(env or {})})


def slugify(text: str, words: int = 8) -> str:
    """Slug of an item's title: the text before its first colon, else its first words."""
    head = text.split(":", 1)[0] if ":" in text[:90] else text
    head = re.sub(r"\*\*|`|\[|\]\([^)]*\)", "", head)
    toks = re.findall(r"[a-z0-9]+", head.lower())[:words]
    return "-".join(toks)[:60].strip("-") or "item"


def next_items(roadmap: str) -> list[tuple[int, str]]:
    """(number, text) of the items under the first `## Next` heading, continuation lines joined.

    A numbered list keeps the ROADMAP's own numbers (jobshop-quote's Next starts at 3);
    bullets are numbered from 1.
    """
    items: list[tuple[int, str]] = []
    inside = False
    for line in roadmap.splitlines():
        if line.startswith("## "):
            if inside:
                break
            inside = line[3:].strip().lower().startswith("next")
            continue
        if not inside:
            continue
        m = re.match(r"^(?:[-*]|(\d+)\.)\s+(.*)", line)
        if m:
            items.append((int(m.group(1)) if m.group(1) else len(items) + 1, m.group(2).strip()))
        elif items and line.startswith((" ", "\t")) and line.strip():
            items[-1] = (items[-1][0], items[-1][1] + " " + line.strip())
    return items


def parse_claims(ls_remote: str, app: str) -> dict[str, tuple[int, str]]:
    """{slug: (generation, sha)} for the newest generation of each claimed slug of this app."""
    out: dict[str, tuple[int, str]] = {}
    lead = f"refs/heads/{PREFIX}{app}/"
    for line in ls_remote.splitlines():
        parts = line.split()
        if len(parts) != 2 or not parts[1].startswith(lead):
            continue
        name = parts[1][len(lead):]
        m = GEN.match(name)
        base, gen = (m["base"], int(m["n"])) if m else (name, 1)
        if base not in out or gen > out[base][0]:
            out[base] = (gen, parts[0])
    return out


def ref_name(app: str, slug: str, gen: int) -> str:
    return f"refs/heads/{PREFIX}{app}/{slug}" + (f"--{gen}" if gen > 1 else "")


def claim_info(repo: str, app: str, claims: dict[str, tuple[int, str]]) -> dict[str, tuple[int, str]]:
    """{slug: (commit time, message)}, fetching the tiny claim commits once."""
    if not claims:
        return {}
    git(repo, "fetch", "-q", "--no-tags", "origin",
        f"+refs/heads/{PREFIX}{app}/*:{CACHE}{app}/*")
    info = {}
    for slug, (_, sha) in claims.items():
        r = git(repo, "log", "-1", "--format=%ct%x09%s", sha)
        ts, _, msg = r.stdout.strip().partition("\t")
        info[slug] = (int(ts) if ts.isdigit() else 0, msg)
    return info


def push_claim(repo: str, ref: str, message: str, base: str | None = None) -> bool:
    """Create-only push of a fresh claim commit; False if the ref already exists.

    The commit carries a random token so no other run can push the same sha (an identical
    sha would read "Everything up-to-date" and both runs would think they won). With no
    `base` it is an empty orphan commit; with one (quality_claim.py passes origin/main) it
    has `base` as parent and base's tree, so it changes no path against that branch.
    """
    env = {"GIT_AUTHOR_NAME": "roadmap-claim", "GIT_AUTHOR_EMAIL": "roadmap-claim@invalid",
           "GIT_COMMITTER_NAME": "roadmap-claim", "GIT_COMMITTER_EMAIL": "roadmap-claim@invalid"}
    tree = git(repo, "rev-parse", f"{base}^{{tree}}") if base else git(repo, "mktree", env=env)
    if tree.returncode != 0:
        return False
    parent = ["-p", base] if base else []
    made = git(repo, "commit-tree", tree.stdout.strip(), *parent,
               "-m", f"{message} ({secrets.token_hex(6)})", env=env)
    if made.returncode != 0:
        return False
    r = git(repo, "push", "-q", f"--force-with-lease={ref}:", "origin", f"{made.stdout.strip()}:{ref}")
    return r.returncode == 0


def age(ts: int, now: float) -> str:
    mins = int((now - ts) / 60) if ts else -1
    return "age unknown" if mins < 0 else (f"{mins} min ago" if mins < 120 else f"{mins // 60} h ago")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("app", help="app directory under apps/, e.g. payapps")
    ap.add_argument("--repo", default=DEFAULT_REPO)
    ap.add_argument("--claim", type=int, metavar="N", help="claim Next item N (as listed)")
    ap.add_argument("--slug", help="claim under this slug instead (one part of an item, or an "
                                   "app whose ROADMAP has no Next list); works without --claim")
    ap.add_argument("--note", default="", help="what exactly this run builds")
    ap.add_argument("--release", metavar="SLUG", help="delete your own claim on SLUG")
    ap.add_argument("--stale-hours", type=float, default=6.0)
    a = ap.parse_args(argv)

    roadmap = Path(a.repo) / "apps" / a.app / "ROADMAP.md"
    if not roadmap.is_file():
        print(f"no {roadmap}: clone private-monorepo first (.github/prompts/cloud-session.md)")
        return 2
    items = next_items(roadmap.read_text(encoding="utf-8"))
    ls = git(a.repo, "ls-remote", "origin", f"refs/heads/{PREFIX}{a.app}/*")
    if ls.returncode != 0:
        print(f"git ls-remote failed: {ls.stderr.strip()}")
        return 2
    claims = parse_claims(ls.stdout, a.app)
    now = time.time()
    stale_s = a.stale_hours * 3600

    if a.release:
        if a.release not in claims:
            print(f"no claim on {a.release}")
            return 2
        gen, sha = claims[a.release]
        r = git(a.repo, "push", "-q", f"--force-with-lease={ref_name(a.app, a.release, gen)}:{sha}",
                "origin", f":{ref_name(a.app, a.release, gen)}")
        print("released" if r.returncode == 0 else f"release failed: {r.stderr.strip()}")
        return 0 if r.returncode == 0 else 2

    info = claim_info(a.repo, a.app, claims)

    if a.claim is not None or a.slug:
        by_num = dict(items)
        if a.claim is not None and a.claim not in by_num:
            print(f"item {a.claim} is not in this Next list ({sorted(by_num)})")
            return 2
        title = by_num.get(a.claim, a.slug or "")[:120]
        slug = slugify(a.slug) if a.slug else slugify(title)
        gen = 1
        if slug in claims:
            ts, msg = info.get(slug, (0, ""))
            if ts and now - ts < stale_s:
                print(f"TAKEN: {slug} claimed {age(ts, now)}: {msg}\nPick another item.")
                return 4
            gen = claims[slug][0] + 1
        msg = f"claim {a.app} #{a.claim or '-'} {slug}" + (f" [{a.note}]" if a.note else "") + f": {title}"
        ref = ref_name(a.app, slug, gen)
        if not push_claim(a.repo, ref, msg):
            print(f"TAKEN: another run pushed {ref} first (or the push failed). Pick another item.")
            return 4
        print(f"CLAIMED {ref.removeprefix('refs/heads/')}. Name the slug in your PR title; "
              f"`--release {slug}` if you drop it.")
        return 0

    print(f"{a.app} ROADMAP Next ({len(items)} items; claims older than {a.stale_hours:g} h are stale):")
    seen = set()
    if not items:
        print("  (no `## Next` list: claim what you build with --slug <short-name> --note ...)")
    for i, text in items:
        slug = slugify(text)
        mark = "free"
        if slug in claims:
            seen.add(slug)
            ts, msg = info.get(slug, (0, ""))
            mark = ("STALE " if ts and now - ts >= stale_s else "CLAIMED ") + age(ts, now)
        elif any(c.startswith(slug + "-") for c in claims):
            mark = "a part is claimed: see below"
        print(f"{i:>3}. [{mark}] {slug}: {text[:90]}")
    others = sorted(set(claims) - seen)
    if others:
        print("Other claims on this app (parts of items, or items already done):")
        for slug in others:
            ts, msg = info.get(slug, (0, ""))
            stale = "STALE " if ts and now - ts >= stale_s else ""
            print(f"  - {stale}{slug} ({age(ts, now)}): {msg[:110]}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:  # `| head`
        sys.exit(0)
