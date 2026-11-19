"""Intervals and trend tests for table VII-1 of DRAFT.md (post hoc; milestone 7 paper step, 2026-11-19).

Reads the per-seed L2-45 crash counts (diverged flights of 64 per design at lever 2, 45 deg, cap) already printed in
the results files of milestones 7t-7ac; runs no simulation. For every row of table VII-1 it gives each design's
identified total (crashes summed over the 33, 36 and 39.1 ms laws, of 192) and a stratified bootstrap 95% interval
(by geometry, 6 designs each) for the set's identified total (of 1152); for the ceiling sweep at the 39.1 ms floor
(78.2, 100, 125, 150, 200 ms) a Jonckheere-Terpstra test for a decreasing trend, per geometry and for the 75 ms law,
by permutation; and pooled Mann-Whitney U tests (12 designs a side, both geometries) between neighbouring ceilings and\nbetween floors at a fixed ceiling. A permutation p of 0.00005 is the floor, 1/(20000 + 1).
Stdlib only. Run from the project directory: python3 paper/table7_stats.py > paper/table7_stats.txt
"""
import os, random, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from check_numbers import EXP, TABLE7  # noqa: E402

B, P = 20000, 20000


def per_seed(path, geom, label):
    text = open(os.path.join(EXP, path)).read().split("== step ==")[0]
    block = re.search(rf"\[{geom}, aware {label}\] [^\n]*\n((?:   [^\n]*\n?)+)", text)[1]
    return {k: [int(x) for x in v.split(",")] for k, v in re.findall(r"(\S+) ms D\^\S+ \([^)]*\): [^|]*\| 45_2 \[([^\]]*)\]", block)}


def identified(c):
    return [a + b + d for a, b, d in zip(c["33"], c["36"], c["39.1"])]


def boot_total(groups, rng):
    tot = []
    for _ in range(B):
        tot.append(sum(sum(rng.choice(g) for _ in g) for g in groups))
    tot.sort()
    return tot[int(0.025 * B)], tot[int(0.975 * B) - 1]


def jt(samples):
    """Jonckheere-Terpstra statistic for a decreasing trend across ordered groups (ties count one half)."""
    s = 0.0
    for i in range(len(samples)):
        for j in range(i + 1, len(samples)):
            for x in samples[i]:
                for y in samples[j]:
                    s += 1.0 if y < x else 0.5 if y == x else 0.0
    return s


def jt_perm(samples, rng):
    obs = jt(samples)
    pool = [x for g in samples for x in g]
    sizes = [len(g) for g in samples]
    hit = 0
    for _ in range(P):
        rng.shuffle(pool)
        out, k = [], 0
        for n in sizes:
            out.append(pool[k:k + n]); k += n
        hit += jt(out) >= obs
    return obs, (hit + 1) / (P + 1)


def mwu_perm(a, b, rng):
    """Two-sided permutation p for the Mann-Whitney U of a against b (U counts b < a, ties one half)."""
    u = lambda x, y: sum(1.0 if q < p else 0.5 if q == p else 0.0 for p in x for q in y)
    obs = abs(u(a, b) - len(a) * len(b) / 2)
    pool, n, hit = a + b, len(a), 0
    for _ in range(P):
        rng.shuffle(pool)
        hit += abs(u(pool[:n], pool[n:]) - len(a) * len(b) / 2) >= obs
    return u(a, b), (hit + 1) / (P + 1)


def main():
    rng = random.Random(0)
    print(__doc__.split("\n\n")[0])
    print(f"{B} bootstrap resamples, {P} permutations, random seed 0.\n")
    print("== identified total per row (per design: seeds 0-5 above | below), stratified bootstrap 95% interval of the total ==")
    data = {}
    for lag, ms, path, label, _ in TABLE7:
        g = {geom: per_seed(path, geom, label) for geom in ("above", "below")}
        data[label] = g
        ida, idb = identified(g["above"]), identified(g["below"])
        lo, hi = boot_total([ida, idb], rng)
        print(f"{lag:>10} ms ({ms:>3}, {label:>9}): {ida} | {idb}; total {sum(ida) + sum(idb)} of 2304, 95% [{lo}, {hi}]")
    sweep = ["lag39", "lag39c100", "lag39c125", "lag39c150", "lag39c200"]
    print("\n== ceiling sweep at the 39.1 ms floor (78.2, 100, 125, 150, 200 ms): Jonckheere-Terpstra, one-sided, decreasing ==")
    for what, f in (("identified total", identified), ("75 ms law", lambda c: c["75"])):
        for geom in ("above", "below"):
            obs, p = jt_perm([f(data[s][geom]) for s in sweep], rng)
            print(f"{what:>16}, {geom}: J = {obs:.1f} of 360, p = {p:.5f}")
    print("\n== neighbouring ceilings, pooled over geometries (12 designs a side), two-sided permutation Mann-Whitney U ==")
    for what, f in (("identified total", identified), ("75 ms law", lambda c: c["75"])):
        for a, b in zip(sweep, sweep[1:]):
            x = f(data[a]["above"]) + f(data[a]["below"])
            y = f(data[b]["above"]) + f(data[b]["below"])
            u, p = mwu_perm(x, y, rng)
            print(f"{what:>16}: {a:>9} vs {b:>9}: sums {sum(x)} vs {sum(y)}; U = {u:.1f} of 144, p = {p:.5f}")
    print("\n== the floor at a fixed ceiling, pooled over geometries, two-sided permutation Mann-Whitney U (identified total) ==")
    for a, b, why in (("lagrand", "lag39", "33 vs 39.1 ms floor, ceiling 78.2 ms"), ("lag36", "lag39", "36-72 vs 39.1-78.2 ms"),
                      ("lag39c150", "lag75", "39.1 vs 75 ms floor, ceiling 150 ms")):
        x = identified(data[a]["above"]) + identified(data[a]["below"])
        y = identified(data[b]["above"]) + identified(data[b]["below"])
        u, p = mwu_perm(x, y, rng)
        print(f"{why:>38}: {a:>9} vs {b:>9}: sums {sum(x)} vs {sum(y)}; U = {u:.1f} of 144, p = {p:.5f}")


if __name__ == "__main__":
    main()
