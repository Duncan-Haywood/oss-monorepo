"""Milestone 7j: why do the retrained `above` designs diverge with no gust torque at all (lever 0) when the tilt command may reach 45 deg?

Milestones 7h and 7i found it and left it unexplained: at lever 0 the centre of pressure sits on the centre of mass, so the gust
exerts drag but no torque, and yet at the 45 deg tilt-command limit (PX4's MPC_TILTMAX_AIR default) milestone 7h's `free` designs
diverge on 9 of 384 held-out flights, 7i's `aware TWR=2.0` on 3 and `aware TWR free` on 12, where 7e's constrained designs, trained
the same way at lever 1 with thrust-to-weight 2, diverge on none. All of them pass the linear stability test with margin 1.25.
7h's guess was the larger propellers' slower motors (lag ~ D^1.5).

No training. The designs are the 24 `above` and 24 `below` designs scored in milestone 7i (7e, 7h free, aware TWR=2.0, aware TWR free,
6 seeds each), re-run on the 64 held-out episodes (seed 9999), side force on, integrator feed-forward, at lever 0, tilt-command limits
30 and 45 deg (20 deg as a control, base only), under one probe at a time:
  base; dead85 (divergence bound 85 deg instead of 60); ideal mixer (no polytope scaling); pos x0.5 (position gains halved);
  side force off (couple=False: the canted rotors' horizontal force removed); ff off (no integrator feed-forward);
  lag x0.9 (every motor 10% faster, about the lag gap between 7h's propellers and 7e's).
The base run records per episode why it died and when (before or after the wind step at 3 s) and the saturation shares.
Predictions J1-J8 in ../../LOG.md, written and committed before this was run on the held-out seed.
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
LEVER = 0.0
SETS = ("7e", "7h free", "aware TWR=2.0", "aware TWR free")
PROBES = {"base": {}, "dead85": dict(dead_tilt_deg=85.0), "ideal mixer": dict(mixer_ideal=True), "pos x0.5": dict(pos_scale=0.5),
          "side force off": dict(couple=False), "ff off": dict(ff=0.0), "lag x0.9": dict(lag_x=0.9)}
JOBS = [(cap, p) for cap in (30.0, 45.0) for p in PROBES] + [(20.0, "base")]
DIAG_KEYS = ("dead_why", "t_dead", "mix_rp", "tilt_at_clip", "integ_at_clip", "ffi_at_clip")
K_STEP = int(P.T_WIND_STEP / A.DT)


def designs():
    """(set, geometry, seed, x12, twr) for the 48 designs milestone 7i scored."""
    rs = json.load(open(os.path.join(HERE, "..", "m7i_aware", "results.json")))["runs"]
    return [(r["label"], r["geom"], r["seed"], r["x"][:12], r["twr"]) for r in rs if r["label"] in SETS]


def sizes(ds):
    x = np.asarray([d[3] for d in ds], float); tw = np.asarray([d[4] for d in ds], float)
    L = A.L_RANGE[0] + x[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0]); D = A.D_RANGE[0] + x[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
    c = M6.cond("aware")
    sz = A.size(L, D, c["alpha_max"] * np.clip(x[:, 2], 0, 1), kappa_per_d=c["kappa_per_d"], twr=tw, actuator="hover")
    return sz, P.phys_gains(x[:, 3:12]), c["kappa_per_d"] * D


def job(arg):
    geom, cap, probe = arg
    P.TILT_CMD_MAX = np.deg2rad(cap)              # module constant read by rollout at call time; this worker process only
    ds = [d for d in designs() if d[1] == geom]
    sz, g, kap = sizes(ds)
    kw = dict(PROBES[probe]); kw.setdefault("ff", 1.0)
    if "lag_x" in kw:                             # the design's motor lag (plant and nominal alike); rollout reads sz["lag"]
        sz = dict(sz); sz["lag"] = sz["lag"] * kw.pop("lag_x")
    diag = {}
    o = P.rollout(sz, g, kap, TEST_EP, TEST_SEED, dist_sign=P.cop_signs(1.0 if geom == "above" else -1.0), lever_scale=LEVER,
                  ff_mode="integ", diag=diag, **kw)
    return dict(geom=geom, cap=cap, probe=probe, sets=[d[0] for d in ds], seeds=[d[2] for d in ds],
                dead=o["dead_ep"].astype(int).tolist(), lag=sz["lag"].tolist(), D=(A.D_RANGE[0] + np.asarray([d[3][1] for d in ds]) * (A.D_RANGE[1] - A.D_RANGE[0])).tolist(),
                diag={k: np.asarray(diag[k]).tolist() for k in DIAG_KEYS})


def summarise(outs):
    pl = A.plant_draw("wide", TEST_EP, TEST_SEED)
    E = TEST_EP * 6
    L = [f"Milestone 7j: lever {LEVER:g} (no gust torque), {TEST_EP} held-out episodes (seed {TEST_SEED}), integrator feed-forward, side force on.",
         f"dead = diverged episodes summed over the 6 seeds (of {E}); each probe is one change from base. Designs: milestone 7i's.",
         "Diagnosis (base run): why = deaths by tilt / by position; when = deaths before / after the wind step at 3 s;",
         "mix, tilt, integ, ffi = median share of alive steps with the mixer scaling roll/pitch, the tilt command at its limit, the attitude",
         "integrator at its clip, the integrator feed-forward at its clip, over diverged (D) and surviving (S) episodes.", ""]
    for geom in ("above", "below"):
        rows = [o for o in outs if o["geom"] == geom]
        for st in SETS:
            i = [k for k, s in enumerate(rows[0]["sets"]) if s == st]
            lag = np.asarray(rows[0]["lag"])[i]; Dm = np.asarray(rows[0]["D"])[i]
            L.append(f"[{geom}, {st}] D {Dm.mean():.4f} m; nominal lag {1e3 * lag.mean():.2f} ms ({', '.join(f'{1e3 * v:.2f}' for v in lag)})")
            for cap in (20.0, 30.0, 45.0):
                cells = []
                for probe in PROBES:
                    o = next((r for r in rows if r["cap"] == cap and r["probe"] == probe), None)
                    if o is None: continue
                    d = np.asarray(o["dead"])[i]
                    cells.append(f"{probe} {int(d.sum())}")
                L.append(f"  cap {cap:2g}: dead " + "; ".join(cells))
                o = next(r for r in rows if r["cap"] == cap and r["probe"] == "base")
                dg = {k: np.asarray(v)[i] for k, v in o["diag"].items()}
                Dd = np.asarray(o["dead"])[i].astype(bool); S = ~Dd
                L.append(f"          per seed {np.asarray(o['dead'])[i].sum(1).tolist()}")
                if not Dd.any():
                    continue
                why = dg["dead_why"][Dd]; td = dg["t_dead"][Dd]
                med = lambda a, m: f"{np.median(a[m]):.2f}" if m.any() else "-"
                L.append(f"          why tilt {int((why == 1).sum())} / pos {int((why == 2).sum())}; when before {int((td < K_STEP).sum())} / after {int((td >= K_STEP).sum())} "
                         f"(median {np.median(td) * A.DT:.2f} s); mix D {med(dg['mix_rp'], Dd)} S {med(dg['mix_rp'], S)}; tilt D {med(dg['tilt_at_clip'], Dd)} S {med(dg['tilt_at_clip'], S)}; "
                         f"integ D {med(dg['integ_at_clip'], Dd)} S {med(dg['integ_at_clip'], S)}; ffi D {med(dg['ffi_at_clip'], Dd)} S {med(dg['ffi_at_clip'], S)}")
                ep = np.nonzero(Dd)[1]
                L.append(f"          diverged episodes' plant: torque scale {np.median(pl['tau'][ep]):.2f} (all {np.median(pl['tau']):.2f}), "
                         f"mass {np.median(pl['mass'][ep]):.2f} ({np.median(pl['mass']):.2f}), lag {np.median(pl['lag'][ep]):.2f} ({np.median(pl['lag']):.2f}); "
                         f"distinct episodes {len(set(ep.tolist()))}")
            L.append("")
    return L


if __name__ == "__main__":
    t0 = time.time()
    jobs = [(g, c, p) for g in ("above", "below") for c, p in JOBS]
    with Pool() as p:
        outs = p.map(job, jobs, chunksize=1)
    lines = summarise(outs) + [f"wall time {time.time() - t0:.0f} s"]
    tag = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{tag}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(lever=LEVER, probes=list(PROBES), test_seed=TEST_SEED, episodes=TEST_EP, runs=outs),
              open(os.path.join(HERE, f"results{tag}.json"), "w"))
    print("\n".join(lines))
