"""Milestone 80 analysis: the float32/float64 arbiter on one flagged segment, and the two-stage protocol's cost.

Reads results.json (run.py). Statistic per s = 20 segment and replay mode: drift / mean replayed step norm.
Arbiter: convict when the statistic exceeds M = 10 x the calibration maximum of that mode in the segment's zone
(main t0 < TAIL0, tail the rest), fixed before running. Referee: milestone 79's zoned fp16 quantile at budget f, refit
on this run's 40 calibration seeds. Two-stage protocol: the referee opens k of N segments uniformly at random; each
flagged opened segment goes to the arbiter (s r referee-step equivalents). A job is caught when an opened segment is
both flagged and convicted (exact hypergeometric over the job's count of such segments). Arbiter-only audit: open k
segments straight at the arbiter (cost k s r).
Run: python3 analyze.py   (numpy; seconds). Writes results.txt and summary.json."""
import json, os
from math import comb
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
M = 10.0
FS = [0.01, 0.02]
KS = [1, 2, 5, 10, 20]
RS = [1, 2, 15, 30]
ARB = ("reorder", "shard4", "f64")


def ratios(by_seed, mode):
    keys = sorted(by_seed, key=int)
    return np.array([[g[mode][0] / g[mode][1] for g in by_seed[k]] for k in keys])


def catch(q, k, n):
    return 1.0 - comb(n - int(q), k) / comb(n, k)


def main():
    D = json.load(open(os.path.join(HERE, "results.json")))
    T, S, TAIL0 = D["T"], D["S"], D["TAIL0"]
    N = T // S
    MAIN = np.arange(N) * S < TAIL0
    zones = (("main", MAIN), ("tail", ~MAIN))
    cheats = list(D["test"])
    cal = {m: ratios(D["cal"], m) for m in D["modes"]}
    test = {c: {m: ratios({k: v["seg"] for k, v in D["test"][c].items()}, m) for m in D["modes"]} for c in cheats}
    loss = {c: np.array([D["test"][c][k]["loss"] for k in sorted(D["test"][c], key=int)]) for c in cheats}
    out = {"M": M, "modes": {}, "conviction": {}, "floor": {}, "protocol": [], "arbiter_only": [], "harm": {}}
    L = [f"{len(D['cal'])} calibration seeds x {N} segments (s = {S}); 20 test seeds per worker; arbiter M = {M:g}.",
         "", "Honest calibration statistic (drift / mean replayed step norm) by mode and zone:",
         f"  {'mode':8} {'zone':5} {'median':>10} {'q99':>10} {'max':>10} {'max/med':>8} {'test max':>10}"]
    th = {}
    for m in D["modes"]:
        th[m] = np.empty(N)
        out["modes"][m] = {}
        for zn, z in zones:
            v = cal[m][:, z]
            th[m][z] = M * v.max()
            tm = test["honest"][m][:, z].max()
            out["modes"][m][zn] = {"median": float(np.median(v)), "q99": float(np.quantile(v, 0.99)),
                                   "max": float(v.max()), "test_max": float(tm)}
            L.append(f"  {m:8} {zn:5} {np.median(v):10.3g} {np.quantile(v, 0.99):10.3g} {v.max():10.3g} "
                     f"{v.max() / np.median(v):8.1f} {tm:10.3g}")
    L += ["", "Arbiter conviction rate per segment (honest = false convictions on held-out test seeds; tail cheat "
          "scored on its 15 tail segments), and held-out loss harm vs honest (paired mean, 20 seeds):",
          f"  {'worker':16} " + " ".join(f"{m:>9}" for m in D["modes"]) + f" {'harm':>10}"]
    for c in cheats:
        cols = ~MAIN if c.startswith("tail") else np.ones(N, bool)
        rates = {}
        for m in D["modes"]:
            thr = th[m] / M if m == "fp16" else th[m]  # fp16 column: plain max-of-honest, for reference
            rates[m] = float((test[c][m][:, cols] > thr[cols]).mean())
        out["conviction"][c] = rates
        harm = float((loss[c] - loss["honest"]).mean())
        out["harm"][c] = harm
        L.append(f"  {c:16} " + " ".join(f"{rates[m]:9.4f}" for m in D["modes"]) + f" {harm:+10.2e}")
    L.append("  (fp16 column: flagged above the plain fp16 calibration max, M = 1, for comparison)")
    etas = sorted([(D["cheats"][c][2], c) for c in cheats if c.startswith("uniform")])
    L += ["", "Resolution floor: smallest uniform eta with >= 90% of segments convicted:"]
    for m in ARB:
        ok = [e for e, c in etas if out["conviction"][c][m] >= 0.9]
        out["floor"][m] = min(ok) if ok else None
        L.append(f"  {m:8} {out['floor'][m]}")
    # two-stage protocol
    L += ["", "Two-stage protocol: fp16 zoned quantile referee on k opened segments, reorder arbiter on each flagged one.",
          "Cost per honest job in units of T = (k s + E[flagged opened] s r) / T; catch = share of jobs caught.",
          f"  {'f':>5} {'k':>3} {'P(disp)':>8} " + " ".join(f"{'r=' + str(r):>7}" for r in RS)
          + "  catch: " + " ".join(f"{c.replace('uniform ', 'u'):>8}" for c in cheats[1:])]
    for f in FS:
        rth = np.empty(N)
        for zn, z in zones:
            rth[z] = np.quantile(cal["fp16"][:, z], 1 - f, method="higher")
        flag_h = (test["honest"]["fp16"] > rth).sum(1)
        for k in KS:
            pdisp = float(np.mean([catch(q, k, N) for q in flag_h]))
            eflag = float(np.mean(flag_h) * k / N)
            costs = [(k * S + eflag * S * r) / T for r in RS]
            cat = {}
            for c in cheats[1:]:
                both = ((test[c]["fp16"] > rth) & (test[c]["reorder"] > th["reorder"])).sum(1)
                cat[c] = float(np.mean([catch(q, k, N) for q in both]))
            out["protocol"].append({"f": f, "k": k, "p_dispute": pdisp, "cost": dict(zip(map(str, RS), costs)),
                                    "catch": cat})
            L.append(f"  {f:5.2f} {k:3d} {pdisp:8.3f} " + " ".join(f"{x:7.3f}" for x in costs)
                     + "         " + " ".join(f"{cat[c]:8.3f}" for c in cheats[1:]))
    L += ["", "Arbiter-only audit: k segments replayed by the reorder arbiter. Cost k s r / T; catch per worker.",
          f"  {'k':>3} " + " ".join(f"{'r=' + str(r):>7}" for r in RS)
          + "  catch: " + " ".join(f"{c.replace('uniform ', 'u'):>8}" for c in cheats)]
    for k in KS:
        costs = [k * S * r / T for r in RS]
        cat = {c: float(np.mean([catch(q, k, N) for q in (test[c]["reorder"] > th["reorder"]).sum(1)])) for c in cheats}
        out["arbiter_only"].append({"k": k, "cost": dict(zip(map(str, RS), costs)), "catch": cat})
        L.append(f"  {k:3d} " + " ".join(f"{x:7.3f}" for x in costs) + "         "
                 + " ".join(f"{cat[c]:8.3f}" for c in cheats))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    print("\n".join(L))


if __name__ == "__main__":
    main()
