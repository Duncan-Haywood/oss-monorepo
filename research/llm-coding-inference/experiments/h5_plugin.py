"""H5: is the stratified-PPI interval width given by a plug-in formula in coder sensitivity, specificity,
prevalence and the audit allocation, and does the audit-size rule built on it hit a target width?
Same NaijaSenti corpus, split and coders as group_shift.py. Writes h5_plugin.txt.

    python3 experiments/h5_plugin.py     # needs the tsv cache that qual-dialect/experiments/run.py fills
"""
import math
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[0]))
import group_shift as G  # noqa: E402
from llmci import estimators as E  # noqa: E402

qd, d = G.qd, G.d
REPS, SEED, Z = 1000, 20261025, E.Z95
TARGET = 0.03  # target half-width, 3 points


def stratum_stats(y, f):
    """Finite-stratum prevalence, sens, spec and the variance of r = y - f, from the confusion table."""
    n = len(y)
    pi = sum(y) / n
    fn = sum(1 for a, b in zip(y, f) if a == 1 and b == 0) / n
    fp = sum(1 for a, b in zip(y, f) if a == 0 and b == 1) / n
    sens, spec = 1 - fn / pi, 1 - fp / (1 - pi)
    # closed form from (pi, sens, spec): E[r^2] = fp + fn, E[r] = fn - fp (population variance), * n/(n-1) for S^2
    fn_c, fp_c = pi * (1 - sens), (1 - pi) * (1 - spec)
    s2 = (fn_c + fp_c - (fn_c - fp_c) ** 2) * n / (n - 1)
    return pi, sens, spec, s2


def predicted_half(sizes, s2, alloc):
    big = sum(sizes)
    return Z * math.sqrt(sum((N / big) ** 2 * (1 - n / N) * v / n for N, v, n in zip(sizes, s2, alloc)))


def neyman_total(sizes, s2, half):
    """The audit-size rule now lives in the library (`llmci.estimators.neyman_total`). Milestone 6a to 6e used a
    version that squared the variance twice in the finite-population term (S^4 for S^2); see LOG.md, 6f."""
    return E.neyman_total(sizes, s2, half)


def main():
    rows = qd.load()
    rng = random.Random(qd.SEED)
    order = list(range(len(rows)))
    rng.shuffle(order)
    cut = int(qd.TRAIN_SHARE * len(rows))
    train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
    en = G.r.load_examples(qd.fetch(qd.GOEMO_URL, qd.GOEMO))
    nb_en = d.NB().fit([e[1] for e in en], [e[2] for e in en]).match_rate([e[1] for e in en], [e[2] for e in en])
    nb_in = d.NB().fit([t[1] for t in train], [t[2] for t in train]).match_rate([t[1] for t in train], [t[2] for t in train])
    human = [t[2] for t in test]
    coders = {"lexicon-en": [d.lexicon_code(t[1]) for t in test], "nb-english": [nb_en.code(t[1]) for t in test],
              "nb-in-language": [nb_in.code(t[1]) for t in test]}
    n = len(test)
    sets = {k: sorted(v) for k, v in d.by_language(test).items()}
    langs = list(sets)
    sizes = [len(sets[k]) for k in langs]
    truth = sum(human) / n
    out = [f"NaijaSenti corpus {n} tweets, true negative share {truth:.4f}; strata " + ", ".join(f"{k} {len(sets[k])}" for k in langs),
           f"{REPS} audit draws per cell, seed {SEED}. Part 1: plug-in half-width (from per-stratum prevalence, sens, spec, allocation) "
           "vs mean simulated half-width of stratified PPI, points. Part 2: audit-size rule for a +/-3 point target.", ""]
    out.append("PART 1 design | coder | per-stratum sens/spec/S2 | predicted half | simulated half | ratio sim/pred | coverage")
    for coder, f in coders.items():
        st = [stratum_stats([human[i] for i in sets[k]], [f[i] for i in sets[k]]) for k in langs]
        s2 = [s[3] for s in st]
        desc = " ".join(f"{k}:{s[1]:.2f}/{s[2]:.2f}/{s[3]:.3f}" for k, s in zip(langs, st))
        nt = neyman_total(sizes, s2, TARGET)
        tot = G.N_AUDIT
        neyman_400 = [max(2, round(tot * N * math.sqrt(v) / sum(M * math.sqrt(u) for M, u in zip(sizes, s2)))) for N, v in zip(sizes, s2)]
        designs = {"B equal quota": [100] * 4, "C 70% hau": [280, 40, 40, 40], "N Neyman n=400": neyman_400}
        for dname, alloc in designs.items():
            pred = predicted_half(sizes, s2, alloc)
            rr = random.Random(SEED)
            hw, hit = [], 0
            for _ in range(REPS):
                strata = []
                for k, N, a in zip(langs, sizes, alloc):
                    idx = rr.sample(sets[k], a)
                    strata.append((N, [f[i] for i in sets[k]], [human[i] for i in idx], [f[i] for i in idx]))
                e = E.stratified_ppi(strata)
                hw.append(Z * e.se)
                hit += E.covers(e, truth)
            sim = statistics.fmean(hw)
            out.append(f"{dname} {alloc} | {coder} | {desc} | {100 * pred:.2f} | {100 * sim:.2f} | {sim / pred:.3f} | {hit / REPS:.3f}")
            print(out[-1], flush=True)
        # Part 2 below is appended after part 1 for this coder
        out.append(f"  (Neyman total for +/-3 points under {coder}: {nt:.1f})")
    out += ["", "PART 2 coder | rule n (Neyman, +/-3 pts) | allocation | simulated mean half | simulated half 95th pct | coverage | human-only (strat) n for same target"]
    for coder, f in coders.items():
        st = [stratum_stats([human[i] for i in sets[k]], [f[i] for i in sets[k]]) for k in langs]
        s2 = [s[3] for s in st]
        nt = math.ceil(neyman_total(sizes, s2, TARGET))
        sw = [math.sqrt(v) * N for v, N in zip(s2, sizes)]
        alloc = [max(2, round(nt * w / sum(sw))) for w in sw]
        # human-only plan: S2 of y itself
        sy = [statistics.pvariance([human[i] for i in sets[k]]) * len(sets[k]) / (len(sets[k]) - 1) for k in langs]
        nh = math.ceil(neyman_total(sizes, sy, TARGET))
        rr = random.Random(SEED + 1)
        hw, hit = [], 0
        for _ in range(REPS):
            strata = []
            for k, N, a in zip(langs, sizes, alloc):
                idx = rr.sample(sets[k], a)
                strata.append((N, [f[i] for i in sets[k]], [human[i] for i in idx], [f[i] for i in idx]))
            e = E.stratified_ppi(strata)
            hw.append(Z * e.se)
            hit += E.covers(e, truth)
        hw.sort()
        out.append(f"{coder} | {nt} | {alloc} | {100 * statistics.fmean(hw):.2f} | {100 * hw[int(0.95 * REPS)]:.2f} | {hit / REPS:.3f} | {nh}")
        print(out[-1], flush=True)
    (HERE / "h5_plugin.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
