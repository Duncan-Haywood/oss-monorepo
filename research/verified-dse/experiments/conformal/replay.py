"""Conformal shortlists over the cheap rungs, replayed on the cached rung_bias table (milestone 4, H4).
Runs no flow. Writes results.txt and summary.json. Usage: python3 replay.py [table.jsonl prefix]   (default: rung_bias table, results here)"""
import json
import math
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402

REPS = 200
ALPHAS = (0.1, 0.2)
EPS = (0.0, 0.02)
RUNGS = ("r1", "r2")
PILOTS = (10, 16)
TABLE = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parent / "rung_bias" / "results.jsonl"
PREFIX = sys.argv[2] if len(sys.argv) > 2 else ""   # e.g. "../large/conformal_" -> large/conformal_results.txt
OUT = HERE
rows = [json.loads(l) for l in TABLE.read_text().splitlines()]
groups = defaultdict(list)
for r in rows:
    if r["status"] == "ok":
        groups[(r["design"], r["tag"])].append(flow.scores(r))
KEYS = sorted(groups)


def rank_of_good(sc, g, eps, rng):
    """1-based position (random tie-break) at which ordering by rung g first hits a point within eps of the minimum."""
    ref = [s["r4"] for s in sc]
    lim = min(ref) * (1 + eps)
    order = sorted(range(len(sc)), key=lambda i: (sc[i][g], rng.random()))
    for pos, i in enumerate(order, 1):
        if ref[i] <= lim:
            return pos


def qhat(scores, alpha):
    k = math.ceil((len(scores) + 1) * (1 - alpha))
    s = sorted(scores)
    return s[k - 1] if k <= len(s) else float("inf")


def protocol_a(g, alpha, eps, seed=1):
    rng = random.Random(seed)
    cover, size = [], []
    for held in KEYS:
        cal = [rank_of_good(groups[k], g, eps, rng) / len(groups[k]) for k in KEYS if k[0] != held[0]]
        q = min(1.0, qhat(cal, alpha))
        n = len(groups[held])
        keep = min(n, math.ceil(q * n))
        hits = [rank_of_good(groups[held], g, eps, rng) <= keep for _ in range(REPS)]
        cover.append(statistics.mean(hits))
        size.append(keep / n)
    return cover, size


def ols(x, y):
    mx, my = statistics.mean(x), statistics.mean(y)
    sxx = sum((a - mx) ** 2 for a in x)
    b = sum((a - mx) * (c - my) for a, c in zip(x, y)) / sxx if sxx > 1e-12 else 0.0
    return my - b * mx, b


def protocol_b(g, alpha, eps, m, seed=2):
    rng = random.Random(seed)
    cover, cost, rand_cover = [], [], []
    for key in KEYS:
        sc = groups[key]
        n = len(sc)
        x = [math.log(s[g]) for s in sc]
        y = [math.log(s["r4"]) for s in sc]
        lim = min(s["r4"] for s in sc) * (1 + eps)
        hit_n, cost_n, rhit_n = 0, 0, 0
        for _ in range(REPS):
            pil = rng.sample(range(n), m)
            a, b = ols([x[i] for i in pil], [y[i] for i in pil])
            res = []
            for i in pil:
                rest = [j for j in pil if j != i]
                a_i, b_i = ols([x[j] for j in rest], [y[j] for j in rest])
                res.append(a_i + b_i * x[i] - y[i])  # over-prediction
            q = qhat(res, alpha)
            best = min(y[i] for i in pil)
            short = [j for j in range(n) if j not in pil and a + b * x[j] - q <= best]
            final = min([sc[i]["r4"] for i in pil] + [sc[j]["r4"] for j in short])
            hit_n += final <= lim
            cost_n += m + len(short)
            rnd = rng.sample(range(n), min(n, m + len(short)))
            rhit_n += min(sc[i]["r4"] for i in rnd) <= lim
        cover.append(hit_n / REPS)
        cost.append(cost_n / REPS / n)
        rand_cover.append(rhit_n / REPS)
    return cover, cost, rand_cover


def boot(v, reps=2000, seed=0):
    rng = random.Random(seed)
    ms = sorted(statistics.mean(rng.choices(v, k=len(v))) for _ in range(reps))
    return ms[int(0.025 * reps)], ms[int(0.975 * reps) - 1]


out, summ = [f"groups: {len(KEYS)} (design x clock); points per group {min(len(v) for v in groups.values())} to {max(len(v) for v in groups.values())}; {REPS} tie-breaks or pilots per group\n"], {"A": [], "B": []}
out.append("## A. leave-one-design-out rank shortlist\nrung | alpha | eps | nominal | coverage [95% boot over groups] | mean shortlist fraction")
for g in RUNGS:
    for al in ALPHAS:
        for e in EPS:
            c, s = protocol_a(g, al, e)
            lo, hi = boot(c)
            out.append(f"{g} | {al} | {e} | {1 - al:.2f} | {statistics.mean(c):.3f} [{lo:.3f}, {hi:.3f}] | {statistics.mean(s):.2f}")
            summ["A"].append(dict(rung=g, alpha=al, eps=e, cov=statistics.mean(c), lo=lo, hi=hi, size=statistics.mean(s)))
out.append("\n## B. per-design pilot, conformal lower-bound shortlist\nrung | m | alpha | eps | nominal | coverage [95% boot over groups] | routed evals / pool | random search, same evals")
for g in RUNGS:
    for m in PILOTS:
        for al in ALPHAS:
            for e in EPS:
                c, k, rc = protocol_b(g, al, e, m)
                lo, hi = boot(c)
                out.append(f"{g} | {m} | {al} | {e} | {1 - al:.2f} | {statistics.mean(c):.3f} [{lo:.3f}, {hi:.3f}] | {statistics.mean(k):.2f} | {statistics.mean(rc):.3f}")
                summ["B"].append(dict(rung=g, m=m, alpha=al, eps=e, cov=statistics.mean(c), lo=lo, hi=hi, cost=statistics.mean(k), random=statistics.mean(rc)))
(OUT / f"{PREFIX}results.txt").write_text("\n".join(out) + "\n")
(OUT / f"{PREFIX}summary.json").write_text(json.dumps(summ, indent=1))
print("\n".join(out))
