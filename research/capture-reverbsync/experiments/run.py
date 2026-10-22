"""capture-reverbsync: fixed gamma vs per-window PSR-chosen gamma in reverberant rooms. Writes results.txt."""
import os
import numpy as np
from capture_realaudio import available_clips
from capture_reverbsync import reverb_pair, estimate, adaptive_estimate, GAMMAS

OUT = os.path.join(os.path.dirname(__file__), "results.txt")
TRIALS = 20
FRAME = 1 / 30
ROOMS = [(0.0, 0.0), (0.3, 5.0), (0.3, 0.0), (0.3, -5.0), (0.6, 5.0), (0.6, 0.0), (0.6, -5.0),
         (1.0, 5.0), (1.0, 0.0), (1.0, -5.0)]
SNRS = (-5, 5)
lines = []


def emit(s=""):
    print(s)
    lines.append(s)


clips = available_clips()
emit(f"# {len(clips)} real clips: {' '.join(clips)}; {TRIALS} trials/clip/cell, 2 s window, delay U[0.2,0.8] s, white noise")
emit(f"# bad = error > one 30 fps frame; paired: every method sees the same noisy reverberant pair")
emit("rt60_s | drr_db | snr_db | " + " | ".join(f"g{g}" for g in GAMMAS) + " | adaptive_psr | oracle_any_gamma")
for rt60, drr in ROOMS:
    for snr in SNRS:
        bad = np.zeros(len(GAMMAS) + 2)
        n = 0
        for ci, (name, clip) in enumerate(clips.items()):
            rng = np.random.default_rng(1000 + ci * 31 + int(snr + 20) + int(rt60 * 100) + int(drr + 10) * 7)
            for _ in range(TRIALS):
                tau = rng.uniform(0.2, 0.8)
                a, b = reverb_pair(clip, rng, tau, 2.0, snr, rt60, drr)
                ok = [abs(estimate(a, b, g, 2.0) - tau) <= FRAME for g in GAMMAS]
                d, _g = adaptive_estimate(a, b, 2.0)
                bad[:len(GAMMAS)] += [not o for o in ok]
                bad[-2] += abs(d - tau) > FRAME
                bad[-1] += all(not o for o in ok)
                n += 1
        emit(f"{rt60} | {drr} | {snr} | " + " | ".join(f"{x / n:.2f}" for x in bad))
open(OUT, "w").write("\n".join(lines) + "\n")
