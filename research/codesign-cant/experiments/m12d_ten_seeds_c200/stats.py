"""Ten-seed statistics for section VII's knee past 150 ms (milestone 12d): training-lag ceiling 150 ms against 200 ms at the 39.1 ms floor.

Reads results.json (run.py: seeds 0-9 per geometry of milestone 7ab's 200 ms arm) and ../m12c_ten_seeds_vii/results.json (the
150 ms arm's seeds 0-9, scored by the same functions on the same held-out set). Per
design: the identified total (flights of 64 that diverge at lever 2, 45 deg, cap, summed over the 33, 36 and 39.1 ms laws; of
192), the same count at the 75 ms law (of 64), the certificate (margin rho < 1) at the three identified laws, and the median
rise time to 90% of a 1 m step at the 36 ms law. Tests, fixed in ../../LOG.md before the full run:
  pooled two-sided permutation Mann-Whitney U (20 designs a side; 20,000 permutations, as paper/table7_stats.py);
  exact two-sided Wilcoxon signed-rank on the 20 (geometry, seed) pairs (same CMA-ES seeds and training episodes in both arms);
  stratified (by geometry) bootstrap 95% intervals of each arm's total (20,000 resamples).
Stdlib only. Run from this directory: python3 stats.py   (writes stats.txt and stats.json)
"""
import json, os, random, statistics, sys

HERE = os.path.dirname(os.path.abspath(__file__))
FN = sys.argv[1] if len(sys.argv) > 1 else "results.json"
R = json.load(open(os.path.join(HERE, FN))) if __name__ == "__main__" else None
if R:  # the 150 ms arm from milestone 12c
    _C = json.load(open(os.path.join(HERE, "..", "m12c_ten_seeds_vii", "results.json")))
    R["runs"] += [r for r in _C["runs"] if r["set"] == "aware lag39c150"]
    R["resp"] += [r for r in _C["resp"] if r["set"] == "aware lag39c150"]
A125, A150 = "aware lag39c150", "aware lag39c200"  # first arm minus second, as 12c: here 150 minus 200 ms
ID = ("id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0")
SLOW = "stress 75 ms D^0"
GEOMS = ("above", "below")
B = P = 20000
SEEDS = sorted({d["seed"] for d in R["designs"]}) if R else []


def per_design():
    run = {(r["set"], r["geom"], r["seed"], r["law_name"]): r for r in R["runs"]}
    step = {(r["set"], r["geom"], r["seed"]): r for r in R["resp"] if r["test"] == "step" and r["law_name"] == "mid 36 ms D^0"}
    out = {}
    for a in (A125, A150):
        for g in GEOMS:
            for s in SEEDS:
                rs = [run[(a, g, s, law)] for law in ID]
                out[(a, g, s)] = dict(ident=sum(r["dead_45_2_cap"] for r in rs), slow=run[(a, g, s, SLOW)]["dead_45_2_cap"],
                                      cert=all(r["margin_rho"] < 1.0 for r in rs), mass=rs[0]["mass"],
                                      rise=statistics.median(step[(a, g, s)]["rise"]))
    return out


def col(D, a, key, seeds=None, geoms=GEOMS):
    seeds = SEEDS if seeds is None else seeds
    return [D[(a, g, s)][key] for g in geoms for s in seeds]


def mwu_perm(a, b, rng):
    """Two-sided permutation p for the Mann-Whitney U of a against b (U counts b < a, ties one half); table7_stats.py's."""
    u = lambda x, y: sum(1.0 if q < p else 0.5 if q == p else 0.0 for p in x for q in y)
    obs = abs(u(a, b) - len(a) * len(b) / 2)
    pool, n, hit = a + b, len(a), 0
    for _ in range(P):
        rng.shuffle(pool)
        hit += abs(u(pool[:n], pool[n:]) - len(a) * len(b) / 2) >= obs
    return u(a, b), (hit + 1) / (P + 1)


def wilcoxon(d):
    """Exact two-sided Wilcoxon signed-rank p (zeros dropped, midranks for ties), by counting sign patterns with a DP."""
    d = [x for x in d if x != 0]
    n = len(d)
    if n == 0:
        return 1.0, 0.0
    a = sorted(abs(x) for x in d)
    rank = {}
    i = 0
    while i < n:
        j = i
        while j + 1 < n and a[j + 1] == a[i]:
            j += 1
        rank[a[i]] = i + j + 2          # twice the midrank, an integer
        i = j + 1
    r2 = [rank[abs(x)] for x in d]
    tot = sum(r2)
    wplus = sum(r for r, x in zip(r2, d) if x > 0)
    cnt = {0: 1}
    for r in r2:
        nxt = dict(cnt)
        for k, c in cnt.items():
            nxt[k + r] = nxt.get(k + r, 0) + c
        cnt = nxt
    dev = abs(2 * wplus - tot)
    p = sum(c for k, c in cnt.items() if abs(2 * k - tot) >= dev) / 2 ** n
    return min(1.0, p), wplus / 2


def boot_total(groups, rng):
    t = sorted(sum(sum(rng.choice(g) for _ in g) for g in groups) for _ in range(B))
    return t[int(0.025 * B)], t[int(0.975 * B) - 1]


def main():
    rng = random.Random(0)
    D = per_design()
    L = [__doc__.split("\n\n")[0], f"seeds {SEEDS[0]}-{SEEDS[-1]}; {B} bootstrap resamples, {P} permutations, random seed 0.", ""]
    J = {}
    L.append("== per design (identified total of 192 | 75 ms law of 64), seeds in order ==")
    for a in (A125, A150):
        for g in GEOMS:
            L.append(f"  {a:16s} {g:5s}: ident {col(D, a, 'ident', geoms=(g,))} | 75 ms {col(D, a, 'slow', geoms=(g,))}")
    L.append("")
    L.append("== totals (both geometries), stratified bootstrap 95% interval ==")
    for a in (A125, A150):
        for key, of in (("ident", 192), ("slow", 64)):
            groups = [col(D, a, key, geoms=(g,)) for g in GEOMS]
            lo, hi = boot_total(groups, rng)
            n = sum(len(x) for x in groups)
            six = sum(col(D, a, key, seeds=range(6)))
            L.append(f"  {a:16s} {key:5s}: {sum(map(sum, groups))} of {n * of}, 95% [{lo}, {hi}]; per design mean "
                     f"{sum(map(sum, groups)) / n:.2f}; seeds 0-5 {six} of {12 * of}")
            J[f"total_{key}_{a}"] = dict(total=sum(map(sum, groups)), lo=lo, hi=hi, n=n, mean=sum(map(sum, groups)) / n, six=six)
    L.append("")
    L.append("== 150 ms against 200 ms (positive: 150 ms crashes more) ==")
    for key in ("ident", "slow"):
        x, y = col(D, A125, key), col(D, A150, key)
        u, p = mwu_perm(x, y, rng)
        L.append(f"  {key:5s} pooled MWU ({len(x)} a side): sums {sum(x)} vs {sum(y)}; U = {u:.1f} of {len(x) * len(y)}, p = {p:.5f}")
        J[f"mwu_{key}"] = dict(u=u, p=p, sx=sum(x), sy=sum(y))
        d = [a - b for a, b in zip(x, y)]
        pw, wp = wilcoxon(d)
        L.append(f"  {key:5s} paired Wilcoxon ({len(d)} pairs): mean diff {statistics.mean(d):+.2f}; 150 worse in {sum(v > 0 for v in d)}, "
                 f"tied {sum(v == 0 for v in d)}, better in {sum(v < 0 for v in d)}; W+ = {wp:.1f}, p = {pw:.5f}")
        J[f"wilcoxon_{key}"] = dict(p=pw, wplus=wp, mean=statistics.mean(d), worse=sum(v > 0 for v in d), tied=sum(v == 0 for v in d))
        if key == "ident":
            x6, y6 = col(D, A125, key, seeds=SEEDS[6:]), col(D, A150, key, seeds=SEEDS[6:])
            u, p = mwu_perm(x6, y6, rng)
            L.append(f"  ident new seeds only ({SEEDS[6:]}, {len(x6)} a side): sums {sum(x6)} vs {sum(y6)}; U = {u:.1f}, p = {p:.5f}")
            J["new_seeds_ident"] = dict(u=u, p=p, sx=sum(x6), sy=sum(y6))
    L.append("")
    L.append("== certificate and response ==")
    for a in (A125, A150):
        for g in GEOMS:
            c = col(D, a, "cert", geoms=(g,))
            r = col(D, a, "rise", geoms=(g,))
            m = col(D, a, "mass", geoms=(g,))
            L.append(f"  {a:16s} {g:5s}: certified at all identified laws {sum(c)} of {len(c)}; rise90 (36 ms, step) median over "
                     f"seeds {statistics.median(r):.3f} s (seeds 0-5 {statistics.median(r[:6]):.3f}); mass median {statistics.median(m):.3f} kg")
            J[f"resp_{a}_{g}"] = dict(cert=sum(c), n=len(c), rise=statistics.median(r), rise6=statistics.median(r[:6]),
                                      mass=statistics.median(m), rises=r)
    open(os.path.join(HERE, "stats.txt" if FN == "results.json" else "stats_smoke.txt"), "w").write("\n".join(L) + "\n")
    json.dump(J, open(os.path.join(HERE, "stats.json" if FN == "results.json" else "stats_smoke.json"), "w"), indent=1)
    print("\n".join(L))


if __name__ == "__main__":
    main()
