"""Milestone 7h: does the selection rule hold away from the one idle setting it was fitted at?

Every rule since 6u was fitted at the central idle setting (PVG 32 neutral, 2 L/min standby, idle at working speed)
and idle share S = 0.38. Here 7g's 14 variants and 196 (shape, drag) cells are rebuilt in 22 conditions: the 18
idle settings of 6j at S = 0.38, and S in {0.20, 0.30, 0.40, 0.50} at the central setting. Rules two, w, o, ow (7g)
are scored three ways per condition:

  (i)   refitted, pooled leave-one-maker-family-out (8 groups), RMS over the 14 diagonals;
  (ii)  frozen: 7g's central pooled ow coefficients applied unchanged to the condition's own features;
  (iii) frozen slopes, own intercept: the central kW_o and k_w slopes, intercept refitted leave-one-maker-family-out.

kW_85 and kW_o are read from each condition's own idle curve; 7e's pick weight w(q) stays the central one. The
central condition must reproduce 7g. Predictions ST1 to ST6 are in LOG.md (7h), registered before any number.

Usage: python gear_pump_settings.py [cache dir] > gear_pump_settings_results.txt
Needs numpy and h5py (cache shared with 5z to 7g). Runs the conditions in parallel (fork); about 10 min on 4 cores.
"""
import multiprocessing as mp
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
import gear_pump_five as g5  # noqa: E402
import gear_pump_shape as gs  # noqa: E402
import gear_pump_chosen as gc  # noqa: E402
import gear_pump_pickdrag as gd  # noqa: E402
import gear_pump_holddrag as gh  # noqa: E402
from excavator_gear_pump import gear_powers  # noqa: E402
from excavator_idle_standby import CENTRAL, SETTINGS, SHARES, S_C  # noqa: E402
from excavator_part_stroke_eta import tables  # noqa: E402
from excavator_loss_below_x0 import LossCurves  # noqa: E402
from excavator_breakeven_geometry import GRID  # noqa: E402

RULES = ("two", "w", "o", "ow")
CHECK_7G = {"two": 0.0084, "w": 0.0069, "o": 0.0062, "ow": 0.0056}
CONDITIONS = [(s, S_C) for s in SETTINGS] + [(CENTRAL, x) for x in SHARES if x != S_C]
K85 = int(round((gc.Q85 - GRID[0]) / 0.5))
_G = {}


def frozen_slope_lofo(cells, keys, grp, feat, b, c):
    """Leave-one-maker-family-out with slopes b (kW_o) and c (k_w) fixed; intercept = mean training residual."""
    err = {}
    for g in sorted(set(grp.values()), key=str):
        train = [cl for cl in cells if grp[cl[0]] != g and grp[cl[1]] != g]
        a = float(np.mean([cells[cl] - b * feat["kwo"][cl[1]] - c * feat["w"][cl[0]] for cl in train]))
        for m in (k for k in keys if grp[k] == g):
            err[m] = cells[(m, m)] - (a + b * feat["kwo"][m] + c * feat["w"][m])
    return err


def condition(j):
    """All scores for condition j (runs in a forked worker; reads the central build from _G)."""
    setting, share = CONDITIONS[j]
    gears, rows, norm, keys, grp, w, qbig, kwf, coef, beta_c = (_G[k] for k in (
        "gears", "rows", "norm", "keys", "grp", "w", "qbig", "kwf", "coef", "beta_c"))
    gs.S_C = share
    idle = {k: gear_powers(g, coef, *setting) for k, g in gears.items()}
    kw = {k: float(idle[k][0][K85]) for k in keys}
    feat = {"kw": kw, "w": kwf,
            "kwo": {k: gh.held_plus_extra(kw[grp[k]], idle[k][0], idle[grp[k]][0], w, qbig[k]) for k in keys}}
    cells = {}
    for f in keys:
        for g in keys:
            sh = gs.shares(rows, lambda x, e, f=f: np.minimum(gs.CAP, e * norm[f][x["i"]]), idle[g])
            cells[(f, g)] = gs.crossing(list(gc.E_GRID), sh)
    out = {"setting": setting, "share": share, "pls": float(idle[keys[0]][1]),
           "kw_range": (min(kw.values()), max(kw.values())), "diag": {k: cells[(k, k)] for k in keys}}
    if any(v is None for v in cells.values()):
        out["none"] = sum(v is None for v in cells.values())
        return out
    out["beta"] = {r: gd.fit(cells, feat, r) for r in RULES}
    out["lofo"] = {r: g5.rms(list(gd.lofo(cells, keys, grp, feat, r).values())) for r in RULES}
    bc = beta_c
    fr = [cells[(k, k)] - (bc[0] + bc[1] * feat["kwo"][k] + bc[2] * kwf[k]) for k in keys]
    out["frozen"] = g5.rms(fr)
    out["frozen_bias"] = float(np.mean(fr))
    out["fslope"] = g5.rms(list(frozen_slope_lofo(cells, keys, grp, feat, bc[1], bc[2]).values()))
    return out


def label(setting, share):
    r, qs, n = setting
    return f"{r:12s} sb {qs:3.1f}  n {n:3.1f}  S {share:.2f}"


def main(cache):
    gears, E, rows, idle, kw, norm, keys, cells = gc.build(cache)
    grp = {k: gc.group(k) for k in keys}
    picks = []
    for f in gc.BASE:
        e = float(gc.E_GRID[int(np.argmin(np.abs(gc.E_GRID - cells[(f, f)])))])
        picks.append(gc.picks(rows, norm[f], e, idle[f])[0])
    allq = np.concatenate(picks)
    qs, cnt = np.unique(allq, return_counts=True)
    w = dict(zip(qs.tolist(), (cnt / cnt.sum()).tolist()))
    qbig = {k: float(gears[grp[k]].qn[-1]) for k in keys}
    kwf = {k: sum(wq * g.eta(q, 150.0) for q, wq in w.items()) / E[k] - 1.0 for k, g in gears.items()}
    kwo = {k: gh.held_plus_extra(kw[grp[k]], idle[k][0], idle[grp[k]][0], w, qbig[k]) for k in keys}
    beta_c = gd.fit(cells, {"kwo": kwo, "w": kwf}, "ow")
    coef = LossCurves(tables()).full[gs.T]
    _G.update(gears=gears, rows=rows, norm=norm, keys=keys, grp=grp, w=w, qbig=qbig, kwf=kwf, coef=coef,
              beta_c=beta_c)
    with mp.get_context("fork").Pool(min(4, os.cpu_count() or 1)) as pool:
        res = pool.map(condition, range(len(CONDITIONS)))

    out = []
    p = out.append
    p("Milestone 7h: 7g's rules across the 18 idle settings of 6j (S = 0.38) and four other idle shares (central "
      "setting); 14 variants, 196 cells per condition")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps and drive loss as gear_pump_stepup.py; neutral readings as "
      "excavator_idle_standby.py)")
    p("")
    p("Central ow coefficients (7g's pooled fit, frozen in (ii) and (iii)): " + ", ".join(f"{x:+.4f}" for x in beta_c))
    p("")
    p("Per condition: LS standby kW; fixed-pump idle kW at 85 L/min over the 14 variants; diagonal E50 mean and range;")
    p("(i) refitted pooled leave-one-maker-family-out diagonal RMS, two / w / o / ow, and ow against two;")
    p("refitted ow slopes (kW_o, k_w); (ii) frozen central ow RMS (mean bias); (iii) frozen slopes, own intercept RMS")
    good = [r for r in res if "lofo" in r]
    for r in res:
        p("  " + label(r["setting"], r["share"]) + f"  LS {r['pls']:.2f}  kW {r['kw_range'][0]:.2f}-{r['kw_range'][1]:.2f}")
        d = [v for v in r["diag"].values() if v is not None]
        if "none" in r:
            p(f"    {r['none']} of 196 cells never cross 50% on the E grid; not scored")
            continue
        lo, b = r["lofo"], r["beta"]["ow"]
        p(f"    E50 mean {np.mean(d):.4f} ({min(d):.4f}-{max(d):.4f});  (i) " +
          " / ".join(f"{lo[x]:.4f}" for x in RULES) + f"  ow/two {lo['ow'] / lo['two'] - 1:+.0%};  slopes "
          f"{b[1]:+.4f}, {b[2]:+.4f};  (ii) {r['frozen']:.4f} ({r['frozen_bias']:+.4f});  (iii) {r['fslope']:.4f}")
    p("")
    cen = next(r for r in res if r["setting"] == CENTRAL and r["share"] == S_C)
    p("Check, central condition against 7g: " + ", ".join(f"{x} {cen['lofo'][x] - v:+.4f}" for x, v in CHECK_7G.items()))
    p("")
    n = len(good)
    rat = np.array([r["lofo"]["ow"] / r["lofo"]["two"] for r in good])
    p(f"Scored conditions: {n} of {len(res)}")
    p(f"  ow / two over conditions: min {rat.min():.2f}, median {np.median(rat):.2f}, max {rat.max():.2f}")
    for x in RULES:
        v = [r["lofo"][x] for r in good]
        p(f"  (i) {x:3s} RMS: median {np.median(v):.4f}, max {max(v):.4f}")
    fz = [r["frozen"] for r in good]
    fs = [r["fslope"] for r in good]
    p(f"  (ii) frozen: median {np.median(fz):.4f}, max {max(fz):.4f}; (iii) frozen slopes: median {np.median(fs):.4f}, "
      f"max {max(fs):.4f}")
    p("")
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    st1 = sum(r["lofo"]["ow"] < r["lofo"]["two"] for r in good)
    st2 = sum(r["lofo"]["ow"] <= 0.8 * r["lofo"]["two"] for r in good)
    st3 = sum(r["beta"]["ow"][1] > 0 for r in good)
    st4 = sum(r["beta"]["ow"][2] < 0 for r in good)
    st5 = sum(r["frozen"] <= 0.010 for r in good)
    st6 = sum(r["fslope"] <= 1.25 * r["lofo"]["ow"] for r in good)
    N = len(res)
    p("Predictions (LOG.md 7h):")
    p(f"  ST1 ow below two-number in all {N} conditions: {ok(st1 == N)} ({st1} of {N})")
    p(f"  ST2 ow at least 20% below two-number in at least 18: {ok(st2 >= 18)} ({st2} of {N})")
    p(f"  ST3 kW_o slope positive in all {N}: {ok(st3 == N)} ({st3} of {N})")
    p(f"  ST4 k_w coefficient negative in all {N}: {ok(st4 == N)} ({st4} of {N})")
    p(f"  ST5 frozen central rule RMS at most 0.010 in at least 11: {ok(st5 >= 11)} ({st5} of {N})")
    p(f"  ST6 frozen slopes, own intercept within 1.25 x refitted ow in at least 18: {ok(st6 >= 18)} ({st6} of {N})")
    p("")
    p("Sources: as gear_pump_holddrag.py; idle settings as excavator_idle_standby.py (6j).")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
