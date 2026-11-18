"""Milestone 83 analysis: exact harms of large stall sets against milestone 82's additive sums, milestone 82's
game B re-priced with them, and the job-level forfeiture game (theory.py) on the measured harms.

Reads results.json (run.py) and ../harm_weighted_sampling/results.json (milestone 82: per-seed single-segment harms).
Rules fixed in LOG.md before the run:
  set harm H(S)       paired mean over seeds 0-39 of (loss after stalling S) - (honest loss)
  additive A(S)       paired mean over the same seeds of the sum of the single-segment harms in S
  ratio               H(S) / A(S); 95% interval by bootstrap over seeds (2,000 resamples, seed 0)
  game B, uniform     additive: sum_j h_j (1 - k/N) (milestone 82); exact: H(all but 5 random), 2 draws per seed
  game B, knapsack    additive: sum over stalled j of h_j (1 - c_j); exact: (1 - c_p) H(knap) + c_p H(Z), p the one
                      partially covered segment, Z the zero-coverage set
  job-level, SRS      d = 1: undetected harm 0 for any F > 0 (theory.py); d < 1 below threshold: (1-d)^k H(all)
  job-level, knapsack the zero-coverage set Z is stalled at no risk for any F: harm H(Z)
Run: python3 analyze.py   (numpy). Writes results.txt and summary.json."""
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
R82 = json.load(open(os.path.join(HERE, "..", "harm_weighted_sampling", "results.json")))
N, K = R["N"], R["K"]
SEEDS = sorted(R["schedules"]["cosine"]["test"], key=int)
SET_ORDER = ["top10", "rand10", "bot10", "top25", "rand25", "bot25", "top50", "rand50", "bot50", "all"]


def per_seed(sc, name):
    t, t82 = R["schedules"][sc]["test"], R82["schedules"][sc]["test"]
    H, A = [], []
    for s in SEEDS:
        st = t[s]["sets"][name]
        H.append(st["loss"] - t[s]["honest"])
        single = [r["loss"] - t82[s]["honest"] for r in t82[s]["single"]]
        A.append(sum(single[j] for j in st["segs"]))
    return np.array(H), np.array(A)


def boot_ratio(H, A, reps=2000, seed=0):
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(H), (reps, len(H)))
    r = H[idx].mean(1) / A[idx].mean(1)
    return float(np.percentile(r, 2.5)), float(np.percentile(r, 97.5))


def main():
    out, summ = [], {}
    p = out.append
    p(f"Milestone 83. N = {N} segments of s = {R['S']}, k = {K}; cheat = full stall of a set of segments; {len(SEEDS)}"
      " test seeds; harms paired (stalled minus honest held-out loss, same seed).")
    p("Honest-run check: the honest losses here equal milestone 82's for every seed and schedule: "
      + str(all(abs(R["schedules"][sc]["test"][s]["honest"] - R82["schedules"][sc]["test"][s]["honest"]) < 1e-9
                for sc in R["schedules"] for s in SEEDS)))
    for sc in R["schedules"]:
        p("")
        p(f"== {sc}")
        p("  set       m   exact H(S)   additive A(S)  H/A    95% CI (bootstrap over seeds)")
        rows = {}
        for name in SET_ORDER:
            H, A = per_seed(sc, name)
            lo, hi = boot_ratio(H, A)
            m = len(R["schedules"][sc]["test"][SEEDS[0]]["sets"][name]["segs"])
            p(f"  {name:7s} {m:3d}  {H.mean():+.4e}  {A.mean():+.4e}  {H.mean() / A.mean():7.2f}  [{lo:.2f}, {hi:.2f}]")
            rows[name] = {"m": m, "H": float(H.mean()), "A": float(A.mean()), "ratio": float(H.mean() / A.mean()),
                          "ci": [lo, hi]}
        # game B re-priced
        h82 = np.mean([[r["loss"] - R82["schedules"][sc]["test"][s]["honest"]
                        for r in R82["schedules"][sc]["test"][s]["single"]] for s in SEEDS], 0)
        Hu = np.mean([np.mean([per_seed(sc, f"uni-5_{r}")[0] for r in range(2)], 0)])
        uni_add = float(h82.sum() * (1 - K / N))
        p("  milestone 82 game B (additive fine, k = 5), additive vs exact expected harm")
        p("    B/g  uniform: additive   exact      x  | knapsack: additive  exact      x  | gain additive  exact")
        gb = {}
        for bg in (5, 10):
            part = R["schedules"][sc]["partial"][f"knap{bg}_partial"]
            seg = R["schedules"][sc]["test"][SEEDS[0]]["sets"][f"knap{bg}"]["segs"]
            # a partial block below 1e-9 is floating-point residue of the greedy fill: treat it as zero coverage
            real = [(j, c) for j, c in zip(part["seg"], part["c"]) if c > 1e-9]
            cp = real[0][1] if real else 0.0
            cvec = np.zeros(N)
            for j, c in real:
                cvec[j] = c
            kn_add = float(sum(h82[j] * (1 - cvec[j]) for j in seg))
            Hk = per_seed(sc, f"knap{bg}")[0].mean()
            Hz = per_seed(sc, f"knapZ{bg}")[0].mean() if real else Hk  # no real partial block: Z is the stalled set
            kn_ex = float((1 - cp) * Hk + cp * Hz)
            p(f"  {bg:5d}  {uni_add:+.3e} {Hu:+.3e} {Hu / uni_add:6.1f} |  {kn_add:+.3e} {kn_ex:+.3e}"
              f" {kn_ex / kn_add:5.2f} |  {uni_add / kn_add:6.2f} {Hu / kn_ex:7.2f}   (stalled {len(seg)}, |Z| = "
              f"{len(seg) - len(real)}, partial c = {cp:.3f})")
            gb[bg] = {"uniform_additive": uni_add, "uniform_exact": float(Hu), "knap_additive": kn_add,
                      "knap_exact": kn_ex, "H_Z": float(Hz), "Z_size": len(seg) - len(real),
                      "gain_additive": uni_add / kn_add, "gain_exact": float(Hu / kn_ex)}
        Hall = rows["all"]["H"]
        p("  job-level forfeit (theory.py): SRS k = 5, d = 1: undetected harm 0 at every F > 0 (honest if F >= 75 g,"
          " else stall all and be caught)")
        p(f"  job-level forfeit, milestone 82's knapsack coverage: Z stalled at no risk at any F; H(Z) ="
          f" {gb[5]['H_Z']:+.3e} (B/g = 5 coverage), {gb[10]['H_Z']:+.3e} (B/g = 10)")
        p("  d < 1 sweep (d not measured), SRS k = 5 below its threshold: the worker stalls all; undetected harm"
          f" (1-d)^5 H(all), H(all) = {Hall:+.3e}")
        sweep = {}
        for d in (0.5, 0.2, 0.1):
            sweep[d] = (1 - d) ** K * Hall
            p(f"    d = {d:.1f}: P(miss) {(1 - d) ** K:.3f}, undetected harm {sweep[d]:+.3e}")
        summ[sc] = {"sets": rows, "game_b": gb, "H_all": Hall, "d_sweep": {str(k): v for k, v in sweep.items()}}
    p("")
    p("Superadditivity of random stall sets, exact / additive (for figure.py; m = 75 is the full stall):")
    p("  m  cosine  constant  wsd")
    for m, name in ((10, "rand10"), (25, "rand25"), (50, "rand50"), (75, "all")):
        p(f"  {m:3d} " + " ".join(f"{summ[sc]['sets'][name]['ratio']:.3f}" for sc in ("cosine", "constant", "wsd")))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(summ, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    print("\n".join(out))


if __name__ == "__main__":
    main()
