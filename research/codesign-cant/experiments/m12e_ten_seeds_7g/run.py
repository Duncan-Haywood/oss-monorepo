"""Milestone 12e: section VI's authority result (milestone 7g and its headroom follow-up) at ten seeds.

Milestone 7g re-flew six seeds of each integrator feed-forward set at twice the trained centre-of-pressure lever and found
every divergence to be a tilt-over that an ideal mixer mostly removes and an ideal mixer with 25-50% more torque room removes
entirely. Section VI quotes those counts. This script repeats them at ten seeds per set with the same probes.

Designs (no change to any milestone's code):
- above: unconstrained (7b `integ retrained`), M = 1.25 (7e), 1.43 and 1.67 (7f) at seeds 0-5 as 7g read them; seeds 6-9 are
  milestone 12b's trained designs (best of two starts), already scored there at lever 2 under the base rollout;
- below: unconstrained (7b) and M = 1.25 (7e) at seeds 0-5; seeds 6-9 are trained here with 7b's and 7e's own `one`
  (3200 CMA-ES evaluations, 16 training episodes on seed 100 + s, starts 0.4 and 0.8): 16 CMA-ES runs.
Reproduction checks first: 7e below seed 0 start 0 retrained must give its stored best training score; 7b below seed 0
retrained (both starts) must give its stored design; the base counts of seeds 0-5 must equal 7g's stored per-design counts;
the above seeds 6-9 base counts must equal 12b's stored lever-2 counts.

Scoring: 64 held-out episodes (seed 9999), lever 2, side force on, integrator feed-forward, tilt-command limits 20 and 45 deg,
under 7g's probes and the headroom follow-up's in one table. Predictions ME0-ME8 in ../../LOG.md, committed before the full run.
SMOKE=1: new seeds 6 and 7 only, 64 evaluations, 4 training episodes, scored on 8 episodes of seed 4242 (never 9999).
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


G = _load("m7g_run", "m7g_lever2")     # 7g: designs(), sizes(), DIAG_KEYS, LEVER, CAPS; imports milestone 6 as `run`
E = _load("m7e_run", "m7e_margin")     # 7e: one() with the linear-margin constraint
B = _load("m7b_run", "m7b_integ")      # 7b: one() unconstrained
M6, P, A = G.M6, G.P, G.A

SMOKE = os.environ.get("SMOKE") == "1"
NEW_SEEDS = (6, 7) if SMOKE else (6, 7, 8, 9)
TEST_EP = 8 if SMOKE else M6.TEST_EP
TEST_SEED = 4242 if SMOKE else M6.TEST_SEED
if SMOKE:
    for m in (E, B):
        m.BUDGET, m.TRAIN_EP = 64, 4
SETS = [("above", "unconstrained"), ("above", "M=1.25"), ("above", "M=1.43"), ("above", "M=1.67"),
        ("below", "unconstrained"), ("below", "M=1.25")]
PROBES = {"base": {}, "dead85": dict(dead_tilt_deg=85.0), "pos gains x0.5": dict(pos_scale=0.5),
          "airmode": dict(mix_mode="free"), "airmode, 1.5x torque": dict(mix_mode="free", torque_room=1.5),
          "ideal mixer": dict(mixer_ideal=True),
          **{f"ideal mixer, {r:g}x torque": dict(mixer_ideal=True, torque_room=r) for r in (1.25, 1.5, 2.0)}}


def train_below():
    jobs = [("e", ("below", s, k)) for s in NEW_SEEDS for k in range(len(M6.STARTS))]
    jobs += [("b", ("below", s, k)) for s in NEW_SEEDS for k in range(len(M6.STARTS))]
    if not SMOKE:
        jobs = [("e", ("below", 0, 0)), ("b", ("below", 0, 0)), ("b", ("below", 0, 1))] + jobs
    with Pool() as p:
        out = p.map(_train, jobs, chunksize=1)
    return out


def _train(job):
    which, a = job
    r = (E if which == "e" else B).one(a)
    return dict(arm="M=1.25" if which == "e" else "unconstrained", geom=r[0], seed=r[1], start=r[2], best=r[3], x=r[4])


def all_designs(train):
    """[(set label, geom, seed, x)]: 7g's six seeds, 12b's above seeds 6-9, the below seeds 6-9 trained here."""
    out = list(G.designs())
    t12 = json.load(open(os.path.join(EXP, "m12b_ten_seeds_vi", "results.json")))["train"]
    for lab in ("unconstrained", "M=1.25", "M=1.43", "M=1.67"):
        for s in NEW_SEEDS:
            b = max((t for t in t12 if t["arm"] == lab and t["seed"] == s), key=lambda t: t["best"])
            out.append((lab, "above", s, b["x"]))
    for lab in ("unconstrained", "M=1.25"):
        for s in NEW_SEEDS:
            b = max((t for t in train if t["arm"] == lab and t["seed"] == s), key=lambda t: t["best"])
            out.append((lab, "below", s, b["x"]))
    return out


def job(arg):
    geom, cap, probe, ds = arg
    P.TILT_CMD_MAX = np.deg2rad(cap)              # module constant read by rollout at call time; this worker process only
    sz, g, kap = G.sizes([d[3] for d in ds])
    diag = {}
    o = P.rollout(sz, g, kap, TEST_EP, TEST_SEED, dist_sign=P.cop_signs(1.0 if geom == "above" else -1.0), lever_scale=G.LEVER,
                  ff=1.0, ff_mode="integ", diag=diag, **PROBES[probe])
    return dict(geom=geom, cap=cap, probe=probe, labels=[d[0] for d in ds], seeds=[d[2] for d in ds],
                dead=o["dead_ep"].astype(int).tolist(), pos=o["pos"].tolist(),
                diag={k: np.asarray(diag[k]).tolist() for k in G.DIAG_KEYS} if probe == "base" else None)


if __name__ == "__main__":
    t0 = time.time()
    train = train_below()
    checks = []
    if not SMOKE:
        e0 = json.load(open(os.path.join(EXP, "m7e_margin", "results.json")))["train"]
        want = [t["best"] for t in e0 if t["geom"] == "below" and t["seed"] == 0 and t["start"] == 0][0]
        got = [t["best"] for t in train if t["arm"] == "M=1.25" and t["seed"] == 0][0]
        checks.append(("7e below seed 0 start 0 best training score", got, want, got == want))
        b7 = [r["x"] for r in json.load(open(os.path.join(EXP, "m7b_integ", "results.json")))["runs"]
              if r["label"] == "integ retrained" and r["geom"] == "below" and r["seed"] == 0][0]
        u0 = max((t for t in train if t["arm"] == "unconstrained" and t["seed"] == 0), key=lambda t: t["best"])
        checks.append(("7b below seed 0 design (max |dx|)", float(np.max(np.abs(np.array(u0["x"]) - np.array(b7)))), 0.0, u0["x"] == b7))
        train = [t for t in train if t["seed"] in NEW_SEEDS]
    ds = all_designs(train)
    jobs = [(g, c, p, [d for d in ds if d[1] == g]) for g in ("above", "below") for c in G.CAPS for p in PROBES]
    with Pool() as p:
        outs = p.map(job, jobs, chunksize=1)
    if not SMOKE:
        g7 = json.load(open(os.path.join(EXP, "m7g_lever2", "results.json")))["runs"]
        bad = 0
        for o in outs:
            if o["probe"] != "base":
                continue
            ref = next(r for r in g7 if r["geom"] == o["geom"] and r["cap"] == o["cap"] and r["probe"] == "base")
            for lab, s, row in zip(o["labels"], o["seeds"], o["dead"]):
                if s < 6:
                    j = [k for k, (l2, s2) in enumerate(zip(ref["labels"], ref["seeds"])) if (l2, s2) == (lab, s)][0]
                    bad += row != ref["dead"][j]
        checks.append(("base per-episode deaths of seeds 0-5 equal 7g's stored (mismatching designs)", bad, 0, bad == 0))
        r12 = {(r["label"], r["seed"]): r for r in json.load(open(os.path.join(EXP, "m12b_ten_seeds_vi", "results.json")))["runs"]}
        bad = 0
        for o in outs:
            if o["probe"] != "base" or o["geom"] != "above":
                continue
            for lab, s, row in zip(o["labels"], o["seeds"], o["dead"]):
                if s in NEW_SEEDS:
                    bad += sum(row) != r12[(lab, s)][f"dead_{o['cap']:g}_2"]
        checks.append(("above seeds 6-9 base deaths equal 12b's stored lever-2 counts (mismatching designs)", bad, 0, bad == 0))
    tag = "_smoke" if SMOKE else ""
    json.dump(dict(lever=G.LEVER, caps=G.CAPS, probes=list(PROBES), sets=SETS, test_seed=TEST_SEED, episodes=TEST_EP,
                   new_seeds=list(NEW_SEEDS), checks=[dict(what=c[0], got=c[1], want=c[2], ok=bool(c[3])) for c in checks],
                   train=train, runs=outs, wall_s=time.time() - t0),
              open(os.path.join(HERE, f"results{tag}.json"), "w"))
    lines = [("CHECK " + ("ok   " if c[3] else "FAIL ") + f"{c[0]}: got {c[1]}, want {c[2]}") for c in checks]
    open(os.path.join(HERE, f"checks{tag}.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"wall time {time.time() - t0:.0f} s")
