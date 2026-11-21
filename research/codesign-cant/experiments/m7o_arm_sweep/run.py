"""Milestone 7o: crashes against frame arm length on fixed tunes, and how much of the arm's effect is the gust exposure it adds.

Milestone 7n found that on a fixed tune a 4-7 mm longer arm removes about one lever-2 crash in five, and that shortening an arm can
push a tune past its stability margin. It measured one swap per design. This sweeps the arm on every fixed design of four sets
(7e, 7l `t45 cap wide`, 7m `aware cap wide`, 7n `aware cap wide fixL`; 6 seeds x 2 geometries each) over L = 0.085-0.135 m in
5 mm steps plus each design's own L, nothing else in the design vector changed. Two sizing modes:

  resize:  the full sizing model, so a longer arm also adds frame mass (0.8 kg/m), inertia, frontal area (0.02 + 0.5 L^2) and
           centre-of-pressure lever (0.05 + 0.3 L), i.e. more gust torque as well as more control torque.
  pinexp:  as resize, but the area and the centre-of-pressure lever are held at the design's own-L values, so only the actuator
           side (torque limit, inertia, mass, hover power) moves with the arm. The difference is what the extra gust exposure costs.

Each point records the design's margin test (`margin_rho` under its own kp box) and the propeller-clearance rule
(sqrt(2) L >= 1.05 D) and cost cap ($300, which also catches the sizing closure running away); points that fail either are reported but are not designs a tuner could have picked.
Held-out conditions (64 episodes, seed 9999, as 7m): lever 1 at 45 deg with the cap (tracking), lever 2 at 20 and 45 deg with
the cap, lever 3 at 20 deg with the cap. Predictions O1-O7 in ../../LOG.md, written and committed before this was run.
"""
import importlib.util, json, os, sys, time, warnings
from multiprocessing import Pool
import numpy as np

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
H, L7, P, GEOMS = M7.H, M7.L7, M7.P, M7.GEOMS
SMOKE = os.environ.get("SMOKE") == "1"
TEST_EP = 8 if SMOKE else M6.TEST_EP
TEST_SEED = 4242 if SMOKE else M6.TEST_SEED
SEEDS = 2 if SMOKE else M6.SEEDS
GRID = [round(0.085 + 0.005 * i, 3) for i in range(11)]
CONDS = [(45.0, 1.0), (20.0, 2.0), (45.0, 2.0), (20.0, 3.0)]   # all with the cap
MODES = ("resize", "pinexp")

_size = A.size
PIN = {}


def size_pinned(*a, **k):
    sz = _size(*a, **k)
    if "area" in PIN and np.shape(sz["area"]) == np.shape(PIN["area"]):
        sz = dict(sz); sz["area"] = PIN["area"]; sz["lever"] = PIN["lever"]
    return sz


A.size = size_pinned   # poshold reads A.size at call time; the pin is empty unless set below


def u_of_L(L):
    return (L - A.L_RANGE[0]) / (A.L_RANGE[1] - A.L_RANGE[0])


def L_of_u(u):
    return A.L_RANGE[0] + u * (A.L_RANGE[1] - A.L_RANGE[0])


def sets():
    out = []
    m7m = json.load(open(os.path.join(HERE, "..", "m7m_aware_wide", "results.json")))["runs"]
    m7n = json.load(open(os.path.join(HERE, "..", "m7n_fixed_arm", "results.json")))["runs"]
    for r in m7m:
        if r["label"] in ("7e", "7l t45 cap wide", "aware cap wide") and r["seed"] < SEEDS:
            out.append((r["label"], r["geom"], r["seed"], r["x"][:12], r["kp_hi"]))
    for r in m7n:
        if r["label"] == "aware cap wide fixL" and r["seed"] < SEEDS:
            out.append((r["label"], r["geom"], r["seed"], r["x"][:12], r["kp_hi"]))
    return out


def sweep(label, geom, s, x12, kp_hi):
    x0 = np.array(x12, float)
    L0 = float(L_of_u(x0[0]))
    Ls = list(GRID) + [L0]   # the last point is the design itself, its coordinate untouched (a sub-micron change in L flips marginal flights)
    X = np.repeat(x0[None], len(Ls), axis=0); X[:-1, 0] = [u_of_L(L) for L in GRID]
    D = A.D_RANGE[0] + x0[1] * (A.D_RANGE[1] - A.D_RANGE[0])
    L7.setup(None, kp_hi)
    rho = H.margin_rho(X, np.full(len(X), A.TWR))
    L7.setup()
    c = M6.cond("aware"); al = c["alpha_max"] * np.clip(x0[2], 0, 1)
    sz = _size(L_of_u(X[:, 0]), D, al, kappa_per_d=c["kappa_per_d"], actuator="hover")
    own = _size(L0, D, al, kappa_per_d=c["kappa_per_d"], actuator="hover")
    rec = dict(label=label, geom=geom, seed=s, L0=L0, D=float(D), L=Ls, rho=[float(v) for v in rho],
               clear=[bool(np.sqrt(2) * L >= 1.05 * D) for L in Ls], feasible=[bool(v) for v in sz["feasible"]], mass=sz["mass"].tolist(),
               tau_per_weight=(sz["tau_max"] / (sz["mass"] * A.G)).tolist(), power=sz["power"].tolist(),
               gust_exposure=(sz["area"] * sz["lever"]).tolist(), own_exposure=float(own["area"] * own["lever"]))
    for mode in MODES:
        PIN.clear()
        if mode == "pinexp":
            PIN["area"] = np.full(len(Ls), float(own["area"])); PIN["lever"] = np.full(len(Ls), float(own["lever"]))
        for t, lev in CONDS:
            L7.setup(t, kp_hi, None)
            J, _, o = P.score(X, TEST_EP, TEST_SEED, parts=True, dist_sign=GEOMS[geom], lever_scale=lev, ff=1.0, ff_mode="integ",
                              perr_max=L7.perr_of(X, True), **M6.cond("aware"))
            k = f"{mode}_{t:g}_{lev:g}"
            rec[f"dead_{k}"] = [int(round(float(v) * TEST_EP)) for v in o["dead"]]
            rec[f"J_{k}"] = [float(v) for v in J]
        L7.setup()
    PIN.clear()
    return rec


def summarise(out):
    labs = ["7e", "7l t45 cap wide", "aware cap wide", "aware cap wide fixL"]
    lines = [f"Milestone 7o: arm sweep on fixed tunes, L = {GRID[0]}-{GRID[-1]} m (5 mm) plus each design's own L; {SEEDS} seeds x 2 geometries per set.",
             f"Held-out {TEST_EP} episodes (seed {TEST_SEED}), cap on. dead = diverged flights summed over seeds (of {TEST_EP * SEEDS});",
             "'ok' = seeds whose point passes the margin test and is feasible (propeller clearance, $300 cost cap); counts and J sum/average over ok seeds only.",
             "resize = full sizing model; pinexp = frontal area and centre-of-pressure lever held at the design's own-L values.", ""]
    for g in GEOMS:
        for lab in labs:
            rs = [r for r in out if r["label"] == lab and r["geom"] == g]
            if not rs: continue
            L0 = np.mean([r["L0"] for r in rs])
            lines.append(f"""[{g}, {lab}] own L mean {L0:.4f} m (seeds {', '.join(f'{r["L0"]:.4f}' for r in rs)})""")
            own = {k: sum(r[f"dead_{k}"][-1] for r in rs) for k in
                   [f"{m}_{t:g}_{l:g}" for m in MODES for t, l in CONDS]}
            lines.append("  own L: " + "; ".join(f"{k} {v}" for k, v in own.items() if k.startswith("resize")))
            hdr = "  L      ok  mass   tau/W   expo   " + "  ".join(f"{m[:3]}{t:g}/{l:g}" for m in MODES for t, l in CONDS) + "   J45/1 (resize, mean)"
            lines.append(hdr)
            for L in GRID:
                i = [r["L"].index(L) for r in rs]
                okm = [r["rho"][j] < 1.0 and r["feasible"][j] for r, j in zip(rs, i)]; ok = sum(okm)
                row = f"  {L:.3f}  {ok}/{len(rs)}  {np.mean([r['mass'][j] for r, j in zip(rs, i)]):.3f}  {np.mean([r['tau_per_weight'][j] for r, j in zip(rs, i)]):.4f}  " \
                      f"{np.mean([r['gust_exposure'][j] for r, j in zip(rs, i)]) * 1e3:.2f}  "
                row += "  ".join(f"{sum(r[f'dead_{m}_{t:g}_{l:g}'][j] for r, j, o in zip(rs, i, okm) if o):>8d}" for m in MODES for t, l in CONDS)
                js = [r['J_resize_45_1'][j] for r, j, o in zip(rs, i, okm) if o]
                row += f"   {np.mean(js):.3f}" if js else "   -"
                lines.append(row)
            lines.append("")
    return lines


if __name__ == "__main__":
    t0 = time.time()
    jobs = sets()
    with Pool() as p:
        out = p.starmap(sweep, jobs, chunksize=1)
    lines = summarise(out)
    lines.append(f"wall time {time.time() - t0:.0f} s")
    sfx = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{sfx}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(grid=GRID, conds=CONDS, modes=MODES, test_ep=TEST_EP, test_seed=TEST_SEED, runs=out),
              open(os.path.join(HERE, f"results{sfx}.json"), "w"), indent=1)
    print("\n".join(lines))
