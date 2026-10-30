"""Milestone 6y: an always-valid (betting) confidence sequence against plug-in normal and Wilson intervals at a data-dependent
stop, rare GoEmotions categories, human labels only, one pooled corpus. Writes h6y_confseq.txt.

    python3.13 experiments/h6y_confseq.py     # needs numpy; reuses the GoEmotions cache of the h6r..h6x experiments; a few minutes
"""
import math
import random
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[0]))
import group_shift_reddit as R  # noqa: E402
import h6r_rare_pilot as P  # noqa: E402

REPS, SEED = 500, 20261031
START, BATCH, CAP, ALPHA, CLIP, Z = 400, 100, 20000, 0.05, 0.5, 1.959964
GRID = np.arange(0.0, 0.1201, 0.0001)


class Betting:
    """Hedged betting confidence sequence for the mean of a finite 0/1 population, sampled without replacement."""

    def __init__(self, N):
        self.N, self.t, self.s = N, 0, 0
        self.kp, self.km = np.ones_like(GRID), np.ones_like(GRID)
        self.alive = np.ones(GRID.shape, bool)
        self.mu, self.v = 0.0, 0.0  # running mean and sum of squared deviations (predictable plug-ins)

    def update(self, x):
        t = self.t
        rem = self.N - t
        mt = (self.N * GRID - self.s) / rem  # mean of what is left if GRID is the truth
        ok = (mt >= 0) & (mt <= 1)
        self.alive &= ok
        mt = np.clip(mt, 1e-9, 1 - 1e-9)
        var = (self.v / t if t > 1 else 0.25)
        lam = math.sqrt(2 * math.log(2 / ALPHA) / (max(var, 1e-4) * (t + 1) * math.log(t + 2)))
        lp = np.minimum(lam, CLIP / mt)
        lm = np.minimum(lam, CLIP / (1 - mt))
        self.kp *= 1 + lp * (x - mt)
        self.km *= 1 - lm * (x - mt)
        self.alive &= (0.5 * self.kp + 0.5 * self.km) < 1 / ALPHA
        self.t += 1
        self.s += x
        d = x - self.mu
        self.mu += d / self.t
        self.v += d * (x - self.mu)

    def interval(self):
        a = np.nonzero(self.alive)[0]
        return (GRID[a[0]], GRID[a[-1]]) if len(a) else (0.0, 0.0)


def wilson(k, n):
    p = k / n
    c = (p + Z * Z / (2 * n)) / (1 + Z * Z / n)
    h = Z * math.sqrt(p * (1 - p) / n + Z * Z / (4 * n * n)) / (1 + Z * Z / n)
    return c - h, c + h


def normal(k, n, N):
    p = k / n
    h = Z * math.sqrt(p * (1 - p) / n * (1 - n / N))
    return p - h, p + h


def run(rr, labels, tgt):
    N = len(labels)
    order = rr.sample(range(N), min(N, CAP))
    cs, out = Betting(N), {}
    for i, idx in enumerate(order, 1):
        cs.update(labels[idx])
        if i < START or (i - START) % BATCH:
            continue
        k = sum(labels[j] for j in order[:i])
        look = {"N": normal(k, i, N), "W": wilson(k, i)}
        if "C" not in out:
            look["C"] = cs.interval()
        for key, (lo, hi) in look.items():
            if key not in out and (hi - lo) / 2 <= tgt:
                out[key] = (i, lo, hi)
        if len(out) == 3:
            break
    for key, ivl in (("N", normal), ("W", wilson)):
        if key not in out:
            k = sum(labels[j] for j in order)
            lo, hi = ivl(k, len(order)) if key == "W" else ivl(k, len(order), N)
            out[key] = (len(order), lo, hi, "cap")
    if "C" not in out:
        lo, hi = cs.interval()
        out["C"] = (len(order), lo, hi, "cap")
    return out


def main():
    lines = ["category | prevalence % | target pts | interval | coverage % | mean stopped n | n / fixed-n Wald | share at cap"]
    for cat in P.CATS:
        rows = P.load(cat)
        rng = random.Random(R.SPLIT_SEED)
        order = list(range(len(rows)))
        rng.shuffle(order)
        cut = int(R.TRAIN_SHARE * len(rows))
        labels = [rows[i][2] for i in order[cut:]]
        N, truth = len(labels), sum(labels) / len(labels)
        for tgt in (0.01, 0.005):
            rr = random.Random(SEED)
            res = {k: [] for k in "NWC"}
            for _ in range(REPS):
                for k, v in run(rr, labels, tgt).items():
                    res[k].append(v)
            n0 = 1 / (1 / (Z * Z * truth * (1 - truth) / tgt ** 2) + 1 / N)  # Wald size with finite-population correction
            for k, name in (("N", "normal+fpc"), ("W", "Wilson"), ("C", "betting CS")):
                r = res[k]
                cov = 100 * sum(lo <= truth <= hi for _, lo, hi, *_ in r) / REPS
                mn = sum(x[0] for x in r) / REPS
                cap = sum(len(x) == 4 for x in r) / REPS
                lines.append(f"{cat} | {100 * truth:.2f} | {100 * tgt:.1f} | {name} | {cov:.1f} | {mn:.0f} | {mn / n0:.2f} | {cap:.3f}")
                print(lines[-1], flush=True)
    (HERE / "h6y_confseq.txt").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
