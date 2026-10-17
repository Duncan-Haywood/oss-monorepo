"""Pick mix and same-track concurrency of merged research projects (standard library only)."""
import math
import random
from datetime import datetime

TRACKS = ["selfrep", "ambient", "chip", "robofab", "simdesign", "garment", "eda", "accel", "osrobot", "swe", "mimic"]
FIRST_TRACKED = "2026-10-12"  # PROJECTS.md tracks 1-6 set on 2026-10-12, 7-11 on 2026-10-14; no earlier slug uses a prefix


def load(path):
    """Rows {slug, merged, first|None, commits}; times are naive UTC datetimes."""
    rows = []
    with open(path) as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            s, m, fi, n = line.rstrip("\n").split("\t")
            rows.append({"slug": s, "merged": datetime.fromisoformat(m),
                         "first": None if fi == "-" else datetime.fromisoformat(fi), "commits": int(n)})
    return rows


def track(slug):
    """Track prefix of a slug, or None (early projects, free-choice and one-off slugs)."""
    p = slug.split("-")[0]
    return p if p in TRACKS else None


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)


def quantile(xs, q):
    xs = sorted(xs)
    i = q * (len(xs) - 1)
    lo, hi = int(math.floor(i)), int(math.ceil(i))
    return xs[lo] + (xs[hi] - xs[lo]) * (i - lo)


def chi2_stat(counts, probs):
    n = sum(counts)
    return sum((c - n * p) ** 2 / (n * p) for c, p in zip(counts, probs))


def chi2_mc_p(counts, probs, reps=20000, seed=1):
    """Monte Carlo p-value of the chi-square statistic against a multinomial(n, probs)."""
    rng = random.Random(seed)
    n, obs = sum(counts), chi2_stat(counts, probs)
    idx = list(range(len(probs)))
    hit = 0
    for _ in range(reps):
        c = [0] * len(probs)
        for j in rng.choices(idx, weights=probs, k=n):
            c[j] += 1
        hit += chi2_stat(c, probs) >= obs - 1e-12
    return (hit + 1) / (reps + 1)


def spans(rows):
    """Tracked, prefixed projects with a branch: (track, start, end, pr_key). A multi-project PR is one unit."""
    out, seen = [], set()
    for r in rows:
        t = track(r["slug"])
        if t is None or r["first"] is None or r["merged"].date().isoformat() < FIRST_TRACKED:
            continue
        key = (r["merged"], r["first"])
        if key in seen:
            continue
        seen.add(key)
        out.append((t, r["first"], r["merged"], key))
    return out


def overlap_pairs(sp):
    """Index pairs of units whose [start, end] intervals overlap."""
    order = sorted(range(len(sp)), key=lambda i: sp[i][1])
    pairs = []
    for a, i in enumerate(order):
        for j in order[a + 1:]:
            if sp[j][1] > sp[i][2]:
                break
            pairs.append((i, j))
    return pairs


def same_track_share(sp, pairs, labels=None):
    labels = labels or [s[0] for s in sp]
    return sum(labels[i] == labels[j] for i, j in pairs) / len(pairs)


def permutation_p(sp, pairs, reps=20000, seed=2, block=None):
    """P(share >= observed) when track labels are shuffled: keeps the pick mix and the timing, breaks any link.

    block(unit) -> key shuffles labels only within units with the same key (for example the merge day), so a
    mix that drifts over time (new tracks appearing) cannot by itself make concurrent units look alike.
    """
    rng = random.Random(seed)
    labels = [s[0] for s in sp]
    groups = {}
    for i, s in enumerate(sp):
        groups.setdefault(block(s) if block else 0, []).append(i)
    groups = list(groups.values())
    obs = same_track_share(sp, pairs, labels)
    hit = 0
    for _ in range(reps):
        for g in groups:
            vals = [labels[i] for i in g]
            rng.shuffle(vals)
            for i, v in zip(g, vals):
                labels[i] = v
        hit += same_track_share(sp, pairs, labels) >= obs - 1e-12
    return obs, (hit + 1) / (reps + 1)


def expected_same(sp):
    """Chance two independent picks agree under the empirical mix, and under uniform picks."""
    n = len(sp)
    cnt = {}
    for s in sp:
        cnt[s[0]] = cnt.get(s[0], 0) + 1
    p_emp = sum(c * (c - 1) for c in cnt.values()) / (n * (n - 1))
    return p_emp, 1 / len(TRACKS)


def span_minutes(sp):
    return [(s[2] - s[1]).total_seconds() / 60 for s in sp]
