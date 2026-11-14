"""Milestone 7g: what makes the margin-constrained designs diverge at twice the trained centre-of-pressure lever?

Milestone 7f found that tightening the attitude-integral bound below 0.8x the linear ceiling stops helping: at lever 2 (outside
training) the `above` designs diverge on 4 of 384 held-out flights at the 20 deg tilt-command limit and 12-13 at 45 deg, at every
M >= 1.25. Milestone 7e found the same in the `below` geometry (45 of 384), where the margin does not bind at all. Candidates:
saturation in the attitude-priority mixer, a plain lack of torque authority against a gust torque that doubles with the lever,
the 60 deg tilt bound that counts as divergence (a recoverable excursion scored as a crash), or the outer position loop.

No training: the designs are milestone 7b's `integ retrained` (unconstrained), milestone 7e's `constrained` (M = 1.25, both
geometries) and milestone 7f's M = 1.43 and 1.67 (above). Each is re-run on the 64 held-out episodes (seed 9999), lever 2, side
force on, integrator feed-forward, at tilt-command limits 20 and 45 deg, under one probe at a time (`poshold.rollout`):
base; dead_tilt 85 deg; ideal mixer; ideal mixer with 2x torque room; position gains x0.5. The base run records per episode why it
died (tilt or position), the share of alive steps and the peak of gust torque over the plant's torque limit, and the saturation
shares. Predictions G1-G8 in ../../LOG.md, written and committed before this was run on the held-out seed.
"""
import json, os, sys, time, warnings
from multiprocessing import Pool
import numpy as np

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m6_poshold"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import run as M6  # noqa: E402
from codesign_cant import aero as A, poshold as P  # noqa: E402

SMOKE = os.environ.get("SMOKE") == "1"
TEST_EP = 8 if SMOKE else M6.TEST_EP
TEST_SEED = 4242 if SMOKE else M6.TEST_SEED   # the smoke run never touches the held-out seed
LEVER = 2.0
CAPS = (20.0, 45.0)
PROBES = {"base": {}, "dead85": dict(dead_tilt_deg=85.0), "ideal mixer": dict(mixer_ideal=True),
          "ideal mixer, 2x torque": dict(mixer_ideal=True, torque_room=2.0), "pos gains x0.5": dict(pos_scale=0.5)}
DIAG_KEYS = ("dead_why", "gust_over_tmax", "gust_peak", "mix_rp", "tilt_at_clip", "integ_at_clip", "t_dead")


def designs():
    """(set label, geometry, seed, x) for every design re-run here."""
    out = []
    for r in json.load(open(os.path.join(HERE, "..", "m7b_integ", "results.json")))["runs"]:
        if r["label"] == "integ retrained":
            out.append(("unconstrained", r["geom"], r["seed"], r["x"]))
    for r in json.load(open(os.path.join(HERE, "..", "m7e_margin", "results.json")))["runs"]:
        if r["label"] == "constrained":
            out.append(("M=1.25", r["geom"], r["seed"], r["x"]))
    for r in json.load(open(os.path.join(HERE, "..", "m7f_sweep", "results.json")))["runs"]:
        if r["label"] in ("M=1.43", "M=1.67"):
            out.append((r["label"], "above", r["seed"], r["x"]))
    return [d for d in out if d[2] < M6.SEEDS]


def sizes(xs):
    x = np.asarray(xs, float)
    L = A.L_RANGE[0] + x[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0]); D = A.D_RANGE[0] + x[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
    c = M6.cond("aware")
    sz = A.size(L, D, c["alpha_max"] * np.clip(x[:, 2], 0, 1), kappa_per_d=c["kappa_per_d"], actuator="hover")
    return sz, P.phys_gains(x[:, 3:12]), c["kappa_per_d"] * D


def job(arg):
    geom, cap, probe = arg
    P.TILT_CMD_MAX = np.deg2rad(cap)              # module constant read by rollout at call time; this worker process only
    ds = [d for d in designs() if d[1] == geom]
    sz, g, kap = sizes([d[3] for d in ds])
    diag = {}
    o = P.rollout(sz, g, kap, TEST_EP, TEST_SEED, dist_sign=P.cop_signs(1.0 if geom == "above" else -1.0), lever_scale=LEVER,
                  ff=1.0, ff_mode="integ", diag=diag, **PROBES[probe])
    return dict(geom=geom, cap=cap, probe=probe, labels=[d[0] for d in ds], seeds=[d[2] for d in ds],
                dead=o["dead_ep"].astype(int).tolist(), pos=o["pos"].tolist(),
                diag={k: np.asarray(diag[k]).tolist() for k in DIAG_KEYS})


def summarise(outs):
    pl = A.plant_draw("wide", TEST_EP, TEST_SEED)
    L = [f"Milestone 7g: lever {LEVER:g}, {TEST_EP} held-out episodes (seed {TEST_SEED}), integrator feed-forward, side force on.",
         "dead = diverged episodes summed over the 6 seeds (of 384); per probe, one change from base.",
         "Diagnosis (base run): why = deaths by tilt / by position; peak = gust torque / plant torque limit, peak over the episode,",
         "median over diverged (D) and surviving (S) episodes; over = share of D (and S) episodes with the gust torque above the limit",
         "at some alive step; mix, tilt = median share of alive steps with the mixer scaling roll/pitch, tilt command at its limit.", ""]
    for geom in ("above", "below"):
        for lab in ("unconstrained", "M=1.25", "M=1.43", "M=1.67"):
            rows = [o for o in outs if o["geom"] == geom]
            if not rows or lab not in rows[0]["labels"]:
                continue
            L.append(f"[{geom}, {lab}]")
            for cap in CAPS:
                cells = []
                for probe in PROBES:
                    o = next(r for r in rows if r["cap"] == cap and r["probe"] == probe)
                    i = [k for k, l in enumerate(o["labels"]) if l == lab]
                    cells.append(f"{probe} {int(np.asarray(o['dead'])[i].sum())}")
                L.append(f"  cap {cap:2g}: dead " + "; ".join(cells))
                o = next(r for r in rows if r["cap"] == cap and r["probe"] == "base")
                i = [k for k, l in enumerate(o["labels"]) if l == lab]
                dg = {k: np.asarray(v)[i] for k, v in o["diag"].items()}
                D = np.asarray(o["dead"])[i].astype(bool); S = ~D
                why = dg["dead_why"][D]
                med = lambda a, m: f"{np.median(a[m]):.2f}" if m.any() else "-"
                L.append(f"          why tilt {int((why == 1).sum())} / pos {int((why == 2).sum())}; peak D {med(dg['gust_peak'], D)} S {med(dg['gust_peak'], S)}; "
                         f"over D {np.mean(dg['gust_peak'][D] > 1) if D.any() else float('nan'):.2f} S {np.mean(dg['gust_peak'][S] > 1):.2f}; "
                         f"mix D {med(dg['mix_rp'], D)} S {med(dg['mix_rp'], S)}; tilt D {med(dg['tilt_at_clip'], D)} S {med(dg['tilt_at_clip'], S)}")
                if D.any():
                    ep = np.nonzero(D)[1]
                    L.append(f"          diverged episodes' plant: torque scale {np.median(pl['tau'][ep]):.2f} (all {np.median(pl['tau']):.2f}), "
                             f"mass {np.median(pl['mass'][ep]):.2f} ({np.median(pl['mass']):.2f}), lag {np.median(pl['lag'][ep]):.2f} ({np.median(pl['lag']):.2f}); "
                             f"distinct episodes {len(set(ep.tolist()))}")
            L.append("")
    return L


if __name__ == "__main__":
    t0 = time.time()
    jobs = [(g, c, p) for g in ("above", "below") for c in CAPS for p in PROBES]
    with Pool() as p:
        outs = p.map(job, jobs, chunksize=1)
    lines = summarise(outs) + [f"wall time {time.time() - t0:.0f} s"]
    tag = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{tag}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(lever=LEVER, caps=CAPS, probes=list(PROBES), test_seed=TEST_SEED, episodes=TEST_EP, runs=outs),
              open(os.path.join(HERE, f"results{tag}.json"), "w"))
    print("\n".join(lines))
