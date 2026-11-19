"""Milestone 7d (flag and extend): a design search runs every candidate's DFN for ten cycles and forecasts its
cycle-99 lithium loss from the fade law's line. 7b found a 50-cycle line is far more accurate; 7c found a ten-cycle
score that flags the designs whose law rate drifts. If only the flagged designs are simulated on to cycle 50, how
much of the all-50 tail accuracy is kept, and how many DFN cycles are saved? All 104 x-resolved designs (5zk 40,
5zy 32, 5zz 32). No new simulation: 7b's and 7c's rows, joined.

    python experiments/triage7d/run.py rows      # join lawfloor and drift7c rows -> rows.json
    python experiments/triage7d/run.py report    # H269 to H272 -> results.txt, summary.json

    F(f, score)  the fraction f of a set's designs with the largest score get the 50-cycle line, the rest keep
                 the ten-cycle line; cost 10 + 40 f DFN cycles per design
    S_C = |m_hat_C - 1| (7c's leave-one-out drift correction, same cell); S_1 = |O1 - median O1 of the others|
    R(f)  random flags, expected quantile over 2,000 draws; O(f)  flags by the design's own gain e10 - e50
    target = 1.25 x q75 of the all-50 policy; f* = smallest grid f whose q75 meets it
Plan in ../../LOG.md (7d plan).
"""
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SETS = ("Ai2020", "Chen2020", "OKane2022", "NCA_Kim2011")
LM50 = ("Chen2020", "OKane2022")
CELLS = ("000", "111")
GRID = [i / 20 for i in range(21)]
TOL, Q, F0 = 1.25, 0.75, 0.25
NDRAW, SEED = 2000, 79
K0, K1 = 10, 50


# ---------- pure helpers (stdlib; tested) ----------

def med(xs):
    xs = sorted(xs)
    n = len(xs)
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2


def quant(xs, p):
    """7c's quantile: the sorted value at index int(p n)."""
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(p * len(xs)))]


def nflag(f, n):
    return int(round(f * n + 1e-9))


def flagged(score, f):
    """Indices of the round(f n) largest scores (ties by index)."""
    o = sorted(range(len(score)), key=lambda i: (-score[i], i))
    return set(o[:nflag(f, len(score))])


def errs(e10, e50, flags):
    return [e50[i] if i in flags else e10[i] for i in range(len(e10))]


def q_policy(e10, e50, score, f, q=Q):
    return quant(errs(e10, e50, flagged(score, f)), q)


def q_random(e10, e50, f, q=Q, ndraw=NDRAW, seed=SEED):
    n = len(e10)
    rng = random.Random(seed)
    k = nflag(f, n)
    tot = 0.0
    for _ in range(ndraw):
        tot += quant(errs(e10, e50, set(rng.sample(range(n), k))), q)
    return tot / ndraw


def f_star(curve, target, grid=GRID):
    """Smallest f whose tail error meets the target (None if none does)."""
    for f, v in zip(grid, curve):
        if v <= target + 1e-15:
            return f
    return None


def saved(f):
    return None if f is None else 1 - (K0 + (K1 - K0) * f) / K1


def verdict(sup, ref):
    return "supported" if sup else ("refuted" if ref else "inconclusive")


# ---------- rows ----------

def rows():
    lf = {(r["cond"], r["j"], r["pool"]): r for r in json.loads((EXP / "lawfloor" / "rows.json").read_text())}
    dr = json.loads((EXP / "drift7c" / "rows.json").read_text())
    out = []
    for d in dr:
        l = lf[(d["cond"], d["j"], d["pool"])]
        o = dict(cond=d["cond"], set=d["set"], j=d["j"], pool=d["pool"], O1=d["O1"], cells={})
        for c in CELLS:
            o["cells"][c] = dict(e10=l["cells"][c]["eL"][str(K0)], e50=l["cells"][c]["eL"][str(K1)],
                                 e10_7c=d["cells"][c]["eL"], mC=d["cells"][c]["mC"])
        out.append(o)
    assert len(out) == len(lf) == 104
    (HERE / "rows.json").write_text(json.dumps(out) + "\n")
    print(len(out), "designs")


# ---------- report ----------

def scores(t, cell):
    o1 = [r["O1"] for r in t]
    S1 = [abs(o1[i] - med(o1[:i] + o1[i + 1:])) for i in range(len(t))]
    SC = [abs(r["cells"][cell]["mC"] - 1) for r in t]
    return dict(S_C=SC, S_1=S1)


def summarise(t, cell):
    e10 = [r["cells"][cell]["e10"] for r in t]
    e50 = [r["cells"][cell]["e50"] for r in t]
    sc = scores(t, cell)
    sc["oracle"] = [a - b for a, b in zip(e10, e50)]
    curves = {k: [q_policy(e10, e50, s, f) for f in GRID] for k, s in sc.items()}
    curves["random"] = [q_random(e10, e50, f) for f in GRID]
    target = TOL * quant(e50, Q)
    fs = {k: f_star(v, target) for k, v in curves.items()}
    i0 = GRID.index(F0)
    return dict(n=len(t), target=target, q75_10=quant(e10, Q), q75_50=quant(e50, Q), med10=med(e10), med50=med(e50),
                gain_pos=sum(g > 0 for g in sc["oracle"]), at_f0={k: v[i0] for k, v in curves.items()},
                f_star=fs, saved={k: saved(v) for k, v in fs.items()}, curves=curves)


def lt(a, b):
    """a < b with None (target never met) as +infinity."""
    a = 2.0 if a is None else a
    b = 2.0 if b is None else b
    return a < b


def verdicts(S):
    c0 = {s: S[s]["000"] for s in S}
    n269 = sum(d["at_f0"]["S_C"] < d["at_f0"]["random"] for d in c0.values())
    fsc = [d["f_star"]["S_C"] for d in c0.values()]
    n270 = sum(f is not None and f <= 0.5 for f in fsc)
    r270 = sum(f is None or f > 0.75 for f in fsc)
    n271 = sum(lt(d["f_star"]["S_C"], d["f_star"]["random"]) for d in c0.values())
    lm = [S[s]["111"]["f_star"] for s in LM50 if s in S]
    s272 = len(lm) == 2 and all(not lt(x["S_C"], x["S_1"]) for x in lm)
    r272 = len(lm) == 2 and all(lt(x["S_C"], x["S_1"]) for x in lm)
    return dict(H269=verdict(n269 >= 3, n269 <= 1), H270=verdict(n270 >= 3, r270 >= 3),
                H271=verdict(n271 >= 3, len(c0) - n271 >= 3), H272=verdict(s272, r272),
                counts=dict(n269=n269, n270=n270, r270=r270, n271=n271))


def report():
    rs = json.loads((HERE / "rows.json").read_text())
    S = {st: {c: summarise([r for r in rs if r["set"] == st], c) for c in CELLS} for st in SETS}
    V = verdicts(S)
    pf = lambda f: "  never" if f is None else f"{f:7.2f}"
    ps = lambda f: "    -" if f is None else f"{100 * f:4.0f}%"
    L = ["cell-fidelity milestone 7d: simulate only the flagged designs to cycle 50. Tail error (q75 over the set's",
         "designs) of the cycle-99 lithium-loss forecast, and the DFN cycles it costs. 104 designs, per set.", ""]
    for c in CELLS:
        L += [f"cell {c} ({'the real forecast' if c == '000' else 'every input measured'}):",
              f"{'set':12s}{'n':>3s}{'q75 k10':>9s}{'q75 k50':>9s}{'target':>8s}{'gain>0':>7s}"
              + "".join(f"{'q75@.25 ' + k:>15s}" for k in ("S_C", "S_1", "random", "oracle"))]
        for st in SETS:
            d = S[st][c]
            L.append(f"{st:12s}{d['n']:3d}{d['q75_10']:9.3f}{d['q75_50']:9.3f}{d['target']:8.3f}{d['gain_pos']:4d}/{d['n']:<2d}"
                     + "".join(f"{d['at_f0'][k]:15.3f}" for k in ("S_C", "S_1", "random", "oracle")))
        L += ["", f"{'set':12s}" + "".join(f"{'f* ' + k:>11s}{'saved':>7s}" for k in ("S_C", "S_1", "random", "oracle"))]
        for st in SETS:
            d = S[st][c]
            L.append(f"{st:12s}" + "".join(f"{pf(d['f_star'][k]):>11s}{ps(d['saved'][k]):>7s}"
                                            for k in ("S_C", "S_1", "random", "oracle")))
        L.append("")
    L += ["q75 by flagged fraction f, cell 000 (S_C / random / oracle):", f"{'f':>5s}" + "".join(f"{st:>24s}" for st in SETS)]
    for i, f in enumerate(GRID):
        if i % 2 == 0:
            L.append(f"{f:5.2f}" + "".join(
                "    " + "/".join(f"{S[st]['000']['curves'][k][i]:.3f}" for k in ("S_C", "random", "oracle")) for st in SETS))
    c = V["counts"]
    L += ["", "(e = |ln(L_pred(99)/L_DFN(99))| at kappa = 25.3; k10 / k50 = 7b's line through cycles 2..10 / 2..50.",
          " S_C = |m_hat_C - 1|, 7c's leave-one-out drift correction for the same cell; S_1 = |O1 - others' median O1|;",
          " random = expected q75 over 2,000 random flag sets; oracle = flags by the design's own e10 - e50.",
          " target = 1.25 x the all-50 q75; f* = smallest f on a 0.05 grid meeting it; saved = 1 - (10 + 40 f*)/50.)", "",
          f"H269 (S_C's q75 below random's at f = 0.25, >= 3 of 4 sets, cell 000): {V['H269']} ({c['n269']}/4)",
          f"H270 (S_C's f* <= 0.5 on >= 3 of 4 sets, cell 000): {V['H270']} ({c['n270']}/4 at most 0.5, {c['r270']}/4 above 0.75)",
          f"H271 (S_C's f* below random's, >= 3 of 4 sets, cell 000): {V['H271']} ({c['n271']}/4)",
          f"H272 (S_1's f* <= S_C's on both LG M50 sets, cell 111): {V['H272']}"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(sets=S, verdicts=V), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"rows": rows, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
