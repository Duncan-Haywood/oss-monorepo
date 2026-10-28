"""Milestone 6z: a stratified, coder-assisted betting confidence sequence (PPI rectifier per stratum, union bound over strata)
against the plug-in tuned stratified PPI rule at a data-dependent stop, rare GoEmotions categories. Writes h6z_strat_cs.txt.

    python3 experiments/h6z_strat_cs.py     # needs numpy; reuses the GoEmotions cache of the h6r..h6y experiments; run in the background (tens of minutes)
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
from llmci import estimators as E  # noqa: E402

REPS = int(sys.argv[1]) if len(sys.argv) > 1 else 300
SEED, START, BATCH, FLOOR, CLIP, ALPHA = 20261101, 400, 100, 1e-4, 0.5, 0.05
GROUPS, Z = P.GROUPS, E.Z95
GRID = np.arange(0.35, 0.65001, 0.00005)  # mean of z = (y - f + 1) / 2, so the rectifier mean is 2 * z - 1; truth sits well inside


class Betting:
    """Hedged betting confidence sequence (level alpha) for the mean of a finite population of values in [0, 1], sampled without replacement."""

    def __init__(self, N, alpha):
        self.N, self.alpha, self.t, self.s = N, alpha, 0, 0.0
        self.kp, self.km = np.ones_like(GRID), np.ones_like(GRID)
        self.alive = np.ones(GRID.shape, bool)
        self.mu, self.v = 0.0, 0.0

    def update(self, x):
        t, rem = self.t, self.N - self.t
        mt = (self.N * GRID - self.s) / rem
        self.alive &= (mt >= 0) & (mt <= 1)
        mt = np.clip(mt, 1e-9, 1 - 1e-9)
        var = self.v / t if t > 1 else 0.25
        lam = math.sqrt(2 * math.log(2 / self.alpha) / (max(var, 1e-4) * (t + 1) * math.log(t + 2)))
        self.kp *= 1 + np.minimum(lam, CLIP / mt) * (x - mt)
        self.km *= 1 - np.minimum(lam, CLIP / (1 - mt)) * (x - mt)
        self.alive &= (0.5 * self.kp + 0.5 * self.km) < 1 / self.alpha
        self.t += 1
        self.s += x
        d = x - self.mu
        self.mu += d / self.t
        self.v += d * (x - self.mu)

    def interval(self):
        a = np.nonzero(self.alive)[0]
        if self.t >= self.N:
            return self.s / self.N, self.s / self.N
        return (GRID[a[0]], GRID[a[-1]]) if len(a) else (GRID[0], GRID[-1])


def sequential(rr, sets, f, human, sizes, tgt, truth):
    tot, G = sum(sizes), len(GROUPS)
    order = [rr.sample(sets[k], len(sets[k])) for k in GROUPS]
    fbar = [sum(f[i] for i in sets[k]) / len(sets[k]) for k in GROUPS]
    cs = [Betting(N, ALPHA / G) for N in sizes]
    cnt = [0] * G
    cap = sum(sizes)

    def draw(j):
        i = order[j][cnt[j]]
        cs[j].update((human[i] - f[i] + 1) / 2)
        cnt[j] += 1

    for j, N in enumerate(sizes):
        for _ in range(min(N, max(10, round(START * N / tot)))):
            draw(j)
    res = {}
    while len(res) < 2:
        n = sum(cnt)
        strata, s2 = [], []
        for j, k in enumerate(GROUPS):
            idx = order[j][:cnt[j]]
            strata.append((sizes[j], [f[i] for i in sets[k]], [human[i] for i in idx], [f[i] for i in idx]))
        if "A" not in res:
            e = E.stratified_ppi_tuned(strata)
            if Z * e.se <= tgt or n >= cap:
                res["A"] = (n, E.covers(e, truth, Z), Z * e.se)
        if "C" not in res:
            lo = hi = 0.0
            for j in range(G):
                a, b = cs[j].interval()
                w = sizes[j] / tot
                lo += w * (fbar[j] + 2 * a - 1)
                hi += w * (fbar[j] + 2 * b - 1)
            if (hi - lo) / 2 <= tgt or n >= cap:
                res["C"] = (n, lo <= truth <= hi, (hi - lo) / 2)
        if len(res) == 2:
            break
        for j, (_, _, y, fp) in enumerate(strata):
            vf = E._var(strata[j][1])
            lam = 0.0 if vf == 0 else min(1.0, max(0.0, E._cov(y, fp) / vf))
            s2.append(max(FLOOR, E._var([a - lam * b for a, b in zip(y, fp)])))
        w = [N * v ** 0.5 for N, v in zip(sizes, s2)]
        for _ in range(min(BATCH, cap - n)):
            cand = [j for j in range(G) if cnt[j] < sizes[j]]
            if not cand:
                break
            draw(max(cand, key=lambda j: w[j] / (cnt[j] + 1)))
    return res


def main():
    out = []
    for cat in P.CATS:
        rows = P.load(cat)
        rng = random.Random(R.SPLIT_SEED)
        order = list(range(len(rows)))
        rng.shuffle(order)
        cut = int(R.TRAIN_SHARE * len(rows))
        train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
        human, n = [t[2] for t in test], len(test)
        f = P.coder(train, test)
        sets = {g: [i for i in range(n) if test[i][1] == g] for g in GROUPS}
        sizes = [len(sets[g]) for g in GROUPS]
        truth = sum(human) / n
        s2o = [E.stratum_lambda_s2([human[i] for i in sets[g]], [f[i] for i in sets[g]])[1] for g in GROUPS]
        out.append(f"{cat}: corpus {n}, prevalence {truth:.4f}, positives {sum(human)}, strata {sizes}")
        out.append("category | target pts | rule | coverage % | mean stopped n | n / oracle n | share at full corpus | mean half-width pts")
        for tgt in P.TARGETS:
            o = math.ceil(E.neyman_total(sizes, s2o, tgt))
            rr = random.Random(SEED)
            res = [sequential(rr, sets, f, human, sizes, tgt, truth) for _ in range(REPS)]
            for key, name in (("A", "plug-in tuned PPI, z=1.96"), ("C", "betting CS, rectifier, union over strata")):
                r = [x[key] for x in res]
                mn = sum(x[0] for x in r) / REPS
                out.append(f"{cat} | {100 * tgt:.1f} | {name} | {100 * sum(x[1] for x in r) / REPS:.1f} | {mn:.0f} | {mn / o:.2f} | "
                           f"{sum(x[0] >= n for x in r) / REPS:.3f} | {100 * sum(x[2] for x in r) / REPS:.3f}")
                print(out[-1], flush=True)
        out.append("")
    (HERE / "h6z_strat_cs.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
