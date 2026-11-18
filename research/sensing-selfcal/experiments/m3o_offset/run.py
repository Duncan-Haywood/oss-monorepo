"""Milestone 3o: can one 1.2 s window estimate the gyro-camera time offset, alone and with the
readout, and does that remove the focal shift a late gyro causes?

Windows: milestone 3m's part T (milestone 3k's part B scenes and linear velocities, sigma = 0.3
rad/s, w(t) per axis a sum of three sinusoids at U(0.5, 3) Hz, 1/30 s readout held over each
keyframe, 0.5 px noise; 30 seeds). The gyro is now a 200 Hz signal, g(s) = w(s + delta) + white
noise 0.1 deg/s per axis per sample (milestone 3l's level), sampled from 0.1 s before the first
keyframe to 0.1 s after the last; the solver reads each keyframe's rate by linear interpolation at
t_i - delta_hat (tsba.TWindow). delta in {-10, 0, 5, 10, 20} ms. Models per delta:

  known    t_r = 1/30 s known, delta_hat fixed at 0   (milestone 3m's 'known')
  est      t_r free from 0,   delta_hat fixed at 0   (milestone 3m's 'est')
  known_d  t_r known,         delta_hat free from 0
  est_d    t_r free from 0,   delta_hat free from 0

plus 'clean' (global-shutter rendering, no shutter term) once per window. Scored: the paired shift
Delta = (f - f_ref) / f_true with f_ref the same model's solve at delta = 0 (for the _d models,
at delta = 0 with delta_hat free), and delta_hat - delta.

    OMP_NUM_THREADS=1 python3 run.py [n_workers] [limit]
Writes results.json. H189-H194 were written in ../../LOG.md before this script first ran in full.
"""
import json, os, sys, time
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..")
sys.path.insert(0, HERE)
import importlib.util  # noqa: E402
import tsba  # noqa: E402


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


m3m = _load("m3m_run", os.path.join(EXP, "m3m_gyrofault", "run.py"))
m3k, m3l = m3m.m3k, m3m.m3l

TR = m3k.TR
DELTAS = (-0.010, 0.0, 0.005, 0.010, 0.020)
FS = 200.0
PAD = 0.1
MODELS = {"known": (False, False), "est": (True, False), "known_d": (False, True), "est_d": (True, True)}


def gyro_samples(seed, delta):
    """200 Hz stamps and readings g(s) = w(s + delta) + noise (noise drawn per seed, same for every delta)."""
    s = np.arange(-PAD, m3k.T_WIN + PAD + 1e-9, 1 / FS)
    n = np.random.default_rng(70_000 + seed).normal(0, m3l.NOISE_DPS * m3l.DEG, (len(s), 3))
    return s, m3m.w_of_t(seed, s + delta) + n


def solve(d, seed, delta, est_tr, est_d, t_r=TR):
    vi, pi, uv, rv0, tv, X0 = d
    gs, gw = gyro_samples(seed, delta)
    win = tsba.TWindow(vi, pi, uv, m3k.NKF, len(X0), tv, gs, gw, m3m.kf_times(), t_r, m3k.H, est_tr, est_d)
    start = np.array([m3k.INTR[0] * 1.08, m3k.W / 2, m3k.H / 2, 0.0, 0.0])
    return win.solve(start, rv0, tv * 1.0, X0, 0.0 if est_tr else None)


def job(spec):
    t0 = time.time()
    seed = spec["seed"]
    tk = m3m.kf_times()
    wt = m3m.w_of_t(seed, tk)
    spec_t = dict(spec, w=wt.tolist())
    d_rs, d_gs = m3l.data(spec_t, TR), m3l.data(spec_t, 0.0)
    out = {"seed": seed, "w_rms": float(np.sqrt((wt ** 2).mean()))}
    # rms angular acceleration at the keyframes (central difference, 1 ms)
    acc = (m3m.w_of_t(seed, tk + 1e-3) - m3m.w_of_t(seed, tk - 1e-3)) / 2e-3
    out["a_rms"] = float(np.sqrt((acc ** 2).mean()))
    out["clean"] = solve(d_gs, seed, 0.0, False, False, t_r=0.0)
    for de in DELTAS:
        for m, (etr, ed) in MODELS.items():
            out[f"{m}@{1000 * de:g}"] = solve(d_rs, seed, de, etr, ed)
    out["seconds"] = time.time() - t0
    return out


def main():
    nw = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    jobs = m3m.ref_specs()
    if len(sys.argv) > 2:
        jobs = jobs[: int(sys.argv[2])]
    print(len(jobs), "jobs", flush=True)
    res = []
    with Pool(nw) as p:
        for i, r in enumerate(p.imap(job, jobs)):
            res.append(r)
            print(i, round(r["seconds"], 1), flush=True)
    meta = {"intr": m3k.INTR.tolist(), "t_r": TR, "sigma": m3m.SIGMA, "deltas_s": DELTAS, "gyro_hz": FS,
            "gyro_noise_dps": m3l.NOISE_DPS, "models": list(MODELS)}
    with open(os.path.join(HERE, "results.json"), "w") as fh:
        json.dump(dict(meta, jobs=res), fh, indent=1)
    print("EXIT", flush=True)


if __name__ == "__main__":
    main()
