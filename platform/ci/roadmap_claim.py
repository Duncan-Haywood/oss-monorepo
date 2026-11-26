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
    python3 platform/ci/roadmap_claim.py --bets                # every bet's app: where to start

--repo defaults to /home/user/private-monorepo. A claim older than --stale-hours (6) is
shown as stale, and --claim on it takes a fresh generation (`<slug>--2`), since the run
that made it has ended. A claim whose slug a later commit subject on origin/main names
(the PR title, punctuation ignored) is shown as MERGED and is no sibling. A claim records a hash of the session id, so re-running --claim on
your own claim prints YOURS (exit 0), not TAKEN. An app with no ROADMAP.md, or work not on its Next list, takes --slug alone (`--claim 0 --slug X` means the same). A free item whose text says it waits ("if people ask", "once real companies are counted", "once ... reachable", "the owner runs", "if those ever exist")
is listed as gated with the phrase quoted (an item that mixes asks is gated only when every
open ask waits; the listing names the open one), and the listing ends with the free, ungated item numbers. A --slug whose
words match a fresh rival claim's (pages-shop-time-zone vs page-dates-shop-time-zone) is
refused as NEAR (exit 4) unless --distinct; claims are read again after the push, so a near rival
that landed first in the same seconds releases yours (exit 4) and a same-item part shows as ALSO CLAIMED. Merged and stale claims not under an item are
summed up in one line each (--all lists them with notes). A refused claim push says TAKEN
(a rival holds the branch, exit 4) or PUSH FAILED (no one does; retry, exit 2). Exit codes: 0 ok, 2 usage or git error, 4 the item is already
claimed (pick another). When no bet has a free, ungated item, --bets lists each bet's
`**Growth path:**` topics from bets.md with the live and merged claims on each, and names
the least-crowded bet's first topic with no live claim. Both picks (the free item and the
untouched topic) rotate per session among the first three, so parallel runs spread out.
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
DEFAULT_REPO = "/home/user/private-monorepo"
BETS_MD = Path(__file__).resolve().parents[2] / "portfolio" / "monetization" / "bets.md"
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


SPREAD = 3  # how many of the top free choices a run's pick is spread over


def spread(options: list, tag: str | None, width: int = SPREAD) -> list:
    """The first `width` options rotated by this session's tag, then the rest in order.

    "Start here" named the same first item to every run, so runs started minutes apart
    built the same slice: four records (2026-11-26) lost a claim race by 0 to 60 s
    (einvoice #5 by ~10 s, payapps item 3, two job-costing part 3 slices), one asking for
    "a jittered or per-run ordering". A stable per-session rotation keeps a re-run's pick
    the same and keeps the pick among the top few, so ranking still matters.
    """
    head, rest = options[:width], options[width:]
    if not tag or len(head) < 2:
        return list(options)
    k = int(tag, 16) % len(head)
    return head[k:] + head[:k] + rest


def is_mine(msg: str, tag: str | None) -> bool:
    m = RUN.search(msg)
    return bool(tag and m and m.group(1) == tag)


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
    inside = found = False
    for line in roadmap.splitlines():
        if line.startswith("## "):
            if inside:
                break
            inside = line[3:].strip().lower().startswith("next")
            found = found or inside
            continue
        if not inside:
            continue
        m = re.match(r"^(?:[-*]|(\d+)\.)\s+(.*)", line)
        if m:
            items.append((int(m.group(1)) if m.group(1) else len(items) + 1, m.group(2).strip()))
        elif items and line.startswith((" ", "\t")) and line.strip():
            items[-1] = (items[-1][0], items[-1][1] + " " + line.strip())
    return items if found else inline_next(roadmap)


# wall-framing-takeoff (bet #6) keeps its open work as "Next here: ..." sentences inside its
# milestone list and has no `## Next` heading, so this tool listed 0 items and two runs on
# 2026-11-26 read the bet as exhausted. With no heading, those sentences are the items.
_INLINE = re.compile(r"\bNext here:\s*(.+?)(?:[.;](?=\s+[A-Z(*`])|[.;]?\s*$|\n\s*\n|\n\s*(?:[-*]|\d+\.)\s)",
                     re.S)


def inline_next(roadmap: str) -> list[tuple[int, str]]:
    """(number, text) of each "Next here: ..." sentence, for a ROADMAP with no `## Next` list."""
    return [(i, re.sub(r"\s+", " ", m.group(1)).strip().rstrip(";,."))
            for i, m in enumerate(_INLINE.finditer(roadmap), 1)]


# Items whose own text says they wait on something a session cannot supply. Twenty-odd run
# records (2026-11-25..26) found bet #1's [free] items were "if people ask", "once an official
# copy is reachable" or owner steps, and spent about ten minutes per run re-deriving that before
# dropping a bet. Twenty more (2026-11-26) found the first phrase list too narrow: "once real
# companies are counted", "if customers bill through them", "whatever the first shops ask",
# "once a source is in hand", "the owner runs the workflow once", "if those ever exist".
# Phrases are matched in the item's text only; a miss just leaves it [free]. Bare "when" is not
# a condition word here: done-history text uses it descriptively ("when a company tracks ...").
_WHO = (r"(?:people|shops?|customers?|users?|GCs?|PMs?|admins?|companies|contractors?|subs?|"
        r"buyers?|sellers?|firms?|clients?|estimators?|someone|anyone|demand|usage|traffic)")
GATES = (
    ("waits on demand", re.compile(
        r"\b(?:if|once|when|until)\s+(?:a |an |the |any |more )?(?:people|shops?|customers?|users?|"
        r"contractors?|subs?|buyers?|sellers?|firms?|clients?|someone|anyone|demand)\s+"
        r"(?:asks?|requests?|wants?|needs?|shows?)\b|\bif asked\b|\bon request\b|"
        r"\bonce (?:usage|traffic)\b|\bonce [^.;()]{0,25}\bmeasured\b|"
        r"\b(?:if|once|until)\s+(?:[\w'-]+\s+){0,3}?" + _WHO + r"\b|"
        r"\bwhatever\b[^.;()]{0,30}\b(?:asks?|wants?|needs?)\b", re.I)),
    ("waits on a source", re.compile(
        r"\bonce\b[^.;()]{0,60}\b(?:reachable|published|available|in hand|is live|goes live|"
        r"answers|(?:is|can be) read|has run)\b|\b403\b|\bwhen\b[^.;]{0,60}\bchanges?\b|\bno public (?:spec|format|columns?|schema|docs?)\b", re.I)),
    ("owner step", re.compile(
        r"\bowner[- ](?:only|steps?|actions?)\b|\bneeds the owner\b|"
        r"\b(?:once|until|after|when)\s+the owner\b|\bthe owner (?:runs|onboards|sets|adds)\b|"
        r"\bonboard(?:s|ing)? the sender domain\b|(?:^|[.;(]\s*)owner:|"
        r"\b[A-Z][A-Z_]*_(?:TOKEN|SECRET|API_KEY)\b", re.I)),
    # Work only a person can honestly do: an agent's "native-speaker read" would be fabricated
    # (nine run records, 2026-11-26, on einvoice-preflight's Polish KSeF item).
    ("waits on a person", re.compile(
        r"\bnative[- ](?:\w+[- ])?(?:speakers?|reviewers?|readers?)\b|"
        r"(?<!no )\bhuman (?:reviewers?|translators?|read(?:er)?s?|review)\b|"
        r"(?<!no )\b(?:lawyer|attorney|accountant|CPA)(?:'s)? (?:review|read|sign-off)\b", re.I)),
    ("waits on evidence", re.compile(
        r"\bonly if\b[^.;()]{0,60}\b(?:a market|worth)\b|"
        r"\bif\b[^.;()]{0,60}?\b(?:ever|turns? up|shows? up|proves?|turns? out)\b|"
        r"\bif (?:the )?(?:counts?|numbers|data)\b", re.I)),
)


_DONE = re.compile(r"\bdone(?: \d{4}-\d\d-\d\d)?\b", re.I)
# A clause that reports state rather than asks for work: "X is done", "the host is named",
# "the container stays the alternative".
_DONE_CLAUSE = re.compile(r"\b(?:is|are|was|were) (?:now )?(?:done|filled in|in place|named|recorded)\b|"
                          r"^\W*done\b|\b(?:stays|remains)\b|\bsays so\b", re.I)
_NEXT = re.compile(r"\bnext\b\s*[:,]", re.I)


def _split(text: str) -> list[str]:
    """Clauses at bracket depth 0, cut at ';' and at '. ' before a capital or a bracket."""
    out, buf, depth = [], [], 0
    for i, ch in enumerate(text):
        depth += ch in "([" and 1 or (ch in ")]" and depth > 0 and -1 or 0)
        rest = text[i + 1:i + 3]
        # "Miss. Code Ann." and "Code Civ. Proc." are abbreviations, not sentence ends.
        abbrev = re.search(r"(?:^|\W)[A-Z][a-z]{0,3}$", text[:i])
        if depth == 0 and (ch == ";" or (ch == "." and not abbrev and re.match(r"\s[A-Z(`*]", rest))):
            out.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
    return [c.strip() for c in out + ["".join(buf)] if c.strip()]


def _parens(clause: str) -> list[tuple[int, int]]:
    """(start, end) of each depth-0 bracket group in a clause."""
    spans, depth, start = [], 0, 0
    for i, ch in enumerate(clause):
        if ch in "([":
            start = i if depth == 0 else start
            depth += 1
        elif ch in ")]" and depth:
            depth -= 1
            if depth == 0:
                spans.append((start, i + 1))
    return spans


def open_asks(text: str) -> list[str]:
    """The parts of a Next item still to build: the history ("part 2 done ...") taken out.

    ROADMAP items mix what shipped with several open asks, each with its own condition. Text
    after the last "Next:" is the open part when there is one; bracketed notes that say "done"
    are dropped (a note that starts with "done" marks its clause done), keeping any "next, ..."
    inside them; a clause that says "is done" goes; and a clause with "done <date>" keeps only
    what follows it. Fragments under five words (a bare heading) go when anything else is left.
    """
    nexts = [m.end() for m in _NEXT.finditer(text)]
    text = text[nexts[-1]:] if nexts and not any(a < nexts[-1] < b for a, b in _parens(text)) else text
    asks: list[str] = []
    for clause in _split(text):
        kept, last, whole_done = [], 0, False
        for a, b in _parens(clause):
            inner = clause[a + 1:b - 1]
            if _DONE.search(inner):
                kept.append(clause[last:a])
                last = b
                # "(done ...)" up front, or a done note that ends the clause, closes the clause.
                whole_done |= bool(re.match(r"\W*done\b", inner, re.I)) or not clause[b:].strip(" .,")
                n = [m.end() for m in _NEXT.finditer(inner)] or [m.end() for m in
                                                                re.finditer(r"\bnext\b,?", inner, re.I)]
                if n:
                    asks.extend(open_asks(inner[n[-1]:]) or [inner[n[-1]:].strip()])
        clause = " ".join("".join(kept + [clause[last:]]).split())
        if whole_done or _DONE_CLAUSE.search(clause):
            continue
        dones = list(_DONE.finditer(clause))
        if dones:
            clause = clause[dones[-1].end():].strip(" :,.")
        if clause:
            asks.append(clause)
    long = [a for a in asks if len(a.split()) >= 5]
    return long or asks


def gate_match(text: str) -> tuple[str, str] | None:
    """(why, the phrase that says so) for an item whose every open ask waits, or None.

    Items mix done history with several open asks, each with its own condition (open_asks).
    One ask free leaves the item free: ten records (2026-11-26) found items gated by a tail
    clause alone ("the manual as a PDF if shops ask") or freed by history text.
    """
    gates = ask_gates(text)
    return None if any(hit is None for _, hit in gates) else gates[0][1]


def _match(text: str) -> tuple[str, str] | None:
    """(why, the phrase that says so) for the first gate phrase in one ask, or None.

    The phrase is shown in the listing so a run can judge the gate without opening the
    ROADMAP: three records (2026-11-26) found only a tail clause gated ("PDF if shops ask").
    """
    for label, rx in GATES:
        m = rx.search(text)
        if m:
            end = re.search(r"[.;()]", text[m.end():])
            phrase = text[m.start():m.end() + (end.start() if end else 40)].strip(" ,:")
            return label, phrase[:60]
    return None


def ask_gates(text: str) -> list[tuple[str, tuple[str, str] | None]]:
    """(ask, (why, phrase) or None) for each open ask; a "then ..." ask waits on the one before."""
    out: list[tuple[str, tuple[str, str] | None]] = []
    for ask in open_asks(text) or [text]:
        hit = _match(ask)
        if hit is None and out and re.match(r"\W*then\b", ask, re.I):
            hit = out[-1][1]
        out.append((ask, hit))
    return out


def gate(text: str) -> str | None:
    """Why an item waits ("waits on demand", "waits on a source", "owner step",
    "waits on a person", "waits on evidence"), or None."""
    hit = gate_match(text)
    return hit[0] if hit else None


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
    global LAST_PUSH_ERR
    LAST_PUSH_ERR = r.stderr.strip()
    return r.returncode == 0


LAST_PUSH_ERR = ""


def lost_or_failed(repo: str, app: str, slug: str, ref: str, tag: str | None, now: float) -> int:
    """After a refused claim push, say whether a rival holds the ref or the push itself failed.

    Three run records (2026-11-26) got "TAKEN ... (or the push failed)" and had to ls-remote
    and read the claim commit by hand to tell a lost race from a proxy disconnect.
    """
    ls = git(repo, "ls-remote", "origin", ref)
    sha = ls.stdout.split()[0] if ls.returncode == 0 and ls.stdout.strip() else ""
    if not sha:
        err = LAST_PUSH_ERR.splitlines()[-1] if LAST_PUSH_ERR else "no error text"
        print(f"PUSH FAILED: {ref} does not exist on origin, so no run holds it; the push itself "
              f"failed ({err[:200]}). Retry the same command.")
        return 2
    ts, msg = claim_info(repo, app, {slug: (0, sha)}).get(slug, (0, ""))
    if is_mine(msg, tag):
        print(f"YOURS: {slug} was claimed by this session {age(ts, now)}; nothing to do.")
        return 0
    print(f"TAKEN: another run pushed {ref} {age(ts, now)}: {RUN.sub('', msg).rstrip()}\n"
          f"Pick another item.")
    return 4


def refresh(repo: str, app: str) -> tuple[dict[str, tuple[int, str]], dict[str, tuple[int, str]]] | None:
    """(claims, info) read from origin again, or None if ls-remote fails."""
    ls = git(repo, "ls-remote", "origin", f"refs/heads/{PREFIX}{app}/*")
    if ls.returncode != 0:
        return None
    claims = parse_claims(ls.stdout, app)
    return claims, claim_info(repo, app, claims)


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


FILLER = {"part", "a", "an", "the", "and", "of", "to", "for", "on", "in", "with"}


def slug_words(slug: str) -> set[str]:
    """A slug's content words: no "part", numbers or filler, plurals folded (pages -> page)."""
    out = set()
    for w in slug.split("-"):
        if w and not w.isdigit() and w not in FILLER:
            out.add(w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w)
    return out


def near_claims(slug: str, info: dict[str, tuple[int, str]], now: float, stale_s: float,
                merged: dict[str, str], tag: str | None) -> list[tuple[str, tuple[int, str]]]:
    """Fresh, unmerged rival claims whose slug names the same work in other words.

    Slugs are free text, so a branch-name collision misses the same part named twice
    (2026-11-26: page-dates-shop-time-zone vs pages-shop-time-zone, a minute apart; both
    runs built it). Same content words, or at least 3/4 of them shared, counts as near.
    """
    mine = slug_words(slug)
    out = []
    for s, (ts, m) in info.items():
        if s == slug or s in merged or not ts or now - ts >= stale_s or is_mine(m, tag):
            continue
        theirs = slug_words(GEN.sub(r"\g<base>", s))
        if len(mine) < 2 or len(theirs) < 2:
            continue
        if mine == theirs or len(mine & theirs) / len(mine | theirs) >= 0.75:
            out.append((s, (ts, m)))
    return sorted(out, key=lambda x: -x[1][0])


def age(ts: int, now: float) -> str:
    mins = int((now - ts) / 60) if ts else -1
    return "age unknown" if mins < 0 else (f"{mins} min ago" if mins < 120 else f"{mins // 60} h ago")


def item_marks(app: str, items: list[tuple[int, str]], claims: dict[str, tuple[int, str]],
               info: dict[str, tuple[int, str]], merged: dict[str, str], now: float, stale_s: float,
               tag: str | None) -> tuple[list[tuple[int, str, str, str, list]], list[int]]:
    """([(number, slug, text, mark, part claims)], free-and-ungated numbers) for a Next list."""
    rows, open_now = [], []
    for i, text in items:
        slug = slugify(text)
        mark = "free"
        # Part claims (--claim N --slug X) rarely start with the item's slug, so match them by
        # the item number their message records. Two runs (2026-11-26) saw item 11 listed as
        # [free] beside a fresh part claim and claimed the same scope under a second slug.
        parts = [] if slug in merged else sibling_claims(app, i, slug, info, now, stale_s, merged)
        if slug in claims:
            ts, msg = info.get(slug, (0, ""))
            if slug in merged:
                mark = "MERGED"
            else:
                mark = ("STALE " if ts and now - ts >= stale_s else "CLAIMED ") + age(ts, now)
                mark += " (yours)" if is_mine(msg, tag) else ""
        elif parts:
            mark = f"{len(parts)} part(s) claimed: read the notes below before claiming another"
        elif any(c.startswith(slug + "-") and c not in merged for c in claims):
            mark = "a part is claimed: see below"
        hit = gate_match(text)
        if mark == "free":
            if hit:
                mark = f'free, {hit[0]}: "{hit[1]}"'
            else:
                open_now.append(i)
        rows.append((i, slug, text, mark, parts))
    return rows, open_now


def bet_apps(bets_md: str) -> list[tuple[int, str, str]]:
    """(rank, bet name, app dir) from bets.md's ranking table; the app is the last cell's path."""
    out = []
    for line in bets_md.splitlines():
        m = re.match(r"^\|\s*(\d+)\s*\|\s*\*\*(.+?)\*\*", line)
        where = re.findall(r"`([^`]+)`", line.rsplit("|", 2)[-2]) if m and line.count("|") > 3 else []
        if m and where:
            out.append((int(m.group(1)), m.group(2), where[-1].rstrip("/").rsplit("/", 1)[-1]))
    return out


def growth_paths(bets_md: str) -> dict[int, list[str]]:
    """{rank: [topic, ...]} from each `### N.` bet section's `**Growth path:**` bullet.

    "Open a new item from the bet's growth path" pointed at bets.md, where only bet #1 had
    one (inside its Wedge line), so runs read ROADMAPs by hand to invent an item and three
    picked the same payapps idea within 15 minutes (six friction reports, 2026-11-26).
    """
    out: dict[int, list[str]] = {}
    rank, buf = None, None
    for line in bets_md.splitlines() + [""]:
        head = re.match(r"^###\s+(\d+)\.", line)
        if buf is not None and (not line.startswith("  ") or head):
            text = re.sub(r"\([^)]*\)", "", " ".join(buf))
            topics = [t.strip(" .") for t in re.split(r"[;,]|\band\b", text)]
            out[rank] = [t for t in topics if t]
            buf = None
        if head:
            rank = int(head.group(1))
        m = re.match(r"^- \*\*Growth path:\*\*\s*(.*)", line)
        if m and rank is not None:
            buf = [m.group(1)]
        elif buf is not None:
            buf.append(line.strip())
    return out


def bet_wedges(bets_md: str) -> dict[int, str]:
    """{rank: the bet's "**Wedge:**" bullet, one line} from bets.md's evidence sections.

    The wedge names what the product grows into ("growing into job costing, RFIs and
    estimating"), the place a run opens a new item when every Next item waits. Six records
    (2026-11-26) hit "no free, ungated item" and read bets.md by hand to find it.
    """
    out: dict[int, str] = {}
    rank, buf = None, None
    for line in bets_md.splitlines() + [""]:
        head = re.match(r"^#{2,4}\s+(\d+)\.\s", line)
        if buf is not None and (not line.strip() or line.lstrip().startswith(("- ", "#"))):
            out[rank] = " ".join(" ".join(buf).split())
            buf = None
        if head:
            rank = int(head.group(1))
        elif line.startswith("#"):
            rank = None
        m = re.match(r"^\s*-\s+\*\*Wedge:\*\*\s*(.*)$", line)
        if m and rank is not None and rank not in out:
            buf = [m.group(1)]
        elif buf is not None and line.strip():
            buf.append(line.strip())
    return out


def topic_words(text: str) -> set[str]:
    """Content words of a growth topic or a claim slug, with -ing folded (costing -> cost)."""
    words = slug_words("-".join(re.findall(r"[a-z0-9]+", text.lower())))
    return {w[:-3] if len(w) > 5 and w.endswith("ing") else w for w in words}


def topic_claims(topic: str, info: dict[str, tuple[int, str]], merged: dict[str, str], now: float,
                 stale_s: float) -> tuple[list[str], list[str]]:
    """(live, merged) claim slugs sharing the topic's words (all of them, at most two needed)."""
    want = topic_words(topic)
    live, done = [], []
    for s, (ts, _) in info.items():
        if not want or len(want & topic_words(GEN.sub(r"\g<base>", s))) < min(len(want), 2):
            continue
        if s in merged:
            done.append(s)
        elif ts and now - ts < stale_s:
            live.append(s)
    return sorted(live), sorted(done)


def growth_topics(rank: int, app: str, topics: list[str], claims: tuple[dict, dict] | None,
                  now: float, stale_s: float, tag: str | None = None) -> None:
    """Print a bet's growth topics with the claims already on each, and the first untouched one.

    Picking the bet was not enough: inside it runs still invented the same item (three payapps
    runs within 15 minutes, 2026-11-26), so say which topic nobody holds yet.
    """
    if not topics:
        print(f"  (bets.md has no **Growth path:** line for bet #{rank}: add one in your PR)")
        return
    info, merged = claims or ({}, {})
    untouched, cells = [], []
    for t in topics:
        live, done = topic_claims(t, info, merged, now, stale_s)
        note = (f"{len(live)} live: {', '.join(live[:2])}" if live else "no live claim")
        note += f"; {len(done)} merged" if done else ""
        cells.append(f"{t} ({note})")
        if not live:
            untouched.append(t)
    pick = (spread(untouched, tag) or [None])[0]
    print("  Growth path (bets.md), claims whose slug names each topic: " + "; ".join(cells))
    if pick:
        slug = "-".join(sorted(topic_words(pick), key=pick.lower().find))[:40] or "item"
        print(f"  Untouched topic: '{pick}': `roadmap_claim.py {app} --slug {slug}-<part> --note ...`")
    else:
        print(f"  Every topic has a live claim: take a part none names (`roadmap_claim.py {app} --all`).")


def bets_overview(repo: str, bets_md: Path, stale_s: float, tag: str | None) -> int:
    """One line per bet: free ungated items and live claims, then the first bet with work free.

    Six run records (2026-11-25..26) took "the top bet" into payapps while it held 20 to 30
    live claims and no free, ungated item, then read bet #2's and #3's ROADMAPs by hand to
    find work. This reads them all in one call, in bets.md's order.
    """
    text = bets_md.read_text(encoding="utf-8") if bets_md.is_file() else ""
    bets = bet_apps(text)
    paths = growth_paths(text)
    growth: dict[str, tuple[dict, dict]] = {}
    if not bets:
        print(f"no ranking rows with an app path in {bets_md}")
        return 2
    ls = git(repo, "ls-remote", "origin", f"refs/heads/{PREFIX}*")
    if ls.returncode != 0:
        print(f"git ls-remote failed: {ls.stderr.strip()}")
        return 2
    now = time.time()
    start = None
    present: list[tuple[int, int, str]] = []  # (live claims, rank, app) for apps in this clone
    print(f"Bets in bets.md order (claims older than {stale_s / 3600:g} h are stale):")
    for rank, name, app in bets:
        roadmap = Path(repo) / "apps" / app / "ROADMAP.md"
        if not (Path(repo) / "apps" / app).is_dir():
            print(f"{rank:>3}. {app}: not in this clone ({name})")
            continue
        claims = parse_claims(ls.stdout, app)
        info = claim_info(repo, app, claims)
        merged = merged_claims(repo, info)
        live = sum(1 for s, (ts, _) in info.items() if s not in merged and ts and now - ts < stale_s)
        present.append((live, rank, app))
        if not roadmap.is_file():
            print(f"{rank:>3}. {app}: no ROADMAP.md, {live} live claim(s); claim with --slug ({name})")
            growth[app] = (info, merged)
            continue
        items = next_items(roadmap.read_text(encoding="utf-8"))
        _, open_now = item_marks(app, items, claims, info, merged, now, stale_s, tag)
        free = ", ".join(f"#{n}" for n in open_now) or "none"
        print(f"{rank:>3}. {app}: {len(items)} Next, free and not gated: {free}; "
              f"{live} live claim(s) ({name})")
        if open_now and start is None:
            start = (rank, app, open_now)
        growth[app] = (info, merged)
    if start:
        rank, app, nums = start
        order = spread(nums, tag)
        alt = f"; if it is taken, #{', #'.join(map(str, order[1:SPREAD]))}" if len(order) > 1 else ""
        print(f"Start here: bet #{rank} {app}, item #{order[0]} "
              f"(`roadmap_claim.py {app}` for the list, then `--claim {order[0]}`{alt}). "
              f"The pick rotates per session among the first {SPREAD} free items, so parallel runs spread out.")
    elif present:
        # Three runs opened new payapps items within 15 minutes (2026-11-26) while other bets
        # sat with no live claims: send the next run to the least-crowded bet, with its wedge.
        live, rank, app = min(present)
        wedge = bet_wedges(text).get(rank)
        print(f"Start here: no bet has a free, ungated item. Fewest live claims: bet #{rank} {app} "
              f"({live}). Open a new item from its wedge with `roadmap_claim.py {app} --slug "
              f"<short-name> --note ...` (check its ROADMAP's Done list first).")
        print(f"  Wedge (bets.md): {wedge}" if wedge else
              f"  (bets.md has no **Wedge:** line for bet #{rank}: read its evidence section)")
        growth_topics(rank, app, paths.get(rank, []), growth.get(app), now, stale_s, tag)
    else:
        print("Start here: no ranked bet's app is in this clone.")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("app", nargs="?", help="app directory under apps/, e.g. payapps")
    ap.add_argument("--repo", default=DEFAULT_REPO)
    ap.add_argument("--claim", type=int, metavar="N", help="claim Next item N (as listed)")
    ap.add_argument("--slug", help="claim under this slug instead (one part of an item, or an "
                                   "app whose ROADMAP has no Next list); works without --claim")
    ap.add_argument("--note", default="", help="what exactly this run builds")
    ap.add_argument("--distinct", action="store_true",
                    help="claim although a fresh claim's slug reads as the same work (NEAR)")
    ap.add_argument("--release", metavar="SLUG", help="delete your own claim on SLUG")
    ap.add_argument("--stale-hours", type=float, default=6.0)
    ap.add_argument("--all", action="store_true",
                    help="list merged and stale claims one per line, with their notes")
    ap.add_argument("--bets", action="store_true",
                    help="list every ranked bet's app with its free, ungated items and live claims")
    ap.add_argument("--bets-md", type=Path, default=BETS_MD, help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    if not a.bets and not a.app:
        ap.error("name an app, or pass --bets")

    if not (Path(a.repo) / ".git").exists():
        print(f"no git clone at {a.repo}: clone private-monorepo first (.github/prompts/cloud-session.md)")
        return 2
    if a.bets:
        return bets_overview(a.repo, a.bets_md, a.stale_hours * 3600, run_tag())
    roadmap = Path(a.repo) / "apps" / a.app / "ROADMAP.md"
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

    if a.claim == 0 and a.slug:
        # Three runs on 2026-11-26 wrote `--claim 0 --slug X` for a new item; it means --slug alone.
        a.claim = None
    if a.claim is not None or a.slug:
        by_num = dict(items)
        if a.claim is not None and a.claim not in by_num:
            print(f"item {a.claim} is not in this Next list ({sorted(by_num)}); "
                  f"for work not on the list, pass --slug <name> without --claim")
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
        near = [] if a.distinct else near_claims(slug, info, now, stale_s, merged, tag)
        if near:
            print(f"NEAR: {slug} reads as the same work as a fresh claim; not claimed:")
            for s, (ts, m) in near:
                print(f"  - {s} ({age(ts, now)}): {RUN.sub('', m)[:140].rstrip()}")
            print("Pick another item, or re-run with --distinct if the note shows different work.")
            return 4
        msg = f"claim {a.app} #{a.claim or '-'} {slug}" + (f" [{a.note}]" if a.note else "") + f": {title}"
        if tag:
            msg += f" {{run {tag}}}"
        ref = ref_name(a.app, slug, gen)
        if not push_claim(a.repo, ref, msg):
            return lost_or_failed(a.repo, a.app, slug, ref, tag, now)
        print(f"CLAIMED {ref.removeprefix('refs/heads/')}. Name the slug in your PR title; "
              f"`--release {slug}` if you drop it.")
        hit = gate_match(by_num.get(a.claim, "")) if a.claim is not None else None
        if hit:
            print(f"NOTE: item {a.claim}'s text reads as gated ({hit[0]}: \"{hit[1]}\"); build it "
                  f"only if your part is not the gated one or the condition now holds, else `--release {slug}` and pick another.")
        # Re-read the claims now that ours is on origin: the lists above were read before the
        # push, so a rival pushed in the same seconds was invisible to both runs (2026-11-26:
        # payapps #12 submittals-part-3-spec-register and -register-import, 1 s apart; both
        # built the same import and one PR was reworked).
        fresh = refresh(a.repo, a.app)
        if fresh is not None:
            claims, info = fresh
            merged = merged_claims(a.repo, info)
            mine_ts = info.get(slug, (int(now), ""))[0]
            mine_sha = claims.get(slug, (0, ""))[1]
            first = [] if a.distinct else [
                (s, v) for s, v in near_claims(slug, info, now, stale_s, merged, tag)
                if (v[0], claims[s][1]) < (mine_ts, mine_sha)]
            if first:
                print(f"NEAR (after the push): a rival claimed the same work first; not keeping {slug}:")
                for s, (ts, m) in first:
                    print(f"  - {s} ({age(ts, now)}): {RUN.sub('', m)[:140].rstrip()}")
                r = git(a.repo, "push", "-q", f"--force-with-lease={ref}:{mine_sha}", "origin", f":{ref}")
                print("Released your claim. Pick another item, or re-run with --distinct if the note "
                      "shows different work." if r.returncode == 0 else
                      f"Release failed ({r.stderr.strip()[:160]}): run `--release {slug}`, then pick another item.")
                return 4
        # Different part slugs of one item never collide on the branch name, so two runs can
        # claim the same work under two names (2026-11-25: inbound-rfq-email-notify and
        # inbound-rfq-email-part-2-notify, minutes apart; the second was built and discarded).
        siblings = sibling_claims(a.app, a.claim, slug, info, now, stale_s, merged)
        if siblings:
            print(f"ALSO CLAIMED on item {a.claim} (fresh, other slugs). If one covers what you "
                  f"are building, `--release {slug}` and pick another:")
            for s, (ts, m) in siblings:
                print(f"  - {s} ({age(ts, now)}): {RUN.sub('', m)[:140].rstrip()}")
        return 0

    head = "ROADMAP Next" if roadmap.is_file() else "has no ROADMAP.md"
    print(f"{a.app} {head} ({len(items)} items; claims older than {a.stale_hours:g} h are stale):")
    seen = set()
    if not items:
        print("  (no `## Next` list: claim what you build with --slug <short-name> --note ...)")
    rows, open_now = item_marks(a.app, items, claims, info, merged, now, stale_s, tag)
    for i, slug, text, mark, parts in rows:
        if slug in claims:
            seen.add(slug)
        print(f"{i:>3}. [{mark}] {slug}: {text[:90]}")
        gates = ask_gates(text)
        free_asks = [ask for ask, hit in gates if hit is None]
        if mark.startswith("free") and len(gates) > 1:
            # The item's heading is history; say which ask is the open one (or that none is).
            print(f"       open ask: {free_asks[0][:140]}" if free_asks else
                  f"       all {len(gates)} open asks wait ({', '.join(sorted({h[0] for _, h in gates}))})")
        for s, (ts, m) in parts:
            seen.add(s)
            mine = " (yours)" if is_mine(m, tag) else ""
            print(f"       part {s}{mine} ({age(ts, now)}): {RUN.sub('', m)[:140].rstrip()}")
    if items:
        # The one line twenty runs asked for: is there anything here to build right now?
        print(f"Free and not gated: {', '.join(f'#{n}' for n in open_now)}" if open_now else
              "Free and not gated: none. Take the next bet (`--bets` names the least-crowded one "
              "and its untouched growth topics), or open a new item from the bet's **Growth path:** "
              "line in portfolio/monetization/bets.md with --slug <short-name> --note ...")
    others = sorted(set(claims) - seen)
    # Merged and stale claims are history, one line each kind: payapps listed ~40 of them before
    # anything live, and two runs (2026-11-26) grep -v'd them away. --all lists them in full.
    done = [s for s in others if s in merged]
    stale = [s for s in others if s not in merged and info.get(s, (0, ""))[0]
             and now - info[s][0] >= stale_s]
    live = [s for s in others if s not in done and s not in stale]
    if live or (a.all and others):
        print("Other claims on this app (parts of items, or items already done):")
        for slug in (others if a.all else live):
            ts, msg = info.get(slug, (0, ""))
            kind = "MERGED " if slug in done else ("STALE " if slug in stale else "")
            mine = " (yours)" if is_mine(msg, tag) else ""
            print(f"  - {kind}{slug}{mine} ({age(ts, now)}): {RUN.sub('', msg)[:110].rstrip()}")
    if not a.all:
        for label, group in (("Merged", done), ("Stale", stale)):
            if group:
                print(f"{label} claims ({len(group)}; --all for notes): {', '.join(group)}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:  # `| head`
        sys.exit(0)
