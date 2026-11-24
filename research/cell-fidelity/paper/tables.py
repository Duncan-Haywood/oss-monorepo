"""Tables and interval statistics for the paper's results section (triage 7c to 7h; corrected forecast 7v to 7y).

Stdlib only, no simulation: every number is read from a committed `experiments/*/summary.json`. Float sums
use `math.fsum`, so `tables.json` is byte-identical under Python 3.11 and 3.12+ (3.12 made `sum()` compensated).
One command regenerates everything the results section quotes:

    python3 research/cell-fidelity/paper/tables.py        # writes paper/tables.txt and tables.json

Added for the results section (descriptive, after every milestone below had reported; no new
hypothesis is tested here):
- Wilson 95% intervals on each out-of-batch hit count;
- a set-clustered bootstrap of the pooled fresh-pool hit rate (7g and 7h frozen policies), since the
  three policies of a set share one fresh pool and are not independent;
- the paired per-fold cycle difference, threshold rule against uniform, on 7h's 20 lopo5 folds, with
  an exact sign test and a set-clustered bootstrap interval.

Table 3 (added after 7y had reported; descriptive, no new hypothesis): the corrected ten-cycle forecast
and the gates that decide when to use it (7w, 7x, 7y), on the four committed sets and 7v's tuned cells at
f = 10 and f = 30, rebuilt from the fold rows in gate7x's and gate7y's summaries, with Wilson intervals,
the six-set paired difference against theta (sign test, the same set bootstrap as sets7p), a per-set
view, and 7y's post-hoc per-set oracle.

Table 3, seventh column (added after 7za had reported; descriptive, no new hypothesis): 7z's
`Marquis2019` plating cell at f = 30 (five folds, every rule and gate from 7za's summary, its oracle
pick from 7za), and the seven-set pooling (committed + both f = 30 cells + Marquis2019 at f = 30, 35
folds) with the same paired statistics; 7za's stored seven-set pairs are the control.

Table 3, eighth column (added after 7zc and 7zd had reported; descriptive, no new hypothesis): 7zc's
plating-free SEI cell (`Marquis2019`, plating off, SEI film resistivity 0, solvent diffusivity x 1e5;
five folds, every rule and gate from 7zc's `rules/summary.json`) and the eight-set pooling (seven +
that cell, 40 folds), with 7zd's resistive rung (rho = 0.1, 20,000 Ohm m) swapped in as a sensitivity.
The SEI cell is relabelled `Marquis2019-SEI` so the set bootstrap treats it as its own cluster, as
7zc's own eight-set report does; 7zc's and 7zd's stored eight-set pairs are the control.

Table 3, direction-aware gate row (added after 7ze had reported; descriptive, no new hypothesis): 7ze's
thetaS (gS = the drift-size gate gD and a training-pool direction share s >= 0.80; 7x's thetaH where on,
7h's theta where off) on every set-condition, read from `dirgate7ze/summary.json`'s fold rows; a per-set
gate view (direction share, gD and gS decisions per fold, and whether gS's set decision matches the
oracle); and the folds on which gS and gD decide differently. 7ze's stored pooled pairs are the control.
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
            cyc = math.fsum(r["cycles"] for r in rs) / n
            miss = [r["ratio"] for r in rs if not r["met"]]
            table.append(dict(look=look, rule=rule, met=k, n=n, wilson=wilson(k, n), cycles=cyc,
                              saved=1 - cyc / U50, worst_miss=max(miss) if miss else None))
    return table


def pooled_fresh(L):
    """Frozen 7f threshold policies on the two fresh pools (7g, 7h): 24 policy-pool scores, 8 clusters."""
    rs = [r for r in L if r["rule"] == "theta" and r["look"] in ("7g frozen 7f policies", "7h frozen 7f policies")]
    k, n = sum(r["met"] for r in rs), len(rs)
    rate = lambda xs: sum(x["met"] for x in xs) / len(xs)
    cyc = lambda xs: math.fsum(x["cycles"] for x in xs) / len(xs)
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
    mean = lambda xs: math.fsum(x["d"] for x in xs) / len(xs)
    both = sum(1 for r in rows if r["met_a"] and r["met_b"])
    return dict(n=len(rows), mean_diff=mean(rows), boot=cluster_boot(rows, lambda r: r["set"], mean),
                a_cheaper=neg, a_dearer=pos, ties=len(rows) - pos - neg, sign_p=p, both_met=both,
                only_a_met=sum(1 for r in rows if r["met_a"] and not r["met_b"]),
                only_b_met=sum(1 for r in rows if r["met_b"] and not r["met_a"]))


def fmt(table, ins, pool, pair):
    o = ["cell-fidelity paper tables: triage results 7c to 7h and the corrected forecast 7w to 7y, regenerated from experiments/*/summary.json.",
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


# ---------- Table 3: the corrected forecast and its gates (7w to 7y) ----------

CONDS = (("four", "committed sets (20 folds)"), ("f30", "tuned f = 30 (10)"), ("f10", "tuned f = 10 (10)"),
         ("m30", "Marquis2019 f = 30 (5; 7za)"), ("sei", "Marquis2019 SEI-only, rho 0 (5; 7zc)"),
         ("sei1", "Marquis2019 SEI-only, rho 0.1 (5; 7zd)"))
SEVEN = ("four", "f30", "m30")
EIGHT = SEVEN + ("sei",)
EIGHT_R = SEVEN + ("sei1",)  # 7zd's resistive rung in place of 7zc's cell
SEI_SRC = {"sei": ("sei7zc/rules", "7zc"), "sei1": ("sei7zd/rho1e-01/rules", "7zd rho 0.1")}
CRULES = (("U", "uniform run length (7h)"), ("theta", "straight forecast + triage (7h)"),
          ("thetaC", "corrected, no gate (7w)"), ("thetaH", "corrected, honest margin (7x)"),
          ("thetaN", "out-of-fold error gate (7x)"), ("thetaP", "plating-share gate (7y)"),
          ("thetaD", "drift-size gate (7y)"), ("thetaS", "direction-aware drift gate (7ze)"),
          ("oracle", "post hoc per-set oracle (7y)"))


def corrected_folds():
    """{cond: {rule: [fold rows]}}; thetaC from gate7x (its replay of 7w/7v), thetaS from dirgate7ze, the rest
    from gate7y (or 7za / 7zc / 7zd for their cells)."""
    x, y, z = load("gate7x"), load("gate7y"), load("marq7za")
    F = {}
    for c, _ in CONDS:
        if c == "m30":  # 7za: every rule and gate, fixed before the cell existed, on 7z's new cell
            F[c] = {r: z["folds"][r] for r in ("theta", "U", "thetaC", "thetaH", "thetaN", "thetaP", "thetaD")}
            F[c]["oracle"] = list(F[c][z["oracle"]])
            continue
        if c in SEI_SRC:  # 7zc / 7zd: the same rules and gates on the plating-free SEI cell
            w = load(SEI_SRC[c][0])
            F[c] = {r: [dict(f, set="Marquis2019-SEI") for f in w["folds"][r]]
                    for r in ("theta", "U", "thetaC", "thetaH", "thetaN", "thetaP", "thetaD")}
            F[c]["oracle"] = list(F[c][w["oracle"]])
            continue
        F[c] = {r: y[c]["folds"][r] for r in ("theta", "U", "thetaH", "thetaN", "thetaP", "thetaD")}
        F[c]["thetaC"] = x[c]["folds"]["thetaC"]
        pick = y["oracle"][c]  # per set: the rule (theta or thetaH) with the better held-out outcome
        F[c]["oracle"] = [f for f in F[c]["theta"] if pick[f["set"]] == "theta"] + \
                         [f for f in F[c]["thetaH"] if pick[f["set"]] == "thetaH"]
    S = load("dirgate7ze")["folds"]  # 7ze: thetaS composed from the stored thetaH / theta folds
    for c, _ in CONDS:
        F[c]["thetaS"] = S[c]["thetaS"]
    return F


def paired(fa, fb):
    """Per fold (set, pool): cycles of rule a minus rule b, with both met flags (sets7p's `paired`)."""
    A = {(r["set"], r["pool"]): r for r in fa}
    Bm = {(r["set"], r["pool"]): r for r in fb}
    assert set(A) == set(Bm), "rules cover different folds"
    return [dict(set=k[0], pool=k[1], d=A[k]["cycles"] - Bm[k]["cycles"], met_a=bool(A[k]["met"]),
                 met_b=bool(Bm[k]["met"])) for k in sorted(A)]


def pair_stats(fa, fb):
    pr = paired(fa, fb)
    pos, neg, p = sign_test([r["d"] for r in pr])
    mean = lambda xs: math.fsum(r["d"] for r in xs) / len(xs)
    return dict(n=len(pr), mean=mean(pr), boot=cluster_boot(pr, lambda r: r["set"], mean),
                cheaper=neg, dearer=pos, sign_p=p)


def agg(fs):
    k, n = sum(bool(f["met"]) for f in fs), len(fs)
    return dict(met=k, n=n, wilson=wilson(k, n), cycles=math.fsum(f["cycles"] for f in fs) / n)


def corrected():
    F = corrected_folds()
    tot = {c: {r: agg(F[c][r]) for r, _ in CRULES} for c, _ in CONDS}
    six = {r: F["four"][r] + F["f30"][r] for r, _ in CRULES}
    tot["six"] = {r: agg(six[r]) for r, _ in CRULES}
    seven = {r: [f for c in SEVEN for f in F[c][r]] for r, _ in CRULES}
    tot["seven"] = {r: agg(seven[r]) for r, _ in CRULES}
    pair6 = {r: pair_stats(six[r], six["theta"]) for r, _ in CRULES if r != "theta"}
    pair7 = {r: pair_stats(seven[r], seven["theta"]) for r, _ in CRULES if r != "theta"}
    pair7u = {r: pair_stats(seven[r], seven["U"]) for r, _ in CRULES if r != "U"}
    pair4 = {r: pair_stats(F["four"][r], F["four"]["theta"]) for r, _ in CRULES if r != "theta"}
    pair8, pair8u = {}, {}
    for name, conds in (("eight", EIGHT), ("eight_r", EIGHT_R)):
        e = {r: [f for c in conds for f in F[c][r]] for r, _ in CRULES}
        tot[name] = {r: agg(e[r]) for r, _ in CRULES}
        pair8[name] = {r: pair_stats(e[r], e["theta"]) for r, _ in CRULES if r != "theta"}
        pair8u[name] = {r: pair_stats(e[r], e["U"]) for r, _ in CRULES if r != "U"}
    per = {}
    for c, _ in CONDS:
        for st in dict.fromkeys(f["set"] for f in F[c]["theta"]):
            per[f"{c}:{st}"] = {r: agg([f for f in F[c][r] if f["set"] == st]) for r, _ in CRULES}
    same = {}  # folds (of 40) where two rules stop at the same cycles with the same met flag
    for a, b in (("thetaP", "thetaN"), ("thetaD", "thetaH"), ("thetaN", "thetaH"), ("thetaC", "thetaH"),
                 ("thetaS", "thetaD"), ("thetaS", "thetaN")):
        same[f"{a}={b}"] = {c: sum(1 for r in paired(F[c][a], F[c][b]) if r["d"] == 0 and r["met_a"] == r["met_b"])
                            for c, _ in CONDS}
    oracle = dict(load("gate7y")["oracle"], m30={"Marquis2019": load("marq7za")["oracle"]},
                  **{c: {"Marquis2019-SEI": load(SEI_SRC[c][0])["oracle"]} for c in SEI_SRC})
    return dict(total=tot, pair_six=pair6, pair_seven=pair7, pair_seven_u=pair7u, pair_four=pair4, per=per,
                pair_eight=pair8, pair_eight_u=pair8u,
                same=same, oracle=oracle, gates=direction_gates(oracle))


def direction_gates(oracle):
    """7ze's per-fold direction share s and gate decisions (gD, gS), and each set's gS decision against the oracle.

    A set's decision is gS's majority over its five folds (on in at least 3 of 5), as 7ze's H377 grades it.
    """
    G = load("dirgate7ze")["gates"]
    D = stored_gd()
    out = {}
    for c, _ in CONDS:
        for st, pick in oracle[c].items():
            ks = sorted(k for k in G[c]["S"] if k.split("|")[0] == st)
            out[f"{c}:{st}"] = dict(share=[G[c]["share"][k] for k in ks], gD=[D[c][k] for k in ks],
                                    gS=[G[c]["S"][k] for k in ks], oracle=pick, set_on=G[c]["set_on"][st],
                                    agrees=G[c]["set_on"][st] == (pick == "thetaH"))
    return out


def stored_gd():
    """{cond: {'set|pool': stored gD decision}}, read as 7ze's `stored()` reads them (fold order of theta's rows)."""
    y = load("gate7y")
    D = {}
    for c in ("four", "f30", "f10"):
        pools = {}
        for f in y[c]["folds"]["theta"]:
            pools.setdefault(f["set"], []).append(f["pool"])
        D[c] = {f"{st}|{p}": bool(on) for st, gs in y[c]["gates"]["D"].items() for p, on in zip(pools[st], gs)}
    for c, src in (("m30", "marq7za"),) + tuple((k, v[0]) for k, v in SEI_SRC.items()):
        z = load(src)
        st = "Marquis2019-SEI" if c in SEI_SRC else z["folds"]["theta"][0]["set"]
        D[c] = {f"{st}|{f['pool']}": bool(on) for f, on in zip(z["folds"]["theta"], z["gates"]["D"])}
    return D


def fmt_corrected(C):
    o = ["",
         "Table 3. The corrected ten-cycle forecast and its gates, out of batch (7w to 7y; lopo5, five folds per",
         "set): target met / folds, Wilson 95% on the committed sets, mean DFN cycles per design, and over the six",
         "set-conditions (committed + f = 30) the paired difference against theta with a set bootstrap and sign test.",
         f"{'rule':6s} {'what':33s} {'committed':>9s} {'Wilson 95%':>11s} {'cyc':>5s} {'f=30':>6s} {'cyc':>5s} "
         f"{'f=10':>6s} {'cyc':>5s}  {'six: rule - theta':>17s} {'set boot 95%':>16s} {'ch/de':>6s} {'sign p':>7s}"]
    T = C["total"]
    for r, what in CRULES:
        a, b, c = T["four"][r], T["f30"][r], T["f10"][r]
        w = f"{a['wilson'][0]:.2f}-{a['wilson'][1]:.2f}"
        if r == "theta":
            tail = f"{'(reference)':>17s}"
        else:
            q = C["pair_six"][r]
            tail = (f"{q['mean']:+17.2f} {q['boot'][0]:+7.2f} to {q['boot'][1]:+5.2f} "
                    f"{q['cheaper']:>2d}/{q['dearer']:<3d} {q['sign_p']:7.3f}")
        o.append(f"{r:6s} {what:33s} {a['met']:6d}/{a['n']:<2d} {w:>11s} {a['cycles']:5.1f} {b['met']:3d}/{b['n']:<2d} "
                 f"{b['cycles']:5.1f} {c['met']:3d}/{c['n']:<2d} {c['cycles']:5.1f}  {tail}")
    o += ["",
          "Committed sets only, rule - theta (20 folds): mean, set bootstrap 95%, cheaper/dearer, sign p:"]
    for r, _ in CRULES:
        if r == "theta":
            continue
        q = C["pair_four"][r]
        o.append(f"  {r:7s} {q['mean']:+6.2f}  ({q['boot'][0]:+.2f} to {q['boot'][1]:+.2f})  "
                 f"{q['cheaper']}/{q['dearer']}  p = {q['sign_p']:.3f}")
    o += ["", "Folds where two rules make the same decision (same cycles, same met flag), committed / f = 30 / f = 10:"]
    for k, v in C["same"].items():
        o.append(f"  {k:15s} {v['four']:2d}/20  {v['f30']:2d}/10  {v['f10']:2d}/10  (Marquis2019 f = 30: {v['m30']}/5; "
                 f"SEI rho 0: {v['sei']}/5, rho 0.1: {v['sei1']}/5)")
    o += ["",
          "Per set: target met / 5 and mean DFN cycles per design; oracle = the rule 7y's hindsight pick chose.",
          f"{'condition:set':24s}" + "".join(f"{r:>12s}" for r in ("U", "theta", "thetaC", "thetaN", "thetaP", "thetaD", "thetaS"))
          + f"{'oracle':>8s}"]
    for key, row in C["per"].items():
        c, st = key.split(":")
        cells = "".join(f"{row[r]['met']:>4d}/5 {row[r]['cycles']:5.1f}"
                        for r in ("U", "theta", "thetaC", "thetaN", "thetaP", "thetaD", "thetaS"))
        o.append(f"{key:24s}{cells}{C['oracle'][c][st]:>8s}")
    o += fmt_seven(C)
    o += fmt_eight(C)
    o += fmt_direction(C)
    return "\n".join(o) + "\n"


def fmt_seven(C):
    """Table 3's seventh column: 7z's Marquis2019 plating cell at f = 30 (7za) and the seven-set pooling."""
    T = C["total"]
    o = ["",
         "Table 3, seventh set-condition (7za, added after it reported): Marquis2019 at f = 30, a cell built after",
         "every rule and gate above was fixed, and the seven set-conditions (committed + both f = 30 cells +",
         "Marquis2019 f = 30; 35 folds). Met / folds with Wilson 95%, mean DFN cycles per design, and the paired",
         "seven-set difference against theta and against U (set bootstrap 95%, cheaper/dearer, sign p).",
         f"{'rule':6s} {'Marq f=30':>9s} {'cyc':>5s} {'seven':>6s} {'Wilson 95%':>11s} {'cyc':>5s}  "
         f"{'rule - theta':>12s} {'set boot 95%':>17s} {'ch/de':>6s} {'p':>6s}  {'rule - U':>8s} {'set boot 95%':>17s} {'ch/de':>6s} {'p':>7s}"]
    for r, _ in CRULES:
        m, s7 = T["m30"][r], T["seven"][r]
        w = f"{s7['wilson'][0]:.2f}-{s7['wilson'][1]:.2f}"
        def cell(q):
            return (f"{q['mean']:+8.2f} {q['boot'][0]:+7.2f} to {q['boot'][1]:+6.2f} "
                    f"{q['cheaper']:>2d}/{q['dearer']:<3d} {q['sign_p']:6.3f}")
        t = cell(C["pair_seven"][r]).rjust(51) if r != "theta" else f"{'(reference)':>12s}{'':39s}"
        u = cell(C["pair_seven_u"][r]) if r != "U" else f"{'(reference)':>8s}"
        o.append(f"{r:6s} {m['met']:6d}/{m['n']:<2d} {m['cycles']:5.1f} {s7['met']:3d}/{s7['n']:<2d} {w:>11s} "
                 f"{s7['cycles']:5.1f}  {t}  {u}")
    return o


def fmt_eight(C):
    """Table 3's eighth column: 7zc's plating-free SEI cell, and the eight-set pooling (7zd's rho 0.1 rung as a swap)."""
    T = C["total"]
    o = ["",
         "Table 3, eighth set-condition (7zc and 7zd, added after both reported): Marquis2019 with plating off and the",
         "SEI film's resistivity at 0 (7zc) or 0.1 of Marquis2019's (7zd), and the eight set-conditions (seven + the",
         "rho 0 cell; 40 folds). 'eight, rho 0.1' swaps 7zd's rung in. Paired difference against theta and U as above.",
         f"{'rule':6s} {'SEI rho0':>9s} {'cyc':>5s} {'rho0.1':>6s} {'cyc':>5s} {'eight':>6s} {'Wilson 95%':>11s} {'cyc':>5s}  "
         f"{'rule - theta':>12s} {'set boot 95%':>17s} {'ch/de':>6s} {'p':>6s}  {'rule - U':>8s} {'set boot 95%':>17s} {'ch/de':>6s} {'p':>7s}"]

    def cell(q):
        return (f"{q['mean']:+8.2f} {q['boot'][0]:+7.2f} to {q['boot'][1]:+6.2f} "
                f"{q['cheaper']:>2d}/{q['dearer']:<3d} {q['sign_p']:6.3f}")
    for name, label in (("eight", "eight set-conditions, 7zc's cell"), ("eight_r", "eight, 7zd's rho 0.1 cell swapped in")):
        o.append(f"  {label}:")
        for r, _ in CRULES:
            a, b, e = T["sei"][r], T["sei1"][r], T[name][r]
            w = f"{e['wilson'][0]:.2f}-{e['wilson'][1]:.2f}"
            t = cell(C["pair_eight"][name][r]).rjust(51) if r != "theta" else f"{'(reference)':>12s}{'':39s}"
            u = cell(C["pair_eight_u"][name][r]) if r != "U" else f"{'(reference)':>8s}"
            o.append(f"{r:6s} {a['met']:6d}/{a['n']:<2d} {a['cycles']:5.1f} {b['met']:3d}/{b['n']:<2d} {b['cycles']:5.1f} "
                     f"{e['met']:3d}/{e['n']:<2d} {w:>11s} {e['cycles']:5.1f}  {t}  {u}")
    return o


def fmt_direction(C):
    """Table 3's direction-aware gate (7ze): per-fold direction share s, gD and gS decisions, gS against the oracle."""
    o = ["",
         "Table 3, direction-aware drift gate (7ze, added after it reported): per fold, the share s of training designs",
         "whose drift multiplier m lies on the majority side of 1, the drift-size gate gD (median |m - 1| >= 0.10) and",
         "gS = gD and s >= 0.80 (y on, n off); a set is on where gS is on in at least 3 of 5 folds. f = 10 and the",
         "rho 0.1 rung are outside 7ze's eight verdict sets.",
         f"{'condition:set':24s}{'oracle':>8s}  {'s per fold':30s}{'gD':>7s}{'gS':>7s}  gS vs oracle"]
    yn = lambda xs: "".join("y" if x else "n" for x in xs)
    for key, g in C["gates"].items():
        verdict = ("agrees" if g["agrees"] else "DISAGREES") + ("" if key.split(":")[0] in ("four", "f30", "m30", "sei")
                                                               else " (not a verdict set)")
        o.append(f"{key:24s}{g['oracle']:>8s}  {' '.join('%.2f' % x for x in g['share']):30s}"
                 f"{yn(g['gD']):>7s}{yn(g['gS']):>7s}  {verdict}")
    v = [g for k, g in C["gates"].items() if k.split(":")[0] in ("four", "f30", "m30", "sei")]
    o.append(f"  gS's set decision matches the oracle on {sum(g['agrees'] for g in v)} of {len(v)} verdict sets; "
             f"folds where gS and gD differ: {sum(a != b for g in C['gates'].values() for a, b in zip(g['gD'], g['gS']))}")
    return o


def main():
    L = looks()
    table = summarise(L)
    ins = in_sample()
    pool = pooled_fresh(L)
    pair = paired_lopo5(L)
    corr = corrected()
    txt = fmt(table, ins, pool, pair) + fmt_corrected(corr)
    (HERE / "tables.txt").write_text(txt)
    (HERE / "tables.json").write_text(json.dumps(dict(in_sample=ins, out_of_batch=table, pooled_fresh=pool,
                                                      paired_lopo5=pair, corrected=corr), indent=1, default=list) + "\n")
    print(txt, end="")


if __name__ == "__main__":
    main()
