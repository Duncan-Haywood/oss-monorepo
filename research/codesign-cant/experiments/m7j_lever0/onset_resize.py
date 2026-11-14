"""Milestone 7j addendum (a parallel run's independent implementation, written before it knew of run.py here): the onset
between 30 and 45 deg, lever 1 as well as lever 0, and one probe run.py does not have: the same airframes and gains re-sized at
thrust-to-weight 2.0 ("resized TWR 2.0"), which asks directly whether 7h's free thrust-to-weight is the cause.

The 48 designs of milestone 7i on the 64 held-out episodes (seed 9999), integrator feed-forward, side force on. Base runs at tilt
limits 30, 35, 40, 45 deg and levers 0 and 1; at 45 deg, lever 0, one change at a time (PROBES; all but the re-size repeat run.py's
probes through a separate code path, so they double as a reproduction). Predictions in ../../LOG.md (7j addendum), committed in
PR #15956 before this was run on the held-out seed. Writes onset_resize.txt.
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
SETS = ("7e", "7h free", "aware TWR=2.0", "aware TWR free")
GEOMS = ("above", "below")
BASE_CAPS = (30.0, 35.0, 40.0, 45.0)
BASE_LEVERS = (0.0, 1.0)
PROBE_CAP, PROBE_LEVER = 45.0, 0.0
# probe -> (rollout kwargs, design changes)
PROBES = {"base": ({}, {}), "dead85": (dict(dead_tilt_deg=85.0), {}), "ideal mixer": (dict(mixer_ideal=True), {}),
          "side force off": (dict(couple=False), {}), "ff off": (dict(ff=0.0), {}), "pos gains x0.5": (dict(pos_scale=0.5), {}),
          "lag x0.9": ({}, dict(lag=0.9)), "resized TWR 2.0": ({}, dict(twr2=True))}
DIAG_KEYS = ("dead_why", "t_dead", "mix_rp", "tilt_at_clip", "integ_at_clip", "ffi_at_clip")


def designs(geom):
    rs = json.load(open(os.path.join(HERE, "..", "m7i_aware", "results.json")))["runs"]
    out = sorted((r for r in rs if r["geom"] == geom and r["label"] in SETS), key=lambda r: (SETS.index(r["label"]), r["seed"]))
    return out


def sizes(ds, twr2=False, lag=1.0):
    x = np.asarray([d["x"] for d in ds], float)
    L = A.L_RANGE[0] + x[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0]); D = A.D_RANGE[0] + x[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
    c = M6.cond("aware")
    twr = np.full(len(ds), A.TWR) if twr2 else np.array([d["twr"] for d in ds])
    sz = A.size(L, D, c["alpha_max"] * np.clip(x[:, 2], 0, 1), kappa_per_d=c["kappa_per_d"], twr=twr, actuator="hover")
    sz = dict(sz); sz["lag"] = sz["lag"] * lag
    return sz, P.phys_gains(x[:, 3:12]), c["kappa_per_d"] * D


def job(arg):
    geom, cap, lever, probe = arg
    P.TILT_CMD_MAX = np.deg2rad(cap)              # module constant read by rollout at call time; this worker process only
    ds = designs(geom)
    kw, dz = PROBES[probe]
    sz, g, kap = sizes(ds, **dz)
    diag = {}
    o = P.rollout(sz, g, kap, TEST_EP, TEST_SEED, dist_sign=P.cop_signs(1.0 if geom == "above" else -1.0), lever_scale=lever,
                  **{"ff": 1.0, "ff_mode": "integ", **kw}, diag=diag)
    return dict(geom=geom, cap=cap, lever=lever, probe=probe, labels=[d["label"] for d in ds], seeds=[d["seed"] for d in ds],
                dead=o["dead_ep"].astype(int).tolist(), pos=o["pos"].tolist(), tau_max=sz["tau_max"].tolist(), lag=sz["lag"].tolist(),
                mass=sz["mass"].tolist(), diag={k: np.asarray(diag[k]).tolist() for k in DIAG_KEYS})


def summarise(outs):
    pl = A.plant_draw("wide", TEST_EP, TEST_SEED)
    get = lambda g, c, l, p: next(o for o in outs if o["geom"] == g and o["cap"] == c and o["lever"] == l and o["probe"] == p)
    L = [f"Milestone 7j addendum: the 48 designs of milestone 7i, {TEST_EP} held-out episodes (seed {TEST_SEED}), integrator feed-forward, side force on.",
         "dead = diverged flights summed over the 6 seeds of a set (of 384), per seed in brackets.", ""]
    for geom in GEOMS:
        L.append(f"[{geom}] base runs: dead by tilt-command limit and lever")
        for lev in BASE_LEVERS:
            for lab in SETS:
                cells = []
                for cap in BASE_CAPS:
                    o = get(geom, cap, lev, "base"); i = [k for k, l in enumerate(o["labels"]) if l == lab]
                    d = np.asarray(o["dead"])[i].sum(1)
                    cells.append(f"{cap:g} deg {int(d.sum())} {d.tolist()}")
                L.append(f"  lever {lev:g}, {lab}: " + "; ".join(cells))
        L.append(f"[{geom}] probes at {PROBE_CAP:g} deg, lever {PROBE_LEVER:g} (one change from base)")
        for lab in SETS:
            cells = []
            for probe in PROBES:
                o = get(geom, PROBE_CAP, PROBE_LEVER, probe); i = [k for k, l in enumerate(o["labels"]) if l == lab]
                cells.append(f"{probe} {int(np.asarray(o['dead'])[i].sum())}")
            L.append(f"  {lab}: " + "; ".join(cells))
        o = get(geom, PROBE_CAP, PROBE_LEVER, "base")
        dead = np.asarray(o["dead"]).astype(bool); dg = {k: np.asarray(v) for k, v in o["diag"].items()}
        for lab in SETS:
            i = [k for k, l in enumerate(o["labels"]) if l == lab]
            D = dead[i]; S = ~D
            if not D.any():
                continue
            sub = {k: v[i] for k, v in dg.items()}
            why = sub["dead_why"][D]
            med = lambda a, m: f"{np.median(a[m]):.3f}" if m.any() else "-"
            ep = np.nonzero(D)[1]
            L.append(f"  {lab} diagnosis: why tilt {int((why == 1).sum())} / pos {int((why == 2).sum())}; death time s median "
                     f"{np.median(sub['t_dead'][D]) * A.DT:.2f} (range {sub['t_dead'][D].min() * A.DT:.2f}-{sub['t_dead'][D].max() * A.DT:.2f}); "
                     f"mix D {med(sub['mix_rp'], D)} S {med(sub['mix_rp'], S)}; tilt-limit D {med(sub['tilt_at_clip'], D)} S {med(sub['tilt_at_clip'], S)}; "
                     f"integ clip D {med(sub['integ_at_clip'], D)} S {med(sub['integ_at_clip'], S)}; ffi clip D {med(sub['ffi_at_clip'], D)} S {med(sub['ffi_at_clip'], S)}")
            L.append(f"      plant of diverged flights: torque scale {np.median(pl['tau'][ep]):.2f} (all {np.median(pl['tau']):.2f}), mass {np.median(pl['mass'][ep]):.2f} "
                     f"({np.median(pl['mass']):.2f}), lag {np.median(pl['lag'][ep]):.2f} ({np.median(pl['lag']):.2f}); episodes {sorted(set(ep.tolist()))}")
        L.append("")
    return L


if __name__ == "__main__":
    t0 = time.time()
    jobs = [(g, c, l, "base") for g in GEOMS for c in BASE_CAPS for l in BASE_LEVERS]
    jobs += [(g, PROBE_CAP, PROBE_LEVER, p) for g in GEOMS for p in PROBES if p != "base"]
    with Pool() as p:
        outs = p.map(job, jobs, chunksize=1)
    lines = summarise(outs) + [f"wall time {time.time() - t0:.0f} s"]
    tag = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"onset_resize{tag}.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))
