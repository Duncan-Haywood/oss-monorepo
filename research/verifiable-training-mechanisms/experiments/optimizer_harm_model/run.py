"""Milestone 85: does milestone 84's schedule harm model survive momentum SGD and Adam? (H1/H4 link; data for analyze.py)

Milestone 84 found that, under plain SGD, stalling one s = 20 segment costs a fixed c = 2.661e-4 held-out loss per unit
of the learning rate the segment skipped. Its "Next" asked whether this holds with momentum and Adam, where a
segment's effective step is not the schedule's. This run repeats milestone 82's measurement (MLP, digits data,
batches, T = 1,500, s = 20, N = 75, test seeds 0-39, all imported unchanged) with two optimisers:
  momentum  EMA heavy ball: m <- 0.9 m + 0.1 g, w <- w - lr m   (the EMA form keeps the effective step equal to lr,
            so the schedules sum to 150 as in milestones 82 and 84)
  adam      Kingma and Ba (2015, arXiv:1412.6980), beta1 0.9, beta2 0.999, eps 1e-8, bias correction by the global
            step index; schedules sum to ADAM_TOTAL (chosen in --pick-adam-scale on honest calibration runs only)
A stall: the worker skips the segment's 20 steps and commits its start weights AND optimiser moments as its end state;
training resumes at step t0 + 20 (Adam's bias correction keeps counting global steps).
Schedules: cosine, step, warmcos, sgdr (milestone 84's definitions; cosine is milestone 82's) for the test seeds;
constant (milestone 82's) on calibration seeds 100-109 only, to fix each optimiser's level constant.
Per job: honest loss, the loss after stalling each segment, and per segment the honest update's summed
lr * RMS(update direction) (the effective step a referee can read off its own honest run).
Honest-only runs on calibration seeds 100-109 for each test schedule give the referee's P_eff (no test seed used).
Run: ADAM_TOTAL=6.0 OMP_NUM_THREADS=1 PYTHONPATH=../../src python3 run.py   (numpy + scikit-learn; about 15 minutes on 4 processes). Writes results.json.
     After-the-run diagnostics (LOG.md): OPTS=adam ADAM_TOTAL=1.5 OUT=results_adam_lr1e-3.json, same command;
     and OPTS=adam ADAM_TOTAL=1.5 ADAM_COUNT=taken OUT=results_adam_lr1e-3_taken.json (the stall freezes the counter);
     and OPTS=adam ADAM_TOTAL=6.0 ADAM_COUNT=taken OUT=results_adam_taken.json.
     OMP_NUM_THREADS=1 python3 run.py --pick-adam-scale   (honest runs only; prints the calibration table)."""
import importlib.util
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("m84_run", os.path.join(HERE, "..", "schedule_harm_model", "run.py"))
m84 = importlib.util.module_from_spec(_spec)
sys.modules["m84_run"] = m84
_spec.loader.exec_module(m84)
m82 = m84.m82
from vtm.margin import grad, init, loss  # noqa: E402

T, S, N = m82.T, m82.S, m82.N
DATA = m82.DATA
OPTS = tuple(os.environ.get("OPTS", "momentum,adam").split(","))
TEST_SCHEDULES = ("cosine", "step", "warmcos", "sgdr")
CAL_SCHEDULE = "constant"
BETA = 0.9
B1, B2, EPS = 0.9, 0.999, 1e-8
ADAM_TOTAL = float(os.environ.get("ADAM_TOTAL", "nan"))  # fixed by --pick-adam-scale, written into LOG.md first
ADAM_CANDIDATES = (0.75, 1.5, 3.0, 6.0)


def schedule(name, total):
    lrs = m84.lr_sched(name) if name in m84.SCHEDULES else m84.m82_sched(name)
    return lrs * (total / lrs.sum())


def lrs_for(opt, name, adam_total=None):
    return schedule(name, 150.0 if opt == "momentum" else (adam_total or ADAM_TOTAL))


def zero_state(opt, w):
    z = np.zeros_like(w)
    return (z,) if opt == "momentum" else (z, z.copy())


def step(opt, w, st, g, lr, t):
    if opt == "momentum":
        m = BETA * st[0] + (1 - BETA) * g
        return w - lr * m, (m,), m
    m = B1 * st[0] + (1 - B1) * g
    v = B2 * st[1] + (1 - B2) * g * g
    u = (m / (1 - B1 ** (t + 1))) / (np.sqrt(v / (1 - B2 ** (t + 1))) + EPS)
    return (w - lr * u).astype(np.float32), (m, v), u


COUNT = os.environ.get("ADAM_COUNT", "global")  # "taken": a stall also freezes Adam's bias-correction counter


def run_from(opt, w, st, t_from, lrs, batches, keep=False, skipped=0):
    """Train from step t_from to T. keep=True returns the state at every segment boundary and per-segment
    sum of lr * RMS(update direction)."""
    xtr, ytr = DATA[0], DATA[1]
    cps, eff = [], np.zeros(N)
    for t in range(t_from, T):
        if keep and t % S == 0:
            cps.append((w, st))
        b = batches[t]
        w, st, u = step(opt, w, st, grad(w, xtr[b], ytr[b]), float(lrs[t]), t - skipped)
        if keep:
            eff[t // S] += lrs[t] * float(np.sqrt(np.mean(u * u)))
    return w, cps, eff


def g7(v):
    return float(f"{v:.6g}")


def honest(opt, seed, lrs, batches):
    w0 = init(np.random.default_rng(seed))
    return run_from(opt, w0, zero_state(opt, w0), 0, lrs, batches, keep=True)


def stall_job(args):
    opt, seed, sched, adam_total = args
    lrs, batches = lrs_for(opt, sched, adam_total), m82.batches_for(seed)
    xte, yte = DATA[2], DATA[3]
    w_end, cps, eff = honest(opt, seed, lrs, batches)
    base = float(loss(w_end, xte, yte))
    single = []
    for j in range(N):
        w, st = cps[j]  # a stall commits the segment's start state as its end state
        wf = run_from(opt, w, st, j * S + S, lrs, batches, skipped=S if COUNT == "taken" else 0)[0]
        single.append(g7(loss(wf, xte, yte)))
    return opt, seed, sched, base, single, [g7(v) for v in eff]


def honest_job(args):
    opt, seed, sched, adam_total = args
    lrs, batches = lrs_for(opt, sched, adam_total), m82.batches_for(seed)
    w_end, _, eff = honest(opt, seed, lrs, batches)
    return opt, seed, sched, adam_total, float(loss(w_end, DATA[2], DATA[3])), [g7(v) for v in eff]


def pick_adam_scale():
    from multiprocessing import Pool
    jobs = [("adam", sd, "cosine", a) for a in ADAM_CANDIDATES for sd in m82.CAL_SEEDS]
    jobs += [("momentum", sd, "cosine", None) for sd in m82.CAL_SEEDS]
    with Pool(int(os.environ.get("PROCS", 4))) as pool:
        out = pool.map(honest_job, jobs)
    sgd = []
    for sd in m82.CAL_SEEDS:
        lrs, b = m84.m82_sched("cosine"), m82.batches_for(sd)
        sgd.append(float(loss(m82.train(init(np.random.default_rng(sd)), 0, lrs, b)[-1], DATA[2], DATA[3])))
    print(f"plain SGD cosine (sum 150): honest held-out loss mean {np.mean(sgd):.4f}")
    print(f"momentum cosine (sum 150): {np.mean([o[4] for o in out if o[0] == 'momentum']):.4f}")
    for a in ADAM_CANDIDATES:
        ls = [o[4] for o in out if o[0] == "adam" and o[3] == a]
        print(f"adam cosine, schedule sum {a} (mean lr {a / T:.1e}): honest held-out loss mean {np.mean(ls):.4f}"
              f" sd {np.std(ls, ddof=1):.4f}")


def main():
    if "--pick-adam-scale" in sys.argv:
        return pick_adam_scale()
    if not np.isfinite(ADAM_TOTAL):
        raise SystemExit("set ADAM_TOTAL (from --pick-adam-scale, recorded in LOG.md before the run)")
    from multiprocessing import Pool
    jobs = [(o, sd, sc, ADAM_TOTAL) for o in OPTS for sc in TEST_SCHEDULES for sd in m82.TEST_SEEDS]
    jobs += [(o, sd, CAL_SCHEDULE, ADAM_TOTAL) for o in OPTS for sd in m82.CAL_SEEDS]
    with Pool(int(os.environ.get("PROCS", 4))) as pool:
        out = pool.map(stall_job, jobs, chunksize=1)
        cal = pool.map(honest_job, [(o, sd, sc, ADAM_TOTAL) for o in OPTS for sc in TEST_SCHEDULES
                                    for sd in m82.CAL_SEEDS])
    res = {"adam_count": COUNT, "T": T, "S": S, "N": N, "adam_total": ADAM_TOTAL, "beta": BETA, "adam_betas": [B1, B2, EPS], "opts": {}}
    for o in OPTS:
        res["opts"][o] = {}
        for sc in TEST_SCHEDULES + (CAL_SCHEDULE,):
            lrs = lrs_for(o, sc)
            res["opts"][o][sc] = {
                "seg_lr": [g7(v) for v in lrs.reshape(N, S).sum(1)],
                "runs": {str(sd): {"honest": base, "single": single, "eff": eff}
                         for o2, sd, s2, base, single, eff in out if o2 == o and s2 == sc}}
            if sc != CAL_SCHEDULE:  # the referee's own honest runs: where P_eff comes from
                res["opts"][o][sc]["cal_eff"] = {str(sd): eff for o2, sd, s2, _, _, eff in cal if o2 == o and s2 == sc}
    json.dump(res, open(os.path.join(HERE, os.environ.get("OUT", "results.json")), "w"), separators=(",", ":"))
    print("wrote results.json:", len(out), "jobs")


if __name__ == "__main__":
    main()
