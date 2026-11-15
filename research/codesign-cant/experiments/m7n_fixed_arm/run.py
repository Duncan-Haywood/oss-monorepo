"""Milestone 7n: is the longer frame arm what buys milestone 7m's lever-2 robustness?

7m trained the lever-aware objective (levers 0, 1, 2) with 7l's wide position-gain box and proportional-request cap. Its designs
(`aware cap wide`) kept most of 7l's stiffness, kept part of the mass, and had a longer frame arm (L 0.106 / 0.110 m against
0.102 / 0.103 m for 7l `t45 cap wide`); they crashed on fewer lever-2 flights than 7l's (53 / 52 against 73 / 105 of 384 at 45 deg
with the cap). 7m read the arm as the one sizing handle that raises torque per weight without mass, but that reading came from
the chosen designs, not a controlled run. Two tests here:

  1. Retrain (`aware cap wide fixL`): 7m's `aware cap wide` training exactly, with the arm pinned at 7l `t45 cap wide`'s mean L
     for that geometry (the pinned coordinate is overwritten before scoring; CMA-ES still carries it, so its search on the other
     11 coordinates is unchanged in form). If the arm buys the robustness, the pinned run should crash about as often as 7l.
  2. Swap (no training): each 7m `aware cap wide` design with only its arm set to the pinned L (`7m short arm`), and each 7l
     `t45 cap wide` design with only its arm set to 7m `aware cap wide`'s mean L for that geometry (`7l long arm`). Paired
     against the unswapped designs: the direct effect of the arm, everything else held.

Held-out: 7m's 26 conditions, 64 episodes, seed 9999. Predictions N1-N7 in ../../LOG.md, written and committed before this was
run at full budget.
"""
import importlib.util, json, os, sys, time, warnings
from multiprocessing import Pool
import numpy as np
import cma

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m6_poshold"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import run as M6  # noqa: E402
from codesign_cant import aero as A  # noqa: E402


def _load(name, sub):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, "..", sub, "run.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


M7 = _load("m7m", "m7m_aware_wide")
H, L7 = M7.H, M7.L7
GEOMS, KP_HI_WIDE, KP_HI_INHERITED = M7.GEOMS, M7.KP_HI_WIDE, M7.KP_HI_INHERITED
SMOKE = os.environ.get("SMOKE") == "1"
M7.SMOKE = SMOKE
BUDGET = 64 if SMOKE else M6.BUDGET
SEEDS = 2 if SMOKE else M6.SEEDS
M7.BUDGET, M7.SEEDS = BUDGET, SEEDS
M7.EP_PER_LEVER = 2 if SMOKE else 6
M7.TEST_EP = 8 if SMOKE else M6.TEST_EP
M7.TEST_SEED = 4242 if SMOKE else M6.TEST_SEED
CACHE = os.path.join(HERE, ".cache_smoke" if SMOKE else ".cache")
ARM = "aware cap wide fixL"
D_START = 0.25


def u_of_L(L):
    return (L - A.L_RANGE[0]) / (A.L_RANGE[1] - A.L_RANGE[0])


def runs(sub):
    return json.load(open(os.path.join(HERE, "..", sub, "results.json")))["runs"]


def mean_L(sub, label):
    return {g: float(np.mean([r["L"] for r in runs(sub) if r["label"] == label and r["geom"] == g])) for g in GEOMS}


L_SHORT = mean_L("m7m_aware_wide", "7l t45 cap wide")   # 7l's arm, the pin
L_LONG = mean_L("m7m_aware_wide", "aware cap wide")      # 7m's arm


def train_one(geom, s, k):
    L7.setup(M7.TRAIN_TILT, KP_HI_WIDE)
    u = u_of_L(L_SHORT[geom])
    x0 = [0.5] * 12; x0[2] = M6.STARTS[k]; x0[0] = u
    x0[1] = D_START   # 7m's start (D 0.165 m) is infeasible at the pinned arm (sqrt(2) L >= 1.05 D), so start the prop at 0.1225 m
    es = cma.CMAEvolutionStrategy(x0, 0.25, {"bounds": [0, 1], "seed": 100 * (s + 1) + k, "popsize": 16, "verbose": -9})
    best, bx, n, ninf = -1e9, None, 0, 0
    while n < BUDGET:
        asked = np.array(es.ask())
        xs = asked.copy(); xs[:, 0] = u
        rho = H.margin_rho(xs, np.full(len(xs), A.TWR))
        ok = rho < 1.0
        ys = -100.0 - 10.0 * np.minimum(rho - 1.0, 10.0)
        if ok.any():
            ys[ok] = M7.train_score(xs[ok], s, geom)
        n += len(xs); ninf += int((~ok).sum()); es.tell(asked.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    L7.setup()
    return ARM, geom, s, k, float(best), bx.tolist(), ninf


def one(args):
    geom, s, k = args
    f = os.path.join(CACHE, f"{geom}_{s}_{k}.json")
    if os.path.exists(f):
        return tuple(json.load(open(f)))
    out = train_one(geom, s, k)
    os.makedirs(CACHE, exist_ok=True)
    json.dump(list(out), open(f + ".tmp", "w")); os.replace(f + ".tmp", f)
    print(f"trained {geom} seed {s} start {k}: best {out[4]:.3f}", flush=True)
    return out


def evaluate(label, geom, s, x12, kp_hi):
    r = M7.evaluate(label, geom, s, x12, kp_hi)
    L7.setup(None, kp_hi)   # the gain map depends on the kp box, so test the margin under the design's own box
    r["margin_rho"] = float(H.margin_rho(np.array(x12, float)[None], np.full(1, A.TWR))[0])
    r["margin_ok"] = r["margin_rho"] < 1.0
    L7.setup()
    return r


def with_L(x, L):
    x = list(x); x[0] = u_of_L(L); return x


def designs():
    ev = []
    for r in runs("m7m_aware_wide"):
        if r["seed"] >= SEEDS: continue
        if r["label"] in ("7e", "7l t45 cap wide", "aware cap wide"):
            ev.append((r["label"], r["geom"], r["seed"], r["x"][:12], r["kp_hi"]))
        if r["label"] == "aware cap wide":
            ev.append(("7m short arm", r["geom"], r["seed"], with_L(r["x"][:12], L_SHORT[r["geom"]]), r["kp_hi"]))
        if r["label"] == "7l t45 cap wide":
            ev.append(("7l long arm", r["geom"], r["seed"], with_L(r["x"][:12], L_LONG[r["geom"]]), r["kp_hi"]))
    return ev


if __name__ == "__main__":
    t0 = time.time()
    jobs = [(g, s, k) for g in GEOMS for s in range(SEEDS) for k in range(len(M6.STARTS))]
    with Pool() as p:
        train = p.map(one, jobs, chunksize=1)
    t_train = time.time() - t0
    ev = designs()
    for g in GEOMS:
        for s in range(SEEDS):
            b = max((t for t in train if t[1] == g and t[2] == s), key=lambda t: t[4])
            ev.append((ARM, g, s, b[5][:12], KP_HI_WIDE))
    with Pool() as p:
        out = p.starmap(evaluate, ev)
    labels = ["7e", "7l t45 cap wide", "7l long arm", "aware cap wide", "7m short arm", ARM]
    lines = [f"Milestone 7n: pinned arm L (7l t45 cap wide's mean) above {L_SHORT['above']:.4f} m, below {L_SHORT['below']:.4f} m; "
             f"long arm (7m aware cap wide's mean) above {L_LONG['above']:.4f} m, below {L_LONG['below']:.4f} m.",
             "Swapped designs failing 7e's margin test (rho >= 1): " + (", ".join(f"{r['label']} {r['geom']} seed {r['seed']} (rho {r['margin_rho']:.4f})" for r in out if not r["margin_ok"]) or "none"),
             "(a swapped design that fails it is not one the tuner could have picked; its counts are reported but read with that caveat)", ""]
    lines += M7.summarise(out, [t for t in train], labels)
    lines.append(f"wall time {time.time() - t0:.0f} s (training {t_train:.0f} s)")
    sfx = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{sfx}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(labels=labels, budget=BUDGET, L_short=L_SHORT, L_long=L_LONG,
                   train=[dict(arm=t[0], geom=t[1], seed=t[2], start=t[3], best=t[4], x=t[5], rejected=t[6]) for t in train], runs=out),
              open(os.path.join(HERE, f"results{sfx}.json"), "w"), indent=1)
    print("\n".join(lines))
