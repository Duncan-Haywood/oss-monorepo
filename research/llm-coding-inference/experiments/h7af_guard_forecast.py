"""Milestone 7af: can a planner forecast, before any audit, how often the neg_guard=3 rule (tau and guard-20 off) will
use coder cells, and does that forecast explain the width gain better than the audit's share of the corpus n/N?

7ae found that the share of draws where the guard lets cells through is set by the audit size n, not by n/N: the guard
counts pilot positives the coder labelled 0, an absolute count. The closed form is the hypergeometric tail
q = P(X >= 3), X ~ Hypergeometric(population, misses, pilot) (`llmci.audit_design.guard_fire_probability`), where misses
is the number of human positives the coder labels 0. No new draws: this reads every committed cell of 7x, 7y, 7aa, 7ab,
7ac and 7ae (36 cells, 3 GoEmotions categories plus neutral, 2 Qwen2.5 sizes, NaijaSenti natural and thinned), rebuilds
each cell's coder exactly as its script did to count misses, and compares q with the observed share.
Population and pilot per study: 7x/7y/7aa pilot n/2 from the 6,683-item test part; 7ae pilot n/2 from a fresh N-item
subsample of it, so marginally a uniform n/2-sample of the 6,683 items; 7ab pilot 0.3 n from its 6,000-item corpus;
7ac pilot 0.3 n from its thinned corpus. The screen with tau 0 also needs J_hat >= 0; the forecast ignores that.

Prediction (written before this script first ran):
  P1  |q - observed share| <= max(5 points, 3 binomial SEs at the cell's draw count) in all 36 cells.
  P2  every cell with q < 0.25 has a width ratio (guard-only / pooled) between 0.97 and 1.04 (cells rarely used, so
      no gain and no loss beyond noise).
  P3  across all 36 cells, Spearman rho(ratio, q) <= -0.5, and |rho(ratio, q)| > |rho(ratio, n/N)|.
  Refuted: P1 if any cell misses; P2 if any q < 0.25 cell is outside [0.97, 1.04]; P3 if either inequality fails.

    python3 experiments/h7af_guard_forecast.py      # writes h7af_guard_forecast.txt; downloads NaijaSenti and GoEmotions on first use
"""
import random
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.argv = sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
import group_shift_reddit as R  # noqa: E402
import h6r_rare_pilot as P  # noqa: E402
from llmci import audit_design as A  # noqa: E402


def goemo_coder(cat, model):
    """The 7x/7y/7ae coder: cached LLM score above the label-free cut (3x train prevalence)."""
    rows = P.load(cat)
    rng = random.Random(R.SPLIT_SEED); order = list(range(len(rows))); rng.shuffle(order)
    cut = int(R.TRAIN_SHARE * len(rows))
    train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
    human, n = [t[2] for t in test], len(test)
    sc = {}
    for l in (HERE / f"gollm_{cat}_{model}.tsv").read_text().splitlines():
        i, x = l.split("\t"); sc[int(i)] = float(x)
    sc = [sc[i] for i in range(n)]
    prev_tr = sum(t[2] for t in train) / len(train)
    thr = sorted(sc)[int(n * (1 - min(0.5, 3 * prev_tr)))]
    return human, [int(x > thr) for x in sc]


def naija(prev=None):
    """The 7ab corpus (prev None: the 6,000-item seeded subsample) or the 7ac thinned corpus (prev 0.01 / 0.03)."""
    import h3_llm_width as H3
    train, test, idx = H3.corpus()
    codes, _ = H3.coder("nb-in-language", train, test)
    if prev is not None:
        rng = random.Random(7)
        zeros = [i for i in range(len(test)) if test[i][2] == 0]
        ones = [i for i in range(len(test)) if test[i][2] == 1]
        k = round(prev / (1 - prev) * len(zeros))
        idx = sorted(zeros + rng.sample(ones, min(k, len(ones))))
    return [test[i][2] for i in idx], [int(codes[i]) for i in idx]


def rows_of(path):
    return [[c.strip() for c in l.split("|")] for l in path.read_text().splitlines()[2:] if "|" in l]


def cells():
    """(study, label, human, f, population, pilot, n, N, reps, observed share, ratio) for every committed cell."""
    out, cache = [], {}

    def coder(key, fn):
        if key not in cache:
            cache[key] = fn()
        return cache[key]
    for cat in ("fear", "sadness", "admiration"):  # 7x, n 1000
        p = HERE / f"h7x_{cat}.txt"; r = {x[0]: x for x in rows_of(p)}
        h, f = coder((cat, "1.5B"), lambda: goemo_coder(cat, "Qwen2.5-1.5B-Instruct"))
        out.append(("7x", f"{cat} 1.5B", h, f, len(h), 500, 1000, len(h), 500, float(r["neg_guard=3 alone"][1]),
                    float(r["neg_guard=3 alone"][3]) / float(r["pooled"][3])))
    for cat, suf, model in [(c, "", "1.5B") for c in ("fear", "sadness", "admiration", "neutral")] + \
                           [(c, "_0.5B", "0.5B") for c in ("fear", "sadness")]:  # 7y, 7aa
        for n in (500, 2000):
            p = HERE / f"h7y_{cat}_n{n}{suf}.txt"; r = {x[0]: x for x in rows_of(p)}
            h, f = coder((cat, model), lambda: goemo_coder(cat, f"Qwen2.5-{model}-Instruct"))
            out.append(("7aa" if suf else "7y", f"{cat} {model}", h, f, len(h), n // 2, n, len(h), 500,
                        float(r["neg_guard=3 alone"][1]), float(r["neg_guard=3 alone"][3]) / float(r["pooled"][3])))
    for cat in ("fear", "sadness", "admiration"):  # 7ae
        rs = rows_of(HERE / f"h7ae_{cat}.txt")
        h, f = coder((cat, "1.5B"), lambda: goemo_coder(cat, "Qwen2.5-1.5B-Instruct"))
        for x in rs:
            if x[3] == "neg_guard=3 alone":
                n, N = int(x[0]), int(x[1])
                pooled = next(y for y in rs if y[:2] == x[:2] and y[3] == "pooled")
                out.append(("7ae", f"{cat} 1.5B N={N}", h, f, len(h), n // 2, n, N, 1000, float(x[4]),
                            float(x[6]) / float(pooled[6])))
    for study, path, prev, reps in (("7ab", "h7ab_naija_guard_only.txt", None, 500),
                                    ("7ac", "h7ac_naija_rare_0.01.txt", 0.01, 1000),
                                    ("7ac", "h7ac_naija_rare_0.03.txt", 0.03, 1000)):
        h, f = coder(("naija", prev), lambda: naija(prev))
        rs = rows_of(HERE / path)
        for x in rs:
            if x[1] == "neg_guard=3 alone":
                n = int(x[0])
                pooled = next(y for y in rs if y[0] == x[0] and y[1] == "pooled")
                out.append((study, f"naija {'natural' if prev is None else prev}", h, f, len(h), round(A.PILOT_SHARE * n),
                            n, len(h), reps, float(x[2]), float(x[4]) / float(pooled[4])))
    return out


def spearman(a, b):
    def rank(v):
        o = sorted(range(len(v)), key=lambda i: v[i]); r = [0.0] * len(v); i = 0
        while i < len(o):
            j = i
            while j + 1 < len(o) and v[o[j + 1]] == v[o[i]]:
                j += 1
            for k in range(i, j + 1):
                r[o[k]] = (i + j) / 2
            i = j + 1
        return r
    ra, rb = rank(a), rank(b)
    ma, mb = sum(ra) / len(ra), sum(rb) / len(rb)
    cov = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    return cov / (sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb)) ** 0.5


def main():
    out = ["study | cell | n | N | n/N | pilot | misses in population | expected misses in pilot | forecast q % | "
           "observed % | |diff| | tolerance | width ratio guard-only/pooled"]
    qs, ratios, shares, p1, p2 = [], [], [], [], []
    for study, label, h, f, pop, pilot, n, N, reps, obs, ratio in cells():
        misses = sum(1 for a, b in zip(h, f) if a and not b)
        q = A.guard_fire_probability(pilot, misses, pop)
        tol = max(5.0, 300 * (q * (1 - q) / reps) ** 0.5)
        diff = abs(100 * q - obs)
        p1.append(diff <= tol)
        if q < 0.25:
            p2.append(0.97 <= ratio <= 1.04)
        qs.append(q); ratios.append(ratio); shares.append(n / N)
        out.append(f"{study} | {label} | {n} | {N} | {n/N:.3f} | {pilot} | {misses} | {pilot*misses/pop:.2f} | {100*q:.1f} | "
                   f"{obs:.0f} | {diff:.1f} | {tol:.1f} | {ratio:.3f}")
    rq, rs = spearman(ratios, qs), spearman(ratios, shares)
    out += ["",
            f"P1 forecast within tolerance: {sum(p1)}/{len(p1)} cells -> {'supported' if all(p1) else 'refuted'}",
            f"P2 cells with q < 0.25 inside [0.97, 1.04]: {sum(p2)}/{len(p2)} -> {'supported' if all(p2) else 'refuted'}",
            f"P3 Spearman rho(ratio, q) = {rq:.3f}, rho(ratio, n/N) = {rs:.3f} -> "
            f"{'supported' if rq <= -0.5 and abs(rq) > abs(rs) else 'refuted'}",
            "Planning rule (Poisson limit): the guard fires in 90% of pilots once the pilot expects 5.32 missed positives, "
            "i.e. pilot >= 5.32 / (prevalence x (1 - sensitivity)); `audit_design.pilot_for_guard` gives the exact size."]
    print("\n".join(out))
    (HERE / "h7af_guard_forecast.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
