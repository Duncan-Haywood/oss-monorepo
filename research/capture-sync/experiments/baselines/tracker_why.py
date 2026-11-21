"""Step 4d post hoc (written after the score): why does the 20 s coarse step fail more often at a larger SRO?

    python experiments/baselines/tracker_why.py <MS-SNSD root> [--procs 4]

Guess: over a 20 s window a drift of eps moves the delay by eps x 20 s (2 ms at 100 ppm, 6 ms at 300 ppm), many
times the 0.25 ms width of a 4 kHz-band correlation peak, so the peak smears and its height falls as if the SNR
had dropped. Test: replay the collect run's sessions (same seeds, so the same speech, rooms, start offsets and
noise draws) with device 1's drift switched off (eps 0 in the resampler, truth line flat), and score the coarse
steps (paderwasn's plain correlation and envelope-normalised GCC) as tracker.py does; also both on the first
5 s only (less smear, less audio).
"""
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tracker as T  # noqa: E402

NT, W, gcc, EN = T.NT, T.W, T.gcc, T.envelope_normalise


def one(args):
    root, rt, eps_abs, sess, rep, seed, drift = args
    rng = np.random.default_rng(seed)
    blocks, nz = NT.speech_blocks(root), NT.noises(root)
    sim = W.sim_sro
    if not drift:
        W.sim_sro = lambda x, e: sim(x, 0.0)
    try:
        d0c, d1c, A, B, eps = T.session(blocks[sess], rt, eps_abs, rng)
    finally:
        W.sim_sro = sim
    eps_eff = eps if drift else 0.0
    out = []
    for ti, snr in T.CONDS:
        x0 = T.add_noise(d0c, ti, snr, nz, 0, rng)
        x1 = T.add_noise(d1c, ti, snr, nz, 1, rng)
        if ti < 0:
            continue
        e0, e1 = EN(x0), EN(x1)
        r = []
        for sec in (20.0, 5.0):
            n = int(sec * T.FS)
            tr = T.truth(sec / 2, A, B, eps_eff)
            off = W.coarse_sync_offset(x1, x0, n)
            d, _ = gcc(e0[:n], e1[:n], gamma=0.25, max_lag_s=min(15.0, sec - 0.5), centre_s=0.0)
            r += [abs(off / T.FS - tr) > T.FRAME, abs(d - tr) > T.FRAME]
        out.append(r)
    return out


def main(root, procs):
    js = []
    for job in T.jobs(root, 2):
        if job[1] == 0.2 and job[2] in (17.0, 300.0):
            js += [job + (True,), job + (False,)]
    res = {}
    with ProcessPoolExecutor(procs) as ex:
        for job, r in zip(js, ex.map(one, js)):
            res.setdefault((job[2], job[6]), []).extend(r)
    lines = ["Step 4d post hoc: coarse-step failure share (> 1 frame) over -10 dB sessions, 200 ms room",
             f"{'SRO':>8s} {'drift':>6s} {'pw 20 s':>8s} {'fn 20 s':>8s} {'pw 5 s':>8s} {'fn 5 s':>8s}"]
    for (eps, drift), r in sorted(res.items()):
        m = 100 * np.mean(np.array(r, float), axis=0)
        lines.append(f"{eps:8g} {('on' if drift else 'off'):>6s}" + "".join(f"{v:7.1f}%" for v in m) + f"  (n={len(r)})")
    txt = "\n".join(lines)
    print(txt)
    open(os.path.join(HERE, "tracker_why.txt"), "w").write(txt + "\n")


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else 4)
