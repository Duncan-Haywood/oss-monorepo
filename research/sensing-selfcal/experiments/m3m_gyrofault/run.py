"""Milestone 3m: does milestone 3l's gyro-aided rolling-shutter fix survive a gyro that is wrong in
the three ways real camera-IMU rigs are wrong?

Milestone 3l solved milestone 3k's hand-held windows (part B, sigma = 0.3 rad/s per axis, 1/30 s
readout, 0.5 px noise) with rsba.Window and the gyro's angular velocity taken as exact apart from
white noise and a constant bias. Its caveat: the estimator's model equals the generator's, so it
showed identifiability, not robustness to a wrong model. This script feeds the same estimator a
gyro that is

  R  rotated:  w_meas = R(theta about a random unit axis) w   (camera-IMU rotation off by theta;
               theta in {1, 3, 10} deg)
  S  scaled:   w_meas = s w                                   (gyro scale-factor error;
               s in {1.02, 1.05})
  T  late:     w_meas(t_k) = w(t_k + delta)                   (camera-IMU time offset;
               delta in {2, 5, 10, 20} ms)

each solved with the readout known (t_r = 1/30 s, 'known') and free from 0 ('est').

Parts R and S use milestone 3k's part B windows and milestone 3l's gyro noise draw unchanged, so
their reference solves (clean, none, known, est) are milestone 3l's and are re-solved here and
asserted equal to milestone 3l's results.json.

Part T needs an angular velocity that is a function of time, which milestone 3k's independent
per-keyframe draws are not. Its windows are milestone 3k's part B scenes and linear velocities with
w(t) per axis a sum of three sinusoids, frequencies U(0.5, 3) Hz, random phases, each amplitude
sigma * sqrt(2/3) so the process has sd sigma = 0.3 rad/s per axis, the same as part B. Each keyframe
is rendered with w(t_k) held over its readout (milestone 3k's generator; intra-frame variation of w
is not modelled), and the gyro reads w(t_k + delta) plus milestone 3l's noise. Part T solves its own
clean, none, known and est references.

The scored quantity is the paired shift Delta = (f_fault - f_ref) / f_true, where f_ref is the same
window, the same pixel noise and the same model with the exact gyro; that cancels the 0.3-1.4%
estimation noise milestone 3l's post hoc found, so the fault's own effect is what is measured.

    OMP_NUM_THREADS=1 python3 run.py [n_workers] [limit]
Writes results.json. H178-H183 were written in ../../LOG.md before this script first ran in full.
"""
import json, os, sys, time
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(EXP, "m3l_gyro"))
sys.path.insert(0, os.path.join(EXP, "m3k_shutter"))
import importlib.util  # noqa: E402
import rs  # noqa: E402


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


m3k = _load("m3k_run", os.path.join(EXP, "m3k_shutter", "run.py"))
m3l = _load("m3l_run", os.path.join(EXP, "m3l_gyro", "run.py"))

TR = m3k.TR
SIGMA = 0.3
THETAS = (1.0, 3.0, 10.0)          # deg
SCALES = (1.02, 1.05)
DELTAS = (0.002, 0.005, 0.010, 0.020)   # s
DT_KF = 3 / 30.0                   # keyframe spacing (milestone 3b: every 3rd frame at 30 Hz)
NSIN = 3


def rot(axis_angle):
    return rs.expm_so3(np.asarray(axis_angle, float)[None])[0]


def misalign(seed, theta_deg):
    """A fixed rotation of theta about a random unit axis (seeded per window, same axis for every theta)."""
    a = np.random.default_rng(50_000 + seed).normal(size=3)
    a /= np.linalg.norm(a)
    return rot(a * np.radians(theta_deg))


def sines(seed):
    """Per axis: NSIN (frequency Hz, phase rad); amplitude sigma * sqrt(2 / NSIN) each."""
    g = np.random.default_rng(60_000 + seed)
    return g.uniform(0.5, 3.0, (3, NSIN)), g.uniform(0, 2 * np.pi, (3, NSIN))


def w_of_t(seed, t):
    fr, ph = sines(seed)
    a = SIGMA * np.sqrt(2.0 / NSIN)
    t = np.atleast_1d(np.asarray(t, float))
    return a * np.sin(2 * np.pi * fr[None] * t[:, None, None] + ph[None]).sum(2)   # (len(t), 3)


def kf_times():
    return np.arange(m3k.NKF) * DT_KF


def gyro_noise(seed):
    """milestone 3l's white-noise draw, bias 0 (m3l.gyro with zero true rate)."""
    return m3l.gyro(np.zeros((m3k.NKF, 3)), seed, 0.0)


def ref_specs():
    return [s for s in m3k.specs() if s["part"] == "B" and s["sigma"] == SIGMA]


def job(spec):
    t0 = time.time()
    seed = spec["seed"]
    out = {"seed": seed}
    n = gyro_noise(seed)
    sv = lambda d, w, est: m3l.solve(d, w, TR, est_tr=est)   # noqa: E731

    # parts R and S: milestone 3k / 3l's part B window
    w = np.array(spec["w"])
    d_rs, d_gs = m3l.data(spec, TR), m3l.data(spec, 0.0)
    g0 = w + n
    out["clean"] = m3l.solve(d_gs, g0, 0.0)
    out["none"] = m3l.solve(d_rs, g0, 0.0)
    out["known"] = sv(d_rs, g0, False)
    out["est"] = sv(d_rs, g0, True)
    for th in THETAS:
        R = misalign(seed, th)
        gm = (w + n) @ R.T
        out[f"R{th:g}_known"] = sv(d_rs, gm, False)
        out[f"R{th:g}_est"] = sv(d_rs, gm, True)
    for s in SCALES:
        gm = s * (w + n)
        out[f"S{s:g}_known"] = sv(d_rs, gm, False)
        out[f"S{s:g}_est"] = sv(d_rs, gm, True)

    # part T: the same scene and linear velocities, w a smooth function of time
    tk = kf_times()
    wt = w_of_t(seed, tk)
    spec_t = dict(spec, w=wt.tolist())
    dt_rs, dt_gs = m3l.data(spec_t, TR), m3l.data(spec_t, 0.0)
    out["T_w_rms"] = float(np.sqrt((wt ** 2).mean()))
    out["T_clean"] = m3l.solve(dt_gs, wt + n, 0.0)
    out["T_none"] = m3l.solve(dt_rs, wt + n, 0.0)
    out["T_known"] = sv(dt_rs, wt + n, False)
    out["T_est"] = sv(dt_rs, wt + n, True)
    for de in DELTAS:
        gm = w_of_t(seed, tk + de) + n
        out[f"T{1000 * de:g}_rate_err"] = float(np.sqrt(((gm - n - wt) ** 2).mean()))
        out[f"T{1000 * de:g}_known"] = sv(dt_rs, gm, False)
        out[f"T{1000 * de:g}_est"] = sv(dt_rs, gm, True)
    out["seconds"] = time.time() - t0
    return out


def main():
    nw = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    jobs = ref_specs()
    if len(sys.argv) > 2:
        jobs = jobs[: int(sys.argv[2])]
    print(len(jobs), "jobs", flush=True)
    res = []
    with Pool(nw) as p:
        for i, r in enumerate(p.imap(job, jobs)):
            res.append(r)
            print(i, round(r["seconds"], 1), flush=True)
    meta = {"intr": m3k.INTR.tolist(), "t_r": TR, "sigma": SIGMA, "thetas_deg": THETAS, "scales": SCALES,
            "deltas_s": DELTAS, "n_sines": NSIN, "gyro_noise_dps": m3l.NOISE_DPS}
    with open(os.path.join(HERE, "results.json"), "w") as fh:
        json.dump(dict(meta, jobs=res), fh, indent=1)
    print("EXIT", flush=True)


if __name__ == "__main__":
    main()
