"""Value rubric, two independent scoring passes, agreement and cost per class.

Pure standard library. Value is an ordinal score 1 to 3:
Pass A (names and order only): 3 = a milestone PROJECTS.md lists; 2 = not listed, and the
first of its name family or in no family; 1 = a later member of a family (a follow-up).
Pass B (README text only): 3 = unlike every earlier README in its track; 1 = close to one.
"""
import math
import random
import re
from collections import Counter, defaultdict

STOP = set("the a an of and or to in on for with is are was were be by as at it its this that from "
           "we our not no can how what which when than then into over under per vs".split())


def tokens(text):
    return [w for w in re.findall(r"[a-z][a-z0-9]{2,}", text.lower()) if w not in STOP]


def tfidf(docs):
    """docs: {key: text}. Returns {key: {term: weight}} with smoothed idf, L2-normalised."""
    toks = {k: Counter(tokens(t)) for k, t in docs.items()}
    df = Counter(w for c in toks.values() for w in c)
    n = len(docs)
    out = {}
    for k, c in toks.items():
        v = {w: (1 + math.log(f)) * (math.log((1 + n) / (1 + df[w])) + 1) for w, f in c.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        out[k] = {w: x / norm for w, x in v.items()}
    return out


def cosine(a, b):
    if len(a) > len(b):
        a, b = b, a
    return sum(x * b.get(w, 0.0) for w, x in a.items())


def milestone_slugs(projects_md):
    """Backticked slugs that PROJECTS.md lists as numbered milestones ('1. `slug`: ...')."""
    return set(re.findall(r"^\s*\d+\.\s+`([a-z0-9-]+)`", projects_md, flags=re.M))


def pass_structure(order, milestones, families):
    """Pass A. Uses only names and order: milestone list, family membership, first-added date.

    order: slugs sorted by first-added time. families: {slug: family key or None}.
    """
    seen_family = set()
    score = {}
    for s in order:
        fam = families.get(s)
        if s in milestones:
            score[s] = 3
        elif fam is None or fam not in seen_family:
            score[s] = 2
        else:
            score[s] = 1
        if fam is not None:
            seen_family.add(fam)
    return score


def pass_text(order, vectors, track_of, hi=0.50, lo=0.30):
    """Pass B. Uses only README text: nearest earlier README in the same track.

    similarity >= hi -> 1, between -> 2, < lo (or no earlier README in the track) -> 3.
    """
    score, sim = {}, {}
    earlier = defaultdict(list)
    for s in order:
        t = track_of(s)
        best = max((cosine(vectors[s], vectors[o]) for o in earlier[t]), default=0.0)
        sim[s] = best
        score[s] = 1 if best >= hi else (3 if best < lo else 2)
        earlier[t].append(s)
    return score, sim


def confusion(a, b, cats=(1, 2, 3)):
    m = {(i, j): 0 for i in cats for j in cats}
    for k in a:
        if k in b:
            m[(a[k], b[k])] += 1
    return m


def kappa(a, b, weights="linear", cats=(1, 2, 3)):
    """Cohen's kappa (1960) on the keys both raters scored; linear or unweighted."""
    m = confusion(a, b, cats)
    n = sum(m.values())
    if n == 0:
        return float("nan")
    k = len(cats)

    def w(i, j):
        if weights == "none":
            return 0.0 if i == j else 1.0
        return abs(i - j) / (k - 1)

    row = {i: sum(m[(i, j)] for j in cats) for i in cats}
    col = {j: sum(m[(i, j)] for i in cats) for j in cats}
    obs = sum(w(i, j) * m[(i, j)] for i in cats for j in cats) / n
    exp = sum(w(i, j) * row[i] * col[j] for i in cats for j in cats) / (n * n)
    return 1.0 if exp == 0 and obs == 0 else (1 - obs / exp if exp else float("nan"))


def bootstrap_kappa(a, b, reps=2000, seed=0, weights="linear"):
    keys = [k for k in a if k in b]
    rng = random.Random(seed)
    ks = []
    for _ in range(reps):
        s = [rng.choice(keys) for _ in keys]
        va = {i: a[x] for i, x in enumerate(s)}
        vb = {i: b[x] for i, x in enumerate(s)}
        v = kappa(va, vb, weights)
        if not math.isnan(v):
            ks.append(v)
    ks.sort()
    if not ks:
        return (float("nan"), float("nan"))
    return ks[int(0.025 * len(ks))], ks[min(len(ks) - 1, int(0.975 * len(ks)))]


def class_cost(scores, cost):
    """Per value class: count, median and mean cost (lines added). Returns {cls: dict}."""
    by = defaultdict(list)
    for s, v in scores.items():
        if s in cost:
            by[v].append(cost[s])
    out = {}
    for v, xs in sorted(by.items()):
        xs = sorted(xs)
        out[v] = {"n": len(xs), "median": xs[len(xs) // 2], "mean": sum(xs) / len(xs)}
    return out


def value_per_kloc(scores, cost):
    """Mean value points per 1000 lines added, per class-pooled total (ratio of sums)."""
    tot_v = sum(v for s, v in scores.items() if s in cost)
    tot_c = sum(cost[s] for s in scores if s in cost)
    return 1000.0 * tot_v / tot_c if tot_c else float("nan")


def bootstrap_ratio(items, reps=2000, seed=0):
    """items: list of (value, cost). 95% interval of 1000*sum(v)/sum(c) over resamples."""
    rng = random.Random(seed)
    rs = []
    for _ in range(reps):
        s = [rng.choice(items) for _ in items]
        c = sum(x[1] for x in s)
        if c:
            rs.append(1000.0 * sum(x[0] for x in s) / c)
    rs.sort()
    return rs[int(0.025 * len(rs))], rs[min(len(rs) - 1, int(0.975 * len(rs)))]
