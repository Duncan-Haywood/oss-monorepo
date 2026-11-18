"""Milestone 7p: does milestone 7o's arm sweep survive a frame-mass law fitted to listed frames?

7o found that on 48 fixed tunes, lever-2 crashes fall monotonically with the arm until the design stops being valid, and that above
the tuned length the limit is the mass-battery spiral, which runs through the inherited frame law 0.05 + 0.8 L kg (ASSUMED). This
re-runs 7o's full-sizing sweep (`resize`) under frame laws from fit_frames.py (data/frames/frames_hobbyrc.csv), each anchored at the
design's own L so that every design keeps the mass it was tuned with and only the cost of lengthening the arm changes:

  inh:     slope 0.800 kg/m (inherited; reproduces 7o `resize`)
  fam:     slope 0.510 kg/m (one frame design listed in several sizes: GEPRC Mark4 5/6/7, Foxeer Aura V2 Pro DC 5/6)
  xb:      slope 2.273 kg/m (cross-brand fit over 30 open frames, 162-342 mm wheelbase: a frame designed for that size)
and one unanchored law:
  xb_abs:  frame = -0.1309 + 2.273 L kg, the cross-brand fit itself, so the designs' own-L mass changes too (not retuned).

frame(L) = frame_own + k (L - L0) with frame_own = 0.05 + 0.8 L0 for the anchored laws. Grid 0.085-0.150 m in 5 mm steps plus
each design's own L. Margin test, propeller clearance and the $300 cost cap per point and law, as 7o. Held-out 64 episodes, seed
9999, cap on: lever 1 at 45 deg, lever 2 at 20 and 45 deg, lever 3 at 20 deg. Predictions P1-P7 in ../../LOG.md, committed first.
"""
import importlib.util, json, os, sys, time, warnings
from multiprocessing import Pool
import numpy as np

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("m7o", os.path.join(HERE, "..", "m7o_arm_sweep", "run.py"))
O = importlib.util.module_from_spec(spec); spec.loader.exec_module(O)
A, M6, L7, P, H, GEOMS = O.A, O.M6, O.L7, O.P, O.H, O.GEOMS
SMOKE = os.environ.get("SMOKE") == "1"
TEST_EP = 8 if SMOKE else M6.TEST_EP
TEST_SEED = 4242 if SMOKE else M6.TEST_SEED
SEEDS = 2 if SMOKE else M6.SEEDS
O.SEEDS = SEEDS
LAW = json.load(open(os.path.join(HERE, "frame_law.json")))
SLOPES = {"inh": 0.8, "fam": LAW["family_strict"]["k_kg_per_m_of_L"], "xb": LAW["cross_brand"]["model_units"]["frame_k_kg_per_m"]}
XB_ABS = (LAW["cross_brand"]["model_units"]["frame0_kg"], LAW["cross_brand"]["model_units"]["frame_k_kg_per_m"])
MODES = ("inh", "fam", "xb", "xb_abs")
GRID = [round(0.085 + 0.005 * i, 3) for i in range(14)]
CONDS = O.CONDS
SIZING_ONLY = os.environ.get("SIZING_ONLY") == "1"


def set_law(mode, L0):
    if mode == "inh":   # exact constants: 0.05 + 0.8 L0 - 0.8 L0 is not bit-exact, and a sub-micron change flips marginal flights (7o)
        A.FRAME0, A.FRAME_K = 0.05, 0.8
    elif mode == "xb_abs":
        A.FRAME0, A.FRAME_K = XB_ABS
    else:
        k = SLOPES[mode]; A.FRAME0, A.FRAME_K = 0.05 + 0.8 * L0 - k * L0, k


def reset_law():
    A.FRAME0, A.FRAME_K = 0.05, 0.8


def sweep(label, geom, s, x12, kp_hi):
    x0 = np.array(x12, float)
    L0 = float(O.L_of_u(x0[0]))
    Ls = list(GRID) + [L0]
    X = np.repeat(x0[None], len(Ls), axis=0); X[:-1, 0] = [O.u_of_L(L) for L in GRID]
    D = A.D_RANGE[0] + x0[1] * (A.D_RANGE[1] - A.D_RANGE[0])
    c = M6.cond("aware"); al = c["alpha_max"] * np.clip(x0[2], 0, 1)
    rec = dict(label=label, geom=geom, seed=s, L0=L0, D=float(D), L=Ls, clear=[bool(np.sqrt(2) * L >= 1.05 * D) for L in Ls])
    O.PIN.clear()
    for mode in MODES:
        set_law(mode, L0)
        L7.setup(None, kp_hi)
        rho = H.margin_rho(X, np.full(len(X), A.TWR))
        L7.setup()
        sz = O._size(O.L_of_u(X[:, 0]), D, al, kappa_per_d=c["kappa_per_d"], actuator="hover")
        rec[f"{mode}_rho"] = [float(v) for v in rho]
        rec[f"{mode}_feasible"] = [bool(v) for v in sz["feasible"]]
        rec[f"{mode}_mass"] = sz["mass"].tolist()
        rec[f"{mode}_frame"] = [float(A.frame_mass(L)) for L in Ls]
        rec[f"{mode}_power"] = sz["power"].tolist()
        rec[f"{mode}_cost"] = sz["cost"].tolist()
        rec[f"{mode}_tau_per_weight"] = (sz["tau_max"] / (sz["mass"] * A.G)).tolist()
        if not SIZING_ONLY:
            for t, lev in CONDS:
                L7.setup(t, kp_hi, None)
                J, _, o = P.score(X, TEST_EP, TEST_SEED, parts=True, dist_sign=GEOMS[geom], lever_scale=lev, ff=1.0, ff_mode="integ",
                                  perr_max=L7.perr_of(X, True), **M6.cond("aware"))
                k = f"{mode}_{t:g}_{lev:g}"
                rec[f"dead_{k}"] = [int(round(float(v) * TEST_EP)) for v in o["dead"]]
                rec[f"J_{k}"] = [float(v) for v in J]
            L7.setup()
        reset_law()
    return rec


def ok(r, mode, j):
    return r[f"{mode}_rho"][j] < 1.0 and r[f"{mode}_feasible"][j]


def summarise(out):
    labs = ["7e", "7l t45 cap wide", "aware cap wide", "aware cap wide fixL"]
    lines = [f"Milestone 7p: 7o's arm sweep under four frame-mass laws, L = {GRID[0]}-{GRID[-1]} m (5 mm) plus own L; {SEEDS} seeds x 2 geometries per set.",
             f"Laws: inh slope 0.800, fam {SLOPES['fam']:.3f}, xb {SLOPES['xb']:.3f} kg/m (anchored at own L); xb_abs = {XB_ABS[0]:.4f} + {XB_ABS[1]:.3f} L kg.",
             f"Held-out {TEST_EP} episodes (seed {TEST_SEED}), cap on. 'ok' = margin test passed and feasible under that law; dead summed over ok seeds.", ""]
    for g in GEOMS:
        for lab in labs:
            rs = [r for r in out if r["label"] == lab and r["geom"] == g]
            if not rs: continue
            lines.append(f"[{g}, {lab}] own L mean {np.mean([r['L0'] for r in rs]):.4f} m")
            if not SIZING_ONLY:
                lines.append("  own L, L2-45 dead: " + "; ".join(f"{m} {sum(r[f'dead_{m}_45_2'][-1] for r in rs if ok(r, m, -1))} ({sum(ok(r, m, -1) for r in rs)} ok)" for m in MODES))
            lines.append("  L      " + "  ".join(f"{m:>6s}:ok mass   pow" for m in MODES) + ("   L2-45 dead " + " ".join(f"{m:>6s}" for m in MODES) if not SIZING_ONLY else ""))
            for L in GRID:
                i = [r["L"].index(L) for r in rs]
                row = f"  {L:.3f}  "
                for m in MODES:
                    row += f"  {sum(ok(r, m, j) for r, j in zip(rs, i))}/{len(rs)} {np.mean([r[f'{m}_mass'][j] for r, j in zip(rs, i)]):5.3f} {np.mean([r[f'{m}_power'][j] for r, j in zip(rs, i)]):5.0f}"
                if not SIZING_ONLY:
                    row += "    " + " ".join(f"{sum(r[f'dead_{m}_45_2'][j] for r, j in zip(rs, i) if ok(r, m, j)):6d}" for m in MODES)
                lines.append(row)
            lines.append("")
    return lines


if __name__ == "__main__":
    t0 = time.time()
    jobs = O.sets()
    with Pool() as p:
        out = p.starmap(sweep, jobs, chunksize=1)
    lines = summarise(out)
    lines.append(f"wall time {time.time() - t0:.0f} s")
    sfx = "_sizing" if SIZING_ONLY else ("_smoke" if SMOKE else "")
    open(os.path.join(HERE, f"results{sfx}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(grid=GRID, conds=CONDS, modes=MODES, slopes=SLOPES, xb_abs=XB_ABS, test_ep=TEST_EP, test_seed=TEST_SEED, runs=out),
              open(os.path.join(HERE, f"results{sfx}.json"), "w"), indent=1)
    print("\n".join(lines))
