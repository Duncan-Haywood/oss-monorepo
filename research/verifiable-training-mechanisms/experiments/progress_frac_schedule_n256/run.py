"""Milestone 66 (replication of milestone 64 at n = 256 on fresh draws, prng seed 58, schedules flat99, down99_95, down99_90). Was: Milestone 64 (stall fraction as a schedule over the window, sigma 0.05), a copy of milestone 61. Was: Milestone 61 (finer FRAC 0.95 to 0.99 at sigma 0.02 and 0.05), a copy of milestone 60. Was: Milestone 60 (noise-aware cheater: stall fraction FRAC swept at sigma 0.05, linear noise, n = 128), a copy of the milestone 59 code with the cell loop over FRACS.
Original: Milestone 59 (reconciles the two milestone 58 runs): n = 128 draws, noise form chosen by env FORM = linear (1 + sigma z) or lognormal (exp(sigma z)).
Original docstring: Milestone 58, H4/H3 link: the adaptive stalling cheater of milestone 56 when the flag threshold is only known up to noise (the verifier batch stays known)

Protocol of ../progress_R16/run.py (16 honest seeds, d = 32, 600 steps, eval every N = 10 steps). The adversary knows the verifier batch and the threshold
(the largest verifier loss of the 15 other seeds over eval points e-1..e+1, times R): worst case, a leaked calibration. Inside its window of T = 200 steps it
evaluates the verifier loss of its current weights before each step and stalls (submits no step) only while that loss is at most FRAC x R x threshold at the
next eval point, otherwise it takes the honest step. Flags are scored at the same R. n = 32 (seed, start) draws, R in RS.
Run:  OMP_NUM_THREADS=1 python3 run.py   (needs torch; writes results.json, results.txt)"""
import json
import os
import sys
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import torch  # noqa: E402
import torch.nn.functional as F  # noqa: E402
from vtm.margin_tf import TinyLM, batch_at, grad_vec, heldout, load_text, lr_at  # noqa: E402

torch.set_num_threads(1)
SCALE = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
SEEDS, STEPS, D, BATCH, CTX = 16, 600, 32, 32, 32
EPS, W, C, N, R = 0.01, 5, 1.5, 10, 1.05  # R here only fixes the ascent run; flags are re-scored for every R in RS
RS = [1.01]
FRAC = 0.99
FRACS = ["flat99", "down99_95", "down99_90"]  # schedules over the 200-step window
PSEEDS = [0.05]  # sigma: the cheater believes threshold x (1 + sigma z), z ~ N(0,1) fixed per job, drawn independently of the job; sigma 0 is milestone 56

N_DRAW = 256
FORM = "linear"
ATTACKS = ["stall"]
DATA = load_text(os.path.join(HERE, "..", "transformer", "corpus.txt"))


CUR_FRAC = FRAC


def frac_at(name, k, T):
    a, b = {"flat99": (0.99, 0.99), "down99_95": (0.99, 0.95), "up95_99": (0.95, 0.99), "down99_90": (0.99, 0.90)}[name]
    return a + (b - a) * k / max(1, T - 1)


def verifier_loss(model, tr, vb):
    x, y = vb
    with torch.no_grad():
        return float(F.cross_entropy(model(x).reshape(-1, model.head.out_features), y.reshape(-1)))


def run(seed, attack=None, t0=0, T=1, thr=None, pthr=None, Rr=1.0, pseed=None):
    tr, te, vocab = DATA
    torch.manual_seed(seed)
    model = TinyLM(vocab, CTX, d=D)
    params = list(model.parameters())
    order = np.random.default_rng(10_000 + seed)
    vidx = np.random.default_rng(777).integers(0, len(tr) - CTX - 1, 256)
    vb = batch_at(tr, vidx, CTX)
    pb = vb
    zz = float(np.random.default_rng(31_000 + 97 * seed + t0).standard_normal()) if pseed else 0.0
    belief = (1.0 + (pseed or 0.0) * zz) if FORM == "linear" else float(np.exp((pseed or 0.0) * zz))
    info = {"a": [], "b": [], "vl": [], "flagged_steps": 0}
    for t in range(STEPS):
        idx = order.integers(0, len(tr) - CTX - 1, BATCH)
        x, y = batch_at(tr, idx, CTX)
        g = grad_vec(model, x, y)
        lr = lr_at(t, STEPS, lr0=0.5)
        on = attack is not None and t0 <= t < t0 + T
        with torch.no_grad():
            w = torch.cat([p.reshape(-1) for p in params])
            honest = -lr * g
            delta = honest
            if on and attack == "adapt":
                vl_now = verifier_loss(model, tr, pb)
                if vl_now <= frac_at(CUR_FRAC, t - t0, T) * Rr * belief * pthr[t // N]:
                    delta = torch.zeros_like(honest)
                    info["stalled"] = info.get("stalled", 0) + 1
            elif on:
                ta, tb = thr["step"][t]
                a0, b0 = float(honest.norm()) / lr, float(honest.abs().max()) / lr
                c = 0.999 * min(ta / a0, tb / b0)
                delta = -c * honest
            info["a"].append(float(delta.norm()) / lr)
            info["b"].append(float(delta.abs().max()) / lr)
            off, flat = 0, w + delta
            for q in params:
                n = q.numel()
                q.copy_(flat[off:off + n].view_as(q))
                off += n
        if t % N == N - 1:
            info["vl"].append(verifier_loss(model, tr, vb))
    return float(heldout(model, te, CTX)), info


def job(a):
    seed, attack, T, t0, thr, pthr, Rr, pseed = a
    loss, info = run(seed, attack, t0, T, thr, pthr, Rr, pseed)
    return {"seed": seed, "attack": attack, "T": T, "t0": t0, "loss": loss, **info}


def main():
    with Pool(4) as pool:
        clean = pool.map(job, [(s, None, 1, 0, None, None, 1.0, 0.0) for s in range(SEEDS)], chunksize=1)
    V = np.array([o["vl"] for o in clean])
    ne = V.shape[1]
    base = {o["seed"]: o["loss"] for o in clean}

    def prog_thr(cal):
        return np.array([V[cal][:, max(0, e - 1):e + 2].max() for e in range(ne)])

    prng = np.random.default_rng(58)  # fresh draws, not milestone 56/64
    draws = [(j % SEEDS, float(prng.random())) for j in range(N_DRAW)]
    L, res = [], {}
    for Rr, ps, fr in [(r, p, f) for r in RS for p in PSEEDS for f in FRACS]:
        globals()["CUR_FRAC"] = fr
        jobs = [(seed, "adapt", 200, int(u * (STEPS - 200 + 1)), None, prog_thr([q for q in range(SEEDS) if q != seed]), Rr, ps) for seed, u in draws]
        with Pool(4) as pool:
            outs = pool.map(job, jobs, chunksize=1)
        dl = np.array([o["loss"] - base[o["seed"]] for o in outs])
        harm = np.abs(dl) > EPS
        ever = []
        for o in outs:
            th = prog_thr([q for q in range(SEEDS) if q != o["seed"]])
            e0 = o["t0"] // N
            ever.append(any(e >= e0 and v > Rr * th[e] for e, v in enumerate(o["vl"])))
        ever = np.array(ever)
        st = np.array([o.get("stalled", 0) for o in outs])
        res["R%s_sigma%s_frac%s" % (Rr, ps, fr)] = {"n": len(outs), "flagged": int(ever.sum()), "harmful": int(harm.sum()), "harmful_unflagged": int((harm & ~ever).sum()),
                           "median_dL": float(np.median(dl)), "median_abs_dL": float(np.median(np.abs(dl))), "median_stalled_steps": float(np.median(st))}
        L.append("adaptive stall T=200, threshold noise %s, frac %s, R=%.3f: flagged %2d of %d, harmful %2d, harmful and unflagged %2d, median dL %+.4f, median stalled steps %d of 200"
                 % ("sigma %.3f" % ps, fr, Rr, ever.sum(), len(outs), harm.sum(), (harm & ~ever).sum(), np.median(dl), np.median(st)))
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
