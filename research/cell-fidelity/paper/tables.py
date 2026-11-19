"""Tables and interval statistics for the paper's results section (triage, milestones 7c to 7h).

Stdlib only, no simulation: every number is read from a committed `experiments/*/summary.json`.
One command regenerates everything the results section quotes:

    python3 research/cell-fidelity/paper/tables.py        # writes paper/tables.txt and tables.json

Added for the results section (descriptive, after every milestone below had reported; no new
hypothesis is tested here):
- Wilson 95% intervals on each out-of-batch hit count;
- a set-clustered bootstrap of the pooled fresh-pool hit rate (7g and 7h frozen policies), since the
  three policies of a set share one fresh pool and are not independent;
- the paired per-fold cycle difference, threshold rule against uniform, on 7h's 20 lopo5 folds, with
  an exact sign test and a set-clustered bootstrap interval.
"""
import json
import math
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent / "experiments"
SETS = ["Ai2020", "Chen2020", "OKane2022", "NCA_Kim2011"]
U50 = 50.0
B = 20000
SEED = 7101


def load(name):
    return json.loads((EXP / name / "summary.json").read_text())


def wilson(k, n, z=1.959964):
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def sign_test(diffs):
    """Two-sided exact sign test on nonzero differences: (n_pos, n_neg, p)."""
    pos = sum(1 for d in diffs if d > 0)
    neg = sum(1 for d in diffs if d < 0)
    n = pos + neg
    if n == 0:
        return pos, neg, 1.0
    k = min(pos, neg)
    p = sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n
    return pos, neg, min(1.0, 2 * p)


def cluster_boot(rows, key, stat, b=B, seed=SEED):
    """Percentile 95% interval of stat(rows) resampling whole clusters (key(row)) with replacement."""
    groups = {}
    for r in rows:
        groups.setdefault(key(r), []).append(r)
    names = sorted(groups)
    rng = random.Random(seed)
    vals = []
    for _ in range(b):
        pick = [r for _ in names for r in groups[rng.choice(names)]]
        vals.append(stat(pick))
    vals.sort()
    return (vals[int(0.025 * b)], vals[int(0.975 * b) - 1])


def in_sample():
    """7c's drift signal, 7d's flag-and-extend saving at t = 1.25, 7e's mean saving over 21 targets."""
    c = load("drift7c")["sets"]
    d = load("triage7d")["sets"]
    e = load("frontier7e")["sets"]
    out = []
    for s in SETS:
        d0 = d[s]["000"]
        out.append(dict(
            set=s, n=c[s]["n"],
            rho_O1=c[s]["rho"]["O1"], p_holm_O1=c[s]["p_holm"]["O1"],
            q75_10=d0["q75_10"], q75_50=d0["q75_50"],
            saved7d_SC=d0["saved"]["S_C"], saved7d_random=d0["saved"]["random"],
            saved7e={k: e[s]["mean_saved"][k] for k in ("uniform", "S_C", "random", "oracle")},
            strict7e=e[s]["n_strict"],
        ))
    return out


def looks():
    """Every out-of-batch look at the threshold rule (theta) against the uniform rule (U), per fold."""
    f7 = load("margin7f")
    g7 = load("fresh7g")
    h7 = load("fresh7h")
    L = []

    def add(look, rule, rows, fresh):
        for r in rows:
            L.append(dict(look=look, rule=rule, fresh=fresh, set=r["set"], met=bool(r["met"]),
                          cycles=float(r["cycles"]), ratio=r["q75"] / r["target"],
                          pool=r.get("pool") or r.get("from_pool") or r.get("src")))

    add("7f nested (pools reused)", "theta", f7["folds"]["theta"], False)
    add("7f nested (pools reused)", "F", f7["folds"]["F"], False)
    add("7f nested (pools reused)", "U", f7["folds"]["U"], False)
    add("7g frozen 7f policies", "theta", g7["frozen"]["theta"], True)
    add("7g frozen 7f policies", "F", g7["frozen"]["F"], True)
    add("7g frozen 7f policies", "U", g7["frozen"]["U"], True)
    add("7h frozen 7f policies", "theta", h7["frozen7f"], True)
    add("7h frozen 7g refits", "theta", h7["frozen7g"], True)
    for rule in ("theta", "F", "U", "R50"):
        add("7h lopo5 (5 pools)", rule, h7["lopo5"][rule], False)
    return L


def summarise(L):
    table = []
    for look in dict.fromkeys(r["look"] for r in L):
        for rule in dict.fromkeys(r["rule"] for r in L if r["look"] == look):
            rs = [r for r in L if r["look"] == look and r["rule"] == rule]
            k, n = sum(r["met"] for r in rs), len(rs)
            cyc = sum(r["cycles"] for r in rs) / n
            miss = [r["ratio"] for r in rs if not r["met"]]
            table.append(dict(look=look, rule=rule, met=k, n=n, wilson=wilson(k, n), cycles=cyc,
                              saved=1 - cyc / U50, worst_miss=max(miss) if miss else None))
    return table


def pooled_fresh(L):
    """Frozen 7f threshold policies on the two fresh pools (7g, 7h): 24 policy-pool scores, 8 clusters."""
    rs = [r for r in L if r["rule"] == "theta" and r["look"] in ("7g frozen 7f policies", "7h frozen 7f policies")]
    k, n = sum(r["met"] for r in rs), len(rs)
    rate = lambda xs: sum(x["met"] for x in xs) / len(xs)
    cyc = lambda xs: sum(x["cycles"] for x in xs) / len(xs)
    key = lambda r: (r["look"], r["set"])
    return dict(met=k, n=n, rate=k / n, wilson=wilson(k, n),
                boot_rate=cluster_boot(rs, key, rate), cycles=cyc(rs), boot_cycles=cluster_boot(rs, key, cyc),
                clusters=len({key(r) for r in rs}))


def paired_lopo5(L, a="theta", b="U"):
    """Per fold (set, held-out pool), cycles of rule a minus rule b on 7h's lopo5."""
    def idx(rule):
        return {(r["set"], r["pool"]): r for r in L if r["look"] == "7h lopo5 (5 pools)" and r["rule"] == rule}
    A, Bm = idx(a), idx(b)
    keys = sorted(A)
    rows = [dict(set=k[0], pool=k[1], d=A[k]["cycles"] - Bm[k]["cycles"], met_a=A[k]["met"], met_b=Bm[k]["met"])
            for k in keys]
    diffs = [r["d"] for r in rows]
    pos, neg, p = sign_test(diffs)
    mean = lambda xs: sum(x["d"] for x in xs) / len(xs)
    both = sum(1 for r in rows if r["met_a"] and r["met_b"])
    return dict(n=len(rows), mean_diff=mean(rows), boot=cluster_boot(rows, lambda r: r["set"], mean),
                a_cheaper=neg, a_dearer=pos, ties=len(rows) - pos - neg, sign_p=p, both_met=both,
                only_a_met=sum(1 for r in rows if r["met_a"] and not r["met_b"]),
                only_b_met=sum(1 for r in rows if r["met_b"] and not r["met_a"]))


def fmt(table, ins, pool, pair):
    o = ["cell-fidelity paper tables: triage results 7c to 7h, regenerated from experiments/*/summary.json.",
         "",
         "Table 1. In-sample: 7c drift signal and the DFN cycles flag-and-extend saves against running all 104",
         "designs to cycle 50 (7d at t = 1.25; 7e mean over 21 targets t = 1.00 to 2.00, cell 000).",
         f"{'set':12s} {'n':>3s} {'rho O1':>7s} {'p_holm':>7s} {'q75 k10':>8s} {'q75 k50':>8s} "
         f"{'7d S_C':>7s} {'7d rnd':>7s} {'7e unif':>8s} {'7e S_C':>7s} {'7e rnd':>7s} {'7e orc':>7s} {'strict':>7s}"]
    for r in ins:
        s = r["saved7e"]
        o.append(f"{r['set']:12s} {r['n']:3d} {r['rho_O1']:7.3f} {r['p_holm_O1']:7.4f} {r['q75_10']:8.3f} "
                 f"{r['q75_50']:8.3f} {r['saved7d_SC']:7.0%} {r['saved7d_random']:7.0%} {s['uniform']:8.0%} "
                 f"{s['S_C']:7.0%} {s['random']:7.0%} {s['oracle']:7.0%} {r['strict7e']:4d}/21")
    o += ["",
          "Table 2. Out of batch: held-out target met (q75 <= 1.25 x the scored pool's all-50 q75), Wilson 95%,",
          "mean DFN cycles per design, saving against U50, and the worst miss (q75 / target).",
          f"{'look':26s} {'rule':6s} {'met':>6s} {'Wilson 95%':>13s} {'cycles':>7s} {'saved':>6s} {'worst miss':>10s}"]
    for t in table:
        w = f"{t['wilson'][0]:.2f}-{t['wilson'][1]:.2f}"
        wm = f"{t['worst_miss']:.2f}" if t["worst_miss"] else "-"
        o.append(f"{t['look']:26s} {t['rule']:6s} {t['met']:3d}/{t['n']:<2d} {w:>13s} {t['cycles']:7.1f} "
                 f"{t['saved']:6.0%} {wm:>10s}")
    o += ["",
          "Pooled fresh-pool hit rate, frozen 7f threshold policies on 7g and 7h:",
          f"  {pool['met']}/{pool['n']} = {pool['rate']:.2f}; Wilson 95% {pool['wilson'][0]:.2f}-{pool['wilson'][1]:.2f}; "
          f"set-clustered bootstrap ({pool['clusters']} clusters, {B} draws) {pool['boot_rate'][0]:.2f}-{pool['boot_rate'][1]:.2f}",
          f"  mean cycles {pool['cycles']:.1f} (bootstrap {pool['boot_cycles'][0]:.1f}-{pool['boot_cycles'][1]:.1f}), "
          f"saved {1 - pool['cycles'] / U50:.0%} ({1 - pool['boot_cycles'][1] / U50:.0%}-{1 - pool['boot_cycles'][0] / U50:.0%})",
          "",
          "Paired lopo5 folds, threshold (theta) minus uniform (U), DFN cycles per design:",
          f"  n = {pair['n']}; mean {pair['mean_diff']:+.2f} (set-clustered bootstrap {pair['boot'][0]:+.2f} to {pair['boot'][1]:+.2f}); "
          f"theta cheaper on {pair['a_cheaper']}, dearer on {pair['a_dearer']}, tied on {pair['ties']}; "
          f"exact sign test p = {pair['sign_p']:.4f}",
          f"  both met {pair['both_met']}, only theta met {pair['only_a_met']}, only U met {pair['only_b_met']}"]
    return "\n".join(o) + "\n"


def main():
    L = looks()
    table = summarise(L)
    ins = in_sample()
    pool = pooled_fresh(L)
    pair = paired_lopo5(L)
    txt = fmt(table, ins, pool, pair)
    (HERE / "tables.txt").write_text(txt)
    (HERE / "tables.json").write_text(json.dumps(dict(in_sample=ins, out_of_batch=table, pooled_fresh=pool,
                                                      paired_lopo5=pair), indent=1, default=list) + "\n")
    print(txt, end="")


if __name__ == "__main__":
    main()
