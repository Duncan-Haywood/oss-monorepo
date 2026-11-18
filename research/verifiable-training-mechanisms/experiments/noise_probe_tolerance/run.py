"""Milestone 78: normalise segment drift by a noise probe the referee measures, instead of by the step norm (H1/H4 link).

Milestones 75 to 77 flag a replayed s-step segment when drift / (mean replayed step norm) exceeds the largest honest
value. That threshold grows with the calibration sample because the largest honest ratios sit late in training, where
the cosine learning rate and the gradient are small but fp16 rounding error in the gradient is not. This run stores,
per segment, the raw quantities needed to try three other normalisations:
  drift    ||w_worker(t0+s) - w_replay(t0+s)||   (fp16 replay from the worker's checkpoint, same batches)
  step     mean replayed step norm                (milestones 75-77's denominator)
  lr       mean learning rate over the segment
  probe    lr(t0) ||g_fp16(w_t0) - g_fp32(w_t0)||  on batch t0: one extra float32 gradient per segment, which a referee
           can compute (or emulate slowly) at 1/s of the replay cost; it measures the rounding noise of this segment.
Calibration: 40 honest seeds (100-139, milestone 76's set). Test: 20 seeds (0-19) under an honest worker and five shrink
cheats; worker submits (1 - eta_t) times the honest step. Analysis is in analyze.py.
Run: OMP_NUM_THREADS=1 python3 run.py   (numpy + scikit-learn; a few minutes on 4 processes). Writes results.json."""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.margin import grad, init, load_digits_split, loss, lr_at  # noqa: E402

TEST_SEEDS, CAL_SEEDS = list(range(20)), list(range(100, 140))
T, BATCH, LR0, S = 1500, 64, 0.2, 20
N = T // S
TAIL0 = 1200  # first step of the zone where mean lr < 0.1 lr0 (milestone 77)
# name -> (first step, last step + 1, eta); budget E = eta x window length
CHEATS = {
    "honest": (0, 0, 0.0),
    "uniform 0.02": (0, T, 0.02),        # E = 30, milestone 75's largest hidden uniform shrink
    "uniform 0.05": (0, T, 0.05),        # E = 75
    "mid 300 x 0.1": (600, 900, 0.1),    # E = 30, a window in mid training
    "tail 300 x 0.1": (TAIL0, T, 0.1),   # E = 30, all inside milestone 77's loose tail zone
    "tail 300 x 0.3": (TAIL0, T, 0.3),   # E = 90
}
DATA = load_digits_split()


def eta_schedule(name):
    lo, hi, e = CHEATS[name]
    eta = np.zeros(T)
    eta[lo:hi] = e
    return eta


def run_one(seed, eta):
    xtr, ytr, xte, yte = DATA
    w = init(np.random.default_rng(seed))
    orng = np.random.default_rng(10_000 + seed)
    batches = [orng.integers(0, len(ytr), BATCH) for _ in range(T)]
    ws = [w]
    for t in range(T):
        w = w - (1 - eta[t]) * lr_at(t, T, LR0) * grad(w, xtr[batches[t]], ytr[batches[t]])
        ws.append(w)
    seg = []
    for j in range(N):
        t0, wr, norms = j * S, ws[j * S], []
        x0, y0 = xtr[batches[t0]], ytr[batches[t0]]
        probe = float(lr_at(t0, T, LR0) * np.linalg.norm(grad(wr, x0, y0, low_precision=True) - grad(wr, x0, y0)))
        for t in range(t0, t0 + S):
            d = -lr_at(t, T, LR0) * grad(wr, xtr[batches[t]], ytr[batches[t]], low_precision=True)
            norms.append(float(np.linalg.norm(d)))
            wr = wr + d
        g7 = lambda v: float(f"{v:.7g}")  # 7 significant digits keeps results.json under 1 MB
        seg.append({"drift": g7(np.linalg.norm(ws[t0 + S] - wr)), "step": g7(np.mean(norms)),
                    "lr": g7(np.mean([lr_at(t, T, LR0) for t in range(t0, t0 + S)])), "probe": g7(probe)})
    return seg, float(loss(ws[-1], xte, yte))


def job(args):
    seed, name = args
    seg, l = run_one(seed, eta_schedule(name))
    return seed, name, seg, l


def main():
    from multiprocessing import Pool
    tasks = [(sd, "honest") for sd in CAL_SEEDS] + [(sd, n) for sd in TEST_SEEDS for n in CHEATS]
    with Pool(4) as pool:
        out = pool.map(job, tasks)
    cal = {sd: seg for sd, n, seg, l in out if sd in CAL_SEEDS}
    test = {}
    for sd, n, seg, l in out:
        if sd in TEST_SEEDS:
            test.setdefault(n, {})[str(sd)] = {"seg": seg, "loss": l}
    json.dump({"T": T, "S": S, "LR0": LR0, "TAIL0": TAIL0, "cheats": {k: list(v) for k, v in CHEATS.items()},
               "cal": {str(k): v for k, v in sorted(cal.items())}, "test": test},
              open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"))
    print("wrote results.json:", len(cal), "calibration seeds,", len(test), "test configs")


if __name__ == "__main__":
    main()
