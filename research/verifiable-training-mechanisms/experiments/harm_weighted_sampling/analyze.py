"""Milestone 82 analysis: harm per segment position, and what harm-weighted sampling buys against two kinds of worker.

Reads results.json (run.py). Rules fixed in LOG.md before the run:
  harm h_j       paired mean over test seeds of (loss after stalling segment j) - (honest loss)
  detection d_j  share of seeds where the stalled segment's fp16 ratio exceeds the schedule's largest honest calibration
                 fp16 ratio AND its reorder ratio exceeds 10x the largest honest reorder ratio
  coverage c_j   probability that segment j is opened, sum c_j = k
  game A         saboteur: picks j to maximise h_j (1 - c_j d_j). Minimax coverage by water-filling:
                 c_j = min(1, max(0, 1 - v / h_j) / d_j) with v set so sum c_j = k
  game B         rational worker, additive: stalling j saves g, a caught stalled segment costs a fine B, so it stalls
                 j iff c_j d_j < theta = g / B. Uniform deters all iff k/N >= theta. Optimal coverage below that:
                 cover the highest-harm segments at theta / d_j (greedy fractional knapsack), the remainder on the next.
                 Expected harm = sum over stalled j of h_j (1 - c_j d_j).
Cross-fit: coverage fitted on seeds 0-19, evaluated with the harms of seeds 20-39, and the reverse.
Run: python3 analyze.py   (numpy). Writes results.txt and summary.json."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
KS = (1, 2, 5, 10, 20)
BG = (1, 2, 3, 5, 10, 15)
HALF_A, HALF_B = [str(s) for s in range(20)], [str(s) for s in range(20, 40)]


def harms(sc, seeds):
    H = np.array([[r["loss"] - sc["test"][s]["honest"] for r in sc["test"][s]["single"]] for s in seeds])
    return H


def waterfill(h, d, k):
    """Minimax coverage for game A. h >= 0 harms, d in (0, 1] detection, budget k < N."""
    hp = np.maximum(h, 0.0)

    def cov(v):
        with np.errstate(divide="ignore", invalid="ignore"):
            c = np.where(hp > v, (1 - v / np.where(hp > 0, hp, 1)) / d, 0.0)
        return np.minimum(c, 1.0)

    lo, hi = 0.0, float(hp.max())
    for _ in range(200):
        mid = (lo + hi) / 2
        if cov(mid).sum() > k:
            lo = mid
        else:
            hi = mid
    c = cov(hi)
    # spend any slack (only when coverage saturates at 1) uniformly on the rest
    slack = k - c.sum()
    if slack > 1e-12:
        room = 1 - c
        c = c + room * slack / room.sum()
    return c


def worst(h, d, c):
    v = h * (1 - c * d)
    j = int(np.argmax(v))
    return float(v[j]), j


def knapsack(h, d, k, theta):
    order = np.argsort(-h)
    c, left = np.zeros_like(h), float(k)
    for j in order:
        need = min(1.0, theta / d[j]) if d[j] > 0 else 1.0
        if left >= need - 1e-12:
            c[j], left = need, left - need
        else:
            c[j], left = left, 0.0
            break
    return c


def knapsack_random(h, d, k, theta, reps=2000, seed=0):
    """Post hoc: the same concentrated coverage (theta per covered segment) in a random order, ignoring harm."""
    rng = np.random.default_rng(seed)
    tot = 0.0
    for _ in range(reps):
        perm = rng.permutation(len(h))
        tot += game_b_harm(h[perm], d[perm], knapsack(np.arange(len(h), 0, -1.0), d[perm], k, theta), theta)[0]
    return tot / reps


def game_b_harm(h, d, c, theta):
    stall = c * d < theta - 1e-12
    return float(np.sum(h[stall] * (1 - c[stall] * d[stall]))), int(stall.sum())


def main():
    R = json.load(open(os.path.join(HERE, "results.json")))
    N = R["N"]
    out, summ = [], {}
    p = out.append
    p(f"Milestone 82. N = {N} segments of s = {R['S']}; cheat = full stall of one segment; harms are paired"
      " (stalled minus honest held-out loss, same seed).")
    seeds = sorted(R["schedules"]["cosine"]["test"], key=int)
    p(f"test seeds {len(seeds)} (halves 0-19 and 20-39); calibration seeds per schedule"
      f" {len(R['schedules']['cosine']['cal'])}.")
    for name, sc in R["schedules"].items():
        H = harms(sc, seeds)
        h, se = H.mean(0), H.std(0, ddof=1) / np.sqrt(len(seeds))
        cal16 = max(max(v["fp16"]) for v in sc["cal"].values())
        calro = max(max(v["reorder"]) for v in sc["cal"].values())
        f16 = np.array([[r["fp16"] for r in sc["test"][s]["single"]] for s in seeds])
        ro = np.array([[r["reorder"] for r in sc["test"][s]["single"]] for s in seeds])
        det = ((f16 > cal16) & (ro > 10 * calro)).mean(0)
        honest = np.array([sc["test"][s]["honest"] for s in seeds])
        hA, hB = harms(sc, HALF_A).mean(0), harms(sc, HALF_B).mean(0)
        q = N // 4
        p("")
        p(f"== {name}: lr at segment starts {sc['lr'][0]:.4g} .. {sc['lr'][-1]:.4g}; honest held-out loss"
          f" {honest.mean():.4f} (s.d. {honest.std(ddof=1):.4f})")
        p(f"  detection: honest calibration max fp16 {cal16:.3g}, reorder {calro:.3g}; stalled segment min fp16"
          f" {f16.min():.3g} ({f16.min() / cal16:.1f}x the honest max), min reorder {ro.min():.3g}"
          f" ({ro.min() / calro:.3g}x); d_j min {det.min():.3f}, mean {det.mean():.3f}")
        jm = int(np.argmax(h))
        p(f"  harm profile: max {h[jm]:+.3e} (s.e. {se[jm]:.1e}) at segment {jm}; quarter means"
          f" {' '.join(f'{h[i * q:(i + 1) * q].mean():+.2e}' for i in range(3))} {h[3 * q:].mean():+.2e}"
          f" (segments 0-17, 18-35, 36-53, 54-74)")
        p(f"  last quarter (56-74): max {h[56:].max():+.2e} = {h[56:].max() / h[jm]:.3f} of the max;"
          f" last-quarter mean / first-quarter mean {h[56:].mean() / h[:q].mean():.3f};"
          f" cooldown 60-74 mean / 0-59 mean {h[60:].mean() / h[:60].mean():.3f}")
        p(f"  segments with harm above 2 s.e.: {int((h > 2 * se).sum())} of {N};"
          f" share of total positive harm in the top 10 segments {np.sort(np.maximum(h, 0))[-10:].sum() / np.maximum(h, 0).sum():.3f}")
        p("  segment   harm      s.e.     (every 5th)")
        for j in range(0, N, 5):
            p(f"  {j:7d} {h[j]:+.3e} {se[j]:.1e}")
        # additivity
        rat, sset, ssum = [], [], []
        for s in seeds:
            t = sc["test"][s]
            single = [r["loss"] - t["honest"] for r in t["single"]]
            for st in t["sets"]:
                a, b = st["loss"] - t["honest"], sum(single[j] for j in st["segs"])
                sset.append(a), ssum.append(b)
                if abs(b) > 1e-6:
                    rat.append(a / b)
        sset, ssum = np.array(sset), np.array(ssum)
        p(f"  additivity, {len(sset)} five-segment sets: sum(set harm)/sum(single harms) {sset.sum() / ssum.sum():.3f};"
          f" per-set ratio median {np.median(rat):.3f}, mean {np.mean(rat):.3f} ({len(rat)} sets with |sum| > 1e-6);"
          f" corr {np.corrcoef(sset, ssum)[0, 1]:.3f}")
        # game A
        p("  game A (saboteur): worst-case undetected harm, uniform vs minimax; in-sample (all 40 seeds) and cross-fit")
        p("      k   uniform    minimax  gain | crossfit A->B: uniform  minimax  gain | B->A: uniform  minimax  gain")
        ga = {}
        for k in KS:
            cu = np.full(N, k / N)
            u, _ = worst(h, det, cu)
            m, jw = worst(h, det, waterfill(h, det, k))
            xs = []
            for hf, he in ((hA, hB), (hB, hA)):
                ue, _ = worst(he, det, cu)
                me, _ = worst(he, det, waterfill(hf, det, k))
                xs.append((ue, me))
            p(f"  {k:5d} {u:.3e} {m:.3e} {u / m:5.2f} |  {xs[0][0]:.3e} {xs[0][1]:.3e} {xs[0][0] / xs[0][1]:5.2f}"
              f" |  {xs[1][0]:.3e} {xs[1][1]:.3e} {xs[1][0] / xs[1][1]:5.2f}")
            ga[k] = {"uniform": u, "minimax": m, "gain": u / m, "crossfit_gain": [x[0] / x[1] for x in xs]}
        # game B
        p("  game B (rational worker, k = 5): expected harm, uniform vs knapsack coverage; total if all stall"
          f" {h.sum():+.3e}")
        p("    B/g theta  uniform    (stalls)  knapsack   (stalls)  gain | crossfit A->B gain, B->A gain"
          " | post hoc: random-order concentrated harm, gain")
        gb = {}
        for bg in BG:
            th, k = 1.0 / bg, 5
            cu = np.full(N, k / N)
            u, nu = game_b_harm(h, det, cu, th)
            cn = knapsack(h, det, k, th)
            n_, nn = game_b_harm(h, det, cn, th)
            xg = []
            for hf, he in ((hA, hB), (hB, hA)):
                ue, _ = game_b_harm(he, det, cu, th)
                ne, _ = game_b_harm(he, det, knapsack(hf, det, k, th), th)
                xg.append(ue / ne if ne > 0 else float("inf"))
            g = u / n_ if n_ > 0 else float("inf")
            rr = knapsack_random(h, det, k, th)
            p(f"  {bg:5d} {th:.3f} {u:+.3e} ({nu:3d})   {n_:+.3e} ({nn:3d}) {g:6.2f} | {xg[0]:6.2f} {xg[1]:6.2f}"
              f" | {rr:+.3e} {u / rr if rr > 0 else float('inf'):6.2f}")
            gb[bg] = {"uniform": u, "knapsack": n_, "stall_uniform": nu, "stall_knapsack": nn, "gain": g, "random_order": rr,
                      "crossfit_gain": xg}
        summ[name] = {"harm": h.tolist(), "se": se.tolist(), "det_min": float(det.min()),
                      "cal_fp16_max": cal16, "cal_reorder_max": calro, "fp16_min": float(f16.min()),
                      "reorder_min": float(ro.min()), "argmax": jm,
                      "additivity": float(sset.sum() / ssum.sum()), "game_a": ga, "game_b": gb}
    p("")
    p("Harm by segment, all schedules (for figure.py):")
    p("  segment  cosine     constant   wsd")
    for j in range(N):
        p(f"  {j:7d} {summ['cosine']['harm'][j]:+.4e} {summ['constant']['harm'][j]:+.4e} {summ['wsd']['harm'][j]:+.4e}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(summ, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    print("\n".join(out[: -N - 3]))


if __name__ == "__main__":
    main()
