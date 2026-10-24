"""Cross-check prompts/runs/*.json against git history on main (pure functions; run.py supplies the data)."""
import math
import re

SEP_F, SEP_R = "\x1f", "\x1e"
LOG_FORMAT = "%H%x1f%cs%x1f%s%x1f%b%x1e"
SESSION_RE = re.compile(r"session_[A-Za-z0-9]+")
TRAILER_RE = re.compile(r"^Claude-Session:\s*https://claude\.ai/code/(session_[A-Za-z0-9]+)", re.M)
VERSION_RE = re.compile(r"^Prompt-Version:\s*(\S+)", re.M)
PR_URL_RE = re.compile(r"github\.com/([^/\s]+/[^/\s]+)/pull/(\d+)", re.I)


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def parse_log(text):
    """Split `git log --format=LOG_FORMAT` output into (sha, date, subject, body) tuples."""
    out = []
    for rec in text.split(SEP_R):
        p = rec.strip("\n").split(SEP_F)
        if len(p) == 4:
            out.append(tuple(p))
    return out


def landed_prs(commits):
    """PR numbers that reached main: a squash subject ending '(#N)' or a merge subject 'Merge pull request #N'.
    A '#N' elsewhere in a body is a mention, not a landing, and is ignored."""
    nums = set()
    for _sha, _d, subj, _b in commits:
        m = re.search(r"\(#(\d+)\)\s*$", subj) or re.match(r"Merge pull request #(\d+)", subj)
        if m:
            nums.add(int(m.group(1)))
    return nums


def trailer_sessions(commits):
    """session id -> {'date': first commit date, 'versions': set of Prompt-Version trailers, 'commits': n}."""
    out = {}
    for _sha, d, _s, body in commits:
        versions = VERSION_RE.findall(body)
        for s in set(TRAILER_RE.findall(body)):
            e = out.setdefault(s, {"date": d, "versions": set(), "commits": 0})
            e["date"] = min(e["date"], d)
            e["versions"].update(versions)
            e["commits"] += 1
    return out


def record_session(rec):
    m = SESSION_RE.search(str(rec.get("session") or ""))
    return m.group(0) if m else None


def record_pr(rec, repo="duncan-haywood/oss-monorepo"):
    """PR number if the record names a PR in `repo`; None if it names none; 'other' for another repository."""
    m = PR_URL_RE.search(str(rec.get("pr") or ""))
    if not m:
        return None
    return int(m.group(2)) if m.group(1).lower() == repo else "other"


def claim_check(records, landed):
    """For records naming a PR in this repository: (landed, total) by outcome, plus the unlanded PR numbers."""
    by = {}
    missing = []
    for r in records:
        n = record_pr(r)
        if not isinstance(n, int):
            continue
        k, t = by.get(r.get("outcome"), (0, 0))
        ok = n in landed
        by[r.get("outcome")] = (k + ok, t + 1)
        if not ok:
            missing.append(n)
    return by, sorted(missing)


def window_start(sessions, recorded, min_recorded=20):
    """First date on which at least `min_recorded` landed sessions have a record (the ledger's real start)."""
    per = {}
    for s, e in sessions.items():
        if s in recorded:
            per[e["date"]] = per.get(e["date"], 0) + 1
    days = sorted(d for d, n in per.items() if n >= min_recorded)
    return days[0] if days else None


def coverage(sessions, recorded, since, key):
    """{group: (sessions with a record, sessions)} over landed sessions first seen on or after `since`."""
    out = {}
    for s, e in sessions.items():
        if e["date"] < since:
            continue
        for g in key(e):
            k, n = out.get(g, (0, 0))
            out[g] = (k + (s in recorded), n + 1)
    return out


def track_of(e):
    """Tracks from Prompt-Version trailers ('research/0' -> 'research'); '(version only)' for the early 'Prompt-Version: 0' form, which names no track."""
    return sorted({v.split("/")[0] if "/" in v else "(version only)" for v in e["versions"]}) or ["(no Prompt-Version)"]


def orphan_records(records, sessions, since):
    """Records dated on or after `since` whose session has no Claude-Session trailer on main: {outcome: (orphans, records)}."""
    out = {}
    for r in records:
        if not r.get("date") or r["date"] < since:
            continue
        k, n = out.get(r.get("outcome"), (0, 0))
        out[r.get("outcome")] = (k + (record_session(r) not in sessions), n + 1)
    return out
