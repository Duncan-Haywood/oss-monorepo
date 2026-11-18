"""Milestone 81: windowed shrinks against the mixed protocol. Where does a worker who knows both stages put its budget?
(H1/H4 link)

Milestone 80 found that a float32 arbiter replaying one committed s = 20 segment convicts any shrink above about 3e-5
of each step, while the fp16 referee only flags shrinks that are large inside a segment. So a spread cheat is best met
by one arbiter segment, a concentrated one by many cheap fp16 segments. This run adds the cheats needed to price a
protocol that does both: a budget of E = 30 step-units (sum of eta_t) packed into windows of W = 20, 60, 100, 300 and
750 steps, early, mid and late, each segment-aligned (an aligned window touches the fewest segments).

Same MLP, data, schedule, seeds and replay code as milestone 80 (imported from ../dispute_arbiter/run.py, so the honest
calibration and the uniform ladder there are reused, not re-run). Analysis is in analyze.py.
Run: OMP_NUM_THREADS=1 python3 run.py   (numpy + scikit-learn; about 10 minutes on 4 processes). Writes results.json."""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "dispute_arbiter"))
import run as m80  # noqa: E402

T = m80.T
E = 30.0
WINDOWS = {}
for W in (20, 60, 100, 300):
    eta = min(1.0, E / W)
    WINDOWS[f"W{W} early"] = (0, W, eta)
    WINDOWS[f"W{W} mid"] = (600, 600 + W, eta)
    WINDOWS[f"W{W} late"] = (T - W, T, eta)
WINDOWS["W750 early"] = (0, 760, E / 760)
WINDOWS["W750 late"] = (T - 760, T, E / 760)


def job(args):
    seed, name = args
    lo, hi, e = WINDOWS[name]
    eta = np.zeros(T)
    eta[lo:hi] = e
    seg, l = m80.run_one(seed, eta)
    return seed, name, seg, l


def main():
    from multiprocessing import Pool
    tasks = [(sd, n) for sd in m80.TEST_SEEDS for n in WINDOWS]
    with Pool(int(os.environ.get("PROCS", 4))) as pool:
        out = pool.map(job, tasks)
    test = {}
    for sd, n, seg, l in out:
        test.setdefault(n, {})[str(sd)] = {"seg": seg, "loss": l}
    json.dump({"T": T, "S": m80.S, "E": E, "cheats": {k: list(v) for k, v in WINDOWS.items()}, "test": test},
              open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"))
    print("wrote results.json:", len(test), "windowed cheats x", len(m80.TEST_SEEDS), "seeds")


if __name__ == "__main__":
    main()
