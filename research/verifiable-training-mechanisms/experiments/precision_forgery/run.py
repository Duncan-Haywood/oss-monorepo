"""Milestone 89: does a forger who computes its last steps at the referee's own low precision pass the replay referee?
(H1/H4 link; data for analyze.py)

Milestone 88 priced sub-batch proxies: dropping rows from a step's gradient is caught unless it saves under 0.4% of
a segment. A cheaper proxy on real accelerators is precision: an FP16 tensor-core step costs a fraction of an FP32
one (NVIDIA H100 SXM datasheet: 989 dense FP16 tensor TFLOPS against 495 TF32 and 67 FP32). The fp16 referee of
milestones 80 to 88 replays a segment with weights and inputs rounded to float16, so a forger who runs its last q
steps with that same recipe moves its committed state *towards* the referee's replay, and at q = 20 commits exactly
the replay. Cheats on the last q of a segment's 20 steps:
  f16_q    gradient with weights and inputs rounded to float16 (vtm.margin.grad(low_precision=True), the referee's)
  bf16_q   the same with bfloat16 rounding (8 significand bits against float16's 11)
  sub{b}_q milestone 88's sub-batch proxy, extended to q = 10 and 20 (one to eight rows shaved from every step)
  skip{q}  the naive skip, control (q = 1, 2, 5 reproduce milestone 88)
q = 1, 2, 5, 10, 20. Statistics, referee and arbiter modes are milestone 88's, plus one new per-run figure: the
held-out loss at the end of a run trained entirely with the f16 and with the bf16 recipe, against the honest run's,
to say whether a low-precision forger harms the model at all.

Run: OMP_NUM_THREADS=1 python3 run.py   (numpy + scikit-learn; 4 processes). Writes results.json (gitignored size:
run it to reproduce; analyze.py writes results.txt and summary.json). Decision rules are in LOG.md, fixed before."""
import importlib.util
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("m88_run", os.path.join(HERE, "..", "proxy_forgery", "run.py"))
m88 = importlib.util.module_from_spec(_spec)
sys.modules["m88_run"] = m88
_spec.loader.exec_module(m88)
m87, m86, m85, m82 = m88.m87, m88.m86, m88.m85, m88.m82
from vtm.margin import grad, loss, to_f16  # noqa: E402  (m87 put src on the path)

T, S, N = m88.T, m88.S, m88.N
DATA = m88.DATA
OPTS = m88.OPTS
SCHEDULES = m88.SCHEDULES
TEST_SEEDS, CAL_SEEDS = m88.TEST_SEEDS, m88.CAL_SEEDS
MODES = m88.MODES
QS = (1, 2, 5, 10, 20)
PRECS = ("f16", "bf16")
SUB_BS = (56, 60, 62, 63)
SUB_QS = (10, 20)
g7, rel = m88.g7, m88.rel


def to_bf16(a):
    """Round float32 to bfloat16 (nearest, ties to even) and back; no NaN or overflow handling needed here."""
    u = np.ascontiguousarray(a, dtype=np.float32).view(np.uint32)
    u = (u + (np.uint32(0x7FFF) + ((u >> np.uint32(16)) & np.uint32(1)))) & np.uint32(0xFFFF0000)
    return u.view(np.float32)


def prec_grad(prec, w, x, y):
    if prec == "f16":
        return grad(w, x, y, low_precision=True)
    if prec == "bf16":
        return grad(to_bf16(w), to_bf16(x), y)
    if prec == "f32":
        return grad(w, x, y)
    raise ValueError(prec)


def prec_forged(kind, prec, states, batches, lrs, t0, q):
    """End state when the last q steps of segment t0 take their gradient at precision prec."""
    t1 = t0 + S - q
    w, st = states[t1]
    for t in range(t1, t0 + S):
        b = batches[t]
        w, st = m86.opt_step(kind, w, st, prec_grad(prec, w, DATA[0][b], DATA[1][b]), float(lrs[t]), t)
    return w, st


def keys():
    return (["honest"] + [f"skip{q}" for q in QS] + [f"{p}_{q}" for p in PRECS for q in QS]
            + [f"sub{b}_{q}" for q in SUB_QS for b in SUB_BS])


def full_run_loss(kind, prec, lrs, batches, seed):
    w = m86.init(np.random.default_rng(seed))
    st = m86.zero_state(kind, w)
    for t in range(T):
        b = batches[t]
        w, st = m86.opt_step(kind, w, st, prec_grad(prec, w, DATA[0][b], DATA[1][b]), float(lrs[t]), t)
    return float(loss(w, DATA[2], DATA[3]))


def job(args):
    name, sched, seed = args
    kind, total = OPTS[name]
    lrs = m85.schedule(sched, total)
    batches = m82.batches_for(seed)
    xtr, ytr = DATA[0], DATA[1]
    w = m86.init(np.random.default_rng(seed))
    st = m86.zero_state(kind, w)
    states = [(w, st)]
    for t in range(T):
        bt = batches[t]
        w, st = m86.opt_step(kind, w, st, m86.mode_grad("worker", w, xtr[bt], ytr[bt], None), float(lrs[t]), t)
        states.append((w, st))
    honest_loss = float(loss(w, DATA[2], DATA[3]))
    ks = keys()
    stats = ("w",) if kind == "sgd" else ("w", "m") if kind == "momentum" else ("w", "m", "v")
    rng = np.random.default_rng(70_000 + seed)  # milestone 86's arbiter permutation stream, same draw order
    out = {m: {s: {k: [] for k in ks} for s in stats} for m in MODES}
    for j in range(N):
        t0 = j * S
        cands = {"honest": states[t0 + S]}
        for q in QS:
            cands[f"skip{q}"] = states[t0 + S - q]
            for p in PRECS:
                cands[f"{p}_{q}"] = prec_forged(kind, p, states, batches, lrs, t0, q)
        for q in SUB_QS:
            for b in SUB_BS:
                cands[f"sub{b}_{q}"] = m88.sub_forged(kind, states, batches, lrs, t0, q, b)
        for mode in MODES:
            wr, sr = states[t0]
            norms = []
            for t in range(t0, t0 + S):
                bt = batches[t]
                nw, sr = m86.opt_step(kind, wr, sr, m86.mode_grad(mode, wr, xtr[bt], ytr[bt], rng), float(lrs[t]), t)
                norms.append(float(np.linalg.norm(nw.astype(np.float64) - wr)))
                wr = nw
            scale = float(np.mean(norms))
            for k in ks:
                wc, sc = cands[k]
                out[mode]["w"][k].append(g7(np.linalg.norm(wc.astype(np.float64) - wr) / scale))
                if "m" in stats:
                    out[mode]["m"][k].append(g7(rel(sc[0], sr[0])))
                if "v" in stats:
                    out[mode]["v"][k].append(g7(rel(sc[1], sr[1])))
    losses = {"honest": g7(honest_loss)}
    if seed in TEST_SEEDS:
        for p in PRECS:
            losses[p] = g7(full_run_loss(kind, p, lrs, batches, seed))
    return name, sched, seed, out, losses


def main():
    from multiprocessing import Pool
    seeds = TEST_SEEDS + CAL_SEEDS
    opts = tuple(os.environ.get("OPTS", ",".join(OPTS)).split(","))
    if os.environ.get("SEEDS"):
        seeds = tuple(int(v) for v in os.environ["SEEDS"].split(","))
    jobs = [(o, sc, sd) for o in opts for sc in SCHEDULES for sd in seeds]
    with Pool(int(os.environ.get("PROCS", 4))) as pool:
        res_list = pool.map(job, jobs, chunksize=1)
    res = {"T": T, "S": S, "N": N, "qs": list(QS), "precs": list(PRECS), "sub_bs": list(SUB_BS),
           "sub_qs": list(SUB_QS), "opts": {k: list(v) for k, v in OPTS.items()},
           "test_seeds": list(TEST_SEEDS), "cal_seeds": list(CAL_SEEDS), "runs": {}, "losses": {}}
    for name, sched, seed, out, losses in res_list:
        res["runs"].setdefault(name, {}).setdefault(sched, {})[str(seed)] = out
        res["losses"].setdefault(name, {}).setdefault(sched, {})[str(seed)] = losses
    fn = os.environ.get("OUT", "results.json")
    json.dump(res, open(os.path.join(HERE, fn), "w"), separators=(",", ":"))
    print("wrote", fn, len(res_list), "jobs")


if __name__ == "__main__":
    main()
