"""Milestone 84 analysis: is harm per segment predicted by the schedule alone, and what does that model buy a referee?

Reads results.json (run.py) and, for the post-hoc check, milestone 82's results.json. Rules fixed in LOG.md before the run:
  h_j        paired mean over test seeds 0-39 of (loss after stalling segment j) - (honest loss)
  d_j        milestone 82's rule (fp16 ratio above the schedule's largest honest one AND reorder ratio above 10x its largest)
  P_seg(j)   summed learning rate of segment j          P_rem(j)  summed learning rate from segment j's start to T
  level      c = 2.661e-4 held-out loss per unit of learning rate, fixed from milestone 82's constant schedule
             (mean harm / 2.0); the absolute prediction is c P_seg(j), never refitted
  game A     saboteur; minimax coverage water-filled on c P_seg (model), on h (in-sample oracle), and cross-fitted
             (fitted on seeds 0-19, evaluated on 20-39, and the reverse); worst case evaluated on the measured h
  game B     per-segment fine, k = 5, B/g = 5 and 10; knapsack ordered by P_seg vs by h (oracle) vs uniform
Run: python3 analyze.py   (numpy). Writes results.txt and summary.json."""
import importlib.util
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("m82_analyze", os.path.join(HERE, "..", "harm_weighted_sampling", "analyze.py"))
m82 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m82)

C_LEVEL = 2.661e-4
KS = (1, 2, 5, 10, 20)
BG = (5, 10)
HALF_A, HALF_B = [str(s) for s in range(20)], [str(s) for s in range(20, 40)]


def predictors(seg_lr):
    seg = np.asarray(seg_lr, dtype=float)
    rem = np.cumsum(seg[::-1])[::-1]
    return seg, rem


def detection(sc, seeds):
    cal16 = max(max(v["fp16"]) for v in sc["cal"].values())
    calro = max(max(v["reorder"]) for v in sc["cal"].values())
    f16 = np.array([[r["fp16"] for r in sc["test"][s]["single"]] for s in seeds])
    ro = np.array([[r["reorder"] for r in sc["test"][s]["single"]] for s in seeds])
    return ((f16 > cal16) & (ro > 10 * calro)).mean(0), f16.min() / cal16, ro.min() / calro


def game_a(h, hA, hB, det, pred, k):
    N = len(h)
    cu = np.full(N, k / N)
    u = m82.worst(h, det, cu)[0]
    mod = m82.worst(h, det, m82.waterfill(pred, det, k))[0]
    ora = m82.worst(h, det, m82.waterfill(h, det, k))[0]
    xs = []
    for hf, he in ((hA, hB), (hB, hA)):
        xs.append(m82.worst(he, det, cu)[0] / m82.worst(he, det, m82.waterfill(hf, det, k))[0])
    # the model evaluated on each half too, so its gain is comparable with the cross-fit's
    xm = [m82.worst(he, det, cu)[0] / m82.worst(he, det, m82.waterfill(pred, det, k))[0] for he in (hB, hA)]
    return {"uniform": u, "model": mod, "oracle": ora, "gain_model": u / mod, "gain_oracle": u / ora,
            "crossfit_gain": xs, "model_gain_halves": xm}


def game_b(h, det, pred, k, bg):
    th = 1.0 / bg
    u = m82.game_b_harm(h, det, np.full(len(h), k / len(h)), th)[0]
    mo = m82.game_b_harm(h, det, m82.knapsack(pred, det, k, th), th)[0]
    orc = m82.game_b_harm(h, det, m82.knapsack(h, det, k, th), th)[0]
    return {"uniform": u, "model": mo, "oracle": orc, "gain_model": u / mo, "gain_oracle": u / orc,
            "share_of_oracle_gain": (u / mo - 1) / (u / orc - 1) if u / orc > 1 else float("nan")}


def corr(a, b):
    """Pearson correlation; nan when either profile is flat (the constant schedule's P_seg)."""
    if np.std(a) == 0 or np.std(b) == 0:
        return float("nan")
    return float(np.corrcoef(a, b)[0, 1])


def main():
    R = json.load(open(os.path.join(HERE, "results.json")))
    R82 = json.load(open(os.path.join(HERE, "..", "harm_weighted_sampling", "results.json")))
    N, S = R["N"], R["S"]
    out, summ = [], {"new": {}, "m82_post_hoc": {}}
    p = out.append
    p(f"Milestone 84. N = {N} segments of s = {S}; cheat = full stall of one segment; harm = stalled minus honest"
      " held-out loss, paired by seed, 40 seeds.")
    p(f"Level constant c = {C_LEVEL:.4g} per unit of summed learning rate (from milestone 82's constant schedule),"
      " not refitted. Predicted sum of the 75 single harms for any schedule summing to 150:"
      f" {C_LEVEL * 150:.4f}.")
    seeds = [str(s) for s in range(40)]
    p("")
    p("Shape and level, new schedules (pre-registered tests):")
    p("  schedule  d_min  fp16min/cal  corr(h,P_seg) corr(h,P_rem)  sum(h)    sum/pred  nRMSE(cP_seg)  nRMSE(best"
      " P_rem fit)")
    profiles = {}
    for name, sc in R["schedules"].items():
        H = m82.harms(sc, seeds)
        h, se = H.mean(0), H.std(0, ddof=1) / np.sqrt(len(seeds))
        det, f16x, rox = detection(sc, seeds)
        seg, rem = predictors(sc["seg_lr"])
        pred = C_LEVEL * seg
        nrmse = float(np.sqrt(np.mean((pred - h) ** 2)) / h.mean())
        brem = float(rem @ h / (rem @ rem))
        nrmse_rem = float(np.sqrt(np.mean((brem * rem - h) ** 2)) / h.mean())
        cs, cr = corr(h, seg), corr(h, rem)
        p(f"  {name:8s} {det.min():5.3f} {f16x:9.1f}x   {cs:12.3f} {cr:13.3f}  {h.sum():.4e} {h.sum() / (C_LEVEL * 150):8.3f}"
          f" {nrmse:13.3f} {nrmse_rem:14.3f}")
        hA, hB = m82.harms(sc, HALF_A).mean(0), m82.harms(sc, HALF_B).mean(0)
        honest = np.array([sc["test"][s]["honest"] for s in seeds])
        profiles[name] = (h, se, pred, det, hA, hB)
        summ["new"][name] = {"harm": h.tolist(), "se": se.tolist(), "seg_lr": seg.tolist(), "pred": pred.tolist(),
                             "corr_seg": cs, "corr_rem": cr, "sum": float(h.sum()), "nrmse": nrmse,
                             "nrmse_rem_fit": nrmse_rem, "d_min": float(det.min()), "fp16_over_cal": float(f16x),
                             "reorder_over_cal": float(rox), "honest_mean": float(honest.mean())}
    p("")
    p("Position tests:")
    h = profiles["warmcos"][0]
    a, b = h[0:4].mean(), h[8:15].mean()
    p(f"  warmcos: mean harm segments 0-3 {a:+.3e}, segments 8-14 {b:+.3e}, ratio {a / b:.3f} (predicted < 0.5);"
      f" model ratio {profiles['warmcos'][2][0:4].mean() / profiles['warmcos'][2][8:15].mean():.3f}")
    summ["warmcos_ratio"] = float(a / b)
    h = profiles["sgdr"][0]
    a, b = h[33:37].mean(), h[38:42].mean()
    p(f"  sgdr: mean harm segments 33-36 {a:+.3e}, segments 38-41 {b:+.3e}, ratio {a / b:.3f} (predicted < 0.25);"
      f" model ratio {profiles['sgdr'][2][33:37].mean() / profiles['sgdr'][2][38:42].mean():.3f}")
    summ["sgdr_ratio"] = float(a / b)
    h = profiles["step"][0]
    p(f"  step: mean harm segments 0-36 {h[:37].mean():+.3e}, 38-74 {h[38:].mean():+.3e}, ratio"
      f" {h[38:].mean() / h[:37].mean():.3f} (model 1/3: segment learning rate 1.0 against 3.0)")
    summ["step_ratio"] = float(h[38:].mean() / h[:37].mean())
    p("")
    p("Game A (saboteur): worst-case undetected harm on the measured h; coverage from the model c P_seg (no cheat runs),")
    p("from h itself (in-sample oracle) and cross-fitted on half the seeds (milestone 82's method, needs cheat runs).")
    p("  schedule   k   uniform    model     oracle    gain: model oracle | crossfit A->B B->A | model on halves")
    for name, (h, se, pred, det, hA, hB) in profiles.items():
        summ["new"][name]["game_a"] = {}
        for k in KS:
            g = game_a(h, hA, hB, det, pred, k)
            summ["new"][name]["game_a"][k] = g
            p(f"  {name:8s} {k:3d} {g['uniform']:.3e} {g['model']:.3e} {g['oracle']:.3e}   {g['gain_model']:5.2f}"
              f" {g['gain_oracle']:5.2f}  |   {g['crossfit_gain'][0]:5.2f} {g['crossfit_gain'][1]:5.2f}"
              f" |  {g['model_gain_halves'][0]:5.2f} {g['model_gain_halves'][1]:5.2f}")
    p("")
    p("Game B (per-segment fine, k = 5): expected harm under uniform, knapsack by the model, knapsack by h (oracle).")
    p("Additive harms, as milestone 82 (milestone 83: large stall sets are superadditive, so the uniform column is"
      " a lower bound and every gain here is understated).")
    p("  schedule B/g  uniform    model      oracle     gain: model oracle  share of oracle gain")
    for name, (h, se, pred, det, hA, hB) in profiles.items():
        summ["new"][name]["game_b"] = {}
        for bg in BG:
            g = game_b(h, det, pred, 5, bg)
            summ["new"][name]["game_b"][bg] = g
            p(f"  {name:8s} {bg:3d} {g['uniform']:+.3e} {g['model']:+.3e} {g['oracle']:+.3e}"
              f"  {g['gain_model']:6.2f} {g['gain_oracle']:6.2f}  {g['share_of_oracle_gain']:8.3f}")
    p("")
    p("Post hoc (the model was motivated by these profiles): milestone 82's three schedules.")
    p("  schedule  corr(h,P_seg) corr(h,P_rem)  sum/pred  nRMSE(cP_seg) | game A k=5: model gain, crossfit gains")
    for name, sc in R82["schedules"].items():
        H = m82.harms(sc, seeds)
        h = H.mean(0)
        lrs = m82_lrs(name)
        seg, rem = predictors(lrs.reshape(N, S).sum(1))
        pred = C_LEVEL * seg
        det = detection(sc, seeds)[0]
        hA, hB = m82.harms(sc, HALF_A).mean(0), m82.harms(sc, HALF_B).mean(0)
        g = game_a(h, hA, hB, det, pred, 5)
        nrmse = float(np.sqrt(np.mean((pred - h) ** 2)) / h.mean())
        p(f"  {name:8s} {corr(h, seg):12.3f} {corr(h, rem):13.3f} {h.sum() / (C_LEVEL * 150):9.3f} {nrmse:13.3f} |"
          f" {g['gain_model']:5.2f}  {g['crossfit_gain'][0]:5.2f} {g['crossfit_gain'][1]:5.2f}")
        summ["m82_post_hoc"][name] = {"corr_seg": corr(h, seg), "corr_rem": corr(h, rem), "nrmse": nrmse,
                                      "game_a_k5": g}
    p("")
    p("Harm by segment, measured and model (for figure.py):")
    p("  segment  step       step_model linear     lin_model  warmcos    wc_model   sgdr       sgdr_model")
    for j in range(N):
        row = " ".join(f"{profiles[n][0][j]:+.3e} {profiles[n][2][j]:+.3e}" for n in ("step", "linear", "warmcos", "sgdr"))
        p(f"  {j:7d} {row}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(summ, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    print("\n".join(out[: -N - 2]))


def m82_lrs(name):
    import run  # this milestone's run.py, which keeps milestone 82's schedule function as m82_sched
    return run.m82_sched(name)


if __name__ == "__main__":
    main()
