"""Milestone 12g: section VI's linear-certificate results (milestones 7c and 7d) at ten seeds per set.

Milestone 7c checked an 11-state linear stability test against six seeds of milestone 7b's design-conditions, milestone 7's
commanded-torque designs and milestone 6b's force-aware designs rescaled to 0.8x and 1.25x their ki ceiling; milestone 7d
(and its post-hoc tilt sweep) asked what holds the test's false alarms bounded. Section VI quotes both at six seeds. This
script repeats them at ten, with the same functions (`../m7c_stab/run.py`, `../m7d_clip/run.py`) and no change to any
milestone's code.

Designs for seeds 6-9:
- `integ retrained` (and the same design with the feed-forward off): milestone 7b's `one`, already trained at seeds 6-9 by
  milestone 12b (above, arm `unconstrained`) and 12f (below, arm `unconstrained`); best of the two starts, read from there;
- `6b aware` (and `6b+integ`, the same design with the integrator feed-forward on, and the 0.8x / 1.25x rescalings):
  milestone 6b's own `one` (arm `aware`), trained here: 4 seeds x 2 geometries x 2 starts = 16 CMA-ES runs;
- `m7 cmd-ff`: milestone 7's own `one` (13 coordinates, tau_ff chosen), trained here: 16 CMA-ES runs.
Every run is milestone 6's CMA-ES (3200 evaluations, popsize 16, 16 training episodes on seed 100 + s, starts 0.4 / 0.8,
CMA seed 100 (s + 1) + k). Reproduction checks first: 6b aware above seed 0 and m7 above seed 0 are retrained (both starts)
and must give their stored designs; the re-scored seeds 0-5 must equal 7c's and 7d's stored per-episode records.
Each training result is cached in `_cache/` (not committed) so an interrupted run resumes.

Then 7c's analysis (spectral radius at each of the 64 held-out plants, seed 9999; divergence at levers 0 and 1; ki
ceilings) and 7d's (clip arms x horizons x levers, saturation shares, linear iteration from the offset; the tilt-command
sweep 20/30/45/59 deg) on all ten seeds. Predictions MG0-MG9 in ../../LOG.md, committed before the full run.
SMOKE=1: new seeds 6 and 7, 64 evaluations, 4 training episodes, scored on 8 episodes of seed 4242 (never 9999).
"""
import importlib.util, json, os, sys, time, warnings
from multiprocessing import Pool
import numpy as np

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..")


def _load(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(EXP, rel, "run.py"))
    m = importlib.util.module_from_spec(spec); sys.modules[name] = m; spec.loader.exec_module(m)
    return m


B6 = _load("m6b_run", "m6b_cop")       # 6b: one((geom, arm, s, k)); imports milestone 6 as `run`
F7 = _load("m7_run", "m7_ff")          # 7: one((geom, s, k)), 13 coordinates
C = _load("m7c_run", "m7c_stab")       # 7c: job(), lin(), confusion()
D = _load("m7d_run", "m7d_clip")       # 7d: sizes(), linear_death(), summarise(), CLIPS, HORIZONS, DIAG_KEYS
M6, P, A, S = B6.M6, B6.P, C.A, C.S

SMOKE = os.environ.get("SMOKE") == "1"
NEW_SEEDS = (6, 7) if SMOKE else (6, 7, 8, 9)
OLD_SEEDS = range(6)
if SMOKE:
    for m in (B6, F7):
        m.BUDGET, m.TRAIN_EP = 64, 4
    for m in (C, D):
        m.TEST_EP, m.TEST_SEED = 8, 4242
CACHE = os.path.join(HERE, "_cache_smoke" if SMOKE else "_cache")
GEOMS = ("above", "below")
TILT_CAPS = (20.0, 30.0, 45.0, 59.0)
SETS7D = D.SETS


def _train(job):
    fam, geom, s, k = job
    os.makedirs(CACHE, exist_ok=True)
    f = os.path.join(CACHE, f"{fam}_{geom}_{s}_{k}.json")
    if os.path.exists(f):
        return json.load(open(f))
    t0 = time.time()
    r = B6.one((geom, "aware", s, k)) if fam == "6b" else F7.one((geom, s, k))
    best, x = (r[4], r[5]) if fam == "6b" else (r[3], r[4])
    out = dict(fam=fam, geom=geom, seed=s, start=k, best=float(best), x=list(x), wall_s=time.time() - t0)
    json.dump(out, open(f, "w"))
    return out


def train():
    jobs = [] if SMOKE else [("6b", "above", 0, 0), ("6b", "above", 0, 1), ("m7", "above", 0, 0), ("m7", "above", 0, 1)]
    jobs += [(fam, g, s, k) for fam in ("6b", "m7") for g in GEOMS for s in NEW_SEEDS for k in range(len(M6.STARTS))]
    with Pool() as p:
        return p.map(_train, jobs, chunksize=1)


def best_of(rows, **kw):
    rs = [r for r in rows if all(r[k] == v for k, v in kw.items())]
    return max(rs, key=lambda r: r["best"])


def conds_for(tr):
    """7c's design-conditions for seeds 0-9: seeds 0-5 as 7c built them (from its stored conds), seeds 6-9 from the new runs."""
    old = json.load(open(os.path.join(EXP, "m7c_stab", "results.json")))["conds"]
    base = [dict(set=c["set"], label=c["label"], geom=c["geom"], seed=c["seed"], x=c["x"], ff=c["ff"], mode=c["mode"], ki_scale=1.0)
            for c in old if c["set"] in ("7b", "7")]
    t12b = json.load(open(os.path.join(EXP, "m12b_ten_seeds_vi", "results.json")))["train"]
    t12f = json.load(open(os.path.join(EXP, "m12f_ten_seeds_7g", "results.json")))["train"]
    for g in GEOMS:
        for s in NEW_SEEDS:
            x6 = best_of(tr, fam="6b", geom=g, seed=s)["x"]
            xi = (best_of(t12b, arm="unconstrained", seed=s) if g == "above" else best_of(t12f, arm="unconstrained", geom="below", seed=s))["x"]
            x7 = best_of(tr, fam="m7", geom=g, seed=s)["x"]
            mk = lambda st, lab, x, ff, mode: dict(set=st, label=lab, geom=g, seed=s, x=x, ff=ff, mode=mode, ki_scale=1.0)
            base += [mk("7b", "6b aware", x6, 0.0, "integ"), mk("7b", "6b+integ", x6, 1.0, "integ"),
                     mk("7b", "integ retrained", xi, 1.0, "integ"), mk("7b", "integ retrained, ff off", xi, 0.0, "integ"),
                     mk("7", "m7 cmd-ff", x7, 1.0, "cmd")]
    for c in base:                                   # 7c main(), part (b), line for line
        dp = S.design_params(np.array([c["x"]]))
        c["kp"], c["ki_kp"] = float(dp["kp"][0]), float(dp["ki"][0] / dp["kp"][0])
        c["ceil"] = float(S.ki_ceiling(dp, 1.0, c["mode"])[0])
        c["stable_corners_off"] = bool(S.worst_radius(dp, 0.0, "integ")[0] < 1.0)
        c["worst_rho"] = float(S.worst_radius(dp, c["ff"], c["mode"])[0])
    conds = list(base)
    for c in [c for c in base if c["label"] == "6b aware"]:      # part (c)
        for mult in (0.8, 1.25):
            if c["ceil"] <= 0 or c["ceil"] >= 4.0:
                continue
            n = dict(c, set="new", label=f"6b+integ, ki {mult}x ceiling", ff=1.0, mode="integ", ki_scale=c["ceil"] * mult, mult=mult)
            dp = S.design_params(np.array([n["x"]]), ki_scale=n["ki_scale"])
            n["worst_rho"] = float(S.worst_radius(dp, 1.0, "integ")[0])
            conds.append(n)
    plant = A.plant_draw("wide", C.TEST_EP, C.TEST_SEED)
    pl = (plant["tau"], plant["mass"], plant["lag"])
    for c in conds:
        c["rho_ep"] = C.lin(c, pl).tolist()
    return conds


def job7d(arg):
    clip, hz, lev, conds = arg
    sz, g, kap = D.sizes(conds)
    ic, fc = D.CLIPS[clip]
    diag = {}
    o = P.rollout(sz, g, kap, D.TEST_EP, D.TEST_SEED, dist_sign=P.cop_signs(1.0), lever_scale=lev, ff=1.0, ff_mode="integ",
                  integ_clip=ic, ffi_clip=fc, steps=D.HORIZONS[hz], diag=diag)
    r4 = lambda a: np.round(np.asarray(a, float), 4).tolist()
    return dict(clip=clip, hz=hz, lev=lev, dead=o["dead_ep"].astype(int).tolist(), pos=r4(o["pos_ep"]),
                t_dead=r4(diag["t_dead"] * A.DT), **{k: r4(diag[k]) for k in D.DIAG_KEYS})


def job_tilt(arg):
    cap, hz, conds = arg
    P.TILT_CMD_MAX = np.deg2rad(cap)                 # module constant read by rollout at call time; this worker process only
    sz, g, kap = D.sizes(conds)
    diag = {}
    o = P.rollout(sz, g, kap, D.TEST_EP, D.TEST_SEED, dist_sign=P.cop_signs(1.0), lever_scale=0.0, ff=1.0, ff_mode="integ",
                  steps=D.HORIZONS[hz], diag=diag)
    return dict(cap=cap, hz=hz, dead=o["dead_ep"].astype(int).tolist(), pos=np.asarray(o["pos_ep"]).round(4).tolist(),
                att=np.asarray(o["att"]).round(4).tolist(), tilt=np.asarray(diag["tilt_at_clip"]).round(4).tolist())


def main():
    t0 = time.time()
    tr = train()
    checks = []
    if not SMOKE:
        for fam, path, lab in (("6b", "m6b_cop", "aware"), ("m7", "m7_ff", "ff retrained")):
            stored = [r for r in json.load(open(os.path.join(EXP, path, "results.json")))["runs"]
                      if r["geom"] == "above" and r["seed"] == 0 and (r.get("arm") == lab and r.get("source") == "retrained" or r.get("label") == lab)][0]["x"]
            got = best_of(tr, fam=fam, geom="above", seed=0)["x"]
            checks.append((f"{fam} above seed 0 retrained design equals stored (max |dx|)", float(np.max(np.abs(np.array(got) - np.array(stored)))), 0.0, got == stored))
        tr = [t for t in tr if t["seed"] in NEW_SEEDS]
    conds = conds_for(tr)
    with Pool() as p:
        outs = p.map(C.job, conds, chunksize=1)
    for c, o in zip(conds, outs):
        c.update(o)
    if not SMOKE:
        old = {(c["set"], c["label"], c["geom"], c["seed"]): c for c in json.load(open(os.path.join(EXP, "m7c_stab", "results.json")))["conds"]}
        bad = sum(1 for c in conds if c["seed"] in OLD_SEEDS and (c["dead_0"] != old[(c["set"], c["label"], c["geom"], c["seed"])]["dead_0"]
                  or c["dead_1"] != old[(c["set"], c["label"], c["geom"], c["seed"])]["dead_1"]))
        checks.append(("7c per-episode deaths of seeds 0-5 equal 7c's stored (mismatching design-conditions)", bad, 0, bad == 0))
        rb = sum(1 for c in conds if c["seed"] in OLD_SEEDS and not np.allclose(c["rho_ep"], old[(c["set"], c["label"], c["geom"], c["seed"])]["rho_ep"], rtol=0, atol=1e-12))
        checks.append(("7c per-plant spectral radii of seeds 0-5 equal 7c's stored (mismatching design-conditions)", rb, 0, rb == 0))
    c7d = sorted([c for c in conds if c["geom"] == "above" and c["label"] in SETS7D], key=lambda c: (list(SETS7D).index(c["label"]), c["seed"]))
    with Pool() as p:
        o7d = p.map(job7d, [(cl, h, l, c7d) for cl in D.CLIPS for h in D.HORIZONS for l in D.LEVERS], chunksize=1)
        otilt = p.map(job_tilt, [(cap, h, c7d) for cap in TILT_CAPS for h in D.HORIZONS], chunksize=1)
    lin_t = D.linear_death(c7d)
    meta = [dict(set=SETS7D[c["label"]], seed=c["seed"], ki_scale=c["ki_scale"], rho_ep=c["rho_ep"], dead_7c_0=c["dead_0"], dead_7c_1=c["dead_1"]) for c in c7d]
    if not SMOKE:
        old7d = json.load(open(os.path.join(EXP, "m7d_clip", "results.json")))
        om = old7d["conds"]
        bad = 0
        for o in o7d:
            ref = next(r for r in old7d["runs"] if (r["clip"], r["hz"], r["lev"]) == (o["clip"], o["hz"], o["lev"]))
            for i, m in enumerate(meta):
                if m["seed"] in OLD_SEEDS:
                    j = [k for k, mm in enumerate(om) if (mm["set"], mm["seed"]) == (m["set"], m["seed"])][0]
                    bad += o["dead"][i] != ref["dead"][j]
        checks.append(("7d per-episode deaths of seeds 0-5 equal 7d's stored, every clip arm, horizon and lever (mismatching rows)", bad, 0, bad == 0))
    tag = "_smoke" if SMOKE else ""
    json.dump(dict(new_seeds=list(NEW_SEEDS), test_ep=C.TEST_EP, test_seed=C.TEST_SEED, tilt_caps=TILT_CAPS,
                   checks=[dict(what=c[0], got=c[1], want=c[2], ok=bool(c[3])) for c in checks], train=tr, conds=conds,
                   m7d=dict(conds=meta, runs=o7d, lin_death=np.where(np.isinf(lin_t), -1, lin_t).tolist(), tilt=otilt),
                   wall_s=time.time() - t0),
              open(os.path.join(HERE, f"results{tag}.json"), "w"))
    lines = [("CHECK " + ("ok   " if c[3] else "FAIL ") + f"{c[0]}: got {c[1]}, want {c[2]}") for c in checks]
    open(os.path.join(HERE, f"checks{tag}.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"wall time {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
