"""Permutation null for the repeat rate of doc_friction complaints. Standard library only.

THEMES and theme_of are copied from research/swe-friction (same keyword rules) so this project is self-contained.
"""
import collections, json, random, re

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
    with open(path) as f:
        return [json.loads(l) for l in f if l.strip()]


def classified(rows):
    """(date, (file, theme)) for entries whose theme is not 'other'."""
    out = []
    for r in rows:
        t = theme_of(r["issue"])
        if t != "other":
            out.append((r["date"], (r["file"], t)))
    return out


def repeats_by_day(items):
    """Per day: (entries whose pair was reported on an EARLIER day, entries). Same-day repeats do not count."""
    by_day = collections.defaultdict(list)
    for d, p in items:
        by_day[d].append(p)
    seen, out = set(), {}
    for d in sorted(by_day):
        out[d] = (sum(1 for p in by_day[d] if p in seen), len(by_day[d]))
        seen.update(by_day[d])
    return out


def total(rep):
    return sum(k for k, _ in rep.values())


def permutation_null(items, n=2000, seed=0):
    """Shuffle which pair falls on which entry slot, keeping each day's count of entries.
    This keeps the multiset of pairs and the per-day sizes, and removes any link between a pair and its days.
    Returns (list of null totals, dict day -> list of null counts)."""
    rng = random.Random(seed)
    days = [d for d, _ in items]
    pairs = [p for _, p in items]
    tot, per = [], collections.defaultdict(list)
    for _ in range(n):
        rng.shuffle(pairs)
        rep = repeats_by_day(list(zip(days, pairs)))
        tot.append(total(rep))
        for d, (k, _) in rep.items():
            per[d].append(k)
    return tot, per


def p_upper(null, obs):
    """One-sided permutation p-value with the +1 correction: P(null >= obs)."""
    return (1 + sum(1 for x in null if x >= obs)) / (1 + len(null))


def quantiles(xs, qs=(0.025, 0.5, 0.975)):
    s = sorted(xs)
    return [s[min(len(s) - 1, int(q * len(s)))] for q in qs]


def p_lower(null, obs):
    """One-sided permutation p-value with the +1 correction: P(null <= obs)."""
    return (1 + sum(1 for x in null if x <= obs)) / (1 + len(null))
