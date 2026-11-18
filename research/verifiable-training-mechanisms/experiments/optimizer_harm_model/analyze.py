"""Milestone 85 analysis: does the schedule harm model of milestone 84 hold under momentum SGD and Adam?

Reads results.json (run.py). Rules fixed in LOG.md before the run:
  h_j       paired mean over test seeds 0-39 of (loss after stalling segment j) - (honest loss)
  P_seg(j)  summed schedule learning rate of segment j;  P_rem(j) summed from j's start to T
  P_eff(j)  mean over the referee's honest runs (seeds 100-109, same schedule) of segment j's sum of lr * RMS(update)
  levels    momentum: c_SGD = 2.661e-4 (milestone 82), not refitted; Adam: c_A = mean harm / mean P_seg on the constant
            schedule, seeds 100-109 (and c_A,eff the same with P_eff); momentum's own constant reported for (M3)
  game A    saboteur, detection d = 1 assumed; coverage water-filled on the model, on h (in-sample oracle), uniform
Run: python3 analyze.py   (numpy). Writes results.txt and summary.json."""
import importlib.util
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, "..", rel))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m82a = _load("m82_analyze", "harm_weighted_sampling/analyze.py")

C_SGD = 2.661e-4
KS = (5, 20)
TEST = [str(s) for s in range(40)]


def corr(a, b):
    if np.std(a) == 0 or np.std(b) == 0:
        return float("nan")
    return float(np.corrcoef(a, b)[0, 1])


def harms(block, seeds):
    return np.array([[v - block["runs"][s]["honest"] for v in block["runs"][s]["single"]] for s in seeds])


def nrmse(pred, h):
    return float(np.sqrt(np.mean((pred - h) ** 2)) / h.mean())


def game_a(h, pred, k):
    d = np.ones_like(h)
    u = m82a.worst(h, d, np.full(len(h), k / len(h)))[0]
    mo = m82a.worst(h, d, m82a.waterfill(pred, d, k))[0]
    orc = m82a.worst(h, d, m82a.waterfill(h, d, k))[0]
    return {"uniform": u, "model": mo, "oracle": orc, "gain_model": u / mo, "gain_oracle": u / orc}


LOW = os.path.join(HERE, "results_adam_lr1e-3.json")
TAKEN = os.path.join(HERE, "results_adam_lr1e-3_taken.json")
TAKEN4 = os.path.join(HERE, "results_adam_taken.json")


def reliability(blk):
    A, B = TEST[:20], TEST[20:]
    ha, hb, H = harms(blk, A).mean(0), harms(blk, B).mean(0), harms(blk, TEST)
    h = H.mean(0)
    seg = np.asarray(blk["seg_lr"])
    r = corr(ha, hb)
    return (r, 2 * r / (1 + r), float(H.std(0, ddof=1).mean() / h.mean()), corr(h, seg),
            corr(h.reshape(-1, 5).mean(1), seg.reshape(-1, 5).mean(1)), float(h.sum()))


def main():
    R = json.load(open(os.path.join(HERE, "results.json")))
    N, S = R["N"], R["S"]
    out, summ = [], {"adam_total": R["adam_total"], "opts": {}}
    p = out.append
    p(f"Milestone 85. N = {N} segments of s = {S}; cheat = full stall of one segment (weights and optimiser moments"
      " frozen); harm = stalled minus honest held-out loss, paired by seed, test seeds 0-39.")
    p(f"Momentum: EMA heavy ball beta 0.9, schedules sum to 150. Adam: (0.9, 0.999, 1e-8), schedules sum to"
      f" {R['adam_total']}.")
    p("")
    levels = {}
    cal_seeds = sorted(R["opts"]["adam"]["constant"]["runs"])
    for o in ("momentum", "adam"):
        blk = R["opts"][o]["constant"]
        h = harms(blk, cal_seeds).mean(0)
        seg = np.asarray(blk["seg_lr"])
        eff = np.mean([blk["runs"][s]["eff"] for s in cal_seeds], 0)
        levels[o] = {"c_seg": float(h.mean() / seg.mean()), "c_eff": float(h.mean() / eff.mean()),
                     "sum_h": float(h.sum()), "eff_over_seg": float(eff.sum() / seg.sum())}
        p(f"Level from the constant schedule, seeds 100-109, {o}: c per unit schedule lr {levels[o]['c_seg']:.4g},"
          f" per unit effective step {levels[o]['c_eff']:.4g}; sum of harms {h.sum():.4e};"
          f" effective/schedule step {levels[o]['eff_over_seg']:.3f}")
    p(f"  (M3) momentum constant / c_SGD = {levels['momentum']['c_seg'] / C_SGD:.3f} (predicted 0.85 to 1.15)")
    summ["levels"] = levels
    p("")
    p("Shape and level on the test schedules:")
    p("  opt       schedule  honest   sum(h)      corr(h,Pseg) corr(h,Prem) corr(h,Peff)  sum/pred  nRMSE(seg)"
      " nRMSE(eff)")
    prof = {}
    for o in ("momentum", "adam"):
        summ["opts"][o] = {}
        c_seg = C_SGD if o == "momentum" else levels["adam"]["c_seg"]
        c_eff = levels[o]["c_eff"]
        for sc, blk in R["opts"][o].items():
            if sc == "constant":
                continue
            H = harms(blk, TEST)
            h, se = H.mean(0), H.std(0, ddof=1) / np.sqrt(len(TEST))
            seg = np.asarray(blk["seg_lr"])
            rem = np.cumsum(seg[::-1])[::-1]
            eff = np.mean(list(blk["cal_eff"].values()), 0)
            pseg, peff = c_seg * seg, c_eff * eff
            honest = float(np.mean([blk["runs"][s]["honest"] for s in TEST]))
            row = {"harm": h.tolist(), "se": se.tolist(), "seg_lr": seg.tolist(), "eff": eff.tolist(),
                   "pred_seg": pseg.tolist(), "pred_eff": peff.tolist(), "honest": honest,
                   "corr_seg": corr(h, seg), "corr_rem": corr(h, rem), "corr_eff": corr(h, eff),
                   "sum": float(h.sum()), "sum_over_pred": float(h.sum() / pseg.sum()),
                   "nrmse_seg": nrmse(pseg, h), "nrmse_eff": nrmse(peff, h)}
            summ["opts"][o][sc] = row
            prof[(o, sc)] = (h, pseg, peff)
            p(f"  {o:9s} {sc:8s} {honest:.4f} {h.sum():.4e} {row['corr_seg']:12.3f} {row['corr_rem']:12.3f}"
              f" {row['corr_eff']:12.3f} {row['sum_over_pred']:9.3f} {row['nrmse_seg']:10.3f} {row['nrmse_eff']:10.3f}")
    p("")
    p("Position tests (P1):")
    for o in ("momentum", "adam"):
        h = prof[(o, "warmcos")][0]
        a, b = h[0:4].mean(), h[8:15].mean()
        h2 = prof[(o, "sgdr")][0]
        a2, b2 = h2[33:37].mean(), h2[38:42].mean()
        hs = prof[(o, "step")][0]
        summ["opts"][o]["position"] = {"warmcos": float(a / b), "sgdr": float(a2 / b2),
                                       "step": float(hs[38:].mean() / hs[:37].mean())}
        p(f"  {o:9s} warmcos 0-3 / 8-14 = {a / b:.3f} (pred < 0.5); sgdr 33-36 / 38-41 = {a2 / b2:.3f} (pred < 0.25);"
          f" step low/high half = {hs[38:].mean() / hs[:37].mean():.3f} (schedule 1/3)")
    p("")
    p("Game A (saboteur, d = 1 assumed): worst-case undetected harm, coverage water-filled on the model vs uniform vs"
      " in-sample oracle.")
    p("  opt       schedule  k   uniform    model(Pseg) oracle     gain: seg   eff  oracle  half-of-oracle(seg)")
    cells = held = half = 0
    for (o, sc), (h, pseg, peff) in prof.items():
        summ["opts"][o][sc]["game_a"] = {}
        for k in KS:
            g = game_a(h, pseg, k)
            ge = game_a(h, peff, k)
            ok_half = g["gain_model"] >= 1 + 0.5 * (g["gain_oracle"] - 1)
            cells += 1
            held += g["gain_model"] > 1
            half += ok_half
            g["gain_eff"] = ge["gain_model"]
            summ["opts"][o][sc]["game_a"][k] = g
            p(f"  {o:9s} {sc:8s} {k:3d} {g['uniform']:.3e} {g['model']:.3e}  {g['oracle']:.3e}  {g['gain_model']:5.2f}"
              f" {ge['gain_model']:5.2f} {g['gain_oracle']:6.2f}  {'yes' if ok_half else 'no'}")
    p(f"  model gain > 1 in {held} of {cells} cells; at least half the oracle's gain in {half} of {cells}")
    summ["game_a_counts"] = {"cells": cells, "gain_gt_1": held, "half_oracle": half}
    p("")
    p("After the run (declared in LOG.md after the outcome was read): is each harm profile reproducible across seeds?")
    p("  split-half r = correlation of h over seeds 0-19 with h over 20-39; rel(40) its Spearman-Brown step-up;")
    p("  spread = mean over segments of the per-seed sd of the single harm, over mean harm; block5 = corr(h, P_seg)")
    p("  on 15 blocks of 5 segments.")
    summ["reliability"] = {}
    extra = {}
    for lab, fn in ((" taken", TAKEN4), (" lr1e-3", LOW), (" 1e-3 taken", TAKEN)):
        if os.path.exists(fn):
            extra[lab] = json.load(open(fn))
    for label, RR in [("", R)] + list(extra.items()):
        p(f"  opt       schedule        split-half r  rel(40)  spread  corr(h,Pseg)  block5  sum(h)")
        for o in RR["opts"]:
            for sc, blk in RR["opts"][o].items():
                if sc == "constant":
                    continue
                r, rel, spread, cs, b5, tot = reliability(blk)
                summ["reliability"][f"{o}{label}/{sc}"] = {"split_half": r, "rel40": rel, "spread": spread,
                                                           "corr_seg": cs, "block5": b5, "sum": tot}
                p(f"  {o + label:15s} {sc:8s} {r:12.3f} {rel:8.3f} {spread:7.2f} {cs:12.3f} {b5:7.3f}  {tot:.3e}")
    if " lr1e-3" in extra and " 1e-3 taken" in extra:
        p("")
        p("Adam at mean lr 1e-3, harm by segment (for figure.py): bias-correction counter on the global step (global)")
        p("or frozen by the stall (taken), and the schedule model scaled to each profile's own sum (shape only).")
        p("  seg  cos_global cos_taken  cos_model  wc_global  wc_taken   wc_model")
        cols = []
        for sc in ("cosine", "warmcos"):
            hg = harms(extra[" lr1e-3"]["opts"]["adam"][sc], TEST).mean(0)
            ht = harms(extra[" 1e-3 taken"]["opts"]["adam"][sc], TEST).mean(0)
            seg = np.asarray(extra[" lr1e-3"]["opts"]["adam"][sc]["seg_lr"])
            cols += [hg, ht, seg * ht.sum() / seg.sum()]
        for j in range(N):
            p(f"  {j:3d} " + " ".join(f"{c[j]:+.3e}" for c in cols))
    p("")
    p("Harm by segment, measured and models (main run):")
    keys = sorted(prof)
    p("  seg " + " ".join(f"{o[:3]}-{sc}:h,seg,eff" for o, sc in keys))
    for j in range(N):
        p(f"  {j:3d} " + " ".join(f"{prof[k][0][j]:+.3e},{prof[k][1][j]:.3e},{prof[k][2][j]:.3e}" for k in keys))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(summ, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    print("\n".join(l for l in out if not l[:5].strip().isdigit()))


if __name__ == "__main__":
    main()
