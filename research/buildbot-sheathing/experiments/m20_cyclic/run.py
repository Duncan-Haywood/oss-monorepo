"""Milestone 20: Weiss's wall under the CUREE basic loading history, with pinching (SAWS) fasteners.

    OMP_NUM_THREADS=1 python experiments/m20_cyclic/run.py > experiments/m20_cyclic/results.txt

Milestone 19's wall (``wall_push`` bodies and penalties) with hysteretic fasteners (``wall_cyclic.CyclicWall``):
each sheathing nail an oriented pair of SAWS springs (Folz and Filiatrault 2001; Judd and Fonseca 2005), each
stud-to-plate joint a SAWS spring scaled to m x 1.297 end nails, anchor rods with a gap in a hole that crushes.
H93-H97 were registered in LOG.md before this script was run. H93's numbers come from ops_check.py (OpenSees),
read from ops_check.json. Writes results.json and loops.json beside this file. Needs numpy and scipy; about an
hour on four CPUs.

Nail: Anderson, Leichti, Sutt and Rosowsky (2007), Table 4, 0.113 in nails through 7/16 in OSB into DF-L,
fyb 115 ksi row. History: Krawinkler et al. (2001), CUREE W-02, Sec. 1.1, delta = 0.6 delta_m.
"""
import itertools
import json
import multiprocessing as mp
import os
import platform
import sys
import time

import numpy as np
import scipy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import wall_cyclic as C  # noqa: E402
from buildbot_sheathing import wall_lp as W  # noqa: E402
from buildbot_sheathing import wall_push as P  # noqa: E402
from buildbot_sheathing.budget import IN  # noqa: E402

T0 = time.time()
MM = 1e-3
STEP = 0.5 * MM
MONO = np.arange(1, 301) * STEP                        # monotonic push to 150 mm
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__}}

TEST = {"control 6-12": 4688, "decay 6-12": 2649, "control 3-12": 8775, "decay 3-12": 2974}
KEPT = {6.0: TEST["decay 6-12"] / TEST["control 6-12"], 3.0: TEST["decay 3-12"] / TEST["control 3-12"]}
NDS = 1.2971                                            # milestone 17: F per 16d end nail at the NDS ratio
ROD_K = P.nds_rod_k(0.625)
CAP = 2.55                                              # milestone 18's rod design value, in nail peaks
WALLS = {e: W.weiss_wall(e) for e in (6.0, 3.0)}
KEEP = {e: W.decay_mask(w.xz) for e, w in WALLS.items()}
SETS = {"anderson 115": C.anderson(115), "anderson 87": C.anderson(87), "anderson 145": C.anderson(145),
        "anderson 241": C.anderson(241), "folz-filiatrault": C.folz_filiatrault()}
MAIN = "anderson 115"

M_GRID = [0.25, 0.47, 0.75, 1.0]
LAM_GRID = [0.25, 1.0]
GAP_GRID_IN = [0.0, 1 / 16, 1 / 4]
REG = (1.0, 1.0, 1 / 16)                                # H95, H96: m, lambda, gap (in)


def build(edge, decayed, m, lam, gap_in, nail=MAIN):
    s = SETS[nail]
    cw = C.CyclicWall(WALLS[edge], KEEP[edge] if decayed else None, s, s.scaled(m * NDS, lam),
                      rod_gap=gap_in * IN, rod_k=ROD_K, rod_cap=CAP * s.FU)
    cw.orient()
    return cw, s.FU


def mono(args):
    edge, decayed, m, lam, gap_in, nail = args
    cw, FU = build(edge, decayed, m, lam, gap_in, nail)
    L, res = cw.drive(MONO)
    j = int(np.argmax(L))
    after = np.flatnonzero((np.arange(L.size) > j) & (L < 0.8 * L[j]))
    dm = MONO[after[0]] if after.size else MONO[-1]
    return args, {"peak": float(L[j] / FU), "drift_mm": float(MONO[j] / MM), "delta_m_mm": float(dm / MM),
                  "res": res, "curve": (L[::4] / FU).tolist()}


def radial(args):
    edge, decayed, m, lam, gap_in = args
    s = SETS[MAIN]
    pw = P.PushWall(WALLS[edge], KEEP[edge] if decayed else None, C.FoschiBackbone(s),
                    C.FoschiBackbone(s.scaled(m * NDS, lam)), rod_gap=gap_in * IN, rod_k=ROD_K, rod_cap=CAP * s.FU)
    o = pw.pushover(d_max=0.150, step=STEP)
    L = o["curve"]
    j = int(np.argmax(L))
    after = np.flatnonzero((np.arange(L.size) > j) & (L < 0.8 * L[j]))
    dm = o["drifts"][after[0]] if after.size else o["drifts"][-1]
    return args, {"peak": float(o["peak"] / s.FU), "drift_mm": float(o["drift_at_peak"] / MM),
                  "delta_m_mm": float(dm / MM), "res": o["max_res"]}


def cyclic(args):
    """CUREE basic history at reference delta; stops after the first primary cycle whose largest load (either
    direction) is below 0.8 of the largest so far, or after the 3.0 delta primary and its trailing cycles."""
    edge, decayed, m, lam, gap_in, nail, delta, step, keep_loop = args
    cw, FU = build(edge, decayed, m, lam, gap_in, nail)
    amps, prim = C.curee(delta, max_amp=3.0)
    best_p, best_m = 0.0, 0.0
    loop_d, loop_F = [], []
    worst = 0.0
    nsteps = 0
    stopped = None
    for a, is_p in zip(amps, prim):
        path = C.cycle_path([a], step)
        # continue from the last committed drift (every cycle starts and ends at zero)
        L, res = cw.drive(path)
        worst = max(worst, res)
        nsteps += path.size
        if keep_loop:
            loop_d += (path[::2] / MM).tolist()
            loop_F += (L[::2] / FU).tolist()
        cp, cm = float(L.max()), float(-L.min())
        prev = max(best_p, best_m)
        best_p, best_m = max(best_p, cp), max(best_m, cm)
        if is_p and prev > 0 and max(cp, cm) < 0.8 * prev and a > delta:
            stopped = float(a / delta)
            break
    r = {"peak_pos": best_p / FU, "peak_neg": best_m / FU, "peak": 0.5 * (best_p + best_m) / FU, "res": worst,
         "steps": nsteps, "stopped_at": stopped, "hole": {k: (v / MM).tolist() for k, v in cw.hole.items()}}
    if keep_loop:
        r["loop"] = {"d_mm": loop_d, "F": loop_F}
    return args, r


def _round(x, nd=2):
    """Loops to 0.01 mm and 0.01 FU, to keep loops.json small."""
    if isinstance(x, dict):
        return {k: _round(v, nd) for k, v in x.items()}
    if isinstance(x, list):
        return [_round(v, nd) for v in x]
    return round(float(x), nd)


def pct(x):
    return f"{100 * x:.1f}%"


def run(fn, jobs):
    with mp.Pool(4) as pool:
        return dict(pool.map(fn, jobs, chunksize=1))


if __name__ == "__main__":
    s = SETS[MAIN]
    print("# Milestone 20: Weiss's wall under the CUREE protocol, with pinching nails (buildbot-sheathing)")
    print("Milestone 19's bodies (sill fixed; top plate driven along the wall without rotating; 7 studs, 2 sheets). "
          "Each sheathing nail an oriented pair of SAWS springs; each stud-to-plate joint a SAWS spring of m x 1.297 "
          "nails (displacements x lambda); stiff bearing and hold-down ties; anchor rods with a gap g in a hole that "
          "crushes past the cap (2.55 nail peaks). Loads in units of FU, the nail's envelope peak.\n")
    print("## A. Inputs")
    for name, sw in SETS.items():
        print(f"{name}: K0 {sw.K0 * MM / 1e3:.3f} kN/mm, F0 {sw.F0:.0f} N, FI {sw.FI:.0f} N, Du {sw.Du / MM:.2f} mm, "
              f"r1 {sw.r1}, r2 {sw.r2}, r3 {sw.r3}, r4 {sw.r4}, alpha {sw.alpha}, beta {sw.beta}; FU {sw.FU:.0f} N, "
              f"DINT2 {sw.DINT2 / MM:.2f} mm, DF {sw.DF / MM:.1f} mm")
    print(f"rod: k {ROD_K * MM / 1e3:.1f} kN/mm, cap {CAP} FU; gaps (in) {GAP_GRID_IN}; m {M_GRID}; lambda {LAM_GRID}; "
          f"step {STEP / MM} mm")
    print("history: CUREE basic (W-02 Sec. 1.1), delta = 0.6 delta_m from the intact wall's own monotonic push at the "
          "same joints and gap; decayed walls get their intact wall's delta (one protocol per test group)\n")
    out["inputs"] = {k: vars(v) | {"FU": v.FU} for k, v in SETS.items()}

    # ---------------------------------------------------------------- B. H93
    print("## B. H93: SAWS against OpenSees' SAWSMaterial (ops_check.py), CUREE history, delta = 2 Du")
    oc = json.load(open(os.path.join(HERE, "ops_check.json")))
    for r in oc["rows"]:
        print(f"{r['set']:18s} step {r['step_over_Du']:.3f} Du ({r['points']} points): rms {r['rms']:.1e} FU, "
              f"largest {r['max']:.1e} FU")
    print(f"H93 (rms at most 2% of FU): {'held' if oc['held'] else 'refuted'}\n")
    out["B"] = oc

    # ---------------------------------------------------------------- monotonic grid
    grid = list(itertools.product(M_GRID, LAM_GRID, GAP_GRID_IN))
    walls = [(e, d) for e in (6.0, 3.0) for d in (False, True)]
    mjobs = [(e, d, m, lam, g, MAIN) for (m, lam, g) in grid for (e, d) in walls]
    for (e, d) in walls:                                 # other nail sets at the registered point
        for nail in SETS:
            if nail != MAIN:
                mjobs.append((e, d, *REG, nail))
    M = run(mono, mjobs)
    print(f"monotonic pushes: {len(M)} ({time.time() - T0:.0f} s); largest residual "
          f"{max(v['res'] for v in M.values()):.1e} FU")

    # ---------------------------------------------------------------- C. H94
    print("\n## C. H94: the oriented pair against milestone 19's radial spring, monotonic, m 1, lambda 1, no gap")
    rjobs = [(e, d, 1.0, 1.0, 0.0) for (e, d) in walls] + [(e, d, *REG) for (e, d) in walls]
    RAD = run(radial, rjobs)
    errs = []
    for (e, d) in walls:
        a = M[(e, d, 1.0, 1.0, 0.0, MAIN)]["peak"]
        b = RAD[(e, d, 1.0, 1.0, 0.0)]["peak"]
        errs.append(a / b - 1)
        print(f"{e:.0f}-12 {'decay ' if d else 'intact'}: pair {a:7.3f} FU, radial {b:7.3f} FU ({a / b - 1:+.2%}); "
              f"drift at peak {M[(e, d, 1.0, 1.0, 0.0, MAIN)]['drift_mm']:.1f} against "
              f"{RAD[(e, d, 1.0, 1.0, 0.0)]['drift_mm']:.1f} mm; delta_m {M[(e, d, 1.0, 1.0, 0.0, MAIN)]['delta_m_mm']:.1f} "
              f"against {RAD[(e, d, 1.0, 1.0, 0.0)]['delta_m_mm']:.1f} mm")
    sh_pair = [M[(e, True, 1.0, 1.0, 0.0, MAIN)]["peak"] / M[(e, False, 1.0, 1.0, 0.0, MAIN)]["peak"] for e in (6.0, 3.0)]
    sh_rad = [RAD[(e, True, 1.0, 1.0, 0.0)]["peak"] / RAD[(e, False, 1.0, 1.0, 0.0)]["peak"] for e in (6.0, 3.0)]
    h94 = max(abs(x) for x in errs) <= 0.03
    print(f"shares kept, pair {pct(sh_pair[0])}|{pct(sh_pair[1])}, radial {pct(sh_rad[0])}|{pct(sh_rad[1])}")
    print(f"H94 (within 3% in all four): largest {max(abs(x) for x in errs):.2%}: {'held' if h94 else 'refuted'}\n")
    out["C"] = {"errs": errs, "held": h94, "shares_pair": sh_pair, "shares_radial": sh_rad,
                "radial": {str(k): v for k, v in RAD.items()}}

    # ---------------------------------------------------------------- cyclic runs
    def delta(e, m, lam, g, nail=MAIN):
        return 0.6 * M[(e, False, m, lam, g, nail)]["delta_m_mm"] * MM

    cjobs = []
    for (m, lam, g) in grid:
        for (e, d) in walls:
            cjobs.append((e, d, m, lam, g, MAIN, delta(e, m, lam, g), STEP, (m, lam, g) == REG))
    for (e, d) in walls:
        for nail in SETS:
            if nail != MAIN:
                cjobs.append((e, d, *REG, nail, delta(e, *REG, nail), STEP, False))
        # delta from the radial model's monotonic push (sensitivity)
        cjobs.append((e, d, *REG, MAIN, 0.6 * RAD[(e, False, *REG)]["delta_m_mm"] * MM, STEP + 1e-12, False))
        # step size
        cjobs.append((e, d, *REG, MAIN, delta(e, *REG), 2 * STEP, False))
    cjobs.sort(key=lambda j: -j[6])                      # long runs first
    CY = run(cyclic, cjobs)
    print(f"cyclic runs: {len(CY)} ({time.time() - T0:.0f} s); largest residual {max(v['res'] for v in CY.values()):.1e} FU; "
          f"steps per run {min(v['steps'] for v in CY.values())}-{max(v['steps'] for v in CY.values())}")

    def cy(e, d, m, lam, g, nail=MAIN, which="main"):
        dl = delta(e, m, lam, g, nail)
        if which == "radial_delta":
            dl = 0.6 * RAD[(e, False, m, lam, g)]["delta_m_mm"] * MM
        st = STEP + (1e-12 if which == "radial_delta" else 0) if which != "step" else 2 * STEP
        return CY[(e, d, m, lam, g, nail, dl, st, (m, lam, g) == REG and nail == MAIN and which == "main")]

    def shares(get):
        return [get(e, True)["peak"] / get(e, False)["peak"] for e in (6.0, 3.0)]

    # ---------------------------------------------------------------- D. grid
    print("\n## D. Share kept 6-12 | 3-12 (decay ratio), monotonic -> cyclic; cap 2.55 FU; rows m and lambda, "
          "columns gap (in)")
    print("m     lam  " + "".join(f"{g:>40.4f}" for g in GAP_GRID_IN))
    rows = []
    for m in M_GRID:
        for lam in LAM_GRID:
            line = f"{m:<5} {lam:<4} "
            for g in GAP_GRID_IN:
                mo = shares(lambda e, d: M[(e, d, m, lam, g, MAIN)])
                c = shares(lambda e, d: cy(e, d, m, lam, g))
                rat_c = cy(3.0, True, m, lam, g)["peak"] / cy(6.0, True, m, lam, g)["peak"]
                line += f"   {pct(mo[0])}|{pct(mo[1])} -> {pct(c[0])}|{pct(c[1])} ({rat_c:.2f})"
                rms = float(np.sqrt(((np.array(c) - np.array([KEPT[6.0], KEPT[3.0]])) ** 2).mean()))
                rows.append({"m": m, "lam": lam, "gap_in": g, "mono": mo, "cyclic": c, "ratio_cyclic": rat_c,
                             "rms_cyclic": rms,
                             "peaks_cyclic": {f"{e:.0f}-{'d' if d else 'c'}": cy(e, d, m, lam, g)["peak"] for (e, d) in walls},
                             "peaks_mono": {f"{e:.0f}-{'d' if d else 'c'}": M[(e, d, m, lam, g, MAIN)]["peak"] for (e, d) in walls},
                             "delta_mm": {e: delta(e, m, lam, g) / MM for e in (6.0, 3.0)}})
            print(line)
    print(f"tested: {pct(KEPT[6.0])}|{pct(KEPT[3.0])} (1.12)")
    out["D"] = rows

    # ---------------------------------------------------------------- E. registered checks
    print("\n## E. Registered checks (m 1, lambda 1, gap 1/16 in, cap 2.55 FU)")
    m, lam, g = REG
    ratios = {}
    for e in (6.0, 3.0):
        c, mo = cy(e, False, m, lam, g), M[(e, False, m, lam, g, MAIN)]
        ratios[e] = c["peak"] / mo["peak"]
        print(f"{e:.0f}-12 intact: cyclic {c['peak']:.3f} FU (+{c['peak_pos']:.3f}/-{c['peak_neg']:.3f}), monotonic "
              f"{mo['peak']:.3f} FU ({ratios[e] - 1:+.1%}); delta {delta(e, m, lam, g) / MM:.1f} mm; "
              f"stopped after the {c['stopped_at']} delta primary")
    h95 = all(abs(r - 1) <= 0.10 for r in ratios.values())
    print(f"H95 (intact cyclic within 10% of monotonic): {'held' if h95 else 'refuted'}")
    mo3 = M[(3.0, True, m, lam, g, MAIN)]["peak"] / M[(3.0, False, m, lam, g, MAIN)]["peak"]
    c3 = cy(3.0, True, m, lam, g)["peak"] / cy(3.0, False, m, lam, g)["peak"]
    mo6 = M[(6.0, True, m, lam, g, MAIN)]["peak"] / M[(6.0, False, m, lam, g, MAIN)]["peak"]
    c6 = cy(6.0, True, m, lam, g)["peak"] / cy(6.0, False, m, lam, g)["peak"]
    h96 = abs(c3 - mo3) <= 0.10
    print(f"decayed 6-12 keeps {pct(mo6)} monotonic, {pct(c6)} cyclic; decayed 3-12 keeps {pct(mo3)} monotonic, "
          f"{pct(c3)} cyclic (tested {pct(KEPT[6.0])}, {pct(KEPT[3.0])})")
    print(f"H96 (decayed 3-12 cyclic share within 10 points of monotonic): {(c3 - mo3) * 100:+.1f} points: "
          f"{'held' if h96 else 'refuted'}")
    near = [r for r in rows if r["m"] >= 0.75 and all(abs(a - b) <= 0.10 for a, b in zip(r["cyclic"], [KEPT[6.0], KEPT[3.0]]))]
    h97 = len(near) == 0
    best = min(rows, key=lambda r: r["rms_cyclic"])
    best_hi = min((r for r in rows if r["m"] >= 0.75), key=lambda r: r["rms_cyclic"])
    print(f"H97 (no point with m >= 0.75 within 10 points of both): {len(near)} such points: {'held' if h97 else 'refuted'}")
    for lab, r in (("best overall", best), ("best with m >= 0.75", best_hi)):
        print(f"{lab}: m {r['m']}, lambda {r['lam']}, gap {r['gap_in']:.4f} in: cyclic keeps {pct(r['cyclic'][0])}|"
              f"{pct(r['cyclic'][1])} (rms {100 * r['rms_cyclic']:.1f} points), decay ratio {r['ratio_cyclic']:.2f}; "
              f"monotonic {pct(r['mono'][0])}|{pct(r['mono'][1])}")
    out["E"] = {"ratio_intact": ratios, "h95": h95, "mono_share": [mo6, mo3], "cyclic_share": [c6, c3], "h96": h96,
                "near": near, "h97": h97, "best": best, "best_hi": best_hi}

    # ---------------------------------------------------------------- F. sensitivity
    print("\n## F. Sensitivity at the registered point (not scored)")
    sens = {}
    for nail in SETS:
        if nail == MAIN:
            continue
        c = shares(lambda e, d: cy(e, d, m, lam, g, nail))
        mo = shares(lambda e, d: M[(e, d, m, lam, g, nail)])
        sens[nail] = {"cyclic": c, "mono": mo}
        print(f"{nail:18s}: monotonic {pct(mo[0])}|{pct(mo[1])}, cyclic {pct(c[0])}|{pct(c[1])}")
    c = shares(lambda e, d: cy(e, d, m, lam, g, MAIN, "radial_delta"))
    sens["radial delta"] = c
    print(f"delta from the radial model's push: cyclic {pct(c[0])}|{pct(c[1])}")
    c = shares(lambda e, d: cy(e, d, m, lam, g, MAIN, "step"))
    sens["1 mm step"] = c
    base = shares(lambda e, d: cy(e, d, m, lam, g))
    print(f"1 mm steps: cyclic {pct(c[0])}|{pct(c[1])} (0.5 mm: {pct(base[0])}|{pct(base[1])})")
    for (e, d) in walls:
        h = cy(e, d, m, lam, g)["hole"]
        print(f"{e:.0f}-12 {'decay ' if d else 'intact'}: rod holes at the end (mm) lo {np.round(h['lo'], 2).tolist()}, "
              f"hi {np.round(h['hi'], 2).tolist()} (started at -/+{g * 25.4:.2f})")
    out["F"] = sens

    loops = {f"{e:.0f}-{'decay' if d else 'intact'}": cy(e, d, m, lam, g)["loop"] for (e, d) in walls}
    loops["mono"] = {f"{e:.0f}-{'decay' if d else 'intact'}": M[(e, d, m, lam, g, MAIN)]["curve"] for (e, d) in walls}
    loops["mono_drift_mm"] = (MONO[::4] / MM).tolist()
    json.dump(_round(loops), open(os.path.join(HERE, "loops.json"), "w"), separators=(",", ":"))
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; {os.cpu_count()} CPUs; python {platform.python_version()}, numpy "
          f"{np.__version__}, scipy {scipy.__version__})")
