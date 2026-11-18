"""Milestone 5: do the co-designed vehicles keep their ranking in RotorPy with canted rotors? (H5)

The 60 designs of milestone 4 (PID, INDI and geometric laws x cant bound {0, 80 deg} x 10 seeds; each the best of three CMA-ES
starts, trained in the stylised simulator) are re-scored, unchanged and without retuning, on the same held-out task (2 s of
+-15/15/30 deg attitude steps, wide plant randomisation, the stylised wind process; first 32 episodes of seed 9999 regenerated
at 32) in four RotorPy conditions (src/codesign_cant/rotorpy_twin.py):
  torque    RotorPy rigid body (quaternions, gyroscopic terms), first-order motor *speed* dynamics with thrust ~ w^2, the canted
            wrench, an altitude loop; aero off; the stylised gust torque kg v|v| injected on roll and pitch.
  aero      RotorPy aero on, scaled from its Hummingbird: rotor drag (H force) and induced inflow in each canted rotor's frame,
            translational lift, frame drag at the centre of mass; the stylised wind state as a world wind. No injected torque.
  aero_cop  as aero, frame drag acting at the stylised centre-of-pressure lever (0.05 + 0.3 L) above the centre of mass.
  aero_cop2 as aero_cop with the rotor-drag, inflow and translational-lift coefficients doubled (their scaling is assumed).
J = -RMS - 0.3 P_hover / 100 W as in milestone 4. H5 is refuted if Spearman rho of the top ten (by stylised J) is below 0.5.
Predictions in ../../LOG.md, written before this was run.
"""
import json, os, sys, time, warnings
from multiprocessing import Pool
import numpy as np
from scipy.stats import spearmanr

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from codesign_cant import aero as A, rotorpy_twin as RT  # noqa: E402

M4 = json.load(open(os.path.join(HERE, "..", "m4_controllers", "results.json")))
C, LAM = M4["c"], M4["lam"]
EP, SEED = int(os.environ.get("M5_EP", 32)), 9999
MODES = {"torque": ("torque", 0.0, 1.0), "aero": ("aero", 0.0, 1.0), "aero_cop": ("aero", "lever", 1.0), "aero_cop2": ("aero", "lever", 2.0)}
ONLY = os.environ.get("M5_ONLY")          # smoke runs: a comma list of design indices


def sized(r):
    x = np.array(r["x"])
    L = A.L_RANGE[0] + x[0] * (A.L_RANGE[1] - A.L_RANGE[0])
    D = A.D_RANGE[0] + x[1] * (A.D_RANGE[1] - A.D_RANGE[0])
    alpha = np.deg2rad(max(r["cap"], 1e-9)) * np.clip(x[2], 0, 1)
    sz = A.size(np.array([L]), np.array([D]), np.array([alpha]), 0.0, C, None, "hover")
    return x, sz, {k: (v[0] if np.ndim(v) else v) for k, v in sz.items()}


def stylised(i):
    r = M4["runs"][i]; x, sz, _ = sized(r)
    cond = dict(alpha_max=np.deg2rad(max(r["cap"], 1e-9)), kappa_per_d=C, actuator="hover", mixer="prio", lam=LAM, ctrl=r["ctrl"])
    J, _, ax = A.score(x[None, :3], x[None, 3:], EP, SEED, per_axis=True, **cond)
    return dict(J=float(J[0]), rms=float(np.sqrt((ax[0] ** 2).mean())), axis=ax[0].tolist(), dead=None)


def rotorpy(args):
    i, mode = args
    r = M4["runs"][i]; x, sz, szi = sized(r)
    kind, h, scale = MODES[mode]
    prm = RT.design_params(sz, 0, C * float(sz["D"][0]), aero_scale=scale)
    h_cp = float(szi["lever"]) if h == "lever" else h
    gains = A.ctrl_gains(x[3:], r["ctrl"])[0]
    refs, plant = A.reference(EP, SEED), A.plant_draw("wide", EP, SEED)
    sse, dead, t0 = np.zeros(3), 0, time.time()
    for e in range(EP):
        s, alive = RT.episode(prm, szi, gains, r["ctrl"], e, refs, plant, mode=kind, h_cp=h_cp)
        sse += s; dead += (not alive)
    ax = np.rad2deg(np.sqrt(sse / (A.STEPS * EP)))
    rms = float(np.sqrt((ax ** 2).mean()))
    return i, mode, dict(J=float(-rms - LAM * float(szi["power"]) / 100.0), rms=rms, axis=ax.tolist(), dead=dead, sec=round(time.time() - t0, 1))


def rho(a, b):
    return float(spearmanr(a, b).statistic)


def summarise(out, idx):
    runs = M4["runs"]
    sty = [out[i]["stylised"]["J"] for i in idx]
    top = sorted(idx, key=lambda i: -out[i]["stylised"]["J"])[:10]
    lines = [f"Milestone 5: {len(idx)} milestone-4 designs re-scored in RotorPy 3.0.0 with canted rotors; {EP} held-out episodes (seed {SEED}); J = -RMS - {LAM} P/100 W",
             "Spearman rho of J against the stylised simulator (H5: top ten by stylised J, refuted below 0.5); mean RMS deg; divergent episodes",
             "condition    rho all   rho top10  rho top10 (RMS)  mean RMS  mean |dRMS| vs stylised  divergent episodes"]
    for m in ["stylised"] + list(MODES):
        J = [out[i][m]["J"] for i in idx]
        rr = rho(sty, J) if m != "stylised" else 1.0
        rt = rho([out[i]["stylised"]["J"] for i in top], [out[i][m]["J"] for i in top]) if m != "stylised" else 1.0
        rtr = rho([out[i]["stylised"]["rms"] for i in top], [out[i][m]["rms"] for i in top]) if m != "stylised" else 1.0
        mr = np.mean([out[i][m]["rms"] for i in idx])
        dr = np.mean([abs(out[i][m]["rms"] - out[i]["stylised"]["rms"]) for i in idx])
        dead = sum(out[i][m]["dead"] or 0 for i in idx)
        lines.append(f"{m:10s}  {rr:7.3f}   {rt:7.3f}    {rtr:7.3f}        {mr:7.2f}   {dr:7.2f}                  {dead}")
    lines += ["", "top ten by stylised J: " + ", ".join(f"{runs[i]['ctrl']}/{runs[i]['cap']}/s{runs[i]['seed']}" for i in top)]
    lines += ["", "Per law and cant bound: mean RMS deg (stylised; torque; aero; aero_cop; aero_cop2)"]
    for c in ("pid", "indi", "geo"):
        for cap in (0, 80):
            sel = [i for i in idx if runs[i]["ctrl"] == c and runs[i]["cap"] == cap]
            if sel:
                lines.append(f"  {c:4s} cant<= {cap:2d} (n={len(sel)}): " + "; ".join(f"{np.mean([out[i][m]['rms'] for i in sel]):6.2f}" for m in ["stylised"] + list(MODES)))
    lines += ["", "Cant minus no cant, paired by seed, same law (RMS deg; negative = cant better; count of seeds where cant is better)"]
    for c in ("pid", "indi", "geo"):
        pairs = [(i, j) for i in idx for j in idx if runs[i]["ctrl"] == runs[j]["ctrl"] == c and runs[i]["cap"] == 80 and runs[j]["cap"] == 0 and runs[i]["seed"] == runs[j]["seed"]]
        if not pairs:
            continue
        parts = []
        for m in ["stylised"] + list(MODES):
            d = [out[i][m]["rms"] - out[j][m]["rms"] for i, j in pairs]
            parts.append(f"{m} {np.mean(d):+.2f} ({sum(v < 0 for v in d)}/{len(d)})")
        lines.append(f"  {c:4s}: " + "; ".join(parts))
    lines += ["", "H4 refutation test in each condition: INDI without cant minus PID with cant (RMS deg; count where INDI-no-cant is better)"]
    pairs = [(i, j) for i in idx for j in idx if runs[i]["ctrl"] == "indi" and runs[i]["cap"] == 0 and runs[j]["ctrl"] == "pid" and runs[j]["cap"] == 80 and runs[i]["seed"] == runs[j]["seed"]]
    if pairs:
        lines.append("  " + "; ".join(f"{m} {np.mean([out[i][m]['rms'] - out[j][m]['rms'] for i, j in pairs]):+.2f} ({sum(out[i][m]['rms'] < out[j][m]['rms'] for i, j in pairs)}/{len(pairs)})" for m in ["stylised"] + list(MODES)))
    return lines


if __name__ == "__main__":
    idx = [int(v) for v in ONLY.split(",")] if ONLY else list(range(len(M4["runs"])))
    out = {i: {"stylised": stylised(i)} for i in idx}
    jobs = [(i, m) for i in idx for m in MODES]
    jobs.sort(key=lambda j: -(M4["runs"][j[0]]["ctrl"] == "indi"))
    with Pool(int(os.environ.get("M5_PROCS", os.cpu_count()))) as p:
        for i, m, res in p.imap_unordered(rotorpy, jobs):
            out[i][m] = res
            print(i, m, res["rms"], res["dead"], res["sec"], flush=True)
    lines = summarise(out, idx)
    tag = "" if not ONLY else "_smoke"
    open(os.path.join(HERE, f"results{tag}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(ep=EP, seed=SEED, modes=MODES, designs=[dict(i=i, ctrl=M4["runs"][i]["ctrl"], cap=M4["runs"][i]["cap"], seed=M4["runs"][i]["seed"],
              alpha_deg=M4["runs"][i]["alpha_deg"], **{m: out[i][m] for m in out[i]}) for i in idx]),
              open(os.path.join(HERE, f"results{tag}.json"), "w"), indent=1)
    print("\n".join(lines))
