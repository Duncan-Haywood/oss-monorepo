"""Milestone 6aa: a stratified betting confidence sequence whose PPI weight lambda is frozen from a pilot stage (first START items),
so no estimated weight enters the sequence after the pilot. Compares with 6z's lambda = 1 sequence. Writes h6aa_pilot_lambda.txt.

    python3 experiments/h6aa_pilot_lambda.py     # needs numpy; reuses the GoEmotions cache of h6r..h6z; run in the background (tens of minutes)
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
import h6z_strat_cs as Z6  # noqa: E402
from llmci import estimators as E  # noqa: E402

REPS = int(sys.argv[1]) if len(sys.argv) > 1 else 300
SEED, START, BATCH, FLOOR, ALPHA = 20261102, 400, 100, 1e-4, 0.05
GROUPS = P.GROUPS
HALF = 0.08  # grid half-width in z units around the pilot estimate


class Betting(Z6.Betting):
    """Z6.Betting on a grid centred at c (z units), step 5e-5."""

    def __init__(self, N, alpha, c):
        self.grid = np.arange(max(0.0, c - HALF), min(1.0, c + HALF) + 1e-12, 5e-5)
        super().__init__(N, alpha)
        self.kp, self.km = np.ones_like(self.grid), np.ones_like(self.grid)
        self.alive = np.ones(self.grid.shape, bool)

    def update(self, x):
        g, Z6.GRID = Z6.GRID, self.grid
        try:
            super().update(x)
        finally:
            Z6.GRID = g

    def interval(self):
        g, Z6.GRID = Z6.GRID, self.grid
        try:
            return super().interval()
        finally:
            Z6.GRID = g


def sequential(rr, sets, f, human, sizes, tgt, truth):
    tot, G = sum(sizes), len(GROUPS)
    order = [rr.sample(sets[k], len(sets[k])) for k in GROUPS]
    fbar = [sum(f[i] for i in sets[k]) / len(sets[k]) for k in GROUPS]
    pn = [min(N, max(10, round(START * N / tot))) for N in sizes]
    cnt = list(pn)
    # pilot: lambda per stratum from the pilot items, then frozen; the pilot sum enters exactly, the CS covers the unseen rest
    lam, psum, cs = [], [], []
    for j, k in enumerate(GROUPS):
        idx = order[j][:pn[j]]
        y, fp = [human[i] for i in idx], [f[i] for i in idx]
        vf = E._var([f[i] for i in sets[k]])
        l = 0.0 if vf == 0 else min(1.0, max(0.0, E._cov(y, fp) / vf))
        lam.append(l)
        r = [a - l * b for a, b in zip(y, fp)]
        psum.append(sum(r))
        cs.append(Betting(sizes[j] - pn[j], ALPHA / G, (sum(r) / len(r) + l) / (1 + l)))

    def draw(j):
        i = order[j][cnt[j]]
        cs[j].update((human[i] - lam[j] * f[i] + lam[j]) / (1 + lam[j]))
        cnt[j] += 1

    while True:
        n = sum(cnt)
        lo = hi = 0.0
        for j in range(G):
            N, m, w = sizes[j], sizes[j] - pn[j], sizes[j] / tot
            a, b = cs[j].interval() if m else (0.0, 0.0)
            ra, rb = ((1 + lam[j]) * a - lam[j], (1 + lam[j]) * b - lam[j]) if m else (0.0, 0.0)
            lo += w * (lam[j] * fbar[j] + (psum[j] + m * ra) / N)
            hi += w * (lam[j] * fbar[j] + (psum[j] + m * rb) / N)
        if (hi - lo) / 2 <= tgt or n >= tot:
            return n, lo <= truth <= hi, (hi - lo) / 2
        s2 = []
        for j, k in enumerate(GROUPS):
            idx = order[j][:cnt[j]]
            y, fp = [human[i] for i in idx], [f[i] for i in idx]
            s2.append(max(FLOOR, E._var([a - lam[j] * b for a, b in zip(y, fp)])))
        w = [N * v ** 0.5 for N, v in zip(sizes, s2)]
        for _ in range(min(BATCH, tot - n)):
            cand = [j for j in range(G) if cnt[j] < sizes[j]]
            if not cand:
                break
            draw(max(cand, key=lambda j: w[j] / (cnt[j] + 1)))


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
            r = [sequential(rr, sets, f, human, sizes, tgt, truth) for _ in range(REPS)]
            mn = sum(x[0] for x in r) / REPS
            out.append(f"{cat} | {100 * tgt:.1f} | betting CS, pilot-frozen lambda | {100 * sum(x[1] for x in r) / REPS:.1f} | {mn:.0f} | {mn / o:.2f} | "
                       f"{sum(x[0] >= n for x in r) / REPS:.3f} | {100 * sum(x[2] for x in r) / REPS:.3f}")
            print(out[-1], flush=True)
        out.append("")
    (HERE / "h6aa_pilot_lambda.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
