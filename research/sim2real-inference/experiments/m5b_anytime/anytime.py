"""Milestone 5b: anytime confidence sequences with the twin as control variate (H5) on the m3 pools.
python3 anytime.py [reps]  ->  results/anytime.csv, results/summary_5b.txt   (pre-registration: LOG.md, 2026-10-24 milestone 5b)
Method: Waudby-Smith and Ramdas (2024) hedged capital, predictable plug-in bets, per-candidate capital on a grid,
a candidate is out from the first time its capital reaches 1/delta (Ville), so the sequence is valid at every stopping time."""
import csv, os, sys
import numpy as np
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
POOL = os.path.join(HERE, "..", "m3_benchmark", "results", "pool.csv")
NMAX, DELTA, SEED, N0 = 300, 0.05, 77, 20
GRID = np.linspace(0.0005, 0.9995, 300)
GAPS = (0.05, 0.10, 0.20)
PRIOR = 0.25


def load():
    rows = list(csv.reader(open(POOL)))
    a = np.array([[float(x) for x in r[1:]] for r in rows[1:]])
    return {n: a[:, j] for j, n in enumerate(rows[0][1:])}


def bounds(x, delta):
    """Anytime two-sided bounds (lo_t, hi_t) for the mean of x in [0, 1], t = 1..len(x)."""
    n = len(x)
    t = np.arange(1, n + 1)
    mu = (0.5 + np.cumsum(x)) / (t + 1)
    sig2 = (PRIOR + np.cumsum((x - mu) ** 2)) / (t + 1)
    sp = np.concatenate([[PRIOR], sig2[:-1]])
    lam = np.sqrt(2 * np.log(2 / delta) / (sp * t * np.log(t + 1)))
    lam = np.minimum(lam, 1.0)
    m = GRID[:, None]
    d = x[None, :] - m
    lp = np.minimum(lam[None, :], 0.5 / m)
    lm = np.minimum(lam[None, :], 0.5 / (1 - m))
    kp = np.cumprod(1 + lp * d, axis=1)
    km = np.cumprod(1 - lm * d, axis=1)
    cap = 0.5 * kp + 0.5 * km
    out = np.maximum.accumulate(cap >= 1 / delta, axis=1)   # once out, always out
    keep = ~out
    lo = np.full(n, np.nan); hi = np.full(n, np.nan)
    for k in range(n):
        g = GRID[keep[:, k]]
        if len(g):
            lo[k], hi[k] = g.min(), g.max()
    return lo, hi


def seqs(r, t, Et):
    """The three sequences as (lo, hi) arrays on the scale of E[R], indexed by number of real trials."""
    s = {"real": bounds(r, DELTA)}
    d = (r - t + 1) / 2                                     # D = R - T in [-1, 1] -> [0, 1]
    lo, hi = bounds(d, DELTA)
    s["cv1"] = (Et + 2 * lo - 1, Et + 2 * hi - 1)
    dt = t[:N0] - t[:N0].mean()
    lam = float(np.clip((dt * (r[:N0] - r[:N0].mean())).sum() / max((dt ** 2).sum(), 1e-12), 0, 1))
    z = (r[N0:] - lam * t[N0:] + lam * Et + lam) / (1 + lam)   # mean (E[R] + lam)/(1 + lam)
    lo, hi = bounds(z, DELTA)
    pad = np.full(N0, np.nan)
    s["cvlam"] = (np.concatenate([pad, lo * (1 + lam) - lam]), np.concatenate([pad, hi * (1 + lam) - lam]))
    return s


def run(args):
    name, reps, seed = args
    R, T = DATA[name], DATA["twin"]
    N = len(R)
    truth, Et = R.mean(), T.mean()
    rng = np.random.default_rng(seed)
    miss = {k: 0 for k in ("real", "cv1", "cvlam")}
    stop = {(k, g): [] for k in miss for g in GAPS}
    for _ in range(reps):
        i = rng.integers(0, N, NMAX)
        for k, (lo, hi) in seqs(R[i], T[i], Et).items():
            ok = ~np.isnan(lo)
            miss[k] += bool(np.any(ok & ((truth < lo - 1e-12) | (truth > hi + 1e-12))))
            for g in GAPS:
                b = truth - g
                hit = ok & (lo > b)
                stop[(k, g)].append(int(np.argmax(hit)) + 1 if hit.any() else NMAX + 1)   # NMAX + 1 = never
    row = {"pair": name, "rho": float(np.corrcoef(R, T)[0, 1])}
    for k in miss:
        row[k + "_miss"] = 100 * miss[k] / reps
        for g in GAPS:
            v = np.array(stop[(k, g)])
            row[f"{k}_med_{g}"] = float(np.median(v))
            row[f"{k}_never_{g}"] = 100 * float(np.mean(v > NMAX))
    return row


def init():
    global DATA
    DATA = load()


if __name__ == "__main__":
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
    init()
    names = [k for k in DATA if k != "twin"]
    with Pool(4, initializer=init) as p:
        rows = p.map(run, [(k, reps, SEED + j) for j, k in enumerate(names)], chunksize=1)
    os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
    with open(os.path.join(HERE, "results", "anytime.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, list(rows[0])); w.writeheader(); w.writerows(rows)
    S = []
    for k in ("real", "cv1", "cvlam"):
        S.append(f"H5-i {k}: max anytime miss = {max(r[k + '_miss'] for r in rows):.1f}% (limit 6.0), median {np.median([r[k + '_miss'] for r in rows]):.1f}%")
    hi = [r for r in rows if r["rho"] >= 0.8]; lo = [r for r in rows if r["rho"] < 0.5]
    for g in GAPS:
        S.append(f"g={g}: median stop real/cv1/cvlam over pairs = " + "/".join(f"{np.median([r[f'{k}_med_{g}'] for r in rows]):.0f}" for k in ("real", "cv1", "cvlam"))
                 + "; never-stop % mean = " + "/".join(f"{np.mean([r[f'{k}_never_{g}'] for r in rows]):.0f}" for k in ("real", "cv1", "cvlam")))
    S.append(f"H5-ii high-rho pairs (rho>=0.8, n={len(hi)}) cv1 faster than real at g=0.10: {sum(r['cv1_med_0.1'] < r['real_med_0.1'] for r in hi)}/{len(hi)}; "
             + ", ".join(f"{r['pair']} rho {r['rho']:.2f} {r['cv1_med_0.1']:.0f} vs {r['real_med_0.1']:.0f}" for r in hi))
    S.append(f"H5-ii low-rho pairs (rho<0.5, n={len(lo)}) worst cv1/real median ratio at g=0.10: {max(r['cv1_med_0.1'] / r['real_med_0.1'] for r in lo):.2f} (limit 1.20)")
    S.append(f"H5-iii cvlam faster than cv1 (median over pairs, g=0.10)? cvlam {np.median([r['cvlam_med_0.1'] for r in rows]):.0f} vs cv1 {np.median([r['cv1_med_0.1'] for r in rows]):.0f}")
    open(os.path.join(HERE, "results", "summary_5b.txt"), "w").write("\n".join(S) + "\n")
    print("\n".join(S))
