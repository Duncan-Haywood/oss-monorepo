"""Milestone 81 analysis: the mixed protocol (k fp16 referee segments + m float32 arbiter segments) against windowed and
uniform shrinks, and the adversary's best response on a cost frontier.

Reads ../dispute_arbiter/results.json (milestone 80: calibration, honest, uniform ladder, tail cheat) and results.json
(this milestone: E = 30 windows). Rules are milestone 80's, unchanged: arbiter = reorder replay, convict above M = 10 x
the zoned honest calibration maximum; referee = zoned fp16 (1 - f) quantile. Protocol (f, k, m): k + m distinct
segments drawn uniformly, m replayed by the arbiter, k by the referee, each flagged referee segment sent to the
arbiter. Miss chance per job, exact: C(N-|A|, m)/C(N, m) * C(N-m-|F|, k)/C(N-m, k), A = convicted segments,
F = flagged-and-convicted (F is a subset of A). Cost per honest job (k s + m s r + E[honest flags among k] s r) / T.
Run: python3 analyze.py   (numpy; seconds). Writes results.txt and summary.json."""
import json, os
from math import comb
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
M = 10.0
FS = [0.01, 0.02]
KS = range(0, 31)
MS = range(0, 6)
RS = [2, 15]
BUDGETS = [0.05, 0.1, 0.2, 0.4]


def ratios(by_seed, mode):
    keys = sorted(by_seed, key=int)
    return np.array([[g[mode][0] / g[mode][1] for g in by_seed[k]] for k in keys])


def miss(a, fl, k, m, n):
    first = comb(n - a, m) / comb(n, m)
    if first == 0 or n - m - fl < k:
        return 0.0
    return first * comb(n - m - fl, k) / comb(n - m, k)


def main():
    D80 = json.load(open(os.path.join(HERE, "..", "dispute_arbiter", "results.json")))
    D = json.load(open(os.path.join(HERE, "results.json")))
    T, S, TAIL0 = D80["T"], D80["S"], D80["TAIL0"]
    N = T // S
    MAIN = np.arange(N) * S < TAIL0
    zones = (("main", MAIN), ("tail", ~MAIN))
    tests = dict(D80["test"]) | dict(D["test"])
    spec = dict(D80["cheats"]) | dict(D["cheats"])
    cheats = [c for c in tests if c != "honest"]
    family = [c for c in D["test"]] + ["uniform 2e-2"]  # E = 30 step-units
    cal = {m: ratios(D80["cal"], m) for m in ("fp16", "reorder")}
    R = {c: {m: ratios({k: v["seg"] for k, v in tests[c].items()}, m) for m in ("fp16", "reorder")} for c in tests}
    loss = {c: np.array([tests[c][k]["loss"] for k in sorted(tests[c], key=int)]) for c in tests}
    harm = {c: float((loss[c] - loss["honest"]).mean()) for c in cheats}
    hse = {c: float((loss[c] - loss["honest"]).std(ddof=1) / np.sqrt(len(loss[c]))) for c in cheats}
    arb = np.empty(N)
    for zn, z in zones:
        arb[z] = M * cal["reorder"][:, z].max()
    conv = {c: R[c]["reorder"] > arb for c in tests}

    def covered(c):
        lo, hi, _ = spec[c]
        j = np.arange(N) * S
        return (j + S > lo) & (j < hi)

    out = {"harm": harm, "harm_se": hse, "windows": {}, "frontier": {}, "best_response": {}}
    L = [f"Milestone 81. N = {N} segments of s = {S}; arbiter = reorder at M = {M:g}; 20 test seeds per worker.", "",
         "Windowed cheats (E = 30 step-units) and milestone 80's uniform 2e-2: segments covered, arbiter conviction and",
         "fp16 flag rate on covered segments, held-out loss harm vs honest (paired mean +- s.e., 20 seeds).",
         f"  {'cheat':14} {'eta':>6} {'segs':>4} {'convict':>8} {'flag.01':>8} {'flag.02':>8} {'harm':>10} {'s.e.':>9}"]
    rth = {}
    for f in FS:
        rth[f] = np.empty(N)
        for zn, z in zones:
            rth[f][z] = np.quantile(cal["fp16"][:, z], 1 - f, method="higher")
    flag = {f: {c: R[c]["fp16"] > rth[f] for c in tests} for f in FS}
    for c in family:
        cv = covered(c)
        row = {"eta": spec[c][2], "segments": int(cv.sum()), "convict": float(conv[c][:, cv].mean()),
               "flag": {str(f): float(flag[f][c][:, cv].mean()) for f in FS}, "harm": harm[c], "harm_se": hse[c]}
        out["windows"][c] = row
        L.append(f"  {c:14} {row['eta']:6.3f} {row['segments']:4d} {row['convict']:8.3f} {row['flag']['0.01']:8.3f} "
                 f"{row['flag']['0.02']:8.3f} {harm[c]:+10.2e} {hse[c]:9.1e}")
    L.append(f"  honest test segments convicted: {int(conv['honest'].sum())} of {conv['honest'].size}")
    out["honest_convicted"] = int(conv["honest"].sum())

    # per-protocol catch and cost
    A = {c: conv[c].sum(1) for c in cheats}
    F = {f: {c: (flag[f][c] & conv[c]).sum(1) for c in cheats} for f in FS}
    hflag = {f: float(flag[f]["honest"].sum(1).mean()) for f in FS}
    protos = []
    for f in FS:
        for k in KS:
            for m in MS:
                if k + m == 0:
                    continue
                cat = {c: float(1 - np.mean([miss(a, fl, k, m, N) for a, fl in zip(A[c], F[f][c])])) for c in cheats}
                cost = {r: (k * S + m * S * r + hflag[f] * k / N * S * r) / T for r in RS}
                protos.append({"f": f, "k": k, "m": m, "cost": cost, "catch": cat})
    # best response check (prediction iii): which E = 30 cheat has the lowest catch, per protocol
    lowest = {}
    viol = 0
    for p in protos:
        c0 = min(family, key=lambda c: p["catch"][c])
        lowest[c0] = lowest.get(c0, 0) + 1
        w20 = min(p["catch"][c] for c in family if c.startswith("W20 "))
        if w20 > min(p["catch"][c] for c in family) + 1e-12:
            viol += 1
    out["best_response"] = {"lowest_catch_counts": lowest, "protocols": len(protos), "w20_not_lowest": viol}
    L += ["", f"Best response over the E = 30 family, across all {len(protos)} protocols in the grid (f, k <= 30, m <= 5):",
          "  cheat with the lowest catch: " + ", ".join(f"{c} in {n}" for c, n in sorted(lowest.items(), key=lambda x: -x[1])),
          f"  protocols where no W = 20 window is the lowest-catch cheat: {viol}"]
    bound = max(p["catch"][c] - (p["k"] + p["m"]) / N for p in protos for c in family if c.startswith("W20 "))
    L.append(f"  largest W = 20 catch minus (k + m)/N: {bound:+.4f}")
    out["best_response"]["w20_bound_excess"] = bound

    def crit(p, which):
        if which == "mincatch":
            return min(p["catch"][c] for c in family)
        return -max(harm[c] * (1 - p["catch"][c]) for c in cheats if harm[c] > 0)

    L += ["", "Cost frontier. For each budget (share of T per honest job), the best protocol in the grid with m = 0",
          "(fp16 referee only) and with m free (mixed). mincatch = lowest catch over the E = 30 family (higher is better);",
          "undet = largest harm x (1 - catch) over every cheat with positive harm (lower is better), and which cheat sets it."]
    for which in ("mincatch", "undet"):
        for r in RS:
            L.append(f"  {which}, r = {r}:")
            for b in BUDGETS:
                cell = {}
                for lab, ok in (("fp16", lambda p: p["m"] == 0), ("mixed", lambda p: True)):
                    cand = [p for p in protos if p["cost"][r] <= b + 1e-12 and ok(p)]
                    if not cand:
                        cell[lab] = None
                        continue
                    best = max(cand, key=lambda p: crit(p, which))
                    v = crit(best, which)
                    arg = (min(family, key=lambda c: best["catch"][c]) if which == "mincatch"
                           else max((c for c in cheats if harm[c] > 0), key=lambda c: harm[c] * (1 - best["catch"][c])))
                    cell[lab] = {"f": best["f"], "k": best["k"], "m": best["m"], "cost": best["cost"][r],
                                 "value": v if which == "mincatch" else -v, "set_by": arg}
                out["frontier"][f"{which} r={r} b={b}"] = cell
                txt = []
                for lab in ("fp16", "mixed"):
                    x = cell[lab]
                    txt.append(f"{lab}: none" if x is None else
                               f"{lab}: f={x['f']:.2f} k={x['k']:2d} m={x['m']} cost {x['cost']:.3f} "
                               f"{which} {x['value']:.3g} ({x['set_by']})")
                ratio = ""
                if cell["fp16"] and cell["mixed"] and which == "undet" and cell["mixed"]["value"] > 0:
                    ratio = f"  fp16/mixed {cell['fp16']['value'] / cell['mixed']['value']:.2f}x"
                L.append(f"    b = {b:4.2f}  " + " | ".join(txt) + ratio)
    # Post hoc (added after seeing that m = 0 wins at every budget above): larger budgets, k up to N - m, f = 0.01.
    L += ["", "Post hoc (written after the frontier above): undet at budgets 0.6 to 1.0 T, k up to N - m, f = 0.01.",
          "  r     b   fp16 (k, undet)          best with m >= 1 (k, m, undet)"]
    out["post_hoc"] = {}
    pos = [c for c in cheats if harm[c] > 0]
    for r in RS:
        for b in (0.6, 0.8, 1.0):
            best = {}
            for m in MS:
                for k in range(0, N - m + 1):
                    cost = (k * S + m * S * r + hflag[0.01] * k / N * S * r) / T
                    if k + m == 0 or cost > b + 1e-12:
                        continue
                    u = max(harm[c] * np.mean([miss(a, fl, k, m, N) for a, fl in zip(A[c], F[0.01][c])]) for c in pos)
                    lab = "mixed" if m else "fp16"
                    if lab not in best or u < best[lab][0]:
                        best[lab] = (float(u), k, m)
            out["post_hoc"][f"r={r} b={b}"] = best
            fp, mx = best["fp16"], best["mixed"]
            L.append(f"  {r:2d} {b:5.1f}   k={fp[1]:2d} undet {fp[0]:.3g}        k={mx[1]:2d} m={mx[2]} undet {mx[0]:.3g}"
                     f"   fp16/mixed {fp[0] / mx[0]:.2f}x")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    print("\n".join(L))


if __name__ == "__main__":
    main()
