"""Backfill agent-loop output from git history (commits.jsonl, see experiments/extract.py).

Pure standard library. Functions take parsed commit records (dicts), so tests use
small hand-made lists and the experiment feeds the real extract.
"""
import json, math, re
from collections import Counter, defaultdict
from datetime import datetime, timedelta

TRACKS = ("selfrep", "ambient", "chip", "robofab", "simdesign", "garment", "eda", "accel",
          "osrobot", "swe", "mimic", "free")
# Subject words that mark a commit as correcting earlier work (a lower bound on defects:
# only those found and fixed in-tree, and only if the message says so).
FIX_RE = re.compile(r"\b(fix|fixes|fixed|correct|corrects|corrected|correction|revert|reverts|"
                    r"repair|wrong|bug|mismatch|stale|erratum)\b", re.I)
FMT = "%Y-%m-%dT%H:%M:%SZ"


def load(path):
    with open(path) as f:
        return [json.loads(l) for l in f if l.strip()]


def when(c):
    return datetime.strptime(c["time"], FMT)


def track_of(slug):
    head = slug.split("-", 1)[0]
    return head if head in TRACKS else "other"


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def rate(k, n):
    lo, hi = wilson(k, n)
    return {"k": k, "n": n, "rate": k / n if n else None, "lo": lo, "hi": hi}


def projects(commits):
    """slug -> {created, last, commits:[...], tests, deleted}. 'created' is the first commit
    that adds files under the slug (falls back to the first commit that touches it)."""
    out = {}
    for c in sorted(commits, key=lambda c: c["time"]):
        for slug, d in c["slugs"].items():
            p = out.setdefault(slug, {"created": None, "first_touch": c, "last": c, "commits": [],
                                      "tests": 0, "removed": False})
            if p["created"] is None and d.get("A", 0) > 0:
                p["created"] = c
            p["commits"].append(c)
            p["last"] = c
            p["tests"] += d.get("tests_A", 0)
            if d.get("D", 0) and not (d.get("A", 0) or d.get("M", 0)):
                p["removed"] = True
    for p in out.values():
        if p["created"] is None:
            p["created"] = p["first_touch"]
    return out


def per_day(projs):
    """Date -> number of projects created that day, by UTC date."""
    days = Counter(when(p["created"]).date().isoformat() for p in projs.values())
    return dict(sorted(days.items()))


def per_track(projs):
    t = defaultdict(lambda: {"projects": 0, "commits": 0, "tests_added": 0})
    for slug, p in projs.items():
        r = t[track_of(slug)]
        r["projects"] += 1
        r["commits"] += len(p["commits"])
        r["tests_added"] += p["tests"]
    return dict(sorted(t.items(), key=lambda kv: -kv[1]["projects"]))


def followup_families(slugs, min_size=3, min_stem=4):
    """Same grouping rule as swe-ledger: shortest name stem (>= min_stem chars after the track
    prefix) shared by >= min_size slugs of one track; untracked slugs group by last word."""
    keyed = defaultdict(list)
    for s in slugs:
        keyed[track_of(s)].append(s)
    fams = {}
    for t, ss in keyed.items():
        if t == "other":
            g = defaultdict(set)
            for s in ss:
                if "-" in s:
                    g["*-" + s.rsplit("-", 1)[1]].add(s)
            fams.update({k: v for k, v in g.items() if len(v) >= min_size})
            continue
        rests = {s: s.split("-", 1)[1] if "-" in s else "" for s in ss}
        for rest in rests.values():
            for k in range(min_stem, len(rest) + 1):
                stem = rest[:k]
                m = {x for x, r in rests.items() if r.startswith(stem)}
                if len(m) >= min_size:
                    fams.setdefault(t + "-" + stem.rstrip("-"), set()).update(m)
                    break
    return fams


def later_touches(projs, within_days=14):
    """For each project: commits after the creating commit, within `within_days` of it, split into
    corrections (subject matches FIX_RE) and others. Projects created less than `within_days`
    before the end of the history are flagged `censored` (window not fully observed)."""
    end = max(when(c) for p in projs.values() for c in p["commits"])
    rows = {}
    for slug, p in projs.items():
        t0 = when(p["created"])
        win = t0 + timedelta(days=within_days)
        later = [c for c in p["commits"] if c["hash"] != p["created"]["hash"] and t0 < when(c) <= win]
        fixes = [c for c in later if FIX_RE.search(c["subject"])]
        rows[slug] = {"later": len(later), "fixes": len(fixes), "censored": win > end,
                      "removed": p["removed"]}
    return rows


def correction_rate(rows, observed_only=True):
    pool = [r for r in rows.values() if not (observed_only and r["censored"])]
    return rate(sum(r["fixes"] > 0 for r in pool), len(pool))


def never_touched_again(rows):
    return rate(sum(r["later"] == 0 for r in rows.values()), len(rows))


def family_members(fams):
    return {s for f in fams.values() for s in f}


def log_gap(projs, logged_slugs):
    """Projects in git and not in the run log, and the reverse."""
    g, l = set(projs), set(logged_slugs)
    return {"in_git_not_log": sorted(g - l), "in_log_not_git": sorted(l - g), "both": len(g & l)}


def creation_gaps(projs):
    """Minutes between consecutive project creations (sorted by time)."""
    ts = sorted(when(p["created"]) for p in projs.values())
    return [(b - a).total_seconds() / 60 for a, b in zip(ts, ts[1:])]


def median(xs):
    xs = sorted(xs)
    n = len(xs)
    if not n:
        return None
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2


def same_stem_close(projs, fams, minutes=180):
    """Pairs of projects in one family created within `minutes` of each other: runs that began
    close together and chose neighbouring names. A rough face of the duplicate-claim problem."""
    pairs = []
    for stem, members in fams.items():
        ms = sorted(members & set(projs), key=lambda s: when(projs[s]["created"]))
        for a, b in zip(ms, ms[1:]):
            dt = (when(projs[b]["created"]) - when(projs[a]["created"])).total_seconds() / 60
            if dt <= minutes:
                pairs.append((stem, a, b, round(dt)))
    return pairs
