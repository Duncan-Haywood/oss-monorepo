"""Measure the doc_friction field of the run records. Standard library only."""
import collections, glob, json, math, os, re

# First matching theme wins; order matters. Keyword rules, not a classifier: see README limitations.
THEMES = [
    ("shallow-clone", r"shallow|unshallow|unrelated histor"),
    ("missing-tooling", r"pytest|numpy|matplotlib|pyenv|pip install|apt-get|not installed|absent in|\bgh\b|\b403\b|no network"),
    ("timeout", r"timeout|timed out|exceed(s|ed)? the \d+s|too slow|takes (several )?minutes"),
    ("red-on-clean-main", r"clean main|already fail|cannot be green|fails? on main|baseline|red on main"),
    ("stale-or-wrong", r"stale|no longer|does not exist|doesn.t exist|wrong|outdated|already (documents|fixed)|describe fixed|contradict|already fixed|already landed|renamed|moved"),
    ("unclear-or-missing", r"unclear|ambiguous|does not say|doesn.t say|no (formula|guidance|instruction)|not say|missing|not documented|without paths|no pointer|gives no|says nothing|nothing on|no list of|no rule"),
    ("too-long", r"huge|too long|unscannable|hard to (edit|scan|read|review)|single (huge )?line|enormous|one (huge|enormous)|\d{3,} lines"),
    ("no-good-candidate", r"already (deeply )?built|deeply built|already deep|mature|top candidates|too big for one run|finding a gap"),
    ("duplicate-check", r"claim|duplicate|overlap|same minute|three hours"),
]


def theme_of(issue):
    t = issue.lower()
    for name, pat in THEMES:
        if re.search(pat, t):
            return name
    return "other"


def load(path):
    """JSONL rows: date, track, file, issue (one per doc_friction entry)."""
    with open(path) as f:
        return [json.loads(l) for l in f if l.strip()]


def extract(runs_dir):
    """Flatten prompts/runs/*.json to friction rows, one per entry, plus the run count per day and track."""
    rows, runs = [], []
    for p in sorted(glob.glob(os.path.join(runs_dir, "*.json"))):
        m = re.match(r"(\d{4}-\d\d-\d\d)-", os.path.basename(p))
        if not m:
            continue
        r = json.load(open(p))
        runs.append({"date": m.group(1), "track": r.get("track"), "n": len(r.get("doc_friction") or [])})
        for x in r.get("doc_friction") or []:
            rows.append({"date": m.group(1), "track": r.get("track"), "file": x.get("file") or "(none)",
                         "issue": x.get("issue") or ""})
    return rows, runs


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def gini(counts):
    xs = sorted(counts)
    n, s = len(xs), sum(xs)
    if n == 0 or s == 0:
        return 0.0
    return sum((2 * (i + 1) - n - 1) * x for i, x in enumerate(xs)) / (n * s)


def top_share(counts, k):
    xs = sorted(counts, reverse=True)
    return sum(xs[:k]) / sum(xs) if xs else 0.0


def repeat_rate(rows):
    """Share of entries whose (file, theme) pair was already reported on an EARLIER day.
    Same-day repeats are not counted: parallel runs cannot see each other's fixes. Entries
    with theme "other" are left out of both numerator and denominator: a (file, "other") pair
    says only that the file was named before, not that the complaint repeated."""
    seen, by_day = set(), collections.defaultdict(list)
    for r in rows:
        by_day[r["date"]].append(r)
    out = {}
    for d in sorted(by_day):
        day = [r for r in by_day[d] if theme_of(r["issue"]) != "other"]
        out[d] = (sum(1 for r in day if (r["file"], theme_of(r["issue"])) in seen), len(day))
        for r in day:
            seen.add((r["file"], theme_of(r["issue"])))
    return out


def summarise(rows, runs):
    files = collections.Counter(r["file"] for r in rows)
    themes = collections.Counter(theme_of(r["issue"]) for r in rows)
    pair_days = collections.defaultdict(set)
    for r in rows:
        pair_days[(r["file"], theme_of(r["issue"]))].add(r["date"])
    persistent = sorted(((len(v), k) for k, v in pair_days.items() if len(v) >= 3 and k[1] != "other"), reverse=True)
    per_track = collections.defaultdict(lambda: [0, 0, 0])
    for r in runs:
        t = per_track[r["track"]]
        t[0] += 1; t[1] += r["n"]; t[2] += 1 if r["n"] else 0
    return {"entries": len(rows), "runs": len(runs), "runs_with": sum(1 for r in runs if r["n"]),
            "files": files, "themes": themes, "gini_files": gini(list(files.values())),
            "top3": top_share(list(files.values()), 3), "top10": top_share(list(files.values()), 10),
            "repeat": repeat_rate(rows), "persistent": persistent, "per_track": dict(per_track)}
