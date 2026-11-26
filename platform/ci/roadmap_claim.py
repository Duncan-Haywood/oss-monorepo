#!/usr/bin/env python3
"""Claim an app's ROADMAP "Next" item before building it (backlog P079).

Parallel ventures runs read the same app ROADMAP and pick the same top item within
minutes; the open-PR check at the start cannot see a PR opened ten minutes later
(2026-11-25: the private repo's PRs 106, 107 and 108 all built one slice; 107 and 108
closed). A claim is a create-only branch `claim/<app>/<slug>` pushed to the clone's
origin, holding one parentless empty commit whose message names the item, so the
second run's push fails and it picks another item. No files, so no CI runs on it.

    python3 platform/ci/roadmap_claim.py payapps               # Next items, claimed or free
    python3 platform/ci/roadmap_claim.py payapps --claim 3     # claim item 3 (exit 4 if taken)
    python3 platform/ci/roadmap_claim.py payapps --claim 3 --slug backup-packets-part-2-heic \\
        --note "HEIC and WebP photos only"                     # claim one part of an item
    python3 platform/ci/roadmap_claim.py payapps --release <slug>   # give up your own claim

--repo defaults to this clone, whose apps/<app>/ROADMAP.md is read and whose origin takes
the claim branch: the paid apps moved here from private-monorepo (PRs 19220 and its
follow-up, 2026-11-26). Only `grants` stays in the private repo (it names a client under an
NDA), so for it --repo defaults to /home/user/private-monorepo. A claim older than --stale-hours (6) is
shown as stale, and --claim on it takes a fresh generation (`<slug>--2`), since the run
that made it has ended. A claim whose slug a later commit subject on origin/main names
(the PR title, punctuation ignored) is shown as MERGED and is no sibling. A claim records a hash of the session id, so re-running --claim on
your own claim prints YOURS (exit 0), not TAKEN. An app with no ROADMAP.md takes --slug claims. Exit codes: 0 ok, 2 usage or git error, 4 the item is already
claimed (pick another).
"""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import secrets
import subprocess
import sys
import time
from pathlib import Path

PREFIX = "claim/"
ROOT = str(Path(__file__).resolve().parents[2])
PRIVATE_REPO = "/home/user/private-monorepo"
PRIVATE_APPS = frozenset({"grants"})  # still in Duncan-Haywood/private-monorepo (client NDA)
CACHE = "refs/roadmap-claims/"
GEN = re.compile(r"^(?P<base>.+?)--(?P<n>\d+)$")
RUN = re.compile(r"\{run ([0-9a-f]{10})\}")


def run_tag() -> str | None:
    """Short hash of this session's id, so a re-run can tell its own claim from a rival's.

    Six run records (2026-11-25..26) re-ran --claim to confirm a claim, got "TAKEN 0 min ago"
    for their own branch and read it as a lost race. Hashed: the id itself never leaves.
    """
    sid = (os.environ.get("ROADMAP_CLAIM_RUN") or os.environ.get("CLAUDE_CODE_REMOTE_SESSION_ID")
           or os.environ.get("CLAUDE_CODE_SESSION_ID"))
    return hashlib.sha256(sid.encode()).hexdigest()[:10] if sid else None


def is_mine(msg: str, tag: str | None) -> bool:
    m = RUN.search(msg)
    return bool(tag and m and m.group(1) == tag)


def default_repo(app: str) -> str:
    """Where `app` lives: this clone for the moved paid apps, the private clone for grants."""
    return PRIVATE_REPO if app in PRIVATE_APPS else ROOT


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


def merged_claims(repo: str, info: dict[str, tuple[int, str]], branch: str = "main") -> dict[str, str]:
    """{slug: subject} for claims whose slug a commit on origin/<branch> names since the claim.

    A claim branch outlives the work: nobody releases it after the PR merges, so for six
    hours every later claim on the same item listed the finished parts as ALSO CLAIMED, and
    runs read each one to see it was done (run records 2026-11-25). The CLAIMED line asks
    for the slug in the PR title, so a merge (squash) subject naming it marks the part done.
    Matching ignores case and punctuation: "Billing, part 2" names billing-part-2.
    Best effort: with no reachable main, nothing is marked merged.
    """
    stamps = [ts for ts, _ in info.values() if ts]
    if not stamps:
        return {}
    shallow = git(repo, "rev-parse", "--is-shallow-repository").stdout.strip() == "true"
    git(repo, "fetch", "-q", "--no-tags", *(["--depth=200"] if shallow else []), "origin",
        f"+refs/heads/{branch}:refs/remotes/origin/{branch}")
    log = git(repo, "log", f"refs/remotes/origin/{branch}", f"--since={min(stamps) - 3600}",
              "--format=%ct%x09%s")
    if log.returncode != 0:
        return {}
    commits = []
    for line in log.stdout.splitlines():
        ts, _, subject = line.partition("\t")
        if ts.isdigit():
            commits.append((int(ts), subject, "-" + re.sub(r"[^a-z0-9]+", "-", subject.lower()) + "-"))
    out = {}
    for ts, subject, norm in reversed(commits):  # oldest first, so the first merge names it
        hits = {s for s, (claimed, _) in info.items() if ts >= claimed - 60 and f"-{s}-" in norm}
        # A merged part (packets-heic-convert) also contains its item's slug (packets-heic);
        # credit only the longest claimed slug it names.
        for s in hits:
            if s not in out and not any(o != s and f"-{s}-" in f"-{o}-" for o in hits):
                out[s] = subject
    return out


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


def sibling_claims(app: str, num: int | None, slug: str, info: dict[str, tuple[int, str]],
                   now: float, stale_s: float,
                   merged: dict[str, str] | None = None) -> list[tuple[str, tuple[int, str]]]:
    """Fresh, unmerged claims on the same Next item number under another slug, newest first."""
    if num is None:
        return []
    lead = f"claim {app} #{num} "
    out = [(s, (ts, m)) for s, (ts, m) in info.items()
           if s != slug and s not in (merged or {}) and m.startswith(lead) and ts and now - ts < stale_s]
    return sorted(out, key=lambda x: -x[1][0])


def age(ts: int, now: float) -> str:
    mins = int((now - ts) / 60) if ts else -1
    return "age unknown" if mins < 0 else (f"{mins} min ago" if mins < 120 else f"{mins // 60} h ago")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("app", help="app directory under apps/, e.g. payapps")
    ap.add_argument("--repo", default=None, help="clone holding apps/<app> (default: this repo; "
                    "the private clone for grants)")
    ap.add_argument("--claim", type=int, metavar="N", help="claim Next item N (as listed)")
    ap.add_argument("--slug", help="claim under this slug instead (one part of an item, or an "
                                   "app whose ROADMAP has no Next list); works without --claim")
    ap.add_argument("--note", default="", help="what exactly this run builds")
    ap.add_argument("--release", metavar="SLUG", help="delete your own claim on SLUG")
    ap.add_argument("--stale-hours", type=float, default=6.0)
    a = ap.parse_args(argv)
    a.repo = a.repo or default_repo(a.app)

    roadmap = Path(a.repo) / "apps" / a.app / "ROADMAP.md"
    if not (Path(a.repo) / ".git").exists():
        hint = ("clone private-monorepo first (.github/prompts/cloud-session.md)"
                if a.app in PRIVATE_APPS else "pass --repo <this repo's clone>")
        print(f"no git clone at {a.repo}: {hint}")
        return 2
    # An app with no ROADMAP.md (seller-books, grants, cmmc on 2026-11-25..26) still takes
    # --slug claims; three runs pushed claim branches by hand because this used to exit 2.
    items = next_items(roadmap.read_text(encoding="utf-8")) if roadmap.is_file() else []
    if not roadmap.is_file() and a.claim is not None:
        print(f"no {roadmap}, so no numbered items: claim with --slug <short-name> --note ...")
        return 2
    tag = run_tag()
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
    merged = merged_claims(a.repo, info)

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
            if slug in merged:
                print(f"DONE: {slug} already merged ({merged[slug][:100]}). Pick another item, "
                      f"or claim a new part with --slug.")
                return 4
            if is_mine(msg, tag):
                print(f"YOURS: {slug} was claimed by this session {age(ts, now)}; nothing to do.")
                return 0
            if ts and now - ts < stale_s:
                print(f"TAKEN: {slug} claimed {age(ts, now)}: {RUN.sub('', msg).rstrip()}\nPick another item.")
                return 4
            gen = claims[slug][0] + 1
        msg = f"claim {a.app} #{a.claim or '-'} {slug}" + (f" [{a.note}]" if a.note else "") + f": {title}"
        if tag:
            msg += f" {{run {tag}}}"
        ref = ref_name(a.app, slug, gen)
        if not push_claim(a.repo, ref, msg):
            print(f"TAKEN: another run pushed {ref} first (or the push failed). Pick another item.")
            return 4
        print(f"CLAIMED {ref.removeprefix('refs/heads/')}. Name the slug in your PR title; "
              f"`--release {slug}` if you drop it.")
        # Different part slugs of one item never collide on the branch name, so two runs can
        # claim the same work under two names (2026-11-25: inbound-rfq-email-notify and
        # inbound-rfq-email-part-2-notify, minutes apart; the second was built and discarded).
        siblings = sibling_claims(a.app, a.claim, slug, info, now, stale_s, merged)
        if siblings:
            print(f"ALSO CLAIMED on item {a.claim} (fresh, other slugs). If one covers what you "
                  f"are building, `--release {slug}` and pick another:")
            for s, (ts, m) in siblings:
                print(f"  - {s} ({age(ts, now)}): {m[:140]}")
        return 0

    head = "ROADMAP Next" if roadmap.is_file() else "has no ROADMAP.md"
    print(f"{a.app} {head} ({len(items)} items; claims older than {a.stale_hours:g} h are stale):")
    seen = set()
    if not items:
        print("  (no `## Next` list: claim what you build with --slug <short-name> --note ...)")
    for i, text in items:
        slug = slugify(text)
        mark = "free"
        if slug in claims:
            seen.add(slug)
            ts, msg = info.get(slug, (0, ""))
            if slug in merged:
                mark = "MERGED"
            else:
                mark = ("STALE " if ts and now - ts >= stale_s else "CLAIMED ") + age(ts, now)
                mark += " (yours)" if is_mine(msg, tag) else ""
        elif any(c.startswith(slug + "-") and c not in merged for c in claims):
            mark = "a part is claimed: see below"
        print(f"{i:>3}. [{mark}] {slug}: {text[:90]}")
    others = sorted(set(claims) - seen)
    if others:
        print("Other claims on this app (parts of items, or items already done):")
        for slug in others:
            ts, msg = info.get(slug, (0, ""))
            stale = "MERGED " if slug in merged else ("STALE " if ts and now - ts >= stale_s else "")
            mine = " (yours)" if is_mine(msg, tag) else ""
            print(f"  - {stale}{slug}{mine} ({age(ts, now)}): {RUN.sub('', msg)[:110].rstrip()}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:  # `| head`
        sys.exit(0)
