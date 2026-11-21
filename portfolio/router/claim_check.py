#!/usr/bin/env python3
"""Who holds a claim when two sessions open a PR for the same item?

    python3 portfolio/router/claim_check.py <keyword> [--item "<words>"] [--pr N] [--hours 24]
    python3 portfolio/router/claim_check.py --paths-only [--paths FILE ...]

Run it right after you open your draft PR (title naming the slug, milestone
or target), and again before you merge. Open that PR before exploring, not
after the first real commit: an empty commit is enough (`claim_recipe`). It lists the open same-repo PRs whose
title names <keyword> as a whole word, opened in the last --hours, and says
who keeps the item: **the PR opened first**. Ties on the second go to the
lower number.

  exit 0  HOLD   your PR is the oldest fresh claim (or no one else has one)
  exit 1  YIELD  an older open PR claims it: pick a different item, or help
                 land that PR instead of building a second copy
  exit 1  LANDED a PR merged since your clone of main names your --item:
                 read it before building (it may already be on main)
  exit 2  the open PRs could not be read; search titles by hand
  exit 3  UNCLAIMED  no one else claims it, but you have no PR yet either:
                 open your draft PR, then run this again (a check before your
                 PR exists cannot see a session that opens one seconds later)
  exit 4  OVERLAP  no title claims it, but an older open PR (or one merged
                 since your clone) changes at least half of your files: read
                 its diff first (see "paths" below)

Why: the open-PR checks in allocate.py and research/_shared/pick_track.py run
before a session has opened its PR, so two sessions that start in the same
minute both read "clear". Opening a draft PR early helps, but on 2026-11-12
#15145 and #15146 opened claim drafts for the same changepoint-detector item
58 seconds apart, both doing what the guidance asked, and neither had a rule
for who steps back. Eighty-one run records on 2026-11-10 to 12 report this
race in doc_friction (ventures, redteam, perf, process alike). A fixed rule
read from live data settles it in one command: the later session learns
within minutes, not after an hour of duplicate work.

--item names the piece of the flagship you are taking ("deferred revenue
module"). A large flagship (300 hours of work, many open items) has room for two
sessions at once, but a slug-only check made every later one yield the whole
product: four runs on 2026-11-13 and 14 overrode YIELD because the older PR
worked another item (#15407, #15484, #15717, #15977; their run records'
`deviations`), and all eight PRs merged (#15411, #15486, #15718, #15979 beside
them). #15717 was a bare "claim (WIP)" later retitled to another product, so
that yield guarded nothing. With --item, an older
PR whose title names a *different* item is listed as SHARE, not a blocker; one
that shares a word of your item, or names no item at all (a bare "x: claim"),
still blocks. A word in three or more recent titles on the slug (open or
closed; "reader" on photo-editing) is the flagship's vocabulary: sharing only
that one word is SHARE, while two shared words still block. Without --item
the check is slug-only, as before. The words
are matched literally, so read the SHARE titles: a judgment the tool cannot
make (overlapping files under different names) is yours.

A PR that already **merged** is no open claim, yet three of four misses
reported on 2026-11-16 were exactly that: #16639 opened two minutes after
#16627 merged the same chant-forge fix, #16579 one minute after #16574 merged
the edge-time fit, and the session behind #16550 built what #16548 then
landed (their run records' doc_friction). A session whose clone predates the
merge reads the item as open on main and free in the PR list. So the check
also reads PRs merged after your clone's origin/main commit (merges your clone
already holds are on main for you to read, so they are skipped; a busy
flagship lands a dozen slices a day and a 24 h list was noise): with --item,
one whose title shares two words of your item (one, if the item has one) is
LANDED (exit 1: read its diff, then take the next item or say why yours
differs); the rest are listed so you can read their titles.

A check run before your own PR exists used to print HOLD, exit 0. On
2026-11-18 #17257 and #17258 opened claim PRs for the same photo-editing cull
item 8 seconds apart (claim commits 09:57:53 and 09:57:40); #17258's run record
says "claim HOLD", which run after its PR opened would have been YIELD (#17257
was older and its title shared "cull" and "pans"). Both built a fix and the
later one had to be reconciled by hand. So with no PR of yours it says
UNCLAIMED (exit 3): the item is free, not yours.

Your PR is found by --pr, or else by the current git branch (the PR whose
head is this branch). Fork PRs never count as claims and are never yours.
Reads the public REST pulls list (unauthenticated works from cloud sessions;
the search index can lag a new PR by minutes, the pulls list does not).

Titles name what a PR is *for*, not what it touches, so two sessions that
fix the same thing under different words both read HOLD. On 2026-11-19 a
process run untracked three ventures' `*.egg-info/` (a run record had named
the symptom under run_workflow_locally.py) while #17578, opened 11 minutes
earlier as "ci: untrack generated *.egg-info", made the same 18-file change;
the report's words (the tool name, PKG-INFO) were not in that title. So the check
also compares **paths**: the files your branch changes (commits since
origin/main plus uncommitted ones, or `--paths`) against the files of fresh
open PRs and of PRs merged since your clone (`path_overlap`). Shared hubs
nearly every PR edits (run records, posts, reports, flagships.yaml, the
ledger), and any path three or more of those PRs touch, are left out. An
older open PR, or a merged one, that shares at least half of your remaining
files makes the verdict OVERLAP (exit 4) when the title check found no
claim: read its diff before building a second copy. Smaller overlaps are
listed. A keyword is optional (`claim_check.py --paths-only`).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

REPO = "duncan-haywood/oss-monorepo"
REPO_ROOT = Path(__file__).resolve().parents[2]
FRESH_HOURS = 24
# Files nearly every PR edits: sharing one says nothing about sharing work.
SHARED_HUBS = re.compile(r"^(?:prompts/runs/|docs/(?:posts|reports|history)/|portfolio/flagships\.yaml$"
                         r"|portfolio/ledger/|portfolio/usage/|IDEAS\.md$)")
HOT_PRS = 3      # a path this many candidate PRs touch is a hub too
PATH_LIMIT = 30  # candidate PRs whose file lists are read, newest first


def _when(stamp: str) -> datetime:
    return datetime.fromisoformat(stamp.replace("Z", "+00:00"))


def names(title: str, keyword: str) -> bool:
    """True when `title` names `keyword` as a whole word (hyphens count as word
    characters, so `sales-agent` does not match `sales-agent-eval`)."""
    pat = rf"(?<![\w-]){re.escape(keyword.lower())}(?![\w-])"
    return re.search(pat, title.lower()) is not None


# Words a claim title carries whatever its item is; they never tell two items apart.
GENERIC = frozenset("""claim claims wip draft post posts and the for with from into onto
    over under via its new add adds fix fixes item items slice next more first round page
    pages critique process ventures venture research polish perf quality redteam creative
    explore review""".split())


def item_words(text: str, keyword: str = "") -> set[str]:
    """The words of `text` that could name an item: three letters or more, not
    generic claim vocabulary, and not part of the slug itself."""
    slug = set(re.findall(r"[a-z0-9]+", keyword.lower()))
    return {w for w in re.findall(r"[a-z0-9]+", text.lower())
            if len(w) >= 3 and w not in GENERIC and w not in slug}


# A word in this many other titles naming the slug is the flagship's own
# vocabulary ("reader" on photo-editing: the MRW, NRW, 3FR, IIQ, FFF and DCR
# readers all merged 2026-11-17/18), so it alone does not make two items one.
VOCAB_MIN = 3


def flagship_vocab(titles: list[str], keyword: str, n: int = VOCAB_MIN) -> set[str]:
    """Item words found in at least `n` of `titles` (each counted once)."""
    counts: dict[str, int] = {}
    for t in titles:
        for w in item_words(t, keyword):
            counts[w] = counts.get(w, 0) + 1
    return {w for w, c in counts.items() if c >= n}


def overlap(title: str, keyword: str, item: str, vocab: frozenset = frozenset()) -> str:
    """How an older PR's title relates to my item: "same", "bare" (it names no
    item, so it claims the whole slug) or "other".

    "same" takes one shared word that is not flagship vocabulary (`vocab`),
    or two shared words of any kind. One shared vocabulary word is "other":
    on 2026-11-18 #17403 (Hasselblad 3FR reader) made the session taking
    photo-editing's IIQ S reader YIELD; it overrode, and both merged (#17420,
    its run record's deviations). Two shared words still block, which keeps
    #17257/#17258 ("cull ... pans", both flagship words that day) a clash.

    Unless every shared word is vocabulary and their title also names a word
    of its own (not vocabulary, not in my item): then it is a specific other
    slice of the same domain, "other". On 2026-11-21 #18036 ("UDFs as Project
    XML Number/Date fields") made the session on "Project XML to P6 XER" YIELD
    on "project xml" alone; it overrode and both merged (#18037). #17257's
    "cull 10% pans" names nothing beyond the vocabulary, so it still blocks."""
    theirs = item_words(title, keyword)
    if not theirs:
        return "bare"
    mine = item_words(item, keyword)
    shared = theirs & mine
    if shared - vocab:
        return "same"
    if len(shared) >= 2 and not (theirs - mine - vocab):
        return "same"
    return "other"


def shares_item(title: str, keyword: str, item: str) -> bool:
    """A merged title names my item: it shares two of the item's words, or its
    only word. One shared word was too loose for merges: a flagship's slices
    reuse its vocabulary ("fit", "drop") all day."""
    mine = item_words(item, keyword)
    return bool(mine) and len(item_words(title, keyword) & mine) >= min(2, len(mine))


def main_commit_time() -> Optional[datetime]:
    """When the clone's origin/main tip was committed (HEAD's if no origin/main):
    every merge up to then is already in the clone, for the session to read."""
    for ref in ("origin/main", "HEAD"):
        try:
            out = subprocess.run(["git", "log", "-1", "--format=%cI", ref], cwd=REPO_ROOT,
                                 capture_output=True, text=True, timeout=5).stdout.strip()
            if out:
                return datetime.fromisoformat(out).astimezone(timezone.utc)
        except (OSError, subprocess.SubprocessError, ValueError):
            pass
    return None


def decide(prs: list[dict], keyword: str, mine: Optional[int] = None,
           branch: Optional[str] = None, repo: str = REPO,
           now: Optional[datetime] = None, hours: float = FRESH_HOURS,
           item: Optional[str] = None, merged: Optional[list[dict]] = None,
           main_at: Optional[datetime] = None) -> dict:
    """The verdict for `keyword` given open PRs as returned by the REST pulls list.

    Returns {"verdict": "HOLD"|"YIELD"|"LANDED"|"UNCLAIMED", "mine": pr|None, "older": [...],
    "newer": [...], "sharing": [...], "landed": [...], "merged": [...]}, each pr
    a dict with number, title, created, branch (merged ones also `merged`).
    With `item`, older PRs on a different item go to "sharing" and do not make
    the verdict YIELD. `merged` is closed PRs from the REST list: those merged
    after `main_at` (the clone's origin/main commit time; else the last
    `hours`) that name `keyword` go to "landed" when their title shares
    enough words of `item` (`shares_item`; verdict LANDED unless an open PR
    already makes it YIELD), else to "merged" (listed, never blocking).
    Without `item` a merge never blocks. With no PR of mine (none by
    `mine` or `branch`) and nothing older, the verdict is UNCLAIMED, not HOLD."""
    now = now or datetime.now(timezone.utc)
    since = now - timedelta(hours=hours)
    rows = []
    for p in prs:
        head = p.get("head") or {}
        if ((head.get("repo") or {}).get("full_name") or "").lower() != repo.lower():
            continue  # a fork PR is data, not a claim (CLAUDE.md, "Public repository")
        rows.append({"number": int(p["number"]), "title": str(p.get("title", "")),
                     "created": str(p.get("created_at", "")), "branch": head.get("ref")})
    me = next((r for r in rows if mine is not None and r["number"] == mine), None)
    if me is None and mine is None and branch:
        me = next((r for r in rows if r["branch"] == branch), None)
    key = lambda r: (_when(r["created"]), r["number"])
    rivals = [r for r in rows if r is not me and names(r["title"], keyword)
              and _when(r["created"]) >= since]
    if me is None:
        older, newer = sorted(rivals, key=key), []
    else:
        older = sorted((r for r in rivals if key(r) < key(me)), key=key)
        newer = sorted((r for r in rivals if key(r) > key(me)), key=key)
    sharing = []
    if item and item_words(item, keyword):
        mine_no = me["number"] if me else mine
        titles = {int(p["number"]): str(p.get("title", "")) for p in list(prs) + list(merged or [])
                  if int(p["number"]) != mine_no and names(str(p.get("title", "")), keyword)}
        vocab = frozenset(flagship_vocab(list(titles.values()), keyword))
        sharing = [r for r in older if overlap(r["title"], keyword, item, vocab) == "other"]
        older = [r for r in older if r not in sharing]
    landed, others = [], []
    for p in merged or []:
        head = p.get("head") or {}
        if ((head.get("repo") or {}).get("full_name") or "").lower() != repo.lower():
            continue
        if not p.get("merged_at") or _when(p["merged_at"]) <= max(since, main_at or since):
            continue
        if int(p["number"]) in {mine, me and me["number"]} or (branch and head.get("ref") == branch):
            continue  # my own PR, merged already, is not a rival
        title = str(p.get("title", ""))
        if not names(title, keyword):
            continue
        row = {"number": int(p["number"]), "title": title, "created": str(p.get("created_at", "")),
               "merged": p["merged_at"], "branch": head.get("ref")}
        same = bool(item) and shares_item(title, keyword, item)
        (landed if same else others).append(row)
    newest = lambda r: _when(r["merged"])
    landed.sort(key=newest, reverse=True)
    others.sort(key=newest, reverse=True)
    verdict = "YIELD" if older else ("LANDED" if landed else ("HOLD" if me else "UNCLAIMED"))
    return {"verdict": verdict, "mine": me, "older": older, "newer": newer,
            "sharing": sharing, "landed": landed, "merged": others}


def recently_closed(repo: str = REPO, timeout: int = 15, pages: int = 2) -> Optional[list[dict]]:
    """The most recently updated closed PRs (merged or not), newest first, or None.
    Two pages of 100 cover well over a day at this repository's merge rate."""
    out: list[dict] = []
    try:
        for page in range(1, pages + 1):
            url = (f"https://api.github.com/repos/{repo}/pulls?state=closed&sort=updated"
                   f"&direction=desc&per_page=100&page={page}")
            req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                batch = json.load(r)
            out += batch
            if len(batch) < 100:
                break
    except Exception:
        return None
    return out


def open_prs(repo: str = REPO, timeout: int = 15) -> Optional[list[dict]]:
    """Every open PR from the REST pulls list, or None if it cannot be read."""
    out: list[dict] = []
    try:
        for page in range(1, 6):
            url = f"https://api.github.com/repos/{repo}/pulls?state=open&per_page=100&page={page}"
            req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                batch = json.load(r)
            out += batch
            if len(batch) < 100:
                break
    except Exception:
        return None
    return out


def _git_lines(*args: str) -> list[str]:
    try:
        out = subprocess.run(["git", *args], cwd=REPO_ROOT, capture_output=True,
                             text=True, timeout=20).stdout
    except (OSError, subprocess.SubprocessError):
        return []
    return [l.strip() for l in out.splitlines() if l.strip()]


def my_paths(base: str = "origin/main") -> list[str]:
    """Files this branch changes: its commits not on `base`, plus staged,
    unstaged and untracked (not ignored) files."""
    paths = set(_git_lines("log", "--format=", "--name-only", f"{base}..HEAD"))
    paths |= set(_git_lines("diff", "--name-only", "HEAD"))
    paths |= set(_git_lines("ls-files", "--others", "--exclude-standard"))
    return sorted(paths)


def pr_files(number: int, repo: str = REPO, timeout: int = 15) -> Optional[list[str]]:
    """The paths a PR changes (renames by both names), or None if unreadable."""
    out: list[str] = []
    try:
        for page in range(1, 4):
            url = f"https://api.github.com/repos/{repo}/pulls/{number}/files?per_page=100&page={page}"
            req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                batch = json.load(r)
            for f in batch:
                out += [f["filename"]] + ([f["previous_filename"]] if f.get("previous_filename") else [])
            if len(batch) < 100:
                break
    except Exception:
        return None
    return out


def path_overlap(paths: list[str], prs: list[dict], merged: Optional[list[dict]] = None,
                 mine: Optional[int] = None, branch: Optional[str] = None, repo: str = REPO,
                 now: Optional[datetime] = None, hours: float = FRESH_HOURS,
                 main_at: Optional[datetime] = None, files=None,
                 limit: int = PATH_LIMIT) -> dict:
    """Which fresh open PRs, and PRs merged since `main_at`, change the files in `paths`.

    Returns {"paths": [my files compared], "checked": n, "unreadable": n,
    "hubs": [left out], "rows": [...]}; each row is a PR (number, title,
    created, merged or None, older: opened before mine) with "shared" files,
    most shared first. "strong" marks a row sharing at least half my files."""
    now = now or datetime.now(timezone.utc)
    files = files or pr_files
    since = now - timedelta(hours=hours)
    def same_repo(p):
        return (((p.get("head") or {}).get("repo") or {}).get("full_name") or "").lower() == repo.lower()
    def is_me(p):
        return int(p["number"]) == mine or (bool(branch) and (p.get("head") or {}).get("ref") == branch)
    me = next((p for p in prs if same_repo(p) and is_me(p)), None)
    mine_at = _when(me["created_at"]) if me else None
    cands = [p for p in prs if same_repo(p) and not is_me(p) and _when(str(p.get("created_at"))) >= since]
    cut = max(since, main_at or since)
    cands += [p for p in merged or [] if same_repo(p) and not is_me(p) and p.get("merged_at")
              and _when(p["merged_at"]) > cut]
    cands.sort(key=lambda p: _when(str(p.get("merged_at") or p.get("created_at"))), reverse=True)
    cands = cands[:limit]
    mineset = {x for x in paths if not SHARED_HUBS.match(x)}
    result = {"paths": sorted(mineset), "checked": 0, "unreadable": 0, "hubs": [], "rows": []}
    if not mineset:
        return result
    got = []
    for p in cands:
        fl = files(int(p["number"]))
        if fl is None:
            result["unreadable"] += 1
            continue
        result["checked"] += 1
        got.append((p, set(fl)))
    counts: dict[str, int] = {}
    for _, fl in got:
        for x in fl & mineset:
            counts[x] = counts.get(x, 0) + 1
    hubs = {x for x, n in counts.items() if n >= HOT_PRS}
    mineset -= hubs
    result["hubs"], result["paths"] = sorted(hubs), sorted(mineset)
    for p, fl in got:
        shared = sorted(fl & mineset)
        if not shared:
            continue
        created = str(p.get("created_at", ""))
        result["rows"].append({
            "number": int(p["number"]), "title": str(p.get("title", "")), "created": created,
            "merged": p.get("merged_at"), "shared": shared,
            "older": bool(p.get("merged_at")) or mine_at is None or _when(created) < mine_at,
            "strong": len(shared) * 2 >= len(mineset)})
    result["rows"].sort(key=lambda r: (-len(r["shared"]), r["number"]))
    return result


def path_report(ov: dict, now: datetime) -> list[str]:
    if not ov["paths"]:
        return ["Paths: no files of yours to compare yet (commit, or pass --paths)."]
    lines = [f"Paths: compared your {len(ov['paths'])} file(s) with {ov['checked']} fresh or "
             f"since-clone PR(s)" + (f" ({ov['unreadable']} unreadable)" if ov["unreadable"] else "")
             + (f"; left out {len(ov['hubs'])} hub path(s) other PRs share too" if ov["hubs"] else "") + "."]
    strong = [r for r in ov["rows"] if r["strong"] and r["older"]]
    if strong:
        lines.append("OVERLAP: these PRs change at least half of your files; read their diff before "
                     "building a second copy (merged ones may already be on main):")
    for r in ov["rows"][:8]:
        tag = "OVERLAP" if (r["strong"] and r["older"]) else ("newer" if not r["older"] else "shares")
        sh = ", ".join(r["shared"][:4]) + (f" (+{len(r['shared']) - 4})" if len(r["shared"]) > 4 else "")
        lines.append(f"  [{tag}] {_line(r, now)}  -- {len(r['shared'])} of {len(ov['paths'])}: {sh}")
    return lines


def current_branch() -> Optional[str]:
    try:
        b = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=REPO_ROOT,
                           capture_output=True, text=True, timeout=5).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None
    return b if b and b != "HEAD" else None


def _line(r: dict, now: datetime) -> str:
    stamp = r.get("merged") or r["created"]
    age = (now - _when(stamp)).total_seconds() / 60
    age_s = f"{age:.0f} min" if age < 120 else f"{age / 60:.1f} h"
    verb = "merged" if r.get("merged") else "opened"
    return f"#{r['number']} ({verb} {stamp}, {age_s} ago): {r['title']}"


def claim_recipe(keyword: str, item: Optional[str] = None) -> str:
    """How to open a claim PR before there is anything to commit.

    A PR needs a commit, so sessions explored for 20 to 40 minutes before
    their claim became visible, and two sessions sent to the same flagship
    both built it: four ventures runs on 2026-11-13 alone lost 10 to 40
    minutes each that way (doc_friction on allocate.py: einvoice-preflight,
    chant-forge, league-schedule-generator, quick-pick-survey), and quality
    runs committed placeholder posts to claim a seed. An empty commit is
    enough to open the PR, and the squash merge drops it. It goes on the branch
    you are on: cloud sessions start on a harness-made work branch, and runs that
    chained `git checkout -b` first hit "already exists" (doc_friction
    2026-11-19T09:38, 11:10)."""
    it = item or "<item>"
    return (f"No diff yet? Claim now, on the branch you are on (no `checkout -b`): "
            f"`git commit --allow-empty -m \"{keyword}: {it} (claim)\"`, "
            f"push, and open a draft PR titled '{keyword}: {it}' (name the item, so a second "
            f"session on another item can share the flagship; the squash merge drops the "
            f"empty commit), then `python3 portfolio/router/claim_check.py {keyword} --item \"{it}\"`.")


def free_flagships(prs: list[dict], keyword: str, now: datetime, path: Optional[Path] = None,
                   today=None) -> Optional[list[str]]:
    """The other Deepen flagships no open PR younger than allocate.CLAIM_FRESH_HOURS
    names, in portfolio/flagships.yaml order (the order of allocate.py's table);
    None when `keyword` is not a flagship (or the file cannot be read).

    Why: a YIELD sent the session back to `allocate.py` (one to two minutes with
    its fetch) to find another row, and same-minute collisions are a floor the
    Start-here hash cannot remove: sessions fired on one scheduler tick opened
    their PRs 0 to 18 s apart (#17528/#17529 5 s, #17442 17 s, two at 11:57:38Z
    on 2026-11-19), and with five free rows any two of them share one about a
    fifth of the time. Four live doc_friction reports on allocate.py
    (friction_rank.py --live --ungated, 2026-11-16..19) are this race. This list
    comes from the PRs the check has already read, so the redirect costs nothing."""
    import allocate  # lazy: allocate imports this module
    path = path or allocate.FLAGSHIPS_PATH
    try:
        rows = [e["venture"] for e in allocate._load_yaml(path).get("flagships") or []
                if isinstance(e, dict) and e.get("venture")]
        skip = set(allocate.load_inputs_only(path)) | set(allocate.load_not_before(path, today))
    except (OSError, ValueError, AttributeError):
        return None
    if keyword not in rows:
        return None
    fresh = [(p.get("number"), p.get("title") or "", p.get("created_at") or "") for p in prs
             if allocate._age_hours(p.get("created_at") or "", now) < allocate.CLAIM_FRESH_HOURS]
    claimed = allocate.claims_by_venture(rows, fresh)
    return [v for v in rows if v != keyword and v not in skip and v not in claimed]


def redirect_line(free: list[str], session: Optional[str] = None) -> str:
    """Where a yielding session goes: one of the first START_SPREAD free rows,
    picked by the session id as allocate.start_here picks (so two sessions that
    yield together usually part ways), or the first without an id."""
    import allocate
    if not free:
        return ("Every other Deepen flagship has a PR opened in the last "
                f"{allocate.CLAIM_FRESH_HOURS} h: take another item on this row (rerun with --item), "
                "or `allocate.py` for the least contested row.")
    pool = free[:allocate.START_SPREAD]
    pick = pool[0] if session is None else \
        pool[int(hashlib.sha256(session.encode()).hexdigest(), 16) % len(pool)]
    return (f"Free flagship rows now (no PR opened in the last {allocate.CLAIM_FRESH_HOURS} h): "
            f"{', '.join(free)}. Go to {pick}"
            + (" (picked by this session's id)" if session else "")
            + f": `python3 portfolio/router/allocate.py --venture {pick}`, retitle your draft PR "
            f"to '{pick}: <item>', then `python3 portfolio/router/claim_check.py {pick} --item \"<item>\"`.")


def report(result: dict, keyword: str, now: datetime, hours: float,
           item: Optional[str] = None, redirect: Optional[str] = None) -> list[str]:
    me, older, newer = result["mine"], result["older"], result["newer"]
    sharing = result.get("sharing") or []
    lines = []
    if me is None:
        lines.append(f"Your PR: none found (pass --pr N, or open your draft PR naming '{keyword}' first).")
        lines.append(claim_recipe(keyword, item))
    else:
        lines.append("Your PR: " + _line(me, now))
    if older:
        what = f"'{keyword}' for your item or names no item" if item else f"'{keyword}'"
        lines.append(f"YIELD: an older open PR claims {what} (opened first wins):")
        lines += ["  " + _line(r, now) for r in older]
        if not item:
            lines.append(f"  Working a different item of a large flagship? Rerun with --item \"<your item>\": "
                         f"an older PR on another item then shares instead of blocking.")
        lines.append("Pick a different item, or help land that PR; if you already have work, "
                     "close yours as superseded after `portfolio/ledger/supersede_check.py`.")
        if redirect:
            lines.append(redirect)
    elif result.get("landed"):
        lines.append(f"LANDED: a PR merged since your clone of main names '{keyword}' and shares words "
                     f"of '{item}' (not an open claim, but this may be your item, already on main):")
        lines += ["  " + _line(r, now) for r in result["landed"]]
        lines.append("Read its diff (`git fetch --depth=1 origin main`, then the flagship row): if it "
                     "covers your item, take the next one; if yours is a different slice, go on and "
                     "say why in the run record.")
    elif me is None:
        lines.append(f"UNCLAIMED (free, but not yet yours): no open PR in the last {hours:g} h names "
                     f"'{keyword}'" + (f" for '{item}'" if item else "") + ". Open your draft PR and run "
                     "this again: a session that opens one in the next seconds is invisible now, and "
                     "the PR opened first keeps the item.")
    else:
        lines.append(f"HOLD (the item is yours): no older open PR in the last {hours:g} h names '{keyword}'"
                     + (f" for '{item}'." if item else "."))
    if result.get("merged"):
        lines.append(f"Merged since your clone of main on '{keyword}' (other items; skim the titles):")
        lines += ["  " + _line(r, now) for r in result["merged"][:5]]
    if sharing:
        lines.append(f"SHARE: older PRs on '{keyword}' that name a different item (read the titles; "
                     f"keep out of their files):")
        lines += ["  " + _line(r, now) for r in sharing]
    if newer:
        lines.append("Newer PRs on it (they should yield to yours):")
        lines += ["  " + _line(r, now) for r in newer]
    return lines


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0],
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("keyword", nargs="?", help="slug, milestone or target your PR title names")
    ap.add_argument("--item", help="the flagship item you are taking; older PRs on other items then share")
    ap.add_argument("--pr", type=int, help="your PR number (default: the PR for the current branch)")
    ap.add_argument("--hours", type=float, default=FRESH_HOURS,
                    help=f"only PRs opened this recently count as claims (default {FRESH_HOURS})")
    ap.add_argument("--paths", nargs="+", metavar="PATH",
                    help="files you will change (default: what this branch changes vs origin/main)")
    ap.add_argument("--paths-only", action="store_true", help="skip the title check")
    ap.add_argument("--no-paths", action="store_true", help="skip the path check")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    if not args.keyword and not args.paths_only:
        ap.error("give a keyword, or --paths-only")
    prs = open_prs()
    if prs is None:
        print(f"Could not read open PRs (GitHub API unreachable); search titles for '{args.keyword}' by hand.")
        return 2
    closed = recently_closed()
    now = datetime.now(timezone.utc)
    branch = None if args.pr else current_branch()
    main_at = main_commit_time()
    out: dict = {}
    code = 0
    if not args.paths_only:
        result = decide(prs, args.keyword, mine=args.pr, branch=branch, now=now, hours=args.hours,
                        item=args.item, merged=closed, main_at=main_at)
        out["title"] = result
        code = {"HOLD": 0, "UNCLAIMED": 3}.get(result["verdict"], 1)
    ov = None
    if not args.no_paths:
        paths = args.paths if args.paths is not None else my_paths()
        ov = path_overlap(paths, prs, merged=closed, mine=args.pr, branch=branch, now=now,
                          hours=args.hours, main_at=main_at)
        out["paths"] = ov
        if code in (0, 3) and any(r["strong"] and r["older"] for r in ov["rows"]):
            code = 4
    if args.json:
        print(json.dumps(out, indent=2))
        return code
    if "title" in out:
        redirect = None
        if out["title"]["verdict"] == "YIELD":
            free = free_flagships(prs, args.keyword, now)
            if free is not None:
                import allocate
                redirect = redirect_line(free, allocate.session_id())
        print("\n".join(report(out["title"], args.keyword, now, args.hours, args.item, redirect)))
        if closed is None:
            print("(Recently merged PRs could not be read: check `git log origin/main` for the slug by hand.)")
    if ov is not None:
        print("\n".join(path_report(ov, now)))
    return code


if __name__ == "__main__":
    sys.exit(main())
